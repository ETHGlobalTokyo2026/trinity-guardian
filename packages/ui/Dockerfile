# docker build -f packages/ui/Dockerfile .
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @trinity/ui build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/packages/ui/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/ui/.next/static ./packages/ui/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/packages/ui/public ./packages/ui/public
RUN mkdir -p packages/ui/data && chown nextjs:nodejs packages/ui/data
USER nextjs
EXPOSE 3000
WORKDIR /app/packages/ui
CMD ["node", "server.js"]
