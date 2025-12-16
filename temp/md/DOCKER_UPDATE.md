# Docker 更新部署指南

本文档说明如何在代码更新后重新部署 KnowBooks Docker 容器。

## 📋 更新前准备

### 1. 备份数据（重要！）

```bash
cd /opt/knowbooks  # 或您的安装目录

# 备份数据目录
tar -czf ../knowbooks-backup-$(date +%Y%m%d-%H%M%S).tar.gz data/

# 或只备份数据库
cp data/backend/data/database.db ../database-backup-$(date +%Y%m%d-%H%M%S).db
```

### 2. 检查当前状态

```bash
# 查看当前运行的容器
docker-compose ps

# 查看当前版本/代码
git log -1  # 如果使用 Git
```

## 🚀 更新方法

### 方法一：使用一键更新脚本（推荐）

```bash
# 赋予执行权限
chmod +x update.sh

# 运行更新脚本
./update.sh
```

脚本会自动：
- 停止旧容器
- 拉取最新代码（如果使用 Git）
- 重新构建镜像
- 启动新容器
- 显示日志

### 方法二：手动更新

#### 步骤 1：停止旧容器

```bash
cd /opt/knowbooks
docker-compose down
```

#### 步骤 2：更新代码

**如果使用 Git：**
```bash
git pull
```

**如果是手动上传：**
```bash
# 上传新文件到服务器，覆盖旧文件
```

#### 步骤 3：重新构建镜像

```bash
# 标准构建（使用缓存，更快）
docker-compose build

# 或强制重建（不使用缓存，确保使用最新代码）
docker-compose build --no-cache
```

#### 步骤 4：启动新容器

```bash
docker-compose up -d
```

#### 步骤 5：验证更新

```bash
# 查看容器状态
docker-compose ps

# 查看日志
docker-compose logs -f --tail=50

# 检查服务健康状态
curl http://localhost:1201/api/health
```

## 🔧 常见更新场景

### 场景 1：仅代码更新（最常见）

```bash
cd /opt/knowbooks
docker-compose down
git pull  # 或手动更新文件
docker-compose up -d --build
```

### 场景 2：配置文件更新（.env）

```bash
# 编辑 .env 文件
nano .env

# 重启容器使配置生效
docker-compose restart
```

### 场景 3：Dockerfile 更新

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### 场景 4：docker-compose.yml 更新

```bash
docker-compose down
docker-compose up -d --build
```

### 场景 5：完全清理重建

```bash
# 停止并删除容器
docker-compose down

# 删除镜像（可选）
docker rmi knowbooks-backend knowbooks-frontend

# 清理构建缓存（可选）
docker builder prune -f

# 重新构建
docker-compose build --no-cache
docker-compose up -d
```

## ⚠️ 注意事项

### 1. 数据持久化

数据存储在 `data/` 目录中，更新代码不会影响数据。但建议：
- 更新前备份数据
- 确保 `docker-compose.yml` 中的 volumes 配置正确

### 2. 环境变量

如果更新了 `.env` 文件：
- 需要重启容器：`docker-compose restart`
- 或重新创建容器：`docker-compose up -d --force-recreate`

### 3. 端口冲突

如果修改了端口配置：
- 确保新端口未被占用
- 更新防火墙规则
- 更新反向代理配置（如果有）

### 4. 数据库迁移

如果更新包含数据库结构变更：
- 查看更新日志中的迁移说明
- 可能需要运行迁移脚本
- 建议先备份数据库

## 🐛 故障排查

### 问题 1：容器无法启动

```bash
# 查看详细日志
docker-compose logs backend
docker-compose logs frontend

# 检查配置
docker-compose config

# 尝试交互式启动（查看错误）
docker-compose up
```

### 问题 2：构建失败

```bash
# 清理构建缓存
docker builder prune -f

# 强制重建
docker-compose build --no-cache

# 查看构建日志
docker-compose build 2>&1 | tee build.log
```

### 问题 3：服务无响应

```bash
# 检查容器状态
docker-compose ps

# 检查端口占用
netstat -tulpn | grep -E '1201|1280'

# 检查容器日志
docker-compose logs -f
```

### 问题 4：数据丢失

```bash
# 恢复备份
cd /opt/knowbooks
tar -xzf ../knowbooks-backup-YYYYMMDD-HHMMSS.tar.gz

# 或恢复数据库
cp ../database-backup-YYYYMMDD-HHMMSS.db data/backend/data/database.db
```

## 📝 更新检查清单

更新前：
- [ ] 备份数据目录
- [ ] 备份数据库文件
- [ ] 检查磁盘空间
- [ ] 查看更新日志/变更说明

更新中：
- [ ] 停止旧容器
- [ ] 更新代码
- [ ] 重新构建镜像
- [ ] 启动新容器

更新后：
- [ ] 检查容器状态
- [ ] 查看日志确认无错误
- [ ] 测试前端访问
- [ ] 测试后端 API
- [ ] 测试文件上传功能
- [ ] 验证数据完整性

## 🔄 回滚到旧版本

如果更新后出现问题，可以回滚：

```bash
# 方法 1：使用 Git 回滚
git log  # 查看提交历史
git checkout <旧版本commit-hash>
docker-compose down
docker-compose up -d --build

# 方法 2：恢复备份
docker-compose down
tar -xzf ../knowbooks-backup-YYYYMMDD-HHMMSS.tar.gz
docker-compose up -d
```

## 📊 更新日志

记录每次更新的重要信息：

```bash
# 创建更新日志
echo "$(date): 更新到版本 $(git rev-parse --short HEAD)" >> update.log
```

## 🎯 最佳实践

1. **定期更新**：建议每周或每月更新一次
2. **测试环境**：重要更新先在测试环境验证
3. **备份策略**：更新前必须备份
4. **监控日志**：更新后观察日志 10-15 分钟
5. **分步更新**：重大更新分步骤进行
6. **文档记录**：记录每次更新的变更内容

## 📞 获取帮助

如遇到问题：
1. 查看本文档的故障排查部分
2. 检查 Docker 和容器日志
3. 查看项目 GitHub Issues
4. 联系技术支持

## 🔗 相关文档

- [DOCKER.md](./DOCKER.md) - Docker 部署指南
- [DEPLOY_ONLINE.md](./DEPLOY_ONLINE.md) - 在线部署指南
- [NGINX_PROXY_CONFIG.md](./NGINX_PROXY_CONFIG.md) - Nginx 配置指南

