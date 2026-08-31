import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { markdownToHtml, defineMdastPlugin } from "satteri";
import { createLinkCardPlugin, domainOf, findParagraphCardUrls } from "./link-cards.mjs";
import { SITE_ORIGIN } from "./ogp-fetch.mjs";

// ネットワークに一切触れないはずの経路で万一fetchが試みられた場合に，
// 実サーバーへの誤アクセスやタイムアウト待ちを避けるため，即座に接続拒否される
// unroutableなポートをダミーURLとして使う。
const UNROUTABLE_URL = "http://127.0.0.1:1/unused";

function withTempCacheDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "link-cards-test-"));
  const cachePath = join(dir, "link-cards.json");
  return Promise.resolve()
    .then(() => fn(cachePath))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}

function withMockServer(handler, fn) {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    server.listen(0, () => resolve());
  })
    .then(() => {
      const port = server.address().port;
      return fn(`http://localhost:${port}`);
    })
    .finally(() => new Promise((resolve) => server.close(resolve)));
}

test("cache-hit: キャッシュ済みなら実際にfetchせずレンダリングされる", async () => {
  await withTempCacheDir(async (cachePath) => {
    writeFileSync(
      cachePath,
      JSON.stringify({
        [UNROUTABLE_URL]: {
          title: "キャッシュ済みタイトル",
          description: "キャッシュ済み説明文",
          image: "https://example.com/img.png",
        },
      }),
    );

    const plugin = createLinkCardPlugin({ cachePath });
    const { html } = await markdownToHtml(UNROUTABLE_URL, { mdastPlugins: [plugin] });

    assert.match(html, /card sm:card-side/);
    assert.match(html, /キャッシュ済みタイトル/);
    assert.match(html, /キャッシュ済み説明文/);
  });
});

test("cache-miss: fetchしてキャッシュファイルに書き込み，結果をレンダリングする", async () => {
  await withTempCacheDir(async (cachePath) => {
    writeFileSync(cachePath, "{}");
    let hitCount = 0;

    await withMockServer(
      (req, res) => {
        hitCount++;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<html><head><meta property="og:title" content="取得したタイトル" /></head><body></body></html>`,
        );
      },
      async (origin) => {
        const url = `${origin}/page`;
        const plugin = createLinkCardPlugin({ cachePath });
        const { html } = await markdownToHtml(url, { mdastPlugins: [plugin] });

        assert.equal(hitCount, 1);
        assert.match(html, /取得したタイトル/);

        const saved = JSON.parse(readFileSync(cachePath, "utf-8"));
        assert.equal(saved[url].title, "取得したタイトル");
      },
    );
  });
});

test("重複fetch防止: 同一URLが1文書内に複数回出現してもfetchは1回だけ", async () => {
  await withTempCacheDir(async (cachePath) => {
    writeFileSync(cachePath, "{}");
    let hitCount = 0;

    await withMockServer(
      (req, res) => {
        hitCount++;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<html><head><meta property="og:title" content="重複テストタイトル" /></head><body></body></html>`,
        );
      },
      async (origin) => {
        const url = `${origin}/same-page`;
        const plugin = createLinkCardPlugin({ cachePath });
        // 空行区切りの2段落として同一URLを2回出す(元の手動検証スクリプトと同じ構成)。
        const md = `${url}\n\n${url}`;
        const { html } = await markdownToHtml(md, { mdastPlugins: [plugin] });

        assert.equal(hitCount, 1);
        const occurrences = html.match(/重複テストタイトル/g) || [];
        assert.equal(occurrences.length, 2);
      },
    );
  });
});

test("fetch失敗時: フォールバック(ドメイン名のみ)を描画し，キャッシュを汚染しない", async () => {
  await withTempCacheDir(async (cachePath) => {
    writeFileSync(cachePath, "{}");

    await withMockServer(
      (req, res) => {
        res.writeHead(500);
        res.end("internal error");
      },
      async (origin) => {
        const url = `${origin}/fail`;
        const plugin = createLinkCardPlugin({ cachePath });
        const { html } = await markdownToHtml(url, { mdastPlugins: [plugin] });

        assert.match(html, /card sm:card-side/);
        assert.match(html, new RegExp(domainOf(url)));

        const saved = JSON.parse(readFileSync(cachePath, "utf-8"));
        assert.deepEqual(saved, {});
      },
    );
  });
});

