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

## v1.3.0 / Schema 4 Lite

Schema 4 Liteでは、Gemini Nanoへ渡す最終判断の仕事を小さくしました。

1. 緑の帽子が4つの代替案を生成します。
2. 各案について「含める・条件付き・除外」をユーザーが確定します。
3. 最終青へ渡す候補は最大3案です。
4. 除外案、組合せメモ、黒の対応策、黄の戦略的機会、赤の関係者別結果は最終青へ渡しません。
5. Gemini Nanoは候補の比較、選択、短い理由、事前に用意されたアクションIDの選択だけを行います。
6. 案名、案の概要、アクション本文、最終表示はJavaScriptが元データから組み立てます。

これにより、除外した案が言い換えられて最終推奨へ戻ることや、選択案と表示名・出典がずれることを抑えます。

## 主な特徴

- 7段階の帽子別分析
- JSON Schemaによる構造化出力
- 非ストリーミングの処理フェーズ・経過時間表示
- 帽子単位の自動保存と中断再開
- 赤・緑・最終青の出力予算管理とコンパクト再試行
- 緑案の採否確認UI
- 最大3案の軽量な最終比較
- 最終青のコンテキスト使用量を事前測定
- 制約・対象外事項の追跡
- 重大度別の警告制御
- 表示・生成テストとPASS／FAILレポート

## 保存データ

v1.3.0はSchema 4専用の保存領域を使用します。

```text
sixHatsMeetingsV4
```

Schema 3以前のJSONは自動移行しません。旧保存データは削除せず、v1.3.0からは読み込みません。

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
│  ├─ decision-gate-core.js
│  ├─ decision-gate-ai.js
│  ├─ decision-gate-ui.js
│  └─ main.js
├─ docs/
├─ scripts/
└─ tests/fixtures/
```

責務分割は [`docs/architecture.md`](docs/architecture.md)、Schema 4 Liteの設計概要は [`docs/schema4-lite-design.md`](docs/schema4-lite-design.md) を参照してください。

## 静的チェック

Node.js 20以降で実行できます。外部パッケージは不要です。

```bash
npm test
```

静的チェックには、次の回帰テストを含みます。

- 制約違反案が初期状態で除外される
- 除外案が最終青コンテキストへ入らない
- 黒の対応策と黄の戦略的機会が最終青へ流入しない
- 選択案IDとアクションIDの整合性を検証する
- 最終表示を元の緑案から決定論的に組み立てる

## プライバシー

生成処理と会議データの保存はローカルで行います。デバッグログを書き出す際は、共有前に議題や入力内容を確認してください。
