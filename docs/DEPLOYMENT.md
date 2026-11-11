# 部署（DEPLOYMENT）

## Docker 一键部署（推荐）

```bash
docker compose up -d --build     # 首次构建 ~5 分钟，之后秒级
```

一键启动三个服务（启动顺序与依赖自动编排）：

| 服务 | 地址 | 说明 |
|---|---|---|
| Web | http://localhost:3000 | Next.js standalone，浏览器直接用 |
| API | http://localhost:3001/api | NestJS；启动时自动 `prisma migrate deploy` |
| PostgreSQL | localhost:5433 | 数据卷 `elp_pgdata` 持久化 |

- **存储卷**：宿主机 `./data/storage` 直接挂载到容器 `/data/storage` —— 已导入的音频/PDF 原样可用，Electron 桌面客户端无感切换（仍连 `localhost:3001`）。
- **重复构建零成本**：镜像内容寻址缓存；`pnpm-workspace.yaml` 的 `allowBuilds` 控制 prisma engines 等构建脚本（pnpm 12 语法）。
- 常用命令：
  ```bash
  docker compose logs -f api      # 跟踪 API 日志
  docker compose exec api node_modules/.bin/prisma studio
  docker compose exec api node_modules/.bin/tsx prisma/seed.ts   # 演示数据
  docker compose down             # 停止（数据保留）
  docker compose down -v          # 连数据库一起清空
  ```
- 部署到服务器：`ELP_API_URL=https://api.example.com docker compose build web`（NEXT_PUBLIC_API_URL 编译进前端 bundle）。
- 端口覆盖：`API_PORT=3002 WEB_PORT=3001 docker compose up -d`。

## 本地开发（不用 Docker 跑前后端）

## 第一阶段：Mac mini 本地运行

```bash
pnpm install && pnpm setup:parser
pnpm db:up
pnpm --filter @elp/api prisma migrate deploy && pnpm db:seed
pnpm dev        # api :3001 + web :3000
pnpm dev:desktop  # 或打包后的 .app
```

## Electron 打包

```bash
pnpm --filter @elp/desktop package:dir    # release/mac-arm64/*.app（未签名）
pnpm --filter @elp/desktop package:dmg    # dmg（arm64 + x64）
```

打包前提：`apps/desktop/renderer-dist` 与 `dist-electron` 已构建（package 脚本自动执行）。
分发前建议 codesign + notarize（需要 Apple 开发者账号，此处 identity: null 跳过）。

## R2 云存储（可选，需要密钥）

1. Cloudflare 控制台创建 **私有** Bucket + API Token（R2 读写）。
2. `apps/api/.env`：
   ```
   STORAGE_DRIVER=r2
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=elp-private
   R2_SIGNED_URL_TTL=3600
   ```
3. 重启 API；上传/播放走签名 URL（默认 1 小时）。已存储的本地文件不受影响。

## 生产部署路线（第二阶段）

- API：任意 Node 主机 / Fly.io / Railway；`prisma migrate deploy` 启动钩子
- Web：Vercel（`NEXT_PUBLIC_API_URL` 指向 API 域名）
- PostgreSQL：托管实例（Neon/Supabase/RDS）
- CORS：`WEB_ORIGIN` 配置正式域名
