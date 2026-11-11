<div align="center">

# EnglishPodcastLearning

**英语播客学习平台 · English Podcast Learning Platform**

*精听 · 双语点读 · 词汇积累 —— 把你的播客资料变成可逐句学习的课程*

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![status](https://img.shields.io/badge/status-MVP%20tested-brightgreen)
![stack](https://img.shields.io/badge/stack-pnpm%20%2B%20Turborepo-blue)
![license](https://img.shields.io/badge/use-personal%20%2F%20educational-orange)

</div>

---

## 这是什么

一个面向英语学习者的**播客精听学习平台**：把你手上的播客资料（MP3 音频、中英对照 PDF、SRT 字幕）自动整理成「可点读、可循环、可记录进度」的课程，配有 Web 网站与 macOS 桌面客户端。

### 核心能力

- 🎧 **音频精学播放器** —— 0.5–2x 倍速、快进快退、单篇循环、单句循环、A-B 区间循环、键盘快捷键（空格 / ←→ / ↑↓ / `[` `]` / `L` / `N` / `P`）、播放位置自动记忆与恢复
- 📖 **双语点读阅读** —— 点击英文段落跳转到对应音频；当前段高亮、自动滚动、纯英文/纯中文/双语切换、复制、收藏句子、加入生词本
- 📥 **智能导入**（核心）
  - 中英对照 PDF 自动解析：段落识别、中英自动配对、页眉/公众号水印过滤、置信度标注（PyMuPDF）
  - SRT 字幕（含**滚动卡拉OK式**字幕）行级去重 → 真实时间戳
  - **词汇锚点对齐算法**：PDF 段落与字幕词形差异大，用罕见词锚点按顺序对齐，自动覆盖 ~60%，其余留给人工校对 —— **绝不伪造时间**
  - 英文 SRT + 中文 SRT + MP3 → 自动合成双语课程
  - 人工校对界面：改写、拆分、合并、排序、删除、低置信度醒目标记
  - **跨任务自动聚合**：MP3 / 英文字幕 / 中文字幕分多次上传也能按集数自动凑组
  - 纯音频也可发布为课程，文本随后在课程页补传
  - 原始 PDF/MP3 永久保留、可追溯
- 📊 **学习记录** —— 今日/累计时长、连续天数、继续上次学习、生词本与复习状态、收藏
- 🖥 **macOS 桌面客户端**（Electron）—— 与 Web 同功能，支持本地文件导入、系统托盘播放控制、全局快捷键

## 快速开始（Docker 一键部署）

```bash
git clone https://github.com/webEngineerWong/EnglishPodcastLearning.git
cd EnglishPodcastLearning

docker compose up -d --build
```

首次构建约 5 分钟，之后秒级启动。启动后：

| 服务 | 地址 |
|---|---|
| Web 网站 | http://localhost:3000 |
| API（Swagger 文档 /docs） | http://localhost:3001/api |
| PostgreSQL | localhost:5433（数据卷持久化） |

已有课程数据自动迁移（API 启动时自动执行 `prisma migrate deploy`）；音频/PDF 存储挂载在宿主机 `./data/storage`。

> 需要演示数据：`docker compose exec api node_modules/.bin/tsx prisma/seed.ts`

## 本地开发

```bash
pnpm install
pnpm setup:parser           # Python venv + PyMuPDF
pnpm db:up                  # PostgreSQL（Docker）
pnpm --filter @elp/api prisma migrate deploy
pnpm db:seed
pnpm dev                    # API :3001 + Web :3000
pnpm dev:desktop            # Electron 客户端
```

## 导入你的资料

1. Web → **导入中心** → 多选同名的一组文件：
   `Episode N（中英文对照）.pdf` + `Episode N.mp3` + `Episode N （英文字幕）.srt` + `Episode N（中文字幕）.srt`
2. 任务完成后进入校对界面（低置信度段落已标黄）→ **确认发布**
3. 分多次上传也没关系 —— 任务列表里点「🔍 重新匹配」，按集数自动聚合
4. 课程页即得：双语点读正文 + 真实时间戳 + 进度记录

详见 [PDF 导入指南](docs/PDF_IMPORT.md)。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` / `dev:web` / `dev:api` / `dev:desktop` | 启动开发服务 |
| `pnpm build` / `test` / `lint` / `typecheck` | 质量门 |
| `pnpm db:up` / `db:migrate` / `db:seed` | 数据库 |
| `docker compose up -d --build` | 一键部署 |
| `pnpm --filter @elp/desktop package:dir` | 打包 macOS .app |

## 技术栈

`pnpm + Turborepo` · Next.js 15 · React 19 · Tailwind CSS · TanStack Query · NestJS · Prisma · PostgreSQL · Electron · Vite · PyMuPDF · Cloudflare R2（可选）

## 文档

| | |
|---|---|
| [架构总览](docs/ARCHITECTURE.md) | 数据流与设计决策 |
| [开发指南](docs/DEVELOPMENT.md) | 环境搭建与常见问题 |
| [数据库设计](docs/DATABASE.md) | 16 模型说明 |
| [PDF 导入](docs/PDF_IMPORT.md) | 解析算法与对齐策略 |
| [部署](docs/DEPLOYMENT.md) | Docker / R2 / 服务器部署 |
| [项目状态](docs/PROJECT_STATUS.md) | 当前进度与已知问题 |

## 说明

- 第一阶段为个人学习使用；数据模型已支持多用户，可扩展为在线服务
- Cloudflare R2 未配置时使用本地存储（`STORAGE_DRIVER=local`），配置密钥后切换私有桶 + 限时签名 URL
- 安全基线：Electron `contextIsolation` ✓ 渲染进程无 Node 权限 ✓ 文件类型/大小白名单 ✓
