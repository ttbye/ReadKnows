#!/bin/bash

echo "=========================================="
echo "KnowBooks 项目清理脚本"
echo "=========================================="
echo ""
echo "警告: 此脚本将删除以下内容:"
echo "  - 备份目录 (bak/)"
echo "  - 日志文件 (*.log)"
echo "  - 数据库文件 (backend/data/*.db*)"
echo "  - 书籍文件 (backend/books/, books/)"
echo "  - 封面图片 (backend/covers/)"
echo "  - 构建产物 (dist/)"
echo ""
read -p "是否继续? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 1
fi

echo ""
echo "开始清理..."

# 删除备份目录
echo "删除备份目录..."
rm -rf bak/

# 删除日志文件
echo "删除日志文件..."
find . -name "*.log" -type f -not -path "./node_modules/*" -not -path "./.git/*" -delete

# 删除数据库文件
echo "删除数据库文件..."
rm -f backend/data/*.db*

# 删除书籍文件
echo "删除书籍文件..."
rm -rf backend/books/public/*
rm -rf backend/books/user/*
rm -rf books/*

# 创建 .gitkeep 文件
echo "创建 .gitkeep 文件..."
touch backend/books/public/.gitkeep 2>/dev/null || true
touch backend/books/user/.gitkeep 2>/dev/null || true
mkdir -p books && touch books/.gitkeep 2>/dev/null || true

# 删除封面
echo "删除封面..."
rm -rf backend/covers/*
touch backend/covers/.gitkeep 2>/dev/null || true

# 删除构建产物
echo "删除构建产物..."
rm -rf backend/dist
rm -rf frontend/dist

echo ""
echo "=========================================="
echo "清理完成！"
echo "=========================================="
echo ""
echo "请检查以下内容:"
echo "  1. .env 文件已添加到 .gitignore"
echo "  2. 所有敏感文件都已忽略"
echo "  3. 运行 'git status' 检查更改"
echo ""
