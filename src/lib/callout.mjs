import { defineMdastPlugin } from "satteri";

// Material Icons（filled, 24x24）の"description"・"warning"パス。
const ICONS = {
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
  warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
};

export const calloutPlugin = defineMdastPlugin({
  name: "callout",
  containerDirective(node, ctx) {
    const icon = ICONS[node.name];
    if (!icon) {
      ctx.report({
        message: `未対応のcalloutタイプ「${node.name}」です（対応: ${Object.keys(ICONS).join(", ")}）。プレーンなdivとして出力します。`,
        node,
        severity: "warning",
      });
      ctx.setProperty(node, "data", { hName: "div" });
      return;
    }

    ctx.setProperty(node, "data", {
      hName: "div",
      hProperties: {
        className: ["callout", `callout-${node.name}`],
      },
    });
    ctx.prependChild(node, {
      type: "html",
      value: `<span class="callout-icon">${icon}</span>`,
    });
  },
});
