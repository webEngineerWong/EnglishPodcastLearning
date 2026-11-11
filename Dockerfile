# ── 依赖层：用 lockfile 拉全量依赖（pnpm store 缓存友好） ──
FROM node:24-alpine AS deps
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN apk add --no-cache libc6-compat openssl && corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/learning-core/package.json packages/learning-core/package.json
COPY packages/player/package.json packages/player/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

# ── 构建层：prisma generate + turbo 构建 api/web 及其依赖包 ──
FROM node:24-alpine AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN apk add --no-cache libc6-compat openssl && corepack enable
WORKDIR /app
COPY --from=deps /app ./
COPY . .
# prisma client 生成
RUN pnpm --filter @elp/api prisma generate
# 构建 API 与 Web（turbo 会先构建 workspace 依赖包）
RUN pnpm exec turbo run build --filter @elp/api --filter @elp/web
# 提取 API 的 prod 自包含产物（node_modules + dist + prisma）
RUN pnpm --filter @elp/api deploy --prod /deploy-out

# ── API 运行层：pnpm deploy 产出自包含的 prod 依赖 ──
FROM node:24-alpine AS api-runtime
ENV NODE_ENV=production
RUN apk add --no-cache openssl
WORKDIR /deploy
COPY --from=build /deploy-out ./
EXPOSE 3001
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]

# ── Web 运行层：Next standalone（自带最小 node_modules） ──
FROM node:24-alpine AS web-runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /web
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
