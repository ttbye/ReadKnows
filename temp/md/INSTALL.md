# 安装指南

本文档提供详细的安装和配置说明。

## 📋 目录

- [系统要求](#系统要求)
- [快速安装](#快速安装)
- [详细安装步骤](#详细安装步骤)
- [Docker 部署](#docker-部署)
- [生产环境部署](#生产环境部署)
- [常见问题](#常见问题)

## 系统要求

### 最低要求

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0 或 **yarn**: >= 1.22.0
- **操作系统**: macOS, Linux, Windows
- **内存**: 至少 2GB RAM
- **磁盘空间**: 至少 500MB（不包括书籍文件）

### 推荐配置

- **Node.js**: >= 20.0.0
- **内存**: 4GB+ RAM
- **磁盘空间**: 10GB+（用于存储书籍）

### 系统依赖（Canvas）

后端需要 Canvas 库来处理 PDF 封面提取，需要安装以下系统依赖：

#### macOS

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

#### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  pkg-config
```

#### Linux (CentOS/RHEL)

```bash
sudo yum install -y \
  cairo-devel \
  pango-devel \
  libjpeg-turbo-devel \
  giflib-devel \
  librsvg2-devel \
  pkgconfig
```

#### Windows

Windows 用户需要安装 [Windows Build Tools](https://github.com/nodejs/node-gyp#on-windows)：

```bash
npm install --global windows-build-tools
```

## 快速安装

### 1. 克隆项目

```bash
git clone https://github.com/your-username/KnowBooks.git
cd KnowBooks
```

### 2. 安装依赖

```bash
npm run install:all
```

这个命令会安装：
- 根目录的依赖
- 后端的依赖
- 前端的依赖

### 3. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `backend/.env` 文件，至少设置 `JWT_SECRET`：

```env
JWT_SECRET=your-very-strong-random-secret-key-here
```

### 4. 启动服务

```bash
# 返回项目根目录
cd ..

# 启动开发服务器
npm run dev
```

### 5. 初始化管理员

在另一个终端中：

```bash
cd backend
npm run init-admin
```

按照提示输入管理员信息。

### 6. 访问应用

打开浏览器访问: http://localhost:3000

## 详细安装步骤

### 步骤 1: 安装 Node.js

如果还没有安装 Node.js，请访问 [Node.js 官网](https://nodejs.org/) 下载并安装。

验证安装：

```bash
node --version  # 应该 >= 18.0.0
npm --version   # 应该 >= 9.0.0
```

### 步骤 2: 克隆项目

```bash
git clone https://github.com/your-username/KnowBooks.git
cd KnowBooks
```

### 步骤 3: 安装依赖

#### 方法 1: 使用 npm 脚本（推荐）

```bash
npm run install:all
```

#### 方法 2: 分别安装

```bash
# 安装根目录依赖
npm install

# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install

# 返回根目录
cd ..
```

### 步骤 4: 配置环境变量

#### 后端环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `backend/.env` 文件：

```env
# 服务器配置
PORT=3001
NODE_ENV=development

# JWT 配置（必须修改）
JWT_SECRET=your-very-strong-random-secret-key-here
JWT_EXPIRES_IN=7d

# 数据库配置
DB_PATH=./data/database.db

# 书籍存储配置
BOOKS_DIR=./books

# 豆瓣 API 配置（可选）
DOUBAN_API_BASE=http://your-douban-api-url:port

# AI 配置（可选）
AI_PROVIDER=ollama
AI_API_URL=http://localhost:11434
AI_API_KEY=
AI_MODEL=llama2
```

**重要提示**:
- `JWT_SECRET` 必须设置为一个强随机字符串，建议使用至少 32 个字符
- 可以使用以下命令生成随机密钥：
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

### 步骤 5: 创建必要目录

```bash
# 创建数据目录
mkdir -p backend/data
mkdir -p backend/books/public
mkdir -p backend/books/user
mkdir -p backend/covers
mkdir -p backend/fonts

# 设置权限（Linux/macOS）
chmod -R 755 backend/data
chmod -R 755 backend/books
```

### 步骤 6: 启动开发服务器

#### 同时启动前后端（推荐）

```bash
npm run dev
```

这将启动：
- 后端: http://localhost:3001
- 前端: http://localhost:3000

#### 分别启动

**终端 1 - 后端:**
```bash
npm run dev:backend
```

**终端 2 - 前端:**
```bash
npm run dev:frontend
```

### 步骤 7: 初始化管理员账户

在项目运行后，初始化管理员账户：

```bash
cd backend
npm run init-admin
```

按照提示输入：
- 用户名
- 密码
- 邮箱（可选）

### 步骤 8: 验证安装

1. 打开浏览器访问 http://localhost:3000
2. 使用管理员账户登录
3. 尝试上传一本书籍
4. 尝试在线阅读

## Docker 部署

### 前置要求

- Docker 20.10+
- Docker Compose 2.0+

### 快速部署

1. **配置环境变量**

```bash
cp .env.example .env
# 编辑 .env 文件，设置 JWT_SECRET 等配置
```

2. **使用启动脚本**

```bash
./docker-start.sh
```

3. **或手动启动**

```bash
docker-compose up -d --build
```

4. **初始化管理员**

```bash
docker-compose exec backend node scripts/initAdmin.js
```

5. **访问应用**

- 前端: http://localhost:1280
- 后端 API: http://localhost:1201

详细说明请查看 [DOCKER.md](./DOCKER.md)

## 生产环境部署

### 构建生产版本

```bash
npm run build
```

构建产物：
- 后端: `backend/dist/`
- 前端: `frontend/dist/`

### 使用 PM2 管理进程

#### 安装 PM2

```bash
npm install -g pm2
```

#### 启动后端

```bash
cd backend
pm2 start dist/index.js --name knowbooks-backend
pm2 save
pm2 startup  # 设置开机自启
```

#### 配置 Nginx（前端）

创建 Nginx 配置文件 `/etc/nginx/sites-available/knowbooks`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/KnowBooks/frontend/dist;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # API 代理
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 书籍文件代理
    location /books {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        client_max_body_size 500M;
    }

    # SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/knowbooks /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 使用 systemd（Linux）

创建服务文件 `/etc/systemd/system/knowbooks.service`:

```ini
[Unit]
Description=KnowBooks Backend
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/KnowBooks/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable knowbooks
sudo systemctl start knowbooks
sudo systemctl status knowbooks
```

## 常见问题

### 1. 端口被占用

**问题**: 端口 3000 或 3001 已被占用

**解决方案**:

- 修改后端端口: 编辑 `backend/.env`，修改 `PORT=3001` 为其他端口
- 修改前端端口: 编辑 `frontend/vite.config.ts`，修改 `server.port`

### 2. Canvas 安装失败

**问题**: `npm install` 时 Canvas 安装失败

**解决方案**:

1. 确保已安装系统依赖（见[系统依赖](#系统依赖canvas)）
2. 清除缓存后重新安装：
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

### 3. 数据库初始化失败

**问题**: 数据库文件无法创建

**解决方案**:

```bash
# 确保目录存在且有写入权限
mkdir -p backend/data
chmod 755 backend/data

# 检查磁盘空间
df -h
```

### 4. 书籍上传失败

**问题**: 上传书籍时出错

**解决方案**:

1. 检查文件大小（默认限制 100MB）
2. 确保 `backend/books` 目录有写入权限：
   ```bash
   chmod -R 755 backend/books
   ```
3. 检查磁盘空间

### 5. PWA 无法离线使用

**问题**: 添加到主屏幕后无法离线访问

**解决方案**:

1. 清除浏览器缓存
2. 检查 Service Worker 是否注册成功（浏览器开发者工具 > Application > Service Workers）
3. 确保 HTTPS 或 localhost（PWA 要求）

### 6. 豆瓣 API 连接失败

**问题**: 无法从豆瓣获取书籍信息

**解决方案**:

1. 检查 `DOUBAN_API_BASE` 配置是否正确
2. 确保豆瓣 API 服务正在运行
3. 如果无法访问，可以暂时禁用，系统会使用上传文件的元数据

### 7. AI 功能无法使用

**问题**: AI 阅读助手无法连接

**解决方案**:

1. 检查 AI 配置（`AI_PROVIDER`, `AI_API_URL`, `AI_API_KEY`）
2. 确保 AI 服务正在运行（如 Ollama）
3. 测试连接：访问 `/api/ai/test` 端点

## 下一步

- 查看 [README.md](./README.md) 了解功能特性
- 查看 [DOCKER.md](./DOCKER.md) 了解 Docker 部署
- 开始上传您的第一本书！

## 获取帮助

如果遇到问题：

1. 查看本文档的[常见问题](#常见问题)部分
2. 查看项目的 [Issues](https://github.com/your-username/KnowBooks/issues)
3. 提交新的 Issue 描述问题

---

祝您使用愉快！📚

