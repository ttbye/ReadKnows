#!/bin/bash

# 检查书籍封面状态的诊断脚本

echo "=================================="
echo "书籍封面状态检查工具"
echo "=================================="
echo ""

# 检查是否在正确的目录
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# 检查docker-compose是否运行
if ! docker-compose ps | grep -q "knowbooks-backend.*Up"; then
    echo "❌ 后端容器未运行"
    echo ""
    echo "💡 提示：如果是本地开发环境，请直接查看："
    echo "   backend/data/database.db"
    exit 1
fi

echo "📊 正在检查数据库中的封面状态..."
echo ""

# 在容器中执行SQL查询
docker-compose exec -T backend node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/database.db', { readonly: true });

console.log('=== 最近导入的书籍（最多10本）===\n');

const books = db.prepare(\`
  SELECT id, title, author, cover_url, file_path, created_at
  FROM books
  WHERE uploader_id IS NULL
  ORDER BY created_at DESC
  LIMIT 10
\`).all();

if (books.length === 0) {
  console.log('❌ 没有找到通过自动导入的书籍');
  console.log('');
  console.log('💡 提示：');
  console.log('   - 自动导入的书籍 uploader_id 为 NULL');
  console.log('   - 请确认已有书籍通过 import 目录导入');
} else {
  books.forEach((book, index) => {
    console.log(\`\${index + 1}. 书名：\${book.title}\`);
    console.log(\`   作者：\${book.author}\`);
    console.log(\`   封面URL：\${book.cover_url || '❌ 无'}\`);
    console.log(\`   文件路径：\${book.file_path}\`);
    console.log(\`   导入时间：\${book.created_at}\`);
    
    // 检查封面文件是否存在
    if (book.cover_url) {
      const fs = require('fs');
      const path = require('path');
      
      if (book.cover_url.startsWith('/books/')) {
        // 相对路径
        const coverPath = path.join('./books', book.cover_url.replace('/books/', ''));
        if (fs.existsSync(coverPath)) {
          const stats = fs.statSync(coverPath);
          console.log(\`   封面文件：✅ 存在 (\${(stats.size / 1024).toFixed(2)} KB)\`);
        } else {
          console.log(\`   封面文件：❌ 不存在 (\${coverPath})\`);
        }
      } else if (book.cover_url === 'cover' || book.cover_url === 'pdf-cover') {
        console.log(\`   封面文件：⚠️  占位符未替换 (\${book.cover_url})\`);
      } else {
        console.log(\`   封面URL：\${book.cover_url}\`);
      }
    } else {
      console.log(\`   封面文件：❌ cover_url 为空\`);
    }
    console.log('');
  });
}

console.log('');
console.log('=== 封面状态统计 ===\n');

const stats = db.prepare(\`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN cover_url IS NOT NULL AND cover_url != 'cover' AND cover_url != 'pdf-cover' THEN 1 ELSE 0 END) as with_cover,
    SUM(CASE WHEN cover_url IS NULL THEN 1 ELSE 0 END) as no_cover,
    SUM(CASE WHEN cover_url = 'cover' OR cover_url = 'pdf-cover' THEN 1 ELSE 0 END) as placeholder
  FROM books
  WHERE uploader_id IS NULL
\`).get();

console.log(\`总计：\${stats.total} 本书\`);
console.log(\`有封面：\${stats.with_cover} 本 (\${((stats.with_cover / stats.total) * 100).toFixed(1)}%)\`);
console.log(\`无封面：\${stats.no_cover} 本 (\${((stats.no_cover / stats.total) * 100).toFixed(1)}%)\`);
console.log(\`占位符：\${stats.placeholder} 本 (\${((stats.placeholder / stats.total) * 100).toFixed(1)}%)\`);

db.close();
"

echo ""
echo "=================================="
echo "检查完成"
echo "=================================="
echo ""
echo "💡 问题诊断："
echo ""
echo "1. 如果看到 '占位符未替换'："
echo "   - 说明封面提取失败"
echo "   - 查看日志：docker-compose logs backend | grep \"EPUB封面提取\""
echo ""
echo "2. 如果看到 'cover_url 为空'："
echo "   - 可能是EPUB文件中没有封面"
echo "   - 或者封面提取过程出错"
echo ""
echo "3. 如果看到 '封面文件不存在'："
echo "   - cover_url保存了但文件被删除"
echo "   - 检查目录权限：ls -la /volume5/docker/bookpath/books/public/"
echo ""
echo "4. 修复建议："
echo "   - 删除有问题的书籍，重新导入"
echo "   - 或手动上传封面：前端界面 -> 书籍详情 -> 上传封面"
echo ""
