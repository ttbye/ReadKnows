#!/bin/bash

# 快速修复JWT_SECRET脚本

echo "=========================================="
echo "JWT_SECRET快速修复工具"
echo "=========================================="
echo ""

# 生成随机密钥
echo "1. 生成随机JWT_SECRET..."
NEW_SECRET=$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
echo "生成的密钥: $NEW_SECRET"
echo ""

# 检查docker-compose.yml
COMPOSE_FILE="../sh/docker-compose.yml"
if [ -f "$COMPOSE_FILE" ]; then
    echo "2. 检查docker-compose.yml..."
    CURRENT_SECRET=$(grep "JWT_SECRET" "$COMPOSE_FILE" | head -1)
    echo "当前配置: $CURRENT_SECRET"
    echo ""
    
    echo "3. 更新docker-compose.yml..."
    # 备份原文件
    cp "$COMPOSE_FILE" "$COMPOSE_FILE.bak"
    
    # 替换JWT_SECRET行
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|JWT_SECRET=\${JWT_SECRET:-.*}|JWT_SECRET=\${JWT_SECRET:-$NEW_SECRET}|" "$COMPOSE_FILE"
    else
        # Linux
        sed -i "s|JWT_SECRET=\${JWT_SECRET:-.*}|JWT_SECRET=\${JWT_SECRET:-$NEW_SECRET}|" "$COMPOSE_FILE"
    fi
    
    echo "✅ docker-compose.yml已更新"
    echo "   备份文件: $COMPOSE_FILE.bak"
else
    echo "⚠️  未找到docker-compose.yml，请手动设置JWT_SECRET"
fi

echo ""
echo "4. 检查.env文件..."
ENV_FILE="../.env"
if [ -f "$ENV_FILE" ]; then
    if grep -q "JWT_SECRET" "$ENV_FILE"; then
        echo "✅ .env文件中已有JWT_SECRET配置"
    else
        echo "添加JWT_SECRET到.env文件..."
        echo "" >> "$ENV_FILE"
        echo "# JWT配置" >> "$ENV_FILE"
        echo "JWT_SECRET=$NEW_SECRET" >> "$ENV_FILE"
        echo "✅ 已添加到.env文件"
    fi
else
    echo "创建.env文件..."
    cat > "$ENV_FILE" << EOF
# JWT配置
JWT_SECRET=$NEW_SECRET
JWT_EXPIRES_IN=7d
EOF
    echo "✅ 已创建.env文件"
fi

echo ""
echo "=========================================="
echo "修复完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 重启后端服务:"
echo "   cd ../sh && docker-compose restart backend"
echo ""
echo "2. 或者重新构建:"
echo "   cd ../sh && docker-compose up -d --build backend"
echo ""
echo "3. 验证修复:"
echo "   docker logs readknows-backend | grep JWT_SECRET"
echo ""
