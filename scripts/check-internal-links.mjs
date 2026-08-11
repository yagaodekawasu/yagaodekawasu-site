import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const SRC_DIR = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT_DIR = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const HREF_PATTERNS = [
  /href="(\/[^"]*)"/g,
  /href=\{`(\/[^`]*)`\}/g,
  /href:\s*"(\/[^"]*)"/g,
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (extname(entry) === ".astro") {
      files.push(full);
    }
  }
  return files;
}

function isExempt(path) {
  if (path === "/") return true;
  if (path.startsWith("#")) return true;
  if (/\.[a-zA-Z0-9]{1,5}$/.test(path)) return true;
  return false;
}

const violations = [];

for (const file of walk(SRC_DIR)) {
  const lines = readFileSync(file, "utf-8").split("\n");
  lines.forEach((line, i) => {
    for (const pattern of HREF_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line))) {
        const path = match[1];
        if (isExempt(path) || path.endsWith("/")) continue;
        violations.push({ file: relative(ROOT_DIR, file), line: i + 1, path });
      }
    }
  });
}

if (violations.length > 0) {
  console.error("内部リンクの末尾スラッシュが抜けています:");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  href="${v.path}"`);
  }
  process.exit(1);
}

console.log("内部リンクの末尾スラッシュチェック: OK");
