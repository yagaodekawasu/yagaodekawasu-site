const USER_AGENT = "Mozilla/5.0 (compatible; yagaodekawasu-link-card-fetcher/1.0)";

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function extractMeta(html, url) {
  const getMeta = (prop) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`,
      "i",
    );
    const match = html.match(re) || html.match(new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`,
      "i",
    ));
    return match ? decodeEntities(match[1]) : null;
  };

  const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  let image = getMeta("og:image");
  if (image) {
    try {
      image = new URL(image, url).href;
    } catch {
      image = null;
    }
  }

  return {
    title: getMeta("og:title") || (titleTagMatch ? decodeEntities(titleTagMatch[1].trim()) : null),
    description: getMeta("og:description") || getMeta("description"),
    image,
  };
}

function detectCharset(buffer, contentType) {
  const headerMatch = /charset=([^;]+)/i.exec(contentType || "");
  if (headerMatch) return headerMatch[1].trim().toLowerCase();

  const ascii = Buffer.from(buffer.slice(0, 2048)).toString("latin1");
  const metaMatch =
    /<meta[^>]+charset=["']?([^"'\s/>]+)/i.exec(ascii) ||
    /<meta[^>]+content=["'][^"']*charset=([^"'\s;]+)/i.exec(ascii);
  if (metaMatch) return metaMatch[1].trim().toLowerCase();

  return "utf-8";
}

// astro.config.mjsのsiteと一致させる。自サイトの画像はブラウザ側で常に同一オリジンでの
// 読み込みになるため，CORPヘッダーの値に関わらず埋め込み可能（same-originのリクエストは
// CORPで弾かれない）。将来自サイトにCORPヘッダーを付けても誤って弾かれないよう，ここで早期に判定する。
const SITE_ORIGIN = "https://yagaodekawasu.com";

// Cross-Origin-Resource-Policyがsame-origin/same-siteだと，このブログ（別オリジン・別サイト）の
// <img>からは画像を読み込めずブラウザ上で壊れて見える。curlや素のfetch()はこの制限を評価しない
// ためHTTP 200で取得できてしまい，事前フェッチ時には気づけない。og:imageのURL自体に軽くリクエストを
// 送りヘッダーを見ることで，埋め込み不可な画像を採用時点で弾く。
export async function isImageEmbeddable(imageUrl) {
  try {
    if (new URL(imageUrl).origin === SITE_ORIGIN) return true;

    let res = await fetch(imageUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok && res.status !== 405) return true;
    if (res.status === 405) {
      res = await fetch(imageUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": USER_AGENT },
      });
    }
    const corp = (res.headers.get("cross-origin-resource-policy") || "").toLowerCase();
    return corp !== "same-origin" && corp !== "same-site";
  } catch {
    return true;
  }
}

export async function fetchMeta(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const charset = detectCharset(buffer, res.headers.get("content-type"));
  let html;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    html = new TextDecoder("utf-8").decode(buffer);
  }
  const meta = extractMeta(html, url);
  if (meta.image && !(await isImageEmbeddable(meta.image))) {
    console.warn(`  image blocked by CORP, dropping: ${meta.image}`);
    meta.image = null;
  }
  return meta;
}
