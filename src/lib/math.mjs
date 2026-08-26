import { defineMdastPlugin } from "satteri";
import katex from "katex";

export const mathPlugin = defineMdastPlugin({
  name: "math",
  math(node, ctx) {
    ctx.replaceNode(node, {
      type: "html",
      value: katex.renderToString(node.value, { displayMode: true, throwOnError: false }),
    });
  },
  inlineMath(node, ctx) {
    ctx.replaceNode(node, {
      type: "html",
      value: katex.renderToString(node.value, { displayMode: false, throwOnError: false }),
    });
  },
});
