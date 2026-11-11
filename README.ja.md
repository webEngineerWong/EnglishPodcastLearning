<div align="center">

# EnglishPodcastLearning

**英語ポッドキャスト学習プラットフォーム**

*精聴 · バイリンガル対訳リーディング · 語彙学習 — あなたのポッドキャスト教材を、文ごとに学べるレッスンへ*

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![status](https://img.shields.io/badge/status-MVP%20tested-brightgreen)
![stack](https://img.shields.io/badge/stack-pnpm%20%2B%20Turborepo-blue)

</div>

---

> この README は、初めてプロジェクトに触れる人が迷わない順序で書かれています：
> **プロジェクトを理解する → 構成を見る → 環境を整える → 起動する → コースを取り込む → 学習を始める → デスクトップクライアント → FAQ**。
> 手順に沿えば 30 分で自分専用のポッドキャスト精聴プラットフォームが動きます。

---

## 1. これは何？何を解決する？

英語ポッドキャストの学習では、教材が散らかりがちです：**MP3 音声、対訳 PDF、SRT 字幕**。次のような悩み：

- 音声とテキストが同期しない — わからない文があるたびにシークバーを往復
- PDF はビューア、音声はプレイヤー、単語帳は別の場所 — 学習の流れが何度も中断される
- 進捗が記録されず、昨日の何分どこで止めたか分からない

**EnglishPodcastLearning はこれらの教材を「クリックで再生できるコース」へ自動変換します：**

1. 同じ番号の `MP3 + 対訳 PDF + 英/中字幕` をアップロード
2. システムが PDF を解析し、エピソード番号でファイルをグルーピングし、字幕から各段落へ**実タイムスタンプ**を割り当て
3. UI で校正し、ワンクリックで公開
4. コースを開く：**英文パラグラフをクリックすると音声がその文へジャンプ**。対訳表示・単語ワンクリック追加に対応

**Web アプリ**（ブラウザ）と **macOS デスクトップクライアント**（Electron）の両方を提供し、機能は同じ、バックエンドも共通です。

### 機能一覧

| モジュール | 機能 |
|---|---|
| 🎧 プレイヤー | 0.5–2 倍速、±5/30 秒スキップ、トラックリピート、センテンスリピート、A-B リピート、ショートカット、再生位置の自動記録 |
| 📖 対訳リーディング | クリックでシーク、ハイライト、自動スクロール、表示切替、コピー、お気に入り、単語追加 |
| 📥 スマートインポート | 対訳 PDF 解析・ペアリング・ヘッダー除去（PyMuPDF）、ローリング SRT の行単位重複排除、語彙アンカー整列、タスク間自動グルーピング、校正、音声のみコース |
| 📊 学習記録 | 今日／累計時間、連続日数、続きから再開、復習状態つき単語帳、お気に入り |
| 🖥 デスクトップ | ネイティブファイルインポート、トレイ再生コントロール、グローバルショートカット |

**設計の原則**：タイムスタンプは実字幕の整列（自動カバー率約 60%）または手動校正のみ。合わない段落は空のまま — **タイムスタンプは偽装しません**。

---

## 2. プロジェクト構成

1 分だけ見ておくと後が楽です：

```
EnglishPodcastLearning/
├── apps/
│   ├── api/          NestJS バックエンド — 業務ロジック・REST API・Swagger
│   │   └── prisma/   DB モデル・マイグレーション・シード
│   ├── web/          Next.js サイト — ブラウザ UI
│   └── desktop/      Electron クライアント — macOS .app
├── packages/
│   ├── types/        共有 TypeScript 型
│   ├── api-client/   統一 API クライアント（Web/デスクトップ共用）
│   ├── learning-core/ 純ロジック：SRT 解析、タイムスタンプ整列、ループ計算
│   ├── player/       音声プレイヤーエンジン + React コンポーネント（共用）
│   ├── ui/           共有 UI コンポーネント・テーマ・i18n
│   └── config/       共有 tsconfig / Tailwind / ESLint
├── services/
│   └── pdf-parser/   Python PDF パーサー（PyMuPDF、API から子プロセス起動）
├── data/
│   └── storage/      アップロード音声/PDF の実体（Docker ボリュームマウント）
├── docs/             詳細ドキュメント
├── docker-compose.yml  ワンコマンドデプロイ（PostgreSQL + API + Web）
├── Dockerfile          マルチステージビルド
└── turbo.json        タスク編成
```

**2 行で理解**：`web / desktop` は 2 つの「シェル」で、`packages/` の学習ロジックをすべて共有し、`api/` とだけ通信します。`api/` はファイルをディスクへ、データを PostgreSQL へ保存し、PDF 解析は Python スクリプトを呼び出します。

---

## 3. 環境準備

ターミナルで順に確認：

| ツール | バージョン | 確認 | インストール |
|---|---|---|---|
| Node.js | ≥ 20 | `node -v` | [nodejs.org](https://nodejs.org) または `brew install node` |
| pnpm | ≥ 12 | `pnpm -v` | `corepack enable` または `npm i -g pnpm` |
| Docker | 最近版 | `docker info` | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Python 3 | ≥ 3.9 | `python3 --version` | macOS 標準 / `brew install python` |
| Git | 最近版 | `git --version` | `xcode-select --install` |

> Docker は PostgreSQL 用（およびオプションのデプロイ）、Python は PDF 解析用。片方なくても部分的には動きますが、両方推奨。

---

## 4. 起動する（2 つの方法、どちらか）

### 方法 A：Docker ワンコマンド（最も簡単）

コードを触らず使い始める向け。

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

docker compose up -d --build
```

- 初回ビルド約 3–5 分、以降は即起動
- 起動時に**自動マイグレーション**（手動でテーブル作成は不要）
- 音声/PDF はホストの `./data/storage` にマウント（イメージ更新でも消失しません）

**起動確認**：

```bash
docker compose ps        # 3 コンテナが running / healthy
```

| サービス | URL |
|---|---|
| Web | http://localhost:3000 |
| API（Swagger /docs） | http://localhost:3001/api |
| PostgreSQL | localhost:5433（ユーザー `elp` / パスワード `elp_dev_password`） |

デモコースを追加（24 秒の合成音声 + 対訳テキスト）：

```bash
docker compose exec api node_modules/.bin/tsx prisma/seed.ts
```

**日常操作**：`docker compose logs -f api`（ログ）· `docker compose down`（停止・データ保持）· `docker compose up -d`（再起動）

### 方法 B：ローカル開発モード（コードを変更する向け）

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

# 1. 依存インストール
pnpm install

# 2. PDF パーサー準備（Python venv + PyMuPDF）
pnpm setup:parser

# 3. PostgreSQL 起動（DB のみ Docker）
pnpm db:up

# 4. スキーマ + デモデータ
pnpm --filter @elp/api prisma migrate deploy
pnpm db:seed

# 5. バックエンド + フロント同時起動（両方ホットリロード）
pnpm dev
```

http://localhost:3000 を開くと学習ダッシュボードが表示され、コース一覧にシードデータ **「EP1 - Asking Questions」** があります。開くとプレイヤーが再生され（24 秒の合成トーン）、対訳クリックでシークできます。

> ホットリロード：`apps/web` は Next.js、`apps/api` は Nest watch。`packages/*` の変更は再ビルドが必要（`pnpm exec turbo run build --filter @elp/player` など）。

**分割起動**：

```bash
pnpm dev:api        # バックエンドのみ
pnpm dev:web        # Web のみ
pnpm dev:desktop    # Electron クライアント（API が起動済みであること）
```

---

## 5. 最初のコース取り込み（完全フロー）

プロジェクトの中核的な使い方です。1 エピソードを例に。

### 5.1 ファイル準備

同じエピソードの教材をフォルダにまとめ、**エピソード番号で名前対応**させます（自動マッチングの鍵）：

```
Episode 1.mp3                          ← 音声（聴くなら必須）
Episode 1（対訳）.pdf                   ← 対訳テキスト（読むなら必須）
Episode 1 （英語字幕）.srt               ← 英語字幕（強く推奨：実タイムスタンプ）
Episode 1（中国語字幕）.srt              ← 中国語字幕（任意）
```

対応形式：`pdf / txt / srt / mp3 / m4a / wav / mp4`、1 ファイル 200MB まで。
**許容差**：全角括号・空白・「字幕/対訳」接尾辞は自動で無視 — システムはエピソード番号だけを見ます（`Episode 1` ≡ `episode1`）。
**分けてアップロード可**：先に MP3 だけでも OK。システムが自動でグルーピングします（5.5 参照）。

### 5.2 アップロード

Web → **インポート** → 「ファイル選択（複数可）」→ 上記のグループを選択 → アップロード。

バックエンドが自動で実行：

1. 内容重複排除（同 sha256 は 1 保存。再アップロードは解析結果を再利用）
2. PDF 解析：段落抽出、英中ペアリング、ヘッダー/ウォーターマーク除去、低信頼度マーキング
3. 字幕解析（ローリング字幕の行単位重複排除含む）
4. 字幕から PDF 段落へ実タイムスタンプ割り当て（約 60% 自動整列、残りは手動校正用）
5. 同番号 MP3 をコースへ自動紐付け

### 5.3 校正（人間による確認）

ジョブが **REVIEWING** になったら開いて**校正画面**へ：

- 上部はファイル一覧（状態・段落数）
- テキストファイルをクリック → **段落校正リスト**：
  - **✎ 編集**：英/中テキストを直接修正
  - **✂ 分割**：長い段落を文の境界で 2 つに
  - **統合**：隣接する複数段落を選択してワンクリック統合
  - **↑↓** 並べ替え · **🗑** 削除（誤認識ヘッダーなど）
  - **低信頼度段落にアンバーマーカー**（左バー + パーセント）— ここを優先的に校正
- 段落右側に割り当てられたタイムスタンプ（⏱ 45s）。未割り当ては空表示

### 5.4 公開

下部でタイトル（任意）・カテゴリを入力 → **確認 & 公開**：

- 正式コース生成：対訳テキスト + 音声 + タイムスタンプ + 学習記録が揃う
- **元の PDF/MP3 もアーカイブ**され追跡可能
- ジョブ状態は COMPLETED に。公開済み内容は二重公開されません

### 5.5 分けてアップロードした場合は？

よくあるケース：今日は音声だけ、明日字幕。システムはエピソード番号で自動グルーピング：

- 単独の MP3 は **「テキスト待ち」** 状態（保存済み、同名テキストを待つ）
- 後から同番号の PDF/SRT をアップロード → 処理完了時に**自動でグルーピング**
- ジョブ一覧の **🔍 再マッチング** で即座に手動実行も可能
- 音声のみでも公開可 — 「音声のみコース」になり、テキストは後からコースページの **📎 音声/テキスト追加** で補完

### 5.6 コースへのファイル追加

任意のコースを開く → 右上 **📎 音声/テキスト追加** → ファイル選択 → 即座にコースへ紐付け（字幕追加、高音質版への差し替えなど）。

---

## 6. 学習を始める（コースページガイド）

コースページは 3 つの領域：**上部プレイヤー、中央対訳本文、下部学習ノート**。

### プレイヤー操作

```
[シークバー] 0:45  ⏪ ⏩ ⏮ [▶] ⏭  9:37     Episode 3.mp3     [🔁] [🔂] A-B  1x 🔊
```

| 操作 | 説明 |
|---|---|
| シークバー | クリックでジャンプ。A-B リピート中は範囲がアンバー表示 |
| ⏪ / ⏩ | 5 秒戻る / 進む |
| ⏮ / ⏭ | 前 / 次のトラック（複数音声コース） |
| ▶ / ⏸ | 再生 / 一時停止 |
| 🔁 | トラックリピート（音声全体をループ） |
| 🔂 | センテンスリピート（現在段落をループ — 精聴の主力） |
| A-B | 区間リピート：A-B でモード入り、A / B ボタンで現在時刻を区間の始点/終点に |
| 1x | 倍速：0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x |
| 🔊 | 音量スライダー + ミュート |

### キーボードショートカット（コースページ内）

| キー | 機能 |
|---|---|
| `Space` | 再生 / 一時停止 |
| `←` / `→` | 5 秒戻る / 進む（Shift で 30 秒） |
| `↑` / `↓` | 音量 ±10% |
| `[` / `]` | 倍速 −0.25x / +0.25x |
| `L` | センテンスリピート切替（現在ハイライト段落をループ） |

（入力欄フォーカス中は無効になります。）

### 対訳本文

- **英文パラグラフをクリック** → 音声がその文の冒頭へシークして自動再生。ハイライト + 自動スクロールで中央表示
- 上部 **バイリンガル / 英語のみ / 中国語のみ** 切替
- **↕ 自動スクロール** スイッチ：読みながらのスクロールが不要ならオフ
- 段落ホバーで 3 操作：**☆ お気に入り · 🔤 単語帳へ（最初の長い単語を自動取得）· ⧉ 英中コピー**
- タイムスタンプ付き段落は右側に区間表示。無い段落をクリックするとヒント表示 — 段落時間エディタで手動設定
- 右上 **⏱ 段落時間** でエディタを開く：再生しながら文頭で「起点→」、文末で「終点→」を押して手動校正

**進捗は自動**：再生中 5 秒ごとに無音報告。ダッシュボードの「続きから学習」カードで前回位置から再開できます。

---

## 7. macOS デスクトップクライアント

### パッケージング

```bash
pnpm install
pnpm --filter @elp/desktop package:dir
```

成果物：`apps/desktop/release/mac-arm64/English Podcast Learning.app`（Apple Silicon）。

### 使用

```bash
open "apps/desktop/release/mac-arm64/English Podcast Learning.app"
```

- Web と同等の機能（コース・校正・単語帳・お気に入り）に加え：
- **ネイティブファイルインポート**：インポートページのボタンで macOS のファイル選択ダイアログが開き、選択したら即アップロード
- **システムトレイ**：メニューバー常駐アイコンで再生/一時停止、スキップ（ウィンドウを切替えずに操作）
- **グローバルショートカット**：`⌘⌥E` ウィンドウ表示/非表示 · `⌘⌥P` 再生/一時停止（どのアプリが前面でも有効）
- クライアントは `http://localhost:3001` の API に接続 — バックエンドを起動しておいてください（Docker でも dev でも）

> 初回起動で Gatekeeper に阻まれたら（未署名アプリ）：右クリック → 開く。または
> `xattr -cr "apps/desktop/release/mac-arm64/English Podcast Learning.app"` を実行。

---

## 8. コマンド早見表

| コマンド | 説明 |
|---|---|
| `docker compose up -d --build` | ワンコマンドデプロイ（ビルド + 3 サービス起動） |
| `docker compose logs -f api` | API ログ追跡 |
| `docker compose down` | 停止（データ保持） |
| `docker compose down -v` | 停止 + DB 初期化 |
| `docker compose exec api node_modules/.bin/tsx prisma/seed.ts` | デモコース投入 |
| `pnpm install` | 依存インストール |
| `pnpm setup:parser` | PDF パーサー依存のインストール |
| `pnpm dev` | 開発モード（API + Web） |
| `pnpm dev:desktop` | Electron 開発モード |
| `pnpm build` | フルビルド |
| `pnpm test` / `lint` / `typecheck` | 品質ゲート |
| `pnpm db:up` / `db:down` | PostgreSQL 起動/停止 |
| `pnpm db:migrate` / `db:seed` | マイグレーション / シード |
| `pnpm --filter @elp/api prisma studio` | DB GUI |

---

## 9. アーキテクチャ概観

```
ブラウザ (Next.js)          macOS デスクトップ (Electron + React)
        └──────────┬──────────┘
   共有 packages/*（型 · API クライアント · プレイヤーエンジン · UI · 学習ロジック）
                   │ REST (http://localhost:3001/api)
                   ▼
             NestJS API ──── Prisma ──── PostgreSQL
                   │
      ┌────────────┼──────────────┐
      ▼            ▼              ▼
  ディスク保存   Python PDF パーサー   Cloudflare R2（任意、プライベートバケット + 署名 URL）
(data/storage)  (PyMuPDF 子プロセス)
```

- **16 テーブルのデータモデル**：Course / Transcript / Paragraph / AudioAsset / Progress / Session / Vocabulary / Favorite / ImportJob …（[docs/DATABASE.md](docs/DATABASE.md) 参照）
- **タイムスタンプ整列アルゴリズム**：ローリング字幕の行単位重複排除 → 英語行を主軸にレア語彙アンカーで順序整合（[docs/PDF_IMPORT.md](docs/PDF_IMPORT.md) 参照）
- **3 端末 1 コードベース**：`packages/` のプレイヤーエンジン・対訳リーダー・API クライアントは Web とデスクトップの両方が参照 — 一度の変更で両方に反映

---

## 10. FAQ

**Q1：アップロード後、ジョブがある状態で止まっている？**
ジョブ内の各ファイルのバッジを確認：`PARSED/MATCHED` は正常 · `SKIPPED（テキスト待ち）`は同番号テキスト未検出 — アップロードするか 🔍 再マッチング · `FAILED` は赤いエラー表示＋再試行ボタン。音声ファイルに「解析」は不要で、スピナーが出ることはありません。

**Q2：タイムスタンプのない段落があるのはなぜ？**
自動整列は自信のある段落（約 60%）のみタイムスタンプを付け、残りは空 — システムは時間を捏造しません。校正ページや段落時間エディタで手動設定できます。

**Q3：段落をクリックしても反応しない／タイムスタンプなしと表示される？**
その段落にはまだタイムスタンプがありません。① ⏱ エディタで手動設定、② そのエピソードの SRT をアップロードすれば自動整列されます。

**Q4：中国語ファイル名で文字化けする？**
しません。アップロード時のファイル名エンコード問題（Latin-1 文字化け）は内蔵修復で処理され、Unicode NFC 正規化も行われます。DB 内の過去の文字化け行もサービス起動時に自動修復されます。

**Q5：同じファイルを 2 回アップロードすると？**
sha256 によるコンテンツアドレス型重複排除：ディスクには 1 部のみ、解析結果は即再利用。再インポートでも通常どおり公開でき、重複コースは生成されません。

**Q6：デスクトップクライアントが黒画面/空白？**
API が起動しているか確認（`docker compose ps` または `pnpm dev:api`）— API に接続できない場合、偽データではなく明示的なエラーを表示します。改善しない場合はアプリを削除して再起動、または `~/Library/Logs/DiagnosticReports/` を確認。

**Q7：.app の初回起動が macOS に阻まれる？**
未署名アプリの標準挙動。右クリック → 開く。または `xattr -cr "アプリパス"` を実行。

**Q8：ポートが使用中（3000/3001/5433）？**
`lsof -ti:3001 | xargs kill -9` で解放。または `docker-compose.yml` / 環境変数でポート変更（`API_PORT` / `WEB_PORT` / `POSTGRES_PORT`）。

**Q9：サーバーにデプロイして複数人で使う？**
`ELP_API_URL=https://your-domain docker compose up -d --build`。データモデルは複数ユーザー対応済み、現在はシングルユーザーモード（ログイン不要）です。

---

## 11. ドキュメントマップ（困ったときの参照先）

| 状況 | ドキュメント |
|---|---|
| 全体設計・データフローを理解したい | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| コードを変更・環境のトラブルシュート | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| 16 テーブルの DB を理解したい | [docs/DATABASE.md](docs/DATABASE.md) |
| PDF 解析とタイムスタンプ整列の深掘り | [docs/PDF_IMPORT.md](docs/PDF_IMPORT.md) |
| サーバーデプロイ / R2 ストレージ接続 | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| プロジェクトの進捗確認 | [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) · [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) |

---

<div align="center">

**学習を楽しく · Happy listening 🎧**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

</div>
