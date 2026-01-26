#!/bin/bash

# 多服务器 APK 构建脚本
# 支持为不同服务器构建不同包名的 APK，可以同时安装在同一设备上
# 使用方法: ./build-apk-multi.sh <配置名称> [debug|release]
#
# 示例:
#   ./build-apk-multi.sh server1 debug
#   ./build-apk-multi.sh server2 release
#
# 配置文件: frontend/apk-profiles.json
# 格式:
# {
#   "server1": {
#     "applicationId": "com.readknows.server1",
#     "appName": "ReadKnows Server1",
#     "apiUrl": "https://server1.example.com",
#     "apiKey": "key1",
#     "keystoreFile": "server1-key.jks",
#     "keystorePassword": "password1",
#     "keyAlias": "server1",
#     "keyPassword": "password1"
#   },
#   "server2": {
#     "applicationId": "com.readknows.server2",
#     "appName": "ReadKnows Server2",
#     "apiUrl": "https://server2.example.com",
#     "apiKey": "key2",
#     "keystoreFile": "server2-key.jks",
#     "keystorePassword": "password2",
#     "keyAlias": "server2",
#     "keyPassword": "password2"
#   }
# }

set -e

PROFILE_NAME=${1:-default}
BUILD_TYPE=${2:-debug}

if [ -z "$PROFILE_NAME" ]; then
    echo "❌ 错误: 请指定配置名称"
    echo ""
    echo "使用方法:"
    echo "  ./build-apk-multi.sh <配置名称> [debug|release]"
    echo ""
    echo "示例:"
    echo "  ./build-apk-multi.sh server1 debug"
    echo "  ./build-apk-multi.sh server2 release"
    echo ""
    echo "配置文件: frontend/apk-profiles.json"
    exit 1
fi

# 进入前端目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 配置文件路径
PROFILES_FILE="apk-profiles.json"

if [ ! -f "$PROFILES_FILE" ]; then
    echo "❌ 配置文件不存在: $PROFILES_FILE"
    echo ""
    echo "请创建配置文件，格式如下:"
    cat << 'EOF'
{
  "server1": {
    "applicationId": "com.readknows.server1",
    "appName": "ReadKnows Server1",
    "appIconPath": "./readknows-sw.png",
    "apiUrl": "https://server1.example.com",
    "apiKey": "key1",
    "keystoreFile": "server1-key.jks",
    "keystorePassword": "password1",
    "keyAlias": "server1",
    "keyPassword": "password1"
  },
  "server2": {
    "applicationId": "com.readknows.server2",
    "appName": "ReadKnows Server2",
    "appIconPath": "./readknows-sw.png",
    "apiUrl": "https://server2.example.com",
    "apiKey": "key2",
    "keystoreFile": "server2-key.jks",
    "keystorePassword": "password2",
    "keyAlias": "server2",
    "keyPassword": "password2"
  }
}
EOF
    exit 1
fi

# 检查 Node.js 是否可用（用于解析 JSON）
if ! command -v node >/dev/null 2>&1; then
    echo "❌ 错误: 需要 Node.js 来解析配置文件"
    exit 1
fi

