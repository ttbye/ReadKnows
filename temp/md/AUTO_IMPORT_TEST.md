# 自动导入功能测试指南

## 快速测试

### 1. 启动服务

```bash
# Docker 环境
docker-compose up -d --build

# 查看日志，确认自动导入服务已启动
docker-compose logs -f backend | grep "文件监控\|自动导入"
```

应该看到：

```
====================================
启动自动导入服务...
[文件监控] 启动文件监控服务，监控目录: /app/import
[文件监控] 扫描现有文件
自动导入服务已启动
监控目录: /app/import
====================================
```

### 2. 准备测试文件

准备几个电子书文件用于测试：

```bash
# 创建测试 EPUB（如果有）
cp /path/to/test.epub /volume5/docker/bookpath/import/

# 创建测试 PDF
cp /path/to/test.pdf /volume5/docker/bookpath/import/

# 创建测试 TXT
echo "这是一本测试书籍的内容" > /volume5/docker/bookpath/import/test.txt
```

### 3. 观察导入过程

```bash
# 实时查看日志
docker-compose logs -f backend | grep "自动导入"
```

预期输出：

```
[文件监控] 检测到新文件: test.epub
[文件监控] 开始导入文件: test.epub
[自动导入] 开始处理文件: test.epub
[自动导入] 文件信息: { filename: 'test.epub', size: 123456, hash: 'abc...' }
[自动导入] EPUB元数据提取成功: { title: '测试书籍', author: '测试作者' }
[自动导入] 文件已移动到: /app/books/user/测试作者/测试书籍.epub
[EPUB封面提取] 封面图片已保存
[自动导入] 书籍已保存到数据库
[自动导入] 已删除导入文件
[文件监控] 文件导入成功
```

### 4. 验证结果

#### 方法1：通过 Web 界面

1. 打开浏览器访问 http://localhost:1280
2. 登录系统
3. 在首页或书架中应该能看到导入的书籍

#### 方法2：通过 API

```bash
# 获取书籍列表（需要先登录获取 token）
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:1201/api/books?page=1&limit=10
```

#### 方法3：检查文件系统

```bash
# 检查 import 目录（应该为空，因为文件已被删除）
ls -la /volume5/docker/bookpath/import/

# 检查 books 目录（应该有新增的书籍文件）
ls -la /volume5/docker/bookpath/books/user/
```

### 5. 测试不同格式

```bash
# 测试 TXT 文件（会被转换为 EPUB）
echo "第一章 开始\n\n这是第一章的内容..." > /volume5/docker/bookpath/import/测试小说.txt

# 测试 PDF 文件
cp /path/to/document.pdf /volume5/docker/bookpath/import/

# 测试 MOBI 文件（需要安装 Calibre）
cp /path/to/book.mobi /volume5/docker/bookpath/import/
```

### 6. 测试重复文件

```bash
# 复制相同的文件
cp /path/to/test.epub /volume5/docker/bookpath/import/duplicate.epub

# 查看日志，应该显示文件已存在
docker-compose logs -f backend | grep "自动导入"
```

预期输出：

```
[自动导入] 文件已存在: 测试书籍
[自动导入] 已删除导入文件
```

### 7. 测试批量导入

```bash
# 复制多个文件
cp /path/to/books/*.epub /volume5/docker/bookpath/import/

# 查看导入进度
docker-compose logs -f backend | grep "自动导入"
```

### 8. 测试手动扫描

```bash
# 通过 API 触发手动扫描
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:1201/api/settings/auto-import/scan
```

### 9. 检查自动导入状态

```bash
# 获取状态
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:1201/api/settings/auto-import/status
```

预期响应：

```json
{
  "isRunning": true,
  "importDir": "/app/import",
  "processingCount": 0,
  "processingFiles": [],
  "filesInDirectory": 0,
  "supportedFilesInDirectory": 0
}
```

## 常见测试场景

### 场景1：测试权限问题

