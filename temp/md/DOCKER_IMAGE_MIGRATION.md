# 🐳 Docker 镜像迁移指南

## 📍 Docker 镜像存储位置

### 镜像在本地存储的位置

Docker 镜像默认存储在以下位置：

**Linux:**
```bash
/var/lib/docker/image/
```

**macOS (Docker Desktop):**
```bash
~/Library/Containers/com.docker.docker/Data/vms/0/data/
```

**Windows (Docker Desktop):**
```bash
C:\ProgramData\docker\windowsdata\
```

### 查看镜像存储位置

运行以下命令查看：
```bash
docker info | grep "Docker Root Dir"
```

### 查看已构建的镜像

```bash
# 查看所有镜像
docker images

# 查看 KnowBooks 相关镜像
docker images | grep knowbooks
```

输出示例：
```
REPOSITORY              TAG       IMAGE ID       CREATED         SIZE
knowbooks-backend      latest    abc123def456   2 hours ago     1.2GB
knowbooks-frontend     latest    def456ghi789   2 hours ago     800MB
```

---

## 🚀 迁移到其他服务器

### 方法一：使用导出/导入脚本（推荐）⭐⭐⭐

#### 步骤1: 在源服务器上导出镜像

```bash
# 在项目根目录执行
./export-images.sh
```

脚本会：
- ✅ 检查镜像是否存在
- ✅ 显示镜像信息
- ✅ 导出镜像到 `./docker-images/` 目录
- ✅ 创建导入说明文件

导出的文件：
```
docker-images/
├── knowbooks-backend-latest.tar.gz    (~500-800MB)
├── knowbooks-frontend-latest.tar.gz   (~300-500MB)
└── README.md                          (导入说明)
```

#### 步骤2: 传输到目标服务器

使用以下方式之一传输 `docker-images` 目录：

**方式A: 使用 scp**
```bash
# 从源服务器复制到目标服务器
scp -r docker-images user@target-server:/path/to/KnowBooks/
```

**方式B: 使用 rsync**
```bash
rsync -avz docker-images/ user@target-server:/path/to/KnowBooks/docker-images/
```

**方式C: 使用 U盘/移动硬盘**
```bash
# 1. 在源服务器上打包
tar -czf knowbooks-images.tar.gz docker-images/

# 2. 复制到U盘
cp knowbooks-images.tar.gz /media/usb/

# 3. 在目标服务器上解压
tar -xzf knowbooks-images.tar.gz
```

**方式D: 使用云存储**
```bash
# 上传到云盘（如百度网盘、阿里云OSS等）
# 然后在目标服务器下载
```

#### 步骤3: 在目标服务器上导入镜像

```bash
# 1. 进入项目目录
cd /path/to/KnowBooks

# 2. 确保镜像文件在 docker-images 目录
ls docker-images/

# 3. 运行导入脚本
./import-images.sh

# 或者指定镜像目录路径
./import-images.sh /path/to/docker-images
```

#### 步骤4: 安装部署

```bash
# 导入镜像后，运行安装脚本
./install.sh

# 或使用 docker-compose
docker-compose up -d
```

---

### 方法二：手动导出/导入

#### 导出镜像

```bash
# 导出后端镜像
docker save knowbooks-backend:latest | gzip > knowbooks-backend-latest.tar.gz

# 导出前端镜像
docker save knowbooks-frontend:latest | gzip > knowbooks-frontend-latest.tar.gz
```

#### 导入镜像

```bash
# 导入后端镜像
gunzip -c knowbooks-backend-latest.tar.gz | docker load

# 导入前端镜像
gunzip -c knowbooks-frontend-latest.tar.gz | docker load
```

#### 验证镜像

```bash
docker images | grep knowbooks
```

---

### 方法三：使用 Docker Registry（适用于多服务器）

如果需要在多个服务器上部署，可以使用 Docker Registry：

#### 1. 推送到 Registry

```bash
# 标记镜像
docker tag knowbooks-backend:latest your-registry.com/knowbooks-backend:latest
docker tag knowbooks-frontend:latest your-registry.com/knowbooks-frontend:latest

# 推送镜像
docker push your-registry.com/knowbooks-backend:latest
docker push your-registry.com/knowbooks-frontend:latest
```

