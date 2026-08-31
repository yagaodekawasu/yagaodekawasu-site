---
title: "Sätteriプラグイン開発 #1 OGPカード表示"
description: Astro 7のRustネイティブMarkdownエンジンSätteriで，本文中の単独リンクだけをOGPカードに変換するmdastPluginを実装した方法について書きました。
pubDate: 2026-08-25
tags: [Sätteri, Astro, Markdown]
ogpImage: /uploads/astro-satteri-plugin-link-card-ogp.png
draft: false
series:
  name: "Sätteriプラグイン開発"
  order: 1
  label: "OGPカード表示"
---

## はじめに

前回の記事で，Sätteriのアーキテクチャとremark/rehypeとの違いを解説しました。その実践編として，今後何回かに分けて，実際にブログを育てていく過程で（バイブコーディングで）作成したSätteriプラグインを1本ずつ紹介していこうと思います。

[Astro 7のデフォルトMarkdownエンジン「Sätteri」とは何か | 笶顔でかわす](/blog/astro-satteri-overview/)

最初に作ったのは，本文中に単独で貼った外部リンクを:gloss[OGP]{term=OGP}カード形式に変換する`mdastPlugin`でした。

## やりたいこと

折角の自分の城だし，なるべくUIはリッチにしたいということで，リンクをOGPカード形式で表示する機能を実装することにしました。やっぱただのハイパーテキストじゃ味気ないですからね。

一方で，脚注や参考ブロックに貼るリンク一覧までカード形式にしてしまうとそれはそれでごちゃごちゃした見た目になると思ったので，そこはハイパーテキストのままにしたい，みたいな感じで要件をClaudeに伝えた結果，一旦段落の構造で自動判定するという方式に落ち着きました。ざっくり言うと，「リンクだけの段落はカード形式で表示する」という仕様ですね。

ちなみに，OGPについてふんわりとしか理解していなかったんですが，あくまでサイトのメタ情報の書き方のお作法を定めたものであって，それを元にUIとして外部リンクをどう表示するかは各自で考えろって感じなんですね。

