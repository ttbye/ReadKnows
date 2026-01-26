# SSL 证书快速配置指南

本文档提供快速配置 SSL 证书的步骤。

## 一键配置（推荐）

使用自动化脚本快速配置 SSL：

```bash
cd sh
sudo ./setup-ssl.sh
```

脚本支持三种证书类型：
1. **Let's Encrypt** - 免费，自动续期（推荐生产环境）
2. **自定义证书** - 使用已有证书文件
3. **自签名证书** - 仅用于测试

## 手动配置步骤

### 1. Let's Encrypt 证书（推荐）

#### 前置要求
- 拥有域名
- 域名已解析到服务器 IP
- 服务器可访问外网

#### 步骤

```bash
# 1. 安装 certbot
sudo apt-get install certbot  # Ubuntu/Debian
# 或
sudo yum install certbot      # CentOS/RHEL

# 2. 运行配置脚本
cd sh
sudo ./setup-ssl.sh
# 选择选项 1（Let's Encrypt）

# 3. 按提示输入域名和邮箱
# 4. 脚本会自动获取证书并配置
```

### 2. 自定义证书

```bash
# 1. 准备证书文件
mkdir -p ../ssl
# 将证书文件复制到 ssl 目录：
# - cert.pem 或 fullchain.pem（证书）
# - key.pem 或 privkey.pem（私钥）
# - chain.pem（中间证书，可选）

# 2. 运行配置脚本
cd sh
./setup-ssl.sh
# 选择选项 2（自定义证书）

# 3. 按提示输入域名
```

### 3. 自签名证书（仅测试）

```bash
cd sh
./setup-ssl.sh
# 选择选项 3（自签名证书）
# 按提示输入域名或IP
```

## 配置后的操作

### 1. 验证配置

```bash
# 检查容器状态
docker compose ps frontend

# 查看日志
docker compose logs frontend

# 测试 HTTPS
curl -I https://your-domain.com
```

### 2. 设置自动续期（Let's Encrypt）

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每月1号凌晨3点自动续期）
0 3 1 * * /path/to/ReadKnows/sh/renew-ssl.sh
```

### 3. 访问网站

配置完成后，访问：
- HTTPS: `https://your-domain.com`
- HTTP 会自动重定向到 HTTPS

## 常见问题

### Q: 证书文件权限错误

```bash
# 修复权限
chmod 644 ssl/*.pem
chmod 600 ssl/privkey.pem  # 或 ssl/key.pem
```

### Q: 端口被占用

```bash
# 检查端口占用
netstat -tulpn | grep :80
netstat -tulpn | grep :443

# 停止占用端口的服务
# 或修改 docker-compose.yml 中的端口映射
```

### Q: 浏览器显示"不安全"

- 自签名证书：正常现象，需要手动信任
- Let's Encrypt：检查域名解析和证书链
- 自定义证书：确保证书链完整

### Q: 恢复 HTTP 配置

```bash
# 恢复备份的配置
cp frontend/nginx.conf.backup frontend/nginx.conf
cp sh/docker-compose.yml.backup sh/docker-compose.yml

# 重新构建
docker compose up -d --build frontend
```

## 相关文件

- `sh/setup-ssl.sh` - SSL 配置脚本
- `sh/renew-ssl.sh` - 证书续期脚本
- `frontend/nginx-ssl.conf` - SSL Nginx 配置模板
- `sh/SSL_SETUP.md` - 详细配置文档

## 安全建议

1. ✅ 使用 Let's Encrypt（免费且自动续期）
2. ✅ 启用 HSTS（已在配置中启用）
3. ✅ 使用强密码保护私钥
4. ✅ 定期检查证书有效期
5. ✅ 设置自动续期

---

**需要帮助？** 查看详细文档：`sh/SSL_SETUP.md`

