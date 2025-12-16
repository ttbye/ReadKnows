# Docker部署 502/Network Error 修复指南

## 🔍 问题诊断

你遇到的错误：
- `502 Bad Gateway` - 前端可以访问，但后端无响应
- `ERR_NETWORK` - 网络连接失败  
- `ERR_CONNECTION_TIMED_OUT` - 连接超时

## 📋 检查清单

### 1. 检查Docker容器状态

```bash
cd /Users/ttbye/MyCODE/KnowBooks

# 查看容器状态
docker-compose ps

# 应该看到两个容器都是 "Up" 状态
# NAME                    STATUS
# knowbooks-backend       Up
# knowbooks-frontend      Up
```

**如果容器未运行**，参考下面的启动步骤。

### 2. 检查容器日志

```bash
# 查看后端日志
docker-compose logs backend | tail -50

# 查看前端日志  
docker-compose logs frontend | tail -50

# 实时查看日志
docker-compose logs -f
```

查找关键信息：
- ✅ `服务器运行在 http://0.0.0.0:3001` - 后端正常启动
- ❌ 任何ERROR或ECONNREFUSED - 表示有问题

### 3. 测试后端连接

```bash
# 测试后端健康检查
curl http://localhost:1201/api/health

# 应该返回：{"status":"ok","timestamp":"..."}

# 如果失败，尝试容器内部测试
docker exec knowbooks-backend wget -O- http://localhost:3001/api/health
```

## 🔧 解决方案

### 方案1：重新构建并启动（最常用）

```bash
cd /Users/ttbye/MyCODE/KnowBooks

# 1. 停止现有容器
docker-compose down

# 2. 确认Docker镜像源已修复（参考前面的指南）

# 3. 重新构建（使用无缓存）
docker-compose build --no-cache

# 4. 启动服务
docker-compose up -d

# 5. 查看日志确认启动
docker-compose logs -f backend
```

等待看到：
```
服务器运行在 http://0.0.0.0:3001
启动自动导入服务...
自动导入服务已启动
```

### 方案2：检查端口占用

```bash
# 检查端口1201和1280是否被占用
lsof -i :1201
lsof -i :1280

# 如果被占用，可以：
# 1. 停止占用端口的进程
# 2. 或修改 docker-compose.yml 中的端口映射
```

### 方案3：检查防火墙和网络

```bash
# macOS：检查防火墙设置
# 系统偏好设置 -> 安全性与隐私 -> 防火墙

# 确保Docker可以访问网络
docker network ls
docker network inspect knowbooks_knowbooks-network
```

### 方案4：重置Docker环境

```bash
# 如果以上都不行，重置Docker

# 1. 停止所有容器
docker-compose down

# 2. 清理Docker资源
docker system prune -a --volumes
# 警告：这会删除所有未使用的镜像和卷！

# 3. 重新构建
docker-compose build --no-cache
docker-compose up -d
```

## 🌐 反向代理配置

如果你使用Nginx反向代理（https://vlistttbye.i234.me:12280），需要确保配置正确：

### Nginx配置示例

```nginx
# /etc/nginx/conf.d/knowbooks.conf

server {
    listen 12280 ssl;
    server_name vlistttbye.i234.me;

    # SSL证书配置
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 前端静态文件
    location / {
        proxy_pass http://localhost:1280;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 后端API
    location /api/ {
        proxy_pass http://localhost:1201;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 增加超时时间
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 书籍文件
    location /books/ {
        proxy_pass http://localhost:1201;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # 大文件传输设置
        client_max_body_size 500M;
        proxy_request_buffering off;
    }
}
```

重载Nginx：
```bash
sudo nginx -t  # 测试配置
sudo nginx -s reload  # 重载配置
```

## ✅ 验证修复

1. **测试后端**：
```bash
curl http://localhost:1201/api/health
# 应该返回: {"status":"ok",...}
```

2. **测试前端**：
```bash
curl -I http://localhost:1280
# 应该返回: HTTP/1.1 200 OK
```

3. **浏览器测试**：
- 打开 http://localhost:1280
- 检查Console是否有错误
- 尝试登录和浏览书籍

4. **通过域名测试**：
- 打开 https://vlistttbye.i234.me:12280
- 应该能正常访问

## 📊 常见错误及解决

### 错误1：`dial tcp: lookup docker.mirrors.tuna.tsinghua.edu.cn: no such host`

**原因**：Docker镜像源配置错误

**解决**：
```bash
./docker-fix-registry.sh
# 按照指南修复Docker镜像源配置
```

### 错误2：`Error: Cannot find module 'xxx'`

**原因**：依赖未正确安装

**解决**：
```bash
# 重新安装依赖
cd backend && npm install
cd ../frontend && npm install

# 重新构建
cd ..
docker-compose build --no-cache
```

### 错误3：`EADDRINUSE: address already in use :::3001`

**原因**：端口被占用

**解决**：
```bash
# 查找占用进程
lsof -i :3001
# 停止该进程或修改端口配置
```

### 错误4：容器启动后立即退出

**原因**：代码错误或配置问题

**解决**：
```bash
# 查看完整日志
docker-compose logs backend

# 尝试直接运行查看详细错误
docker-compose run --rm backend node dist/index.js
```

## 🚀 快速启动脚本

使用我们创建的快速启动脚本：

```bash
./quick-start.sh
```

这个脚本会：
1. 检查Docker状态
2. 检查镜像源配置
3. 构建镜像（如需要）
4. 启动服务
5. 显示访问地址

## 📞 获取更多帮助

如果问题仍未解决：

1. **收集诊断信息**：
```bash
# 保存完整日志
docker-compose logs > docker-logs.txt

# 保存系统信息
docker info > docker-info.txt
docker-compose ps > docker-ps.txt
```

2. **检查相关文档**：
- `PWA_ICONS_SETUP.md` - PWA图标问题
- `DOCKER_TROUBLESHOOTING.md` - 其他Docker问题
- `FIX_COVERS_GUIDE.md` - 封面显示问题

3. **运行诊断脚本**：
```bash
./quick-start.sh  # 自动诊断和启动
./fix-pwa-icons.sh  # 修复PWA图标
./check-covers.sh  # 检查封面状态
```
