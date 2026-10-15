# A Baarali instance: the headless rowboat-server behind the gate
# (architecture §3.1, roadmap phase 0). Build context = repo root:
#   fly deploy --config apps/baarali/packages/instance/fly.toml \
#     --dockerfile apps/baarali/packages/instance/Dockerfile .
#
# Runtime env: BAARALI_INSTANCE_TOKEN (secret), API_URL (the control plane),
# BAARALI_SERVER_KEY (set by the control plane on the instances it creates).

# BAARALI(15/10/2026): REA uses its own Node 24 (including the SQLite API)
# and lockfile. Baarali's Node 22 workspace and dependency graph stay separate.
FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS rea
WORKDIR /opt/baarali-rea
COPY apps/baarali/engines/rea/package.json apps/baarali/engines/rea/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && mkdir bin && cp /usr/local/bin/node bin/node

FROM eclipse-temurin:21-jdk-jammy@sha256:e0c60c487345d1dc9d0fc7b6f0496f3cc941e5132e09296cc17a6decc71b902b AS rea-java

FROM python:3.12-slim-bookworm AS rea-providers
COPY apps/baarali/engines/rea/providers.json /providers.json
COPY apps/baarali/engines/rea/install-providers.py /install-providers.py
RUN python3 /install-providers.py /providers.json /opt/baarali-analysis

FROM node:22-bookworm AS build
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate \
 && apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src

# 1. Harbor's protocol package: @x/shared links it.
COPY apps/harbor/package.json apps/harbor/pnpm-lock.yaml apps/harbor/pnpm-workspace.yaml apps/harbor/tsconfig.base.json apps/harbor/
COPY apps/harbor/packages/protocol apps/harbor/packages/protocol
COPY apps/harbor/packages/server/package.json apps/harbor/packages/server/
RUN cd apps/harbor && pnpm install --frozen-lockfile --filter @rowboat/spaces-protocol \
 && pnpm --filter @rowboat/spaces-protocol build

# 2. rowboat-server and what it needs, then its self-contained bundle. The
# agent speaks of itself as Baarali: the brand is applied to this copy of
# core only, the repository keeps the upstream text (desktop/scripts/brand.mjs).
COPY apps/x apps/x
COPY apps/baarali/packages/desktop/scripts/brand.mjs apps/baarali/packages/desktop/scripts/brand.mjs
COPY apps/baarali/packages/desktop/scripts/desktop-layout.mjs apps/baarali/packages/desktop/scripts/desktop-layout.mjs
# BAARALI(13/10/2026): core branding also installs the shared Work policy.
COPY apps/baarali/packages/desktop/assets/mobile/work-access.ts apps/baarali/packages/desktop/assets/mobile/work-access.ts
COPY apps/baarali/packages/desktop/assets/mobile/work-policy.ts apps/baarali/packages/desktop/assets/mobile/work-policy.ts
COPY apps/baarali/packages/desktop/assets/work-runtime.ts apps/baarali/packages/desktop/assets/work-runtime.ts
COPY apps/baarali/packages/desktop/assets/rea-config.ts apps/baarali/packages/desktop/assets/rea-config.ts
COPY apps/baarali/packages/desktop/assets/rea-runtime.ts apps/baarali/packages/desktop/assets/rea-runtime.ts
COPY apps/baarali/packages/desktop/assets/rea-scope.ts apps/baarali/packages/desktop/assets/rea-scope.ts
RUN node apps/baarali/packages/desktop/scripts/brand.mjs --yes --only core
RUN cd apps/x && pnpm install --frozen-lockfile --filter "@x/server..." \
 && (cd packages/shared && npm run build) \
 && (cd packages/core && npm run build) \
 && (cd apps/server && npm run build && node scripts/build-headless.mjs) \
 && (cd apps/server/dist-headless && npm install --omit=dev)

# 3. The Baarali launcher and gate.
COPY apps/baarali/package.json apps/baarali/pnpm-lock.yaml apps/baarali/pnpm-workspace.yaml apps/baarali/tsconfig.base.json apps/baarali/
COPY apps/baarali/packages/instance apps/baarali/packages/instance
COPY apps/baarali/packages/control/package.json apps/baarali/packages/control/
RUN cd apps/baarali && pnpm install --frozen-lockfile --filter @baarali/instance \
 && pnpm --filter @baarali/instance build

FROM node:22-bookworm-slim
# The Chat builds projects here (03/10/2026): git and Python beside Node.
# HOME on the volume: git's identity, caches and an engine's sign-in
# survive a restart, like the work itself.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git python3 python3-pip python3-venv ca-certificates procps chromium libgl1 libglu1-mesa libxrender1 libxext6 libgomp1 \
 && rm -rf /var/lib/apt/lists/*
COPY apps/baarali/packages/instance/requirements-cad.txt /tmp/requirements-cad.txt
RUN python3 -m venv /opt/baarali-cad \
 && /opt/baarali-cad/bin/pip install --no-cache-dir -r /tmp/requirements-cad.txt \
 && /opt/baarali-cad/bin/python -c "import cadquery; print(cadquery.__version__)" \
 && rm /tmp/requirements-cad.txt
ENV NODE_ENV=production \
    ROWBOAT_WORKDIR=/data \
    ROWBOAT_SERVER_ENTRY=/app/server/rowboat-server.cjs \
    HOME=/data/home \
    BAARALI_CAD_PYTHON=/opt/baarali-cad/bin/python \
    BAARALI_REA_ROOT=/opt/baarali-rea \
    BAARALI_REA_NODE=/opt/baarali-rea/bin/node \
    GHIDRA_INSTALL_DIR=/opt/baarali-analysis/ghidra \
    JAVA_HOME=/opt/baarali-java \
    REA_JADX_MCP_JAR=/opt/baarali-analysis/jadx-headless-mcp.jar \
    REA_BROWSER_EXECUTABLE=/usr/bin/chromium \
    PORT=8080
WORKDIR /app
COPY --from=rea /opt/baarali-rea /opt/baarali-rea
COPY --from=rea-java /opt/java/openjdk /opt/baarali-java
COPY --from=rea-providers /opt/baarali-analysis /opt/baarali-analysis
COPY --from=build /src/apps/x/apps/server/dist-headless ./server
COPY --from=build /src/apps/baarali/packages/instance/package.json ./instance/package.json
COPY --from=build /src/apps/baarali/packages/instance/dist ./instance/dist
EXPOSE 8080
CMD ["node", "/app/instance/dist/main.js"]
