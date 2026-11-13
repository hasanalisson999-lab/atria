# Signal worker — build from the repo root:
#   docker build -f apps/worker/Dockerfile -t signal-worker .
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspace @signal/worker --include-workspace-root=false --omit=dev --ignore-scripts=false \
  && npm install --no-save tsx

COPY packages/shared packages/shared
COPY apps/worker apps/worker
COPY supabase supabase

ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["npx", "tsx", "src/index.ts"]