#### 2. 从 Registry 拉取

```bash
# 在目标服务器上拉取
docker pull your-registry.com/knowbooks-backend:latest
docker pull your-registry.com/knowbooks-frontend:latest

# 重新标记
docker tag your-registry.com/knowbooks-backend:latest knowbooks-backend:latest
docker tag your-registry.com/knowbooks-frontend:latest knowbooks-frontend:latest
```

---

## 📋 完整迁移流程示例

### 场景：从开发服务器迁移到生产服务器

#### 在开发服务器（源服务器）

```bash
# 1. 进入项目目录
cd /path/to/KnowBooks

# 2. 构建镜像（如果还没构建）
./build-images.sh

# 3. 导出镜像
./export-images.sh

# 4. 查看导出文件
ls -lh docker-images/
```

#### 传输文件

```bash
# 使用 scp 传输
scp -r docker-images/ user@production-server:/opt/knowbooks/
```

#### 在生产服务器（目标服务器）

```bash
# 1. 进入项目目录
cd /opt/knowbooks

# 2. 确保项目文件已复制（docker-compose.yml等）
ls -la

# 3. 导入镜像
./import-images.sh

# 4. 安装部署
./install.sh
```

---

## ⚠️ 注意事项

### 1. 磁盘空间

- **导出文件大小**: 约 800MB - 1.5GB（压缩后）
- **导入后大小**: 约 2GB - 3GB（解压后）
- **建议**: 确保目标服务器有至少 5GB 可用空间

### 2. 网络传输

- 如果网络较慢，建议使用压缩传输
- 可以使用 `rsync` 支持断点续传
- 大文件传输可能需要较长时间

### 3. 版本一致性

- 确保目标服务器上的 `docker-compose.yml` 与源服务器一致
- 确保 `.env` 配置文件已正确设置
- 建议同时复制整个项目目录

### 4. 权限问题

- 确保脚本有执行权限：`chmod +x *.sh`
- 确保 Docker 服务正在运行
- 某些操作可能需要 sudo 权限

### 5. 数据目录

- **重要**: 镜像只包含应用程序，不包含数据
- 如果需要迁移数据，需要单独备份数据目录：
  ```bash
  # 备份数据
  tar -czf knowbooks-data.tar.gz /volume5/docker/bookpath/data/
  
  # 在目标服务器恢复
  tar -xzf knowbooks-data.tar.gz -C /
  ```

---

## 🔍 故障排查

### 问题1: 导出失败

**错误**: `Error response from daemon: ...`

**解决**:
```bash
# 检查镜像是否存在
docker images | grep knowbooks

# 检查磁盘空间
df -h

# 检查 Docker 服务
docker info
```

### 问题2: 导入失败

**错误**: `Error loading image: ...`

**解决**:
```bash
# 检查文件完整性
ls -lh docker-images/*.tar.gz

# 检查磁盘空间
df -h

# 手动导入测试
gunzip -c docker-images/knowbooks-backend-latest.tar.gz | docker load
```

### 问题3: 镜像导入后无法启动

**解决**:
```bash
# 检查镜像标签
docker images | grep knowbooks

# 检查 docker-compose.yml 配置
cat docker-compose.yml | grep image

# 如果使用 build，确保 Dockerfile 存在
ls -la backend/Dockerfile frontend/Dockerfile
```

---

## 📊 文件大小参考

| 镜像 | 构建后大小 | 导出文件（压缩） | 导入后大小 |
|------|-----------|-----------------|-----------|
| 后端 | ~1.2GB | ~500-800MB | ~1.2GB |
| 前端 | ~800MB | ~300-500MB | ~800MB |
| **总计** | **~2GB** | **~800MB-1.3GB** | **~2GB** |

---

## 🎯 快速参考

### 导出镜像
```bash
./export-images.sh
```

### 导入镜像
```bash
./import-images.sh
```

### 查看镜像
```bash
docker images | grep knowbooks
```

### 查看镜像存储位置
```bash
docker info | grep "Docker Root Dir"
```

---

## 📚 相关文档

- [Docker 部署指南](./DOCKER.md)
- [Docker 快速开始](./DOCKER_QUICK_START.md)
- [构建镜像脚本](../build-images.sh)
- [安装部署脚本](../install.sh)

