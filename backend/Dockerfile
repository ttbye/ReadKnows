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

# ✅ 修复：使用环境变量配置 node-gyp 使用镜像源，解决 better-sqlite3 编译问题
# 注意：这些配置需要通过环境变量设置，而不是 npm config
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node/
ENV NPM_CONFIG_DISTURL=https://npmmirror.com/dist
ENV NPM_CONFIG_NODE_GYP=https://npmmirror.com/mirrors/node-gyp
ENV SASS_BINARY_SITE=https://npmmirror.com/mirrors/node-sass
ENV ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
ENV PUPPETEER_DOWNLOAD_HOST=https://npmmirror.com/mirrors
ENV PYTHON_MIRROR=https://npmmirror.com/mirrors/python

# ✅ 修复：增加网络超时和重试配置
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 300000

# 复制根目录 package.json（用于版本读取）
# 注意：构建上下文应该在 docker-compose.yml 中设置为项目根目录
COPY package.json /tmp/root-package.json
RUN mkdir -p /app/.. && cp /tmp/root-package.json /app/../package.json && \
    echo "✓ 已复制根目录 package.json 用于版本读取"

# 复制package文件（先复制依赖文件，利用 Docker 缓存）
# 注意：版本号应该在构建前通过 scripts/version.js sync 同步到 backend/package.json
COPY backend/package*.json ./
COPY backend/tsconfig.json ./

# ✅ 修复：安装依赖，增加重试机制和超时设置
# 如果有 package-lock.json 使用 npm ci，否则使用 npm install
# 优先使用预编译的二进制文件，如果失败再尝试从源码编译
RUN echo "开始安装依赖..." && \
    if [ -f package-lock.json ]; then \
        echo "使用 npm ci 安装依赖..." && \
        npm ci --production=false --prefer-offline=false --no-audit || \
        (echo "npm ci 失败，尝试清理缓存后重试..." && \
         npm cache clean --force && \
         npm ci --production=false --prefer-offline=false --no-audit) || \
        (echo "npm ci 重试失败，尝试使用 npm install..." && \
         npm install --prefer-offline=false --no-audit); \
    else \
        echo "使用 npm install 安装依赖..." && \
        npm install --prefer-offline=false --no-audit || \
        (echo "npm install 失败，尝试清理缓存后重试..." && \
         npm cache clean --force && \
         npm install --prefer-offline=false --no-audit); \
    fi && \
    echo "依赖安装完成" && \
    echo "验证 better-sqlite3 安装..." && \
    (node -e "require('better-sqlite3')" && echo "✅ better-sqlite3 安装成功") || \
    (echo "⚠️  better-sqlite3 验证失败，但继续构建..." && true)

# 复制源代码
COPY backend/src ./src
COPY backend/scripts ./scripts

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
# 确保根目录 package.json 在运行时也可用
COPY --from=builder /app/../package.json /app/../package.json
RUN if [ -f /app/../package.json ]; then \
      echo "✓ 运行时根目录 package.json 已就绪"; \
    else \
      echo "⚠️  警告: 运行时根目录 package.json 不存在，版本号可能显示为 0.0.0-UNKNOWN"; \
    fi

# 创建必要的目录（统一放在 data 目录下）
RUN mkdir -p /app/data/books/public /app/data/books/user /app/data/covers /app/data/fonts /app/data/import /app/data/cache/ocr /app/data/cache/tts

# 创建启动脚本来确保挂载的目录结构正确
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'echo "正在检查并创建必要的目录..."' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data/books/public' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data/books/user' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data/books/.temp' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data/covers' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data/fonts' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data/import' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data/cache/ocr' >> /app/entrypoint.sh && \
    echo 'mkdir -p /app/data/cache/tts' >> /app/entrypoint.sh && \
    echo 'echo "目录结构已就绪"' >> /app/entrypoint.sh && \
    echo 'echo "启动应用..."' >> /app/entrypoint.sh && \
    echo 'exec node dist/index.js' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# 设置目录权限（确保有写入权限）
RUN chmod -R 755 /app/data

# 设置环境变量（统一使用 data 目录）
ENV NODE_ENV=production
ENV PORT=1281
ENV DATA_ROOT=./data
ENV DB_PATH=./data/database.db
ENV BOOKS_DIR=./data/books
ENV COVERS_DIR=./data/covers
ENV FONTS_DIR=./data/fonts
ENV IMPORT_DIR=./data/import
ENV MESSAGES_DIR=./data/messages
ENV OCR_CACHE_DIR=./data/cache/ocr
ENV TTS_CACHE_DIR=./data/cache/tts

# 暴露端口
EXPOSE 1281

# 启动命令
CMD ["/app/entrypoint.sh"]

