import satteriExternalLinks from "satteri-external-links";

// 自サイトへのリンクはルート相対パス（/blog/xxx/）で書く規約にしているので，
// 「絶対URL（http/https）かどうか」がそのまま「外部かどうか」になる。この判定は
// プラグイン組み込みのもので足りるため，testオプションによる絞り込みは不要。
// ページ内アンカー（#user-content-fn-1等）・相対パス・mailto:はいずれも対象外になる。
export const externalLinkPlugin = satteriExternalLinks({
  target: "_blank",
  // relは付けない。現在のブラウザは`target="_blank"`に対して暗黙的に`Window.opener`を
  // nullにするため，リンクカード側（link-cards.mjs）でも付けていない。ここだけ付けると
  // 同じ外部リンクで属性が食い違う。空配列を渡すとrel属性自体が出力されない
  // （既定値は['nofollow']なので省略はできない）。
  rel: [],
});
