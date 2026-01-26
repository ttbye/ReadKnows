#!/bin/sh
# 启动脚本：生成nginx配置（支持SSL证书自动检测）
# 注意：Ollama API 由后端直接调用，前端不需要代理

# 直接复制模板到配置目录
cp /etc/nginx/templates/default.conf.template /etc/nginx/conf.d/default.conf

# ========== 检测前端SSL证书（用于前端HTTPS 443端口） ==========
FRONTEND_SSL_CERT_FOUND=false
CERT_FILE=""
KEY_FILE=""

# 按优先级检查前端证书文件（支持多种命名格式）
if [ -f /etc/nginx/ssl/cert.pem ] && [ -f /etc/nginx/ssl/key.pem ]; then
    echo "✓ [前端] 检测到 cert.pem 和 key.pem，使用标准证书格式"
    CERT_FILE="cert.pem"
    KEY_FILE="key.pem"
    FRONTEND_SSL_CERT_FOUND=true
elif [ -f /etc/nginx/ssl/fullchain.pem ] && [ -f /etc/nginx/ssl/privkey.pem ]; then
    echo "✓ [前端] 检测到 fullchain.pem 和 privkey.pem，使用Let's Encrypt证书格式"
    CERT_FILE="fullchain.pem"
    KEY_FILE="privkey.pem"
    FRONTEND_SSL_CERT_FOUND=true
elif [ -f /etc/nginx/ssl/cert.crt ] && [ -f /etc/nginx/ssl/key.key ]; then
    echo "✓ [前端] 检测到 cert.crt 和 key.key，使用标准证书格式"
    CERT_FILE="cert.crt"
    KEY_FILE="key.key"
    FRONTEND_SSL_CERT_FOUND=true
elif [ -f /etc/nginx/ssl/cert.pem ] && [ -f /etc/nginx/ssl/key.key ]; then
    echo "✓ [前端] 检测到 cert.pem 和 key.key，使用混合证书格式"
    CERT_FILE="cert.pem"
    KEY_FILE="key.key"
    FRONTEND_SSL_CERT_FOUND=true
elif [ -f /etc/nginx/ssl/cert.crt ] && [ -f /etc/nginx/ssl/key.pem ]; then
    echo "✓ [前端] 检测到 cert.crt 和 key.pem，使用混合证书格式"
    CERT_FILE="cert.crt"
    KEY_FILE="key.pem"
    FRONTEND_SSL_CERT_FOUND=true
