---
title: "InstallerSweeper"
description: "ダウンロードフォルダ等に溜まった使用済みインストーラー(.exe/.msi/.zip/.iso)を自動検出し、確認したうえでゴミ箱へ移動できるWindowsデスクトップアプリ。ZIP/ISOの中身まで展開してインストール済み判定を行うのが特徴。"
url: "https://apps.microsoft.com/detail/9p0tn082dzrf?hl=ja-JP&gl=JP"
image: "/works/installer-sweeper-logo.png"
tags: ["C#", "WPF", ".NET 8", "MSIX"]
date: 2026-07-01
---

Windows向けデスクトップアプリ。ダウンロードフォルダ等に溜まりがちな使用済みインストーラーを自動検出し、確認のうえゴミ箱へ移動できます。

ZIPやISOの中身まで展開してインストール済み判定を行える点が特徴です。Win32 P/Invoke(`SHFileOperation`)でゴミ箱移動を行い、ISOのパースには LTRData.DiscUtils を使用しています。

Microsoft Storeで公開中です。
