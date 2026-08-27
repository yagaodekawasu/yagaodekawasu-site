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
