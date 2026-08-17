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

// satteriは改行（ソフトブレイク）を独立したbreakノードではなく、隣接するtextノードの
// 先頭に"\n"を埋め込む形で表現する。そのためtextノードのvalueを"\n"で分割することで、
// 1つの段落を「改行区切りの行」単位に分解できる。
function splitParagraphLines(children) {
  const lines = [[]];
  for (const child of children) {
    if (child.type === "text" && child.value.includes("\n")) {
      const parts = child.value.split("\n");
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part !== "") lines[lines.length - 1].push({ ...child, value: part });
      });
    } else {
      lines[lines.length - 1].push(child);
    }
  }
  return lines;
}

function lineHasContent(lineNodes) {
  return lineNodes.some((n) => !(n.type === "text" && n.value.trim() === ""));
}

function lineCardUrl(lineNodes) {
  const meaningful = lineNodes.filter((n) => !(n.type === "text" && n.value.trim() === ""));
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  if (only.type !== "link" || !isHttpUrl(only.url)) return null;
  return only.url;
}

// 段落全体がリンク単体のケース（findCardUrl）に加え、他のテキストと同じ段落内でも
// 改行だけで区切られた1行がリンク単体ならカード化対象に含める。この関数はOGP事前取得
// （fetch-link-cards.mjs）とライブ描画（linkCardPlugin）の両方から共有で呼ばれる。
export function findParagraphCardUrls(node, ctx) {
  if (ctx.parent(node)?.type !== "root") return [];
  const whole = findCardUrl(node, ctx);
  if (whole) return [whole];
  if (!node.children.some((c) => c.type === "text" && c.value.includes("\n"))) return [];
  const lines = splitParagraphLines(node.children);
  if (lines.length < 2) return [];
  return lines.map(lineCardUrl).filter((url) => url != null);
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
    if (url) {
      const cache = loadCache();
      ctx.replaceNode(node, { rawHtml: renderCardHtml(url, cache) });
      return;
    }

    if (ctx.parent(node)?.type !== "root") return;
    if (!node.children.some((c) => c.type === "text" && c.value.includes("\n"))) return;
    const lines = splitParagraphLines(node.children);
    if (lines.length < 2) return;
    const urls = lines.map(lineCardUrl);
    if (!urls.some((u) => u != null)) return;

    const cache = loadCache();
    const replacements = [];
    for (let i = 0; i < lines.length; i++) {
      if (urls[i]) {
        replacements.push({ rawHtml: renderCardHtml(urls[i], cache) });
      } else if (lineHasContent(lines[i])) {
        replacements.push({ type: "paragraph", children: lines[i] });
      }
    }
    if (replacements.length === 0) return;
    ctx.insertBefore(node, replacements);
    ctx.removeNode(node);
  },
});
