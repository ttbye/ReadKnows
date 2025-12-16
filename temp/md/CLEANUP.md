# 清理指南

在将项目提交到 GitHub 之前，请按照本指南清理不必要的文件。

## 🗑️ 需要删除的文件和目录

### 1. 备份目录

```bash
# 删除所有备份目录
rm -rf bak/
```

### 2. 日志文件

```bash
# 删除根目录日志文件
rm -f *.log
rm -f backend.log frontend.log

# 删除所有子目录中的日志文件
find . -name "*.log" -type f -delete
```

### 3. 数据库文件（如果包含敏感数据）

```bash
# 删除数据库文件（如果需要保留结构，只删除数据）
rm -f backend/data/*.db
rm -f backend/data/*.db-journal
rm -f backend/data/*.db-wal
rm -f backend/data/*.db-shm
```

### 4. 书籍文件（用户数据）

```bash
# 删除所有书籍文件（保留目录结构）
rm -rf backend/books/public/*
rm -rf backend/books/user/*
rm -rf books/*

# 如果需要保留目录结构，创建 .gitkeep 文件
touch backend/books/public/.gitkeep
touch backend/books/user/.gitkeep
touch books/.gitkeep
```

### 5. 封面图片

```bash
# 删除封面图片
rm -rf backend/covers/*
touch backend/covers/.gitkeep
```

### 6. 字体文件（可选）

如果字体文件是用户上传的，应该删除：

```bash
# 删除字体文件（保留目录结构）
rm -rf backend/fonts/*
touch backend/fonts/.gitkeep
```

### 7. 构建产物

```bash
# 删除构建产物
rm -rf backend/dist
rm -rf frontend/dist
rm -rf build
```

### 8. 临时脚本文件（可选）

如果不需要这些脚本，可以删除：

```bash
rm -f init.sh
rm -f start.sh
rm -f reset.sh
rm -f reset-force.sh
rm -f force-refresh.sh
rm -f test-setup.sh
```

### 9. 环境变量文件

```bash
# 确保 .env 文件已添加到 .gitignore
# 如果已提交，需要从 Git 中删除（但保留本地文件）
git rm --cached .env
git rm --cached backend/.env
git rm --cached frontend/.env
```

## 📝 清理脚本

创建一个清理脚本 `cleanup.sh`：

```bash
#!/bin/bash

echo "开始清理项目..."

# 删除备份目录
echo "删除备份目录..."
rm -rf bak/

# 删除日志文件
echo "删除日志文件..."
find . -name "*.log" -type f -not -path "./node_modules/*" -delete

# 删除数据库文件
echo "删除数据库文件..."
rm -f backend/data/*.db*

# 删除书籍文件
echo "删除书籍文件..."
rm -rf backend/books/public/*
rm -rf backend/books/user/*
rm -rf books/*

# 创建 .gitkeep 文件
touch backend/books/public/.gitkeep
touch backend/books/user/.gitkeep
touch books/.gitkeep

# 删除封面
echo "删除封面..."
rm -rf backend/covers/*
touch backend/covers/.gitkeep

# 删除字体（可选）
# rm -rf backend/fonts/*
# touch backend/fonts/.gitkeep

# 删除构建产物
echo "删除构建产物..."
rm -rf backend/dist
rm -rf frontend/dist

# 删除临时脚本（可选）
# rm -f init.sh start.sh reset.sh reset-force.sh force-refresh.sh test-setup.sh

echo "清理完成！"
```

运行清理脚本：

```bash
chmod +x cleanup.sh
./cleanup.sh
```

## ✅ 清理后检查清单

- [ ] 备份目录已删除
- [ ] 日志文件已删除
- [ ] 数据库文件已删除（或已添加到 .gitignore）
- [ ] 书籍文件已删除（或已添加到 .gitignore）
- [ ] 封面图片已删除（或已添加到 .gitignore）
- [ ] 构建产物已删除
- [ ] .env 文件已添加到 .gitignore
- [ ] node_modules 已添加到 .gitignore
- [ ] 检查 .gitignore 文件是否完整

## 🔍 验证清理

运行以下命令检查是否有大文件或敏感文件：

```bash
# 检查大文件（> 10MB）
find . -type f -size +10M -not -path "./node_modules/*" -not -path "./.git/*"

# 检查是否有 .env 文件
find . -name ".env" -not -path "./node_modules/*"

# 检查是否有数据库文件
find . -name "*.db" -not -path "./node_modules/*"

# 检查是否有书籍文件
find . -name "*.epub" -o -name "*.pdf" -o -name "*.txt" -o -name "*.mobi" | grep -v node_modules
```

## 📦 准备提交

清理完成后，准备提交到 GitHub：

```bash
# 检查 Git 状态
git status

# 添加所有更改
git add .

# 提交
git commit -m "Initial commit: KnowBooks - 电子书管理平台"

# 添加远程仓库
git remote add origin https://github.com/your-username/KnowBooks.git

# 推送到 GitHub
git push -u origin main
```

## ⚠️ 注意事项

1. **不要删除 .gitkeep 文件**：这些文件用于保留空目录结构
2. **备份重要数据**：在删除之前，确保已备份重要的书籍和数据库
3. **检查 .gitignore**：确保所有敏感文件都已添加到 .gitignore
4. **测试清理后的项目**：确保清理后项目仍能正常运行

