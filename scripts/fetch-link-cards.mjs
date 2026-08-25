import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { markdownToHtml, defineMdastPlugin } from "satteri";
import { findParagraphCardUrls } from "../src/lib/link-cards.mjs";
import { fetchMeta } from "../src/lib/ogp-fetch.mjs";

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
