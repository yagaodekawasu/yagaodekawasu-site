import { defineHastPlugin } from "satteri";

export const footnoteLabelPlugin = defineHastPlugin({
  name: "footnote-label",
  element: {
    filter: ["h2"],
    visit(node, ctx) {
      if (node.properties?.id !== "footnote-label") return;
      return {
        type: "element",
        tagName: "h2",
        properties: node.properties,
        children: [{ type: "text", value: "注釈" }],
      };
    },
  },
});
