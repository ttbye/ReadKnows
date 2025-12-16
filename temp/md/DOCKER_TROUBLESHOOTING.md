# Docker 部署故障排除指南

## EPUB封面无法获取的问题

### 问题描述
在Docker部署后，EPUB文件无法提取和显示封面图片。

### 根本原因
这个问题通常是由以下几个原因引起的：

1. **目录权限问题** - Docker容器内的进程无法写入挂载的宿主机目录
2. **子目录缺失** - 挂载点覆盖了容器内创建的目录结构
3. **用户ID不匹配** - 容器用户和宿主机目录所有者不匹配

### 解决方案

#### 方案1：使用root用户运行（推荐用于NAS）

我们已经在`docker-compose.yml`中添加了`user: "0:0"`配置，这样容器会以root用户运行，避免权限问题。

#### 方案2：设置正确的目录权限（推荐用于Linux服务器）

如果你在Linux服务器上运行，可以设置正确的目录权限：

```bash
# 在宿主机上执行
sudo chown -R 1000:1000 /volume5/docker/bookpath/
sudo chmod -R 755 /volume5/docker/bookpath/
```

然后在`docker-compose.yml`中移除或注释掉`user: "0:0"`这一行。

#### 方案3：群晖NAS特殊处理

如果你使用的是群晖NAS：

1. **通过SSH连接到NAS**：
```bash
ssh admin@your-nas-ip
sudo -i
```

2. **设置目录权限**：
```bash
chmod -R 777 /volume5/docker/bookpath/
```

3. **确保子目录存在**：
```bash
mkdir -p /volume5/docker/bookpath/books/public
mkdir -p /volume5/docker/bookpath/books/user
mkdir -p /volume5/docker/bookpath/books/.temp
mkdir -p /volume5/docker/bookpath/data
mkdir -p /volume5/docker/bookpath/covers
mkdir -p /volume5/docker/bookpath/fonts
```

4. **重新部署容器**：
```bash
cd /path/to/KnowBooks
docker-compose down
docker-compose up -d --build
```

### 验证修复

1. **检查日志**：
```bash
docker-compose logs -f backend
```

查找包含`[EPUB封面提取]`的日志信息，应该看到类似：
```
[EPUB封面提取] 开始处理封面: { bookDir: '/app/books/user/xxx', coverPath: 'OEBPS/Images/cover.jpg' }
[EPUB封面提取] 目录可写
[EPUB封面提取] 封面数据大小: 12345 bytes
[EPUB封面提取] 封面文件已写入
[EPUB封面提取] 封面文件验证成功
```

2. **上传测试EPUB文件**：
   - 上传一个包含封面的EPUB文件
   - 检查是否能看到封面缩略图

3. **检查文件系统**：
```bash
# 在宿主机上检查
ls -la /volume5/docker/bookpath/books/user/
# 应该能看到每本书的目录，里面包含 cover.jpg 或 cover.png
```

### 常见错误信息

#### 错误1：`目录不可写`
```
[EPUB封面提取] 目录不可写: /app/books/user/xxx
```

**解决方法**：
- 检查宿主机目录权限
- 使用`user: "0:0"`配置（已添加）
- 或设置目录权限为777

#### 错误2：`EACCES: permission denied`
```
[EPUB封面提取] 保存封面图片失败: { error: 'EACCES: permission denied' }
```

**解决方法**：
- 在宿主机上执行：`chmod -R 777 /volume5/docker/bookpath/`
- 或使用root用户运行容器（已配置）

#### 错误3：`ENOENT: no such file or directory`
```
[EPUB封面提取] 保存封面图片失败: { error: 'ENOENT: no such file or directory' }
```

**解决方法**：
- 确保父目录存在
- 容器启动脚本会自动创建，但如果挂载覆盖，需要手动创建

### 进阶诊断

#### 1. 进入容器检查
```bash
# 进入容器
docker exec -it knowbooks-backend sh

# 检查目录权限
ls -la /app/books
ls -la /app/books/user

# 尝试创建文件
touch /app/books/test.txt
ls -la /app/books/test.txt

# 如果成功，说明权限正常
# 如果失败，说明权限有问题
```

#### 2. 检查挂载点
```bash
# 在容器内
df -h
mount | grep books
```

#### 3. 测试封面提取
上传一个EPUB文件，然后在日志中查看详细的处理过程。

### 其他注意事项

