# 📚 Docker 环境中安装 Calibre（MOBI转EPUB）

## 问题说明

在Docker环境中，MOBI文件无法转换为EPUB，因为缺少Calibre转换工具。Calibre提供了`ebook-convert`命令行工具用于格式转换。

## 解决方案

### 方案一：在Dockerfile中安装Calibre（已更新）✅

我已经更新了 `backend/Dockerfile`，添加了Calibre安装步骤。重新构建镜像即可：

```bash
# 重新构建后端镜像
docker-compose build backend --no-cache

# 或使用构建脚本
./rebuild.sh -b --no-cache
```

### 方案二：手动在容器中安装（临时方案）

如果不想重新构建镜像，可以在运行中的容器中安装：

```bash
# 进入后端容器
docker-compose exec backend sh

# 在容器内执行（需要root权限）
apk update
apk add --no-cache wget bash curl python3

# 安装glibc（Calibre需要）
wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub
wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.35-r1/glibc-2.35-r1.apk
wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.35-r1/glibc-bin-2.35-r1.apk
apk add --allow-untrusted glibc-2.35-r1.apk glibc-bin-2.35-r1.apk

# 安装Calibre
wget -nv -O- https://download.calibre-ebook.com/dist/linux-installer.sh | sh /dev/stdin install_dir=/opt/calibre
ln -sf /opt/calibre/ebook-convert /usr/local/bin/ebook-convert

# 验证安装
ebook-convert --version
```

**注意**：这种方式在容器重启后会丢失，需要每次重启后重新安装。

### 方案三：使用基于Debian的镜像（推荐用于生产环境）

如果Alpine上安装Calibre有问题，可以考虑使用基于Debian的镜像：

```dockerfile
# 使用Debian基础镜像（更容易安装Calibre）
FROM node:20-slim

# 安装Calibre（Debian上更简单）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    wget \
    xdg-utils \
    && wget -nv -O- https://download.calibre-ebook.com/dist/linux-installer.sh | sh /dev/stdin install_dir=/opt/calibre && \
    ln -sf /opt/calibre/ebook-convert /usr/local/bin/ebook-convert && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

## 验证安装

### 检查Calibre是否安装

```bash
# 在容器中检查
docker-compose exec backend ebook-convert --version

# 或进入容器检查
docker-compose exec backend sh
ebook-convert --version
```

### 测试MOBI转换

```bash
# 上传一个MOBI文件，查看日志
docker-compose logs -f backend | grep -i mobi
```

## 常见问题

### 1. 安装失败：找不到glibc

**原因**：Alpine Linux使用musl libc，而Calibre需要glibc。

**解决**：按照上面的步骤安装glibc兼容层。

### 2. 安装失败：网络问题

**原因**：无法下载Calibre安装脚本。

**解决**：
- 检查网络连接
- 使用代理或VPN
- 手动下载安装包

### 3. 转换失败：权限问题

**原因**：容器内没有写入权限。

**解决**：
```bash
# 确保数据目录有写入权限
docker-compose exec backend chmod -R 755 /app/books
```

### 4. 转换失败：文件路径问题

**原因**：文件路径包含特殊字符或空格。

**解决**：代码中已处理路径转义，如仍有问题请检查日志。

## 镜像大小影响

安装Calibre会增加镜像大小约200-300MB。如果不需要MOBI转换功能，可以：

1. 不安装Calibre（MOBI文件将无法转换）
2. 使用多阶段构建，只在需要时安装
3. 使用外部转换服务

## 更新后的Dockerfile说明

更新后的Dockerfile包含：

1. **glibc安装**：为Alpine添加glibc兼容层
2. **Calibre安装**：使用官方安装脚本
3. **符号链接**：创建`ebook-convert`命令的快捷方式
4. **验证步骤**：检查安装是否成功

## 重新部署步骤

```bash
# 1. 停止容器
docker-compose down

# 2. 重新构建后端镜像（包含Calibre）
docker-compose build backend --no-cache

# 3. 启动服务
docker-compose up -d

# 4. 验证Calibre安装
docker-compose exec backend ebook-convert --version

# 5. 测试MOBI转换
# 上传一个MOBI文件，检查是否成功转换
```

## 相关文件

- `backend/Dockerfile` - 已更新，包含Calibre安装
- `backend/src/utils/epubConverter.ts` - MOBI转换逻辑
- `backend/src/routes/books.ts` - 上传时的MOBI处理

## 注意事项

1. **首次构建时间**：安装Calibre会增加构建时间（约5-10分钟）
2. **镜像大小**：镜像会增加约200-300MB
3. **网络要求**：需要能够访问Calibre下载服务器
4. **Alpine兼容性**：Alpine上安装Calibre可能不如Debian稳定

如果遇到问题，建议使用基于Debian的镜像（方案三）。

