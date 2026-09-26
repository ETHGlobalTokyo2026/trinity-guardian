# Context is this directory, not the repo root:
#   docker build -f packages/ui/Dockerfile -t trinity-ui packages/ui
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

FROM base AS builder
WORKDIR /app
COPY package.json ./
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); for (const s of ['dependencies','devDependencies']) { for (const [k,v] of Object.entries(p[s]||{})) if (String(v).startsWith('workspace:')) delete p[s][k]; } fs.writeFileSync('package.json', JSON.stringify(p,null,2));"
RUN pnpm install --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
RUN mkdir -p data && chown nextjs:nodejs data
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
