# XTFetch API Backend
# Node.js + Python (yt-dlp, gallery-dl) + FFmpeg

FROM node:20-slim

# Cache bust - change this value to force rebuild
ARG CACHE_BUST=20251230_v3

WORKDIR /app

# Install Python, pip, and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp and gallery-dl globally
RUN pip3 install --break-system-packages yt-dlp gallery-dl

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3002/api/health || exit 1

# Start server
CMD ["npm", "start"]
