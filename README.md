# 6色思考会議

Chrome Built-in AI（Prompt API / Gemini Nano）を使い、シックスハット法で意思決定を整理するローカルWebアプリです。

## 起動

1. リポジトリをダウンロードまたはクローンします。
2. Chromeで `index.html` を開きます。
3. 画面上部が「モデル準備完了」になることを確認します。

開発者向けテストハーネスは、URL末尾に `?dev=1` を付けて開きます。

```text
index.html?dev=1
```

環境によって直接ファイルを開けない場合は、任意の静的HTTPサーバーから配信してください。

```bash
python -m http.server 8000
```

## 特徴

- 7段階の帽子別分析
- JSON Schemaによる構造化出力
- 非ストリーミングの処理フェーズ・経過時間表示
- 帽子単位の自動保存と中断再開
- 赤・緑・最終青の出力予算管理とコンパクト再試行
- 制約・対象外事項の追跡
- 重大度別の警告制御
- 表示・移行・生成テストとPASS／FAILレポート

## ディレクトリ構成

```text
.
├─ index.html
├─ styles/
│  └─ app.css
├─ src/
│  ├─ config.js
│  ├─ state.js
│  ├─ validation.js
│  ├─ ai.js
│  ├─ workflow.js
│  ├─ ui.js
│  ├─ persistence.js
│  ├─ test-harness.js
│  └─ main.js
├─ docs/
├─ scripts/
└─ tests/fixtures/
```

詳しい責務分割は [`docs/architecture.md`](docs/architecture.md)、v1.2の仕様は [`docs/revision-design-v1.2.0.md`](docs/revision-design-v1.2.0.md) を参照してください。

## 静的チェック

Node.js 20以降で実行できます。外部パッケージは不要です。

```bash
npm test
```

## プライバシー

生成処理と会議データの保存はローカルで行います。デバッグログを書き出す際は、共有前に議題や入力内容を確認してください。