test("fetch失敗時: リンクにカスタム表示テキストがあればドメイン名より優先してtitleに使う", async () => {
  await withTempCacheDir(async (cachePath) => {
    writeFileSync(cachePath, "{}");

    await withMockServer(
      (req, res) => {
        res.writeHead(429);
        res.end("rate limited");
      },
      async (origin) => {
        const url = `${origin}/docs/google-favicon-api`;
        const plugin = createLinkCardPlugin({ cachePath });
        const md = `[Google Favicon API Documentation - Logo.dev](${url})`;
        const { html } = await markdownToHtml(md, { mdastPlugins: [plugin] });

        assert.match(html, /<p class="card-title[^"]*">Google Favicon API Documentation - Logo\.dev<\/p>/);

        const saved = JSON.parse(readFileSync(cachePath, "utf-8"));
        assert.deepEqual(saved, {});
      },
    );
  });
});

test("複数行段落: 改行区切りの行の一部だけがURL単独行でも正しく分割・描画される", async () => {
  await withTempCacheDir(async (cachePath) => {
    writeFileSync(
      cachePath,
      JSON.stringify({
        [UNROUTABLE_URL]: {
          title: "行内キャッシュタイトル",
          description: null,
          image: null,
        },
      }),
    );

    const plugin = createLinkCardPlugin({ cachePath });
    const md = `${UNROUTABLE_URL}\n通常のテキスト行`;
    const { html } = await markdownToHtml(md, { mdastPlugins: [plugin] });

    assert.match(html, /card sm:card-side/);
    assert.match(html, /行内キャッシュタイトル/);
    assert.match(html, /通常のテキスト行/);
  });
});

test("対象外の段落: インラインリンクやhttp(s)以外のリンク単体はカード化されない", async () => {
  await withTempCacheDir(async (cachePath) => {
    writeFileSync(cachePath, "{}");
    const plugin = createLinkCardPlugin({ cachePath });

    const inline = await markdownToHtml(
      `詳しくは[こちら](${UNROUTABLE_URL})を参照してください。`,
      { mdastPlugins: [plugin] },
    );
    assert.doesNotMatch(inline.html, /card sm:card-side/);

    const mailto = await markdownToHtml("[連絡先](mailto:test@example.com)", {
      mdastPlugins: [plugin],
    });
    assert.doesNotMatch(mailto.html, /card sm:card-side/);
  });
});

test("ルート相対リンク: 単独行なら自サイトのカードになり，targetは付かない", async () => {
  await withTempCacheDir(async (cachePath) => {
    const absolute = `${SITE_ORIGIN}/blog/xxx/`;
    writeFileSync(
      cachePath,
      JSON.stringify({
        [absolute]: { title: "自サイト記事タイトル", description: null, image: null },
      }),
    );

    const plugin = createLinkCardPlugin({ cachePath });
    const { html } = await markdownToHtml("[過去記事](/blog/xxx/)", { mdastPlugins: [plugin] });

    assert.match(html, /card sm:card-side/);
    assert.match(html, /自サイト記事タイトル/);
    // キャッシュキーもhrefも絶対URLに正規化される（キャッシュヒットしている＝fetchは走っていない）
    assert.ok(html.includes(`href="${absolute}"`), `absolute hrefが出力されていない: ${html}`);
    // 自サイトなので同タブ遷移のまま
    assert.doesNotMatch(html, /target="_blank"/);
  });
});

test("対象外の相対参照: インラインの相対リンク・ページ内アンカー・プロトコル相対はカード化されない", async () => {
  await withTempCacheDir(async (cachePath) => {
    writeFileSync(cachePath, "{}");
    const plugin = createLinkCardPlugin({ cachePath });

    const inline = await markdownToHtml("詳しくは[こちら](/blog/xxx/)を参照してください。", {
      mdastPlugins: [plugin],
    });
    assert.doesNotMatch(inline.html, /card sm:card-side/);

    // new URL()はベースを渡すと"#..."も解決してしまうため，"/"始まりに限定できているかの回帰テスト。
    const anchor = await markdownToHtml("[脚注に戻る](#user-content-fn-1)", {
      mdastPlugins: [plugin],
    });
    assert.doesNotMatch(anchor.html, /card sm:card-side/);

    // "//"始まりは別サイトを指しうるので，自サイトのルート相対パスとして扱わない。
    const protocolRelative = await markdownToHtml("[プロトコル相対](//example.com/foo)", {
      mdastPlugins: [plugin],
    });
    assert.doesNotMatch(protocolRelative.html, /card sm:card-side/);
  });
});

test("findParagraphCardUrls: ルート相対パスを絶対URLに正規化して返す（事前取得スクリプトの前提）", async () => {
  const urls = [];
  const collector = defineMdastPlugin({
    name: "test-card-url-collector",
    paragraph(node, ctx) {
      urls.push(...findParagraphCardUrls(node, ctx));
    },
  });

  await markdownToHtml("[過去記事](/blog/xxx/)\n\nhttps://example.com/foo", {
    mdastPlugins: [collector],
  });

  assert.deepEqual(urls, [`${SITE_ORIGIN}/blog/xxx/`, "https://example.com/foo"]);
});
