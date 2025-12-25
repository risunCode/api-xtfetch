# XTFetch API Backend
# Node.js + Python (yt-dlp) for YouTube support

FROM node:20-slim

# Cache buster - change this value to force rebuild
ARG CACHE_BUST=20241226v2

WORKDIR /app

# Install Python, pip, and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally
RUN pip3 install --break-system-packages yt-dlp

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build Next.js (no cache)
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/api/health || exit 1

# Start server
CMD ["npm", "start"]
