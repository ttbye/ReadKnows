# Docker 部署优化指南

本指南介绍如何加速 KnowBooks 的 Docker 部署过程。

## 优化内容

### 1. 使用国内镜像源（推荐给中国大陆用户）

我们已经在 Dockerfile 中预设了国内镜像源配置，但默认是注释掉的。

#### 快速启用方法（推荐）

使用快速部署脚本，自动启用国内镜像源：

```bash
chmod +x docker-start-fast.sh
./docker-start-fast.sh
```

这个脚本会：
- 自动启用 Alpine Linux 阿里云镜像源
- 自动启用 npm 淘宝镜像源
- 提供交互式的清理选项
- 部署完成后自动恢复原始配置

#### 手动启用方法

编辑 `backend/Dockerfile` 和 `frontend/Dockerfile`，取消以下行的注释：

**Alpine Linux 镜像源：**
```dockerfile
# 将这行的注释去掉
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
# 变为
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
```

**npm 镜像源：**
```dockerfile
# 将这行的注释去掉
# RUN npm config set registry https://registry.npmmirror.com
# 变为
RUN npm config set registry https://registry.npmmirror.com
```

### 2. 使用 Docker 缓存

Docker 会缓存每一层构建，只要文件没有变化就会使用缓存。我们已经优化了 Dockerfile 的层顺序：

- **先复制依赖文件** (`package.json`)：只有依赖变化时才重新安装
- **后复制源代码**：代码变化不会触发依赖重新安装

### 3. 减少构建上下文

通过 `.dockerignore` 文件排除不必要的文件：

- 日志文件
- 临时文件
- 开发依赖
- 文档文件
- Git 历史

这可以显著减少发送到 Docker daemon 的数据量。

### 4. 使用 BuildKit

Docker BuildKit 可以并行构建多个阶段，显著加快构建速度。

启用方法（已在现代 Docker 版本中默认启用）：

```bash
export DOCKER_BUILDKIT=1
docker-compose build
```

## 部署速度对比

### 首次部署

| 配置 | 时间（估算） |
|------|-------------|
| 默认配置（国外网络） | 10-15 分钟 |
| 默认配置（中国大陆） | 30-60 分钟 |
| **使用国内镜像源** | **5-10 分钟** |

### 后续部署（有缓存）

| 场景 | 时间（估算） |
|------|-------------|
| 只改代码，依赖不变 | 2-3 分钟 |
| 依赖有变化 | 5-8 分钟 |

## 常用命令

### 标准部署

```bash
./docker-start.sh
```

### 快速部署（国内镜像源）

```bash
./docker-start-fast.sh
```

### 清理缓存后重新构建

```bash
# 清理构建缓存
docker builder prune -f

# 重新构建
docker-compose build --no-cache
docker-compose up -d
```

### 查看构建过程

```bash
# 查看详细构建日志
docker-compose build --progress=plain
```

### 只构建特定服务

```bash
# 只构建后端
docker-compose build backend

# 只构建前端
docker-compose build frontend
```

## 其他优化建议

### 1. 配置 Docker 镜像加速

如果在中国大陆使用，配置 Docker Hub 镜像加速：

编辑 `/etc/docker/daemon.json`（Linux）或 Docker Desktop 设置（Mac/Windows）：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.ccs.tencentyun.com"
  ]
}
```

重启 Docker：
```bash
sudo systemctl restart docker  # Linux
# 或重启 Docker Desktop（Mac/Windows）
```

### 2. 使用本地缓存服务器（高级）

如果频繁构建，可以考虑设置本地的：
- npm 缓存代理（如 Verdaccio）
- Docker Registry 缓存
- Alpine 包缓存

### 3. 预拉取基础镜像

在构建前先拉取基础镜像：

```bash
docker pull node:20-alpine
docker pull nginx:alpine
```

### 4. 多阶段构建优化

我们已经使用了多阶段构建：
- 构建阶段：包含所有构建工具和依赖
- 生产阶段：只包含运行时需要的文件

这减少了最终镜像的大小，加快了启动速度。

## 故障排除

### 问题：构建很慢

**解决方案：**
1. 使用 `docker-start-fast.sh` 启用国内镜像源
2. 检查网络连接
3. 配置 Docker Hub 镜像加速

### 问题：每次都重新安装依赖

**解决方案：**
1. 确保 `package.json` 和 `package-lock.json` 没有不必要的变化
2. 检查 `.dockerignore` 配置
3. 不要使用 `--no-cache` 选项

### 问题：磁盘空间不足

**解决方案：**
```bash
# 清理未使用的镜像和容器
docker system prune -a

# 查看磁盘使用情况
docker system df
```

### 问题：Alpine 包安装失败

**解决方案：**
1. 启用阿里云镜像源（使用 `docker-start-fast.sh`）
2. 更新包索引：`apk update && apk upgrade`
3. 检查网络连接

## 性能监控

### 查看构建时间

```bash
time docker-compose build
```

### 查看镜像大小

```bash
docker images | grep knowbooks
```

### 查看层信息

```bash
docker history knowbooks-backend
docker history knowbooks-frontend
```

## 总结

1. **中国大陆用户**：强烈推荐使用 `docker-start-fast.sh`
2. **其他地区用户**：使用标准的 `docker-start.sh` 即可
3. **开发环境**：保持 Docker 缓存，避免使用 `--no-cache`
4. **生产环境**：首次部署使用 `--no-cache` 确保干净构建

如有问题，请查看日志：
```bash
docker-compose logs -f
```

