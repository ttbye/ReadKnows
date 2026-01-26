#!/bin/bash

# 构建 APK 安装包的脚本
# 使用方法: ./build-apk.sh [debug|release]

set -e

BUILD_TYPE=${1:-debug}

# 设置 Java 和 Android 环境变量
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH"

echo "🚀 开始构建 APK..."
echo "构建类型: $BUILD_TYPE"
echo "Java 版本: $(java -version 2>&1 | head -1)"

# 进入前端目录
cd "$(dirname "$0")"

# 默认服务器地址（如果未设置 VITE_API_URL）
DEFAULT_API_URL="https://127.0.0.1:1281"

# 0. 配置 APK（自定义应用名称和图标）
echo "🔧 步骤 0/7: 配置 APK（应用名称和图标）..."
if [ -f "scripts/configure-apk.js" ]; then
  # 传递环境变量给配置脚本
  if [ -n "$APP_NAME" ] || [ -n "$APP_ICON_PATH" ]; then
    APP_NAME="$APP_NAME" APP_ICON_PATH="$APP_ICON_PATH" node scripts/configure-apk.js
  else
    node scripts/configure-apk.js
  fi
else
  echo "⚠️  APK 配置脚本不存在，跳过配置步骤"
fi

# 1. 生成 Android 图标
echo "🖼️  步骤 1/7: 生成 Android 应用图标..."
if [ -f "scripts/generate-android-icons.js" ]; then
  # 如果指定了自定义图标路径，传递给图标生成脚本
  if [ -n "$APP_ICON_PATH" ]; then
    APP_ICON_PATH="$APP_ICON_PATH" node scripts/generate-android-icons.js
  else
    node scripts/generate-android-icons.js
  fi
else
  echo "⚠️  图标生成脚本不存在，跳过图标生成"
fi

# 2. 更新 Android 版本号
echo "📦 步骤 2/7: 更新 Android 版本号..."
node scripts/update-android-version.js

# 3. 构建前端项目
echo "📦 步骤 3/7: 构建前端项目..."
# 设置 Android APK 标识（用于环境检测）
# 如果设置了 VITE_API_URL 环境变量，使用它作为默认服务器地址
# 如果设置了 VITE_API_KEY 环境变量，使用它作为默认API KEY
# 如果同时设置了两者，则隐藏登录页的API服务器设置功能
BUILD_ENV="VITE_IS_ANDROID_APP=true"
if [ -n "$VITE_API_URL" ]; then
  echo "使用环境变量中的服务器地址: $VITE_API_URL"
  BUILD_ENV="$BUILD_ENV VITE_API_URL=$VITE_API_URL"
fi
if [ -n "$VITE_API_KEY" ]; then
  echo "使用环境变量中的API KEY: $VITE_API_KEY"
  BUILD_ENV="$BUILD_ENV VITE_API_KEY=$VITE_API_KEY"
fi
# 如果同时设置了API URL和API KEY，则隐藏登录页的API服务器设置功能
if [ -n "$VITE_API_URL" ] && [ -n "$VITE_API_KEY" ]; then
  echo "已设置API服务器地址和API KEY，登录页将隐藏API服务器设置功能"
  BUILD_ENV="$BUILD_ENV VITE_HIDE_API_SERVER_CONFIG=true"
fi

if [ "$USE_DEFAULT_SERVER" = "true" ] || [ "$USE_DEFAULT_SERVER" = "1" ]; then
  echo "使用默认服务器地址: $DEFAULT_API_URL"
  eval "$BUILD_ENV VITE_API_URL=$DEFAULT_API_URL npm run build"
elif [ -n "$VITE_API_URL" ] || [ -n "$VITE_API_KEY" ]; then
  eval "$BUILD_ENV npm run build"
else
  echo "⚠️  未设置 VITE_API_URL，将使用相对路径（适用于 Web 环境）"
  echo "💡 提示: 对于 Android APK，建议设置服务器地址"
  echo "   方式 1: VITE_API_URL=https://127.0.0.1:1281 ./build-apk.sh"
  echo "   方式 2: USE_DEFAULT_SERVER=true ./build-apk.sh (使用默认服务器)"
  echo "   方式 3: 构建后可在应用内设置服务器地址"
  echo "💡 提示: 可以设置 VITE_API_KEY 环境变量来配置默认API KEY"
  eval "$BUILD_ENV npm run build"
fi

# 4. 同步到 Android 平台
echo "🔄 步骤 4/7: 同步到 Android 平台..."
npx cap sync android

