# 架构（ARCHITECTURE）

## 总览

```
english-podcast-learning/
├── apps/
│   ├── web/        Next.js 15 (App Router) — 网站端，SSR/SEO
│   ├── desktop/    Electron 33 + Vite + React — macOS 桌面端（独立渲染工程，不依赖 Next SSR）
│   └── api/        NestJS 10 + Prisma 6 — REST API + Swagger(/docs)
├── packages/
│   ├── types/        共享领域类型与常量（零依赖）
│   ├── api-client/   fetch 版 API 客户端（Web/Electron 共用；/api 前缀统一注入，/storage/* 直链除外）
│   ├── learning-core/ 纯业务逻辑：SRT 解析（普通/滚动卡拉OK）、时间戳锚点对齐、循环计算、streak
│   ├── player/       音频播放器核心 AudioEngine + React 绑定 + UI（Web/Electron 共用）
│   ├── ui/           共享 UI（shadcn 风格手写组件 + Theme + i18n zh/en + BilingualReader）
│   └── config/       tsconfig/tailwind preset/eslint base
├── services/pdf-parser/  Python 3 + PyMuPDF 解析器（NestJS 子进程调用，venv 隔离）
├── infrastructure/docker/
├── data/{imports,samples,storage}/  本地数据与存储根（gitignore）
└── docs/
```

## 数据流

```
PDF 对照文本 + MP3 + SRT ──上传──▶ NestJS /api/import（建 ImportJob/ImportFile）
                                        │ 子进程 spawn services/pdf-parser/pdf_parser.py
                                        ▼
                              段落草稿（ImportFile.parsedJson，含置信度/页码/警告）
                                        │ matchMedia：normalizeName 匹配 MP3/SRT
                                        │ assignTimestampsFromSrt：行级 cue 词汇锚点对齐 → 真实时间戳
                                        ▼
                              校对界面（/import/[jobId]）：编辑/拆分/合并/排序/删除
                                        ▼ publish
                              Course + Transcript + TranscriptParagraph(+时间戳) + AudioAsset + DocumentAsset(原始 PDF 保留)
                                        ▼
              Web / Electron 课程页：AudioEngine 播放 + BilingualReader 点击段落跳时间 + 心跳保存进度
```

## 关键设计决策

1. **时间戳不伪造**：无证据的段落 `startTimeMs/endTimeMs` 为 null；自动对齐附 confidence；可人工修正（TimingEditor / 校对 API）。
2. **段落 ≠ 音频句子**：允许一个段落多句、一句对一段翻译；SRT 时间轴与 PDF 段落是两种粒度，用锚点法对齐而非强制一一对应。
3. **存储抽象**：`StorageService`（upload/delete/getSignedUrl/getStream/getMetadata），local 实现 Range 流式（音频拖动必需），R2 私有桶 + 限时签名 URL，切换用 `STORAGE_DRIVER`。
4. **音频不入库**：PostgreSQL 只存元数据与 storageKey；文件在 data/storage（local）或 R2。
5. **单用户模式**：`UserResolver` 默认用户；schema 已支持多用户，未来替换解析逻辑即可接 JWT。
6. **Electron 安全**：contextIsolation=true、nodeIntegration=false、preload 最小 API（文件对话框/读取校验/托盘命令），路径与扩展名白名单校验。
7. **双端共享**：ui/player/api-client/types/learning-core 为纯包（CJS 构建产物 + Vite alias 源码直编），Web 与桌面共用一套学习逻辑。

## 技术栈

- pnpm 12 + Turborepo 2；Node ≥ 20
- Next 15 / React 19 / Tailwind 3.4（CSS 变量主题，浅深色）/ TanStack Query 5
- NestJS 10 + class-validator + @nestjs/swagger；Prisma 6 + PostgreSQL 16/18
- Electron 33 + esbuild（主进程）+ Vite 5（渲染端）
- Python 3 + PyMuPDF（services/pdf-parser/.venv）
