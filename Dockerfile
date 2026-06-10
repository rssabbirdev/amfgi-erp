# Production image for Coolify / VPS.
# Build on your PC: ./scripts/docker-publish.sh (see DOCKER_USER env var).
# Do not build on a 4GB VPS — compile locally and let Coolify pull the image.
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y \
	&& apt-get install -y --no-install-recommends openssl ca-certificates curl \
	&& rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma/
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_NEXT_TYPECHECK=1
ENV NODE_OPTIONS=--max-old-space-size=1536
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
