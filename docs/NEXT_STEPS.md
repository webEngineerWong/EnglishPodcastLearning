# 下一步（NEXT_STEPS）

> 按顺序执行；每步完成后更新 `docs/PROJECT_STATUS.md`。

## 立即可执行（当前会话继续）

```bash
cd /Users/zubulunwong/codeHub/frontEnd/resources/englishHub/english-podcast-learning

# 1. 启动数据库（如未运行）
pnpm db:up

# 2. 启动 API（终端 1）
pnpm dev:api          # → http://localhost:3001/api  Swagger: http://localhost:3001/docs

# 3. 启动 Web（终端 2）
pnpm dev:web          # → http://localhost:3000

# 4. 启动 Electron（终端 3，Electron 二进制就绪后）
pnpm dev:desktop      # → 桌面窗口
```

## Phase 5 收尾（Electron）

1. 确认 `node_modules/electron/dist` 存在（安装脚本完成后自动存在）。
2. `pnpm dev:desktop` 启动，验证：窗口加载、课程列表、播放器、导入对话框。
3. `pnpm --filter @elp/desktop package:dir` 产出未签名 .app（release/ 目录）。

## Phase 8 完整验收（命令）

```bash
pnpm typecheck        # 全仓 TS strict
pnpm lint             # ESLint
pnpm test             # vitest（learning-core 14 + player 7）
pnpm build            # turbo 全量构建（api/web/desktop renderer）
pnpm --filter @elp/desktop package:dir   # Electron .app
# Playwright（可选）：pnpm exec playwright install chromium 后运行 web 冒烟测试
```

## Phase 9 交付清单

- [x] docs/ARCHITECTURE.md
- [x] docs/DEVELOPMENT.md
- [x] docs/DATABASE.md
- [x] docs/PDF_IMPORT.md
- [x] docs/DEPLOYMENT.md
- [ ] git init + 全量提交（.env/.venv/数据目录已 gitignore）
- [ ] GitHub 授权后创建私有仓库并推送（见下）

## GitHub 推送（需要用户授权，最短命令）

```bash
# 方式 A：安装 gh CLI 并登录
brew install gh
gh auth login
gh repo create english-podcast-learning --private --source=. --remote=origin --push

# 方式 B：已有 SSH key / https remote
git remote add origin git@github.com:<你的用户名>/english-podcast-learning.git
git push -u origin main
```

## 导入你的 248 篇资料（推荐流程）

1. Web → 导入中心，**每批选择 10–20 个 `Episode N（中英文对照）.pdf` + 对应 `Episode N.mp3` + 英文 `Episode N.srt`**（同名自动匹配）。
2. 逐个任务校对 → 发布（低置信度段落已标注）。
3. Level 分类建议先建 Level 1–5 分类，发布时选择对应分类。

## 后续路线图

- Whisper 自动对齐（把无时间戳段落补齐，允许人工修正）
- 词汇 API（词典释义 + 发音）
- 中文字幕 SRT 双语合并对齐（当前只用英文 SRT 对齐）
- Electron 打包签名 + 自动更新
- R2 云存储接入与 Web 部署
