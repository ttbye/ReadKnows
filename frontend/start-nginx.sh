#!/bin/sh
# 启动脚本：生成nginx配置
# 注意：Ollama API 由后端直接调用，前端不需要代理

# 直接复制模板到配置目录
cp /etc/nginx/templates/default.conf.template /etc/nginx/conf.d/default.conf

# 检查SSL证书文件是否存在
if [ ! -f /etc/nginx/ssl/cert.pem ] && [ ! -f /etc/nginx/ssl/fullchain.pem ]; then
    echo "⚠️  警告: SSL证书文件不存在 (/etc/nginx/ssl/cert.pem 或 /etc/nginx/ssl/fullchain.pem)"
    echo "⚠️  HTTPS服务可能无法启动，请确保证书文件已挂载到容器中"
    echo "⚠️  证书文件应放在宿主机 /volume5/docker/ReadKnows/data/ssl/ 目录下"
    echo "⚠️  文件应命名为 cert.pem 和 key.pem (或 fullchain.pem 和 privkey.pem)"
else
    echo "✓ SSL证书文件检查通过"
fi

echo "✓ nginx配置生成成功"

# 修复静态文件权限，确保nginx可以读取（特别是PWA图标文件）
chmod 644 /usr/share/nginx/html/*.png /usr/share/nginx/html/*.svg /usr/share/nginx/html/*.ico /usr/share/nginx/html/*.html 2>/dev/null || true
chmod 755 /usr/share/nginx/html 2>/dev/null || true

# 启动nginx
exec nginx -g 'daemon off;'

