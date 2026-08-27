// 日本国内の個人ブログとして，ビルド環境のタイムゾーンに依存せず常にJSTの暦日で
// 判定・表示するため，Intlのtimezone指定を明示する。
export function formatDate(date) {
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function dateKey(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

export function isLaterDay(a, b) {
  return dateKey(a) > dateKey(b);
}
