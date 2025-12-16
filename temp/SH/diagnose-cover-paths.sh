#!/bin/bash

echo "================================================"
echo "封面路径诊断工具"
echo "================================================"
echo ""

# 检查是否在Docker环境
if [ -f "/.dockerenv" ]; then
    echo "✅ 运行在Docker容器中"
    IN_DOCKER=1
else
    echo "ℹ️  运行在本地环境"
    IN_DOCKER=0
fi

echo ""
echo "🔍 检查数据库中的封面URL..."
echo ""

# 检查数据库
if [ $IN_DOCKER -eq 1 ]; then
    # Docker环境
    DB_PATH="/app/data/database.db"
    BOOKS_DIR="/app/books"
else
    # 本地环境
    DB_PATH="backend/data/database.db"
    BOOKS_DIR="backend/books"
fi

if [ ! -f "$DB_PATH" ]; then
    echo "❌ 数据库文件不存在: $DB_PATH"
    exit 1
fi

echo "数据库路径: $DB_PATH"
echo "书籍目录: $BOOKS_DIR"
echo ""

# 查询封面URL
sqlite3 "$DB_PATH" << 'EOF'
.mode column
.headers on
.width 40 60 10

SELECT 
    title as '书名',
    cover_url as '封面URL',
    CASE 
        WHEN cover_url IS NULL THEN '❌'
        WHEN cover_url = 'cover' THEN '⚠️'
        WHEN cover_url = 'pdf-cover' THEN '⚠️'
        WHEN cover_url LIKE '/books/%' THEN '✅'
        ELSE '?'
    END as '状态'
FROM books 
WHERE uploader_id IS NULL 
ORDER BY created_at DESC 
LIMIT 10;
EOF

echo ""
echo "================================================"
echo "🔍 检查实际文件..."
echo ""

# 检查封面文件是否存在
sqlite3 "$DB_PATH" "SELECT cover_url FROM books WHERE uploader_id IS NULL AND cover_url LIKE '/books/%' LIMIT 10" | while read cover_url; do
    if [ -n "$cover_url" ]; then
        # 去掉/books/前缀
        rel_path="${cover_url#/books/}"
        full_path="$BOOKS_DIR/$rel_path"
        
        echo "封面URL: $cover_url"
        echo "完整路径: $full_path"
        
        if [ -f "$full_path" ]; then
            echo "✅ 文件存在"
            ls -lh "$full_path"
        else
            echo "❌ 文件不存在"
            
            # 尝试查找实际文件
            dir_path=$(dirname "$full_path")
            if [ -d "$dir_path" ]; then
                echo "📁 目录内容:"
                ls -la "$dir_path" | grep -i cover || echo "  未找到cover文件"
            else
                echo "❌ 目录不存在: $dir_path"
            fi
        fi
        echo ""
    fi
done

echo "================================================"
echo "💡 诊断建议"
echo "================================================"
echo ""

# 分析问题
HAS_CHINESE=$(sqlite3 "$DB_PATH" "SELECT cover_url FROM books WHERE cover_url LIKE '%[一-龥]%' LIMIT 1")

if [ -n "$HAS_CHINESE" ]; then
    echo "⚠️  检测到中文路径"
    echo ""
    echo "问题可能原因："
    echo "  1. URL编码问题 - 中文字符需要正确编码"
    echo "  2. 路径分隔符 - Windows风格的反斜杠"
    echo "  3. Docker挂载点权限问题"
    echo ""
    echo "建议修复："
    echo "  1. 重新构建前端: cd frontend && npm run build"
    echo "  2. 重新部署Docker: docker-compose build --no-cache"
    echo "  3. 检查Nginx配置（如果使用）"
    echo ""
else
    echo "✅ 未检测到中文路径"
    echo ""
    echo "如果封面仍然不显示，可能是："
    echo "  1. 浏览器缓存问题 - 清除缓存"
    echo "  2. 权限问题 - 检查文件权限"
    echo "  3. 网络问题 - 检查网络连接"
fi

echo ""
echo "📝 测试URL编码:"
echo ""

# 测试URL编码
TEST_URL="/books/public/test/封面.jpg"
ENCODED_URL=$(node -e "console.log('$TEST_URL'.split('/').map(p => p ? encodeURIComponent(p) : '').join('/'))")
echo "原始URL: $TEST_URL"
echo "编码后: $ENCODED_URL"

echo ""
echo "================================================"
