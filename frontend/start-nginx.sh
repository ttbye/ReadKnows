#!/bin/sh
# 启动脚本：解析OLLAMA_URL并生成nginx配置

# 默认值
OLLAMA_URL=${OLLAMA_URL:-http://host.docker.internal:11434}

# 解析URL，提取协议、主机和端口
# 支持格式：http://host:port 或 https://host:port
if echo "$OLLAMA_URL" | grep -qE '^https?://[^:]+:[0-9]+'; then
    # 提取协议
    PROTOCOL=$(echo "$OLLAMA_URL" | sed -E 's|^([^:]+)://.*|\1|')
    # 提取主机和端口（移除协议前缀）
    HOST_PORT=$(echo "$OLLAMA_URL" | sed -E 's|^[^:]+://||')
    # 提取主机
    OLLAMA_HOST=$(echo "$HOST_PORT" | sed -E 's|:.*||')
    # 提取端口
    OLLAMA_PORT=$(echo "$HOST_PORT" | sed -E 's|.*:||')
else
    # 如果格式不正确，尝试解析
    # 移除协议前缀（如果有）
    HOST_PORT=$(echo "$OLLAMA_URL" | sed -E 's|^[^:]+://||')
    if echo "$HOST_PORT" | grep -qE '^[^:]+:[0-9]+'; then
        OLLAMA_HOST=$(echo "$HOST_PORT" | sed -E 's|:.*||')
        OLLAMA_PORT=$(echo "$HOST_PORT" | sed -E 's|.*:||')
        PROTOCOL="http"
    else
        # 如果没有端口，使用默认端口11434
        OLLAMA_HOST="$HOST_PORT"
        OLLAMA_PORT="11434"
        PROTOCOL="http"
    fi
fi

echo "解析OLLAMA_URL: $OLLAMA_URL"
echo "协议: $PROTOCOL"
echo "主机: $OLLAMA_HOST"
echo "端口: $OLLAMA_PORT"

# 生成nginx配置，替换OLLAMA_HOST和OLLAMA_PORT
export OLLAMA_HOST
export OLLAMA_PORT
envsubst '${OLLAMA_HOST} ${OLLAMA_PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# 修复静态文件权限，确保nginx可以读取（特别是PWA图标文件）
chmod 644 /usr/share/nginx/html/*.png /usr/share/nginx/html/*.svg /usr/share/nginx/html/*.ico /usr/share/nginx/html/*.html 2>/dev/null || true
chmod 755 /usr/share/nginx/html 2>/dev/null || true

# 启动nginx
exec nginx -g 'daemon off;'

