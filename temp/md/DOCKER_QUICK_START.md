# Docker 快速开始指南

## 🚀 快速部署

### 方法一：使用快速部署脚本（推荐）

**适用于中国大陆用户，自动启用国内镜像源：**

```bash
chmod +x docker-start-fast.sh
./docker-start-fast.sh
```

### 方法二：标准部署

**适用于国际用户：**

```bash
chmod +x docker-start.sh
./docker-start.sh
```

## 📦 部署方式对比

| 方式 | 适用场景 | 首次部署时间 | 特点 |
|------|----------|--------------|------|
| `docker-start-fast.sh` | 中国大陆 | **5-10 分钟** | 自动启用国内镜像源 |
| `docker-start.sh` | 国际 | 10-15 分钟 | 使用默认配置 |

## 🎯 优化特性

### 1. 智能缓存
- ✅ 依赖文件单独缓存
- ✅ 源代码变更不重装依赖
- ✅ 多阶段构建减少镜像体积

### 2. 国内加速（可选）
- 🚀 Alpine Linux 阿里云镜像
- 🚀 npm 淘宝镜像
- 🚀 自动恢复原始配置

### 3. 排除无用文件
- 📦 通过 `.dockerignore` 减少构建上下文
- 📦 不包含开发依赖和文档
- 📦 加快镜像传输速度

## 🛠️ 手动启用国内镜像源

如果想永久启用国内镜像源，编辑以下文件：

### 后端 (`backend/Dockerfile`)

```dockerfile
# 第 6 行，取消注释
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 第 23 行，取消注释
RUN npm config set registry https://registry.npmmirror.com

# 第 45 行，取消注释
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
```

### 前端 (`frontend/Dockerfile`)

```dockerfile
# 第 8 行，取消注释
RUN npm config set registry https://registry.npmmirror.com

# 第 34 行，取消注释
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
```

## 📋 常用命令

### 部署相关

```bash
# 标准部署
./docker-start.sh

# 快速部署（国内镜像）
./docker-start-fast.sh

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 重新构建
docker-compose up -d --build
```

### 日志查看

```bash
# 查看所有日志
docker-compose logs -f

# 查看后端日志
docker-compose logs -f backend

# 查看前端日志
docker-compose logs -f frontend

# 查看最近 100 行
docker-compose logs --tail=100 backend
```

### 容器管理

```bash
# 查看容器状态
docker-compose ps

# 进入后端容器
docker-compose exec backend sh

# 进入前端容器
docker-compose exec frontend sh

# 重启特定服务
docker-compose restart backend
```

### 清理与维护

```bash
# 清理构建缓存
docker builder prune -f

# 深度清理（谨慎使用）
docker system prune -a -f

# 查看磁盘使用
docker system df

# 查看镜像列表
docker images | grep knowbooks
```

## 🔧 初始化

### 创建管理员账户

```bash
# 方法一：在部署脚本中选择创建

# 方法二：手动创建
docker-compose exec backend node scripts/initAdmin.js
```

### 重置密码

```bash
docker-compose exec backend node scripts/resetPassword.js
```

## 🌐 访问地址

部署成功后，可以通过以下地址访问：

- **前端页面**: http://localhost
- **后端 API**: http://localhost/api
- **OPDS 地址**: http://localhost/api/opds

> 注意：如果是远程服务器，将 `localhost` 替换为服务器 IP 地址

## ⚡ 性能优化技巧

### 1. 配置 Docker Hub 镜像加速

编辑 `/etc/docker/daemon.json`（需要 root 权限）：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
```

重启 Docker：
```bash
sudo systemctl restart docker
```

### 2. 预拉取基础镜像

```bash
docker pull node:20-alpine
docker pull nginx:alpine
```

### 3. 使用 BuildKit（推荐）

```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
docker-compose build
```

## 🐛 故障排除

### 问题：构建很慢

**解决方案：**
1. 使用 `docker-start-fast.sh`（中国大陆用户）
2. 配置 Docker Hub 镜像加速
3. 检查网络连接

### 问题：端口被占用

```bash
# 查看端口占用
netstat -tulnp | grep :80
netstat -tulnp | grep :3001

# 修改 docker-compose.yml 中的端口映射
```

### 问题：权限不足

```bash
# 确保脚本有执行权限
chmod +x docker-start.sh
chmod +x docker-start-fast.sh

# 或使用 sudo
sudo ./docker-start.sh
```

### 问题：镜像构建失败

```bash
# 清理缓存后重试
docker builder prune -a -f
docker-compose build --no-cache
```

### 问题：Alpine 包安装失败

**错误信息：**
```
ERROR: unable to select packages:
  librsvg-2.61.2-r0:
    masked in: --no-network
```

**解决方案：**
1. 已在新版本中移除 librsvg 依赖
2. 使用最新的 Dockerfile
3. 如仍有问题，使用 `docker-start-fast.sh` 启用国内镜像

## 📊 部署时间参考

### 首次部署

| 环境 | 无优化 | 使用优化 | 节省时间 |
|------|--------|----------|----------|
| 国际网络 | 10-15 分钟 | 8-12 分钟 | ~20% |
| 中国大陆 | 30-60 分钟 | **5-10 分钟** | **~80%** |

### 后续部署（有缓存）

| 修改类型 | 时间 |
|---------|------|
| 只改前端代码 | 1-2 分钟 |
| 只改后端代码 | 1-2 分钟 |
| 修改依赖 | 3-5 分钟 |
| 完全重建 | 5-10 分钟 |

## 📚 更多信息

- 详细优化指南：查看 `DOCKER_OPTIMIZATION.md`
- Docker 部署文档：查看 `DOCKER.md`
- 安装说明：查看 `INSTALL.md`

## 💡 提示

1. **首次部署**：建议使用 `docker-start-fast.sh`（中国用户）
2. **开发环境**：保持缓存，避免使用 `--no-cache`
3. **生产环境**：定期更新镜像和依赖
4. **监控日志**：使用 `docker-compose logs -f` 实时查看

## 🆘 获取帮助

如果遇到问题：

1. 查看日志：`docker-compose logs -f`
2. 检查容器状态：`docker-compose ps`
3. 查看详细文档：`DOCKER_OPTIMIZATION.md`
4. 提交 Issue 到项目仓库

---

祝你部署顺利！🎉