1. **Docker版本**：确保使用的是较新版本的Docker和Docker Compose
2. **SELinux**：如果是Red Hat/CentOS系统，可能需要设置SELinux上下文
3. **防火墙**：确保端口1201可访问

### 性能优化

如果封面提取成功但速度慢：

1. **使用SSD存储**：将books目录放在SSD上
2. **增加内存**：给容器分配更多内存
3. **调整并发**：减少同时处理的文件数量

### 需要帮助？

如果以上方法都无法解决问题，请：

1. 收集日志：`docker-compose logs backend > backend.log`
2. 检查宿主机信息：操作系统、Docker版本
3. 提供错误信息和日志
4. 创建Issue并附上相关信息

## 自动导入问题

### 问题描述
文件复制到 `import` 目录后，没有被自动导入。

### 根本原因
1. **导入服务未启动** - 后端服务启动时自动导入功能未正常启动
2. **目录权限问题** - import 目录不可读或不可写
3. **文件未稳定** - 文件正在复制中，系统等待稳定
4. **文件格式不支持** - 文件扩展名不在支持列表中

### 解决方案

#### 方案1：检查服务状态

```bash
# 查看后端日志
docker-compose logs backend | grep "文件监控\|自动导入"

# 应该看到启动信息
# ====================================
# 启动自动导入服务...
# [文件监控] 启动文件监控服务
# [文件监控] 监控目录: /app/import
# 自动导入服务已启动
# ====================================
```

如果没有看到上述信息，重启容器：
```bash
docker-compose restart backend
```

#### 方案2：检查目录权限

```bash
# 检查 import 目录是否存在且可写
ls -la /volume5/docker/bookpath/import

# 设置正确的权限
sudo chmod 777 /volume5/docker/bookpath/import

# 或使用修复脚本
sudo ./fix-docker-permissions.sh
```

#### 方案3：检查文件状态

```bash
# 查看 import 目录中的文件
docker exec -it knowbooks-backend ls -lh /app/import

# 手动触发扫描
curl -X POST http://localhost:1201/api/import/scan \
  -H "Authorization: Bearer YOUR_TOKEN"

# 或通过容器内部触发
docker exec -it knowbooks-backend sh
cd /app
ls -la import/
```

#### 方案4：查看详细日志

```bash
# 实时查看导入日志
docker-compose logs -f backend | grep -E "文件监控|自动导入|EPUB封面"

# 查看最近的错误
docker-compose logs backend | grep -i error | tail -20
```

### 常见错误信息

#### 错误1：`监控服务未启动`
```
[文件监控] 启动文件监控服务失败: Error: ENOENT: no such file or directory
```

**解决方法**：
```bash
# 确保 import 目录存在
sudo mkdir -p /volume5/docker/bookpath/import
sudo chmod 777 /volume5/docker/bookpath/import

# 重启容器
docker-compose restart backend
```

#### 错误2：`无法读取目录`
```
[文件监控] 扫描目录失败: EACCES: permission denied
```

**解决方法**：
```bash
# 修复权限
sudo chmod -R 777 /volume5/docker/bookpath/import

# 或使用root用户运行（已在docker-compose.yml中配置）
```

#### 错误3：`文件处理失败`
```
[自动导入] 处理文件失败: ENOSPC: no space left on device
```

**解决方法**：
```bash
# 检查磁盘空间
df -h

# 清理不需要的文件
docker system prune -a
```

### 验证自动导入功能

1. **复制测试文件**：
```bash
# 复制一个小的EPUB文件进行测试
cp test.epub /volume5/docker/bookpath/import/
```

2. **观察日志**：
```bash
docker-compose logs -f backend
```

应该在 5-10 秒内看到：
```
[文件监控] 发现新文件: test.epub (xxx KB)
[自动导入] 开始处理文件: test.epub
[自动导入] EPUB元数据提取成功: xxx
[自动导入] 导入成功: xxx (ID: xxx)
[自动导入] 已删除原文件: /app/import/test.epub
```

3. **检查文件是否被删除**：
```bash
ls -la /volume5/docker/bookpath/import/
# 导入成功后，test.epub 应该已被删除
```

4. **在Web界面确认**：
   - 登录系统
   - 查看书籍列表
   - 应该能看到新导入的书籍

### 更新记录

- 2025-12-11：初始版本，添加EPUB封面提取问题的解决方案
- 2025-12-11：添加自动导入功能故障排除