# 5. 检查签名配置（仅 Release 构建）
if [ "$BUILD_TYPE" = "release" ]; then
    echo "🔐 步骤 5/7: 检查签名配置..."
    cd android
    
    KEYSTORE_FILE="readknows-release-key.jks"
    KEYSTORE_PROPERTIES="keystore.properties"
    
    if [ ! -f "$KEYSTORE_PROPERTIES" ] && [ ! -f "$KEYSTORE_FILE" ]; then
        echo "⚠️  未找到签名配置"
        echo "   密钥库文件: $KEYSTORE_FILE"
        echo "   配置文件: $KEYSTORE_PROPERTIES"
        echo ""
        echo "💡 提示: Release APK 需要签名才能安装"
        echo "   选项 1: 运行密钥库生成脚本（推荐）"
        echo "     cd android && ./generate-keystore.sh"
        echo ""
        echo "   选项 2: 手动配置签名信息"
        echo "     1. 创建密钥库: keytool -genkey -v -keystore $KEYSTORE_FILE ..."
        echo "     2. 创建 $KEYSTORE_PROPERTIES 文件"
        echo ""
        read -p "是否现在生成密钥库？(Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            if [ -f "./generate-keystore.sh" ]; then
                ./generate-keystore.sh
            else
                echo "❌ 未找到 generate-keystore.sh 脚本"
                echo "   请手动创建密钥库或配置签名信息"
                cd ..
                exit 1
            fi
        else
            echo "⚠️  将构建未签名的 APK（无法直接安装）"
        fi
    else
        echo "✅ 签名配置已找到"
        if [ -f "$KEYSTORE_PROPERTIES" ]; then
            echo "   使用配置文件: $KEYSTORE_PROPERTIES"
        fi
        if [ -f "$KEYSTORE_FILE" ]; then
            echo "   使用密钥库文件: $KEYSTORE_FILE"
        fi
    fi
    
    # 返回到 frontend 目录，确保后续步骤能正确进入 android 目录
    cd ..
fi

# 6. 构建 APK
echo "🔨 步骤 6/7: 构建 APK..."
cd android

if [ "$BUILD_TYPE" = "release" ]; then
    echo "构建已签名的 Release APK..."
    ./gradlew assembleRelease
    # 检查是否生成了已签名的 APK
    if [ -f "app/build/outputs/apk/release/app-release.apk" ]; then
        APK_PATH="app/build/outputs/apk/release/app-release.apk"
        echo "✅ 已签名的 Release APK 构建完成: $APK_PATH"
    elif [ -f "app/build/outputs/apk/release/app-release-unsigned.apk" ]; then
        APK_PATH="app/build/outputs/apk/release/app-release-unsigned.apk"
        echo "✅ Release APK 构建完成（未签名）: $APK_PATH"
        echo "⚠️  注意: 此 APK 需要签名后才能安装"
    else
        echo "❌ APK 文件未找到"
        exit 1
    fi
else
    echo "构建 Debug APK..."
    ./gradlew assembleDebug
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    echo "✅ Debug APK 构建完成: $APK_PATH"
fi

cd ..

# 7. 重命名 APK 文件为 ReadKnows-版本号-随机码.apk
echo "📝 步骤 7/7: 重命名 APK 文件..."

# 读取版本号
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
if [ -z "$VERSION" ] || [ "$VERSION" = "undefined" ]; then
    echo "⚠️  无法读取版本号，使用默认值"
    VERSION="unknown"
fi

# 生成随机码（使用时间戳 + 4位随机字符）
TIMESTAMP=$(date +%Y%m%d%H%M%S)
# 尝试多种方式生成随机码
if command -v openssl &> /dev/null; then
    RANDOM_CODE=$(openssl rand -hex 2 | head -c 4)
elif command -v shuf &> /dev/null; then
    RANDOM_CODE=$(shuf -i 1000-9999 -n 1)
else
    RANDOM_CODE=$(date +%S | tail -c 3)$(date +%N | tail -c 2)
fi
FULL_RANDOM_CODE="${TIMESTAMP}${RANDOM_CODE}"

# 构建新文件名（移除 -unsigned 等后缀，统一格式）
APK_DIR=$(dirname "$APK_PATH")
APK_EXT=".apk"
# 如果原始文件是未签名的，在文件名中标注
if [[ "$APK_PATH" == *"-unsigned"* ]]; then
    NEW_APK_NAME="ReadKnows-${VERSION}-${FULL_RANDOM_CODE}-unsigned${APK_EXT}"
else
    NEW_APK_NAME="ReadKnows-${VERSION}-${FULL_RANDOM_CODE}${APK_EXT}"
fi
NEW_APK_PATH="${APK_DIR}/${NEW_APK_NAME}"

# 重命名 APK 文件
if [ -f "android/$APK_PATH" ]; then
    mv "android/$APK_PATH" "android/$NEW_APK_PATH"
    echo "✅ APK 文件已重命名: $NEW_APK_NAME"
    APK_PATH="$NEW_APK_PATH"
else
    echo "⚠️  原始 APK 文件不存在: android/$APK_PATH"
    echo "   跳过重命名步骤"
fi

# 显示 APK 位置和版本信息
echo ""
echo "📱 APK 文件信息:"
echo "   文件名: $NEW_APK_NAME"
echo "   版本号: $VERSION"
echo "   随机码: $FULL_RANDOM_CODE"
echo "   文件路径: $(pwd)/android/$APK_PATH"
echo ""
echo "✨ 构建完成！"
echo ""
echo "💡 提示:"
if [ "$BUILD_TYPE" = "release" ]; then
    if [[ "$APK_PATH" == *"-unsigned"* ]]; then
        echo "   - Release APK 未签名，需要签名后才能安装"
        echo "   - 签名方式:"
        echo "     1. 运行密钥库生成脚本: cd android && ./generate-keystore.sh"
        echo "     2. 重新运行构建脚本: ./build-apk.sh release"
    else
        echo "   - Release APK 已自动签名，可以直接安装"
        echo "   - 安装命令: adb install android/$APK_PATH"
    fi
else
    echo "   - Debug APK 可以直接安装到设备上测试"
    echo "   - 安装命令: adb install android/$APK_PATH"
fi
