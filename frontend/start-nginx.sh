#!/bin/sh
# 启动脚本：生成nginx配置
# 注意：Ollama 地址现在只在系统后台管理中配置，不再使用环境变量

# 直接复制模板到配置目录（不再需要替换 OLLAMA_HOST 和 OLLAMA_PORT）
cp /etc/nginx/templates/default.conf.template /etc/nginx/conf.d/default.conf

echo "✓ nginx配置生成成功"

# 修复静态文件权限，确保nginx可以读取（特别是PWA图标文件）
chmod 644 /usr/share/nginx/html/*.png /usr/share/nginx/html/*.svg /usr/share/nginx/html/*.ico /usr/share/nginx/html/*.html 2>/dev/null || true
chmod 755 /usr/share/nginx/html 2>/dev/null || true

# 启动nginx
exec nginx -g 'daemon off;'

