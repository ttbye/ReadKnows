# 📚 Docker 环境书籍扫描配置指南

## 🎯 问题说明

在 Docker 环境中，容器与宿主机的文件系统是**隔离**的。如果您想扫描宿主机上的书籍目录，需要通过 **卷挂载（Volume Mount）** 将宿主机目录映射到容器内部。

---

## ✅ 解决方案

### 方案1: 使用 import 目录（推荐）⭐⭐⭐

**最简单的方式**：将书籍复制到 import 目录，系统会自动导入。

```bash
# 将书籍复制到 import 目录
cp /your/books/*.epub /volume5/docker/bookpath/import/

# 或者，创建子目录组织
mkdir -p /volume5/docker/bookpath/import/小说
cp /your/books/*.epub /volume5/docker/bookpath/import/小说/

# 系统会在几秒内自动检测并导入
```

**优点**：
- ✅ 无需修改配置
- ✅ 支持多级子目录（已修复）
- ✅ 自动导入，导入后删除源文件
- ✅ 支持 EPUB、PDF、TXT、MOBI

---

### 方案2: 挂载扫描目录

如果您有大量书籍在固定目录，不想移动文件，可以将该目录挂载到容器。

#### 步骤1: 修改 docker-compose.yml

编辑 `docker-compose.yml` 文件，在 `backend` 服务的 `volumes` 部分添加：

```yaml
services:
  backend:
    volumes:
      # ... 现有的挂载 ...
      - /volume5/docker/bookpath/import:/app/import
      
      # 添加扫描目录挂载（将您的书籍目录挂载到 /app/scan）
      # 格式：- 宿主机路径:容器路径:读写模式
      - /path/to/your/books:/app/scan:ro
      # :ro 表示只读（推荐），防止误删除
```

**实际示例**：

```yaml
# 示例1: 挂载群晖NAS的书籍目录
- /volume1/books:/app/scan:ro

# 示例2: 挂载多个目录
- /volume1/books:/app/scan/books1:ro
- /volume2/ebooks:/app/scan/books2:ro

# 示例3: 读写模式（如果需要修改文件）
- /volume1/books:/app/scan:rw
```

#### 步骤2: 重启 Docker 容器

```bash
cd /volume5/docker/bookpath/install

# 停止容器
docker-compose down

# 启动容器（应用新配置）
docker-compose up -d

# 验证挂载
docker exec knowbooks-backend ls -la /app/scan
```

#### 步骤3: 在系统中扫描

1. 登录系统
2. 进入"书籍管理" → "扫描目录"
3. 输入扫描路径：`/app/scan`
4. 点击"扫描"

系统会递归扫描 `/app/scan` 及其所有子目录。

---

### 方案3: 临时挂载（测试用）

如果只是临时扫描一次，可以不修改 `docker-compose.yml`：

```bash
# 停止后端容器
docker stop knowbooks-backend

# 启动时添加临时挂载
docker run -d \
  --name knowbooks-backend-temp \
  -v /volume5/docker/bookpath/data:/app/data \
  -v /volume5/docker/bookpath/books:/app/books \
  -v /volume5/docker/bookpath/import:/app/import \
  -v /your/books/directory:/app/scan:ro \
  -p 1201:3001 \
  knowbooks-backend

# 扫描完成后，恢复原容器
docker stop knowbooks-backend-temp
docker rm knowbooks-backend-temp
docker-compose up -d backend
```

---

## 📂 目录结构说明

### 容器内部路径

```
/app/
├── data/          # 数据库
├── books/         # 书籍存储（导入后的位置）
├── import/        # 自动导入目录
└── scan/          # 扫描目录（需要手动挂载）
```

### 宿主机路径（示例）

```
/volume5/docker/bookpath/
├── data/          → /app/data
├── books/         → /app/books
├── import/        → /app/import
└── （您的书籍目录） → /app/scan
```

---

## 🔍 常见问题

### Q1: 扫描时提示"路径不存在"？

**A**: 这是因为容器内部无法访问宿主机路径。

**解决方法**：
1. 确认已在 `docker-compose.yml` 中添加卷挂载
2. 确认宿主机路径确实存在
3. 重启容器使配置生效
4. 扫描时使用容器内路径（如 `/app/scan`），不是宿主机路径

**错误示例**：
```
❌ /volume1/books  # 这是宿主机路径，容器看不到
```

**正确示例**：
```
✅ /app/scan       # 这是容器内路径
```

---

### Q2: import 目录支持子目录吗？

**A**: ✅ **支持！**（已修复）

您可以在 import 目录中创建任意层级的子目录：

```bash
/volume5/docker/bookpath/import/
├── 小说/
│   ├── 科幻/
│   │   └── book1.epub
│   └── 武侠/
│       └── book2.epub
├── 技术/
│   └── programming/
│       └── book3.pdf
└── book4.txt
```

