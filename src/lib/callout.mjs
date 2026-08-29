import { defineMdastPlugin } from "satteri";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Material Icons（filled, 24x24）の"description"・"warning"・"info"パス。
const DIRECTIVES = {
  note: {
    hName: "div",
    className: ["callout", "callout-note"],
    iconClass: "callout-icon",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
  },
  warning: {
    hName: "div",
    className: ["callout", "callout-warning"],
    iconClass: "callout-icon",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  },
  column: {
    hName: "aside",
    className: ["column"],
    iconClass: "column-icon",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  },
  // 初心者マーク（若葉マーク）。ICOOON MONO（https://icooon-mono.com/11249-初心者マークのアイコン素材/、author: Da-Yama）
  // のSVGから、埋め込みfillスタイルを除去してcurrentColor継承に合わせたもの。商用利用可・クレジット表記不要。
  newbie: {
    hName: "aside",
    className: ["column", "newbie"],
    iconClass: "column-icon",
    icon: '<svg viewBox="0 0 512 512" aria-hidden="true"><path d="M256,120.07L145.016,12.742C131.953,0.102,112.594-3.492,95.844,3.586c-16.734,7.109-27.609,23.531-27.609,41.719v274c0,18.406,7.469,36.031,20.703,48.844L224.5,499.258c17.563,16.984,45.438,16.984,62.984,0l135.578-131.109c13.234-12.813,20.703-30.438,20.703-48.844v-274c0-18.188-10.875-34.609-27.609-41.719c-16.75-7.078-36.109-3.484-49.172,9.156L256,120.07z M379.844,311.414c0,6.141-2.484,12.016-6.906,16.281L256,440.805V209.008l22.219-21.5l82.438-79.719c3.25-3.156,8.109-4.063,12.281-2.281c4.188,1.766,6.906,5.875,6.906,10.422V311.414z"/></svg>',
  },
};

// :::gallery直下は「画像1枚だけの段落」を1つずつ想定している。この関数はその段落を
// <figure><img/><figcaption>に変換したHTML文字列を返す。想定外の形（画像0枚・複数枚，
// 画像以外のテキストが同居 等）ならnullを返し，呼び出し側でwarningを出して素通しさせる。
function galleryFigureHtml(paragraphNode) {
  const children = paragraphNode.children ?? [];
  const images = children.filter((c) => c.type === "image");
  const others = children.filter(
    (c) => c.type !== "image" && !(c.type === "text" && c.value.trim() === ""),
  );
  if (images.length !== 1 || others.length > 0) return null;

  const image = images[0];
  // :::gallery内に限り，画像のtitle（`![alt](url "title")`のtitle部分）をfigcaptionの
  // キャプション文言として転用する仕様。通常のimg titleのようなツールチップ用途ではない。
  const figcaption = image.title ? `<figcaption>${escapeHtml(image.title)}</figcaption>` : "";
  return `<figure><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt ?? "")}" />${figcaption}</figure>`;
}

export const calloutPlugin = defineMdastPlugin({
  name: "callout",
  containerDirective(node, ctx) {
    if (node.name === "gallery") {
      // :::gallery{columns=N} で1行あたりの列数を固定できる（例: columns=1で縦積み）。
      // 未指定時はauto-fit（入る分だけ横に並べ，収まらなければ折り返す）のデフォルト挙動。
      const columnsAttr = node.attributes?.columns;
      let columns = null;
      if (columnsAttr != null) {
        const parsed = Number(columnsAttr);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 6) {
          columns = parsed;
        } else {
          ctx.report({
            message: `:::galleryのcolumns属性「${columnsAttr}」が不正です（1〜6の整数を指定してください）。デフォルトのレイアウトで出力します。`,
            node,
            severity: "warning",
          });
        }
      }

      ctx.setProperty(node, "data", {
        hName: "div",
        hProperties: {
          className: ["gallery"],
          ...(columns ? { style: `grid-template-columns: repeat(${columns}, 1fr);` } : {}),
        },
      });
      for (const child of node.children) {
        if (child.type !== "paragraph") {
          ctx.report({
            message: ":::gallery直下は画像1枚だけの段落を想定していますが，段落以外の要素があります。そのまま出力します。",
            node: child,
            severity: "warning",
          });
          continue;
        }
        const html = galleryFigureHtml(child);
        if (html === null) {
          ctx.report({
            message: ":::gallery直下の段落は画像1枚だけを想定していますが，一致しない内容です。そのまま出力します。",
            node: child,
            severity: "warning",
          });
          continue;
        }
        ctx.replaceNode(child, { type: "html", value: html });
      }
      return;
    }

    const config = DIRECTIVES[node.name];
    if (!config) {
      ctx.report({
        message: `未対応のcalloutタイプ「${node.name}」です（対応: ${Object.keys(DIRECTIVES).join(", ")}）。プレーンなdivとして出力します。`,
        node,
        severity: "warning",
      });
      ctx.setProperty(node, "data", { hName: "div" });
      return;
    }

    ctx.setProperty(node, "data", {
      hName: config.hName,
      hProperties: {
        className: config.className,
      },
    });
    ctx.prependChild(node, {
      type: "html",
      value: `<span class="${config.iconClass}">${config.icon}</span>`,
    });
  },
});
