# Debian 官方源 / PyPI 在当前网络不可达，统一走国内镜像（可用 --build-arg 覆盖）
ARG APT_MIRROR=mirrors.aliyun.com
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple

# ── 依赖层：用 lockfile 拉全量依赖（pnpm store 缓存友好） ──
FROM node:24-bookworm-slim AS deps
ARG APT_MIRROR
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && corepack enable && npm config set registry https://registry.npmmirror.com
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/learning-core/package.json packages/learning-core/package.json
COPY packages/player/package.json packages/player/package.json
COPY packages/icons/package.json packages/icons/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

# ── 构建层：prisma generate + turbo 构建 api/web 及其依赖包 ──
FROM node:24-bookworm-slim AS build
ARG APT_MIRROR
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && corepack enable && npm config set registry https://registry.npmmirror.com
WORKDIR /app
COPY --from=deps /app ./
COPY . .
# 修正 Prisma binaryTargets：运行层是 Debian(glibc)，不能是 musl(Alpine)
RUN SCHEMA="$(find apps/api -name schema.prisma -not -path '*/node_modules/*' | head -n1)" && \
    echo "patching $SCHEMA" && \
    sed -i '/binaryTargets/d' "$SCHEMA" && \
    sed -i '/provider *= *"prisma-client-js"/a\  binaryTargets = ["native", "debian-openssl-3.0.x", "linux-arm64-openssl-3.0.x"]' "$SCHEMA" && \
    grep -n -B2 -A3 binaryTargets "$SCHEMA"
# prisma client 生成
RUN pnpm --filter @elp/api prisma generate
# 构建 API 与 Web（turbo 会先构建 workspace 依赖包）
RUN pnpm exec turbo run build --filter @elp/api --filter @elp/web
# 提取 API 的 prod 自包含产物（node_modules + dist + prisma）
RUN pnpm --filter @elp/api deploy --prod /deploy-out

# ── API 运行层：pnpm deploy 产出自包含的 prod 依赖 + Python PDF 解析器 ──
# Debian 基础：python3.11 + manylinux wheel（PyMuPDF 免编译）
FROM node:24-bookworm-slim AS api-runtime
ARG APT_MIRROR
ARG PIP_INDEX_URL
ENV NODE_ENV=production
RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources && \
    apt-get -o Acquire::Retries=8 -o Acquire::http::Timeout=60 update && apt-get -o Acquire::Retries=8 -o Acquire::http::Timeout=60 install -y --no-install-recommends openssl python3 python3-venv && \
    rm -rf /var/lib/apt/lists/* && \
    python3 -m venv /opt/pdf-venv && \
    /opt/pdf-venv/bin/pip install --no-cache-dir -i "${PIP_INDEX_URL}" 'pymupdf>=1.24,<2'
WORKDIR /deploy
COPY --from=build /deploy-out ./
COPY services/pdf-parser/pdf_parser.py /opt/pdf-parser/pdf_parser.py
ENV PDF_PARSER_PYTHON=/opt/pdf-venv/bin/python
ENV PDF_PARSER_SCRIPT=/opt/pdf-parser/pdf_parser.py
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
