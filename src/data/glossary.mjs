// サイト共通の用語辞書。
//
// 記事本文で `:gloss[表示テキスト]{term=ogp}` と書くと，その箇所がクリック可能になり，
// 解説がバルーン（popover）で表示される。表示テキストを省略して `:gloss{term=ogp}` と
// 書いた場合は，ここで定義した `label` がそのまま表示される。
//
// `description` は素のMarkdownとして解釈される。複数段落・箇条書き・inline code・
// リンクが使えるので，HTMLを直接書く必要はない。
//
// キー（用語ID）は本文から参照する識別子で，HTMLのid属性（`gloss-<用語ID>`）にも
// そのまま使われる。英小文字・数字・ハイフンで書くこと。
// なお本文側の`term=`は大文字小文字を区別しないので，`{term=OGP}`と書いても照合できる。

export const GLOSSARY = {
  ogp: {
    label: "OGP",
    description: `Open Graph protocolの略。Webページに「SNSで共有されたときにどう見せたいか」のメタ情報を持たせるための規格。

\`<head>\`の中に\`og:title\`（タイトル）・\`og:description\`（説明）・\`og:image\`（サムネイル画像）といった\`<meta>\`タグを書いておくと，SNSやチャットにURLを貼ったときにそれらが読み取られてカード状に表示される。

[公式サイト](https://ogp.me/)`,
  },

  ast: {
    label: "AST",
    description: `Abstract Syntax Tree（抽象構文木）の略。ソースコードや文書を，人間が読む文字列としてではなく，構造を持った木として表現したもの。

たとえば「見出しの中に強調されたテキストがある」という関係を，親子関係を持つノードとして表す。文字列を正規表現で置換するのに比べ，構造を壊さずに安全な変換ができる。`,
  },

  mdast: {
    label: "mdast",
    description: `Markdown Abstract Syntax Treeの略で，Markdown用の抽象構文木。見出し・段落・リンク・リストなどが，それぞれノードとして表現される。

Markdownを変換するプラグインは，このmdastを書き換えることで動作する。`,
  },

  hast: {
    label: "hast",
    description: `Hypertext Abstract Syntax Treeの略で，HTML用の抽象構文木。要素・属性・テキストがノードとして表現される。

Markdownの変換は「Markdown → mdast → hast → HTML文字列」という順に進むため，hastの段階ではもうHTMLの構造として扱える。属性を足すといったHTML寄りの調整はこの段階で行う。`,
  },

  frontmatter: {
    label: "frontmatter",
    description: `Markdownファイルの先頭に\`---\`で挟んで書く，その文書自体のメタデータ。タイトル・公開日・タグなどを持たせるのに使う。

\`\`\`
---
title: 記事のタイトル
pubDate: 2026-08-30
---
\`\`\`

本文としては描画されず，サイト側が記事一覧を組み立てるときなどに読み取られる。YAML形式で書くのが一般的。`,
  },

  ssg: {
    label: "SSG",
    description: `Static Site Generation（静的サイト生成）の略。ページのHTMLをビルドの時点で作り切っておき，アクセス時にはそれをそのまま返す方式。

アクセスのたびにサーバーがHTMLを組み立てる方式と違って，表示が速く，サーバー側の構成もシンプルになる。反面，内容を更新するにはビルドし直す必要がある。`,
  },

  zola: {
    label: "Zola",
    description: `Rust製の静的サイトジェネレーター。単一のバイナリで動き，テンプレートエンジンもMarkdownパーサーも同梱しているため，Node.jsのような外部ランタイムやプラグインのインストールを必要としない。

[公式サイト](https://www.getzola.org/)`,
  },

  vitepress: {
    label: "VitePress",
    description: `Viteをベースにした，ドキュメントサイト向けの静的サイトジェネレーター。Vue製で，Markdownで書いた文書をそのままドキュメントサイトとして公開できる。

技術ドキュメントという用途に絞られている分，検索・サイドバー・外部リンクの扱いといった「よくある要求」が最初から組み込まれているのが特徴。

[公式サイト](https://vitepress.dev/)`,
  },

  napi: {
    label: "Node-API",
    description: `Node.jsから，RustやC++で書かれたネイティブモジュールを呼び出すためのインターフェース。旧称はN-API。

JavaScriptだけでは速度が足りない処理をネイティブ言語で実装し，Node.jsから使えるようにするために用いる。Node.jsのバージョンが上がってもモジュールを再ビルドせずに済むよう，安定したAPIとして設計されている。`,
  },

  mdn: {
    label: "MDN Web Docs",
    description: `Mozillaが運営する，HTML・CSS・JavaScript・Web APIのリファレンスサイト。各機能の仕様・対応ブラウザ・使い方が網羅的にまとまっている。

ブラウザベンダーや標準化団体も編集に関わっており，Web開発における事実上の標準的な参照先になっている。

[公式サイト](https://developer.mozilla.org/ja/)`,
  },
};
