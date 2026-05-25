FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile || npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
RUN echo "cache-bust-v15"
COPY . .
ENV NEXT_PUBLIC_API_URL=""
ENV NODE_OPTIONS="--max-old-space-size=2048"
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
