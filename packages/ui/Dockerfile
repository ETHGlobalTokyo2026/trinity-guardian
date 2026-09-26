# Works with either context:
#   docker build -f packages/ui/Dockerfile .
#   docker build -f packages/ui/Dockerfile packages/ui
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

FROM base AS builder
WORKDIR /src
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN set -e; \
  if [ -f packages/ui/package.json ]; then \
    pnpm install --frozen-lockfile; \
    pnpm --filter @trinity/ui build; \
    mkdir -p /out/packages/ui/.next; \
    cp -a packages/ui/.next/standalone/. /out/; \
    cp -a packages/ui/.next/static /out/packages/ui/.next/static; \
    cp -a packages/ui/public /out/packages/ui/public; \
  elif grep -q '"@trinity/ui"' package.json; then \
    node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); for (const s of ['dependencies','devDependencies']) { for (const [k,v] of Object.entries(p[s]||{})) if (String(v).startsWith('workspace:')) delete p[s][k]; } fs.writeFileSync('package.json', JSON.stringify(p,null,2));"; \
    pnpm install --ignore-scripts; \
    DOCKER_BUILD=1 pnpm build; \
    mkdir -p /out/.next; \
    cp -a .next/standalone/. /out/; \
    cp -a .next/static /out/.next/static; \
    cp -a public /out/public; \
  else \
    echo "Docker context is missing the UI package" >&2; \
    find . -name package.json -maxdepth 3 >&2; \
    exit 1; \
  fi; \
  printf '%s\n' '#!/bin/sh' 'cd /app' 'if [ -f packages/ui/server.js ]; then cd /app/packages/ui; fi' 'mkdir -p data' 'exec node server.js' > /out/start.sh; \
  chmod +x /out/start.sh

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /out /app
RUN mkdir -p /app/data /app/packages/ui/data && chown nextjs:nodejs /app/data /app/packages/ui/data
USER nextjs
EXPOSE 3000
CMD ["/app/start.sh"]
