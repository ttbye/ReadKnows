# SSL 证书配置指南

本文档介绍如何为 ReadKnows 配置 SSL 证书，启用 HTTPS 访问。

## 目录

1. [方案一：使用 Let's Encrypt 自动证书（推荐）](#方案一使用-lets-encrypt-自动证书推荐)
2. [方案二：使用已有证书文件](#方案二使用已有证书文件)
3. [方案三：使用自签名证书（仅测试）](#方案三使用自签名证书仅测试)
4. [Docker Compose 配置](#docker-compose-配置)
5. [验证和测试](#验证和测试)
6. [常见问题](#常见问题)

---

## 方案一：使用 Let's Encrypt 自动证书（推荐）

Let's Encrypt 提供免费的 SSL 证书，自动续期，适合生产环境。

### 前置要求

1. 拥有一个域名（例如：example.com）
2. 域名已解析到服务器 IP
3. 服务器可以访问外网（用于证书验证）

### 步骤 1：安装 Certbot

在宿主机上安装 Certbot：

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install certbot

# CentOS/RHEL
sudo yum install certbot

# 或使用 snap（推荐）
sudo snap install --classic certbot
```

### 步骤 2：获取证书

#### 方法 A：使用 Webroot 方式（推荐，适合 Docker）

```bash
# 创建证书目录
mkdir -p /path/to/ReadKnows/ssl

# 获取证书（替换为您的域名和邮箱）
sudo certbot certonly --webroot \
  -w /path/to/ReadKnows/frontend/public \
  -d example.com \
  -d www.example.com \
  --email your-email@example.com \
  --agree-tos \
  --non-interactive

# 证书文件位置：
# /etc/letsencrypt/live/example.com/fullchain.pem
# /etc/letsencrypt/live/example.com/privkey.pem
```

#### 方法 B：使用 Standalone 方式（需要停止占用 80/443 端口的服务）

```bash
# 停止 nginx 或前端容器
docker compose down frontend

# 获取证书
sudo certbot certonly --standalone \
  -d example.com \
  -d www.example.com \
  --email your-email@example.com \
  --agree-tos \
  --non-interactive

# 重启服务
docker compose up -d
```

### 步骤 3：复制证书到项目目录

```bash
# 创建 SSL 目录
mkdir -p /path/to/ReadKnows/ssl

# 复制证书文件
sudo cp /etc/letsencrypt/live/example.com/fullchain.pem /path/to/ReadKnows/ssl/
sudo cp /etc/letsencrypt/live/example.com/privkey.pem /path/to/ReadKnows/ssl/
sudo cp /etc/letsencrypt/live/example.com/chain.pem /path/to/ReadKnows/ssl/  # 可选，用于 OCSP Stapling

# 设置权限
sudo chmod 644 /path/to/ReadKnows/ssl/*.pem
sudo chmod 600 /path/to/ReadKnows/ssl/privkey.pem
```

### 步骤 4：配置自动续期

创建续期脚本 `/path/to/ReadKnows/sh/renew-ssl.sh`：

```bash
#!/bin/bash
# SSL 证书自动续期脚本

# 续期证书
certbot renew --quiet

# 复制新证书到项目目录
cp /etc/letsencrypt/live/example.com/fullchain.pem /path/to/ReadKnows/ssl/
cp /etc/letsencrypt/live/example.com/privkey.pem /path/to/ReadKnows/ssl/
cp /etc/letsencrypt/live/example.com/chain.pem /path/to/ReadKnows/ssl/  # 可选

# 重启前端容器以加载新证书
cd /path/to/ReadKnows/sh
docker compose restart frontend

echo "SSL 证书已更新"
```

设置执行权限：

```bash
chmod +x /path/to/ReadKnows/sh/renew-ssl.sh
```

添加到 crontab（每月自动续期）：

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每月 1 号凌晨 3 点执行）
0 3 1 * * /path/to/ReadKnows/sh/renew-ssl.sh >> /var/log/ssl-renew.log 2>&1
```

---

## 方案二：使用已有证书文件

如果您已有 SSL 证书文件（例如从商业 CA 购买），按以下步骤配置：

### 步骤 1：准备证书文件

将证书文件放在项目目录下：

```bash
mkdir -p /path/to/ReadKnows/ssl

# 复制您的证书文件
cp your-cert.pem /path/to/ReadKnows/ssl/cert.pem
cp your-key.pem /path/to/ReadKnows/ssl/key.pem

# 如果有中间证书，也复制
cp your-chain.pem /path/to/ReadKnows/ssl/chain.pem  # 可选

# 设置权限
chmod 644 /path/to/ReadKnows/ssl/*.pem
chmod 600 /path/to/ReadKnows/ssl/key.pem
```

### 步骤 2：修改 nginx-ssl.conf

编辑 `frontend/nginx-ssl.conf`，取消注释并修改证书路径：

```nginx
# 使用自定义证书
ssl_certificate /etc/nginx/ssl/cert.pem;
ssl_certificate_key /etc/nginx/ssl/key.pem;

# 如果有中间证书，取消注释
# ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
```

---

## 方案三：使用自签名证书（仅测试）

**警告：自签名证书仅用于测试，浏览器会显示安全警告，不适合生产环境。**

### 生成自签名证书

```bash
# 创建 SSL 目录
mkdir -p /path/to/ReadKnows/ssl

# 生成私钥
openssl genrsa -out /path/to/ReadKnows/ssl/privkey.pem 2048

# 生成证书签名请求
openssl req -new -key /path/to/ReadKnows/ssl/privkey.pem \
  -out /path/to/ReadKnows/ssl/cert.csr \
  -subj "/C=CN/ST=State/L=City/O=Organization/CN=example.com"

# 生成自签名证书（有效期 365 天）
openssl x509 -req -days 365 -in /path/to/ReadKnows/ssl/cert.csr \
  -signkey /path/to/ReadKnows/ssl/privkey.pem \
  -out /path/to/ReadKnows/ssl/fullchain.pem

# 清理临时文件
rm /path/to/ReadKnows/ssl/cert.csr

# 设置权限
chmod 644 /path/to/ReadKnows/ssl/fullchain.pem
chmod 600 /path/to/ReadKnows/ssl/privkey.pem
```

---

## Docker Compose 配置

### 步骤 1：修改 docker-compose.yml

在 `frontend` 服务中添加 SSL 证书挂载和端口映射：

```yaml
frontend:
  image: ttbye/readknows-frontend:latest
  container_name: readknows-frontend
  restart: unless-stopped
  ports:
    - "80:80"      # HTTP 端口（用于重定向到 HTTPS）
    - "443:443"    # HTTPS 端口
  volumes:
    # SSL 证书目录
    - ./ssl:/etc/nginx/ssl:ro  # 只读挂载
  # 使用 SSL 配置（可选，如果使用不同的配置文件）
  # command: nginx -c /etc/nginx/nginx-ssl.conf
```

### 步骤 2：使用 SSL 配置

有两种方式使用 SSL 配置：

#### 方式 A：替换配置文件（推荐）

```bash
# 备份原配置
cp frontend/nginx.conf frontend/nginx.conf.backup

# 复制 SSL 配置
cp frontend/nginx-ssl.conf frontend/nginx.conf

# 修改 server_name
sed -i 's/server_name _;/server_name example.com;/g' frontend/nginx.conf
```

#### 方式 B：在 Dockerfile 中指定

修改 `frontend/Dockerfile`，在最后添加：

```dockerfile
# 使用 SSL 配置（如果需要）
# COPY nginx-ssl.conf /etc/nginx/conf.d/default.conf
```

### 步骤 3：修改 server_name

编辑 `frontend/nginx-ssl.conf` 或 `frontend/nginx.conf`，将 `server_name _;` 替换为您的域名：

```nginx
server_name example.com;
```

### 步骤 4：重启服务

```bash
cd /path/to/ReadKnows/sh
docker compose down
docker compose up -d
```

---

## 验证和测试

### 1. 检查证书是否正确加载

```bash
# 查看容器日志
docker compose logs frontend

# 检查 nginx 配置
docker compose exec frontend nginx -t
```

### 2. 测试 HTTPS 访问

```bash
# 使用 curl 测试
curl -I https://example.com

# 使用浏览器访问
# https://example.com
```

### 3. 检查 SSL 配置

使用在线工具检查 SSL 配置：
- https://www.ssllabs.com/ssltest/
- https://sslchecker.com/

### 4. 验证 HTTP 到 HTTPS 重定向

访问 `http://example.com`，应该自动重定向到 `https://example.com`。

---

## 常见问题

### Q1: 证书文件权限错误

**错误信息：**
```
SSL_CTX_use_PrivateKey_file("/etc/nginx/ssl/privkey.pem") failed
```

**解决方法：**
```bash
# 确保私钥文件权限正确
chmod 600 /path/to/ReadKnows/ssl/privkey.pem
chmod 644 /path/to/ReadKnows/ssl/fullchain.pem
```

### Q2: 证书路径找不到

**错误信息：**
```
open() "/etc/nginx/ssl/fullchain.pem" failed (2: No such file or directory)
```

**解决方法：**
1. 检查证书文件是否存在
2. 检查 docker-compose.yml 中的 volume 挂载路径
3. 确保文件路径正确

### Q3: Let's Encrypt 证书续期失败

**解决方法：**
1. 检查域名解析是否正确
2. 确保 80 端口可访问（用于验证）
3. 检查防火墙设置
4. 手动运行续期脚本测试

### Q4: 浏览器显示"不安全"警告

**可能原因：**
1. 使用自签名证书（正常现象）
2. 证书链不完整（需要添加中间证书）
3. 证书已过期

**解决方法：**
- 使用 Let's Encrypt 证书
- 确保证书链完整
- 检查证书有效期

### Q5: 无法访问 HTTP（80 端口）

**解决方法：**
- 检查 docker-compose.yml 中的端口映射
- 确保防火墙允许 80 和 443 端口
- 检查是否有其他服务占用端口

---

## 安全建议

1. **使用强密码**：保护私钥文件
2. **定期更新证书**：设置自动续期
3. **启用 HSTS**：已在配置中启用
4. **使用 TLS 1.2+**：已在配置中设置
5. **定期检查证书有效期**：设置监控告警

---

## 相关文件

- `frontend/nginx-ssl.conf` - SSL 配置模板
- `frontend/nginx.conf` - 原始 HTTP 配置
- `sh/docker-compose.yml` - Docker Compose 配置
- `sh/renew-ssl.sh` - 证书续期脚本（需要创建）

---

## 参考资源

- [Let's Encrypt 官方文档](https://letsencrypt.org/docs/)
- [Certbot 使用指南](https://certbot.eff.org/)
- [Nginx SSL 配置最佳实践](https://ssl-config.mozilla.org/)

