# 书名理 | The Book Path

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

一个支持多格式、多平台、多用户的现代化私人电子书管理平台

[功能特性](#功能特性) • [快速开始](#快速开始) • [Docker部署](#docker部署) • [文档](#文档)

</div>

---

## 📖 项目简介

**书名理 (The Book Path)** 是一个功能强大的电子书管理平台，支持 EPUB、PDF、TXT、MOBI 等多种格式的电子书。系统采用前后端分离架构，支持 PWA（渐进式 Web 应用），可以在 iOS、iPad、Mac、Windows 等多个平台上使用，并支持离线阅读。

## ✨ 功能特性

### 📚 核心功能

- **多格式支持**: 支持 EPUB、PDF、TXT、MOBI 等主流电子书格式
- **在线阅读器**: 
  - EPUB 阅读器：支持主题切换（浅色/深色/护眼）、字体设置、行距调整、阅读宽度等
  - PDF 阅读器：支持缩放、翻页、目录导航
  - TXT 阅读器：支持字体大小、行距、主题等自定义设置
- **PWA 支持**: 完整的渐进式 Web 应用，支持离线使用、添加到主屏幕
- **多用户系统**: 用户注册、登录、个人书架、阅读历史
- **阅读进度**: 自动记录和同步阅读进度，支持多设备同步
- **阅读历史**: 详细记录阅读历史，包括阅读时长统计
- **笔记功能**: 支持阅读笔记的创建、编辑和管理
- **AI 阅读助手**: 集成 AI 功能，支持阅读问答（Ollama/OpenAI/DeepSeek）

### 🔍 书籍管理

- **书籍搜索**: 支持书名、作者搜索，支持全文搜索
- **书籍分类**: 自动分类管理，支持自定义分类
- **书籍上传**: 支持拖拽上传，批量上传
- **自动导入**: 🆕 监控 `import` 目录，自动导入电子书文件
  - 支持自动提取元数据和封面
  - 导入成功后自动删除原文件
  - 支持批量导入
- **元数据提取**: 自动提取书籍元数据（书名、作者、封面等）
- **豆瓣集成**: 自动从豆瓣 API 匹配书籍信息
- **TXT 转 EPUB**: 自动将 TXT 文件转换为 EPUB 格式
- **封面提取**: 自动提取 PDF 和 EPUB 封面

### 🎨 用户体验

- **响应式设计**: 完美适配桌面端、平板和手机
- **深色模式**: 支持浅色/深色主题切换
- **阅读设置**: 丰富的阅读个性化设置（字体、行距、边距、缩进等）
- **键盘快捷键**: 支持键盘快捷键操作
- **下拉刷新**: 支持下拉刷新数据
- **离线缓存**: 智能缓存机制，离线时自动使用缓存数据

### 🔐 安全功能

- **JWT 认证**: 基于 JWT 的安全认证机制
- **IP 管理**: IP 访问控制，防止恶意访问
- **权限管理**: 支持管理员和普通用户角色
- **私有访问密钥**: 支持私有访问密钥验证

### 📱 平台支持

- ✅ iOS Safari (PWA)
- ✅ iPad Safari (PWA)
- ✅ macOS Safari/Chrome
- ✅ Windows Chrome/Edge
- ✅ Android Chrome (PWA)
- ✅ Linux Chrome/Firefox

## 🛠️ 技术栈

### 后端

- **运行时**: Node.js 20+
- **框架**: Express.js
- **语言**: TypeScript
- **数据库**: SQLite (better-sqlite3)
- **认证**: JWT (jsonwebtoken)
- **文件处理**: 
  - epubjs, pdfjs-dist (电子书解析)
  - canvas (PDF 封面提取)
  - epub-gen (TXT 转 EPUB)
- **其他**: multer (文件上传), bcryptjs (密码加密)

### 前端

- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **路由**: React Router v6
- **状态管理**: Zustand
- **UI 框架**: Tailwind CSS
- **阅读器**: 
  - epubjs (EPUB 阅读)
  - react-pdf (PDF 阅读)
- **PWA**: vite-plugin-pwa (Service Worker)
- **HTTP 客户端**: Axios
- **图标**: Lucide React

### 部署

- **容器化**: Docker + Docker Compose
- **Web 服务器**: Nginx (生产环境)
- **进程管理**: PM2 (可选)

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0 或 yarn >= 1.22.0
- 至少 500MB 可用磁盘空间

### 安装步骤

1. **克隆项目**

```bash
git clone https://github.com/your-username/KnowBooks.git
cd KnowBooks
```

2. **安装依赖**

```bash
npm run install:all
```

3. **配置环境变量**

```bash
cd backend
cp .env.example .env
```

编辑 `backend/.env` 文件：

```env
PORT=1281
JWT_SECRET=your-very-strong-random-secret-key-here
JWT_EXPIRES_IN=7d
BOOKS_DIR=./books
DB_PATH=./data/database.db
DOUBAN_API_BASE=http://your-douban-api-url:port
```

**重要**: 请将 `JWT_SECRET` 更改为一个安全的随机字符串。

4. **启动开发服务器**

```bash
# 在项目根目录
npm run dev
```

这将同时启动：
- 后端服务器: http://localhost:1281
- 前端开发服务器: http://localhost:1280

5. **访问应用并登录**

打开浏览器访问: http://localhost:1280

**默认管理员账号**：系统首次启动时会自动创建

```
用户名：books
密码：books
私人访问密钥：books
```

⚠️ **安全提示**：首次登录后请立即修改默认密码和私人访问密钥！

详细说明请查看：[DEFAULT_ADMIN.md](../DEFAULT_ADMIN.md)

### 构建生产版本

```bash
npm run build
```

构建完成后：
- 后端构建产物在 `backend/dist`
- 前端构建产物在 `frontend/dist`

## 🐳 Docker 部署

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

4. **设置目录权限**（如果需要）

```bash
sudo ./fix-docker-permissions.sh
```

5. **查看日志确认启动成功**

```bash
docker-compose logs backend | grep "默认管理员"
```

6. **访问应用并登录**

- 前端: http://localhost:1280
- 后端 API: http://localhost:1201

**默认管理员账号**：系统首次启动时自动创建

```
用户名：books
密码：books
私人访问密钥：books
```

⚠️ **安全提示**：
- 首次登录后请立即修改默认密码
- 建议修改私人访问密钥
- 详细说明：[DEFAULT_ADMIN.md](../DEFAULT_ADMIN.md)

### 自动导入功能

系统提供了自动导入功能，可以监控 `import` 目录并自动导入电子书：

```bash
# 将电子书复制到 import 目录
cp /path/to/your/book.epub /volume5/docker/bookpath/import/

# 系统会自动检测并导入书籍
# 导入成功后会自动删除原文件
```

支持的格式：EPUB、PDF、TXT、MOBI

详细说明请查看：**[自动导入功能文档](./AUTO_IMPORT.md)**

### Docker 故障排除

如果在Docker环境中遇到问题（如EPUB封面无法提取），请查看：
- **[Docker故障排除指南](./DOCKER_TROUBLESHOOTING.md)** - 常见问题和解决方案
- **[Docker优化指南](./DOCKER_OPTIMIZATION.md)** - 加速部署和性能优化

#### 快速修复权限问题（群晖NAS/Linux）

```bash
# 修复目录权限
sudo ./fix-docker-permissions.sh

# 重启容器
docker-compose down
docker-compose up -d
```

详细说明请查看 [DOCKER.md](./DOCKER.md)

## 📁 项目结构

```
KnowBooks/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── routes/         # API 路由
│   │   ├── middleware/     # 中间件（认证、IP拦截等）
│   │   ├── utils/          # 工具函数（电子书处理、封面提取等）
│   │   │   ├── autoImportHandler.ts  # 自动导入处理逻辑
│   │   │   └── fileWatcher.ts        # 文件监控服务
│   │   ├── db/              # 数据库配置和初始化
│   │   └── index.ts         # 入口文件
│   ├── scripts/             # 脚本工具
│   │   ├── initAdmin.js     # 初始化管理员
│   │   ├── resetPassword.js # 重置密码
│   │   └── clearDatabase.js # 清空数据库
│   ├── import/              # 自动导入监控目录 🆕
│   ├── Dockerfile           # Docker 镜像配置
│   └── package.json
├── frontend/                # 前端应用
│   ├── src/
│   │   ├── pages/           # 页面组件
│   │   ├── components/      # 通用组件
│   │   │   └── readers/     # 阅读器组件
│   │   ├── store/           # 状态管理
│   │   ├── hooks/           # 自定义 Hooks
│   │   └── utils/           # 工具函数
│   ├── Dockerfile           # Docker 镜像配置
│   ├── nginx.conf           # Nginx 配置
│   └── package.json
├── docker-compose.yml       # Docker Compose 配置
├── docker-compose.prod.yml  # 生产环境配置
├── fix-docker-permissions.sh # 权限修复脚本
├── DOCKER.md                # Docker 部署文档
├── DOCKER_TROUBLESHOOTING.md # Docker 故障排除指南
├── AUTO_IMPORT.md           # 自动导入功能文档 🆕
├── INSTALL.md               # 详细安装指南
└── README.md                # 项目说明（本文件）
```

## 📖 使用指南

### 上传书籍

**方法1：Web界面上传**

1. 登录后进入"上传书籍"页面
2. 拖拽或选择文件上传（支持 EPUB、PDF、TXT、MOBI）
3. 如果是 TXT 文件，需要填写书名和作者
4. 系统会自动从豆瓣 API 匹配书籍信息（如果配置了）

**方法2：自动导入（推荐）** 🆕

1. 将电子书文件复制到 `import` 目录
2. 系统自动检测并导入书籍
3. 自动提取元数据和封面
4. 导入成功后自动删除原文件

详细说明：[自动导入功能文档](./AUTO_IMPORT.md)

### 添加到书架

1. 在书籍详情页点击"添加到书架"
2. 在"我的书架"页面查看所有收藏的书籍
3. 支持按书名、作者、添加时间等排序

### 在线阅读

1. 在书籍详情页或书架中点击"开始阅读"
2. 根据书籍格式，使用对应的阅读器：
   - **EPUB**: 支持主题、字体、行距、阅读宽度等设置
   - **PDF**: 支持缩放、翻页、目录导航
   - **TXT**: 支持字体大小、行距、主题等设置
3. 阅读进度会自动保存和同步

### 阅读设置

在阅读页面点击设置按钮，可以调整：
- 字体大小、字体族、行距
- 主题（浅色/深色/护眼）
- 亮度、边距、缩进
- 翻页方式（点击/滑动、横向/纵向）
- 是否显示底部信息栏

### PWA 使用

1. 在支持的浏览器中访问网站
2. 浏览器会提示"添加到主屏幕"
3. 添加到主屏幕后，可以像原生应用一样使用
4. 支持离线访问（已缓存的数据）

## 🔧 配置说明

### 环境变量

#### 后端环境变量 (`backend/.env`)

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `PORT` | 后端服务端口 | 1281 | 否 |
| `JWT_SECRET` | JWT 密钥 | - | **是** |
| `JWT_EXPIRES_IN` | JWT 过期时间 | 7d | 否 |
| `DB_PATH` | 数据库文件路径 | ./data/database.db | 否 |
| `BOOKS_DIR` | 书籍存储目录 | ./books | 否 |
| `DOUBAN_API_BASE` | 豆瓣 API 地址 | - | 否 |
| `AI_PROVIDER` | AI 提供商 | ollama | 否 |
| `AI_API_URL` | AI API 地址 | http://localhost:11434 | 否 |
| `AI_API_KEY` | AI API 密钥 | - | 否 |
| `AI_MODEL` | AI 模型名称 | llama2 | 否 |

### 系统设置

系统支持通过 Web 界面配置以下设置：

- 书籍存储路径
- 书籍扫描路径
- 自动转换 TXT 为 EPUB
- 自动从豆瓣获取书籍信息
- OPDS 功能开关
- 邮件推送配置
- AI 配置
- 访问控制设置

## 📚 API 文档

### 认证相关

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/logout` - 用户登出

### 书籍相关

- `GET /api/books` - 获取书籍列表（支持分页、搜索、排序）
- `GET /api/books/:id` - 获取书籍详情
- `POST /api/books/upload` - 上传书籍
- `PUT /api/books/:id` - 更新书籍信息
- `DELETE /api/books/:id` - 删除书籍
- `GET /api/books/recent` - 获取最近新增书籍
- `GET /api/books/recommended` - 获取推荐书籍
- `POST /api/books/:id/extract-cover` - 提取书籍封面

### 书架相关

- `GET /api/shelf/my` - 获取我的书架
- `POST /api/shelf/add` - 添加到书架
- `DELETE /api/shelf/remove/:bookId` - 从书架移除
- `GET /api/shelf/check/:bookId` - 检查是否在书架

### 阅读相关

- `GET /api/reading/progress` - 获取所有阅读进度
- `GET /api/reading/progress/:bookId` - 获取书籍阅读进度
- `POST /api/reading/progress` - 更新阅读进度
- `GET /api/reading/history` - 获取阅读历史
- `GET /api/reading/history/stats/summary` - 获取阅读统计

### 笔记相关

- `GET /api/notes` - 获取笔记列表
- `POST /api/notes` - 创建笔记
- `PUT /api/notes/:id` - 更新笔记
- `DELETE /api/notes/:id` - 删除笔记

### AI 相关

- `GET /api/ai/test` - 测试 AI 配置
- `POST /api/ai/chat` - AI 对话

## 🐛 常见问题

### Docker相关问题

#### EPUB封面无法提取/显示

**问题**：在Docker环境中，EPUB书籍上传后无法提取或显示封面图片。

**原因**：通常是目录权限问题，Docker容器无法写入挂载的宿主机目录。

**解决方案**：
```bash
# 1. 运行权限修复脚本（推荐）
sudo ./fix-docker-permissions.sh

# 2. 或手动设置权限
sudo chmod -R 777 /volume5/docker/bookpath/
sudo mkdir -p /volume5/docker/bookpath/books/{public,user,.temp}

# 3. 重启容器
docker-compose down
docker-compose up -d

# 4. 查看日志确认
docker-compose logs -f backend | grep "EPUB封面提取"
```

详细说明请查看 [Docker故障排除指南](./DOCKER_TROUBLESHOOTING.md)

#### 封面文件存在但不显示

**问题**：封面图片文件已保存在书籍目录，但Web界面不显示封面。

**原因**：数据库中的`cover_url`字段可能为空或包含错误的占位符（如`'cover'`或`'pdf-cover'`）。

**快速诊断**：
```bash
# 检查封面状态
./check-covers.sh

# 自动修复
docker-compose exec backend npm run fix-covers
```

**详细指南**：请查看 [封面显示问题修复指南](./FIX_COVERS_GUIDE.md)

#### 容器无法启动

1. 检查端口是否被占用：`docker ps` 和 `netstat -tuln | grep -E '1280|1201'`
2. 查看容器日志：`docker-compose logs`
3. 检查磁盘空间：`df -h`

#### 数据丢失

确保已正确配置volume挂载，数据应存储在宿主机目录：
- `/volume5/docker/bookpath/data` - 数据库
- `/volume5/docker/bookpath/books` - 书籍文件

### 端口被占用

如果端口被占用，可以修改：
- Docker部署: 修改 `docker-compose.yml` 中的端口映射
- 本地开发: 
  - 后端端口: 修改 `backend/.env` 中的 `PORT`
  - 前端端口: 修改 `frontend/vite.config.ts` 中的 `server.port`

### 数据库初始化失败

确保 `backend/data` 目录有写入权限：

```bash
mkdir -p backend/data
chmod 755 backend/data
```

Docker环境：
```bash
sudo mkdir -p /volume5/docker/bookpath/data
sudo chmod 777 /volume5/docker/bookpath/data
```

### Canvas 依赖问题

如果遇到 Canvas 相关错误，请确保已安装系统依赖：

**Docker环境**：已在Dockerfile中预装，无需额外配置。

**macOS:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

**Linux (CentOS/RHEL):**
```bash
sudo yum install cairo-devel pango-devel libjpeg-turbo-devel giflib-devel librsvg2-devel
```

### PWA 无法离线使用

1. 确保 Service Worker 已注册
2. 检查浏览器控制台是否有错误
3. 清除浏览器缓存后重新访问
4. 确认是通过 HTTPS 或 localhost 访问

### 书籍上传失败

1. 检查文件大小限制（默认 100MB）
2. 确保文件格式正确（支持 EPUB、PDF、TXT、MOBI）
3. 检查目录权限：
   - 本地: `backend/books` 目录
   - Docker: 挂载的宿主机目录
4. 查看后端日志获取详细错误信息

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证。详情请查看 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [epubjs](https://github.com/futurepress/epub.js) - EPUB 阅读器
- [react-pdf](https://github.com/wojtekmaj/react-pdf) - PDF 阅读器
- [Vite](https://vitejs.dev/) - 构建工具
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架

## 📮 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 [Issue](https://github.com/your-username/KnowBooks/issues)
- 发送邮件: your-email@example.com

---

<div align="center">

**如果这个项目对你有帮助，请给一个 ⭐ Star！**

Made with ❤️ by ttbye

</div>

