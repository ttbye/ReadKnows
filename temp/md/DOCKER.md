# Docker 部署指南

本文档介绍如何使用 Docker 部署 KnowBooks 系统。

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少 2GB 可用内存
- 至少 10GB 可用磁盘空间（用于书籍存储）

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd KnowBooks
```

### 2. 配置环境变量

复制环境变量示例文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置必要的配置：

```env
# JWT密钥（必须修改为强随机字符串）
JWT_SECRET=your-very-strong-random-secret-key-here

# 其他可选配置
JWT_EXPIRES_IN=7d
DOUBAN_API_BASE=
AI_PROVIDER=ollama
AI_API_URL=http://localhost:11434
```

### 3. 构建并启动

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 查看服务状态
docker-compose ps
```

### 4. 初始化管理员账户

```bash
# 进入后端容器
docker-compose exec backend sh

# 在容器内运行初始化脚本
node scripts/initAdmin.js

# 或者直接运行
docker-compose exec backend node scripts/initAdmin.js
```

### 5. 访问应用

- 前端: http://localhost
- 后端API: http://localhost/api

## 数据持久化

数据存储在以下目录（通过 Docker volumes 挂载）：

- `./backend/data` - 数据库文件
- `./backend/books` - 书籍文件
- `./backend/covers` - 封面图片
- `./backend/fonts` - 字体文件

**重要**: 这些目录会在首次启动时自动创建。确保这些目录有适当的权限。

## 生产环境部署

### 使用生产配置

```bash
# 使用生产配置（使用Docker volumes而不是本地目录）
docker-compose -f docker-compose.prod.yml up -d
```

### 配置HTTPS（推荐）

1. 修改 `frontend/nginx.conf`，添加SSL配置
2. 挂载SSL证书到nginx容器
3. 暴露443端口

示例nginx配置：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # ... 其他配置
}
```

在 `docker-compose.prod.yml` 中添加：

```yaml
frontend:
  volumes:
    - ./ssl:/etc/nginx/ssl:ro
  ports:
    - "443:443"
```

### 反向代理（可选）

如果需要使用外部反向代理（如Nginx、Traefik等），可以：

1. 不暴露前端端口，只暴露后端端口
2. 在外部反向代理中配置路由规则

## 常用命令

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart backend
```

### 停止服务

```bash
# 停止所有服务
docker-compose down

# 停止并删除volumes（注意：会删除数据）
docker-compose down -v
```

### 更新服务

```bash
# 重新构建并启动
docker-compose up -d --build

# 只重新构建特定服务
docker-compose up -d --build backend
```

### 进入容器

```bash
# 进入后端容器
docker-compose exec backend sh

# 进入前端容器
docker-compose exec frontend sh
```

## 备份和恢复

### 备份数据

```bash
# 备份数据库
docker-compose exec backend cp /app/data/database.db /app/data/database.db.backup

# 备份整个数据目录
tar -czf backup-$(date +%Y%m%d).tar.gz backend/data backend/books backend/covers backend/fonts
```

### 恢复数据

```bash
# 停止服务
docker-compose down

# 恢复数据
tar -xzf backup-YYYYMMDD.tar.gz

# 启动服务
docker-compose up -d
```

## 故障排查

### 检查服务状态

```bash
# 查看容器状态
docker-compose ps

# 查看健康检查状态
docker-compose ps --format "table {{.Name}}\t{{.Status}}"
```

### 查看错误日志

```bash
# 查看后端错误
docker-compose logs backend | grep -i error

# 查看前端错误
docker-compose logs frontend | grep -i error
```

### 常见问题

1. **端口被占用**
   - 修改 `docker-compose.yml` 中的端口映射
   - 或停止占用端口的服务

2. **权限问题**
   - 确保数据目录有写入权限：`chmod -R 755 backend/data backend/books`

3. **Canvas依赖问题**
   - 后端Dockerfile已包含所有必要的系统依赖
   - 如果仍有问题，检查容器日志

4. **数据库初始化失败**
   - 确保 `backend/data` 目录存在且有写入权限
   - 检查容器日志获取详细错误信息

5. **前端无法连接后端**
   - 检查网络配置：`docker-compose ps` 确认服务都在运行
   - 检查nginx配置中的proxy_pass地址
   - 确认后端健康检查通过

## 性能优化

### 资源限制

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### 数据库优化

对于大量书籍，考虑：
- 定期清理旧数据
- 优化数据库索引
- 使用外部数据库（如PostgreSQL）替代SQLite

## 安全建议

1. **修改JWT密钥**: 生产环境必须使用强随机字符串
2. **使用HTTPS**: 配置SSL证书
3. **限制访问**: 使用防火墙限制不必要的端口
4. **定期更新**: 保持Docker镜像和依赖更新
5. **备份数据**: 定期备份重要数据

## 监控

### 健康检查

服务包含健康检查，可以通过以下方式查看：

```bash
docker inspect --format='{{.State.Health.Status}}' knowbooks-backend
docker inspect --format='{{.State.Health.Status}}' knowbooks-frontend
```

### 资源使用

```bash
# 查看资源使用情况
docker stats
```

## 支持

如有问题，请查看：
- 项目文档: `md/` 目录
- 日志文件: `docker-compose logs`
- GitHub Issues

