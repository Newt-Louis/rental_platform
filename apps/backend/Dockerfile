# ================================================
# THISO Leasing Platform - Backend Dockerfile
# Multi-stage build for optimized production image
# ================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat python3 make g++ vips-dev fftw-dev
COPY package*.json ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npx prisma generate --schema=prisma/parking/schema.prisma
RUN npm run build
RUN npm prune --production

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Install runtime dependencies (vips for sharp image processing)
RUN apk add --no-cache openssl wget dumb-init vips

# Copy necessary files
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

# Create directories for uploads and logs
RUN mkdir -p /app/uploads /app/logs && \
    chown -R nestjs:nodejs /app/uploads /app/logs

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Switch to non-root user
USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health/ready || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Migration safety (docs/reliability/MIGRATION_SAFETY.md): this container no
# longer runs `prisma migrate deploy` on startup. A production application
# instance auto-migrating on every boot means schema changes are applied by
# whichever replica happens to start first/fastest, with no distinct
# "migration succeeded" signal separate from "the app happened to start,"
# and a broken migration surfaces as an app crash-loop instead of a clean,
# isolated pipeline failure. Migrations are applied by the dedicated
# `migrate`/`migrate-uat` Compose service (already existed, was just not the
# only path — see docker-compose.yml/docker-compose.uat.yml) as an explicit,
# separately-observable step *before* this container is deployed/restarted.
CMD ["node", "dist/main.js"]
