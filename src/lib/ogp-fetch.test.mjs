import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetchMeta, isImageEmbeddable } from "./ogp-fetch.mjs";

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

test("isImageEmbeddable: 自サイト(SITE_ORIGIN)の画像はネットワークリクエストを行わずに常に埋め込み可能と判定される", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("自サイトの画像なのにfetchが呼ばれた");
  };
  try {
    const result = await isImageEmbeddable("https://yagaodekawasu.com/uploads/example.png");
    assert.equal(result, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("isImageEmbeddable: CORPヘッダーがsame-originの外部画像は埋め込み不可と判定される", async () => {
  await withMockServer(
    (req, res) => {
      res.writeHead(200, { "Cross-Origin-Resource-Policy": "same-origin" });
      res.end();
    },
    async (origin) => {
      const result = await isImageEmbeddable(`${origin}/image.png`);
      assert.equal(result, false);
    },
  );
});

test("isImageEmbeddable: CORPヘッダーがsame-siteの外部画像も埋め込み不可と判定される", async () => {
  await withMockServer(
    (req, res) => {
      res.writeHead(200, { "Cross-Origin-Resource-Policy": "same-site" });
      res.end();
    },
    async (origin) => {
      const result = await isImageEmbeddable(`${origin}/image.png`);
      assert.equal(result, false);
    },
  );
});

test("isImageEmbeddable: CORPヘッダーが無い外部画像は埋め込み可能と判定される", async () => {
  await withMockServer(
    (req, res) => {
      res.writeHead(200, {});
      res.end();
    },
    async (origin) => {
      const result = await isImageEmbeddable(`${origin}/image.png`);
      assert.equal(result, true);
    },
  );
});

test("isImageEmbeddable: HEAD非対応(405)サイトはGETにフォールバックしてCORPを確認する", async () => {
  await withMockServer(
    (req, res) => {
      if (req.method === "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      res.writeHead(200, { "Cross-Origin-Resource-Policy": "same-origin" });
      res.end();
    },
    async (origin) => {
      const result = await isImageEmbeddable(`${origin}/image.png`);
      assert.equal(result, false);
    },
  );
});

test("fetchMeta: CORPでsame-originの外部og:image画像はimageから除外される", async () => {
  await withMockServer(
    (req, res) => {
      if (req.url === "/image.png") {
        res.writeHead(200, { "Cross-Origin-Resource-Policy": "same-origin" });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<html><head><meta property="og:title" content="外部記事" /><meta property="og:image" content="/image.png" /></head><body></body></html>`,
      );
    },
    async (origin) => {
      const meta = await fetchMeta(`${origin}/page`);
      assert.equal(meta.title, "外部記事");
      assert.equal(meta.image, null);
    },
  );
});

test("fetchMeta: 自サイトのog:image画像はCORPチェックをスキップしてimageに採用される", async () => {
  await withMockServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<html><head><meta property="og:title" content="自サイト記事" /><meta property="og:image" content="https://yagaodekawasu.com/uploads/example-ogp.png" /></head><body></body></html>`,
      );
    },
    async (origin) => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const requestUrl = typeof input === "string" ? input : input.url;
        if (requestUrl.startsWith("https://yagaodekawasu.com")) {
          throw new Error(`自サイトの画像なのに実際に外部へfetchしようとした: ${requestUrl}`);
        }
        return originalFetch(input, init);
      };
      try {
        const meta = await fetchMeta(`${origin}/self-referencing-post`);
        assert.equal(meta.image, "https://yagaodekawasu.com/uploads/example-ogp.png");
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});
