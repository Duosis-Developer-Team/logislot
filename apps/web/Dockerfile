# Monorepo kokunden build edilir:
#   docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build -w @logislot/web

FROM node:22-alpine AS runner
# GHCR paketini repoya BAGLAR. Bag olmadan Actions'in GITHUB_TOKEN'i pakete
# yazamaz ("denied: permission_denied: write_package") ve Build Images duser.
# Etiket her push'ta bagi tazeledigi icin bag bir daha kopmaz.
LABEL org.opencontainers.image.source="https://github.com/Duosis-Developer-Team/logislot"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
# public/ (marka assetleri, webmanifest) standalone'a otomatik kopyalanmaz.
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
