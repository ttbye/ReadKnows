# 前端 Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 使用国内镜像源加速（可选，如果在中国使用）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装编译 canvas 所需的依赖（Python 和系统库）
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

# 设置 npm 镜像源（可选，如果在中国使用）
# 取消下面注释以启用淘宝镜像
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000

# 复制package文件
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./

# 安装依赖
RUN if [ -f package-lock.json ]; then \
        npm ci --production=false --legacy-peer-deps || \
        (echo "⚠️  npm ci 失败，尝试 npm install..." && npm install --legacy-peer-deps); \
    else \
        npm install --legacy-peer-deps; \
    fi && \

    (npm install canvas@^2.11.2 --legacy-peer-deps --no-save || echo "⚠️  canvas 安装失败，跳过（不影响构建）") && \

    npm install @rollup/rollup-linux-x64-musl --legacy-peer-deps --no-save || true

# 复制代码
COPY public ./public
COPY src ./src
COPY scripts ./scripts
COPY index.html ./

# 构建应用
RUN npm run build

# 生产环境镜像（使用nginx）
FROM nginx:alpine

# 使用国内镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装envsubst用于替换环境变量
RUN apk add --no-cache gettext

# 复制nginx配置模板
COPY nginx.conf /etc/nginx/templates/default.conf.template

# 复制启动脚本
COPY start-nginx.sh /start-nginx.sh
RUN chmod +x /start-nginx.sh

# 复制构建产物到nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# 修复文件权限
RUN find /usr/share/nginx/html -type f -exec chmod 644 {} \; 2>/dev/null || true && \
    find /usr/share/nginx/html -type d -exec chmod 755 {} \; 2>/dev/null || true

# 暴露端口
EXPOSE 1280

# 使用启动脚本启动nginx
CMD ["/start-nginx.sh"]

