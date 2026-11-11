<div align="center">

# EnglishPodcastLearning

**English Podcast Learning Platform**

*Deep listening · Bilingual tap-to-read · Vocabulary building — turn your podcast materials into learnable lessons*

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![status](https://img.shields.io/badge/status-MVP%20tested-brightgreen)
![stack](https://img.shields.io/badge/stack-pnpm%20%2B%20Turborepo-blue)

</div>

---

> This README is written in the order a first-time visitor would go through:
> **understand the project → read the structure → prepare the environment → run it → import a course → start learning → desktop client → FAQ**.
> Follow it and you'll have your own podcast deep-listening platform running within 30 minutes.

---

## 1. What is this? What problem does it solve?

When learning with English podcasts, you usually end up with scattered materials: **MP3 audio, bilingual PDF transcripts, SRT subtitles**. The pain:

- Audio and text are out of sync — hearing an unfamiliar sentence means scrubbing the timeline back and forth
- PDF in one app, audio in another, vocabulary in a third — every learning action is interrupted
- No progress tracking — which minute did you stop at yesterday?

**EnglishPodcastLearning organizes these materials into "tap-to-read courses" automatically:**

1. Upload a same-numbered group of `MP3 + bilingual PDF + EN/ZH subtitles`
2. The system parses the PDF, groups files by episode number, and assigns **real timestamps** to every paragraph from the subtitles
3. Review in the UI, publish with one click
4. Open the course: **click an English paragraph and the audio jumps to that sentence**, with bilingual side-by-side reading and one-click vocabulary capture

Includes a **web app** (browser) and a **macOS desktop client** (Electron) with identical feature sets sharing one backend.

### Feature overview

| Module | Capability |
|---|---|
| 🎧 Player | 0.5–2x speed, skip ±5/30s, repeat track, repeat paragraph, A-B loop, keyboard shortcuts, automatic position memory |
| 📖 Bilingual reading | Click-to-seek paragraphs, active highlight, auto-scroll, EN/ZH/bilingual toggle, copy, favorite, vocabulary capture |
| 📥 Smart import | Bilingual PDF parsing with pairing & watermark filtering (PyMuPDF), rolling-karaoke SRT line dedup, vocabulary-anchor timestamp alignment, cross-job auto-grouping, human review, audio-only courses |
| 📊 Learning records | Today/total time, streak days, continue-where-you-left-off, vocabulary review states, favorites |
| 🖥 Desktop | Native file import, tray playback controls, global shortcuts, offline window |

**One design principle**: paragraph timestamps come only from real subtitle alignment (~60% auto coverage) or manual calibration — paragraphs that can't be aligned stay empty. **Timestamps are never fabricated.**

---

## 2. Project structure tour

One minute here saves confusion later:

```
EnglishPodcastLearning/
├── apps/
│   ├── api/          NestJS backend — all business logic, REST API, Swagger docs
│   │   └── prisma/   database models, migrations, seed data
│   ├── web/          Next.js site — browser UI
│   └── desktop/      Electron client — macOS .app
├── packages/
│   ├── types/        shared TypeScript types (one vocabulary for all three ends)
│   ├── api-client/   unified API client (web & desktop share it)
│   ├── learning-core/ pure logic: SRT parsing, timestamp alignment, loop math
│   ├── player/       audio player engine + React components (shared)
│   ├── ui/           shared UI components, theme, i18n copy
│   └── config/       shared tsconfig / Tailwind / ESLint presets
├── services/
│   └── pdf-parser/   Python PDF parser (PyMuPDF, spawned by the API)
├── data/
│   ├── storage/      uploaded audio/PDFs actually live here (Docker volume mount)
│   ├── imports/      import staging
│   └── samples/      samples
├── docs/             detailed docs (architecture/database/import/deployment…)
├── docker-compose.yml  one-command deployment (PostgreSQL + API + Web)
├── Dockerfile          multi-stage build
└── turbo.json        task orchestration
```

**Architecture in two sentences**: `web / desktop` are two shells sharing everything in `packages/`; they only talk to `api/`. The API stores files on disk and data in PostgreSQL, and spawns a Python script for PDF parsing.

---

## 3. Environment preparation

Check each of these in a terminal:

| Tool | Version | Check | Install |
|---|---|---|---|
| Node.js | ≥ 20 | `node -v` | [nodejs.org](https://nodejs.org) or `brew install node` |
| pnpm | ≥ 12 | `pnpm -v` | `corepack enable` (bundled with Node) or `npm i -g pnpm` |
| Docker | any recent | `docker info` | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Python 3 | ≥ 3.9 | `python3 --version` | macOS built-in / `brew install python` |
| Git | any recent | `git --version` | `xcode-select --install` |

> Docker is used for PostgreSQL (and optional one-command deployment); Python powers PDF parsing. You can skip either one for a partial run, but installing both is recommended.

---

## 4. Run it (pick one)

### Option A: Docker, one command (easiest — start here)

For: using the product without touching code.

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

docker compose up -d --build
```

- First build ~3–5 minutes (dependency pull + compile); later starts are instant
- Database migrations run **automatically on container start** — no manual table setup
- Audio/PDF storage is bind-mounted at `./data/storage` — upgrading images never loses files

**Verify it's up**:

```bash
docker compose ps        # three containers running / healthy
```

| Service | URL | You should see |
|---|---|---|
| Web app | http://localhost:3000 | learning dashboard |
| API | http://localhost:3001/api | JSON |
| API docs (Swagger) | http://localhost:3001/docs | interactive docs |
| PostgreSQL | localhost:5433 | user `elp` / password `elp_dev_password` |

Optional demo course (a 24-second synthesized audio + bilingual text to try the player immediately):

```bash
docker compose exec api node_modules/.bin/tsx prisma/seed.ts
```

**Daily operations**: `docker compose logs -f api` (logs) · `docker compose down` (stop, data kept) · `docker compose up -d` (start again)

### Option B: Local dev mode (when you want to change code)

For: reading/modifying the source with hot reload.

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

# 1. install dependencies (entire workspace at once)
pnpm install

# 2. prepare the PDF parser (Python venv + PyMuPDF)
pnpm setup:parser

# 3. start PostgreSQL (Docker runs the database only)
pnpm db:up

# 4. schema + demo data
pnpm --filter @elp/api prisma migrate deploy
pnpm db:seed

# 5. run backend + frontend together (both hot-reload)
pnpm dev
```

Open http://localhost:3000 — you should see the learning dashboard, and the course list contains the seeded **「EP1 - Asking Questions」** demo: click in, the player plays (24s synthesized tones), clicking bilingual paragraphs seeks audio.

> Hot reload: `apps/web` via Next.js, `apps/api` via Nest watch. Changes in `packages/*` require a rebuild (`pnpm exec turbo run build --filter @elp/player` etc.).

**Split startup** (when you want isolated logs):

```bash
pnpm dev:api        # backend only
pnpm dev:web        # web only
pnpm dev:desktop    # Electron client (needs the API running)
```

---

## 5. Importing your first course (full workflow)

This is the core usage. One podcast episode as an example.

### 5.1 Prepare the files

Put one episode's materials in a folder, **named by episode number** (this drives auto-matching):

```
Episode 1.mp3                          ← audio (needed for listening)
Episode 1（bilingual）.pdf              ← transcript (needed for reading)
Episode 1 （English subtitles）.srt     ← EN subtitles (strongly recommended: real timestamps)
Episode 1（Chinese subtitles）.srt      ← ZH subtitles (optional)
```

Supported: `pdf / txt / srt / mp3 / m4a / wav / mp4`, max 200MB per file.
**Tolerances**: full-width brackets, spaces, "subtitles/transcript" suffixes are ignored — matching keys on the episode number (`Episode 1` ≡ `episode1`).
**Splitting across uploads is fine**: audio today, subtitles tomorrow — the system groups them automatically (see 5.5).

### 5.2 Upload

Web → **Import** → 「Select files (multi)」→ pick the group → upload.

The backend automatically:

1. dedupes by content (same sha256 stored once; re-uploads reuse parse results)
2. parses the PDF: paragraph extraction, EN/ZH pairing, header/watermark filtering, confidence scoring
3. parses subtitles (including line-level dedup of rolling karaoke-style ones)
4. assigns real timestamps from subtitles to PDF paragraphs (~60% auto-aligned, the rest left for manual review)
5. attaches the same-numbered MP3 to the course

### 5.3 Review (human QA)

Once the job reaches **REVIEWING**, open it:

- Top: file list (status, paragraph counts)
- Click a text file → **paragraph review list** below:
  - **✎ Edit** inline English/Chinese text
  - **✂ Split** a long paragraph into two at sentence boundaries
  - **Merge** adjacent selected paragraphs
  - **↑↓** reorder · **🗑** delete (e.g. leftover header junk)
  - **Low-confidence paragraphs carry an amber marker** (left bar + percentage) — review these first
- Assigned timestamps appear per paragraph (⏱ 45s); unassigned ones show empty

### 5.4 Publish

Fill in a title (optional), pick a category → **Confirm & Publish**:

- Creates the formal course: bilingual text + audio + timestamps + learning records, all wired
- **Original PDF/MP3 are archived** for traceability
- Job status flips to COMPLETED; published content is never duplicated

### 5.5 Uploading in separate batches?

Very common: audio today, subtitles tomorrow. The system groups by episode number automatically:

- A lone MP3 shows **「Waiting for text」** (stored; waiting for same-numbered text)
- Upload the matching PDF/SRT later → new jobs are **auto-grouped** once processing finishes
- Or click **🔍 Re-match** in the job list to trigger grouping immediately
- Audio-only can be published too — creating an "audio-only course"; attach text later via **📎 Append audio/text** on the course page

### 5.6 Appending files to a course

Open any course → top-right **📎 Append audio/text** → pick a file → instantly attached (for adding subtitles or a better-quality recording).

---

## 6. Start learning (course page guide)

The course page has three zones: **player on top, bilingual text in the middle, notes at the bottom**.

### Player controls

```
[progress bar]  0:45  ⏪ ⏩ ⏮ [▶] ⏭  9:37     Episode 3.mp3     [🔁] [🔂] A-B  1x 🔊
```

| Control | Behavior |
|---|---|
| Progress bar | click to seek; the A-B loop range renders amber |
| ⏪ / ⏩ | skip −5s / +5s |
| ⏮ / ⏭ | previous / next track (multi-audio courses) |
| ▶ / ⏸ | play / pause |
| 🔁 | repeat track (whole audio loops) |
| 🔂 | repeat paragraph (current highlighted paragraph loops — the deep-listening tool) |
| A-B | A-B loop: click A-B to enter range mode, then the A / B buttons stamp the current time as range start/end |
| 1x | speed: 0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x |
| 🔊 | volume slider + mute |

### Keyboard shortcuts (on the course page)

| Key | Action |
|---|---|
| `Space` | play / pause |
| `←` / `→` | skip −5s / +5s (hold Shift for 30s) |
| `↑` / `↓` | volume ±10% |
| `[` / `]` | speed −0.25x / +0.25x |
| `L` | toggle paragraph loop (current highlighted paragraph loops) |

(Shortcuts are disabled while typing in inputs.)

### Bilingual text

- **Click any English paragraph** → audio seeks to its start and plays; the paragraph highlights and auto-scrolls to center
- Top **Bilingual / English / Chinese** toggles display mode
- **↕ Auto-scroll** switch: turn off if you don't want the page to move
- Paragraph hover reveals three actions: **☆ favorite sentence · 🔤 add to vocabulary (auto-picks the first long word) · ⧉ copy EN+ZH**
- Paragraphs with timestamps show their range on the right; clicking a paragraph without one shows a hint — calibrate in the paragraph-timing editor
- Top-right **⏱ Paragraph timing** opens the editor: while playing, click "start→" at a sentence's beginning and "end→" at its close to calibrate timestamps manually

**Progress is automatic**: every 5 seconds of playback is silently reported; the dashboard shows a "Continue learning" card that resumes from your last position.

---

## 7. macOS desktop client

### Packaging

```bash
pnpm install
pnpm --filter @elp/desktop package:dir
```

Output: `apps/desktop/release/mac-arm64/English Podcast Learning.app` (Apple Silicon).

### Using it

```bash
open "apps/desktop/release/mac-arm64/English Podcast Learning.app"
```

- Feature set identical to web (courses, review, vocabulary, favorites), plus:
- **Native file import**: the import page button opens the macOS file picker; selection uploads immediately
- **System tray**: menu-bar icon with play/pause and skip (control playback without switching windows)
- **Global shortcuts**: `⌘⌥E` show/hide window · `⌘⌥P` play/pause (works over any foreground app)
- The client talks to the API at `http://localhost:3001` — keep the backend running (Docker or dev)

> First launch blocked by Gatekeeper (unsigned app): right-click → Open; or run
> `xattr -cr "apps/desktop/release/mac-arm64/English Podcast Learning.app"`

---

## 8. Command cheat sheet

| Command | Description |
|---|---|
| `docker compose up -d --build` | one-command deployment (build + start all three) |
| `docker compose logs -f api` | follow API logs |
| `docker compose down` | stop (data kept) |
| `docker compose down -v` | stop and wipe the database |
| `docker compose exec api node_modules/.bin/tsx prisma/seed.ts` | write demo courses |
| `pnpm install` | install dependencies |
| `pnpm setup:parser` | install PDF parser dependencies |
| `pnpm dev` | dev mode (API + Web) |
| `pnpm dev:desktop` | Electron dev mode |
| `pnpm build` | full build |
| `pnpm test` / `lint` / `typecheck` | quality gates |
| `pnpm db:up` / `db:down` | start/stop PostgreSQL |
| `pnpm db:migrate` / `db:seed` | migrations / seed data |
| `pnpm --filter @elp/api prisma studio` | database GUI |

---

## 9. Architecture at a glance

```
Browser (Next.js)          macOS desktop (Electron + React)
        └──────────┬──────────┘
   shared packages/* (types · API client · player engine · UI · learning logic)
                   │ REST (http://localhost:3001/api)
                   ▼
             NestJS API ──── Prisma ──── PostgreSQL
                   │
      ┌────────────┼──────────────┐
      ▼            ▼              ▼
  disk storage  Python PDF parser   Cloudflare R2 (optional, private bucket + signed URLs)
(data/storage)   (PyMuPDF child process)
```

- **16-table data model**: Course / Transcript / Paragraph / AudioAsset / Progress / Session / Vocabulary / Favorite / ImportJob … (see [docs/DATABASE.md](docs/DATABASE.md))
- **Timestamp alignment algorithm**: rolling-subtitle line dedup → EN lines as the spine → rare-word anchors aligned in order (see [docs/PDF_IMPORT.md](docs/PDF_IMPORT.md))
- **Three ends, one codebase**: the player engine, bilingual reader and API client in `packages/` are imported by both web and desktop — change once, works everywhere

---

## 10. FAQ

**Q1: My upload job is stuck in a status?**
Check each file's badge in the job: `PARSED/MATCHED` is normal · `SKIPPED (waiting for text)` means the audio found no same-numbered text — upload it, or hit 🔍 Re-match · `FAILED` shows a red error and offers Retry. Audio files need no "parsing" — they should never spin.

**Q2: Why do some paragraphs have no timestamps?**
Auto-alignment only stamps paragraphs it's confident about (~60%); the rest stay empty — the system never invents times. Calibrate manually in the review page or the paragraph-timing editor.

**Q3: Clicking a paragraph does nothing / says "no timestamp"?**
That paragraph has no timestamp yet. Either calibrate it manually (⏱ editor), or upload an SRT for that episode and the system will align automatically.

**Q4: Do Chinese filenames break anything?**
No. Filename encoding issues (Latin-1 mojibake) are repaired on upload, Unicode is normalized, and legacy garbled rows in the database are fixed automatically at service startup.

**Q5: What happens if I upload the same file twice?**
Content-addressed dedup by sha256: one copy on disk, parse results reused instantly. Re-importing still publishes normally and never creates duplicate courses.

**Q6: The desktop client opens to a black/blank window?**
Make sure the API is running (`docker compose ps` or `pnpm dev:api`) — the client shows an explicit error instead of fake data when the API is unreachable. If it persists, delete and reopen the app, or check `~/Library/Logs/DiagnosticReports/`.

**Q7: macOS blocks the first launch of the .app?**
Standard for unsigned apps. Right-click → Open; or run `xattr -cr "path/to/app"`.

**Q8: Port already in use (3000/3001/5433)?**
Free it with `lsof -ti:3001 | xargs kill -9`; or change ports in `docker-compose.yml` / env (`API_PORT` / `WEB_PORT` / `POSTGRES_PORT`).

**Q9: Deploy to a server for multiple users?**
`ELP_API_URL=https://your-domain docker compose up -d --build`. The data model supports multiple users; current mode is single-user (no login).

---

## 11. Docs map (where to look when stuck)

| Scenario | Doc |
|---|---|
| Understand the design & data flow | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Change code / troubleshoot the environment | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Understand the 16 database tables | [docs/DATABASE.md](docs/DATABASE.md) |
| Deep-dive PDF parsing & timestamp alignment | [docs/PDF_IMPORT.md](docs/PDF_IMPORT.md) |
| Deploy to a server / attach R2 storage | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Track project progress | [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) · [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) |

---

<div align="center">

**Happy listening 🎧**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

</div>
