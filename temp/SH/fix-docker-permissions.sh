#!/bin/bash

# Docker 权限修复脚本
# 用于解决 EPUB 封面无法提取的问题

echo "=================================="
echo "KnowBooks Docker 权限修复脚本"
echo "=================================="
echo ""

# 检查是否以root权限运行
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  此脚本需要root权限运行"
    echo "请使用: sudo $0"
    exit 1
fi

# 从docker-compose.yml读取挂载路径
COMPOSE_FILE="docker-compose.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ 未找到 docker-compose.yml 文件"
    echo "请在项目根目录运行此脚本"
    exit 1
fi

# 提取挂载路径（简化版，假设使用默认配置）
DATA_DIR="/volume5/docker/bookpath/data"
BOOKS_DIR="/volume5/docker/bookpath/books"
COVERS_DIR="/volume5/docker/bookpath/covers"
FONTS_DIR="/volume5/docker/bookpath/fonts"
IMPORT_DIR="/volume5/docker/bookpath/import"

echo "📁 检测到的挂载目录："
echo "   - 数据目录: $DATA_DIR"
echo "   - 书籍目录: $BOOKS_DIR"
echo "   - 封面目录: $COVERS_DIR"
echo "   - 字体目录: $FONTS_DIR"
echo "   - 导入目录: $IMPORT_DIR"
echo ""

# 询问用户是否继续
read -p "是否继续修复这些目录的权限? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

echo ""
echo "🔧 开始修复..."
echo ""

# 创建目录结构
echo "1️⃣ 创建必要的目录结构..."
mkdir -p "$DATA_DIR"
mkdir -p "$BOOKS_DIR/public"
mkdir -p "$BOOKS_DIR/user"
mkdir -p "$BOOKS_DIR/.temp"
mkdir -p "$COVERS_DIR"
mkdir -p "$FONTS_DIR"
mkdir -p "$IMPORT_DIR"
echo "   ✅ 目录创建完成"

# 设置权限
echo ""
echo "2️⃣ 设置目录权限..."
chmod -R 777 "$DATA_DIR"
chmod -R 777 "$BOOKS_DIR"
chmod -R 777 "$COVERS_DIR"
chmod -R 777 "$FONTS_DIR"
chmod -R 777 "$IMPORT_DIR"
echo "   ✅ 权限设置完成"

# 验证权限
echo ""
echo "3️⃣ 验证权限设置..."
echo ""
echo "   数据目录权限："
ls -ld "$DATA_DIR"
echo ""
echo "   书籍目录权限："
ls -ld "$BOOKS_DIR"
ls -ld "$BOOKS_DIR/public" 2>/dev/null
ls -ld "$BOOKS_DIR/user" 2>/dev/null
echo ""
echo "   封面目录权限："
ls -ld "$COVERS_DIR"
echo ""
echo "   字体目录权限："
ls -ld "$FONTS_DIR"
echo ""
echo "   导入目录权限："
ls -ld "$IMPORT_DIR"

echo ""
echo "=================================="
echo "✅ 权限修复完成！"
echo "=================================="
echo ""
echo "📝 后续步骤："
echo "   1. 重启Docker容器："
echo "      docker-compose down"
echo "      docker-compose up -d"
echo ""
echo "   2. 查看日志确认："
echo "      docker-compose logs -f backend"
echo ""
echo "   3. 上传EPUB文件测试封面提取"
echo ""
echo "💡 提示："
echo "   - 如果问题仍然存在，请查看 DOCKER_TROUBLESHOOTING.md"
echo "   - 确保docker-compose.yml中配置了 user: \"0:0\""
echo ""
