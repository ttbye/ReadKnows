#!/bin/bash

# 添加作者信息到所有源代码文件
# Author: ttbye

AUTHOR="ttbye"
YEAR=$(date +%Y)

echo "=========================================="
echo "为所有源代码文件添加作者信息"
echo "作者: $AUTHOR"
echo "=========================================="
echo ""

# 函数：为文件添加作者信息
add_author_to_file() {
    local file=$1
    local ext="${file##*.}"
    
    # 检查文件是否已经有作者信息
    if head -20 "$file" 2>/dev/null | grep -qi "@author.*ttbye\|Author.*ttbye"; then
        echo "跳过: $file (已有作者信息)"
        return 0
    fi
    
    # 创建临时文件
    local tmpfile="${file}.tmp"
    
    # 根据文件类型选择注释风格
    case "$ext" in
        ts|tsx|js)
            # 检查文件第一行是否是 shebang 或已有注释
            local first_line=$(head -1 "$file" 2>/dev/null)
            
            if [[ "$first_line" == \#!* ]]; then
                # 有 shebang，在第二行后添加
                {
                    head -1 "$file"
                    echo ""
                    echo "/**"
                    echo " * @file $(basename $file)"
                    echo " * @author $AUTHOR"
                    echo " * @date $(date +%Y-%m-%d)"
                    echo " */"
                    tail -n +2 "$file"
                } > "$tmpfile"
            elif [[ "$first_line" == "/**"* ]] || [[ "$first_line" == "//"* ]]; then
                # 已有注释，在注释块后添加作者信息
                {
                    head -1 "$file"
                    echo " * @author $AUTHOR"
                    tail -n +2 "$file"
                } > "$tmpfile"
            else
                # 普通文件，在顶部添加
                {
                    echo "/**"
                    echo " * @file $(basename $file)"
                    echo " * @author $AUTHOR"
                    echo " * @date $(date +%Y-%m-%d)"
                    echo " */"
                    echo ""
                    cat "$file"
                } > "$tmpfile"
            fi
            
            # 替换原文件
            mv "$tmpfile" "$file"
            echo "✓ 已添加: $file"
            return 0
            ;;
        *)
            echo "跳过: $file (不支持的文件类型: $ext)"
            return 1
            ;;
    esac
}

# 统计
total=0
added=0
skipped=0

# 处理后端文件
echo "处理后端文件..."
echo "----------------------------------------"
while read file; do
    total=$((total + 1))
    if add_author_to_file "$file"; then
        added=$((added + 1))
    else
        skipped=$((skipped + 1))
    fi
done < <(find backend/src -type f \( -name "*.ts" -o -name "*.js" \) ! -path "*/node_modules/*")

# 处理前端文件
echo ""
echo "处理前端文件..."
echo "----------------------------------------"
while read file; do
    total=$((total + 1))
    if add_author_to_file "$file"; then
        added=$((added + 1))
    else
        skipped=$((skipped + 1))
    fi
done < <(find frontend/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) ! -path "*/node_modules/*" ! -path "*/dist/*")

# 处理脚本文件
echo ""
echo "处理脚本文件..."
echo "----------------------------------------"
while read file; do
    total=$((total + 1))
    if add_author_to_file "$file"; then
        added=$((added + 1))
    else
        skipped=$((skipped + 1))
    fi
done < <(find backend/scripts -type f -name "*.js" 2>/dev/null)

echo ""
echo "=========================================="
echo "完成！"
echo "总计: $total 个文件"
echo "已添加: $added 个文件"
echo "已跳过: $skipped 个文件"
echo "=========================================="
