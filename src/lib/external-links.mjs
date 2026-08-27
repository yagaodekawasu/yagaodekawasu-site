import { defineHastPlugin } from "satteri";
import { SITE_ORIGIN } from "./ogp-fetch.mjs";

// 自サイト（SITE_ORIGIN）へのリンクは同タブ遷移のままにしたいので，
// 絶対URLかどうかに加えて，オリジンが自サイトと異なることも条件に含める。
function isExternalHttpUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return parsed.origin !== SITE_ORIGIN;
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
      if (typeof href !== "string" || !isExternalHttpUrl(href)) return;
      ctx.setProperty(node, "target", "_blank");
      ctx.setProperty(node, "rel", "noopener noreferrer");
    },
  },
});
