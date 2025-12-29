# Frontend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Use Chinese mirror for faster downloads (optional, if using in China)
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Install dependencies required for building canvas (Python and system libraries)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    librsvg-dev \
    pkgconfig \
    libpng-dev \
    && ln -sf python3 /usr/bin/python

# Set npm registry mirror (optional, if using in China)
# Uncomment below to enable Taobao mirror
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./

# Install dependencies
RUN if [ -f package-lock.json ]; then \
        npm ci --production=false --legacy-peer-deps || \
        (echo "⚠️  npm ci failed, trying npm install..." && npm install --legacy-peer-deps); \
    else \
        npm install --legacy-peer-deps; \
    fi && \
    (npm install canvas@^2.11.2 --legacy-peer-deps --no-save || echo "⚠️  canvas installation failed, skipping") && \
    npm install @rollup/rollup-linux-x64-musl --legacy-peer-deps --no-save || true

# Copy source code
COPY public ./public
COPY src ./src
COPY scripts ./scripts
COPY index.html ./

# Build application
RUN npm run build

# Production image (using nginx)
FROM nginx:alpine

# Use Chinese mirror for faster downloads
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Install envsubst for environment variable substitution
RUN apk add --no-cache gettext

# Copy nginx configuration template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy startup script
COPY start-nginx.sh /start-nginx.sh
RUN chmod +x /start-nginx.sh

# Copy build to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Fix file permissions
RUN find /usr/share/nginx/html -type f -exec chmod 644 {} \; 2>/dev/null || true && \
    find /usr/share/nginx/html -type d -exec chmod 755 {} \; 2>/dev/null || true

# Expose port
EXPOSE 1280

# Start nginx using startup script
CMD ["/start-nginx.sh"]

