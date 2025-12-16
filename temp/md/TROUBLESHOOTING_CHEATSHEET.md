# 快速故障排除备忘单

## 🚨 常见问题速查

### 封面问题

| 问题 | 快速诊断 | 快速修复 |
|------|---------|---------|
| 封面不显示 | `./check-covers.sh` | `docker-compose exec backend npm run fix-covers` |
| EPUB封面提取失败 | `docker-compose logs backend \| grep "EPUB封面"` | `sudo ./fix-docker-permissions.sh && docker-compose restart backend` |
| cover_url为null | `./check-covers.sh` | 删除书籍重新导入 或 运行修复脚本 |
| 封面文件存在但不显示 | 检查数据库：`docker-compose exec backend npm run fix-covers` | 同左 |

### 自动导入问题

| 问题 | 快速诊断 | 快速修复 |
|------|---------|---------|
| 文件未被检测 | `docker-compose logs backend \| grep "文件监控"` | 检查import目录权限：`ls -la /volume5/docker/bookpath/import` |
| 导入失败 | `docker-compose logs backend \| grep "自动导入"` | 查看错误日志，修复权限或文件格式 |
| 服务未启动 | `docker-compose logs backend \| grep "启动自动导入"` | `docker-compose restart backend` |
| 文件未删除 | `ls /volume5/docker/bookpath/import/` | 检查日志看是否导入成功，手动删除失败文件 |

### Docker/权限问题

| 问题 | 快速诊断 | 快速修复 |
|------|---------|---------|
| 权限拒绝 | `docker exec knowbooks-backend ls -la /app/books` | `sudo ./fix-docker-permissions.sh` |
| 目录不存在 | `ls -la /volume5/docker/bookpath/` | `sudo mkdir -p /volume5/docker/bookpath/{data,books,import,covers,fonts}` |
| 容器无法启动 | `docker-compose logs backend` | 检查端口占用、磁盘空间、配置文件 |

## 📋 常用命令

### 日志查看

```bash
# 查看所有日志
docker-compose logs -f backend

# 查看自动导入日志
docker-compose logs -f backend | grep "自动导入\|文件监控"

# 查看封面提取日志
docker-compose logs backend | grep "EPUB封面提取" | tail -20

# 查看错误日志
docker-compose logs backend | grep -i error | tail -20
```

### 状态检查

```bash
# 检查容器状态
docker-compose ps

# 检查封面状态
./check-covers.sh

# 检查目录权限
ls -la /volume5/docker/bookpath/

# 检查导入目录
ls -la /volume5/docker/bookpath/import/
```

### 修复操作

```bash
# 修复所有权限
sudo ./fix-docker-permissions.sh

# 修复封面
docker-compose exec backend npm run fix-covers

# 重启服务
docker-compose restart backend

# 重新构建
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### 进入容器

```bash
# 进入后端容器
docker exec -it knowbooks-backend sh

# 在容器中常用命令
cd /app/books/public     # 查看书籍目录
ls -la import/           # 查看导入目录
node                     # 进入Node REPL
```

## 🔍 调试技巧

### 1. 查看数据库

```bash
docker-compose exec backend node -e "
const db = require('better-sqlite3')('./data/database.db');

// 查看最近的书籍
console.log('最近导入的书籍:');
const books = db.prepare('SELECT id, title, cover_url FROM books ORDER BY created_at DESC LIMIT 5').all();
console.log(JSON.stringify(books, null, 2));

// 查看封面统计
const stats = db.prepare(\`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN cover_url IS NOT NULL THEN 1 ELSE 0 END) as with_cover
  FROM books
\`).get();
console.log('\\n统计:', stats);

db.close();
"
```

### 2. 测试文件访问

```bash
# 测试封面URL
curl -I http://localhost:1201/books/public/xxx/cover.jpg

# 在容器内测试
docker exec knowbooks-backend ls -la /app/books/public/xxx/cover.jpg
```

### 3. 手动触发导入

```bash
# 手动触发扫描
curl -X POST http://localhost:1201/api/import/scan \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🎯 问题分类

### A. 封面相关

```bash
# 问题：封面不显示
# 步骤：
1. ./check-covers.sh                    # 检查状态
2. 查看日志中的封面提取信息
3. docker-compose exec backend npm run fix-covers  # 修复
4. 如仍有问题，删除书籍重新导入
```

### B. 自动导入相关

```bash
# 问题：文件不导入
# 步骤：
1. ls -la /volume5/docker/bookpath/import/  # 确认文件存在
2. docker-compose logs backend | grep "文件监控"  # 检查服务状态
3. sudo chmod 777 /volume5/docker/bookpath/import/  # 修复权限
4. docker-compose restart backend           # 重启服务
5. ./test-auto-import.sh                   # 测试
```

### C. 权限相关

```bash
# 问题：权限拒绝
# 步骤：
1. sudo ./fix-docker-permissions.sh        # 修复权限
2. docker-compose down && docker-compose up -d  # 重启
3. 测试文件操作
```

## 📞 获取帮助

### 收集诊断信息

运行以下命令收集诊断信息：

```bash
# 创建诊断报告
cat > diagnostic-report.txt << 'EOF'
===== 系统信息 =====
EOF

echo "Docker版本:" >> diagnostic-report.txt
docker --version >> diagnostic-report.txt

echo -e "\n===== 容器状态 =====" >> diagnostic-report.txt
docker-compose ps >> diagnostic-report.txt

echo -e "\n===== 封面状态 =====" >> diagnostic-report.txt
./check-covers.sh >> diagnostic-report.txt 2>&1

echo -e "\n===== 最近日志 =====" >> diagnostic-report.txt
docker-compose logs --tail=100 backend >> diagnostic-report.txt 2>&1

echo -e "\n===== 目录权限 =====" >> diagnostic-report.txt
ls -la /volume5/docker/bookpath/ >> diagnostic-report.txt 2>&1

echo "诊断报告已保存到: diagnostic-report.txt"
```

### 提交Issue

包含以下信息：
1. 问题描述
2. 复现步骤
3. 预期结果 vs 实际结果
4. 诊断报告（diagnostic-report.txt）
5. 相关日志截图

## 🔗 详细文档

- **[完整故障排除指南](./DOCKER_TROUBLESHOOTING.md)** - Docker相关问题
- **[封面修复指南](./FIX_COVERS_GUIDE.md)** - 封面问题详解
- **[自动导入文档](./AUTO_IMPORT.md)** - 自动导入功能说明
- **[快速开始](./QUICK_START_AUTO_IMPORT.md)** - 5分钟上手

---

💡 **提示**：大多数问题都可以通过运行 `sudo ./fix-docker-permissions.sh` 解决！
