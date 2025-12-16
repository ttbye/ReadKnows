# 远程服务器修复指南

## 🎯 你的架构

```
Internet (公网)
    ↓ :12280 (HTTPS)
前端容器 (Nginx:80) → 映射到宿主机 1280 → 映射到公网 12280
    ↓ (Docker内网，通过服务名访问)
后端容器 (Express:3001) → 映射到宿主机 1201 (仅内网)
```

## ✅ 配置已正确

你的配置文件已经正确：
- ✅ `nginx.conf` 已配置 `/books` 和 `/api` 代理到 `backend:3001`
- ✅ `docker-compose.yml` 两个容器在同一网络 `knowbooks-network`
- ✅ 服务名称 `backend` 匹配

## 🔍 需要在远程服务器上检查

SSH到你的远程服务器，然后运行：

### 1. 检查Docker容器状态

```bash
cd /volume5/docker/bookpath  # 或你的项目目录

# 检查容器状态
docker-compose ps

# 应该看到：
# NAME                  STATUS
# knowbooks-backend     Up
# knowbooks-frontend    Up
```

**如果容器没有运行**，启动它们：
```bash
docker-compose up -d
```

### 2. 检查容器网络

```bash
# 查看网络
docker network ls | grep knowbooks

# 检查容器是否在同一网络
docker network inspect knowbooks_knowbooks-network
```

应该看到 `knowbooks-backend` 和 `knowbooks-frontend` 都在这个网络中。

### 3. 测试容器间通信

```bash
# 进入前端容器
docker exec -it knowbooks-frontend sh

# 在前端容器内测试访问后端
wget -O- http://backend:3001/api/health
# 应该返回：{"status":"ok",...}

# 测试books路径
wget -O- http://backend:3001/books/public/cover.jpg
# 如果文件存在，应该能下载

# 退出容器
exit
```

**如果 `backend` 无法解析**，说明网络有问题，需要重启容器：
```bash
docker-compose down
docker-compose up -d
```

### 4. 检查后端文件是否存在

```bash
# 列出books目录
docker exec knowbooks-backend ls -la /app/books/public/

# 查找封面文件
docker exec knowbooks-backend find /app/books -name "cover.*" -type f | head -10
```

### 5. 测试后端直接访问

```bash
# 从宿主机测试后端（端口1201）
curl http://localhost:1201/api/health
curl -I http://localhost:1201/books/public/cover.jpg

# 从宿主机测试前端（端口1280）
curl http://localhost:1280/api/health
curl -I http://localhost:1280/books/public/cover.jpg
```

### 6. 查看前端Nginx日志

```bash
# 查看前端容器日志
docker-compose logs frontend | tail -50

# 实时查看
docker-compose logs -f frontend
```

然后在浏览器访问图片，看日志输出什么。

### 7. 查看后端日志

```bash
# 查看后端日志，特别是访问日志
docker-compose logs backend | grep "收到文件请求"

# 实时查看
docker-compose logs -f backend
```

## 🔧 常见问题修复

### 问题1: 容器无法互相通信（backend无法解析）

**症状**：
```bash
docker exec -it knowbooks-frontend sh
wget http://backend:3001/api/health
# 错误：could not resolve host
```

**解决**：
```bash
# 重新创建网络
docker-compose down
docker-compose up -d
```

### 问题2: Nginx配置未生效

**症状**：前端可以访问静态文件，但 `/books/` 和 `/api/` 返回404

**原因**：可能使用了旧的镜像，没有包含更新的nginx.conf

**解决**：
```bash
# 重新构建前端镜像（不使用缓存）
docker-compose build frontend --no-cache

# 重启服务
docker-compose up -d frontend
```

### 问题3: 后端容器未启动

**症状**：
```bash
docker-compose ps
# knowbooks-backend  Exit 1
```

**解决**：
```bash
# 查看错误日志
docker-compose logs backend

# 常见原因：
# - 编译错误：重新build
# - 环境变量问题：检查.env文件
# - 端口冲突：检查端口占用

# 重新构建并启动
docker-compose build backend --no-cache
docker-compose up -d
```

### 问题4: 权限问题

**症状**：后端日志显示权限错误

