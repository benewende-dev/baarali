# baarali-render: Chrome, FFmpeg and the HyperFrames producer (Studio Motion
# step 2, decided 08/10/2026). Build context = repo root:
#   fly deploy --config apps/baarali/packages/render/fly.toml \
#     --dockerfile apps/baarali/packages/render/Dockerfile --remote-only .
# Secret: BAARALI_RENDER_SECRET, shared with the control plane only.

FROM node:22-trixie AS build
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /src
COPY apps/baarali/package.json apps/baarali/pnpm-lock.yaml apps/baarali/pnpm-workspace.yaml apps/baarali/tsconfig.base.json apps/baarali/
COPY apps/baarali/packages/render apps/baarali/packages/render
RUN cd apps/baarali && pnpm install --frozen-lockfile --filter @baarali/render \
 && pnpm --filter @baarali/render build \
 && pnpm --filter @baarali/render deploy --prod --legacy /out

# Debian 13: FFmpeg 7. Noto covers the scripts our users write in, emoji included.
FROM node:22-trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg iptables ca-certificates fonts-noto-core fonts-noto-color-emoji fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out ./
# The headless shell the producer's puppeteer expects, with its system libraries.
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer
RUN node "$(find node_modules/.pnpm -path '*/node_modules/puppeteer/lib/puppeteer/node/cli.js' | head -1)" \
      browsers install chrome-headless-shell --install-deps \
 && ln -s "$(find /opt/puppeteer -type f -name chrome-headless-shell | head -1)" /usr/local/bin/chrome-headless-shell \
 && chmod -R a+rX /opt/puppeteer \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8080 \
    RENDER_DIR=/tmp/renders \
    HYPERFRAMES_FFMPEG_PATH=/usr/bin/ffmpeg \
    HYPERFRAMES_FFPROBE_PATH=/usr/bin/ffprobe \
    HYPERFRAMES_BROWSER_PATH=/usr/local/bin/chrome-headless-shell \
    PRODUCER_HEADLESS_SHELL_PATH=/usr/local/bin/chrome-headless-shell \
    HYPERFRAMES_FONT_CACHE_DIR=/tmp/fonts
COPY apps/baarali/packages/render/entrypoint.sh /app/entrypoint.sh
EXPOSE 8080
CMD ["/app/entrypoint.sh"]