```bash
# 创建一个没有读权限的文件
touch /volume5/docker/bookpath/import/no-permission.epub
chmod 000 /volume5/docker/bookpath/import/no-permission.epub

# 查看是否有错误日志
docker-compose logs backend | grep "权限\|permission"
```

### 场景2：测试大文件

```bash
# 创建一个大文件（>500MB）
dd if=/dev/zero of=/volume5/docker/bookpath/import/large.epub bs=1M count=600

# 查看是否有大小限制错误
docker-compose logs backend | grep "自动导入"
```

### 场景3：测试文件正在写入

```bash
# 模拟慢速复制
rsync --progress --bwlimit=100 /path/to/large.epub /volume5/docker/bookpath/import/

# 系统会等待文件稳定后再处理
```

### 场景4：测试功能开关

```bash
# 禁用自动导入
curl -X PUT -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"false"}' \
  http://localhost:1201/api/settings/auto_import_enabled

# 复制文件，应该不会被导入
cp /path/to/test.epub /volume5/docker/bookpath/import/

# 启用自动导入
curl -X PUT -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"true"}' \
  http://localhost:1201/api/settings/auto_import_enabled
```

## 性能测试

### 测试导入速度

```bash
# 准备100个测试文件
for i in {1..100}; do
  cp /path/to/test.epub "/volume5/docker/bookpath/import/test_$i.epub"
done

# 记录开始时间
date

# 等待全部导入完成
while [ $(ls /volume5/docker/bookpath/import/ | wc -l) -gt 0 ]; do
  echo "剩余文件: $(ls /volume5/docker/bookpath/import/ | wc -l)"
  sleep 5
done

# 记录结束时间
date
```

### 监控资源使用

```bash
# 监控容器资源
docker stats knowbooks-backend

# 查看内存使用
docker exec knowbooks-backend top

# 查看磁盘I/O
docker exec knowbooks-backend iostat
```

## 故障注入测试

### 1. 测试数据库锁定

```bash
# 在导入过程中重启容器
docker-compose restart backend
```

### 2. 测试文件系统满

```bash
# 填满磁盘（谨慎操作）
dd if=/dev/zero of=/volume5/docker/bookpath/fillfile bs=1M count=<size>
```

### 3. 测试网络问题

```bash
# 禁用豆瓣API（测试降级）
curl -X PUT -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":""}' \
  http://localhost:1201/api/settings/douban_api_base
```

## 清理测试数据

```bash
# 删除测试文件
rm -f /volume5/docker/bookpath/import/*

# 删除测试书籍（通过 Web 界面或 API）
curl -X DELETE -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:1201/api/books/<book_id>
```

## 自动化测试脚本

```bash
#!/bin/bash

# 自动导入功能测试脚本

TOKEN="your_token_here"
API_BASE="http://localhost:1201/api"
IMPORT_DIR="/volume5/docker/bookpath/import"

echo "===== 开始测试自动导入功能 ====="

# 1. 检查服务状态
echo "1. 检查服务状态..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/settings/auto-import/status" | jq .

# 2. 复制测试文件
echo "2. 复制测试文件..."
cp test-files/*.epub "$IMPORT_DIR/"

# 3. 等待导入完成
echo "3. 等待导入完成..."
sleep 10

# 4. 检查导入结果
echo "4. 检查导入结果..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/books?page=1&limit=5" | jq '.books[] | {title, author, file_type}'

# 5. 验证文件已删除
echo "5. 验证源文件已删除..."
ls -la "$IMPORT_DIR/"

echo "===== 测试完成 ====="
```

## 注意事项

1. **测试前备份**：在测试前建议备份数据库
2. **使用测试环境**：建议在测试环境而非生产环境进行测试
3. **监控日志**：始终关注日志输出
4. **清理数据**：测试完成后及时清理测试数据

## 问题报告

如果发现问题，请收集以下信息：

1. 完整的错误日志
2. 导入的文件信息（大小、格式、文件名）
3. 系统设置
4. Docker 版本和环境信息

提交 Issue 时请附上这些信息。
