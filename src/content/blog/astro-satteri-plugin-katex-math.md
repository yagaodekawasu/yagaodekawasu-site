---
title: "Sätteriプラグイン開発 #2 数式のレンダリング"
description: "Astro 7のRustネイティブMarkdownエンジンSätteriで，features.mathでパースした数式ノードをKaTeXでレンダリングするmdastPluginを実装した記事です。"
pubDate: 2026-08-26
tags: ["Sätteri", "Astro", "Markdown", "KaTeX"]
ogpImage: /uploads/astro-satteri-plugin-katex-math-ogp.png
draft: false
series:
  name: "Sätteriプラグイン開発"
  order: 2
  label: "数式のレンダリング"
---
## はじめに

前回の記事では，`defineMdastPlugin`を使って本文中の単独リンクをOGPカードに変換するプラグイン実装した話をしました。

[SätteriのプラグインAPIで外部リンクをカード化する | 笶顔でかわす](https://yagaodekawasu.com/blog/astro-satteri-plugin-link-card/)

それに続いて，今回は↓この記事を書くために実装した数式をレンダリングするプラグインの話をしようと思います。

[調乳ヘルパーの計算式解説① | 笶顔でかわす](https://yagaodekawasu.com/blog/formula-mixing-ratio-specific-heat-sources/)

Sätteri向けにKaTeXレンダリングを行うコミュニティ製プラグインもあるにはあるものの実績（GitHubリポジトリのスター数とか）が薄く，且つKaTeXでのレンダリング処理自体は`katex`パッケージを使うだけで完結するシンプルな処理なので，外部依存を1つ増やすコストには見合わないなーと思い，結局自前で実装することにしました。

## KaTeXとは？

物知り顔で「KaTeX」と書いていますが，正直この記事を書くまでTeXとLaTeXしか聞いたことありませんでした。更にいうとTeXとLaTeXの違いもちゃんとわかってなかったので，この機会に諸々調べました。

- TeX（古代ギリシャ語の τέχνη 「技術・技芸」が由来）:  
	アメリカの数学者・計算機科学者である Donald Knuth が開発した組版システムそのもので，数式に限らず文書全体のレイアウトを低レベルに制御できます。

- LaTeX（開発者 Leslie Lamport の姓「Lamport」＋「TeX」）:  
	TeXの上に乗るマクロパッケージ集で，`\section`や`\begin{equation}`のような高レベルなコマンドを提供し，論文・学術文書の事実上の標準になっています。

- KaTeX（恐らく開発元である Khan Academy の頭文字＋「TeX」）:  
	これらとは別に開発されたJavaScript製のライブラリです。GitHubのREADMEには次のように説明されています。

> KaTeX is a fast, easy-to-use JavaScript library for TeX math rendering on the web.
> KaTeX supports much (but not all) of LaTeX and many LaTeX packages.

つまりKaTeXは，文書全体ではなく数式部分だけをブラウザ上（またはNode.jsでのSSR）でレンダリングする専用ツールで，LaTeXの数式記法（`\frac`や`\sum`等）をサブセットとしてサポートしているだけです。本物のTeXエンジンを動かすわけではなく，KaTeX独自の実装でHTML+CSSの数式表現に変換します。まぁ，TeX/LaTeXの良いとこどりって感じですかね。

つまり，TeXはドキュメントのレイアウトを自由に制御できるようにするための仕組み（言語＋エンジン），LaTeXはTeXを書く労力を減らすための便利なコマンドセット，KaTeXはWebページ作る時に慣れ親しんだTeX/LaTeXで数式を書けるようにするためのレンダリングツールということですね。

![TeX・LaTeX・KaTeXの関係を表したイラスト](/uploads/astro-satteri-plugin-katex-math/01-tex-latex-katex.png)

TeXとLaTexの違いについては↓こちらが参考になりました。

[TeXとLaTeXの違い | ラング・ラグー](https://blog.wtsnjp.com/2016/12/19/tex-and-latex/#fnref:4)

## `features.math`で数式をパースする

「Sätteriとは」の記事で見たように，レンダリングする時はまずRustでマークダウンをパースしてASTを作り，そのASTのノードを各プラグインに渡して処理していくという仕組みなので，プラグインが数式を処理するためには，パーサーが数式を数式としてパース出来る必要があります。

[Astro 7のデフォルトMarkdownエンジン「Sätteri」とは何か | 笶顔でかわす](https://yagaodekawasu.com/blog/astro-satteri-overview/)

「数式なんてみんな使ってる（認知の歪み）し，特別な設定とか要らないっしょ」なんて思ってたんですが，実際は`features.math`という組み込みオプションを有効化しないと`$$ ... $$`（ディスプレイ数式）や`$ ... $`（インライン数式）といった記法をパースしてくれない仕様になっていました。オプションの設定方法は↓こんな感じです。

```js
// astro.config.mjs
export default defineConfig({
  markdown: {
    processor: satteri({
      features: { math: true },
    }),
  },
});
```

パース結果はそれぞれ`math`/`inlineMath`というASTノードになり，TeXの生文字列が`node.value`に入ります。

なお，`singleDollarTextMath: false`を指定すると単一`$`によるインライン数式のパースを無効化できます（「\$50から\$100」のような通貨表記と誤認させたくない場合に有効です）。

### 特定の`$`だけリテラル扱いにしたい場合

`singleDollarTextMath: false`はサイト全体で単一`$`のインライン数式パースを無効化するオプションなので，「他の箇所では数式として`$...$`を使いたいが，この一箇所の通貨表記だけはリテラル扱いにしたい」というケースには使えません。

このような局所的な回避には，CommonMark標準のバックスラッシュエスケープ（`\$`）が使えます。ただし単純に思われがちなこの方法には，Sätteri実装上の落とし穴があります。

- `「\$50から\$100」` → 「\$50から\$100」……リテラル扱い（正しく回避できる）
- `「$50から\$100」`  → 「$50から\$100」……数式として解釈される（閉じ側だけのエスケープでは回避できない）

[Sätteriのソース](https://github.com/bruits/satteri/blob/main/crates/satteri-pulldown-cmark/src/firstpass.rs#L1983-L1985)には，この挙動を説明するコメントがあります。

> In math context, `\$` should still produce a MaybeMath delimiter so it can close a math span. The backslash only prevents opening.

つまりバックスラッシュは，その`$`が数式を開くのを防ぐだけで，閉じるのを防ぐわけではありません。`$x\$y$`という入力があった場合，先に出てくる未エスケープの`$`が数式を開き，後ろのエスケープ済み`\$`がそのまま閉じデリミタとして使われてしまいます。

通貨表記を確実にリテラル扱いにするには，開き側・閉じ側の`$`を両方ともエスケープする必要があります。片方だけで済ませようとせず，常に両方エスケープするのが安全です。

### 余談：なぜ数式のパースはデフォルトで無効なのか？

Sätteriのfeatures一覧を見ると，デフォルトで有効なのは`gfm`と`frontmatter`だけで，`math`を含むそれ以外の機能はすべてデフォルト無効です。

[Features — Sätteri](https://satteri.bruits.org/docs/features/)

そもそもの話として，これはSätteri固有の設計ではありません。CommonMarkの仕様自体に，数式に関する規定が存在しないため，`$`をどう扱うかは各処理系の裁量に委ねられています。

remark/rehypeエコシステムの`remark-math`やmarkdown-it向けの数式プラグイン群は，いずれもコアに含まれない独立した拡張・プラグインとして提供されていて，明示的に追加しない限り数式はパースされません。
一方でPandoc独自の拡張Markdown方言や，GitHub（github.com）上のMarkdownレンダリングのように，デフォルトで`$...$`を数式として解釈する実装も存在します（この場合は通貨表記との曖昧性を避けるための個別ルールを併せ持っています）。

つまり「オプトインにするか，個別の曖昧性回避ルールを作り込んでデフォルト有効にするか」という2択に各処理系が向き合っていて，Sätteriは前者を選んでいるという位置づけです。

特に`$`という文字は，数式のデリミタとして使うには便利な反面，文章中に普通に登場する記号でもあります。実際，remark/rehypeエコシステムで同じ`$...$`記法を扱う`remark-math`では，「"\$29 and \$199"のような通貨表記が意図せず数式として解釈されてしまう」という不具合がissueとして報告されています。

[The dollar sign is not showing in single $ quote · Issue #74 · remarkjs/remark-math](https://github.com/remarkjs/remark-math/issues/74)

`features.math`に`singleDollarTextMath: false`という，単一`$`のパースだけをオフにできるオプションが用意されているのも，この曖昧さが実際に問題視されていることの裏付けと言えます。

もし`$`のパースがデフォルトで有効だったら，数式を書くつもりが無い記事でも，価格や金額に言及しただけで意図せず数式として誤解釈され，レンダリングが崩れる事故が起こり得ます。`math`を含む一群の機能がデフォルトオプトインになっているのは，こうした後方互換性の壊れやすさを避けるための設計だと考えられます。

長くなったのでイラストでまとめます。

![featuresのデフォルト有効/無効の理由をまとめたイラスト](/uploads/astro-satteri-plugin-katex-math/02-features-math-default-off.png)

## mdastPluginで数式（KaTeX）をレンダリングする

さて，`math`を有効化してパースできるようにしたら，パースされた`math`/`inlineMath`ノードを，`katex`パッケージの`renderToString()`でそれぞれHTML文字列に変換して差し替えます。

```js
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
```

`renderToString()`の第二引数のオプションについては以下の通りです。

- `displayMode`（デフォルト `false`）：数式をブロック表示（独立行・中央配置，`\int`や`\sum`が大きく表示される）にするかインライン表示にするかを切り替えるオプションです。`math`ノードでは`true`，`inlineMath`ノードでは`false`を指定しています。
- `throwOnError`（デフォルト `true`）：未対応コマンドや不正なLaTeXに遭遇した時に例外を投げるかどうかを指定します。どうせ公開前に目検するので`false`にしています。

あとは`global.css`でKaTeXのCSS（katex/dist/katex.min.css）を読み込めばおしまいです。前回のOGPカードに比べて遥かにシンプルですね。

## `{ type: "html", value }`について

`math`（ブロック数式）・`inlineMath`（インライン数式）のどちらも，`ctx.replaceNode()`の戻り値に`{ type: "html", value }`を使っています。`replaceNode()`が受け取れる戻り値にはいくつか種類があるので，まずそこを整理しておきます。Sätteri公式のプラグインAPIドキュメントによると，主に以下の3パターンです。

- mdastノード：
  　別のノードで置き換える
- `{ raw: string, mdxExpressions?: boolean }`[^1]：
  　文字列をMarkdownとして再パースし，その結果をノードの位置に差し込む
- `{ type: "html", value: string }`：
  　mdastの`html`リテラルノードとして，再パースせずそのままツリーに挿入する

[Plugin API — Sätteri](https://satteri.bruits.org/docs/plugin-api/)

実際，`math`・`inlineMath`の置換に`{ raw }`（または非推奨の`rawHtml`）を使うと，インライン数式でこういう症状が出ます。

```html
<li><p><span class="katex">...</span></p>...</li>
```

`<span class="katex">`だけが`<p>`にラップされて浮いてしまい，前後のテキストと分断されています。

これは，`{ raw }`が「渡した文字列をMarkdownとして再パースする」という仕様である以上，避けられない副作用です。CommonMarkの仕様では，`div`のような特定のブロックレベルタグをルートに持つHTML断片だけが「HTMLブロック」として認識され，そのまま独立した要素になります。一方`span`のようなタグはこの対象に含まれないため，段落中に現れた「インラインの生HTML」として扱われ，周囲のテキストごと`<p>`で包まれてしまいます。KaTeXの`renderToString()`が返すのは常に`<span class="katex">`（または`<span class="katex-display">`）なので，再パースを経由すると必ずこの扱いになります。

[HTML blocks — CommonMark Spec](https://spec.commonmark.org/0.31.2/#html-blocks)

一方`{ type: "html", value }`は再パースを経ずmdastツリーに直接挿入されるため，このような暗黙のラップは起こりません。

ここでややこしいのが，公式ドキュメントが一般的な推奨として`{ raw, mdxExpressions: false }`を`{ type: "html", value }`より優先するよう案内している点です（しかもKaTeXの出力がその代表例として名指しされています）。ただしこれはMDX対応（`mdxToJs`）を見据えた案内で，「`{ type: "html", value }`は`markdownToHtml`では動くが`mdxToJs`では例外を投げる」というのが理由です。

というわけで，MDXを使わずSätteriを`markdownToHtml`専用で使っているこのBlogでは，公式の一般的な推奨（`{ raw, mdxExpressions: false }`）よりも，あえて`{ type: "html", value }`を選ぶという判断をしました。

## まとめ

- `features.math`でパースされた数式ノードは，`katex`の`renderToString()`でレンダリングする
- `{ raw }`（および非推奨の`rawHtml`）は文字列をMarkdownとして再パースするため，KaTeXが返す`<span>`ルートのHTMLはインライン生HTML扱いとなり`<p>`に暗黙包装される
- 公式は`{ raw, mdxExpressions: false }`を推奨しているが，これはMDX互換性のためであり，敢えて`{ type: "html", value }`を選択した方が良いケースもある。

## 参考

- [satteri (GitHub)](https://github.com/bruits/satteri)
- [Plugin API — Sätteri](https://satteri.bruits.org/docs/plugin-api/)
- [HTML blocks — CommonMark Spec](https://spec.commonmark.org/0.31.2/#html-blocks)
- [KaTeX/KaTeX: Fast math typesetting for the web.](https://github.com/KaTeX/KaTeX)
- [KaTeX API Documentation](https://katex.org/docs/api.html)

[^1]: 以前は`{ rawHtml: string }`という戻り値もありましたが，[Sätteri 0.10.0（2026-08-18）で非推奨になっており](https://github.com/bruits/satteri/blob/main/packages/satteri/CHANGELOG.md)，`{ raw, mdxExpressions: false }`と同じ挙動をするとドキュメントに明記されています。
