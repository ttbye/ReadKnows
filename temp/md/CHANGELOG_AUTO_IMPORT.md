# 自动导入功能更新日志

## 版本 1.1.0 - 2025-12-11

### 🎉 新增功能：自动导入

KnowBooks 现在支持自动导入功能！只需将电子书文件复制到 `import` 目录，系统会自动检测、导入并处理这些文件。

### ✨ 主要特性

1. **自动检测**
   - 实时监控 `import` 目录
   - 每5秒扫描一次新文件
   - 文件稳定性检测（避免处理正在复制的文件）

2. **智能处理**
   - 自动提取元数据（书名、作者、简介等）
   - 自动提取封面图片（EPUB/PDF）
   - 自动转换格式（TXT→EPUB, MOBI→EPUB）
   - 基于文件哈希的重复检测

3. **自动清理**
   - 导入成功后自动删除原文件
   - 自动清理临时文件
   - 保持 import 目录整洁

4. **支持格式**
   - EPUB - 电子出版物格式 ✅
   - PDF - 便携式文档格式 ✅
   - TXT - 纯文本格式（自动转换） ✅
   - MOBI - Kindle格式（需要Calibre） ✅

### 📁 新增文件

#### 核心功能
- `backend/src/utils/fileWatcher.ts` - 文件监控服务
- `backend/src/utils/autoImportHandler.ts` - 自动导入处理器
- `backend/src/routes/import.ts` - 自动导入API路由

#### 文档
- `AUTO_IMPORT.md` - 自动导入功能完整文档
- `CHANGELOG_AUTO_IMPORT.md` - 更新日志（本文件）
- `test-auto-import.sh` - 自动导入功能测试脚本

#### 配置文件更新
- `docker-compose.yml` - 添加 import 目录挂载
- `backend/Dockerfile` - 添加 import 目录创建
- `fix-docker-permissions.sh` - 添加 import 目录权限修复
- `.env.example` - 添加 IMPORT_DIR 配置说明

#### 文档更新
- `README.md` - 添加自动导入功能说明
- `DOCKER_TROUBLESHOOTING.md` - 添加自动导入故障排除

### 🔧 修改的文件

1. **backend/src/index.ts**
   - 导入 `fileWatcher` 模块
   - 导入 `importRoutes` 路由
   - 启动文件监控服务
   - 优雅关闭时停止监控

2. **backend/src/utils/epubParser.ts**
   - 增强日志输出
   - 改进错误处理
   - 添加目录权限检查
   - 添加文件写入验证

3. **backend/Dockerfile**
   - 创建 `/app/import` 目录
   - 在启动脚本中添加 import 目录检查
   - 设置 import 目录权限

4. **docker-compose.yml**
   - 添加 import 目录 volume 挂载
   - 添加 `user: "0:0"` 配置（解决权限问题）

5. **fix-docker-permissions.sh**
   - 添加 import 目录创建
   - 添加 import 目录权限设置

6. **README.md**
   - 添加自动导入功能介绍
   - 更新项目结构说明
   - 添加使用指南
   - 更新Docker部署步骤

7. **DOCKER_TROUBLESHOOTING.md**
   - 添加自动导入故障排除章节
   - 添加常见错误解决方案
   - 添加验证步骤

### 📊 API 接口

新增以下API接口：

1. **GET /api/import/status**
   - 获取自动导入服务状态
   - 查看最近导入的书籍
   - 需要认证

2. **POST /api/import/scan**
   - 手动触发目录扫描
   - 需要认证

3. **GET /api/import/stats**
   - 获取导入统计信息
   - 包含总数、大小、按日期统计等
   - 需要认证

### 🚀 使用方法

#### Docker 环境

1. **确保配置正确**
```bash
# 检查 docker-compose.yml 中的 volume 配置
grep -A 5 "volumes:" docker-compose.yml | grep import
```

2. **设置目录权限**
```bash
sudo ./fix-docker-permissions.sh
```

3. **重启容器**
```bash
docker-compose down
docker-compose up -d --build
```

4. **复制文件进行导入**
```bash
cp /path/to/book.epub /volume5/docker/bookpath/import/
```

5. **查看日志**
```bash
docker-compose logs -f backend | grep "自动导入"
```

#### 本地开发环境

1. **启动开发服务器**
```bash
npm run dev
```

2. **复制文件到 import 目录**
```bash
cp /path/to/book.epub backend/import/
```

3. **查看控制台输出**

### 🧪 测试

运行自动化测试脚本：

```bash
./test-auto-import.sh
```

该脚本会：
1. 检查 Docker 容器状态
2. 验证 import 目录权限
3. 创建测试文件
4. 监控自动导入过程
5. 验证导入结果

### 🐛 已知问题

1. **MOBI 转换**
   - Docker 环境中默认未安装 Calibre
   - 建议先在宿主机转换为 EPUB 后再导入
   - 或修改 Dockerfile 添加 Calibre 支持

2. **大文件处理**
   - 超过 100MB 的文件可能需要较长时间
   - 建议确保有足够的磁盘空间

3. **并发限制**
   - 当前实现是串行处理
   - 大量文件同时复制时会按顺序处理

### 🔮 未来计划

1. **Web 界面**
   - 添加自动导入管理页面
   - 实时显示导入进度
   - 导入历史记录查看

2. **高级功能**
   - 支持子目录结构
   - 自动分类（根据文件夹名称）
   - 批量元数据匹配（豆瓣API）
   - Webhook 通知

3. **性能优化**
   - 并发处理多个文件
   - 增量扫描（使用 inotify/fsevents）
   - 大文件分片处理

### 📝 迁移指南

#### 从旧版本升级

如果你已经在使用 KnowBooks，升级到支持自动导入的版本：

1. **备份数据**
```bash
# 备份数据库
cp /volume5/docker/bookpath/data/database.db /path/to/backup/

# 备份书籍
cp -r /volume5/docker/bookpath/books /path/to/backup/
```

2. **拉取最新代码**
```bash
git pull origin main
```

3. **重新构建镜像**
```bash
docker-compose build --no-cache
```

4. **更新配置**
```bash
# 更新 docker-compose.yml（如果之前修改过）
# 确保包含 import 目录挂载
```

5. **创建 import 目录**
```bash
sudo mkdir -p /volume5/docker/bookpath/import
sudo chmod 777 /volume5/docker/bookpath/import
```

6. **启动新版本**
```bash
docker-compose up -d
```

7. **验证功能**
```bash
./test-auto-import.sh
```

### 💡 最佳实践

1. **命名规范**
   - 使用清晰的文件名：`书名-作者.epub`
   - 避免特殊字符和空格

2. **批量导入**
   - 建议分批复制，每批不超过50个文件
   - 大文件单独处理

3. **监控日志**
   - 定期查看导入日志
   - 关注错误信息

4. **定期清理**
   - 清理失败的导入文件
   - 检查磁盘空间

### 🙏 致谢

感谢所有用户的反馈和建议！

### 📮 反馈

如有问题或建议，请：
- 提交 [Issue](https://github.com/your-username/KnowBooks/issues)
- 查看 [文档](./AUTO_IMPORT.md)
- 阅读 [故障排除指南](./DOCKER_TROUBLESHOOTING.md)

---

**更新时间**: 2025-12-11  
**版本**: 1.1.0  
**作者**: ttbye
