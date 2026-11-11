# 开发指南（DEVELOPMENT）

## 前置条件

- Node ≥ 20（含 corepack）
- Docker（仅用于 PostgreSQL）
- Python 3（PDF 解析 venv）

## 首次启动

```bash
pnpm install                 # 安装依赖
pnpm setup:parser            # 创建 Python venv + PyMuPDF
pnpm db:up                   # 启动 PostgreSQL (localhost:5433, elp/elp_dev_password)
pnpm --filter @elp/api prisma migrate deploy
pnpm db:seed                 # 演示课程 + 生成的 WAV 音频
```

## 日常命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 同时启动 api + web |
| `pnpm dev:web` | 仅 Web（http://localhost:3000） |
| `pnpm dev:api` | 仅 API（http://localhost:3001/api，Swagger /docs） |
| `pnpm dev:desktop` | Electron 开发（esbuild watch + vite 5173 + electron） |
| `pnpm build` | 全量构建 |
| `pnpm test` | vitest 单测 |
| `pnpm lint` / `pnpm typecheck` | ESLint / TS strict |
| `pnpm db:migrate` / `pnpm db:seed` | 迁移 / 种子 |

## 环境变量

复制 `.env.example` → `apps/api/.env`（后端）与 `apps/web/.env.local`（前端）。
关键项：`DATABASE_URL`、`PORT`、`STORAGE_DRIVER=local|r2`、`STORAGE_LOCAL_ROOT`、
`NEXT_PUBLIC_API_URL`、R2 五项（可选）。**.env 不入库**。

## PDF 解析器

- 脚本：`services/pdf-parser/pdf_parser.py`（CLI：`python pdf_parser.py <file> --out out.json`）
- 自动定位：API 依次尝试 `PDF_PARSER_PYTHON` → `services/pdf-parser/.venv/bin/python` → `python3`
- OCR：不对扫描页自动 OCR；文本过少且有大图的页会写入 `needsOcr`，由人工决定后续处理

## 常见问题

- **Electron 启动报 "failed to install correctly"**：执行 `node <pnpm内electron路径>/install.js` 或 `pnpm approve-builds` 后重装。
- **5173 端口占用**：`lsof -ti:5173 | xargs kill -9`。
- **postgres 18 容器重启循环**：数据卷必须挂在 `/var/lib/postgresql`（非 `.../data`），compose 已配置。
