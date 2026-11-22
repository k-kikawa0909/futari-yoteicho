# ふたりの予定帳

二人で「カレンダーの予定」と「行きたい所リスト」を共有する、スマホのホーム画面に置けるアプリ(PWA)です。
App Store / Google Play には出さないので、登録料はかかりません。iPhone でも Android でも使えます。

## できること
- **カレンダー**: 月の表示。日付をタップすると、その日の予定と「これからの予定」が出ます
- **色分け**: 自分の予定(青)・相手の予定(ピンク)・ふたりの予定(紫)
- **行きたい所リスト**: 名前・エリア・URL・メモ。だれが追加したかが分かり、「行った」チェックができます
- **行きたい所 → 予定に**: リストの「予定に」ボタンで、その場所の予定をカレンダーに入れられます
- **ペアコード**: 同じコードを入れた二人だけが、同じデータを見られます

## ファイル
| ファイル | 中身 |
|---|---|
| index.html / style.css / app.js | 画面と動き |
| store.js | データの保存(Firebase か、この端末だけ) |
| config.js | Firebase の設定(ここに貼り付ける) |
| manifest.json / sw.js / icons/ | ホーム画面に置くための設定とアイコン |
| firestore.rules | Firebase のデータを守るルール |
| tools/make_icons.py | アイコンを作り直すとき用 |

## 1. いますぐ試す(お試しモード)
config.js が空のままだと「お試しモード」で動きます(データはその端末の中だけ)。

```powershell
python -m http.server 8765 --directory C:\couple_app
```
パソコンのブラウザで http://localhost:8765 を開きます。

## 2. Firebase を準備する(二人で共有するため・無料)
**2026-11-22 済み**: プロジェクト futari-yoteicho(無料の Spark プラン・東京)。匿名ログイン有効、ルール公開済み、config.js 入力済み。

1. https://console.firebase.google.com を Google アカウントで開き、「プロジェクトを追加」(名前は例: futari-yoteicho。Google アナリティクスはオフで OK)
2. 左のメニュー「構築」→ **Authentication** →「始める」→「ログイン方法」で **匿名** を有効にする
3. 「構築」→ **Firestore Database** →「データベースを作成」→ 場所は **asia-northeast1(東京)** → 「本番環境モード」
4. Firestore の「ルール」タブに、このフォルダの `firestore.rules` の中身を貼り付けて「公開」
5. 歯車 →「プロジェクトの設定」→ 下の「マイアプリ」で **</>(ウェブ)** を追加 → 表示される `firebaseConfig` の値を `config.js` に貼り付け

※ この `firebaseConfig` はアプリを見分けるための値で、パスワードではありません(公開しても大丈夫な値です)。データはルールとペアコードで守られます。

## 3. スマホで開けるように公開する(GitHub Pages)
**2026-11-22 済み**: https://k-kikawa0909.github.io/futari-yoteicho/ (リポジトリ k-kikawa0909/futari-yoteicho)。
直したら `git add -A`、`git commit`、`git push` で数分後に反映されます。

1. GitHub で新しいリポジトリ(例: futari-yoteicho)を作る
2. このフォルダの中身をアップロードする
3. リポジトリの Settings → Pages → Branch を `main` にして保存
4. 数分後に `https://<GitHubのユーザー名>.github.io/futari-yoteicho/` で開けるようになります

## 4. 二人で使い始める
1. 公開した URL をスマホで開く
   - **iPhone**: Safari で開く → 共有ボタン(□↑)→「ホーム画面に追加」
   - **Android**: Chrome で開く → ︙ →「ホーム画面に追加」/「アプリをインストール」
2. **ホーム画面のアイコンから**開く(iPhone はブラウザとホーム画面のアプリでデータが別になるため)
3. ひとり目: 名前を入れて「新しく始める」→ 設定画面のペアコードを「コピー」して LINE などで送る
4. ふたり目: 名前を入れ、届いたペアコードを貼り付けて「コードで参加する」

## 注意
- ペアコードを知っている人はデータを見られます。二人以外に教えないでください。
- アプリを直したら `sw.js` の `CACHE = "futari-v1"` の数字を上げると、スマホ側も新しい画面に切り替わります。
