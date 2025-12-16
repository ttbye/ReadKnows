# Nginx反向代理配置指南

## 🔍 问题诊断

你的URL无法访问：
- https://vlistttbye.i234.me:12280/books/public/cover.jpg ❌
- https://vlistttbye.i234.me:12280/books/public/%E6%96%87%E5%AD%A6/%E6%98%8E%E9%81%93/%E4%BA%BA%E6%80%A7%E9%AB%98%E6%89%8B/cover.jpg ❌

**可能原因：Nginx没有正确代理 `/books/` 路径到后端**

## ✅ 正确的Nginx配置

### 完整配置示例

在远程服务器上编辑Nginx配置（通常在 `/etc/nginx/sites-available/` 或 `/etc/nginx/conf.d/`）：

```nginx
server {
    listen 12280 ssl http2;
    server_name vlistttbye.i234.me;

    # SSL证书配置
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;
    
    # SSL优化配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 日志配置（方便调试）
    access_log /var/log/nginx/knowbooks_access.log;
    error_log /var/log/nginx/knowbooks_error.log;

    # 客户端上传大小限制
    client_max_body_size 500M;

    # 前端静态文件
    location / {
        proxy_pass http://localhost:1280;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端API（关键！）
    location /api/ {
        proxy_pass http://localhost:1201/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # API超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 书籍文件和封面（最重要！）
    location /books/ {
        proxy_pass http://localhost:1201/books/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 支持大文件传输
        proxy_buffering off;
        proxy_request_buffering off;
        
        # 超时设置
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # 缓存设置（可选，提高性能）
        proxy_cache_valid 200 302 7d;
        proxy_cache_valid 404 1m;
        add_header X-Cache-Status $upstream_cache_status;
    }
}
```

## 🔧 在远程服务器上检查和修复

### 1. SSH连接到服务器

```bash
ssh user@vlistttbye.i234.me
# 或
ssh user@your-server-ip
```

### 2. 检查Nginx配置

```bash
# 查找配置文件
sudo find /etc/nginx -name "*.conf" | xargs grep -l "12280"

# 或查看所有站点配置
ls -la /etc/nginx/sites-enabled/
ls -la /etc/nginx/conf.d/

# 查看具体配置
sudo cat /etc/nginx/sites-available/knowbooks.conf
# 或
sudo cat /etc/nginx/conf.d/knowbooks.conf
```

### 3. 检查是否有 `/books/` 配置

在配置文件中查找：

```bash
sudo nginx -T | grep -A 10 "location /books"
```

**如果没有找到**，说明Nginx没有代理 `/books/` 路径！

### 4. 测试Nginx配置

```bash
# 测试配置语法
sudo nginx -t

# 如果OK，重载配置
sudo nginx -s reload

# 或重启Nginx
sudo systemctl restart nginx
```

### 5. 检查Docker容器状态

```bash
# 查看容器是否运行
docker-compose ps

# 或
docker ps | grep knowbooks

# 查看后端日志
docker-compose logs backend | tail -50
```

### 6. 测试后端直接访问

```bash
# 在服务器上测试后端
curl -I http://localhost:1201/api/health

# 测试books路径
curl -I http://localhost:1201/books/public/cover.jpg

# 如果返回404，检查文件是否存在
docker exec knowbooks-backend ls -la /app/books/public/
```

### 7. 测试通过Nginx访问

```bash
# 在服务器上测试
curl -I http://localhost:12280/books/public/cover.jpg

# 如果这个能访问但外部不行，可能是防火墙问题
```

## 🐛 常见问题

### 问题1: Nginx返回404

**症状**：
```bash
curl http://localhost:12280/books/public/cover.jpg
# 返回404
```

**原因**：Nginx配置中缺少 `/books/` 的location块

**解决**：添加上面的 `location /books/` 配置，然后重载Nginx

### 问题2: Nginx返回502 Bad Gateway

**症状**：
```bash
curl http://localhost:12280/books/public/cover.jpg
# 返回502
```

**原因**：后端容器未运行或端口不对

**解决**：
```bash
# 检查容器
docker-compose ps

# 重启容器
docker-compose restart

# 检查端口
netstat -tlnp | grep 1201
```

### 问题3: 后端直接访问OK，通过Nginx不行

