# Docker — Multi-stage build
FROM node:18-alpine AS base
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# --- Final image ---
FROM base AS runner
ENV NODE_ENV=production

# Non-root user for security
RUN addgroup -g 1001 -S nodejs \
 && adduser  -S nodejs -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create required directories
RUN mkdir -p backend/logs uploads \
 && chown -R nodejs:nodejs .

USER nodejs

EXPOSE 5000

CMD ["node", "backend/server.js"]
