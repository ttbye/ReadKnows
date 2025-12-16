# KnowBooks 在线部署指南

本文档介绍如何将 KnowBooks 部署到远程 Docker 服务器上，实现一键在线安装。

## 📋 前置要求

- Linux 服务器（Ubuntu/Debian/CentOS 等）
- 服务器已安装 Git（可选，用于从仓库克隆）
- 服务器有足够的磁盘空间（建议至少 10GB）
- 服务器开放了所需端口（默认：1201 后端，1280 前端）

## 🚀 快速部署

### 方法一：使用一键部署脚本（推荐）

1. **下载部署脚本**

```bash
# 方式1: 如果服务器可以访问 GitHub/Gitee
wget https://raw.githubusercontent.com/your-repo/knowbooks/main/deploy-online.sh
chmod +x deploy-online.sh

# 方式2: 手动上传脚本到服务器
# 将 deploy-online.sh 上传到服务器后执行
chmod +x deploy-online.sh
```

2. **运行部署脚本**

```bash
# 使用默认安装目录 /opt/knowbooks
sudo ./deploy-online.sh

# 或指定自定义安装目录
sudo ./deploy-online.sh /path/to/install
```

3. **按提示操作**

脚本会自动：
- 检查并安装 Docker 和 Docker Compose（如未安装）
- 克隆或更新项目代码
- 创建必要的目录结构
- 生成环境变量文件
- 构建并启动 Docker 容器
- 初始化管理员账户

### 方法二：手动部署

1. **安装 Docker 和 Docker Compose**

```bash
# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **克隆项目**

```bash
# 创建安装目录
sudo mkdir -p /opt/knowbooks
cd /opt/knowbooks

# 克隆项目（替换为你的仓库地址）
sudo git clone https://github.com/your-repo/knowbooks.git .

# 或上传项目文件到服务器
```

3. **配置环境变量**

```bash
# 创建 .env 文件
sudo nano .env
```

编辑 `.env` 文件：

```env
# JWT配置（必须修改为强随机字符串）
JWT_SECRET=your-strong-random-secret-key-here
JWT_EXPIRES_IN=7d

# 豆瓣API配置（可选）
DOUBAN_API_BASE=

# AI配置（可选）
AI_PROVIDER=ollama
AI_API_URL=http://localhost:11434
AI_API_KEY=
AI_MODEL=llama2
```

生成强随机密钥：

```bash
openssl rand -base64 32
```

4. **修改 docker-compose.yml**

确保数据卷路径使用相对路径：

```yaml
volumes:
  - ./data/backend/data:/app/data
  - ./data/backend/books:/app/books
  - ./data/backend/covers:/app/covers
  - ./data/backend/fonts:/app/fonts
```

5. **创建数据目录**

```bash
sudo mkdir -p data/backend/{data,books,covers,fonts}
```

6. **构建并启动**

```bash
# 使用快速部署脚本（推荐，使用国内镜像源）
sudo ./docker-start-fast.sh

# 或使用标准方式
sudo docker-compose up -d --build
```

7. **初始化管理员账户**

```bash
sudo docker-compose exec backend node scripts/initAdmin.js
```

## 🔧 配置说明

### 端口配置

默认端口：
- 后端 API: `1201`
- 前端 Web: `1280`

修改端口（编辑 `docker-compose.yml`）：

```yaml
services:
  backend:
    ports:
      - "你的后端端口:3001"
  frontend:
    ports:
      - "你的前端端口:80"
```

### 防火墙配置

如果服务器启用了防火墙，需要开放相应端口：

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 1201/tcp
sudo ufw allow 1280/tcp

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=1201/tcp
sudo firewall-cmd --permanent --add-port=1280/tcp
sudo firewall-cmd --reload
```

### 反向代理配置（可选）

使用 Nginx 作为反向代理：

```nginx
# /etc/nginx/sites-available/knowbooks
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://localhost:1280;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 后端 API
    location /api {
        proxy_pass http://localhost:1201/api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 书籍文件
    location /books {
        proxy_pass http://localhost:1201/books;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/knowbooks /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 📝 常用命令

```bash
# 进入安装目录
cd /opt/knowbooks

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 查看后端日志
docker-compose logs -f backend

# 查看前端日志
docker-compose logs -f frontend

# 停止服务
docker-compose down

# 启动服务
docker-compose up -d

# 重启服务
docker-compose restart

# 更新服务
git pull
docker-compose up -d --build

# 备份数据
tar -czf knowbooks-backup-$(date +%Y%m%d).tar.gz data/

# 恢复数据
tar -xzf knowbooks-backup-YYYYMMDD.tar.gz
```

## 🔄 更新部署

```bash
cd /opt/knowbooks

# 备份数据
tar -czf ../knowbooks-backup-$(date +%Y%m%d).tar.gz data/

# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build
```

## 🐛 故障排查

### 1. 容器无法启动

```bash
# 查看容器日志
docker-compose logs

# 检查端口是否被占用
netstat -tulpn | grep -E '1201|1280'

# 检查 Docker 服务状态
systemctl status docker
```

### 2. 无法访问前端

- 检查防火墙设置
- 检查端口是否正确映射
- 查看前端容器日志：`docker-compose logs frontend`

### 3. 后端 API 无响应

- 检查后端容器是否运行：`docker-compose ps`
- 查看后端日志：`docker-compose logs backend`
- 检查数据库文件权限：`ls -la data/backend/data/`

### 4. 文件上传失败

- 检查书籍目录权限：`chmod -R 755 data/backend/books`
- 检查磁盘空间：`df -h`

## 📦 数据备份

### 自动备份脚本

创建 `/opt/knowbooks/backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR="/opt/knowbooks-backups"
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/knowbooks-$(date +%Y%m%d-%H%M%S).tar.gz" -C /opt/knowbooks data/
# 保留最近7天的备份
find "$BACKUP_DIR" -name "knowbooks-*.tar.gz" -mtime +7 -delete
```

添加到 crontab（每天凌晨2点备份）：

```bash
crontab -e
# 添加以下行
0 2 * * * /opt/knowbooks/backup.sh
```

## 🔒 安全建议

1. **修改默认 JWT_SECRET**：使用强随机字符串
2. **使用 HTTPS**：配置 SSL 证书（Let's Encrypt）
3. **限制访问**：使用防火墙限制访问 IP
4. **定期更新**：保持 Docker 镜像和代码更新
5. **数据备份**：定期备份数据目录

## 📞 获取帮助

如遇到问题，请查看：
- [README.md](./README.md)
- [DOCKER.md](./DOCKER.md)
- [GitHub Issues](https://github.com/your-repo/knowbooks/issues)

## 🎉 完成

部署完成后，访问 `http://your-server-ip:1280` 即可使用 KnowBooks！

