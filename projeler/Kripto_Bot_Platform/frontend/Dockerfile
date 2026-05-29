FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# --legacy-peer-deps ve --no-audit eklenerek NPM ERESOLVE/Network hataları (Exit 228) engellendi
RUN npm install --no-audit --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
RUN echo "cache-bust-v22"
COPY . .
ENV NEXT_PUBLIC_API_URL=""
# RAM kısıtlaması eklenerek OOM (Out Of Memory) Killer'ın build'i patlatması engellendi (2048 -> 768)
ENV NODE_OPTIONS="--max-old-space-size=768"
RUN rm -rf .next && npm run build
# Standalone output dogrulama
RUN ls -la .next/standalone/server.js || (echo "STANDALONE BUILD FAILED" && exit 1)

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
