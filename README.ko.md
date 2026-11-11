<div align="center">

# EnglishPodcastLearning

**영어 팟캐스트 학습 플랫폼**

*정청(따라듣기) · 이중 언어 대조 읽기 · 어휘 학습 — 여러분의 팟캐스트 자료를 문장 단위 학습 가능한 강의로*

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![status](https://img.shields.io/badge/status-MVP%20tested-brightgreen)
![stack](https://img.shields.io/badge/stack-pnpm%20%2B%20Turborepo-blue)

</div>

---

> 이 README는 처음 프로젝트를 접하는 순서대로 작성되었습니다:
> **프로젝트 이해 → 구조 파악 → 환경 준비 → 실행 → 강의 가져오기 → 학습 시작 → 데스크톱 클라이언트 → FAQ**.
> 순서대로 따라가면 30분 안에 자신만의 팟캐스트 정청 플랫폼을 갖추게 됩니다.

---

## 1. 이것은 무엇이고, 어떤 문제를 해결하나?

영어 팟캐스트를 학습하면 자료가 흩어지기 쉽습니다: **MP3 오디오, 중영 대조 PDF, SRT 자막**. 불편함:

- 오디오와 텍스트가 맞지 않아 모르는 문장을 만나면 시크바를 왕복
- PDF는 뷰어에서, 오디오는 플레이어에서, 단어는 별도 장소에서 — 학습 흐름이 계속 끊김
- 진도가 기록되지 않아 어제 몇 분까지 들었는지 잊어버림

**EnglishPodcastLearning은 이 자료들을 "클릭으로 재생 가능한 강의"로 자동 변환합니다:**

1. 같은 번호의 `MP3 + 대조 PDF + 영/중 자막` 그룹 업로드
2. 시스템이 PDF를 파싱하고, 에피소드 번호로 파일을 묶고, 자막에서 각 문단에 **실제 타임스탬프**를 할당
3. UI에서 교정 후 한 번의 클릭으로 발행
4. 강의를 열면: **영어 문단을 클릭하면 오디오가 그 문장으로 점프**, 이중 언어 대조 읽기와 원클릭 어휘 수집

**웹 앱**(브라우저)과 **macOS 데스크톱 클라이언트**(Electron)를 모두 제공하며, 기능이 동일하고 백엔드를 공유합니다.

### 기능 개요

| 모듈 | 기능 |
|---|---|
| 🎧 플레이어 | 0.5–2x 배속, ±5/30초 스킵, 트랙 반복, 문장 반복, A-B 구간 반복, 키보드 단축키, 재생 위치 자동 기억 |
| 📖 대조 읽기 | 클릭으로 시크, 하이라이트, 자동 스크롤, 영어만/중국어만/이중 언어 전환, 복사, 즐겨찾기, 어휘 수집 |
| 📥 스마트 임포트 | 대조 PDF 파싱·페어링·워터마크 필터링(PyMuPDF), 롤링 카라오케 SRT 행 단위 중복 제거, 어휘 앵커 타임스탬프 정렬, 작업 간 자동 그룹핑, 수동 교정, 오디오 전용 강의 |
| 📊 학습 기록 | 오늘/누적 시간, 연속 학습일, 이어서 학습, 복습 상태 단어장, 즐겨찾기 |
| 🖥 데스크톱 | 네이티브 파일 임포트, 트레이 재생 제어, 전역 단축키 |

**하나의 설계 원칙**: 문단 타임스탬프는 실제 자막 정렬(자동 커버리지 약 60%) 또는 수동 캘리브레이션에서만 제공됩니다. 정렬되지 않은 문단은 빈 채로 두며 **타임스탬프는 절대 위조하지 않습니다**.

---

## 2. 프로젝트 구조 투어

1분만 투자해 디렉터리를 이해하면 이후에 길을 잃지 않습니다:

```
EnglishPodcastLearning/
├── apps/
│   ├── api/          NestJS 백엔드 — 모든 비즈니스 로직, REST API, Swagger 문서
│   │   └── prisma/   DB 모델, 마이그레이션, 시드 데이터
│   ├── web/          Next.js 사이트 — 브라우저 UI
│   └── desktop/      Electron 클라이언트 — macOS .app
├── packages/
│   ├── types/        공유 TypeScript 타입(3단 공통 언어)
│   ├── api-client/   통합 API 클라이언트(웹/데스크톱 공용)
│   ├── learning-core/ 순수 로직: SRT 파싱, 타임스탬프 정렬, 루프 계산
│   ├── player/       오디오 플레이어 엔진 + React 컴포넌트(공용)
│   ├── ui/           공유 UI 컴포넌트, 테마, i18n 문안
│   └── config/       공유 tsconfig / Tailwind / ESLint 프리셋
├── services/
│   └── pdf-parser/   Python PDF 파서(PyMuPDF, API가 자식 프로세스로 호출)
├── data/
│   └── storage/      업로드된 오디오/PDF 실제 저장 위치(Docker 볼륨 마운트)
├── docs/             상세 문서(아키텍처/DB/임포트/배포…)
├── docker-compose.yml  원커맨드 배포(PostgreSQL + API + Web)
├── Dockerfile          멀티스테이지 빌드
└── turbo.json        태스크 편성
```

**두 문장으로 아키텍처 요약**: `web / desktop`은 `packages/`의 학습 로직을 모두 공유하는 두 개의 "쉘"이며 `api/`와만 통신합니다. `api/`는 파일을 디스크에, 데이터를 PostgreSQL에 저장하고 PDF 파싱 시 Python 스크립트를 호출합니다.

---

## 3. 환경 준비

터미널에서 하나씩 확인:

| 도구 | 버전 | 확인 | 설치 |
|---|---|---|---|
| Node.js | ≥ 20 | `node -v` | [nodejs.org](https://nodejs.org) 또는 `brew install node` |
| pnpm | ≥ 12 | `pnpm -v` | `corepack enable` 또는 `npm i -g pnpm` |
| Docker | 최근 버전 | `docker info` | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Python 3 | ≥ 3.9 | `python3 --version` | macOS 내장 / `brew install python` |
| Git | 최근 버전 | `git --version` | `xcode-select --install` |

> Docker는 PostgreSQL용(및 선택적 원커맨드 배포), Python은 PDF 파싱용입니다. 하나 없이도 부분 실행은 가능하지만 둘 다 설치를 권장합니다.

---

## 4. 실행하기(둘 중 하나 선택)

### 방법 A: Docker 원커맨드(가장 간단 — 여기서 시작)

코드를 건드리지 않고 사용하는 경우.

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

docker compose up -d --build
```

- 첫 빌드 약 3–5분(의존성 다운로드 + 컴파일), 이후는 즉시 시작
- 시작 완료 시 **자동 마이그레이션** — 수동 테이블 생성 불필요
- 오디오/PDF는 호스트의 `./data/storage`에 바인드 마운트 — 이미지 업그레이드해도 파일이 사라지지 않습니다

**성공 확인**:

```bash
docker compose ps        # 3개 컨테이너가 running / healthy
```

| 서비스 | 주소 | 표시 내용 |
|---|---|---|
| 웹 | http://localhost:3000 | 학습 대시보드 |
| API | http://localhost:3001/api | JSON |
| API 문서(Swagger) | http://localhost:3001/docs | 인터랙티브 문서 |
| PostgreSQL | localhost:5433 | 계정 `elp` / 비밀번호 `elp_dev_password` |

데모 강의 추가(24초 합성 오디오 + 이중 언어 텍스트):

```bash
docker compose exec api node_modules/.bin/tsx prisma/seed.ts
```

**일상 운영**: `docker compose logs -f api`(로그) · `docker compose down`(중지, 데이터 유지) · `docker compose up -d`(재시작)

### 방법 B: 로컬 개발 모드(코드를 수정할 때)

소스를 읽고 수정하며 핫 리로드를 원하는 경우.

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

# 1. 의존성 설치(전체 워크스페이스 한 번에)
pnpm install

# 2. PDF 파서 준비(Python venv + PyMuPDF)
pnpm setup:parser

# 3. PostgreSQL 시작(Docker는 DB만)
pnpm db:up

# 4. 스키마 + 데모 데이터
pnpm --filter @elp/api prisma migrate deploy
pnpm db:seed

# 5. 백엔드 + 프론트 동시 실행(둘 다 핫 리로드)
pnpm dev
```

http://localhost:3000 열면 학습 대시보드가 보이고, 강의 목록에 시드 데이터 **「EP1 - Asking Questions」**가 있습니다. 클릭하면 플레이어가 재생되고(24초 합성 톤), 이중 언어 문단 클릭으로 시크할 수 있습니다.

> 핫 리로드: `apps/web`은 Next.js, `apps/api`는 Nest watch. `packages/*` 변경은 재빌드 필요(`pnpm exec turbo run build --filter @elp/player` 등).

**분리 실행**(개별 로그를 보고 싶을 때):

```bash
pnpm dev:api        # 백엔드만
pnpm dev:web        # 웹만
pnpm dev:desktop    # Electron 클라이언트(API 실행 필요)
```

---

## 5. 첫 강의 임포트(전체 워크플로)

프로젝트의 핵심 사용법입니다. 한 에피소드를 예로.

### 5.1 파일 준비

한 에피소드의 자료를 폴더에 모으고 **에피소드 번호로 이름 대응**시킵니다(자동 매칭의 기준):

```
Episode 1.mp3                          ← 오디오(듣기에 필요)
Episode 1（대조）.pdf                    ← 대조 텍스트(읽기에 필요)
Episode 1 （영어 자막）.srt              ← 영어 자막(강력 권장: 실제 타임스탬프)
Episode 1（중국어 자막）.srt              ← 중국어 자막(선택)
```

지원 형식: `pdf / txt / srt / mp3 / m4a / wav / mp4`, 파일당 200MB 이하.
**허용 차이**: 전각 괄호, 공백, "자막/대조" 접미사는 자동 무시 — 시스템은 에피소드 번호만 봅니다(`Episode 1` ≡ `episode1`).
**나눠 업로드 가능**: 오늘 오디오만, 내일 자막도 괜찮습니다 — 시스템이 자동 그룹핑합니다(5.5 참조).

### 5.2 업로드

웹 → **가져오기** → 「파일 선택(다중)」→ 그룹 선택 → 업로드.

백엔드가 자동 처리:

1. 내용 기준 중복 제거(동일 sha256은 한 번만 저장, 재업로드는 파싱 결과 재사용)
2. PDF 파싱: 문단 추출, 영/중 페어링, 머리글/워터마크 필터링, 신뢰도 점수
3. 자막 파싱(롤링 카라오케식 자막의 행 단위 중복 제거 포함)
4. 자막에서 PDF 문단으로 실제 타임스탬프 할당(약 60% 자동 정렬, 나머지는 수동 교정용)
5. 같은 번호 MP3를 강의에 자동 연결

### 5.3 교정(사람이 확인)

작업이 **REVIEWING** 상태가 되면 열어 **교정 화면**으로:

- 위: 파일 목록(상태, 문단 수)
- 텍스트 파일 클릭 → 아래에 **문단 교정 목록**:
  - **✎ 편집**: 영/중 텍스트 직접 수정
  - **✂ 분할**: 긴 문단을 문장 경계에서 둘로
  - **병합**: 인접 선택 문단 일괄 병합
  - **↑↓** 재정렬 · **🗑** 삭제(오인식 머리글 잔여물 등)
  - **저신뢰도 문단에 앰버 마커**(왼쪽 바 + 백분율) — 우선적으로 교정
- 문단 오른쪽에 할당된 타임스탬프 표시(⏱ 45s); 없는 문단은 공란

### 5.4 발행

하단에 강의 제목(선택), 카테고리 입력 → **확인 & 발행**:

- 정식 강의 생성: 이중 언어 텍스트 + 오디오 + 타임스탬프 + 학습 기록 완비
- **원본 PDF/MP3 동시 보관**으로 추적 가능
- 작업 상태가 COMPLETED로 변경; 발행된 내용은 중복 발행되지 않습니다

### 5.5 나눠서 업로드했다면?

매우 흔한 경우: 오늘 오디오, 내일 자막. 시스템이 에피소드 번호로 자동 그룹핑:

- 단독 MP3는 **「텍스트 대기」** 상태 표시(저장됨, 같은 번호 텍스트 대기)
- 이후 같은 번호의 PDF/SRT 업로드 → 새 작업 처리 완료 시 **자동으로 묶임**
- 작업 목록의 **🔍 다시 매칭** 버튼으로 즉시 트리거도 가능
- 오디오만으로도 발행 가능 — "오디오 전용 강의"가 되며, 텍스트는 나중에 강의 페이지의 **📎 오디오/텍스트 추가**로 보완

### 5.6 강의에 파일 추가

강의 열기 → 우측 상단 **📎 오디오/텍스트 추가** → 파일 선택 → 즉시 현재 강의에 연결(자막 추가, 더 좋은 음질 버전 교체 등).

---

## 6. 학습 시작(강의 페이지 가이드)

강의 페이지는 세 영역: **상단 플레이어, 중앙 이중 언어 본문, 하단 학습 노트**.

### 플레이어 컨트롤

```
[시크바] 0:45  ⏪ ⏩ ⏮ [▶] ⏭  9:37     Episode 3.mp3     [🔁] [🔂] A-B  1x 🔊
```

| 컨트롤 | 동작 |
|---|---|
| 시크바 | 클릭으로 이동; A-B 반복 중 구간은 앰버 색 |
| ⏪ / ⏩ | −5초 / +5초 |
| ⏮ / ⏭ | 이전 / 다음 트랙(다중 오디오 강의) |
| ▶ / ⏸ | 재생 / 일시정지 |
| 🔁 | 트랙 반복(전체 오디오 루프) |
| 🔂 | 문장 반복(현재 하이라이트 문단 루프 — 정청의 핵심 도구) |
| A-B | A-B 루프: A-B 클릭으로 모드 진입, A / B 버튼으로 현재 시간을 구간 시작/끝으로 지정 |
| 1x | 배속: 0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x |
| 🔊 | 볼륨 슬라이더 + 음소거 |

### 키보드 단축키(강의 페이지 내)

| 키 | 동작 |
|---|---|
| `Space` | 재생 / 일시정지 |
| `←` / `→` | −5초 / +5초(Shift 누르면 30초) |
| `↑` / `↓` | 볼륨 ±10% |
| `[` / `]` | 배속 −0.25x / +0.25x |
| `L` | 문장 반복 토글(현재 하이라이트 문단 루프) |

(입력창 포커스 시 단축키는 자동 비활성화됩니다.)

### 이중 언어 본문

- **영어 문단 클릭** → 오디오가 그 문장 시작으로 시크하고 자동 재생; 문단 하이라이트 + 자동 스크롤로 중앙 정렬
- 상단 **이중 언어 / 영어만 / 중국어만** 표시 전환
- **↕ 자동 스크롤** 스위치: 페이지가 움직이는 게 싫으면 끄기
- 문단 호버 시 3개 작업: **☆ 문장 즐겨찾기 · 🔤 단어장 추가(첫 긴 단어 자동 선택) · ⧉ 영+중 복사**
- 타임스탬프가 있는 문단은 오른쪽에 구간 표시; 없는 문단 클릭 시 힌트 표시 — 문단 시간 에디터에서 수동 캘리브레이션
- 우측 상단 **⏱ 문단 시간**으로 에디터 열기: 재생 중 문장 시작에「起点→」, 끝에「终点→」클릭으로 수동 캘리브레이션

**진도는 자동**: 재생 5초마다 무음 보고. 대시보드의 "이어서 학습" 카드로 마지막 위치부터 재개합니다.

---

## 7. macOS 데스크톱 클라이언트

### 패키징

```bash
pnpm install
pnpm --filter @elp/desktop package:dir
```

결과물: `apps/desktop/release/mac-arm64/English Podcast Learning.app`(Apple Silicon).

### 사용

```bash
open "apps/desktop/release/mac-arm64/English Podcast Learning.app"
```

- 웹과 동일한 기능 세트(강의, 교정, 단어장, 즐겨찾기)에 추가로:
- **네이티브 파일 임포트**: 임포트 페이지 버튼이 macOS 파일 선택 창을 열고, 선택 즉시 업로드
- **시스템 트레이**: 메뉴바 상주 아이콘으로 재생/일시정지, 스킵(창 전환 없이 제어)
- **전역 단축키**: `⌘⌥E` 창 표시/숨기기 · `⌘⌥P` 재생/일시정지(어떤 앱이 포그라운드여도 작동)
- 클라이언트는 `http://localhost:3001` API에 연결 — 백엔드를 실행 상태로 유지하세요(Docker 또는 dev)

> 첫 실행 시 Gatekeeper 차단(미서명 앱): 우클릭 → 열기. 또는
> `xattr -cr "apps/desktop/release/mac-arm64/English Podcast Learning.app"` 실행.

---

## 8. 명령어 치트시트

| 명령어 | 설명 |
|---|---|
| `docker compose up -d --build` | 원커맨드 배포(빌드 + 3 서비스 시작) |
| `docker compose logs -f api` | API 로그 추적 |
| `docker compose down` | 중지(데이터 유지) |
| `docker compose down -v` | 중지 + DB 초기화 |
| `docker compose exec api node_modules/.bin/tsx prisma/seed.ts` | 데모 강의 입력 |
| `pnpm install` | 의존성 설치 |
| `pnpm setup:parser` | PDF 파서 의존성 설치 |
| `pnpm dev` | 개발 모드(API + Web) |
| `pnpm dev:desktop` | Electron 개발 모드 |
| `pnpm build` | 전체 빌드 |
| `pnpm test` / `lint` / `typecheck` | 품질 게이트 |
| `pnpm db:up` / `db:down` | PostgreSQL 시작/중지 |
| `pnpm db:migrate` / `db:seed` | 마이그레이션 / 시드 데이터 |
| `pnpm --filter @elp/api prisma studio` | DB GUI |

---

## 9. 아키텍처 한눈에

```
브라우저 (Next.js)          macOS 데스크톱 (Electron + React)
        └──────────┬──────────┘
   공유 packages/*(타입 · API 클라이언트 · 플레이어 엔진 · UI · 학습 로직)
                   │ REST (http://localhost:3001/api)
                   ▼
             NestJS API ──── Prisma ──── PostgreSQL
                   │
      ┌────────────┼──────────────┐
      ▼            ▼              ▼
  디스크 저장    Python PDF 파서     Cloudflare R2(선택, 프라이빗 버킷 + 서명 URL)
(data/storage)  (PyMuPDF 자식 프로세스)
```

- **16개 테이블 데이터 모델**: Course / Transcript / Paragraph / AudioAsset / Progress / Session / Vocabulary / Favorite / ImportJob …([docs/DATABASE.md](docs/DATABASE.md) 참조)
- **타임스탬프 정렬 알고리즘**: 롤링 자막 행 단위 중복 제거 → 영어 행을 주축으로 희귀 어휘 앵커 순서 정렬([docs/PDF_IMPORT.md](docs/PDF_IMPORT.md) 참조)
- **3단 1 코드베이스**: `packages/`의 플레이어 엔진, 대조 리더, API 클라이언트는 웹과 데스크톱 모두 참조 — 한 곳 수정, 양쪽 반영

---

## 10. FAQ

**Q1: 업로드 후 작업이 어떤 상태에 멈춰 있는데요?**
작업 내 각 파일의 배지 확인: `PARSED/MATCHED` 정상 · `SKIPPED(텍스트 대기)`는 오디오가 같은 번호의 텍스트를 못 찾은 것 — 업로드하거나 🔍 다시 매칭 · `FAILED`은 빨간 오류 표시와 재시도 버튼 제공. 오디오 파일에 "파싱"은 필요 없으므로 스피너가 나오지 않습니다.

**Q2: 타임스탬프 없는 문단이 있는 이유?**
자동 정렬은 확신 있는 문단(약 60%)에만 타임스탬프를 부여하고 나머지는 공란 — 시스템은 시간을 만들어내지 않습니다. 교정 페이지나 문단 시간 에디터에서 수동 설정 가능.

**Q3: 문단 클릭이 반응 없음/"타임스탬프 없음" 표시?**
그 문단에는 아직 타임스탬프가 없습니다. ① ⏱ 에디터에서 수동 설정, ② 해당 에피소드의 SRT를 업로드하면 자동 정렬됩니다.

**Q4: 중국어 파일명이 문제되나요?**
아니요. 업로드 시 파일명 인코딩 문제(Latin-1 문자 깨짐)는 업로드 시점에 복구되고, Unicode NFC 정규화도 수행됩니다. DB의 과거 깨진 행도 서비스 시작 시 자동 복구됩니다.

**Q5: 같은 파일을 두 번 업로드하면?**
sha256 기반 컨텐츠 어드레스 중복 제거: 디스크에 한 부만 저장, 파싱 결과 즉시 재사용. 재임포트도 정상 발행되며 중복 강의는 생성되지 않습니다.

**Q6: 데스크톱 클라이언트가 검은 화면/공백으로 열리는데요?**
API 실행 확인(`docker compose ps` 또는 `pnpm dev:api`) — API에 연결할 수 없으면 가짜 데이터 대신 명시적 오류를 표시합니다. 지속되면 앱을 삭제 후 재시작하거나 `~/Library/Logs/DiagnosticReports/` 확인.

**Q7: .app 첫 실행이 macOS에 차단됨?**
미서명 앱의 표준 안내. 우클릭 → 열기. 또는 `xattr -cr "앱 경로"` 실행.

**Q8: 포트가 이미 사용 중(3000/3001/5433)?**
`lsof -ti:3001 | xargs kill -9`로 해제. 또는 `docker-compose.yml` / 환경변수로 포트 변경(`API_PORT` / `WEB_PORT` / `POSTGRES_PORT`).

**Q9: 서버에 배포해 여러 명이 사용하려면?**
`ELP_API_URL=https://your-domain docker compose up -d --build`. 데이터 모델은 다중 사용자 지원, 현재는 싱글 유저 모드(로그인 불필요)입니다.

---

## 11. 문서 맵(막혔을 때 참고처)

| 상황 | 문서 |
|---|---|
| 전체 설계·데이터 흐름 이해 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 코드 수정·환경 문제 해결 | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| 16개 DB 테이블 이해 | [docs/DATABASE.md](docs/DATABASE.md) |
| PDF 파싱·타임스탬프 정렬 심화 | [docs/PDF_IMPORT.md](docs/PDF_IMPORT.md) |
| 서버 배포 / R2 스토리지 연결 | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| 프로젝트 진행 상황 | [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) · [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) |

---

<div align="center">

**즐거운 학습 되세요 · Happy listening 🎧**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

</div>
