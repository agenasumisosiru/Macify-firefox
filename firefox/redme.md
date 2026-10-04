# Macfly-揚げナスによるカスタムバージョン — Chrome と Firefox 向け macOS の Aerial スクリーンセーバー

ブラウザの新しいタブページを、macOS の aerial スクリーンセーバー動画と、落ち着いた任意のウィジェット数点に置き換えます。macOS は**不要**です。動画は Apple の CDN から配信され、Firefox が動作するあらゆるプラットフォームで再生できます。
## 特徴

🎥 156 本の aerial 動画

## インストール
本家のchrome版が
[Install from Chrome Web Store](https://chromewebstore.google.com/detail/macify-macos-screensaver/lgdipcalomggcjkohjhkhkbcpgladnoe).
です。

### Firefox

Firefox 互換版は [firefox-port ブランチ](https://github.com/agenasumisosiru/Macify/tree/firefox-port) を参照してください。機能は Chrome 版と同一で、モットーの翻訳には Chrome のネイティブ Translator API の代わりに Google Translate API を使用します。


## 動画ソースの選択

### 1. Apple Server（デフォルト — 設定不要）

`sylvan.apple.com` から直接ストリーミングします。Chrome は Apple の証明書をデフォルトでは信頼しない場合があります。対処法は2つあります。

**オプション A — リバースプロキシ（デフォルトで有効、本家のJason Ngさんに感謝します。）。** 動画リクエストは、証明書の処理を行うホストされた Cloudflare Worker 経由でルーティングされます。ローカル設定は不要です。便利ですが、長期的に依存すべきではありません。可能であればローカルホスティングを設定するか、証明書を信頼してください。

**オプション B — Apple の証明書を手動で信頼する（最もクリーン）。** ブラウザ で一度 [https://sylvan.apple.com](https://sylvan.apple.com) を開いてください。セキュリティ警告が表示されるので、「詳細設定」をクリックし、「sylvan.apple.com に進む（安全ではありません）」を選びます。ブラウザはその信頼を記憶し、その後は直接接続できるようになります。

### 2. ローカルサーバー（macOS ユーザーに推奨）

最高のパフォーマンスで、サードパーティ依存もありません。**1つのコマンド**で macOS 標準の Apache を設定し、ローカルの Aerial 動画を `http://localhost:18000/videos/` で配信できるようにします。

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/jason5ng32/Macify/main/scripts/local-server/setup.sh)
```

パスワードを一度だけ求められます（sudo）。その後、Macify の設定でソースを **Local server** に切り替えてください。

アンインストールするには：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/jason5ng32/Macify/main/scripts/local-server/uninstall.sh)
```

ローカルサーバーを使うには、まず動画をディスクに保存しておく必要があります。方法は2つあります。

**システム設定から。** システム設定 → スクリーンセーバー → Aerial を開きます。保存したい各動画をクリックしてください（各動画は 500MB〜1GB です）。156 本すべて揃えるには手間がかかりますが、追加のものは不要です。

**ワンラインの一括ダウンローダー。** Macify には Python ダウンローダーが含まれており、進捗バー、再開対応、カテゴリ/ランダム絞り込み付きで、Apple の CDN から Aerial カタログ全体（または一部）を直接取得します。

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/jason5ng32/Macify/main/scripts/aerial_downloader/install.sh)
```

コマンドをコピーして Terminal に貼り付け、画面の指示に従ってください。カタログ全体は約 80〜150 GB です。スクリプトは確認を求める前に、推定サイズと空きディスク容量を表示します。

## 権限

Macify は以下の権限を要求しますが、いずれも機微情報ではありません。

| 権限 　　　| 　　　　用途 | 　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　Chrome | Firefox |
|---|---|---|---|
| `storage` | ユーザー設定の保持と天気データのキャッシュ。　　　　　　　　　　　　　　　　　| ✅ | ✅ |
| `topSites` | Chrome の最も訪問したサイト一覧を読み取り、Top Sites ウィジェットに表示。 | ✅ | ❌（無視） |
| `favicon` | Top Sites の各項目の横にファビコンを表示。 　　　　　　　　　　　　　　　　| ✅ | ✅（標準 Web API 経由） |
| `idle` | Zen モードの休憩リマインダー用に、ユーザーが離席したタイミングを追跡。　　　　　| ✅ | ❌（Firefox では壁時計時間を使用） |

`history` 権限はありません。任意のサイトへの host 権限もありません。

## ブラウザの違い

| 機能 | Chrome | Firefox |
|---|---|---|
| Aerial 動画 | ✅ | ✅ |
| 天気ウィジェット | ✅ | ✅ |
| Top sites | ✅ | 空（API が利用不可） |
| 引用の翻訳 | ✅ ネイティブのオンデバイス | ✅ Google Translate API |
| Zen モード | ✅ idle 検出あり | ✅ 壁時計時間 |
| 自動終了タイマー | ✅ | ✅ |
| BGM | ✅ | ✅ |

## ライセンス

MIT。 [LICENSE](LICENSE) を参照してください。

## クレジット

Jason Ng、Dofy、Setilis により作成されました。Firefox 版は agenasumisosiru による移植です。Aerial 動画の著作権は © Apple Inc. に帰属します。
