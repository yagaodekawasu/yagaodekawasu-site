# 公開手順ランブック

GitHubリポジトリ（`yagaodekawasu/yagaodekawasu-site`, Private）の作成・pushまでは完了済み。
ここから先は課金・外部アカウント操作を含むため、ユーザー自身の操作が必要。

## 1. Cloudflare Pages でサイトを公開する

1. Cloudflareダッシュボード（https://dash.cloudflare.com/）にログイン。
2. 左メニューから「Workers & Pages」→「Create application」→「Pages」タブ→「Connect to Git」。
3. GitHubアカウント連携（初回はOAuth認可が必要）。対象アカウント配下の `yagaodekawasu-site` リポジトリを選択。
4. ビルド設定:
   - Framework preset: `Astro`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - 環境変数は現時点では不要（`.env`を使っていないため）。
5. 「Save and Deploy」。初回ビルドが通れば `https://yagaodekawasu-site.pages.dev` のようなURLで公開される。

## 2. Cloudflare Registrar でドメインを購入する

1. Cloudflareダッシュボード内「Domain Registration」→「Register Domain」。
2. `yagaodekawasu.com` を検索し、空いていれば購入手続き（クレジットカード決済）。
   - **これは金銭を伴う操作のため、必ずユーザー自身が実施する。**
3. 購入完了後、そのドメインは自動的に同じCloudflareアカウントのゾーンとして追加される。

## 3. カスタムドメインをPagesプロジェクトに紐付ける

1. 該当のPagesプロジェクト（`yagaodekawasu-site`）→「Custom domains」タブ→「Set up a custom domain」。
2. `yagaodekawasu.com`（および必要なら `www.yagaodekawasu.com`）を入力。
3. ドメインが同一Cloudflareアカウント内であれば、DNSレコード（CNAME/Aレコード）は自動で追加される。反映まで数分〜数十分。
4. SSL証明書もCloudflareが自動発行するため、追加作業は基本不要。

## 4. Pages CMS を有効化する

1. https://app.pagescms.org/ にアクセスし、GitHubアカウントでログイン（OAuth認可）。
2. 「Add a new site」→ `yagaodekawasu/yagaodekawasu-site` リポジトリを選択。
   - リポジトリ直下の `.pages.yml` を自動的に読み込む設定になっている（既に用意済み）。
3. ブランチは `master` を選択。
4. 接続後、Pages CMSの管理画面から `blog` / `works` / `certifications` / `profile` の編集ができるようになる。
   - CMS側での保存は対象ブランチへの直接コミットになる点に注意（PRを介さない）。

## 5. 最終確認

- `https://yagaodekawasu.com/` が正しく表示されるか。
- `https://yagaodekawasu.com/sitemap-index.xml` と `https://yagaodekawasu.com/robots.txt` が200で返るか。
- Pages CMSから試しに1件編集し、Cloudflare Pagesが自動で再ビルド・再デプロイされるか（Gitへのpushをトリガーに自動デプロイされる設定になっているはず）。

## 補足

- 上記のうち、ドメイン購入（手順2）とGitHub/Cloudflareへの認可（手順1・4のOAuth）はユーザー自身の操作が必要な範囲。私（Claude）が代行することはできない。
- ビルド設定や `.pages.yml` の内容に変更が必要になった場合は、コードとして変更してpushすればよい（CMS側の設定変更ではなく通常の開発フロー）。
