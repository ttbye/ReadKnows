# 自动导入功能 - 快速开始

## ⚡ 5分钟上手指南

### 1️⃣ 准备工作（首次使用）

```bash
# 确保Docker服务正常运行
docker-compose ps

# 如果未运行，先启动
docker-compose up -d --build
```

### 2️⃣ 设置权限（首次使用）

```bash
# 运行权限修复脚本
sudo ./fix-docker-permissions.sh

# 或手动设置
sudo mkdir -p /volume5/docker/bookpath/import
sudo chmod 777 /volume5/docker/bookpath/import
```

### 3️⃣ 开始使用

#### 方式1：直接复制文件

```bash
# 复制单个文件
cp ~/Downloads/三体.epub /volume5/docker/bookpath/import/

# 复制多个文件
cp ~/Downloads/*.epub /volume5/docker/bookpath/import/
```

#### 方式2：使用scp远程上传

```bash
# 从其他机器上传
scp book.epub user@nas-ip:/volume5/docker/bookpath/import/
```

#### 方式3：使用文件管理器

1. 打开群晖File Station
2. 导航到 `/docker/bookpath/import/`
3. 拖拽文件到这个目录

### 4️⃣ 查看结果

```bash
# 查看自动导入日志
docker-compose logs -f backend | grep "自动导入"

# 你会看到类似输出：
# [文件监控] 发现新文件: 三体.epub (2.5 MB)
# [自动导入] 开始处理文件: 三体.epub
# [自动导入] 导入成功: 三体 (ID: xxx)
# [自动导入] 已删除原文件
```

### 5️⃣ 在Web界面查看

1. 打开浏览器访问: http://localhost:1280
2. 登录系统
3. 在书籍列表中查看新导入的书籍

## 📋 常用命令

```bash
# 查看导入目录
ls -la /volume5/docker/bookpath/import/

# 查看实时日志
docker-compose logs -f backend | grep -E "文件监控|自动导入"

# 重启服务
docker-compose restart backend

# 运行测试
./test-auto-import.sh
```

## 💡 提示

- ✅ 支持格式：EPUB、PDF、TXT、MOBI
- ✅ 文件会在导入成功后自动删除
- ✅ 重复文件会自动跳过
- ✅ 自动提取封面和元数据
- ⏱️ 处理时间：通常5-10秒（取决于文件大小）

## ❓ 遇到问题？

```bash
# 1. 查看服务状态
docker-compose ps

# 2. 查看详细日志
docker-compose logs backend | tail -50

# 3. 检查目录权限
ls -la /volume5/docker/bookpath/import/

# 4. 运行测试脚本
./test-auto-import.sh
```

## 📚 更多信息

- **完整文档**: [AUTO_IMPORT.md](./AUTO_IMPORT.md)
- **故障排除**: [DOCKER_TROUBLESHOOTING.md](./DOCKER_TROUBLESHOOTING.md)
- **更新日志**: [CHANGELOG_AUTO_IMPORT.md](./CHANGELOG_AUTO_IMPORT.md)

---

**开始愉快地使用自动导入功能吧！** 📖✨
