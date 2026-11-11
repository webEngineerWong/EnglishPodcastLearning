# English Learning Platform

面向英语学习者的**听力精学平台**：播客 MP3 + 中英对照 PDF + SRT 字幕 → 自动整理为可点读、可循环、可记录进度的课程。含 **Web 网站** 与 **macOS Electron 客户端**。

![status](https://img.shields.io/badge/phase-MVP%20tested-brightgreen)

## 核心能力

- 🎧 **音频精学播放器**：0.5–2x 倍速、快进快退、单篇循环、单句循环、A-B 区间循环、键盘快捷键（空格/←→/↑↓/[]/L/N/P）、播放位置记忆与恢复
- 📖 **双语文本学习**：点击英文段落跳转对应音频、当前段高亮、自动滚动、仅英文/仅中文/双语切换、复制、收藏句子、加入生词本
- 📥 **PDF 智能导入**：中英对照 PDF 自动解析配对（PyMuPDF）、页眉/公众号水印过滤、SRT（含滚动卡拉OK式）真实时间戳自动对齐（60% 覆盖，其余留人工校对，**绝不伪造时间**）、人工校对界面（拆分/合并/改写/排序）、批量导入与重试、原始 PDF 永久保留
- 📊 **学习记录**：今日/累计时长、连续天数、继续上次学习、生词本与复习状态、收藏

## 技术栈

`pnpm + Turborepo` · Next.js 15 · React 19 · Tailwind · TanStack Query · NestJS · Prisma · PostgreSQL · Electron · Vite · PyMuPDF · Cloudflare R2（可选）

## 快速开始

```bash
pnpm install
pnpm setup:parser          # Python venv + PyMuPDF
pnpm db:up                 # PostgreSQL (Docker, :5433)
pnpm --filter @elp/api prisma migrate deploy
pnpm db:seed               # 演示课程
pnpm dev                   # API :3001 + Web :3000
```

打开 http://localhost:3000 。Swagger: http://localhost:3001/docs

Electron 桌面端：

```bash
pnpm dev:desktop           # 开发模式
pnpm --filter @elp/desktop package:dir   # 打包 .app
```

## 导入你的资料（248 篇）

1. Web → **导入中心** → 多选 `Episode N（中英文对照）.pdf` + `Episode N.mp3` + 英文 `Episode N.srt`（同名自动匹配）
2. 进入任务 → 校对（低置信度段已标黄）→ **发布**
3. 课程页即得：点读双语正文 + 真实时间戳 + 进度记录

详见 [docs/PDF_IMPORT.md](docs/PDF_IMPORT.md)

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` / `dev:web` / `dev:api` / `dev:desktop` | 开发 |
| `pnpm build` / `test` / `lint` / `typecheck` | 质量门 |
| `pnpm db:up` / `db:migrate` / `db:seed` | 数据库 |

## 文档

- [架构](docs/ARCHITECTURE.md) · [开发](docs/DEVELOPMENT.md) · [数据库](docs/DATABASE.md) · [PDF 导入](docs/PDF_IMPORT.md) · [部署](docs/DEPLOYMENT.md)
- [项目状态](docs/PROJECT_STATUS.md) · [下一步](docs/NEXT_STEPS.md)

## 安全

- Electron：contextIsolation ✓ nodeIntegration ✗ preload 最小暴露 ✓ 文件类型/大小白名单 ✓
- 上传：类型/大小校验；存储：本地默认 local，可切 R2 私有桶 + 限时签名 URL
- 密钥仅存 .env（不入库）；个人资料目录在仓库之外
