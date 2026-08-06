import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { markdownToHtml, defineMdastPlugin } from "satteri";
import { findCardUrl } from "../src/lib/link-cards.mjs";

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
      const url = findCardUrl(node, ctx);
      if (url) urls.add(url);
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

async function fetchMeta(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; yagaodekawasu-link-card-fetcher/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return extractMeta(html, url);
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
