# Production image for Coolify / VPS.
# Build on your PC: ./scripts/docker-publish.sh (see DOCKER_USER env var).
# Do not build on a 4GB VPS — compile locally and let Coolify pull the image.
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y \
	&& apt-get install -y --no-install-recommends openssl ca-certificates curl \
	&& rm -rf /var/lib/apt/lists/*

FROM base AS deps
ENV NPM_CONFIG_maxsockets=1
ENV NPM_CONFIG_audit=false
ENV NPM_CONFIG_fund=false
ENV NODE_OPTIONS=--max-old-space-size=1024
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma/
# Split install + generate to lower peak RAM (Coolify 4GB VPS often OOMs during postinstall).
RUN npm ci --ignore-scripts \
	&& node node_modules/prisma/build/index.js generate

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_NEXT_TYPECHECK=1
ENV NODE_OPTIONS=--max-old-space-size=1536
# Placeholders for `next build` only — runtime env from Coolify overrides in the runner stage.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
ENV AUTH_SECRET=build-time-placeholder-secret-min-32-chars
ENV AUTH_URL=http://localhost:3000
RUN npm run build:deploy

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
	&& adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
