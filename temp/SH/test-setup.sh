#!/bin/bash

# 测试脚本 - 检查项目配置和代码

echo "========================================="
echo "EpubManager 项目测试"
echo "========================================="
echo ""

# 检查Node.js版本
echo "1. 检查Node.js版本..."
node_version=$(node -v 2>/dev/null || echo "未安装")
echo "   Node.js: $node_version"
echo ""

# 检查npm版本
echo "2. 检查npm版本..."
npm_version=$(npm -v 2>/dev/null || echo "未安装")
echo "   npm: $npm_version"
echo ""

# 检查项目结构
echo "3. 检查项目结构..."
if [ -d "backend" ]; then
    echo "   ✓ backend目录存在"
else
    echo "   ✗ backend目录不存在"
fi

if [ -d "frontend" ]; then
    echo "   ✓ frontend目录存在"
else
    echo "   ✗ frontend目录不存在"
fi

if [ -f "backend/package.json" ]; then
    echo "   ✓ backend/package.json存在"
else
    echo "   ✗ backend/package.json不存在"
fi

if [ -f "frontend/package.json" ]; then
    echo "   ✓ frontend/package.json存在"
else
    echo "   ✗ frontend/package.json不存在"
fi
echo ""

# 检查关键文件
echo "4. 检查关键文件..."
files=(
    "backend/src/index.ts"
    "backend/src/db/index.ts"
    "backend/src/routes/books.ts"
    "backend/src/routes/settings.ts"
    "backend/src/routes/scan.ts"
    "backend/src/routes/opds.ts"
    "frontend/src/App.tsx"
    "frontend/src/pages/Settings.tsx"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✓ $file"
    else
        echo "   ✗ $file 不存在"
    fi
done
echo ""

# 检查环境变量文件
echo "5. 检查配置文件..."
if [ -f "backend/.env.example" ]; then
    echo "   ✓ backend/.env.example存在"
else
    echo "   ✗ backend/.env.example不存在"
fi

if [ -f "backend/.env" ]; then
    echo "   ✓ backend/.env存在（已配置）"
else
    echo "   ⚠ backend/.env不存在（需要从.env.example复制）"
fi
echo ""

# 检查依赖
echo "6. 检查依赖..."
if [ -d "backend/node_modules" ]; then
    echo "   ✓ backend依赖已安装"
else
    echo "   ⚠ backend依赖未安装（运行: cd backend && npm install）"
fi

if [ -d "frontend/node_modules" ]; then
    echo "   ✓ frontend依赖已安装"
else
    echo "   ⚠ frontend依赖未安装（运行: cd frontend && npm install）"
fi
echo ""

# 总结
echo "========================================="
echo "测试完成！"
echo ""
echo "下一步："
echo "1. 如果依赖未安装，运行: npm run install:all"
echo "2. 配置环境变量: cp backend/.env.example backend/.env"
echo "3. 编辑 backend/.env 设置JWT_SECRET和豆瓣API地址"
echo "4. 启动开发服务器: npm run dev"
echo "========================================="

