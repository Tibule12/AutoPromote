# Match the frontend's Node.js >=22.22.0 requirement and frontend CI runtime.
FROM node:22-alpine

# Install system dependencies (FFmpeg for media processing)
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy the root postinstall scripts and their shared security implementation
# before npm evaluates lifecycle scripts. Disable the Render-only frontend build
# here because the complete frontend source is copied and built explicitly below.
COPY scripts/build-frontend-on-render.js ./scripts/build-frontend-on-render.js
COPY scripts/patch-security-dependencies.js ./scripts/patch-security-dependencies.js
COPY autopromote-functions/security-dependency-guards.js ./autopromote-functions/security-dependency-guards.js

# Install dependencies
RUN RENDER=false RENDER_SERVICE_ID= npm ci --omit=dev

# Copy source code
COPY . .

# Build frontend static assets (React)
# Installs frontend deps, builds, then cleans up to save space.
RUN npm --prefix frontend ci && npm --prefix frontend run build && rm -rf frontend/node_modules

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S autopromote -u 1001 -G nodejs

# Keep application dependencies read-only while granting the runtime user
# ownership of the app root and the directories used for local uploads/logs.
# Avoiding a recursive chown saves minutes on large dependency trees.
RUN mkdir -p /app/uploads /app/logs && \
  chown autopromote:nodejs /app /app/uploads /app/logs
USER autopromote

# Expose the application port (Express defaults to 5000 unless PORT env is set by platform)
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node src/healthcheck.js

# Start the application
CMD ["npm", "start"]
