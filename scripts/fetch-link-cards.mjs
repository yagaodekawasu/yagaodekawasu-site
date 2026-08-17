import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { markdownToHtml, defineMdastPlugin } from "satteri";
import { findParagraphCardUrls } from "../src/lib/link-cards.mjs";

const BLOG_DIR = fileURLToPath(new URL("../src/content/blog", import.meta.url));
const CACHE_PATH = fileURLToPath(new URL("../src/data/link-cards.json", import.meta.url));
const FORCE = process.argv.includes("--force");

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function collectUrls(markdown) {
  const urls = new Set();
  const collector = defineMdastPlugin({
    name: "link-card-collector",
    paragraph(node, ctx) {
      for (const url of findParagraphCardUrls(node, ctx)) urls.add(url);
    },
  });
  markdownToHtml(markdown, { mdastPlugins: [collector] });
  return urls;
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function extractMeta(html, url) {
  const getMeta = (prop) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`,
      "i",
    );
    const match = html.match(re) || html.match(new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`,
      "i",
    ));
    return match ? decodeEntities(match[1]) : null;
  };

  const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  let image = getMeta("og:image");
  if (image) {
    try {
      image = new URL(image, url).href;
    } catch {
      image = null;
    }
  }

  return {
    title: getMeta("og:title") || (titleTagMatch ? decodeEntities(titleTagMatch[1].trim()) : null),
    description: getMeta("og:description") || getMeta("description"),
    image,
  };
}

function detectCharset(buffer, contentType) {
  const headerMatch = /charset=([^;]+)/i.exec(contentType || "");
  if (headerMatch) return headerMatch[1].trim().toLowerCase();

  const ascii = Buffer.from(buffer.slice(0, 2048)).toString("latin1");
  const metaMatch =
    /<meta[^>]+charset=["']?([^"'\s/>]+)/i.exec(ascii) ||
    /<meta[^>]+content=["'][^"']*charset=([^"'\s;]+)/i.exec(ascii);
  if (metaMatch) return metaMatch[1].trim().toLowerCase();

  return "utf-8";
}

// Cross-Origin-Resource-Policyがsame-origin/same-siteだと，このブログ（別オリジン・別サイト）の
// <img>からは画像を読み込めずブラウザ上で壊れて見える。curlや素のfetch()はこの制限を評価しない
// ためHTTP 200で取得できてしまい，事前フェッチ時には気づけない。og:imageのURL自体に軽くリクエストを
// 送りヘッダーを見ることで，埋め込み不可な画像を採用時点で弾く。
async function isImageEmbeddable(imageUrl) {
  try {
    let res = await fetch(imageUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; yagaodekawasu-link-card-fetcher/1.0)" },
    });
    if (!res.ok && res.status !== 405) return true;
    if (res.status === 405) {
      res = await fetch(imageUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; yagaodekawasu-link-card-fetcher/1.0)" },
      });
    }
    const corp = (res.headers.get("cross-origin-resource-policy") || "").toLowerCase();
    return corp !== "same-origin" && corp !== "same-site";
  } catch {
    return true;
  }
}

async function fetchMeta(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; yagaodekawasu-link-card-fetcher/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const charset = detectCharset(buffer, res.headers.get("content-type"));
  let html;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    html = new TextDecoder("utf-8").decode(buffer);
  }
  const meta = extractMeta(html, url);
  if (meta.image && !(await isImageEmbeddable(meta.image))) {
    console.warn(`  image blocked by CORP, dropping: ${meta.image}`);
    meta.image = null;
  }
  return meta;
}

async function main() {
  const cache = loadCache();
  const urls = new Set();

  for (const file of readdirSync(BLOG_DIR)) {
    if (!file.endsWith(".md")) continue;
    const markdown = readFileSync(`${BLOG_DIR}/${file}`, "utf-8");
    for (const url of collectUrls(markdown)) urls.add(url);
  }

  let updated = 0;
  for (const url of urls) {
    if (cache[url] && !FORCE) continue;
    try {
      console.log(`fetching: ${url}`);
      cache[url] = await fetchMeta(url);
      updated++;
    } catch (err) {
      console.warn(`skip (fetch failed): ${url} — ${err.message}`);
    }
  }

  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  writeFileSync(CACHE_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`done. ${updated} URL(s) fetched/updated, ${urls.size} total candidate URL(s).`);
}

main();
