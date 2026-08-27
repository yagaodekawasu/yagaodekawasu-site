import { execFileSync } from "node:child_process";

// 記事frontmatterの手書きupdatedDateに代わり，該当Markdownファイルの最終コミット日時を
// 「更新日」として使う。filePathはAstroのglob loaderが付与するプロジェクトルート相対パス
// （entry.filePath，例: "src/content/blog/foo.md"）を想定する。Vite SSR経由でimport.meta.url
// から自前でパスを組み立てると変換後の解決先がずれることがあるため，Astro側が計算済みの
// パスをそのまま使う。git履歴が取れない環境（shallow clone等）でもビルドを壊さないよう，
// 失敗時はnullを返し呼び出し側でpubDateのみの表示にフォールバックさせる。
export function getGitLastModified(filePath) {
  try {
    const output = execFileSync(
      "git",
      ["log", "-1", "--format=%aI", "--", filePath],
      { cwd: process.cwd(), encoding: "utf-8" },
    ).trim();
    return output ? new Date(output) : null;
  } catch {
    return null;
  }
}
