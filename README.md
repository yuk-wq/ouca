# OUCA

コーヒー豆注文アプリの再構築。管理はスプレッドシート、配信は GAS のまま作り直し、拡張性を持たせる。UI は Yu が Figma で作る。

- 現行サイト: Oka の GAS のデプロイ（URL は書かない）

## フォルダ

```
OUCA/
  docs/
    as-is/    【現行】作り直す前のサイトの解析。新しい設計の根拠として残す。更新しない
    to-be/    【新設計】作り直した後の姿。実装はここに従う
  src/        コード。shared/（画面とサーバー共通）、client/（Vite + Preact の画面）、server/（GAS）
  test/       ビルド結果（dist/）を確認するテスト
  scripts/    ビルドとテスト用スクリプトへの送信
  _work/      Claude の作業用（解析の証拠、レビューの記録）。読まなくてよい
  .claude/agents/   実行役（Sonnet）とレビュー役（Opus）のエージェント定義
  .github/    CI、Issue と PR のテンプレート
  CLAUDE.md   作業の決まり（役割とモデル、テスト駆動、Issue・ブランチ・PR）
```

実装を進めると `assets/`、`mock/` が増え、ビルドすると `dist/` ができる（`docs/to-be/design.md` §4.5）。

## コマンド

`npm run dev`、`npm test`、`npm run build`、`npm run push:test` など。内容は `docs/to-be/delivery-flow.md` §6.1。`npm run typecheck` で型、`npm run format:check` で書式を確認する。`push:test` は `.clasp.test.example.json` を `.clasp.test.json` にコピーし、テスト用スクリプトの ID を書いてから使う。

## 文書

新設計（`docs/to-be/`）
- `work-plan.md`: ワークプラン。フェーズ、タスクと担当（Opus / Sonnet）と Issue の対応、依頼文の型、ユーザーに決めてもらうこと。タスクの中身と状態は GitHub の Issue で管理する。作業はここから始める
- `design.md`: 設計書。シート、API、画面、お気に入りと好みの分析、アイコン
- `delivery-flow.md`: 実装、Oka への受け渡し（テンプレートのコピー、リリースの取り込み）、更新とメニューの公開の流れ。Yu は本番のデータに触れない
- `spikes.md`: 技術検証（フェーズ1）の結果。確認したこと、結果、設計への影響
- `glossary.md`: 用語集。各文書の冒頭の「用語」の表の説明の元

現行（`docs/as-is/`）
- `site-analysis.md`: 現行サイトの仕組みと問題点
- `data-model.md`: 現行のデータの構成図
- `requests-to-developer.md`: 現行の開発者への要請（作り直しの方針により、大半は新設計に取り入れた）

作業用（`_work/`）
- `raw/`: 現行サイトから取得した HTML、メニューデータ、差分、画面
- `review-2026-11-21.md`: 設計書の技術レビューの取捨
