# 后端 Dockerfile
FROM node:20-alpine AS builder

# 使用国内镜像源加速（可选，如果在中国使用）
# 取消下面注释以启用阿里云镜像
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 更新 APK 索引并安装构建依赖（canvas需要）
RUN apk update && apk upgrade && apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

WORKDIR /app

# 设置 npm 镜像源（可选，如果在中国使用）
# 取消下面注释以启用淘宝镜像
RUN npm config set registry https://registry.npmmirror.com

# 复制package文件（先复制依赖文件，利用 Docker 缓存）
COPY package*.json ./
COPY tsconfig.json ./

# 安装依赖
# 如果有 package-lock.json 使用 npm ci，否则使用 npm install
RUN if [ -f package-lock.json ]; then npm ci --production=false; else npm install; fi

# 复制源代码
COPY src ./src
COPY scripts ./scripts

# 构建TypeScript
RUN npm run build

# 生产环境镜像
FROM node:20-alpine

# 使用国内镜像源加速（可选，如果在中国使用）
# 取消下面注释以启用阿里云镜像
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 更新 APK 索引并安装运行时依赖（canvas需要）
RUN apk update && apk upgrade && apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    bash \
    wget \
    curl \
    ca-certificates \
    xdg-utils \
    python3

# 安装 glibc 兼容层（Calibre需要glibc，而Alpine使用musl libc）
# 使用更可靠的方法安装glibc
RUN set -e && \
    GLIBC_VERSION="2.35-r1" && \
    echo "=== 开始安装glibc ===" && \
    echo "步骤1: 创建密钥目录..." && \
    mkdir -p /etc/apk/keys && \
    echo "步骤2: 下载glibc密钥..." && \
    (wget -q --timeout=30 --tries=3 -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub 2>&1 || \
     curl -fsSL --connect-timeout 30 --max-time 60 https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub -o /etc/apk/keys/sgerrand.rsa.pub) && \
    echo "步骤3: 下载glibc包 (${GLIBC_VERSION})..." && \
    (wget -q --timeout=120 --tries=3 https://github.com/sgerrand/alpine-pkg-glibc/releases/download/${GLIBC_VERSION}/glibc-${GLIBC_VERSION}.apk -O /tmp/glibc.apk 2>&1 || \
     curl -fsSL --connect-timeout 120 --max-time 300 -L https://github.com/sgerrand/alpine-pkg-glibc/releases/download/${GLIBC_VERSION}/glibc-${GLIBC_VERSION}.apk -o /tmp/glibc.apk) && \
    echo "步骤4: 下载glibc-bin包..." && \
    (wget -q --timeout=120 --tries=3 https://github.com/sgerrand/alpine-pkg-glibc/releases/download/${GLIBC_VERSION}/glibc-bin-${GLIBC_VERSION}.apk -O /tmp/glibc-bin.apk 2>&1 || \
     curl -fsSL --connect-timeout 120 --max-time 300 -L https://github.com/sgerrand/alpine-pkg-glibc/releases/download/${GLIBC_VERSION}/glibc-bin-${GLIBC_VERSION}.apk -o /tmp/glibc-bin.apk) && \
    echo "步骤5: 验证下载的文件..." && \
    ls -lh /tmp/glibc*.apk && \
    test -f /tmp/glibc.apk && test -f /tmp/glibc-bin.apk && \
    echo "步骤5.5: 检查并卸载可能冲突的包..." && \
    (apk del gcompat 2>/dev/null || true) && \
    echo "步骤6: 安装glibc..." && \
    (apk add --allow-untrusted --force-overwrite /tmp/glibc.apk /tmp/glibc-bin.apk 2>&1 || \
     (echo "标准安装失败，尝试使用--force-broken-world..." && \
      apk add --allow-untrusted --force-broken-world --force-overwrite /tmp/glibc.apk /tmp/glibc-bin.apk 2>&1 || \
      (echo "⚠️  glibc安装失败，Calibre将无法安装" && \
       echo "提示: 如果需要在Docker中使用MOBI转EPUB，请使用基于Debian的镜像" && \
       false))) && \
    echo "步骤7: 清理临时文件..." && \
    rm -f /tmp/glibc*.apk /etc/apk/keys/sgerrand.rsa.pub && \
    echo "=== glibc安装完成 ==="

# 安装 Calibre（使用官方安装脚本）
# Calibre需要glibc，所以必须在安装glibc之后安装
# 如果glibc安装失败，Calibre安装也会失败，但不中断构建
RUN echo "=== 开始安装Calibre ===" && \
    if command -v /lib/ld-musl-x86_64.so.1 >/dev/null 2>&1 || [ -f /usr/glibc-compat/lib/ld-linux-x86-64.so.2 ]; then \
        echo "检测到glibc，继续安装Calibre..." && \
        INSTALLER="/tmp/calibre-installer.sh" && \
        if (wget -nv --timeout=180 --tries=3 -O "$INSTALLER" https://download.calibre-ebook.com/dist/linux-installer.sh 2>&1 || \
            (echo "wget失败，尝试使用curl..." && \
             curl -fsSL --connect-timeout 180 --max-time 600 -o "$INSTALLER" https://download.calibre-ebook.com/dist/linux-installer.sh)); then \
            chmod +x "$INSTALLER" && \
            if bash "$INSTALLER" install_dir=/opt/calibre 2>&1; then \
                rm -f "$INSTALLER" && \
                ln -sf /opt/calibre/ebook-convert /usr/local/bin/ebook-convert 2>/dev/null || true && \
                ln -sf /opt/calibre/ebook-meta /usr/local/bin/ebook-meta 2>/dev/null || true && \
                echo "=== Calibre安装完成 ==="; \
            else \
                echo "⚠️  Calibre安装脚本执行失败，跳过安装" && \
                echo "提示: MOBI转EPUB功能将不可用，但这不影响其他功能" && \
                rm -f "$INSTALLER" && \
                mkdir -p /opt/calibre; \
            fi; \
        else \
            echo "⚠️  Calibre安装脚本下载失败，跳过安装" && \
            echo "提示: MOBI转EPUB功能将不可用，但这不影响其他功能" && \
            mkdir -p /opt/calibre; \
        fi; \
    else \
        echo "⚠️  ⚠️  ⚠️  警告: glibc未安装，跳过Calibre安装 ⚠️  ⚠️  ⚠️"; \
        echo "MOBI转EPUB功能将不可用。如需此功能，请:"; \
        echo "  1. 使用基于Debian的镜像（参考 md/DOCKER_CALIBRE_SETUP.md）"; \
        echo "  2. 或在容器启动后手动安装Calibre"; \
        mkdir -p /opt/calibre; \
    fi

# 验证 Calibre 安装（可选，不中断构建）
RUN if [ -f /opt/calibre/ebook-convert ] && command -v ebook-convert >/dev/null 2>&1; then \
    echo "✅ Calibre已安装: $(ebook-convert --version 2>&1 | head -1 || echo '版本信息获取失败')"; \
    else \
    echo "⚠️  Calibre未安装，MOBI转EPUB功能将不可用"; \
    echo "提示: 这不会影响其他功能，只是MOBI文件无法自动转换为EPUB"; \
    fi

WORKDIR /app

# 从构建阶段复制文件（按依赖顺序，优化缓存）
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

# 创建必要的目录
RUN mkdir -p /app/data /app/books/public /app/books/user /app/covers /app/fonts /app/import

# 创建启动脚本来确保挂载的目录结构正确
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'echo "正在检查并创建必要的目录..."' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/books/public' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/books/user' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/books/.temp' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/covers' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/fonts' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/import' >> /app/entrypoint.sh && \
    echo 'echo "目录结构已就绪"' >> /app/entrypoint.sh && \
    echo 'echo "启动应用..."' >> /app/entrypoint.sh && \
    echo 'exec node dist/index.js' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# 设置目录权限（确保有写入权限）
RUN chmod -R 755 /app/data /app/books /app/covers /app/fonts /app/import

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=1281
ENV DB_PATH=./data/database.db
ENV BOOKS_DIR=./books

# 暴露端口
EXPOSE 1281

# 启动命令
CMD ["/app/entrypoint.sh"]

