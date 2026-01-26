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

# Copy root package.json (required for version reading by vite.config.ts)
COPY package.json /tmp/root-package.json
RUN mkdir -p /app/.. && cp /tmp/root-package.json /app/../package.json && \
    echo "✓ 已复制根目录 package.json 用于版本读取"

# Copy package files
COPY frontend/package*.json ./
COPY frontend/tsconfig*.json ./
COPY frontend/vite.config.ts ./
COPY frontend/tailwind.config.js ./
COPY frontend/postcss.config.js ./

# Install dependencies
RUN echo "开始安装依赖..." && \
    if [ -f package-lock.json ]; then \
        npm ci --production=false --legacy-peer-deps || \
        (echo "⚠️  npm ci failed, trying npm install..." && npm install --legacy-peer-deps); \
    else \
        npm install --legacy-peer-deps; \
    fi && \
    (npm install canvas@^2.11.2 --legacy-peer-deps --no-save || echo "⚠️  canvas installation failed, skipping") && \
    (npm install @rollup/rollup-linux-x64-musl --legacy-peer-deps --no-save || echo "⚠️  rollup-linux-x64-musl installation failed, skipping") && \
    echo "验证依赖安装..." && \
    (test -f node_modules/.bin/vite && echo "✓ vite 已安装" || (echo "❌ vite 未找到，重新安装..." && npm install vite@^5.4.21 --legacy-peer-deps --save-dev)) && \
    (test -f node_modules/.bin/vite && echo "✓ vite 验证成功" || (echo "❌ vite 安装失败" && exit 1))

# Copy source code
COPY frontend/public ./public
COPY frontend/src ./src
COPY frontend/scripts ./scripts
COPY frontend/index.html ./

# Build application
RUN echo "开始构建应用..." && \
    (which vite || echo "使用 npx vite...") && \
    (npm run build || (echo "⚠️  npm run build 失败，尝试直接使用 vite..." && npx vite build && node scripts/format-manifest.js)) && \
    (test -d dist && echo "✓ 构建成功，dist 目录已创建" || (echo "❌ 构建失败，dist 目录不存在" && exit 1))

# Production image (using nginx)
FROM nginx:alpine

# Use Chinese mirror for faster downloads
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Install envsubst for environment variable substitution and openssl for certificate generation
RUN apk add --no-cache gettext openssl

# Copy nginx configuration template
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template

# Copy startup script
COPY frontend/start-nginx.sh /start-nginx.sh
COPY frontend/start-nginx-ssl.sh /start-nginx-ssl.sh
RUN chmod +x /start-nginx.sh /start-nginx-ssl.sh

# Copy build to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Fix file permissions
RUN find /usr/share/nginx/html -type f -exec chmod 644 {} \; 2>/dev/null || true && \
    find /usr/share/nginx/html -type d -exec chmod 755 {} \; 2>/dev/null || true

# Expose ports
EXPOSE 80 443

# Start nginx using startup script (支持SSL证书自动检测)
CMD ["/start-nginx-ssl.sh"]

