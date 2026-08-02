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
- 制約違反・対象外抵触案を最終結論から決定論的に除外
- 重大度別の警告制御
- 表示・移行・生成テストとPASS／FAILレポート

## 結論候補の適格性

緑の帽子が生成した案は、最終青へ渡す前にハーネス側で判定します。

- `eligible`：結論候補として使用可能
- `conditional`：評価未確定のため要確認
- `excluded`：制約違反または対象外事項への抵触があり、最終結論へ渡さない

除外案は最終青のJSON Schemaからも外されます。除外案のIDまたは案名が推奨、比較案、要約、成功条件、次の行動へ混入した場合は、意味検証エラーとして再生成します。

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

静的チェックには、制約違反案が最終青のSchemaコンテキストや結論本文へ混入しないことを確認する回帰テストも含まれます。

## プライバシー

生成処理と会議データの保存はローカルで行います。デバッグログを書き出す際は、共有前に議題や入力内容を確認してください。
