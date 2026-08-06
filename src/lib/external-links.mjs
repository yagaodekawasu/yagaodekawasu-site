import { defineHastPlugin } from "satteri";

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const externalLinkPlugin = defineHastPlugin({
  name: "external-link",
  element: {
    filter: ["a"],
    visit(node, ctx) {
      const href = node.properties?.href;
      if (typeof href !== "string" || !isHttpUrl(href)) return;
      ctx.setProperty(node, "target", "_blank");
      ctx.setProperty(node, "rel", "noopener noreferrer");
    },
  },
});
