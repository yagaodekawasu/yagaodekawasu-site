---
title: "ESP32×Home Assistantで家のエアコンをIoT化した話～セットアップ編～"
description: "ESPHomeとHome AssistantをDockerで動かし，ESP32に初めてファームウェアを書き込んでHome Assistantに登録するまでの手順をまとめました。"
pubDate: 2026-08-08
tags: [ESP32, Home Assistant, IoT, ESPHome, Docker]
ogpImage: /uploads/esp32-aircon-iot-setup-ogp.png
draft: false
---
## この記事について

エアコンIoT化シリーズ2本目です。[前回の設計編](/blog/esp32-aircon-iot-design)では，SwitchBot HubとESP32＋Home Assistant（以下HA）の2案を比較し，後者の構成で進めることに決まりました。今回はHAとESPHomeを構築し，ESP32にファームウェアを書き込んでHome Assistantに登録するところまで進めます。

## Home Assistant構築

「HAとは何か」は前回の記事で説明しましたね。実際はESPHome→HAの順に構築したんですが，便宜上先に触れておくことにします。

### VM vs コンテナ

HAのインストール方法には，大きく分けて「Home Assistant OS」と「Home Assistant Container」があります。HA OSというのは，Raspberry Pi等の専用機やVM上に専用OSごと構築する，公式に最も推奨されている方法です。

