import { defineMdastPlugin } from "satteri";

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

export const calloutPlugin = defineMdastPlugin({
  name: "callout",
  containerDirective(node, ctx) {
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
