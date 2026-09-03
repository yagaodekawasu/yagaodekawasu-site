---
title: "Astro + Tailwindで脚注を書いたら勝手に「Footnotes」と出る"
description: Astro 7のMarkdownエンジンSätteriで脚注を書くと，本来は非表示のはずの「Footnotes」という英語見出しが表示されてしまう問題の原因と対処についての記事です。
pubDate: 2026-09-01
tags: [Astro, Sätteri, Markdown, Tailwind CSS]
ogpImage: /uploads/astro-tailwind-footnotes-label-visible-ogp.png
draft: false
---

## はじめに

このサイトで初めて記事に脚注を書いた時，記事を公開した後で内容を確認したら，脚注一覧の直前に見覚えのない「Footnotes」という英語の見出しが。

生成されたHTMLを見ると，こういう要素が挿入されていました。

```html
<h2 class="sr-only" id="footnote-label">Footnotes</h2>
```

:gloss[sr-only]{term=sr-only}は「スクリーンリーダーには読ませるが，視覚的には隠す」ためのクラスで，読み上げたときに「ここから先は脚注です」と分かるようにするためのものです。

つまり，本来は目に見えないアクセシビリティ用のラベルが何らかの仕組みによって挿入された上，画面上に露出してしまっているという状況です。

当初ClaudeはSätteriが生成した見出しを後から書き換えるhastプラグインを実装することで対応していたんですが，後々調べたらイケてない対応だったとわかったので，反省の意も込めて正しい原因と対策について記事にしようと思います。

## 前提

この記事の内容は，以下の構成で確認したものです。

| パッケージ | バージョン |
| --- | --- |
| `astro` | 7.1.5 |
| `@astrojs/markdown-satteri` | 0.3.8 |
| `satteri` | 0.10.5 |
| `tailwindcss` | 4.3.3 |

## 「Footnotes」の出所

まず，この`<h2>`を挿入しているのは誰なんでしょうか？

`.md`の時点で存在しなかったものがHTMLになった時に出現するということは，Markdown→HTMLの変換過程で「混入」していると考えるのが自然です。それを行うのが`convertMdastToHastHandle()`，つまりmdastをhastに変換する工程ですね。

その中で呼ばれる`emit_footnotes_section()`という関数があるので，実際にソースを見てみましょう。

```rust
// crates/satteri-ast/src/emit.rs
fn emit_footnotes_section<S: ConvertSink>(ctx: &EmitCtx<'_, '_>, sink: &mut S, depth: u32) {
    // ...
    sink.open_element("h2", Pos::None);
    sink.attr(CLASS_NAME, AttrValue::class_list("sr-only"));
    sink.attr(ID, AttrValue::text("footnote-label"));
    sink.finish_attrs();
    sink.text(&ctx.options.footnote_label, Pos::None);
    sink.close_element("h2");
```

Rustが読めなくても，`"sr-only"`とか`"footnote-label"`とか書いてあるので，ここで最終的なHTML出力に出てくる値が指定されているのがわかりますね。

:::newbie
`sink`とは「データの流し込み先」を指し，データの出どころを指す`source`の対義語にあたります。

