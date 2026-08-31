import { defineMdastPlugin, markdownToMdast } from "satteri";
import { GLOSSARY } from "../data/glossary.mjs";

const DIRECTIVE_NAME = "gloss";

// 用語IDからpopoverのid属性を作る。同じ用語がその記事に何度出てきても同じidになるので，
// 用語ごとにpopoverは1つで済む（Popover APIは，同じpopoverを複数のボタンから開いた場合
// でも，実際に押されたボタンの位置にアンカーし直してくれる）。
function popoverId(term) {
  return `gloss-${term}`;
}

// 用語辞書のプラグイン。本文中の `:gloss[表示テキスト]{term=用語ID}` を，解説popoverを
// 開くボタンに変換し，使われた用語の解説本体を記事末尾にまとめて出力する。
//
// factory形式（関数）で登録しているのは，`used`をドキュメントごとにリセットするため。
// Sätteriはこの関数を1コンパイル（＝記事1本）につき1回呼ぶので，別の記事で使った用語が
// 持ち越されることはない。
export const glossaryPlugin = () => {
  const used = new Set();

  return defineMdastPlugin({
    name: "glossary",

    textDirective(node, ctx) {
      if (node.name !== DIRECTIVE_NAME) return;

      // 辞書のキーは小文字で統一しているが，本文では表示テキストに合わせて
      // `{term=OGP}` のように書きたくなるので，照合前に正規化して吸収する。
      const rawTerm = node.attributes?.term;
      const term = rawTerm ? rawTerm.trim().toLowerCase() : undefined;
      const entry = term ? GLOSSARY[term] : undefined;

      if (!entry) {
        ctx.report({
          message: `:gloss の用語「${rawTerm ?? "(term属性が未指定)"}」は辞書（src/data/glossary.mjs）に登録されていません。解説なしのテキストとして出力します。`,
          node,
          severity: "warning",
        });
        // hNameを指定しないと表示テキストごと出力から消えてしまうため，
        // 素のspanとして中身だけ残す。
        ctx.setProperty(node, "data", { hName: "span" });
        return;
      }

      used.add(term);

      ctx.setProperty(node, "data", {
        hName: "button",
        hProperties: {
          type: "button",
          popovertarget: popoverId(term),
          className: ["gloss-term"],
        },
      });

      // 表示テキストと「?」アイコンを別々のspanに包む。下線は表示テキスト側にだけ
      // 引きたいので（アイコンまで下線が伸びると窮屈に見える），ボタン直下ではなく
      // 内側のspanにクラスを振っている。
      const label =
        node.children.length > 0
          ? node.children
          : [{ type: "text", value: entry.label }];

      ctx.setProperty(node, "children", [
        {
          type: "glossLabel",
          data: { hName: "span", hProperties: { className: ["gloss-label"] } },
          children: label,
        },
        {
          type: "glossHint",
          data: {
            hName: "span",
            hProperties: { className: ["gloss-hint"], ariaHidden: "true" },
          },
          children: [{ type: "text", value: "?" }],
        },
      ]);
    },

    // 全visitorが走り終わった後に1度だけ呼ばれる。この記事で実際に使われた用語だけ，
    // 解説本体をroot末尾にまとめて追加する。popover要素はブラウザのtop layerに描画
    // されるため，DOM上どこに置いてもボタンの隣に正しく表示される。
    after(root, ctx) {
      for (const term of used) {
        // 解説文はMarkdownとして解析し，その中身をそのままpopoverの子にする。
        // これで複数段落・箇条書き・inline code・リンクを，HTMLを書かずに扱える。
        const parsed = markdownToMdast(GLOSSARY[term].description);

        ctx.appendChild(root, {
          type: "glossBalloon",
          data: {
            hName: "div",
            hProperties: {
              id: popoverId(term),
              popover: "",
              className: ["gloss-balloon"],
            },
          },
          children: parsed.children,
        });
      }
    },
  });
};