[Installation - Home Assistant](https://www.home-assistant.io/installation/)

今回はコストを抑えるためになるべく専用機は増やさずデスクトップPC上で動かすつもりだったので，HA OSのVMを立てるかコンテナを立てるかという選択だったんですが，VMはCPU・メモリを固定で割り当てる必要があるし，どうせ他の開発でDocker使うからDockerに寄せたいとか考えてHA Containerを選びました。一応，Claudeに聞いたそれぞれのメリデメが↓こちらです。

| 観点               | VM                                       | コンテナ                                                                                                             |
| ---------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| セットアップの手間        | ハイパーバイザーの用意やOSイメージの導入が必要                 | 既存のDocker環境に`docker-compose.yml`を追加するだけ                                                                          |
| リソース割り当て         | CPU・メモリを固定で割り当てる必要がある                    | ホストのカーネルを共有し，必要な分だけ動的に使う                                                                                         |
| Apps・自動更新・バックアップ | Supervisorが使え，ワンクリック更新やスナップショットバックアップが可能 | Supervisorがないため手動運用になる                                                                                           |
| ネットワーク（mDNS）     | ブリッジ接続すればLAN上に独立したIPを持て，mDNSも素直に機能する     | Dockerのbridgeネットワークはマルチキャスト受信をブロックする仕様のためmDNSが機能しにくい。Windows版Docker Desktopはhostネットワークモードが使えず，この制約を回避する手段がない（後述） |
| USBデバイス          | パススルーが比較的素直                              | Windows上ではパススルーがかなり面倒                                                                                            |

### コンテナ起動

Home Assistantは`docker-compose.yml`で以下のように定義しました。

```yaml
services:
  homeassistant:
    container_name: homeassistant
    image: ghcr.io/home-assistant/home-assistant:stable
    restart: always
    ports:
      - "8123:8123"
    volumes:
      - ./config:/config
    environment:
      - TZ=Asia/Tokyo
```

`docker compose up -d`で起動し，`http://localhost:8123`にアクセスするとアカウント作成のオンボーディング画面が出ます。ちなみに，アカウント作成直後の`...auth_callback=1&code=...`のようなURLで一瞬`ERR_FAILED`（このサイトにアクセスできません）が出ることがありましたが，`http://localhost:8123`に再アクセスしたらアカウント自体は作成済みで無事ログインできました。

Windows版のDocker Desktopでは`network_mode: host`が使えないため，コンテナの外からアクセスできるようにするには，必然的にデフォルトの`bridge`（ホストOSと隔離されたネットワーク＋ポートフォワーディング）を選択することになります。Docker Composeのnetwork_modeについては↓こちらの記事をご参照ください。

[Docker Composeのnetwork_mode解説](https://zenn.dev/sakaki_web/articles/9ba5be6a74c6d8)

[Networking in Compose | Docker Docs](https://docs.docker.com/compose/how-tos/networking/#change-the-network-mode)

あと`restart`は最初`unless-stopped`にしてたんですが，ホストOSの再起動時に自動起動しなくて困ったので`always`に変えました。`restart`の設定については↓こちらの記事をご参照ください。

[Docker composeの restart の設定のまとめ](https://zenn.dev/kanekonkon/articles/9df90ce20fbbee)

[Start containers automatically | Docker Docs](https://docs.docker.com/engine/containers/start-containers-automatically/)

## ESP32にファームウェアを書き込む

普段ソフトウェアばかり触ってるんで，「ファームウェアって何だっけ？」というところから怪しいんですが，ざっくり言うと「ハードウェアを動かすためのソフトウェア」のことらしいです。

[ファームウェアとは| IBM](https://www.ibm.com/jp-ja/think/topics/firmware)

ESP32は買ってきたままの状態だとブートローダー以外何のプログラムも入っていないただのマイコン基板なので，どのGPIO（マイコンのポートみたいなやつ）を何に使うか，WiFiにどう繋ぐか，赤外線をどう送受信するか──こういった動作は，すべてファームウェアを書き込んで初めて決まります。

「じゃあOSってどこにあるの？」という疑問が湧くんですが，組み込み系ではファームウェアの中にOSが含まれているようです。正確にはRTOS（Real Time Operating System）という，GPIO制御やWiFi接続といったアプリ側のロジックだけでなく，複数の処理を裏側で同時に動かすリアルタイム性能に特化したプログラムらしいです。要するに普段使ってる汎用PCとは違い，OSが無いと動かないわけじゃないんだよってことですね。

[【リアルタイムOS（RTOS）とは】特徴やメリットを入門者向けに分かりやすく解説 - スマートシティ/モビリティ - マクニカ](https://www.macnica.co.jp/business/maas/columns/143480/)

ともかく，今回のように「特定のGPIOを赤外線受信に，別のGPIOを赤外線送信に使う」という動きをさせるには，そのロジックをファームウェアとしてESP32に書き込む必要があるわけです。

通常，マイコンのファームウェアはC/C++でロジックを書き，専用のビルドツールでコンパイルし，書き込みツールで転送するという工程を自分の手で行う必要があって中々の重労働（想像）なんですが，そこでこのESPHomeです！

ESPHomeとはESP32やESP8266といったマイコンに書き込むファームウェアをYAMLで定義できるOSSのツールチェーンで，これを使うと，なんとこのビルドから書き込みまでの面倒な部分を全部代わりにやってくれます！　つまり，ユーザーはYAMLで「どのGPIOを何に使うか」みたいな宣言を書くだけで済むというわけですね！　更に，2回目以降はOTA（Over The Air）を使ってWi-Fi経由で書き込めるので，設定を変える度にPCに繋ぐ必要がないんです！　至れり尽くせりですね！

[ESPHome](https://esphome.io/)

それでは早速やっていきましょう。

### ESPHomeをDockerで構築する

本来，ESPHomeはHAのApps（旧・アドオン）としてインストールするのがベストプラクティスとされています。HAのWeb UIからYAML編集・コンパイル・書き込みまで完結し，デバイスも接続時に自動でエンティティとして認識されるため，特に初心者には扱いやすい方法です。

[ESPHome Add-onでかんたんホームオートメーション始め方ガイド](https://jisaku.com/posts/esphome-home-automation)

ただ，今回は上述の通りDockerコンテナとしてHAを構築しているため，そもそも「Apps」という仕組み自体が使えません（AppsはHA OSでのみ有効）。

というわけで，ESPHomeも同じ`docker-compose.yml`にサービスを追加する形でコンテナとして動かしています。

```yaml
  esphome:
    container_name: esphome
    image: ghcr.io/esphome/esphome:stable
    restart: always
    ports:
      - "6052:6052"
    volumes:
      - ./esphome:/config
```

[公式ドキュメント](https://esphome.io/install/docker/)のサンプルでは`privileged: true`（コンテナにホストの全デバイスへのアクセス権を与える設定）の指定と`/etc/localtime`のマウントがされていますが，Claudeくんは省略したようですね。のちのち確認したところ，`privileged: true`はコンテナ上のESPHomeがホストOSのUSB経由でESP32への書き込みをできるようにするための設定らしいんですが，今回のUSB書き込みはコンテナ自体がUSBポートにアクセスするのではなく，ブラウザのWeb Serial APIがホストOSのUSBポートに直接接続して書き込む方式を採ったので不要とのことでした。Web Serial APIについては↓こちらの記事が詳しいです。

[Web Serial APIでブラウザからシリアルデバイスを操作する | 天使やカイザーと呼ばれて](https://www.eisbahn.jp/yoichiro/2025/03/web-serial-api.html)

[Web Serial API - Web API | MDN](https://developer.mozilla.org/ja/docs/Web/API/Web_Serial_API)

また，`/etc/localtime`のマウントはESP32自体が時刻を参照するための設定（内部でcronジョブを動かすとか）らしいですが，今回はHAからの指示以外でESP32が何かするような想定ではないので省略しています。

### 初回書き込み

#### 新規デバイスの作成

起動したESPHome Dashboardで，次の手順で新規デバイスを作成します。

1. 「+ NEW DEVICE」をクリックすると作成方法を選ぶダイアログが出ます。「Create new project」「Import from file」「Empty Configuration」の3択で，今回はどうせClaude Codeに書かせるので「Empty Configuration」を選びました。

   ![Create configurationダイアログ](/uploads/esp32-aircon-iot-setup/01-create-configuration.png)

2. デバイス名を入力して「Finish setup」をクリックするだけです。ボード選択やWiFi入力の画面は挟まりません。

   ![Create empty configuration画面](/uploads/esp32-aircon-iot-setup/02-create-empty-configuration.png)

   デバイス名の制約は以下の通りです。

   - 使用可能文字: 半角小文字・数字・ハイフン
   - 文字数: 最大24文字（`name_add_mac_suffix: false`にすれば31文字）
   - ESPHomeネットワーク内で一意に定まる（それがmDNSのホスト名（`{name}.local`）になるため）

#### 自動生成される雛形YAML

デバイスの新規作成が完了すると，以下のようなYAMLの雛形が自動生成されます。

```yaml
esphome:
  name: bedroom-hitachi-aircon
  friendly_name: bedroom-hitachi-aircon

esp32:
  board: esp32dev

logger:

api:
  encryption:
    key: "（自動生成された値）"

ota:
  - platform: esphome

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "bedroom-hitachi-aircon Fallback Hotspot"
    password: "（自動生成された値）"

captive_portal:
```

ボードは`esp32dev`固定で自動選択され，WiFiは`secrets.yaml`の`wifi_ssid`／`wifi_password`を参照する形で埋まります（`secrets.yaml`自体は別途用意します）。ちなみにESP32は2.4GHz帯のWiFiにしか対応していません。5GHz専用のSSIDしか無い環境だと，最初のWiFi接続でハマるので要注意です。

`wifi.ap`（フォールバックAP）は，WiFiルーターへの接続に失敗したときだけ自動で立ち上がる仕組みです。デフォルトでは90秒接続できないとESP32自身がここで指定したSSID/パスワードで電波を出し始め，`captive_portal`と組み合わせてブラウザからWiFi設定をやり直せます。USBで書き込む今回は直接使いませんが，WiFi設定を間違えてESP32が孤立してしまってもUSBなしで復旧できる保険というわけです。

[WiFi Component - ESPHome - Smart Home Made Simple](https://esphome.io/components/wifi/#access-point-mode)

あとは必要に応じてこの雛形に`remote_transmitter`／`remote_receiver`／`climate`などのセクションを自分で追記していきます。ちなみに，HAのUIには`friendly_name`（デフォルトは`name`と同じ文字列）が表示されます。こちらは日本語やスペースが使えるので，ダッシュボードで見た時にわかりやすい名前に変えておくのがおすすめです。

#### 書き込み

YAMLを書き終えたら，画面右下の「Install」をクリックして書き込んでいきます。クリックすると書き込み方法を選ぶモーダルが出てきます。

![How do you want to install the firmwareダイアログ](/uploads/esp32-aircon-iot-setup/03-install-firmware-dialog.png)

ダイアログにも「初回はUSBケーブルが必要（1回だけ）。以降はワイヤレスでインストールできる」という案内が出ていますね。選択肢は次の4つです。

- **Plug into this computer**: USB経由**←今回はこれを選択**
- **On the network**: Wi-Fi経由
- 「Advanced options」を開くと出てくる2つ
  - **Device IP or hostname**: 自動検出されたアドレスの代わりに，任意のIP・ホスト名を指定して書き込む
  - **Download firmware binary**: その場でビルドしてバイナリをダウンロードし，好きな書き込みツールで手動フラッシュする

「Plug into this computer」を選ぶと，ブラウザ標準のシリアルポート選択ダイアログが出るので，該当するCOMポート（わからない場合はデバイスマネージャーで確認）を選んで接続を許可します。これでビルドが始まり，完了すると自動的に書き込みが行われます。

ちなみに，私はClaude CodeにYAML設定を任せたところ，2回バリデーションエラーに引っかかりました。

| エラー | 原因 | 対処 |
| --- | --- | --- |
| `'esphome' section missing from configuration` | `esphome:`セクション自体を書き忘れていた | セクションを追記 |
| `[filter_nanoseconds] is an invalid option for [remote_receiver]. Did you mean [filter_symbols]?` | `remote_receiver`のフィルタ設定に存在しないオプション名を指定していた | `filter_symbols`に修正 |

2回ともエラーログ共有したらすぐ修正してくれましたが，最初に公式ドキュメント見てから書くように言えば早かったかもしれないですね。

初回のビルド（ESP-IDFのフルビルド）は数十分かかります。2回目以降は差分ビルドになるため，だいたい数分で終わります。実際にやってみるとマジでOTAが便利だということがよくわかりました。

#### YAML最終形

最終的に，先ほどの雛形YAMLに`remote_transmitter`／`remote_receiver`／`climate`を追記した設定は以下の形になりました（`api.encryption.key`・`ota.password`・フォールバックAPのパスワードは実際の値ではなくプレースホルダーです）。追記した部分についての詳しい説明は次回以降の記事に譲ろうと思います。

```yaml
esphome:
  name: bedroom-hitachi-aircon
  friendly_name: bedroom-hitachi-aircon

esp32:
  board: esp32dev

logger:

api:
  encryption:
    key: "（自動生成された値）"

ota:
  - platform: esphome
    password: "（自動生成された値）"

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "bedroom-hitachi-aircon Fallback Hotspot"
    password: "（自動生成された値）"

captive_portal:

remote_transmitter:
  pin: GPIO4
  carrier_duty_percent: 50%

remote_receiver:
  pin: GPIO14
  dump: all
  tolerance: 25%
  filter: 200us
  idle: 6ms

climate:
  - platform: hitachi_ac424
    name: bedroom-hitachi-aircon
```

## Home Assistantに登録する

ESP32側の書き込みが終わっても，これだけではHAの画面上にまだ何も出てきません。ESPHomeの`api`コンポーネントは，デバイス側でTCPサーバーを立てて指示を待っているだけの状態で，HA側から「このIPのこのデバイスと話す」という設定を追加して初めて，温度設定や運転モードといった機能がHAの「エンティティ」として現れ，ダッシュボードでの操作や自動化のトリガー・アクションに使えるようになります。この，HA側に接続先を教えてあげる作業が「登録」です。

本来ESPHomeの`api`コンポーネントを書き込んだデバイスは，HA側の「ESPHome」統合がmDNS経由で自動検出し，「新しいデバイスが見つかりました」という通知から数クリックで追加できるようになっています。

ただ，今回はDocker Desktop（Windows）のbridgeネットワーク構成の影響でmDNSがうまく機能せず，この自動検出の通知が出てきませんでした。そこで，ESP32のログやルーターの管理画面でIPアドレスを確認した上で，手動で統合を追加しました。

1. 「設定→デバイスとサービス→統合を追加」で「esphome」と検索すると，「ESPHome」の項目が出てくるのでクリックします。

   ![新しい統合の設定でESPHomeを検索](/uploads/esp32-aircon-iot-setup/04-ha-add-integration-search.png)

2. ホスト名（今回は確認したIPアドレス）とポート（デフォルトの6053のまま）を入力して送信します。この後の画面で`api.encryption.key`（暗号化キー）の入力も求められます。

   ![ESPHomeデバイスの接続設定入力画面](/uploads/esp32-aircon-iot-setup/05-ha-esphome-connection-settings.png)

3. `api.encryption.key`は，ESPHome Dashboardの該当デバイスカード右下の「⋮」メニューから「Show API key」を選ぶと確認できます。

   ![ESPHome Dashboardのデバイスメニューから Show API key を選択](/uploads/esp32-aircon-iot-setup/06-esphome-dashboard-show-api-key-menu.png)

   表示された値をコピーして，HA側の入力欄に貼り付ければ完了です。

   ![APIキー表示モーダル](/uploads/esp32-aircon-iot-setup/07-esphome-dashboard-api-key-modal.png)

これで無事HAに登録できました。デバイスページを開くと，温度・運転モードを操作できる「コントロール」カードが表示され，ちゃんと認識されていることがわかります。

![HAに登録されたデバイスページ](/uploads/esp32-aircon-iot-setup/08-ha-device-registered.png)

## 次回予告

これでESP32へのファームウェア書き込みとHome Assistantへの登録まで完了しました。次回は赤外線送受信回路をブレッドボードに組み，実際にリモコンの信号を解析してエアコンに向けて送信してみた話になると思います。お楽しみに。

## 余談

今回のサムネ画像作るに当たってHome Assistantのロゴを確認したんですが，旧ロゴちょっと気持ち悪くないですか？汗　出会う前にリニューアルしてもらっててよかったと心の底から思いました。

<div style="display: flex; gap: 1rem; flex-wrap: wrap;">
  <figure style="flex: 1; min-width: 200px; margin: 0; text-align: center;">
    <img src="/uploads/esp32-aircon-iot-setup/09-ha-logo-old.png" alt="Home Assistantの旧ロゴ" style="max-width: 100%;" />
    <figcaption>旧ロゴ</figcaption>
  </figure>
  <figure style="flex: 1; min-width: 200px; margin: 0; text-align: center;">
    <img src="/uploads/esp32-aircon-iot-setup/10-ha-logo-new.png" alt="Home Assistantの新ロゴ" style="max-width: 100%;" />
    <figcaption>新ロゴ</figcaption>
  </figure>
</div>

[A refreshed logo for Home Assistant! - Home Assistant](https://www.home-assistant.io/blog/2023/09/17/a-refreshed-logo-for-home-assistant/)