系统会递归扫描所有子目录并自动导入。

---

### Q3: 扫描后文件会被删除吗？

**A**: 取决于目录类型：

| 目录 | 扫描后 | 导入后 |
|------|--------|--------|
| `/app/import` | 不删除 | ✅ 删除源文件 |
| `/app/scan` | 不删除 | ❌ 不删除（只读） |

- **import 目录**：自动导入，导入成功后**删除**源文件
- **scan 目录**：手动扫描，**不删除**源文件（尤其是只读挂载）

---

### Q4: 如何验证挂载是否成功？

```bash
# 1. 检查容器内的挂载
docker exec knowbooks-backend df -h | grep /app

# 2. 列出扫描目录内容
docker exec knowbooks-backend ls -la /app/scan

# 3. 查看挂载详情
docker inspect knowbooks-backend | grep -A 10 Mounts
```

---

### Q5: 权限问题怎么办？

**症状**：扫描时提示"权限被拒绝"

**解决方法**：

```bash
# 方案1: 修改宿主机目录权限（推荐）
chmod -R 755 /your/books/directory

# 方案2: 修改所有权
chown -R 1000:1000 /your/books/directory

# 方案3: 使用 root 权限（已配置）
# docker-compose.yml 中已设置 user: "0:0"
```

---

### Q6: 可以挂载网络共享吗？

**A**: 可以，但需要先在宿主机挂载。

**示例（群晖NAS）**：

```bash
# 1. 在宿主机挂载网络共享
mount -t cifs //192.168.1.100/books /mnt/network-books -o username=admin,password=xxx

# 2. 在 docker-compose.yml 中挂载
volumes:
  - /mnt/network-books:/app/scan:ro

# 3. 重启容器
docker-compose down && docker-compose up -d
```

---

## 📊 方案对比

| 方案 | 难度 | 适用场景 | 优点 | 缺点 |
|------|------|---------|------|------|
| **import 目录** | ⭐ 简单 | 少量书籍、新书添加 | 自动化、无需配置 | 需要复制文件 |
| **挂载扫描** | ⭐⭐ 中等 | 大量书籍、固定目录 | 不需要移动文件 | 需要修改配置 |
| **临时挂载** | ⭐⭐⭐ 复杂 | 一次性批量导入 | 灵活 | 容器重启后失效 |

---

## 🎯 推荐工作流

### 新用户（小量书籍）

```bash
# 1. 将书籍复制到 import 目录
cp /your/books/*.epub /volume5/docker/bookpath/import/

# 2. 等待自动导入（5-10秒）
# 导入完成后，源文件会被自动删除

# 3. 在系统中查看书籍
```

### 进阶用户（大量书籍）

```bash
# 1. 修改 docker-compose.yml 添加挂载
vim docker-compose.yml

# 2. 重启容器
docker-compose down && docker-compose up -d

# 3. 在系统中扫描 /app/scan
# 批量选择要导入的书籍
```

---

## 🛠️ 完整示例：挂载并扫描

**假设您的书籍在 `/volume1/books`**

### 1. 编辑配置

```bash
cd /volume5/docker/bookpath/install
vim docker-compose.yml
```

添加：
```yaml
    volumes:
      # ... 现有配置 ...
      - /volume1/books:/app/scan:ro  # 添加这一行
```

### 2. 重启服务

```bash
docker-compose down
docker-compose up -d

# 等待30秒
sleep 30

# 验证
docker exec knowbooks-backend ls -la /app/scan
```

### 3. 扫描导入

1. 登录系统：https://vlistttbye.i234.me:12280
2. 进入"书籍管理" → "扫描目录"
3. 输入路径：`/app/scan`
4. 点击"扫描"
5. 选择要导入的书籍
6. 点击"批量导入"

---

## 📝 注意事项

1. **路径区分**：
   - 宿主机路径：`/volume1/books`
   - 容器内路径：`/app/scan`
   - 扫描时使用容器内路径！

2. **只读模式**：
   - 建议使用 `:ro`（只读）
   - 防止误删除原始文件
   - 如需修改，使用 `:rw`

3. **权限设置**：
   - 确保目录可读（755）
   - 避免权限错误

4. **多级目录**：
   - ✅ import 目录：支持递归扫描
   - ✅ scan 目录：支持递归扫描
   - 无限层级，放心使用

---

## 🎉 总结

- **简单场景**：直接用 import 目录 ⭐
- **大量书籍**：挂载 scan 目录扫描
- **测试调试**：使用临时挂载

需要帮助？查看日志：
```bash
docker-compose logs -f backend | grep "扫描\|scan"
```

---

**更新日期**：2025-12-11  
**版本**：1.2.0
