#!/bin/bash

# 修复健康检查配置脚本

set -e

echo "=========================================="
echo "修复 Docker 健康检查配置"
echo "=========================================="

# 检查并修复 docker-compose.yml
if [ -f "docker-compose.yml" ]; then
    echo "检查 docker-compose.yml..."
    
    # 检查是否有错误的健康检查配置
    if grep -q "localhost:1201" docker-compose.yml; then
        echo "发现错误的健康检查配置，正在修复..."
        sed -i.bak 's/localhost:1201/localhost:3001/g' docker-compose.yml
        echo "✓ 已修复 docker-compose.yml"
        echo "备份文件: docker-compose.yml.bak"
    else
        echo "✓ docker-compose.yml 配置正确"
    fi
fi

# 检查并修复 docker-compose.prod.yml
if [ -f "docker-compose.prod.yml" ]; then
    echo "检查 docker-compose.prod.yml..."
    
    if grep -q "localhost:1201" docker-compose.prod.yml; then
        echo "发现错误的健康检查配置，正在修复..."
        sed -i.bak 's/localhost:1201/localhost:3001/g' docker-compose.prod.yml
        echo "✓ 已修复 docker-compose.prod.yml"
        echo "备份文件: docker-compose.prod.yml.bak"
    else
        echo "✓ docker-compose.prod.yml 配置正确"
    fi
fi

echo ""
echo "=========================================="
echo "修复完成！"
echo "=========================================="
echo ""
echo "请执行以下命令重启容器："
echo "  docker-compose down"
echo "  docker-compose up -d"
echo ""

