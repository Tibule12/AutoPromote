# Match the frontend's declared Node >=22.22.0 requirement as well as the API.
FROM node:22-trixie-slim

# The owned speech-preview subprocess shares the canonical CPU audio helpers.
# Keep its runtime available without installing GPU/model dependencies.
ARG STUDIO_FFMPEG_VERSION=7:7.1.5-0+deb13u1
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg=${STUDIO_FFMPEG_VERSION} python3 python3-numpy python3-pil \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# The root postinstall entry point must exist before npm evaluates lifecycle
# scripts. Disable its Render-only frontend build here because the complete
# frontend source is copied and built explicitly below.
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
RUN groupadd --gid 1001 nodejs
RUN useradd --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin autopromote

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
