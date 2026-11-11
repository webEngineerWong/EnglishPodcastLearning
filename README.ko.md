<div align="center">

# EnglishPodcastLearning

**영어 팟캐스트 학습 플랫폼**

*정청(따라듣기) · 이중 언어 대조 읽기 · 어휘 학습 — 여러분의 팟캐스트 자료를 문장 단위 학습 가능한 강의로*

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![status](https://img.shields.io/badge/status-MVP%20tested-brightgreen)
![stack](https://img.shields.io/badge/stack-pnpm%20%2B%20Turborepo-blue)

</div>

---

## 소개

영어 학습자를 위한 **팟캐스트 정청(따라듣기) 플랫폼**입니다. 이미 보유하고 있는 자료(MP3 오디오, 중영 대조 PDF, SRT 자막)를 문장 단위로 재생·대조 읽기·진도 기록이 가능한 강의로 자동 변환합니다. 웹 앱과 macOS 네이티브 데스크톱 클라이언트를 모두 제공합니다.

### 핵심 기능

- 🎧 **정청 플레이어** — 0.5–2x 배속, ±5초/30초 건너뛰기, 트랙 반복 / 문장 반복 / A-B 구간 반복, 키보드 단축키(Space / ←→ / ↑↓ / `[` `]` / `L` / `N` / `P`), 재생 위치 자동 저장 및 복원
- 📖 **이중 언어 대조 읽기** — 영어 문단을 클릭하면 해당 오디오 구간으로 이동. 현재 문단 하이라이트, 자동 스크롤, 영어만/중국어만/이중 언어 표시 전환, 복사, 문장 즐겨찾기, 단어장 추가
- 📥 **스마트 임포트** (핵심 기능)
  - 중영 대조 PDF 자동 파싱: 문단 인식, 영·중 자동 페어링, 머리글·워터마크 필터링, 신뢰도 점수(PyMuPDF)
  - SRT 자막(**가라오케식 롤링 자막** 포함)을 행 단위로 중복 제거하여 실제 타임스탬프 생성
  - **어휘 앵커 정렬**: PDF 문장과 원본 자막은 표현 방식이 달라서, 희귀 단어를 앵커로 읽기 순서대로 정렬합니다. 자동 커버리지는 약 60%, 나머지는 수동 교정용 — **타임스탬프는 절대 위조하지 않습니다**
  - 영어 SRT + 중국어 SRT + MP3 → 자동으로 이중 언어 강의로 병합
  - 수동 교정 UI: 편집, 분할, 병합, 재정렬, 삭제, 저신뢰도 하이라이트
  - **작업 간 자동 그룹핑**: MP3·영어 자막·중국어 자막을 나눠서 업로드해도 에피소드 번호로 자동 묶입니다
  - 오디오만 있는 강의도 발행 가능. 텍스트는 나중에 강의 페이지에서 추가
  - 원본 PDF/MP3 영구 보존 및 추적 가능
- 📊 **학습 기록** — 오늘/누적 시간, 연속 학습일, 이어서 학습하기, 복습 상태가 있는 단어장, 즐겨찾기
- 🖥 **macOS 데스크톱 클라이언트** (Electron) — 웹과 동일한 기능에 네이티브 파일 임포트, 트레이 재생 제어, 전역 단축키 지원

## 빠른 시작 (Docker 한 줄)

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

docker compose up -d --build
```

첫 빌드는 약 5분, 이후에는 즉시 시작됩니다.

| 서비스 | 주소 |
|---|---|
| 웹 앱 | http://localhost:3000 |
| API (Swagger /docs) | http://localhost:3001/api |
| PostgreSQL | localhost:5433 (영구 볼륨) |

기존 강의 데이터는 자동 마이그레이션됩니다(컨테이너 시작 시 `prisma migrate deploy` 실행). 오디오/PDF는 `./data/storage`에 마운트됩니다.

> 데모 데이터: `docker compose exec api node_modules/.bin/tsx prisma/seed.ts`

## 로컬 개발

```bash
pnpm install
pnpm setup:parser           # Python venv + PyMuPDF
pnpm db:up                  # PostgreSQL (Docker)
pnpm --filter @elp/api prisma migrate deploy
pnpm db:seed
pnpm dev                    # API :3001 + Web :3000
pnpm dev:desktop            # Electron 클라이언트
```

## 자료 임포트 방법

1. 웹 → **가져오기** → 같은 번호의 파일 그룹을 다중 선택:
   `Episode N.pdf` + `Episode N.mp3` + `Episode N （영어 자막）.srt` + `Episode N（중국어 자막）.srt`
2. 작업 완료 후 교정 화면을 열고(저신뢰도 문단은 강조 표시됨) → **발행**
3. 나눠서 업로드해도 괜찮습니다 — 작업 목록의 **🔍 다시 매칭**을 누르면 에피소드 번호별로 자동 그룹핑
4. 강의 페이지에서 이중 언어 대조 본문, 실제 타임스탬프, 진도 기록을 바로 사용할 수 있습니다

자세한 알고리즘은 [PDF 임포트 가이드](docs/PDF_IMPORT.md)를 참고하세요.

## 명령어

| 명령어 | 설명 |
|---|---|
| `pnpm dev` / `dev:web` / `dev:api` / `dev:desktop` | 개발 서버 시작 |
| `pnpm build` / `test` / `lint` / `typecheck` | 품질 게이트 |
| `pnpm db:up` / `db:migrate` / `db:seed` | 데이터베이스 |
| `docker compose up -d --build` | 원커맨드 배포 |
| `pnpm --filter @elp/desktop package:dir` | macOS .app 패키징 |

## 기술 스택

`pnpm + Turborepo` · Next.js 15 · React 19 · Tailwind CSS · TanStack Query · NestJS · Prisma · PostgreSQL · Electron · Vite · PyMuPDF · Cloudflare R2 (선택)

## 문서

| | |
|---|---|
| [아키텍처](docs/ARCHITECTURE.md) | 데이터 흐름과 설계 결정 |
| [개발 가이드](docs/DEVELOPMENT.md) | 환경 구성과 문제 해결 |
| [데이터베이스](docs/DATABASE.md) | 16개 모델 설명 |
| [PDF 임포트](docs/PDF_IMPORT.md) | 파싱 및 정렬 알고리즘 |
| [배포](docs/DEPLOYMENT.md) | Docker / R2 / 서버 배포 |
| [프로젝트 상태](docs/PROJECT_STATUS.md) | 진행 상황과 알려진 이슈 |

## 비고

- 1단계는 개인 학습용입니다. 데이터 모델은 이미 다중 사용자를 지원하며, 추후 온라인 서비스로 확장 가능합니다
- Cloudflare R2 자격 증명이 없으면 로컬 저장(`STORAGE_DRIVER=local`)을 사용하며, 키를 설정하면 프라이빗 버킷 + 서명 URL로 전환됩니다
- 보안 기준: Electron `contextIsolation` ✓ 렌더러에 Node 권한 없음 ✓ 파일 형식/크기 화이트리스트 ✓