# 读取配置
echo "📋 读取配置: $PROFILE_NAME"
CONFIG_JSON=$(node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$PROFILES_FILE', 'utf8'));
if (!config['$PROFILE_NAME']) {
    console.error('配置不存在: $PROFILE_NAME');
    process.exit(1);
}
console.log(JSON.stringify(config['$PROFILE_NAME']));
")

if [ $? -ne 0 ]; then
    echo "❌ 配置 '$PROFILE_NAME' 不存在"
    exit 1
fi

# 解析配置
APPLICATION_ID=$(echo "$CONFIG_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf8')).applicationId)")
APP_NAME=$(echo "$CONFIG_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf8')).appName || 'ReadKnows')")
APP_ICON_PATH=$(echo "$CONFIG_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf8')).appIconPath || './readknows-sw.png')")
API_URL=$(echo "$CONFIG_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf8')).apiUrl || '')")
API_KEY=$(echo "$CONFIG_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf8')).apiKey || '')")
KEYSTORE_FILE=$(echo "$CONFIG_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf8')).keystoreFile || '')")
KEYSTORE_PASSWORD=$(echo "$CONFIG_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf8')).keystorePassword || '')")
KEY_ALIAS=$(echo "$CONFIG_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf8')).keyAlias || '')")
KEY_PASSWORD=$(echo "$CONFIG_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf8')).keyPassword || '')")

echo "✅ 配置读取成功:"
echo "   包名 (applicationId): $APPLICATION_ID"
echo "   应用名称: $APP_NAME"
echo "   应用图标: $APP_ICON_PATH"
echo "   API 地址: ${API_URL:-未设置}"
echo "   密钥库文件: ${KEYSTORE_FILE:-未设置}"

# 验证必需配置
if [ -z "$APPLICATION_ID" ]; then
    echo "❌ 错误: applicationId 不能为空"
    exit 1
fi

# 设置环境变量
export ANDROID_APPLICATION_ID="$APPLICATION_ID"
export APP_NAME="$APP_NAME"
export APP_ICON_PATH="$APP_ICON_PATH"

if [ -n "$API_URL" ]; then
    export VITE_API_URL="$API_URL"
fi

if [ -n "$API_KEY" ]; then
    export VITE_API_KEY="$API_KEY"
fi

# 设置签名配置（如果提供）
if [ -n "$KEYSTORE_FILE" ]; then
    # 如果路径是相对路径，转换为绝对路径（相对于 android 目录）
    if [[ "$KEYSTORE_FILE" != /* ]]; then
        KEYSTORE_FILE="$SCRIPT_DIR/android/$KEYSTORE_FILE"
    fi
    export KEYSTORE_FILE="$KEYSTORE_FILE"
    export KEYSTORE_PASSWORD="$KEYSTORE_PASSWORD"
    export KEY_ALIAS="$KEY_ALIAS"
    export KEY_PASSWORD="$KEY_PASSWORD"
fi

# 如果同时设置了 API URL 和 API KEY，隐藏登录页的 API 服务器设置
if [ -n "$API_URL" ] && [ -n "$API_KEY" ]; then
    export VITE_HIDE_API_SERVER_CONFIG=true
fi

echo ""
echo "🚀 开始构建 APK (配置: $PROFILE_NAME, 类型: $BUILD_TYPE)"
echo ""

# 调用主构建脚本
./build-apk.sh "$BUILD_TYPE"

# 构建完成后，重命名 APK 文件以包含配置名称
echo ""
echo "📦 重命名 APK 文件..."
cd android/app/build/outputs/apk

if [ "$BUILD_TYPE" = "release" ]; then
    APK_DIR="release"
else
    APK_DIR="debug"
fi

if [ -d "$APK_DIR" ]; then
    # 查找 APK 文件（优先查找已重命名的 ReadKnows-*.apk，如果没有则查找原始文件）
    APK_FILE=$(find "$APK_DIR" -name "ReadKnows-*.apk" 2>/dev/null | head -1)
    if [ -z "$APK_FILE" ]; then
        # 如果没有找到重命名后的文件，查找原始文件
        APK_FILE=$(find "$APK_DIR" -name "*.apk" 2>/dev/null | head -1)
    fi
    
    if [ -n "$APK_FILE" ] && [ -f "$APK_FILE" ]; then
        APK_NAME=$(basename "$APK_FILE")
        APK_BASE_NAME="${APK_NAME%.apk}"
        
        # 如果文件名已经包含配置名称，跳过重命名
        if [[ "$APK_BASE_NAME" == *"-${PROFILE_NAME}" ]]; then
            echo "✅ APK 文件名已包含配置名称: $APK_NAME"
            echo "   位置: android/app/build/outputs/apk/$APK_DIR/$APK_NAME"
        else
            # 移除可能存在的其他配置名称后缀，然后添加当前配置名称
            APK_BASE_NAME=$(echo "$APK_BASE_NAME" | sed -E 's/-[a-zA-Z0-9_-]+$//')
            NEW_APK_NAME="${APK_BASE_NAME}-${PROFILE_NAME}.apk"
            NEW_APK_PATH="$APK_DIR/$NEW_APK_NAME"
            
            mv "$APK_FILE" "$NEW_APK_PATH"
            echo "✅ APK 已重命名: $NEW_APK_NAME"
            echo "   位置: android/app/build/outputs/apk/$NEW_APK_PATH"
        fi
    else
        echo "⚠️  未找到 APK 文件，请检查构建是否成功"
    fi
fi

cd "$SCRIPT_DIR"

echo ""
echo "✅ 构建完成！"
echo "   配置: $PROFILE_NAME"
echo "   包名: $APPLICATION_ID"
echo "   应用名称: $APP_NAME"
echo ""
