# 部署（DEPLOYMENT）

## 第一阶段：Mac mini 本地运行（当前）

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
