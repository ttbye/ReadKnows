# Nginx 反向代理配置指南

如果您的 KnowBooks 部署在 Docker 容器中，并通过外部 Nginx 反向代理访问，需要配置以下设置以支持大文件上传。

## 问题说明

413 错误（Request Entity Too Large）通常是由于 Nginx 的 `client_max_body_size` 限制太小导致的。

## 解决方案

### 1. 修改外部 Nginx 配置

编辑您的 Nginx 配置文件（通常在 `/etc/nginx/sites-available/your-site` 或 `/etc/nginx/nginx.conf`）：

```nginx
server {
    listen 8012;
    server_name vlistttbye.i234.me;

    # 全局设置：允许上传最大 500MB 文件
    client_max_body_size 500M;
    
    # 增加超时时间（用于大文件上传）
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;

    # 前端代理
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

    # 后端 API 代理（重要：必须设置 client_max_body_size）
    location /api {
        proxy_pass http://localhost:1201;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 支持大文件上传（500MB）
        client_max_body_size 500M;
        
        # 增加超时时间
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # 书籍文件代理
    location /books {
        proxy_pass http://localhost:1201;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 支持大文件下载
        client_max_body_size 500M;
        
        # 增加超时时间
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

### 2. 应用配置并重启 Nginx

```bash
# 测试配置是否正确
sudo nginx -t

# 重新加载配置
sudo nginx -s reload

# 或重启 Nginx
sudo systemctl restart nginx
```

### 3. 验证配置

上传一个较大的文件（例如 50MB 的 PDF），确认不再出现 413 错误。

## 已修复的配置

项目内部已经修复了以下配置：

1. **前端 Nginx** (`frontend/nginx.conf`)
   - `/api` 位置块添加了 `client_max_body_size 500M`

2. **后端 Express** (`backend/src/index.ts`)
   - JSON 和 URL 编码的请求体限制增加到 500MB

3. **后端 Multer** (`backend/src/routes/books.ts`)
   - 文件上传限制从 100MB 增加到 500MB

## 注意事项

1. **文件大小限制**：当前设置为 500MB，如果您的电子书文件更大，可以相应增加：
   ```nginx
   client_max_body_size 1G;  # 1GB
   ```

2. **超时时间**：大文件上传可能需要更长时间，确保超时设置足够：
   ```nginx
   proxy_connect_timeout 600s;  # 10分钟
   proxy_send_timeout 600s;
   proxy_read_timeout 600s;
   ```

3. **磁盘空间**：确保服务器有足够的磁盘空间存储上传的书籍文件。

## 故障排查

如果仍然出现 413 错误：

1. **检查 Nginx 配置**：确认 `client_max_body_size` 已正确设置
2. **检查 Nginx 错误日志**：`sudo tail -f /var/log/nginx/error.log`
3. **检查 Docker 容器日志**：`docker-compose logs backend`
4. **确认配置已生效**：重启 Nginx 后再次尝试上传

## 相关文件

- `frontend/nginx.conf` - 前端容器内的 Nginx 配置
- `backend/src/index.ts` - Express 服务器配置
- `backend/src/routes/books.ts` - 书籍上传路由配置

