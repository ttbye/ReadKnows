#!/bin/bash

# 自动导入功能测试脚本

echo "=================================="
echo "自动导入功能测试"
echo "=================================="
echo ""

# 检查是否在正确的目录
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# 检查docker-compose是否运行
if ! docker-compose ps | grep -q "knowbooks-backend.*Up"; then
    echo "❌ 后端容器未运行，请先启动："
    echo "   docker-compose up -d"
    exit 1
fi

echo "✅ 后端容器正在运行"
echo ""

# 设置import目录路径
IMPORT_DIR="/volume5/docker/bookpath/import"

# 检查import目录
if [ ! -d "$IMPORT_DIR" ]; then
    echo "⚠️  import目录不存在: $IMPORT_DIR"
    read -p "是否创建目录? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo mkdir -p "$IMPORT_DIR"
        sudo chmod 777 "$IMPORT_DIR"
        echo "✅ 已创建import目录"
    else
        echo "❌ 已取消"
        exit 1
    fi
fi

echo "✅ import目录存在: $IMPORT_DIR"
echo ""

# 检查权限
if [ ! -w "$IMPORT_DIR" ]; then
    echo "⚠️  import目录不可写"
    read -p "是否修复权限? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo chmod 777 "$IMPORT_DIR"
        echo "✅ 已修复权限"
    else
        echo "❌ 已取消"
        exit 1
    fi
fi

echo "✅ import目录可写"
echo ""

# 创建测试文件
echo "📝 创建测试文件..."
TEST_FILE="$IMPORT_DIR/test-book-$(date +%s).txt"
cat > "$TEST_FILE" << 'TESTBOOK'
这是一本测试书籍

第一章
这是第一章的内容。

第二章
这是第二章的内容。
TESTBOOK

echo "✅ 测试文件已创建: $(basename $TEST_FILE)"
echo ""

# 显示文件信息
echo "📁 文件信息:"
ls -lh "$TEST_FILE"
echo ""

echo "⏳ 等待自动导入（预计5-10秒）..."
echo "   正在监控日志..."
echo ""

# 监控日志（最多等待30秒）
TIMEOUT=30
COUNTER=0

docker-compose logs --tail=0 -f backend &
LOG_PID=$!

while [ $COUNTER -lt $TIMEOUT ]; do
    # 检查文件是否还存在
    if [ ! -f "$TEST_FILE" ]; then
        echo ""
        echo "✅ 测试文件已被删除（导入成功）"
        kill $LOG_PID 2>/dev/null
        break
    fi
    
    sleep 1
    COUNTER=$((COUNTER + 1))
    
    if [ $COUNTER -eq $TIMEOUT ]; then
        echo ""
        echo "⚠️  等待超时（30秒）"
        kill $LOG_PID 2>/dev/null
        
        if [ -f "$TEST_FILE" ]; then
            echo "❌ 文件仍然存在，可能导入失败"
            echo ""
            echo "💡 故障排除建议："
            echo "   1. 查看后端日志："
            echo "      docker-compose logs backend | grep \"文件监控\\|自动导入\""
            echo ""
            echo "   2. 检查服务状态："
            echo "      docker-compose logs backend | grep \"启动自动导入服务\""
            echo ""
            echo "   3. 手动清理测试文件："
            echo "      rm $TEST_FILE"
            echo ""
            exit 1
        fi
    fi
done

echo ""
echo "=================================="
echo "✅ 测试完成"
echo "=================================="
echo ""
echo "📊 查看导入统计："
echo "   http://localhost:1280"
echo ""
echo "📖 详细文档："
echo "   cat AUTO_IMPORT.md"
echo ""
