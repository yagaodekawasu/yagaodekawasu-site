import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineMdastPlugin } from "satteri";
import { fetchMeta, SITE_ORIGIN } from "./ogp-fetch.mjs";

const DEFAULT_CACHE_PATH = fileURLToPath(new URL("../data/link-cards.json", import.meta.url));

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

// 自サイト（SITE_ORIGIN）へのカードは同タブ遷移のままにしたいので，
// target/rel属性はオリジンが自サイトと異なる場合だけ付与する。
function isExternalUrl(url) {
  try {
    return new URL(url).origin !== SITE_ORIGIN;
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

// 本文直下（root直下）、または:::column/:::newbieブロック直下にリンク1つだけで構成された
// 段落＝独立した参照リンクだけをカード化対象にする。文中のインラインリンク・箇条書き（参考
// リンク一覧）・脚注や、:::note/:::warningのような短い注記用ディレクティブの中はrootでも
// column系コンテナでもないので自然に対象外。
const CARD_ELIGIBLE_DIRECTIVES = new Set(["column", "newbie"]);

function isCardEligibleParent(parent) {
  return (
    parent?.type === "root" ||
    (parent?.type === "containerDirective" && CARD_ELIGIBLE_DIRECTIVES.has(parent.name))
  );
}

function findCardLink(node, ctx) {
  if (node.children?.length !== 1) return null;
  const child = node.children[0];
  if (child.type !== "link" || !isHttpUrl(child.url)) return null;
  if (!isCardEligibleParent(ctx.parent(node))) return null;
  return child;
}

export function findCardUrl(node, ctx) {
  return findCardLink(node, ctx)?.url ?? null;
}

// リンクノードの表示テキストを再帰的に平文化する。og:titleが取得できなかった場合の
// フォールバック（renderCardHtmlのfallbackText）に使う。
// 表示テキストがURL自体と同じ（＝著者が意味のある表示テキストを与えていないベタ書き
// リンク）場合はtitleとして採用する価値が無いため，空文字を返してドメイン名への
// フォールバックに委ねる。
function linkNodeText(linkNode) {
  const parts = [];
  const walk = (n) => {
    if (n.type === "text") parts.push(n.value);
    else n.children?.forEach(walk);
  };
  linkNode.children.forEach(walk);
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return text !== linkNode.url ? text : "";
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

function lineCardLink(lineNodes) {
  const meaningful = lineNodes.filter((n) => !(n.type === "text" && n.value.trim() === ""));
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  if (only.type !== "link" || !isHttpUrl(only.url)) return null;
  return only;
}

function lineCardUrl(lineNodes) {
  return lineCardLink(lineNodes)?.url ?? null;
}

// 段落全体がリンク単体のケース（findCardUrl）に加え、他のテキストと同じ段落内でも
// 改行だけで区切られた1行がリンク単体ならカード化対象に含める。この関数はOGP事前取得
// （fetch-link-cards.mjs）とライブ描画（linkCardPlugin）の両方から共有で呼ばれる。
export function findParagraphCardUrls(node, ctx) {
  if (!isCardEligibleParent(ctx.parent(node))) return [];
  const whole = findCardUrl(node, ctx);
  if (whole) return [whole];
  if (!node.children.some((c) => c.type === "text" && c.value.includes("\n"))) return [];
  const lines = splitParagraphLines(node.children);
  if (lines.length < 2) return [];
  return lines.map(lineCardUrl).filter((url) => url != null);
}

export function renderCardHtml(url, cache, fallbackText = "") {
  const meta = cache[url];
  const domain = domainOf(url);
  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
  const title = meta?.title || fallbackText || domain;
  const description = meta?.description || "";
  const image = meta?.image && isHttpUrl(meta.image) ? meta.image : null;
  const linkAttrs = isExternalUrl(url) ? ` target="_blank"` : "";

  // 外側のdivはprose用CSSの打ち消し・余白調整のためのスタイリング目的（{ type: "html" }で挿入するため、
  // ルート要素がphrasing content(<a>等)であること自体はもう問題にならない）。
  return `<div class="not-prose my-1"><a href="${escapeHtml(url)}"${linkAttrs} class="card sm:card-side bg-base-200 hover:shadow-lg transition-shadow overflow-hidden no-underline">${
    image
      ? `<figure class="sm:w-40 shrink-0 bg-base-300"><img src="${escapeHtml(image)}" alt="" class="w-full h-full object-cover" loading="lazy" /></figure>`
      : ""
  }<div class="card-body p-4 gap-1"><p class="card-title text-base m-0">${escapeHtml(title)}</p>${
    description
      ? `<p class="text-sm text-base-content/70 line-clamp-2 max-h-10 m-0">${escapeHtml(description)}</p>`
      : ""
  }<p class="text-xs text-base-content/50 flex items-center gap-1 m-0 mt-1"><img src="${escapeHtml(favicon)}" alt="" width="14" height="14" class="inline-block rounded-sm" />${escapeHtml(domain)}</p></div></a></div>`;
}

// キャッシュファイルのパスを引数化しているのはテスト用の特別対応ではなく，通常の依存性注入。
// astro.config.mjsは引数無しでlinkCardPlugin（下記の単一インスタンス）をimportするだけでよい。
export function createLinkCardPlugin({ cachePath = DEFAULT_CACHE_PATH } = {}) {
  // ビルド中はディスクを読み直さず，このインメモリのcacheを唯一の正とする。
  // astro buildもastro devも単一Nodeプロセス・単一スレッド内で動く（worker_threads未使用）ため，
  // 複数のmdastPlugin visitorが並行実行されても，このオブジェクトへの読み書きに競合は生じない。
  let cache = null;

  function getCache() {
    if (cache === null) {
      try {
        cache = JSON.parse(readFileSync(cachePath, "utf-8"));
      } catch {
        cache = {};
      }
    }
    return cache;
  }

  function flushCache() {
    writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n");
  }

  // 同じURLへの重複fetchを防ぐため，取得中のPromiseを共有する。get→setの間にawaitを挟まないので，
  // 複数visitorが同時にこのURLの取得開始判定に来ても競合しない。
  const pendingFetches = new Map();

  async function ensureCardMeta(url) {
    const cache = getCache();
    if (cache[url]) return;

    let promise = pendingFetches.get(url);
    if (!promise) {
      promise = fetchMeta(url)
        .then((meta) => {
          cache[url] = meta;
          flushCache();
        })
        .catch((err) => {
          console.warn(`[link-card] fetch failed, rendering fallback: ${url} — ${err.message}`);
        })
        .finally(() => pendingFetches.delete(url));
      pendingFetches.set(url, promise);
    }
    await promise;
  }

  return defineMdastPlugin({
    name: "link-card",
    async paragraph(node, ctx) {
      const link = findCardLink(node, ctx);
      if (link) {
        await ensureCardMeta(link.url);
        ctx.replaceNode(node, {
          type: "html",
          value: renderCardHtml(link.url, getCache(), linkNodeText(link)),
        });
        return;
      }

      if (!isCardEligibleParent(ctx.parent(node))) return;
      if (!node.children.some((c) => c.type === "text" && c.value.includes("\n"))) return;
      const lines = splitParagraphLines(node.children);
      if (lines.length < 2) return;
      const links = lines.map(lineCardLink);
      if (!links.some((l) => l != null)) return;

      for (const l of links) {
        if (l) await ensureCardMeta(l.url);
      }
      const cache = getCache();
      const replacements = [];
      for (let i = 0; i < lines.length; i++) {
        if (links[i]) {
          replacements.push({
            type: "html",
            value: renderCardHtml(links[i].url, cache, linkNodeText(links[i])),
          });
        } else if (lineHasContent(lines[i])) {
          replacements.push({ type: "paragraph", children: lines[i] });
        }
      }
      if (replacements.length === 0) return;
      ctx.insertBefore(node, replacements);
      ctx.removeNode(node);
    },
  });
}

export const linkCardPlugin = createLinkCardPlugin();
