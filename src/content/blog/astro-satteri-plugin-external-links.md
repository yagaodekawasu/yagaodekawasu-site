---
title: "Sätteriプラグイン開発 #3 外部リンクの新規タブ表示"
description: "Astro 7のMarkdownエンジンSätteriで，本文中の外部リンクにだけtarget=_blankを付ける対応をした記事です。"
pubDate: 2026-08-31
tags: ["Sätteri", "Astro", "Markdown"]
ogpImage: /uploads/astro-satteri-plugin-external-links-ogp.png
draft: false
series:
  name: "Sätteriプラグイン開発"
  order: 3
  label: "外部リンクの新規タブ表示"
---

## はじめに

引き続きSätteri関連の記事になります。前回の記事では，`features.math`でパースした数式ノードをKaTeXでレンダリングする`mdastPlugin`を実装した話をしました。

[Sätteriプラグイン開発 #2 数式のレンダリング | 笶顔でかわす](/blog/astro-satteri-plugin-katex-math/)

## やりたいこと

リンクの扱いは結構議論が分かれるところのようで，自分の中でも行ったり来たりを繰り返したんですが，最終的には「内部リンクは同じタブで開き，外部リンクは新規タブで開く」という仕様に決めました。自分の中で外部リンクは「補足ドキュメント」の意味合いが強く，分割タブで並べて表示したりして本文と照らし合わせながら読むことが多いので，左クリックの挙動として新規タブで開くのが自然かなと思いました。一方で内部リンクはどちらかというと並列処理よりは順次処理なイメージなので同タブかなーと。一応:gloss[MDN]{term=mdn}先生も

> A common approach is to open external links in new tabs and internal links in the same tab.

[Creating links - Learn web development | MDN](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/Creating_links)

と仰っているので，変な実装ではないはずだと思っています（汗）。

## プラグインの必要性

フロントエンド素人なので，Claudeからの提案に対して正直「こんなことのためにわざわざプラグイン作らないといけないの？」とか思ってしまいました。

そもそもMarkdown（CommonMark）の`[テキスト](URL)`には属性を書く場所がないため，この記法から素直にHTMLを生成すると，`href`だけ持った素の`<a>`要素になります。その場合ブラウザのデフォルトの挙動として`"ref=_self"`（同タブで開く）になるわけで，よってMarkdownを解釈する過程のどこかに`target`を足す必要がありますよと。

じゃあそれをAstroの設定ファイルに1行追加して実現できないのかと思ったんですが，現状Astroにそういう機能は実装されていないようです。ほなしゃあない🥺

:::column
「素人質問で恐縮だけど，ちなみに他のSSGはどうなってるの？」とClaudeに訊いてみたところ，「設定ファイルに1行書くだけ」で済むものが結構ありました。

- :gloss[Zola]{term=zola}……`config.toml`の`[markdown]`に`external_links_target_blank: true|false`がある（既定は`false`）
- :gloss[VitePress]{term=vitepress}……`markdown.externalLinks`が既定で`{ target: '_blank', rel: 'noreferrer' }`

Claudeが推察するに，ZolaとVitePressはドキュメントサイト寄りの用途が強いため「外部リンクは新規タブ」が定番の要求として最初から織り込まれている一方，Astroは汎用のフレームワークで，Markdownの処理系ごと差し替えられる作りになっている分「この手の個別の挙動は利用者側で足してね」という立て付けになっているように見えるとのことです。
:::

## satteri-external-linksの導入

当初はClaudeが言うままに自前実装でやっていたんですが，[「『Sätteri』とは」の記事](/blog/astro-satteri-overview/)を書く中でコミュニティプラグインの存在を知り，こっちも既存プラグインで実現できないか探させたところ，`satteri-external-links`というhastプラグインが見つかりました。

[felixicaza/satteri-plugins (GitHub)](https://github.com/felixicaza/satteri-plugins)

やりたかったことが全部カバーされてるし，`content`（外部リンクの後ろにアイコンや「新しいウィンドウで開きます」といった注記を足せる）などの便利オプションも付いているので，流石に使わない理由がないかということで乗り換えた次第です。最初の設計の時点で提案してもらえなかったのは私の不徳の致すところですね。

設定は↓これだけです。

```js
import satteriExternalLinks from "satteri-external-links";

export const externalLinkPlugin = satteriExternalLinks({
  target: "_blank",
  rel: [],
});
```

今回使ったのは`target`と`rel`だけですが，オプションは全部で7つあります（v0.1.1時点）。

| オプション | 既定値 | 内容 |
| --- | --- | --- |
| `target` | なし | 対象リンクに付ける`target`の値。`'_blank' \| '_parent' \| '_self' \| '_top'` |
| `rel` | `['nofollow']` | 対象リンクに付ける`rel`の値。文字列または配列 |
| `properties` | なし | `<a>`要素に足す任意の属性。`{ className: ['external-link'] }`のように書く |
| `content` | なし | リンクの末尾に足すノード。アイコンや「opens in a new window」といった注記を差し込む用 |
| `contentProperties` | なし | 上の`content`を包む要素に付ける属性。`{ className: ['sr-only'] }`にすれば読み上げ専用にできる |
| `protocols` | `['http', 'https']` | 「外部リンク」と見なすスキーム。`'mailto'`を足せばメールリンクも対象にできる |
| `test` | なし | 対象を更に絞り込むフック |

`protocols`と`test`を除く5つは，値そのものではなく`(element) => 値`というコールバックでも渡せます。「このドメインのときだけ`rel`を変える」といった出し分けをしたい場合はそちらを使う形になります。

`test`に登録したコールバックは`href`を持つ`<a>`要素すべてに対して呼ばれ，`true`を返すリンクにだけ処理を適用する形になります。当初は内部リンクも絶対URLで書いていたので，そのままだと`test`にオリジンを見て自サイトかどうか判定する式を書く必要があったんですが，これを機に内部リンクは全て相対URLを使うという設計に変えたため，結果的に使わないことになりました。

:::warning
このプラグインは既定で`rel="nofollow"`を付けるので，`rel`属性を付けたくない（ブラウザのデフォルト挙動に任せたい）場合は`rel: []`と明示する必要があります。`rel`を設定しない理由については前回の記事をご覧ください。
:::

## まとめ

やっぱ知識って大事だなぁと思いました。それでは。

## 参考

- [satteri (GitHub)](https://github.com/bruits/satteri)
- [Plugin API — Sätteri](https://satteri.bruits.org/docs/plugin-api/)
- [satteri-plugins (GitHub)](https://github.com/felixicaza/satteri-plugins)
- [@astrojs/markdown-satteri (GitHub)](https://github.com/withastro/astro/tree/main/packages/markdown/satteri)
- [Configuration — Zola](https://www.getzola.org/documentation/getting-started/configuration/)
- [Markdown Extensions | VitePress](https://vitepress.dev/guide/markdown)
