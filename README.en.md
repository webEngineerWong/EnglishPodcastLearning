<div align="center">

# EnglishPodcastLearning

**English Podcast Learning Platform**

*Deep listening · Bilingual tap-to-read · Vocabulary building — turn your podcast materials into learnable lessons*

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![status](https://img.shields.io/badge/status-MVP%20tested-brightgreen)
![stack](https://img.shields.io/badge/stack-pnpm%20%2B%20Turborepo-blue)

</div>

---

## What is this

A **podcast deep-listening platform** for English learners. It turns the materials you already have — MP3 audio, bilingual PDF transcripts, SRT subtitles — into courses you can study sentence by sentence, with a web app and a native macOS desktop client.

### Core features

- 🎧 **Deep-listening player** — 0.5–2x speed, skip ±5s/30s, repeat track / repeat paragraph / A-B loop, keyboard shortcuts (Space / ←→ / ↑↓ / `[` `]` / `L` / `N` / `P`), automatic position memory and resume
- 📖 **Bilingual tap-to-read** — click an English paragraph to jump to its audio; active-paragraph highlight, auto-scroll, English-only / Chinese-only / bilingual toggle, copy, favorite sentences, add to vocabulary
- 📥 **Smart import** (the core)
  - Bilingual PDF parsing: paragraph detection, EN/ZH auto-pairing, header & watermark filtering, confidence scoring (PyMuPDF)
  - SRT subtitles — including **rolling karaoke-style** ones — deduplicated line-by-line into real timestamps
  - **Vocabulary-anchor alignment**: PDF prose and raw transcripts differ in wording, so alignment uses rare-word anchors in reading order; ~60% auto coverage, the rest left for manual review — **timestamps are never fabricated**
  - English SRT + Chinese SRT + MP3 → automatically merged into one bilingual course
  - Human review UI: edit, split, merge, reorder, delete, low-confidence highlighting
  - **Cross-job auto-grouping**: upload the MP3, English SRT and Chinese SRT in separate batches — they are grouped by episode number automatically
  - Audio-only courses are publishable too; attach text later from the course page
  - Original PDF/MP3 are kept forever, fully traceable
- 📊 **Learning records** — today/total time, streak days, continue where you left off, vocabulary with review states, favorites
- 🖥 **macOS desktop client** (Electron) — same feature set as the web, with native file import, tray playback controls and global shortcuts

## Quick start (Docker, one command)

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

docker compose up -d --build
```

First build takes ~5 minutes; later starts are instant.

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API (Swagger at /docs) | http://localhost:3001/api |
| PostgreSQL | localhost:5433 (persistent volume) |

Existing course data migrates automatically (`prisma migrate deploy` runs on container start); audio/PDF files live in the bind-mounted `./data/storage`.

> Demo data: `docker compose exec api node_modules/.bin/tsx prisma/seed.ts`

## Local development

```bash
pnpm install
pnpm setup:parser           # Python venv + PyMuPDF
pnpm db:up                  # PostgreSQL (Docker)
pnpm --filter @elp/api prisma migrate deploy
pnpm db:seed
pnpm dev                    # API :3001 + Web :3000
pnpm dev:desktop            # Electron client
```

## Importing your materials

1. Web → **Import** → multi-select one same-numbered group:
   `Episode N.pdf` + `Episode N.mp3` + `Episode N （English subtitles）.srt` + `Episode N（Chinese subtitles）.srt`
2. When the job finishes, open the review view (low-confidence paragraphs are highlighted) → **Publish**
3. Uploading in separate batches is fine — click **🔍 Re-match** in the job list to group by episode number
4. Your course is ready: bilingual tap-to-read text, real timestamps, progress tracking

See the [PDF import guide](docs/PDF_IMPORT.md) for the algorithms behind it.

## Commands

| Command | Description |
|---|---|
| `pnpm dev` / `dev:web` / `dev:api` / `dev:desktop` | dev servers |
| `pnpm build` / `test` / `lint` / `typecheck` | quality gates |
| `pnpm db:up` / `db:migrate` / `db:seed` | database |
| `docker compose up -d --build` | one-command deployment |
| `pnpm --filter @elp/desktop package:dir` | package macOS .app |

## Tech stack

`pnpm + Turborepo` · Next.js 15 · React 19 · Tailwind CSS · TanStack Query · NestJS · Prisma · PostgreSQL · Electron · Vite · PyMuPDF · Cloudflare R2 (optional)

## Docs

| | |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | data flow & design decisions |
| [Development](docs/DEVELOPMENT.md) | setup & troubleshooting |
| [Database](docs/DATABASE.md) | 16 models explained |
| [PDF import](docs/PDF_IMPORT.md) | parsing & alignment algorithms |
| [Deployment](docs/DEPLOYMENT.md) | Docker / R2 / server |
| [Project status](docs/PROJECT_STATUS.md) | progress & known issues |

## Notes

- Phase 1 is for personal use; the data model already supports multiple users for future online deployment
- Without Cloudflare R2 credentials everything is stored locally (`STORAGE_DRIVER=local`); set keys to switch to a private bucket with signed URLs
- Security baseline: Electron `contextIsolation` ✓ no Node in renderer ✓ file type/size whitelisting ✓