**解决**：
```bash
# 修复books目录权限
chmod -R 777 /volume5/docker/bookpath/books/
chmod -R 777 /volume5/docker/bookpath/data/

# 重启容器
docker-compose restart
```

## 🚀 完整重建流程

如果上面的都不行，完整重建：

```bash
# 1. 停止并删除容器
docker-compose down

# 2. 修复文件权限
chmod -R 777 /volume5/docker/bookpath/books/
chmod -R 777 /volume5/docker/bookpath/data/
chmod -R 777 /volume5/docker/bookpath/import/

# 3. 重新构建（不使用缓存）
docker-compose build --no-cache

# 4. 启动服务
docker-compose up -d

# 5. 等待30秒
sleep 30

# 6. 检查状态
docker-compose ps

# 7. 查看日志
docker-compose logs -f
```

## 📊 完整诊断脚本

将以下内容保存为 `diagnose.sh` 并在远程服务器上运行：

```bash
#!/bin/bash

echo "================================================"
echo "KnowBooks 诊断脚本"
echo "================================================"
echo ""

echo "=== 1. 检查容器状态 ==="
docker-compose ps
echo ""

echo "=== 2. 检查后端健康 ==="
curl -s http://localhost:1201/api/health || echo "❌ 后端无法访问"
echo ""

echo "=== 3. 检查前端健康 ==="
curl -s http://localhost:1280/ | head -20 || echo "❌ 前端无法访问"
echo ""

echo "=== 4. 测试前端到后端的代理 ==="
curl -s http://localhost:1280/api/health || echo "❌ 前端代理失败"
echo ""

echo "=== 5. 检查books目录 ==="
docker exec knowbooks-backend ls -la /app/books/public/ | head -10
echo ""

echo "=== 6. 测试后端books访问 ==="
curl -I http://localhost:1201/books/public/cover.jpg 2>&1 | head -5
echo ""

echo "=== 7. 测试前端books代理 ==="
curl -I http://localhost:1280/books/public/cover.jpg 2>&1 | head -5
echo ""

echo "=== 8. 测试容器间通信 ==="
docker exec knowbooks-frontend sh -c "wget -O- http://backend:3001/api/health 2>&1" | head -5
echo ""

echo "=== 9. 查看最近的错误日志 ==="
echo "--- 后端日志 ---"
docker-compose logs backend | grep -i error | tail -5
echo "--- 前端日志 ---"
docker-compose logs frontend | grep -i error | tail -5
echo ""

echo "================================================"
echo "诊断完成"
echo "================================================"
```

运行：
```bash
chmod +x diagnose.sh
./diagnose.sh
```

## 🎯 最可能的问题和解决方案

基于你的描述，最可能的问题是：

### 1. 容器没有运行

```bash
# 检查
docker-compose ps

# 如果没有运行，启动
docker-compose up -d
```

### 2. 前端镜像是旧的（没有最新的nginx.conf）

```bash
# 重新构建前端
docker-compose build frontend --no-cache
docker-compose up -d frontend
```

### 3. 网络问题

```bash
# 重建网络
docker-compose down
docker-compose up -d
```

## 📱 群晖NAS特别说明

如果在群晖NAS上：

1. 通过SSH连接：
```bash
ssh admin@your-nas-ip
sudo -i
cd /volume5/docker/bookpath  # 或你的项目目录
```

2. 群晖的Docker可能需要通过Container Manager（Docker套件）管理

3. 检查端口映射是否正确配置

## ✅ 验证修复

修复后，按顺序测试：

```bash
# 1. 后端健康检查
curl http://localhost:1201/api/health

# 2. 前端健康检查  
curl http://localhost:1280/

# 3. 前端代理到后端
curl http://localhost:1280/api/health

# 4. books路径（后端直接）
curl -I http://localhost:1201/books/public/cover.jpg

# 5. books路径（通过前端代理）
curl -I http://localhost:1280/books/public/cover.jpg

# 6. 外部访问
curl -k https://vlistttbye.i234.me:12280/api/health
curl -k -I https://vlistttbye.i234.me:12280/books/public/cover.jpg
```

全部通过后，在浏览器测试。

---

**建议：先在远程服务器上运行诊断脚本，然后根据输出结果针对性修复。**
