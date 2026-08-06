import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineMdastPlugin } from "satteri";

const CACHE_PATH = fileURLToPath(new URL("../data/link-cards.json", import.meta.url));

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// 本文直下（root直下）にリンク1つだけで構成された段落＝独立した参照リンクだけをカード化対象にする。
// 文中のインラインリンク・箇条書き（参考リンク一覧）・脚注はrootの子ではないので自然に対象外。
export function findCardUrl(node, ctx) {
  if (node.children?.length !== 1) return null;
  const child = node.children[0];
  if (child.type !== "link" || !isHttpUrl(child.url)) return null;
  if (ctx.parent(node)?.type !== "root") return null;
  return child.url;
}

export function renderCardHtml(url, cache) {
  const meta = cache[url];
  const domain = domainOf(url);
  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
  const title = meta?.title || domain;
  const description = meta?.description || "";
  const image = meta?.image && isHttpUrl(meta.image) ? meta.image : null;

  // rawHtmlのルート要素がphrasing content（<a>等）だとsatteriがブロック位置で<p>に包んでしまうため、
  // ブロック要素の<div>をルートにして<a>をその中に置く。
  return `<div class="not-prose my-6"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow" class="card sm:card-side bg-base-200 hover:shadow-lg transition-shadow overflow-hidden no-underline">${
    image
      ? `<figure class="sm:w-40 shrink-0 bg-base-300"><img src="${escapeHtml(image)}" alt="" class="w-full h-full object-cover" loading="lazy" /></figure>`
      : ""
  }<div class="card-body p-4 gap-1"><p class="card-title text-base m-0">${escapeHtml(title)}</p>${
    description
      ? `<p class="text-sm text-base-content/70 line-clamp-2 m-0">${escapeHtml(description)}</p>`
      : ""
  }<p class="text-xs text-base-content/50 flex items-center gap-1 m-0 mt-1"><img src="${escapeHtml(favicon)}" alt="" width="14" height="14" class="inline-block rounded-sm" />${escapeHtml(domain)}</p></div></a></div>`;
}

export const linkCardPlugin = defineMdastPlugin({
  name: "link-card",
  paragraph(node, ctx) {
    const url = findCardUrl(node, ctx);
    if (!url) return;
    const cache = loadCache();
    ctx.replaceNode(node, { rawHtml: renderCardHtml(url, cache) });
  },
});
