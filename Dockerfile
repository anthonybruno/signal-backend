# Use Node.js 20 Alpine as base for smaller image size
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat gcompat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy package files
COPY package.json package-lock.json* ./

# Install ONLY production dependencies and remove unnecessary files
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf /root/.npm && \
    rm -rf /tmp/* && \
    # Remove unnecessary platform-specific binaries
    find /app/node_modules -name "*.node" ! -path "*/onnxruntime-node/*" -delete && \
    find /app/node_modules -name "*.so" -delete && \
    find /app/node_modules -name "*.dylib" -delete && \
    # Remove unnecessary files
    find /app/node_modules -name "*.md" -delete && \
    find /app/node_modules -name "*.txt" -delete && \
    find /app/node_modules -name "*.map" -delete && \
    find /app/node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "examples" -type d -exec rm -rf {} + 2>/dev/null || true

# Copy source code
COPY --chown=nodejs:nodejs . .

# Create necessary directories for logs and data
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application with tsx
CMD ["npx", "tsx", "src/index.ts"]