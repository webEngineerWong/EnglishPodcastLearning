<div align="center">

# EnglishPodcastLearning

**英語ポッドキャスト学習プラットフォーム**

*精聴 · バイリンガル対訳リーディング · 語彙学習 — あなたのポッドキャスト教材を、文ごとに学べるレッスンへ*

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![status](https://img.shields.io/badge/status-MVP%20tested-brightgreen)
![stack](https://img.shields.io/badge/stack-pnpm%20%2B%20Turborepo-blue)

</div>

---

## これは何

英語学習者向けの**ポッドキャスト精聴プラットフォーム**です。手元にある教材（MP3 音声、日英・中英対訳 PDF、SRT 字幕）を、文ごとに再生・対訳表示・進捗記録ができるコースへ自動変換します。Web アプリと macOS ネイティブデスクトップクライアントの両方を提供します。

### 主な機能

- 🎧 **精聴プレイヤー** — 0.5–2 倍速、±5 秒/30 秒送り、トラックリピート／センテンスリピート／A-B リピート、キーボードショートカット（Space / ←→ / ↑↓ / `[` `]` / `L` / `N` / `P`）、再生位置の自動記録と復元
- 📖 **バイリンガル対訳リーディング** — 英文パラグラフをクリックすると該当する音声へシーク。現在位置のハイライト、自動スクロール、英語のみ／中国語のみ／バイリンガル表示の切り替え、コピー、センテンスのお気に入り、単語帳への追加
- 📥 **スマートインポート**（コア機能）
  - 中英対訳 PDF の自動解析：段落検出、英中自動ペアリング、ヘッダー・ウォーターマーク除去、信頼度スコアリング（PyMuPDF）
  - SRT 字幕（**カラオケ式ローリング字幕**にも対応）を行レベルで重複排除し、実タイムスタンプを生成
  - **語彙アンカーアラインメント**：PDF の文章と生の字幕は言い回しが異なるため、レア語彙をアンカーに読み順で整合。自動覆盖率は約 60%、残りは手動校正へ — **タイムスタンプは絶対に偽装しません**
  - 英語 SRT + 中国語 SRT + MP3 → 自動でバイリンガルコースに合成
  - 校正 UI：編集、分割、統合、並べ替え、削除、低信頼度ハイライト
  - **タスク間自動グルーピング**：MP3・英語字幕・中国語字幕を別々にアップロードしても、エピソード番号で自動的にグルーピング
  - 音声のみのコースも公開可能。テキストは後からコースページで追加
  - 元の PDF/MP3 は永久保存・追跡可能
- 📊 **学習記録** — 今日／累計時間、連続日数、前回の続きから再開、復習状態つき単語帳、お気に入り
- 🖥 **macOS デスクトップクライアント**（Electron）— Web と同等の機能に、ネイティブファイルインポート、トレイ再生コントロール、グローバルショートカット

## クイックスタート（Docker ワンコマンド）

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

docker compose up -d --build
```

初回ビルドは約 5 分、以降は即起動します。

| サービス | URL |
|---|---|
| Web アプリ | http://localhost:3000 |
| API（Swagger は /docs） | http://localhost:3001/api |
| PostgreSQL | localhost:5433（永続ボリューム） |

既存コースデータは自動マイグレーション（コンテナ起動時に `prisma migrate deploy` を実行）。音声/PDF は `./data/storage` にマウントされます。

> デモデータ：`docker compose exec api node_modules/.bin/tsx prisma/seed.ts`

## ローカル開発

```bash
pnpm install
pnpm setup:parser           # Python venv + PyMuPDF
pnpm db:up                  # PostgreSQL（Docker）
pnpm --filter @elp/api prisma migrate deploy
pnpm db:seed
pnpm dev                    # API :3001 + Web :3000
pnpm dev:desktop            # Electron クライアント
```

## 教材のインポート

1. Web → **インポート** → 同じ番号のファイル群を選択：
   `Episode N.pdf` + `Episode N.mp3` + `Episode N （英語字幕）.srt` + `Episode N（中国語字幕）.srt`
2. ジョブ完了後、校正画面を開き（低信頼度段落はハイライト済み）→ **公開**
3. 分けてアップロードしても大丈夫 — ジョブ一覧の **🔍 再マッチング** でエピソード番号ごとに自動グルーピング
4. コースページで、対訳本文・実タイムスタンプ・進捗記録がすぐ使えます

詳細は [PDF インポートガイド](docs/PDF_IMPORT.md) を参照してください。

## コマンド一覧

| コマンド | 説明 |
|---|---|
| `pnpm dev` / `dev:web` / `dev:api` / `dev:desktop` | 開発サーバー起動 |
| `pnpm build` / `test` / `lint` / `typecheck` | 品質ゲート |
| `pnpm db:up` / `db:migrate` / `db:seed` | データベース |
| `docker compose up -d --build` | ワンコマンドデプロイ |
| `pnpm --filter @elp/desktop package:dir` | macOS .app のパッケージ |

## 技術スタック

`pnpm + Turborepo` · Next.js 15 · React 19 · Tailwind CSS · TanStack Query · NestJS · Prisma · PostgreSQL · Electron · Vite · PyMuPDF · Cloudflare R2（オプション）

## ドキュメント

| | |
|---|---|
| [アーキテクチャ](docs/ARCHITECTURE.md) | データフローと設計判断 |
| [開発ガイド](docs/DEVELOPMENT.md) | 環境構築とトラブルシューティング |
| [データベース](docs/DATABASE.md) | 16 モデルの解説 |
| [PDF インポート](docs/PDF_IMPORT.md) | 解析とアラインメントのアルゴリズム |
| [デプロイ](docs/DEPLOYMENT.md) | Docker / R2 / サーバー |
| [プロジェクト状況](docs/PROJECT_STATUS.md) | 進捗と既知の課題 |

## 備考

- フェーズ 1 は個人利用向け。データモデルは複数ユーザー対応済みで、将来のオンライン展開に拡張可能です
- Cloudflare R2 の認証情報が未設定の場合はローカル保存（`STORAGE_DRIVER=local`）。設定するとプライベートバケット＋署名付き URL に切り替わります
- セキュリティ基準：Electron `contextIsolation` ✓ レンダラーに Node 権限なし ✓ ファイル種別・サイズのホワイトリスト ✓
