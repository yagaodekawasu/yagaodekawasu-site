import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "satteri";
import { glossaryPlugin } from "./glossary.mjs";
import { GLOSSARY } from "../data/glossary.mjs";

function render(source) {
  return markdownToHtml(source, {
    mdastPlugins: [glossaryPlugin],
    features: { directive: true },
  });
}

function countOf(html, needle) {
  return html.split(needle).length - 1;
}

test("登録済みの用語はpopoverを開くボタンになり，解説が末尾に出力される", async () => {
  const { html } = await render(":gloss[OGP]{term=ogp} の話。");

  assert.match(
    html,
    /<button type="button" popovertarget="gloss-ogp" class="gloss-term">/,
  );
  assert.match(html, /<span class="gloss-label">OGP<\/span>/);
  assert.match(html, /<span class="gloss-hint" aria-hidden="true">\?<\/span>/);
  assert.match(html, /<div id="gloss-ogp" popover="" class="gloss-balloon">/);
});

test("同じ用語を複数回使ってもpopoverは1つしか出力されない", async () => {
  const { html } = await render(
    ":gloss[OGP]{term=ogp} と :gloss[こちらもOGP]{term=ogp} 。",
  );

  assert.equal(countOf(html, 'popovertarget="gloss-ogp"'), 2);
  assert.equal(countOf(html, 'id="gloss-ogp"'), 1);
});

test("使われていない用語の解説は出力されない", async () => {
  const { html } = await render(":gloss[OGP]{term=ogp} だけ使う。");

  assert.equal(countOf(html, 'id="gloss-mdast"'), 0);
});

test("表示テキストを省略すると辞書のlabelが使われる", async () => {
  const { html } = await render(":gloss{term=mdast} と書く。");

  assert.match(
    html,
    new RegExp(`<span class="gloss-label">${GLOSSARY.mdast.label}</span>`),
  );
});

test("解説はMarkdownとして解釈され，複数段落・inline code・リンクが使える", async () => {
  const { html } = await render(":gloss{term=ogp}");

  const balloon = html.slice(html.indexOf('<div id="gloss-ogp"'));
  assert.ok(countOf(balloon, "<p>") >= 2, "複数段落が出力されること");
  assert.match(balloon, /<code>/);
  assert.match(balloon, /<a href="https:\/\/ogp\.me\/">/);
  // 辞書側にHTMLを直接書かない方針なので，エスケープされた生HTMLが混ざらないこと。
  assert.doesNotMatch(balloon, /&lt;div/);
});

test("用語IDの大文字小文字・前後の空白は無視して照合する", async () => {
  const { html } = await render(":gloss[OGP]{term=OGP} と :gloss[別表記]{term=Ogp} 。");

  assert.equal(countOf(html, 'popovertarget="gloss-ogp"'), 2);
  assert.equal(countOf(html, 'id="gloss-ogp"'), 1);
});

test("辞書に無い用語は表示テキストだけを残して素通しする", async () => {
  const { html } = await render(
    ":gloss[謎の用語]{term=nonexistent} と :gloss[属性なし] 。",
  );

  assert.match(html, /<span>謎の用語<\/span>/);
  assert.match(html, /<span>属性なし<\/span>/);
  assert.equal(countOf(html, "gloss-balloon"), 0);
});

test("使用済み用語が別の記事に持ち越されない", async () => {
  const first = await render(":gloss{term=ogp}");
  const second = await render(":gloss{term=mdast}");

  assert.equal(countOf(first.html, 'id="gloss-ogp"'), 1);
  assert.equal(countOf(second.html, 'id="gloss-ogp"'), 0);
  assert.equal(countOf(second.html, 'id="gloss-mdast"'), 1);
});

test("用語IDはHTMLのid属性にそのまま使うため，英小文字・数字・ハイフンに限る", () => {
  for (const term of Object.keys(GLOSSARY)) {
    assert.match(term, /^[a-z0-9-]+$/, `用語ID「${term}」が命名規則に反している`);
  }
});