else
    # 尝试自动匹配证书文件（查找任何.pem或.crt文件作为证书，.key或.pem文件作为私钥）
    CERT_CANDIDATE=$(ls /etc/nginx/ssl/*.pem /etc/nginx/ssl/*.crt 2>/dev/null | grep -v key | grep -v privkey | head -1)
    KEY_CANDIDATE=$(ls /etc/nginx/ssl/*.key /etc/nginx/ssl/*.pem 2>/dev/null | grep -E "(key|privkey)" | head -1)
    
    if [ -n "$CERT_CANDIDATE" ] && [ -n "$KEY_CANDIDATE" ]; then
        CERT_FILE=$(basename "$CERT_CANDIDATE")
        KEY_FILE=$(basename "$KEY_CANDIDATE")
        echo "✓ [前端] 自动检测到证书文件: $CERT_FILE 和 $KEY_FILE"
        FRONTEND_SSL_CERT_FOUND=true
    fi
fi

# 如果前端证书不存在，自动生成自签名证书
if [ "$FRONTEND_SSL_CERT_FOUND" = false ]; then
    echo "⚠️  [前端] SSL证书文件不存在，将自动生成自签名证书用于本地测试"
    echo ""
    
    # 确保证书目录存在
    mkdir -p /etc/nginx/ssl
    
    # 检查证书目录是否可写
    SSL_DIR_WRITABLE=true
    if ! touch /etc/nginx/ssl/.write_test 2>/dev/null; then
        SSL_DIR_WRITABLE=false
        echo "⚠️  [前端] 证书目录是只读的（可能是只读挂载），将在临时目录生成证书"
        # 使用临时目录生成证书
        TEMP_SSL_DIR="/tmp/nginx-ssl"
        mkdir -p "$TEMP_SSL_DIR"
    else
        rm -f /etc/nginx/ssl/.write_test
        TEMP_SSL_DIR="/etc/nginx/ssl"
    fi
    
    # 生成自签名证书
    echo "正在生成自签名证书..."
    CERT_GEN_PATH="$TEMP_SSL_DIR/cert.pem"
    KEY_GEN_PATH="$TEMP_SSL_DIR/key.pem"
    
    if openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$KEY_GEN_PATH" \
        -out "$CERT_GEN_PATH" \
        -subj "/C=CN/ST=State/L=City/O=ReadKnows/CN=localhost" 2>/dev/null; then
        echo "✓ [前端] 自签名证书生成成功"
        
        # 如果证书生成在临时目录，尝试复制到挂载目录（如果可写）
        if [ "$SSL_DIR_WRITABLE" = false ]; then
            # 如果挂载目录不可写，使用临时目录的证书
            # 更新 nginx 配置使用临时目录的证书
            CERT_FILE="$CERT_GEN_PATH"
            KEY_FILE="$KEY_GEN_PATH"
            echo "⚠️  [前端] 证书生成在临时目录: $TEMP_SSL_DIR"
            echo "⚠️  [前端] 注意：容器重启后证书会丢失，建议在宿主机生成证书"
        else
            # 证书已生成在挂载目录
            CERT_FILE="cert.pem"
            KEY_FILE="key.pem"
        fi
        
        FRONTEND_SSL_CERT_FOUND=true
        echo "✓ [前端] HTTPS服务将启用（端口443，外部1243）"
        echo "⚠️  注意：这是自签名证书，浏览器会显示安全警告，这是正常的"
    else
        echo "❌ [前端] 自签名证书生成失败"
        echo "⚠️  [前端] HTTPS服务将无法启动，但HTTP服务仍可正常使用"
        echo "⚠️  [前端] 请检查 openssl 是否已安装，或手动在宿主机生成证书"
    fi
fi

# 如果找到前端证书，更新nginx配置
if [ "$FRONTEND_SSL_CERT_FOUND" = true ] && [ -n "$CERT_FILE" ] && [ -n "$KEY_FILE" ]; then
    echo "✓ [前端] 找到证书文件: $CERT_FILE 和 $KEY_FILE"
    
    # 如果证书路径是绝对路径（临时目录），直接使用
    # 如果是相对路径，需要加上 /etc/nginx/ssl/ 前缀
    if [ "${CERT_FILE#/}" != "$CERT_FILE" ]; then
        # 绝对路径
        CERT_PATH="$CERT_FILE"
        KEY_PATH="$KEY_FILE"
    else
        # 相对路径
        CERT_PATH="/etc/nginx/ssl/$CERT_FILE"
        KEY_PATH="/etc/nginx/ssl/$KEY_FILE"
    fi
    
    # 修改nginx配置中的证书路径
    sed -i "s|ssl_certificate /etc/nginx/ssl/cert.pem;|ssl_certificate $CERT_PATH;|g" /etc/nginx/conf.d/default.conf
    sed -i "s|ssl_certificate_key /etc/nginx/ssl/key.pem;|ssl_certificate_key $KEY_PATH;|g" /etc/nginx/conf.d/default.conf
    # 也处理可能存在的fullchain.pem配置
    sed -i "s|ssl_certificate /etc/nginx/ssl/fullchain.pem;|ssl_certificate $CERT_PATH;|g" /etc/nginx/conf.d/default.conf
    sed -i "s|ssl_certificate_key /etc/nginx/ssl/privkey.pem;|ssl_certificate_key $KEY_PATH;|g" /etc/nginx/conf.d/default.conf
    # 也处理其他可能的证书格式
    sed -i "s|ssl_certificate /etc/nginx/ssl/cert.crt;|ssl_certificate $CERT_PATH;|g" /etc/nginx/conf.d/default.conf
    sed -i "s|ssl_certificate_key /etc/nginx/ssl/key.key;|ssl_certificate_key $KEY_PATH;|g" /etc/nginx/conf.d/default.conf
    echo "✓ [前端] 已自动更新nginx配置使用证书: $CERT_PATH 和 $KEY_PATH"
fi

# ========== 检测后端SSL证书（用于决定是否使用HTTPS upstream） ==========
BACKEND_SSL_CERT_FOUND=false
# 后端证书路径（通过挂载的 volume，前端和后端共享同一个证书目录）
# 前端挂载到 /etc/nginx/ssl，后端挂载到 /app/data/ssl
# 由于共享同一个宿主机目录，前端检测 /etc/nginx/ssl 即可知道后端是否有证书
BACKEND_SSL_DIR="/etc/nginx/ssl"
# 检查后端证书文件（与前端证书检测逻辑一致）
if [ -f "$BACKEND_SSL_DIR/cert.pem" ] && [ -f "$BACKEND_SSL_DIR/key.pem" ]; then
    BACKEND_SSL_CERT_FOUND=true
    echo "✓ [后端] 检测到 cert.pem 和 key.pem，后端将启用HTTPS (1244)"
elif [ -f "$BACKEND_SSL_DIR/fullchain.pem" ] && [ -f "$BACKEND_SSL_DIR/privkey.pem" ]; then
    BACKEND_SSL_CERT_FOUND=true
    echo "✓ [后端] 检测到 fullchain.pem 和 privkey.pem，后端将启用HTTPS (1244)"
else
    # 如果前端已经生成了自签名证书，后端也应该使用相同的证书（通过共享的 volume）
    if [ "$FRONTEND_SSL_CERT_FOUND" = true ] && [ -f "$BACKEND_SSL_DIR/cert.pem" ] && [ -f "$BACKEND_SSL_DIR/key.pem" ]; then
        BACKEND_SSL_CERT_FOUND=true
        echo "✓ [后端] 使用前端生成的自签名证书，后端将启用HTTPS (1244)"
    else
        # 后端会在启动时自动生成证书（如果不存在）
        # 由于前端和后端共享同一个证书目录，后端应该能够使用前端生成的证书
        BACKEND_SSL_CERT_FOUND=true  # 假设后端会生成或使用前端生成的证书
        echo "✓ [后端] 后端将使用前端生成的证书或自动生成自签名证书，启用HTTPS (1244)"
    fi
fi

# ========== 根据后端证书情况动态配置 upstream ==========
# 策略：
# - 前端 HTTP (1280) 始终使用 HTTP upstream (后端 1281)
# - 前端 HTTPS (1243) 如果后端证书存在，使用 HTTPS upstream (后端 1244)；否则使用 HTTP upstream (后端 1281)
if [ "$BACKEND_SSL_CERT_FOUND" = true ]; then
    echo "✓ [后端] 检测到SSL证书，后端将启用HTTPS (1244)"
    echo "✓ [后端] 前端 HTTP (1280) 将连接到后端 HTTP (1281)"
    echo "✓ [后端] 前端 HTTPS (1243) 将连接到后端 HTTPS (1244)"
    
    # 只在 HTTPS server 块中将 proxy_pass http://backend_pool 替换为 https://backend_https_pool
    # 使用 awk 来跟踪 server 块的状态
    awk '
    BEGIN { in_https_block = 0; brace_count = 0 }
    /listen 443 ssl/ { 
        in_https_block = 1
        brace_count = 0
    }
    /\{/ { brace_count++ }
    /\}/ { 
        brace_count--
        if (brace_count == 0 && in_https_block) {
            in_https_block = 0
        }
    }
    in_https_block && /proxy_pass http:\/\/backend_pool;/ {
        gsub(/http:\/\/backend_pool/, "https://backend_https_pool")
    }
    { print }
    ' /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp
    mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf
    
    # 为 HTTPS server 块中的 HTTPS upstream 添加 SSL 验证配置（如果还没有）
    awk '
    BEGIN { in_https_block = 0; brace_count = 0 }
    /listen 443 ssl/ { 
        in_https_block = 1
        brace_count = 0
    }
    /\{/ { brace_count++ }
    /\}/ { 
        brace_count--
        if (brace_count == 0 && in_https_block) {
            in_https_block = 0
        }
    }
    in_https_block && /proxy_pass https:\/\/backend_https_pool;/ {
        print
        # 检查下一行是否已经有 proxy_ssl_verify
        getline next_line
        if (next_line !~ /proxy_ssl_verify/) {
            print "        proxy_ssl_verify off;"
            print "        proxy_ssl_verify_depth 0;"
        }
        print next_line
        next
    }
    { print }
    ' /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp
    mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf
    
    # 确保 HTTPS server 块中的 X-Forwarded-Proto 设置为 https
    awk '
    BEGIN { in_https_block = 0; brace_count = 0 }
    /listen 443 ssl/ { 
        in_https_block = 1
        brace_count = 0
    }
    /\{/ { brace_count++ }
    /\}/ { 
        brace_count--
        if (brace_count == 0 && in_https_block) {
            in_https_block = 0
        }
    }
    in_https_block && /proxy_set_header X-Forwarded-Proto \$scheme;/ {
        gsub(/\$scheme/, "https")
    }
    { print }
    ' /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp
    mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf
else
    echo "✓ [后端] 未检测到SSL证书，后端将只启用HTTP (1281)"
    echo "✓ [后端] 前端 HTTP (1280) 和 HTTPS (1243) 都将连接到后端 HTTP (1281)"
    # 确保所有 server 块都使用 HTTP upstream（已经是默认配置）
    # 确保 X-Forwarded-Proto 使用请求的实际协议
    sed -i 's|proxy_set_header X-Forwarded-Proto https;|proxy_set_header X-Forwarded-Proto $scheme;|g' /etc/nginx/conf.d/default.conf
fi

# 如果前端证书仍然不存在（生成失败），删除HTTPS server块
if [ "$FRONTEND_SSL_CERT_FOUND" = false ]; then
    echo "⚠️  [前端] HTTPS服务将无法启动（证书不存在且生成失败），但HTTP服务仍可正常使用"
    # 删除HTTPS server块
    HTTPS_START=$(grep -n "^# HTTPS 服务器" /etc/nginx/conf.d/default.conf | cut -d: -f1 | head -1)
    if [ -z "$HTTPS_START" ]; then
        HTTPS_START=$(grep -n "listen 443 ssl" /etc/nginx/conf.d/default.conf | cut -d: -f1 | head -1)
    fi
    if [ -n "$HTTPS_START" ]; then
        head -n $((HTTPS_START - 1)) /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp
        mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf
        echo "⚠️  [前端] 已删除HTTPS server块（证书不存在）"
    fi
fi

# ========== 验证证书和HTTPS配置（如果证书存在） ==========
if [ "$FRONTEND_SSL_CERT_FOUND" = "true" ]; then
    # 确保证书文件路径正确
    # 如果证书路径是绝对路径，直接使用；否则加上 /etc/nginx/ssl/ 前缀
    if [ "${CERT_FILE#/}" != "$CERT_FILE" ]; then
        CERT_CHECK_PATH="$CERT_FILE"
        KEY_CHECK_PATH="$KEY_FILE"
    else
        CERT_CHECK_PATH="/etc/nginx/ssl/$CERT_FILE"
        KEY_CHECK_PATH="/etc/nginx/ssl/$KEY_FILE"
    fi
    
    if [ ! -f "$CERT_CHECK_PATH" ] || [ ! -f "$KEY_CHECK_PATH" ]; then
        echo "❌ [前端] 错误: 证书文件路径不正确"
        echo "   期望: $CERT_CHECK_PATH 和 $KEY_CHECK_PATH"
        ls -la "$(dirname "$CERT_CHECK_PATH")" 2>/dev/null || echo "   证书目录不存在"
        echo "⚠️  [前端] 将禁用HTTPS服务"
        FRONTEND_SSL_CERT_FOUND=false
        # 删除HTTPS server块
        HTTPS_START=$(grep -n "^# HTTPS 服务器" /etc/nginx/conf.d/default.conf | cut -d: -f1 | head -1)
        if [ -z "$HTTPS_START" ]; then
            # 尝试匹配其他可能的注释格式
            HTTPS_START=$(grep -n "listen 443 ssl" /etc/nginx/conf.d/default.conf | cut -d: -f1 | head -1)
        fi
        if [ -n "$HTTPS_START" ]; then
            head -n $((HTTPS_START - 1)) /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp
            mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf
            echo "⚠️  [前端] 已删除HTTPS server块（证书文件不存在）"
        fi
    else
        echo "✓ [前端] 证书文件验证通过"
        echo "   证书路径: $CERT_CHECK_PATH"
        echo "   私钥路径: $KEY_CHECK_PATH"
        # 检查HTTPS server块是否存在
        if ! grep -q "listen 443 ssl" /etc/nginx/conf.d/default.conf; then
            echo "❌ [前端] 错误: HTTPS server块不存在！"
            echo "   这不应该发生，请检查nginx.conf模板"
            echo "   尝试从模板重新复制配置..."
            # 如果HTTPS server块不存在，尝试重新复制模板
            cp /etc/nginx/templates/default.conf.template /etc/nginx/conf.d/default.conf
            # 重新更新证书路径
            if [ -n "$CERT_FILE" ] && [ -n "$KEY_FILE" ]; then
                # 确定证书路径
                if [ "${CERT_FILE#/}" != "$CERT_FILE" ]; then
                    CERT_PATH="$CERT_FILE"
                    KEY_PATH="$KEY_FILE"
                else
                    CERT_PATH="/etc/nginx/ssl/$CERT_FILE"
                    KEY_PATH="/etc/nginx/ssl/$KEY_FILE"
                fi
                sed -i "s|ssl_certificate /etc/nginx/ssl/cert.pem;|ssl_certificate $CERT_PATH;|g" /etc/nginx/conf.d/default.conf
                sed -i "s|ssl_certificate_key /etc/nginx/ssl/key.pem;|ssl_certificate_key $KEY_PATH;|g" /etc/nginx/conf.d/default.conf
                sed -i "s|ssl_certificate /etc/nginx/ssl/fullchain.pem;|ssl_certificate $CERT_PATH;|g" /etc/nginx/conf.d/default.conf
                sed -i "s|ssl_certificate_key /etc/nginx/ssl/privkey.pem;|ssl_certificate_key $KEY_PATH;|g" /etc/nginx/conf.d/default.conf
            fi
            # 重新配置后端 upstream
            if [ "$BACKEND_SSL_CERT_FOUND" = true ]; then
                sed -i 's|proxy_pass http://backend_pool;|proxy_pass https://backend_https_pool;|g' /etc/nginx/conf.d/default.conf
            fi
            FRONTEND_SSL_CERT_FOUND=true
            echo "✓ [前端] 已重新生成nginx配置"
        else
            echo "✓ [前端] HTTPS server块已存在，配置正确"
        fi
    fi
fi

# ========== 总结配置状态 ==========
echo ""
echo "========== SSL配置总结 =========="
if [ "$FRONTEND_SSL_CERT_FOUND" = "true" ]; then
    echo "✓ [前端] HTTPS已启用（端口443，外部1243）"
else
    echo "⚠️  [前端] HTTPS已禁用（证书不存在）"
fi
echo "✓ [前端] HTTP已启用（端口80，外部1280）"
if [ "$BACKEND_SSL_CERT_FOUND" = "true" ]; then
    echo "✓ [后端] 使用HTTPS连接（端口1244）"
else
    echo "✓ [后端] 使用HTTP连接（端口1281）"
fi
echo "=================================="
echo ""

echo "✓ nginx配置生成成功"

# 修复静态文件权限，确保nginx可以读取（特别是PWA图标文件）
chmod 644 /usr/share/nginx/html/*.png /usr/share/nginx/html/*.svg /usr/share/nginx/html/*.ico /usr/share/nginx/html/*.html 2>/dev/null || true
chmod 755 /usr/share/nginx/html 2>/dev/null || true

# 测试nginx配置
echo "测试nginx配置..."
if nginx -t 2>&1; then
    echo "✓ nginx配置测试通过"
    if [ "$FRONTEND_SSL_CERT_FOUND" = "true" ]; then
        echo "✓ [前端] HTTPS服务已启用（端口443，外部1243）"
    else
        echo "⚠️  [前端] HTTPS服务已禁用（证书不存在）"
    fi
    echo "✓ [前端] HTTP服务已启用（端口80，外部1280）"
    if [ "$BACKEND_SSL_CERT_FOUND" = "true" ]; then
        echo "✓ [后端] 使用HTTPS连接（端口1244）"
    else
        echo "✓ [后端] 使用HTTP连接（端口1281）"
    fi
    if [ "$FRONTEND_SSL_CERT_FOUND" = "false" ]; then
        echo "⚠️  [前端] HTTPS服务已禁用（证书生成失败）"
        echo "⚠️  [前端] 请将SSL证书文件放在宿主机 <DATA_DIR>/data/ssl/ 目录下，然后重启容器以启用HTTPS"
    fi
else
    echo "❌ nginx配置测试失败！"
    echo "错误详情："
    nginx -t 2>&1
    echo ""
    echo "当前配置文件内容（最后50行）："
    tail -50 /etc/nginx/conf.d/default.conf
    exit 1
fi

# 启动nginx
echo "启动nginx..."
exec nginx -g 'daemon off;'
