#!/bin/bash

echo "=================================="
echo "Docker 镜像源问题修复指南"
echo "=================================="
echo ""
echo "检测到 Docker 配置了以下镜像源："
docker info | grep -A 2 "Registry Mirrors"
echo ""
echo "这些镜像源目前无法访问，导致构建失败。"
echo ""
echo "📝 请按以下步骤修复："
echo ""
echo "1. 打开 Docker Desktop"
echo "2. 点击右上角的齿轮图标（设置）"
echo "3. 选择左侧的 'Docker Engine'"
echo "4. 找到 'registry-mirrors' 配置"
echo "5. 删除或注释掉无法访问的镜像源"
echo ""
echo "原配置类似："
echo '{'
echo '  "registry-mirrors": ['
echo '    "https://docker.mirrors.tuna.tsinghua.edu.cn/",'
echo '    "https://hub-mirror.c.163.com/"'
echo '  ]'
echo '}'
echo ""
echo "修改为（使用官方源）："
echo '{'
echo '  "registry-mirrors": []'
echo '}'
echo ""
echo "或者使用其他可用的镜像源（如阿里云）："
echo '{'
echo '  "registry-mirrors": ['
echo '    "https://mirror.ccs.tencentyun.com"'
echo '  ]'
echo '}'
echo ""
echo "6. 点击 'Apply & Restart' 按钮"
echo "7. 等待 Docker 重启完成"
echo ""
echo "然后重新运行："
echo "  docker-compose build --no-cache"
echo "  docker-compose up -d"
echo ""
