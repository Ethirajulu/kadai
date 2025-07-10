# =============================================================================
# User Service Dockerfile
# =============================================================================

FROM node:22.16.0-alpine AS dependencies

# Install pnpm
RUN npm install -g pnpm@9.15.1

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nx.json tsconfig.base.json ./

# Copy package.json files
COPY apps/user-service/package.json ./apps/user-service/
COPY libs/*/package.json ./libs/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Build stage
# -----------------------------------------------------------------------------
FROM dependencies AS builder

# Copy source code
COPY . .

# Build the service
RUN npx nx build user-service --prod

# -----------------------------------------------------------------------------
# Production stage
# -----------------------------------------------------------------------------
FROM node:22.16.0-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Install pnpm
RUN npm install -g pnpm@9.15.1

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy built application
COPY --from=builder /app/dist/apps/user-service ./dist/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Change ownership
RUN chown -R nestjs:nodejs /app
USER nestjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]