[sourceとそれに対応する語](http://lise-sophia.net/kktm/Essay/source.htm)

このコードがやっているのは，「`h2`を開く」「属性を付ける」「テキストを入れる」「`h2`を閉じる」という指示を`sink`に向かって順に出すことだけです。その指示を受けて実際に何を作るかは`sink`側の実装に委ねられています。宣言部の`<S: ConvertSink>`は「`ConvertSink`という約束事を満たすものなら何でも受け取る」という意味で，Rustではこの約束事を`trait`と呼びます（他の言語のインターフェースに相当します）。
:::

ちなみに呼び出しチェーンは

```
convert_mdast_to_hast_handle()（Node-APIバインディング）
↓
mdast_arena_to_hast_arena_into()
↓
emit_node()
↓
emit_footnotes_section()
```

となっています。これで「犯人」はわかりましたね。

:::note
`emit_footnotes_section()`を定義している`emit.rs`は，mdastを要素へ変換する処理をhast用とHTML文字列用で共用する設計になっています（ファイルの冒頭に「The mdast → element mapping, written once and driven into either a HAST arena or an HTML string.」というコメントがあります）。

つまり，`markdownToHtml()`でhastを経由せず直接HTMLを得る場合も同じ関数を通るので，どちらのAPIを使っても脚注の見出しは必ず付いてくることになります。
:::

また，「Footnotes」という文言（`emit_footnotes_section()`が参照する`ctx.options.footnote_label`）も同じ:gloss[クレート]{term=crate}の中にありました。

```rust
// crates/satteri-ast/src/convert.rs
impl Default for ConvertOptions {
    fn default() -> Self {
        Self {
            footnote_label: "Footnotes".to_string(),
```

なお，「Footnotes」という文言の由来については，Sätteriの型定義ファイル（`node_modules/satteri/dist/compile.d.ts`）のコメントに答えが書いてありました。

:::newbie
`.d.ts`はTypeScriptの型定義ファイルです（「d」は「declaration（宣言）」の略）。

TypeScriptで書かれたライブラリはJavaScriptにコンパイルして配布されるため，その過程で型情報が消えてしまいます。それを別ファイルに書き出しておくことで，利用者側のエディタが補完や型チェックに使えるようになっています。

[Declaration Files: Introduction - TypeScript](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html)
:::

```ts
/**
 * i18n strings for the GFM footnotes section. Mirrors `footnoteLabel`,
 * `footnoteBackLabel`, and `footnoteBackContent` from remark-rehype.
 */
export interface FootnoteOptions {
    /** `<h2>` label opening the footnotes section. Default: `"Footnotes"`. */
    label?: string;
```

つまり，remark-rehype ―― 正確にはその内部で使われる`mdast-util-to-hast`に合わせた値だということですね。Sätteri独自の判断ではなく，既存のエコシステムと同じ出力になるよう揃えてあるわけです。

## sr-onlyのラベルが露出した原因

`.sr-only`が付いている`h2`が画面上に現れてしまったということは，このクラスが効いていないということです。考えられる原因は2つあります。

1. `.sr-only`のCSSルールがそもそも生成されていない
2. ルールは生成されているが，他のルールに上書きされて無効化されている

実際に生成されたCSSを確認したところ，答えは1でした。`.sr-only`に対応するルールがどこにも存在していなかったのです。そして`.sr-only`はTailwindが提供しているクラスなので，これはTailwindがルールを生成しなかったということになります。

Tailwind CSS v4では，ビルド時にソースファイルを自動検出＆スキャンして，実際に書かれているクラス名の分だけCSSを生成しているんですが，この`sr-only`はSätteriがレンダリング時に動的に注入しているだけなので，`.astro`にも`.md`にもリテラルとして存在しません。Tailwindから見れば「誰も使っていないクラス」なので，CSSを出す理由がありません。その結果，意味のないクラス名として`sr-only`が付いているだけの`<h2>`が通常の見出しとして表示されてしまったというわけです。

:::column
「Sätteriが生成したHTMLの方をスキャンすればいいのでは」とも思うところですが，それはかなりハードルが高いようです。

というのも，Astroが最終的に出力するHTMLは生成されたCSSのファイル名（:gloss[キャッシュバスティング]{term=cache-busting}のためのハッシュ付き）を参照するので，CSS生成をHTML依存にしようとすると循環参照になってしまいます。これを解くには「一度全部出してからHTMLを見て削り直す」という2パスのビルドが必要で，順番の制御というよりビルドをもう1周させる話になります。

加えてdevサーバーでは（Sätteriが変換した記事本文のHTMLは`.astro/data-store.json`にキャッシュされるものの）記事全体のHTMLがファイルとして書き出されず，リクエストのたびに生成されます。本番ビルドだけ2パスにすると，開発時と本番でCSSが変わることになってしまいます。
:::

## 問題の本質

上の議論で，この問題には2つの要素が組み合わさっていることがわかりました。つまり，

1. `sr-only`の挙動が想定とずれる問題: SätteriとTailwindの仕様のズレ
2. ラベルが英語になっている: Astroの設定漏れ（後述）

ということですね。

:::column
「クラス名は付いているのにスタイルが効かない」という症状を見たときは，2つのパターンを疑うとよさそうです。

1. HTML生成側が想定通りに動いておらず，そもそもクラスが付いていない
2. HTMLは正しく生成されているが，そのクラス名がビルド時スキャンに拾われずCSSが出ていない

今回は後者でした。開発者ツールで要素を見れば，前者なら「クラスが無い」，後者なら「クラスはあるのに対応するルールが存在しない」という違いで切り分けられます。
:::

## 対処

今回は最終的に，`astro.config.mjs`の`features`にオプションを渡して「Footnotes」ではなく「注釈」と表示されるようにしました。

```js
processor: satteri({
  features: {
    gfm: { footnotes: { label: '注釈' } }
  }
})
```

このように設定しておくと，SätteriのJS層（`satteri/dist/compile.js`）で次のようにRust側に受け渡してくれます。

```js
// 指定されたラベルをネイティブ側に渡す（未指定なら何も渡さない）
if (label !== undefined) convertOptions.footnoteLabel = label;
```

`label`を書いたときだけ`convertOptions.footnoteLabel`に値が入り，`emit_footnotes_section()`が参照していた`ctx.options.footnote_label`を上書きします。逆に書かなければネイティブ側には何も渡らないので，`ConvertOptions::default()`の`"Footnotes"`がそのまま出てくる，というわけですね。

:::column
`FootnoteOptions`には他にも設定項目があります。

| オプション | 既定値 | 内容 |
| --- | --- | --- |
| `label` | `"Footnotes"` | 脚注セクションを開く`<h2>`のラベル |
| `backContent` | `"↩"` | 本文へ戻るリンクの中身 |
| `backLabel` | `"Back to reference {reference}"` | 戻るリンクの`aria-label` |
| `clobberPrefix` | `"user-content-"` | :gloss[DOM clobbering]{term=dom-clobbering}対策として脚注のidに付く接頭辞 |

`backLabel`も既定では英語なので，読み上げ環境まで含めて日本語化したいならこちらも設定しておくとよさそうです。
:::

ちなみに，脚注のラベル表記の問題はAstroで「設定から文言を変えられない」という話が過去（2022年4月……Astro 1.0のbeta時代）[Issueとして報告されており](https://github.com/withastro/astro/issues/3163)，その対応としてオプションが公開されるようになったという経緯があります。Sätteriが同じ役割のオプションを持っているのも，この流れの延長線上にありそうです。

`sr-only`が隠れない問題については，`global.css`に`@source inline("sr-only")`と書けばTailwindが強制的に`.sr-only`のCSSを生成してくれると判明したものの，今回は「まぁ見出しがあって困ることは特にないか」と思ったので，結果として採用は見送りました。

[Detecting classes in source files - Core concepts - Tailwind CSS](https://tailwindcss.com/docs/detecting-classes-in-source-files#safelisting-specific-utilities)

:::column
ただし，現在このサイトでは既に`.sr-only`のCSSが生成されています。

先日公開した[別の記事](/blog/astro-satteri-plugin-external-links/)の本文に`sr-only`が含まれており，Tailwindのスキャナがコード／文章を区別しないため，「使われているクラス」と判断してCSSを生成するようになったというカラクリです。

`@source inline()`を書くより手っ取り早いですが，場合によっては不要なCSSまで生成されうるのはちょっと気になりますね。
:::

## まとめ

処理系が勝手に足してくれる要素は，ソースのどこにも書かれていないぶん見落としやすいです。今回は「隠れるはずのものが見えている」という分かりやすい形で表に出ましたが，`backLabel`のように読み上げ環境でしか出てこないものは，意識して探しにいかないと英語のまま残り続けることになるので注意が必要ですね。

## 参考

- [satteri (GitHub)](https://github.com/bruits/satteri)
- [satteri-ast/src/emit.rs (GitHub)](https://github.com/bruits/satteri/blob/main/crates/satteri-ast/src/emit.rs)
- [satteri-ast/src/convert.rs (GitHub)](https://github.com/bruits/satteri/blob/main/crates/satteri-ast/src/convert.rs)
- [satteri-napi-binding/src/lib.rs (GitHub)](https://github.com/bruits/satteri/blob/main/crates/satteri-napi-binding/src/lib.rs)
- [remark-rehype (GitHub)](https://github.com/remarkjs/remark-rehype)
- [mdast-util-to-hast (GitHub)](https://github.com/syntax-tree/mdast-util-to-hast)
