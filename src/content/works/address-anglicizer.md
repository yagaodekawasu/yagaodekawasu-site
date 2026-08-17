---
title: "住所英語変換"
description: "日本語の住所を海外発送や英語記入用のローマ字表記へ変換するChrome拡張機能。建物名・階数・部屋番号にも個別対応し，日本郵便の公式データをもとに正確な表記に変換する。"
url: "https://chromewebstore.google.com/detail/%E4%BD%8F%E6%89%80%E8%8B%B1%E8%AA%9E%E5%A4%89%E6%8F%9B/pmociihecbolggopegnjfjemomncfkac"
image: "/works/address-anglicizer-logo.png"
tags: ["TypeScript", "Chrome Extension", "Manifest V3", "esbuild", "kuroshiro", "Vitest", "Playwright"]
date: 2026-08-12
---

日本語の住所を、海外発送や英語での住所記入に使えるローマ字表記へ変換するChrome拡張機能です。

日本郵便のローマ字データ（KEN_ALL_ROME.CSV）をもとに、都道府県・市区町村・町域名を正確な英語表記に変換します。丁目・番地・号などはハイフン区切りの番地表記（例: 1-2-3）に統一されます。

建物名・階数・部屋番号は個別入力欄で指定でき、形態素解析でローマ字に変換します。都道府県・市区町村への接尾辞（Ken/Shi/Ku等）の付与有無も切り替え可能です。

入力内容・変換結果はブラウザのセッションストレージにのみ保持され、外部送信は行いません。

Chromeウェブストアで公開中です。