**症状**：
```bash
curl http://localhost:1201/books/public/cover.jpg  # ✅ OK
curl http://localhost:12280/books/public/cover.jpg  # ❌ 404
```

**原因**：Nginx配置问题或没有重载

**解决**：
```bash
# 检查Nginx配置
sudo nginx -T | grep -A 10 "/books"

# 重新加载
sudo nginx -s reload
```

### 问题4: 中文路径无法访问

**症状**：
```bash
# 英文路径OK
curl http://localhost:12280/books/public/cover.jpg  # ✅

# 中文路径失败
curl "http://localhost:12280/books/public/文学/明道/人性高手/cover.jpg"  # ❌
```

**原因**：URL没有编码

**解决**：前端应该自动编码（我们已修复coverHelper.ts），或手动编码：

```bash
# 正确的编码URL
curl "http://localhost:12280/books/public/%E6%96%87%E5%AD%A6/%E6%98%8E%E9%81%93/%E4%BA%BA%E6%80%A7%E9%AB%98%E6%89%8B/cover.jpg"
```

## 📊 完整诊断流程

在远程服务器上依次执行：

```bash
echo "=== 1. 检查Docker容器 ==="
docker-compose ps

echo ""
echo "=== 2. 检查后端健康 ==="
curl http://localhost:1201/api/health

echo ""
echo "=== 3. 列出books目录 ==="
docker exec knowbooks-backend ls -la /app/books/public/

echo ""
echo "=== 4. 测试后端直接访问 ==="
curl -I http://localhost:1201/books/public/cover.jpg

echo ""
echo "=== 5. 测试Nginx代理 ==="
curl -I http://localhost:12280/books/public/cover.jpg

echo ""
echo "=== 6. 检查Nginx配置 ==="
sudo nginx -T | grep -A 10 "location /books"

echo ""
echo "=== 7. 检查Nginx日志 ==="
sudo tail -20 /var/log/nginx/knowbooks_error.log
```

## 🔐 群晖NAS特别说明

如果你的服务器是群晖NAS：

### 1. 通过SSH连接

```bash
ssh admin@your-nas-ip
sudo -i
```

### 2. 找到Nginx配置

群晖的Nginx配置可能在：
```bash
# 检查这些位置
ls /etc/nginx/conf.d/
ls /etc/nginx/sites-enabled/
ls /usr/local/etc/nginx/conf.d/

# 或使用DSM的Web界面：
# 控制面板 -> 应用程序门户 -> 反向代理服务器
```

### 3. 添加反向代理规则

在DSM Web界面：
1. 控制面板 -> 应用程序门户
2. 反向代理服务器 -> 新增
3. 配置：
   - 来源协议：HTTPS
   - 主机名：vlistttbye.i234.me
   - 端口：12280
   - 目标协议：HTTP
   - 主机名：localhost
   - 端口：1280（前端）

4. 自定义标题（重要！）：
   点击"自定义标题"，添加：
   ```
   位置: /books/
   目标URL: http://localhost:1201/books/
   ```

## 📝 快速修复检查清单

在远程服务器上：

- [ ] Docker容器正在运行：`docker-compose ps`
- [ ] 后端健康检查通过：`curl http://localhost:1201/api/health`
- [ ] books文件存在：`docker exec knowbooks-backend ls /app/books/public/`
- [ ] 后端直接访问OK：`curl -I http://localhost:1201/books/public/cover.jpg`
- [ ] Nginx配置有 `/books/` 块：`sudo nginx -T | grep "/books"`
- [ ] Nginx配置语法正确：`sudo nginx -t`
- [ ] Nginx已重载：`sudo nginx -s reload`
- [ ] 通过Nginx访问OK：`curl -I http://localhost:12280/books/public/cover.jpg`
- [ ] 防火墙允许12280端口
- [ ] 外部访问正常：浏览器访问 `https://vlistttbye.i234.me:12280/books/public/cover.jpg`

## 🎯 最可能的问题

基于你的描述，**最可能的问题是Nginx配置中缺少 `/books/` 的代理规则**。

**立即在服务器上运行**：

```bash
# SSH到服务器
ssh user@your-server

# 检查是否有books配置
sudo nginx -T | grep -C 5 "/books"

# 如果没有输出，说明缺少配置！
# 需要添加上面的 location /books/ 配置
```

---

需要我帮你生成完整的Nginx配置文件吗？或者有其他问题？
