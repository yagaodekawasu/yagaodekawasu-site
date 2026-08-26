import { defineMdastPlugin } from "satteri";

export const imageCaptionPlugin = defineMdastPlugin({
  name: "image-caption",
  // 画像1枚だけで構成された段落（`![alt](src)`が単独行）を対象に，
  // <p>自体を<figure>に置き換える。文中に埋め込まれた画像は対象外。
  paragraph(node, ctx) {
    if (node.children.length !== 1 || node.children[0].type !== "image") return;

    const caption = node.children[0].alt;
    if (!caption) return;

    ctx.setProperty(node, "data", { hName: "figure" });
    ctx.appendChild(node, {
      type: "paragraph",
      data: { hName: "figcaption" },
      children: [{ type: "text", value: caption }],
    });
  },
});