[OGP（オープングラフプロトコル）とは - IT用語辞典 e-Words](https://e-words.jp/w/OGP.html)

とはいえ人気の（？）機能なので，remark/rehypeであれば`remark-link-card`などのプラグインが既に作られているのですが，Sätteri版に関しては，remark/rehypeのプラグインを移植するコミュニティプロジェクト（[satteri-plugins](https://github.com/Ashish-CodeJourney/satteri-plugins)等）を探しても該当のものは見当たりませんでした。SätteriのプラグインAPIはremark/rehypeと互換性が無く，既存プラグインのコードをそのまま移植することもできないので，「無いものは作るしかない」という感じですね。

## 全体設計

段落構造を判定するプラグインを1つ書けばOGPカードが表示されるわけではありません。実際にはリンクカード機能は，次の3つの部品で構成されています。

1. `linkCardPlugin`（mdastPlugin）: ビルド時，対象段落をカードのHTMLに置き換える。キャッシュに無いURLはOGPメタデータをfetchし，結果をキャッシュに書き込む。取得に失敗しても例外は投げず，ドメイン名だけのフォールバックカードを描画する
2. JSONキャッシュ: 取得済みOGPメタデータの保存先。一度fetchしたURLは，次回以降のビルドではこのキャッシュを読むだけで済む
3. `astro.config.mjs`への登録: プラグインをSätteriのプロセッサに渡して初めて有効になる

キャッシュを挟んでいるのは，SSG（Static Site Generation）がデプロイの度に全記事を再ビルドする仕様だからです。過去記事のリンクまで毎回fetchし直していたら記事が増えるほどビルド時間が伸びていってしまうので，このような設計にしています。

以降ではまず①の判定ロジックにどのプラグイン種別を使うかを検討し，それから各部品の実装を見ていきます。

## Sätteriプラグインの種類

前回のおさらいですが，Sätteriは「パース・AST保持・変換・レンダリングまでをRustが担当し，プラグインだけをJS/TypeScriptで書く」という役割分担になっていて，そのプラグインには大きく2種類あるのでした。

- `mdastPlugin`: mdast（Markdown AST）のノードを対象にするプラグイン。段落・見出し・数式ノードなど，Markdown構文レベルの要素ごとにコールバック（ビジター）を登録する
- `hastPlugin`: hast（HTML AST）のノードを対象にするプラグイン。パース後にHTML要素へ変換された後の`<a>`や`<h2>`などにコールバックを登録する

それぞれ`defineMdastPlugin`/`defineHastPlugin`という関数を使って定義します。これらは型推論を効かせながらプラグインを定義するためのヘルパー関数です。

`defineMdastPlugin`には，mdastのノード種別ごとにキーを立てたオブジェクトを渡します。同じ形のコールバックを複数のノード種別に対して同時に登録できます。

```js
import { defineMdastPlugin } from "satteri";

const samplePlugin = defineMdastPlugin({
  name: "sample",
  paragraph(node, ctx) {
    // 段落ノードを見て判定・変換する
  },
  heading(node, ctx) {
    // 見出しノードを見て判定・変換する
  },
  link(node, ctx) {
    // リンクノードを見て判定・変換する
  },
  ...
});
```

`defineHastPlugin`も書き方はほぼ同じですが，`element`キーだけ形が違います。

```js
import { defineHastPlugin } from "satteri";

const sampleHastPlugin = defineHastPlugin({
  name: "sample-hast",
  element: {
    filter: ["a", "h2"], // このタグ名だけがRust側のフィルタを通ってvisitに渡ってくる
    visit(node, ctx) {
      // aタグ・h2タグのHTML要素を見て変換する
    },
  },
  text(node, ctx) {
    // テキストノードはelementと違い直接関数のまま
  },
  ...
});
```

`element`だけは直接の関数ではなく`{ filter, visit }`という形になっていて，`filter`に挙げたタグ名に一致する要素だけがRust側のフィルタを通ってJS側の`visit`に渡ってきます。`text`・`comment`等は`element`と違い直接関数のままです。

なお，Rust側のビジターがASTの走査を主導し，登録したノード種別のコールバックだけをJS側から呼び戻す仕組みについては，前回記事の「remark/rehypeとの違い」節をご参照ください。

さて，上で述べた通り，今回のリンクカード化で採用したのはmdastPluginの方だったわけですが，その選定理由について次節で見ていきます。

### mdast vs hast

ある段落が「単体リンクだけの段落か？」を判定するためには，「段落の子要素がリンク1つだけか」「その段落の親がrootかどうか」という情報が必要ですが，この判定ロジックを書くだけなら`mdastPlugin`でも`hastPlugin`でも特に変わりはありません。

判断が分かれるのは，「どちらの層で判定する方が，Sätteriの実装都合に振り回されずに済むか」という点です。脚注定義の例で見てみましょう。

```markdown
[^1]: [参考記事](https://example.com)
```

mdast（`markdownToMdast`で確認）は次の通りで，段落の子要素は`link`ひとつだけです。

```text
footnoteDefinition
  └ paragraph { children: [link] }
```

hast（`markdownToHtml`で確認）は次の通りです。Sätteriが脚注の戻りリンク（`↩`）を自動で追加するため，`<p>`の子要素は2つになります。

```html
<li>
  <p><a href="...">参考記事</a> <a href="#...">↩</a></p>
</li>
```

同じ入力なのに，mdastとhastで段落の子要素数が変わっています。この戻りリンクはMarkdownの構文（`footnoteDefinition`の中身）にはどこにも書かれておらず，mdast→hast変換の過程でSätteriが独自に足しているHTML構造です。

つまりhastの木には，元のMarkdown構文をそのまま反映した部分（段落・リンク）と，Sätteriのレンダリング判断で後から足された部分（戻りリンク，タイトなリストで省略される`<p>`など）が，区別なく同じ木の中に混在しています。今回のケースに関係ある「親が`root`かどうか」という判定自体はこの戻りリンクの有無に影響されず動きますが，hastPluginを書く側は「この構造はMarkdownの構文由来か，Sätteriが足したものか」を都度見極めながら判定条件を組む必要があり，見極めを誤るとSätteriのレンダリング実装にたまたま依存した判定になってしまいます。

一方mdastの木には，このようなレンダリング由来の構造は一切現れません。パースされたMarkdown構文をそのまま映した，最小限の構造だけがあります。今回の判定条件（段落・リンク・親子関係）は，そもそも「Markdownとしてどう書かれているか」という話であって「HTMLとしてどう描画されるか」という話ではありません。Sätteriのレンダリング実装が変わっても影響を受けないmdastの層で判定する方が安全，というのが，mdastPluginを選んだ理由です。

## 実装

### カード化対象の判定

それでは実装に入りましょう。前節で述べた通り，今回のプラグインで処理すべき`paragraph`の判定条件は2つです。

1. 段落の子要素が1つだけで，それが`link`ノードであること（且つ`link`の中身がHTTP(S)のURLであること）
2. その段落の直接の親がmdastの`root`ノードであること

具体的な例で見てみます。

```markdown
https://example.com
```

→ `paragraph { children: [link] }`，親は`root`。
条件1・条件2をどちらも満たすので，カード化の対象になる

```markdown
詳しくは[この記事](https://example.com)を参照。
```

→ `paragraph { children: [text, link, text] }`（子要素が3つ）。
条件1を満たさないので対象外

```markdown
- [参考記事](https://example.com)
```

→ `list → listItem → paragraph { children: [link] }`。
段落の子は1つで`link`だが，親は`listItem`。条件1は満たすが条件2を満たさないので対象外

なんとなくどうやって判定すれば良いかわかりますね。実際の判定ロジックは以下の通りです。

```js
function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function findCardUrl(node, ctx) {
  // 子要素が1つでなければ対象外（条件1の前半：文中インラインリンクなどを除外）
  if (node.children?.length !== 1) return null;

  const child = node.children[0];

  // 唯一の子要素がlinkノードでない，またはhttp/https以外のURLなら対象外
  // （条件1の後半＋isHttpUrlガード：「mailto:」等のカード化を防ぐ）
  if (child.type !== "link" || !isHttpUrl(child.url)) return null;

  // 段落の親がroot（本文直下）でなければ対象外
  // （条件2：箇条書き・脚注定義などネストした段落を除外）
  if (ctx.parent(node)?.type !== "root") return null;

  return child.url;
}
```

条件1・条件2に加えて，`isHttpUrl`によるガードが入っています。段落の子要素がリンク1つだけでも，そのURLが`mailto:`や`#toc`のようなページ内アンカーだと，OGPメタデータの取得しようがない壊れたカードになってしまうため，http/https以外のURLは最初から対象外にしています。

ちなみに`findCardUrl`を`paragraph`ビジターの中に埋め込まず独立した関数として切り出しているのは，別スクリプトからも判定ロジック単体で参照したいという個別の事情のためです。

### キャッシュ参照・新規取得

さて，判定が通ったら`ensureCardMeta()`でキャッシュを確認し，キャッシュに無ければ新たにfetchを行います。

```js
let cache = null;

function getCache() {
  if (cache === null) {
    try {
      cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    } catch {
      cache = {};
    }
  }
  return cache;
}

function flushCache() {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
}

// 同じURLへの重複fetchを防ぐため，取得中のPromiseを共有する
const pendingFetches = new Map();

async function ensureCardMeta(url) {
  const cache = getCache();
  if (cache[url]) return; // キャッシュ済みなら何もしない

  let promise = pendingFetches.get(url);
  if (!promise) {
    promise = fetchMeta(url) // HTMLをfetchしてog:title等を抽出する関数（詳細は割愛）
      .then((meta) => {
        cache[url] = meta;
        flushCache();
      })
      .catch((err) => {
        console.warn(`fetch failed, rendering fallback: ${url} — ${err.message}`);
      })
      .finally(() => pendingFetches.delete(url));
    pendingFetches.set(url, promise);
  }
  await promise;
}
```

（`fetchMeta`の中身については，後述するog:imageのCross-Origin-Resource-Policyチェックを除けば，`open-graph-scraper`や`metascraper`のような既存のOGP抽出ライブラリと基本的に同じであるため解説は割愛します）
#### キャッシュ構造

ここで`cache`に格納・永続化される中身，つまり`link-cards.json`の実際の構造を示しておきます。URLをキーにしたフラットなオブジェクトで，値は`fetchMeta`が返す`{ title, description, image }`です。実際のキャッシュファイルから1件抜粋すると，次のようになっています。

```json
{
  "https://astro.build/blog/astro-7/": {
    "title": "Astro 7.0 | Astro",
    "description": "Astro 7.0 brings faster builds with Vite 8, a new Rust compiler, Advanced Routing, background dev server support, and structured logging.",
    "image": "https://astro.build/_astro/og-astro-7.BAGlEZn4.jpg"
  }
}
```

`title`・`description`・`image`はいずれも，取得先のページに対応するOGPタグ（`title`は`<title>`タグへのフォールバック込み）が無ければ`null`になります。後述の`renderCardHtml`側で`meta?.title`のようにoptional chainingで受けているのはこのためです。

#### 重複防止の仕組み

`pendingFetches`は，同じURLへの重複fetch防止です。具体的には，

- 同じページ内で複数のvisitorが並行実行される
- 記事をまたいで，Astroのcontent layerが複数の記事ファイル自体を並行に同期する（`glob()`ローダーのソースコードを確認したところ，`Promise.all`と同時実行数の制限で複数ファイルを処理していました）

場合を想定しています。

`Map`から取り出す処理と書き込む処理の間に`await`を挟まない一続きの同期処理にすることで，複数のvisitorがほぼ同時にこの判定に来ても，2回目以降は1回目が返すPromiseを待つだけになります。

### カードのHTML生成

最後にカードのHTMLを組み立てて段落を置換します。

```js
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// 自サイト（SITE_ORIGIN）へのカードは同タブ遷移のままにしたいので，
// target/rel属性はオリジンが自サイトと異なる場合だけ付与する。
function isExternalUrl(url) {
  try {
    return new URL(url).origin !== SITE_ORIGIN;
  } catch {
    return false;
  }
}

export function renderCardHtml(url, cache, fallbackText = "") {
  // ensureCardMetaが書き込んだ{ title, description, image }をキャッシュから取り出す
  // fetch失敗時はundefined
  const meta = cache[url];
  
  // OGPが取れなくても常に出せるようurlから直接計算する
  const domain = domainOf(url);
  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
  
  // metaがundefinedだったりOGPタグが無い場合はフォールバック
  // meta（OGP）・fallbackText（リンクの表示テキスト）の順に採用し，
  // どちらも無ければドメイン名にフォールバックする
  const title = meta?.title || fallbackText || domain;
  const description = meta?.description || "";
  // imageは画像URLが相対パスだったりした場合に備えてisHttpUrl判定を追加
  const image = meta?.image && isHttpUrl(meta.image) ? meta.image : null;
  const linkAttrs = isExternalUrl(url) ? ` target="_blank"` : "";

  // 外側のdivはTailwindのprose用CSSの打ち消し・余白調整のためのスタイリング目的
  return `<div class="not-prose my-1"><a href="${escapeHtml(url)}"${linkAttrs} class="card sm:card-side bg-base-200 hover:shadow-lg transition-shadow overflow-hidden no-underline">${
    image
      ? `<figure class="sm:w-40 shrink-0 bg-base-300"><img src="${escapeHtml(image)}" alt="" class="w-full h-full object-cover" loading="lazy" /></figure>`
      : ""
  }<div class="card-body p-4 gap-1"><p class="card-title text-base m-0">${escapeHtml(title)}</p>${
    description
      ? `<p class="text-sm text-base-content/70 line-clamp-2 max-h-10 m-0">${escapeHtml(description)}</p>`
      : ""
  }<p class="text-xs text-base-content/50 flex items-center gap-1 m-0 mt-1"><img src="${escapeHtml(favicon)}" alt="" width="14" height="14" class="inline-block rounded-sm" />${escapeHtml(domain)}</p></div></a></div>`;
}
```

#### 表示するタイトルの決め方

カードの`title`は，「OGPのtitle → リンクの表示テキスト → ドメイン名」という優先順位で決めています。OGPの取得は`fetchMeta`がネットワーク越しに行う以上，サイト側の一時的な障害やレート制限で失敗することがあります。とはいえ，外部リンクを書く時は基本的にURLベタ貼りではなく

```
[Google Favicon API Documentation - Logo.dev](https://www.logo.dev/docs/google-favicon-api)
```

のようにタイトルを付けるようにしているので，OGP取得に失敗した場合の次善の情報源としてこれを使い，ドメイン名だけの表示は両方とも無い場合の最後の手段として一応置いています。

`link`ノードの表示テキストを取り出すヘルパー関数では，`children`配下に強調などの文字装飾が挟まっている場合もあるため，再帰的に`text`ノードを辿って連結しています。取り出したテキストが`linkNode.url`自体と同じ場合（＝著者が意味のある表示テキストを与えていないベタ書きリンク）は，titleとして採用する価値が無いため空文字を返し，ドメイン名へのフォールバックに委ねます。

```js
function linkNodeText(linkNode) {
  const parts = [];
  const walk = (n) => {
    if (n.type === "text") parts.push(n.value);
    else n.children?.forEach(walk);
  };
  linkNode.children.forEach(walk);
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return text !== linkNode.url ? text : "";
}
```

#### favicon取得方法

 `favicon`の取得は，Googleの非公式エンドポイントに投げています。愚直にやろうとすると`<link rel="icon">`や`/favicon.ico`など置き場所・形式がサイトごとにバラバラなfaviconの検出・PNG変換・見つからない場合のフォールバック画像出しを全部自前で実装する羽目になるので。非公式ゆえ，突然提供が終了するリスクは引き受ける必要がありますが。

[Google Favicon API Documentation - Logo.dev](https://www.logo.dev/docs/google-favicon-api)

最後の`return`で，ここまでに用意した値を埋め込んでカード全体のHTML文字列を組み立てます。`image`と`description`はそれぞれ三項演算子で「値があればその要素のHTMLを埋め込み，無ければ空文字」という分岐になっており，画像や説明文が無いOGPでもレイアウトが崩れないようにしています。また，値を埋め込む箇所はすべて`escapeHtml()`を通しています。`title`・`description`はOGPタグとして外部サイトが自由に設定できる値なので，エスケープを怠るとXSSの入口になります。

#### HTML要素: アンカー

`<a>`については，「内部リンクは同タブ，外部リンクは新規タブ」という設計にしているため，`isExternalUrl`で`SITE_ORIGIN`をチェックをし，外部サイトの場合だけ`target="_blank"`を付与するようにしています。

:::newbie
`<a>`要素の`target`属性は，リンク先のURLを表示する場所（タブ／ウィンドウ／`<iframe>`といった閲覧コンテキスト）を指定するためのものです。デフォルトは`_self`（現在の閲覧コンテキスト）で，例えばiframeの名前を指定することで特定のiframeで表示したりも出来るようです。

[HTML <a> アンカー要素 - HTML | MDN](https://developer.mozilla.org/ja/docs/Web/HTML/Reference/Elements/a#target)
:::

`target="_blank"`について調べると，「`target="_blank"`をセットする場合は`rel="noopener"`を付けるのがマスト」みたいな記事がよくヒットしますが，ここでは特に指定していません。

:::newbie
`rel`属性は「リンク先のリソースと現在の文書との関係を定義」するためのものです。といってもただの「参考情報」ではなく，リンク先に何を渡す／渡さないを表すパラメータとしても機能しています。

[HTML rel 属性 - HTML | MDN](https://developer.mozilla.org/ja/docs/Web/HTML/Reference/Attributes/rel)
:::

`noopener`とは，新規で開いた閲覧コンテキスト（ここでは新規タブ）で`Window.opener`を`null`にする，つまりリンク元の閲覧コンテキストで開くURLを書き換えられないようにするための設定です。以前は`target="_blank"`をセットする場合は`noopener`を付けるのがマストで，これがないと悪意あるサイトのリンクをうっかり新規タブで開いてしまった時に，元のタブでフィッシングサイトなどが開かれてしまうリスク（アダルトサイトとかで見る）がありましたが，現在は`rel=opener`を付けない限り`Window.opener=null`になるのがデフォルトになっているので，わざわざ古いバージョンのブラウザを使っている閲覧者のことまで考慮する必要もないかなと思い，`rel`なしという選択をしました。

[rel="noopener" - HTML | MDN](https://developer.mozilla.org/ja/docs/Web/HTML/Reference/Attributes/rel/noopener)

#### HTML要素: Tailwind関連

全部説明しているとキリがないので，調整が必要だったところだけ説明する形にさせていただきます。

1. 外側の`<div>`の余白は`my-1`にしています。最初は`my-6`にしてたんですが，前の段落との距離が遠いと関連性が薄れてしまう感じがしたので詰めました。

:::gallery

![外側divの余白がmy-6の場合の表示](/uploads/astro-satteri-plugin-link-card/02-margin-my-6.png "my-6（変更前）")

![外側divの余白がmy-1の場合の表示](/uploads/astro-satteri-plugin-link-card/01-margin-my-1.png "my-1（変更後）")

:::

:::newbie
`my-1`の「my」は「margin y」の略です。margin-topとmargin-bottom（縦方向のmargin）をまとめて指定するTailwindの記法になっています。

[margin - Spacing - Tailwind CSS](https://tailwindcss.com/docs/margin#adding-vertical-margin)
:::

2. サイト説明文の`<p>`要素は，2行目以降を省略するため`line-clamp-2`を付けているんですが，CSS Grid内でこの`<p>`の高さが変わることによって省略されるはずの3行目が見切れてしまう問題が発生したため，`max-h-10`を付けて`<p>`の高さを固定することで解決しました。

:::gallery{columns=1}

![max-h-10を付ける前の表示。3行目が見切れている](/uploads/astro-satteri-plugin-link-card/03-line-clamp-before.png "修正前：3行目が見切れている")

![max-h-10を付けた後の表示。2行で綺麗に省略されている](/uploads/astro-satteri-plugin-link-card/04-line-clamp-after.png "修正後：2行で綺麗に省略される")

:::

### プラグイン定義

以上をまとめて，プラグインの定義は以下のようになっています。

```js
export const linkCardPlugin = defineMdastPlugin({
  name: "link-card",
  async paragraph(node, ctx) {
    const url = findCardUrl(node, ctx);
    if (!url) return;

    // findCardUrlがnull以外を返した時点でchildren[0]がlinkノードであることは保証済み
    const fallbackText = linkNodeText(node.children[0]);

    await ensureCardMeta(url);
    ctx.replaceNode(node, {
      type: "html",
      value: renderCardHtml(url, getCache(), fallbackText),
    });
  },
});
```

`ctx.replaceNode`の第二引数に渡せる置換先には，`{ rawHtml: string }`（Markdown/HTML文字列として与え，Sätteri内部のRust側パーサーで再パースされる）と`{ type: "html", value: string }`（mdastの`Html`リテラルノードとしてツリーにそのまま挿入され，再パースを経ない）の2種類があり，ここでは`rawHtml`ではなく`{ type: "html", value }`を使っています。

段落まるごと置換する今回のようなブロック位置では，実は両者の出力に違いはありません。差が出るのは，文中の一部だけを置換するインライン位置で，そちらでは`rawHtml`が`<p>`が二重に入れ子になった不正なHTMLを出力してしまうケースがあります。今回のカードは常にブロック位置での置換なので実害はありませんでしたが，挙動として安全な`{ type: "html", value }`を採用しました。両者の挙動差の検証結果は別記事にまとめる予定です。

### `astro.config.mjs`への登録

「全体設計」の③で触れた登録部分の実際のコードがこちらです。

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import { linkCardPlugin } from "./src/lib/link-cards.mjs";

export default defineConfig({
  markdown: {
    processor: satteri({
      mdastPlugins: [linkCardPlugin],
    }),
  },
});
```

`mdastPlugin`は`mdastPlugins`配列に，`hastPlugin`は`hastPlugins`配列に渡します。「プラグインの種類」節で見た2種類の区別は，ここでも登録先の配列という形でそのまま現れます。

## 実装で躓いたポイント

### `og:image`がCross-Origin-Resource-Policyでブラウザ側から読み込めない

ある外部サイトのog:image画像を使ったカードで，サムネイルが壊れたアイコンとして表示される事象が発生しました。

原因は，そのサイトの画像レスポンスに`Cross-Origin-Resource-Policy: same-origin`ヘッダーが付いていたことです。ブラウザは別オリジンの`<img>`からこのヘッダーが付いた画像を読み込むことを拒否するため，別オリジンであるこのブログに埋め込むと画像だけが読み込めずに壊れます。

厄介なのは，Node.jsの`fetch()`（や`curl`）はCORPを一切評価しないという点です。事前のOGP取得時点ではHTTP 200で正常に取得できてしまうため，このチェックが無いとビルドは何のエラーも出さず，実際にブラウザでページを開いて初めて気付くことになります。

対処として，og:image取得後にそのURL自体へHEADリクエストを送り（405が返る場合はGETにフォールバック），レスポンスの`Cross-Origin-Resource-Policy`ヘッダーが`same-origin`または`same-site`なら，画像を採用せずドメイン名のみのフォールバック表示に倒すようにしています。実装は以下の通りです。

```js
async function isImageEmbeddable(imageUrl) {
  // 自サイトのOGPの場合は即座にtrueを返す
  if (new URL(imageUrl).origin === SITE_ORIGIN) return true;

  let res = await fetch(imageUrl, { method: "HEAD" });
  if (!res.ok && res.status !== 405) return true;
  if (res.status === 405) {
    res = await fetch(imageUrl); // HEAD非対応サイト向けのフォールバック
  }
  const corp = (res.headers.get("cross-origin-resource-policy") || "").toLowerCase();
  return corp !== "same-origin" && corp !== "same-site";
}
```

## まとめ

Sätteriのプラグインの作り方がなんとなくわかったかと思います。簡単そうに見えて奥が深いですね。読んでいただいた方の参考になれば幸いです。それでは。

## 参考

- [satteri (GitHub)](https://github.com/bruits/satteri)
- [@astrojs/markdown-satteri (GitHub)](https://github.com/withastro/astro/tree/main/packages/markdown/satteri)
- [satteri-plugins (GitHub)](https://github.com/Ashish-CodeJourney/satteri-plugins)
