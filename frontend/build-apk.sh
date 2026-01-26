#!/bin/bash

# 构建 APK 安装包的脚本（支持 Windows/Linux/macOS）
# 使用方法: ./build-apk.sh [debug|release]

set -e

BUILD_TYPE=${1:-debug}

# 检测操作系统
detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux";;
        Darwin*)    echo "macos";;
        CYGWIN*)    echo "windows";;
        MINGW*)     echo "windows";;
        MSYS*)      echo "windows";;
        *)          echo "unknown";;
    esac
}

OS=$(detect_os)

# 根据操作系统设置 Java 和 Android 环境变量
setup_java_env() {
    echo "🔍 检测到操作系统: $OS"
    
    # 如果已经设置了 JAVA_HOME 且有效，使用它
    if [ -n "$JAVA_HOME" ] && [ -f "$JAVA_HOME/bin/java" ] || [ -f "$JAVA_HOME/bin/java.exe" ]; then
        echo "✅ 使用已设置的 JAVA_HOME: $JAVA_HOME"
        return 0
    fi
    
    # 根据操作系统自动查找 Java
    case "$OS" in
        macos)
            # macOS: 尝试多个可能的路径
            POSSIBLE_JAVA_HOMES=(
                "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
                "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
                "/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home"
                "/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home"
                "/usr/libexec/java_home"
            )
            for java_home in "${POSSIBLE_JAVA_HOMES[@]}"; do
                if [ -d "$java_home" ] && [ -f "$java_home/bin/java" ]; then
                    export JAVA_HOME="$java_home"
                    echo "✅ 自动找到 Java (macOS): $JAVA_HOME"
                    return 0
                fi
            done
            # 使用 java_home 命令
            if command -v /usr/libexec/java_home >/dev/null 2>&1; then
                export JAVA_HOME=$(/usr/libexec/java_home 2>/dev/null)
                if [ -n "$JAVA_HOME" ] && [ -f "$JAVA_HOME/bin/java" ]; then
                    echo "✅ 使用 java_home 命令找到: $JAVA_HOME"
                    return 0
                fi
            fi
            ;;
        linux)
            # Linux: 尝试多个可能的路径
            POSSIBLE_JAVA_HOMES=(
                "/usr/lib/jvm/java-17-openjdk"
                "/usr/lib/jvm/java-21-openjdk"
                "/usr/lib/jvm/java-11-openjdk"
                "/usr/lib/jvm/default-java"
                "$HOME/.sdkman/candidates/java/current"
            )
            for java_home in "${POSSIBLE_JAVA_HOMES[@]}"; do
                if [ -d "$java_home" ] && [ -f "$java_home/bin/java" ]; then
                    export JAVA_HOME="$java_home"
                    echo "✅ 自动找到 Java (Linux): $JAVA_HOME"
                    return 0
                fi
            done
            ;;
        windows)
            # Windows (Git Bash/MSYS): 尝试多个可能的路径
            # 使用 find 命令查找 Java 安装目录
            POSSIBLE_BASE_PATHS=(
                "/c/Program Files/Eclipse Adoptium"
                "/c/Program Files/Java"
                "/c/Program Files (x86)/Java"
                "/d/Program Files/Eclipse Adoptium"
                "/d/Program Files/Java"
            )
            
            for base_path in "${POSSIBLE_BASE_PATHS[@]}"; do
                if [ -d "$base_path" ]; then
                    # 查找所有 jdk 目录，按版本号倒序排列（优先选择较新版本）
                    for java_dir in "$base_path"/jdk-* "$base_path"/jdk*; do
                        if [ -d "$java_dir" ] && [ -f "$java_dir/bin/java.exe" ]; then
                            export JAVA_HOME="$java_dir"
                            echo "✅ 自动找到 Java (Windows): $JAVA_HOME"
                            return 0
                        fi
                    done
                fi
            done
            
            # 尝试从 Windows 环境变量读取（如果在 Git Bash 中可用）
            if [ -n "$ProgramFiles" ]; then
                # 转换为 Unix 路径格式
                if [[ "$ProgramFiles" == *":"* ]]; then
                    # Windows 路径格式: C:\Program Files
                    unix_path=$(echo "$ProgramFiles" | sed 's|\\|/|g' | sed 's|^\([A-Z]\):|/\L\1|')
                else
                    unix_path="$ProgramFiles"
                fi
                
                for base_path in "$unix_path/Eclipse Adoptium" "$unix_path/Java"; do
                    if [ -d "$base_path" ]; then
                        for java_dir in "$base_path"/jdk-* "$base_path"/jdk*; do
                            if [ -d "$java_dir" ] && [ -f "$java_dir/bin/java.exe" ]; then
                                export JAVA_HOME="$java_dir"
                                echo "✅ 自动找到 Java (Windows): $JAVA_HOME"
                                return 0
                            fi
                        done
                    fi
                done
            fi
            
            # 尝试从注册表或常见位置查找（使用 cygpath 如果可用）
            if command -v cygpath >/dev/null 2>&1; then
                REG_PATHS=(
                    "HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit"
                    "HKLM\\SOFTWARE\\Eclipse Adoptium"
                )
                # 这里可以添加注册表查询逻辑（如果需要）
            fi
            ;;
    esac
    
    # 如果自动查找失败，尝试使用 PATH 中的 java
    if command -v java >/dev/null 2>&1; then
        JAVA_PATH=$(which java)
        # 尝试从 java 路径推断 JAVA_HOME
        if [[ "$JAVA_PATH" == *"/bin/java" ]]; then
            POSSIBLE_HOME=$(dirname "$(dirname "$JAVA_PATH")")
            if [ -d "$POSSIBLE_HOME" ]; then
                export JAVA_HOME="$POSSIBLE_HOME"
                echo "✅ 从 PATH 推断 JAVA_HOME: $JAVA_HOME"
                return 0
            fi
        fi
    fi
    
    return 1
}

# 设置 Java 环境
if ! setup_java_env; then
    echo ""
    echo "❌ 未找到 Java 安装！" >&2
    echo ""
    echo "请按照以下步骤安装 Java:" >&2
    case "$OS" in
        windows)
            echo "1. 下载并安装 Java JDK 17 或更高版本" >&2
            echo "   推荐: Eclipse Temurin (Adoptium) - https://adoptium.net/" >&2
            echo "2. 设置 JAVA_HOME 环境变量指向 Java 安装目录" >&2
            echo "   例如: C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.9+9-hotspot" >&2
            echo "3. 将 %JAVA_HOME%\\bin 添加到 PATH 环境变量" >&2
            echo "4. 重新打开终端并运行: java -version" >&2
            ;;
        macos)
            echo "1. 使用 Homebrew 安装: brew install openjdk@17" >&2
            echo "   或下载: https://adoptium.net/" >&2
            ;;
        linux)
            echo "1. Ubuntu/Debian: sudo apt-get install openjdk-17-jdk" >&2
            echo "2. 或下载: https://adoptium.net/" >&2
            ;;
    esac
    echo ""
    echo "详细安装指南请查看: docs/WINDOWS_JAVA_SETUP.md" >&2
    exit 1
fi

# 设置 PATH
export PATH="$JAVA_HOME/bin:$PATH"

# 设置 Android SDK 路径（如果存在）
# 注意：现代 Android SDK 不再需要 tools 目录（android 命令已废弃）
case "$OS" in
    macos)
        if [ -d "$HOME/Library/Android/sdk" ]; then
            export ANDROID_HOME="$HOME/Library/Android/sdk"
            export PATH="$ANDROID_HOME/platform-tools:$PATH"
            # 可选：如果需要命令行工具（如 adb），platform-tools 已足够
            if [ -d "$ANDROID_HOME/cmdline-tools" ]; then
                # 查找最新的 cmdline-tools 版本
                LATEST_CMD=$(ls -d "$ANDROID_HOME/cmdline-tools"/*/bin 2>/dev/null | head -1)
                if [ -n "$LATEST_CMD" ]; then
                    export PATH="$LATEST_CMD:$PATH"
                fi
            fi
        fi
        ;;
    linux)
        if [ -d "$HOME/Android/Sdk" ]; then
            export ANDROID_HOME="$HOME/Android/Sdk"
            export PATH="$ANDROID_HOME/platform-tools:$PATH"
            # 可选：如果需要命令行工具
            if [ -d "$ANDROID_HOME/cmdline-tools" ]; then
                LATEST_CMD=$(ls -d "$ANDROID_HOME/cmdline-tools"/*/bin 2>/dev/null | head -1)
                if [ -n "$LATEST_CMD" ]; then
                    export PATH="$LATEST_CMD:$PATH"
                fi
            fi
        fi
        ;;
    windows)
        # Windows 上的 Android SDK 路径
        if [ -d "$HOME/AppData/Local/Android/Sdk" ]; then
            export ANDROID_HOME="$HOME/AppData/Local/Android/Sdk"
            export PATH="$ANDROID_HOME/platform-tools:$PATH"
            if [ -d "$ANDROID_HOME/cmdline-tools" ]; then
                LATEST_CMD=$(ls -d "$ANDROID_HOME/cmdline-tools"/*/bin 2>/dev/null | head -1)
                if [ -n "$LATEST_CMD" ]; then
                    export PATH="$LATEST_CMD:$PATH"
                fi
            fi
        elif [ -d "/c/Users/$USER/AppData/Local/Android/Sdk" ]; then
            export ANDROID_HOME="/c/Users/$USER/AppData/Local/Android/Sdk"
            export PATH="$ANDROID_HOME/platform-tools:$PATH"
            if [ -d "$ANDROID_HOME/cmdline-tools" ]; then
                LATEST_CMD=$(ls -d "$ANDROID_HOME/cmdline-tools"/*/bin 2>/dev/null | head -1)
                if [ -n "$LATEST_CMD" ]; then
                    export PATH="$LATEST_CMD:$PATH"
                fi
            fi
        fi
        ;;
esac

echo "🚀 开始构建 APK..."
echo "构建类型: $BUILD_TYPE"
echo "操作系统: $OS"
if command -v java >/dev/null 2>&1; then
    echo "Java 版本: $(java -version 2>&1 | head -1)"
else
    echo "⚠️  警告: 无法运行 java 命令"
fi

# 进入前端目录
cd "$(dirname "$0")"

# 默认服务器地址（如果未设置 VITE_API_URL）
DEFAULT_API_URL="https://127.0.0.1:1281"

# 0. 配置 APK（自定义应用名称、图标和包名）
echo "🔧 步骤 0/7: 配置 APK（应用名称、图标和包名）..."
if [ -f "scripts/configure-apk.js" ]; then
  # 传递环境变量给配置脚本（包括包名）
  CONFIG_ENV=""
  if [ -n "$APP_NAME" ]; then
    CONFIG_ENV="$CONFIG_ENV APP_NAME=\"$APP_NAME\""
  fi
  if [ -n "$APP_ICON_PATH" ]; then
    CONFIG_ENV="$CONFIG_ENV APP_ICON_PATH=\"$APP_ICON_PATH\""
  fi
  if [ -n "$ANDROID_APPLICATION_ID" ]; then
    CONFIG_ENV="$CONFIG_ENV ANDROID_APPLICATION_ID=\"$ANDROID_APPLICATION_ID\""
  fi
  if [ -n "$CONFIG_ENV" ]; then
    eval "$CONFIG_ENV node scripts/configure-apk.js"
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
# 清理之前的构建产物（避免文件覆盖错误）
echo "🧹 清理之前的构建产物..."
if [ -d "dist" ]; then
    rm -rf dist
    echo "✅ 已清理 dist 目录"
fi
# 设置 Android APK 标识（用于环境检测）
# 如果设置了 VITE_API_URL 环境变量，使用它作为默认服务器地址
# 如果设置了 VITE_API_KEY 环境变量，使用它作为默认API KEY
# 如果同时设置了两者，则隐藏登录页的API服务器设置功能
# 设置构建环境变量（避免使用 eval，直接导出环境变量）
export VITE_IS_ANDROID_APP=true
if [ -n "$VITE_API_URL" ]; then
  echo "使用环境变量中的服务器地址: $VITE_API_URL"
  export VITE_API_URL="$VITE_API_URL"
fi
if [ -n "$VITE_API_KEY" ]; then
  echo "使用环境变量中的API KEY: $VITE_API_KEY"
  export VITE_API_KEY="$VITE_API_KEY"
fi
# 如果同时设置了API URL和API KEY，则隐藏登录页的API服务器设置功能
if [ -n "$VITE_API_URL" ] && [ -n "$VITE_API_KEY" ]; then
  echo "已设置API服务器地址和API KEY，登录页将隐藏API服务器设置功能"
  export VITE_HIDE_API_SERVER_CONFIG=true
fi

if [ "$USE_DEFAULT_SERVER" = "true" ] || [ "$USE_DEFAULT_SERVER" = "1" ]; then
  echo "使用默认服务器地址: $DEFAULT_API_URL"
  export VITE_API_URL="$DEFAULT_API_URL"
  npm run build
elif [ -n "$VITE_API_URL" ] || [ -n "$VITE_API_KEY" ]; then
  npm run build
else
  echo "⚠️  未设置 VITE_API_URL，将使用相对路径（适用于 Web 环境）"
  echo "💡 提示: 对于 Android APK，建议设置服务器地址"
  echo "   方式 1: VITE_API_URL=https://127.0.0.1:1281 ./build-apk.sh"
  echo "   方式 2: USE_DEFAULT_SERVER=true ./build-apk.sh (使用默认服务器)"
  echo "   方式 3: 构建后可在应用内设置服务器地址"
  echo "💡 提示: 可以设置 VITE_API_KEY 环境变量来配置默认API KEY"
  npm run build
fi

# 4. 同步到 Android 平台
echo "🔄 步骤 4/7: 同步到 Android 平台..."
# 清理 Android 项目的 assets 目录（避免文件覆盖错误）
if [ -d "android/app/src/main/assets/public" ]; then
    echo "🧹 清理 Android assets 目录..."
    rm -rf android/app/src/main/assets/public/*
    echo "✅ 已清理 Android assets 目录"
fi
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
    
    # 返回 frontend 目录，确保后续步骤能正确进入 android 目录
    cd ..
fi

# 6. 构建 APK
echo "🔨 步骤 6/7: 构建 APK..."
cd android

# 显示包名信息（如果设置了自定义包名）
if [ -n "$ANDROID_APPLICATION_ID" ]; then
    echo "📦 使用自定义包名: $ANDROID_APPLICATION_ID"
    # 导出环境变量供 Gradle 使用
    export ANDROID_APPLICATION_ID="$ANDROID_APPLICATION_ID"
fi

# 清理之前的构建（避免文件覆盖错误）
echo "🧹 清理之前的构建..."
if [ "$OS" = "windows" ]; then
    ./gradlew.bat clean --no-daemon 2>/dev/null || echo "⚠️  清理警告（可忽略）"
else
    ./gradlew clean --no-daemon 2>/dev/null || echo "⚠️  清理警告（可忽略）"
fi

if [ "$BUILD_TYPE" = "release" ]; then
    echo "构建已签名的 Release APK..."
    # Windows 使用 gradlew.bat，其他系统使用 ./gradlew
    # 传递 ANDROID_APPLICATION_ID 环境变量给 Gradle
    if [ "$OS" = "windows" ]; then
        if [ -n "$ANDROID_APPLICATION_ID" ]; then
            set ANDROID_APPLICATION_ID=%ANDROID_APPLICATION_ID% && ./gradlew.bat assembleRelease --no-daemon
        else
            ./gradlew.bat assembleRelease --no-daemon
        fi
    else
        ./gradlew assembleRelease --no-daemon
    fi
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
    # Windows 使用 gradlew.bat，其他系统使用 ./gradlew
    if [ "$OS" = "windows" ]; then
        ./gradlew.bat assembleDebug --no-daemon
    else
        ./gradlew assembleDebug --no-daemon
    fi
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    echo "✅ Debug APK 构建完成: $APK_PATH"
fi

cd ..

# 7. 重命名 APK 文件
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

# 如果设置了自定义包名，提取标识符用于文件名
PROFILE_SUFFIX=""
if [ -n "$ANDROID_APPLICATION_ID" ]; then
    # 从包名中提取最后一部分作为标识（例如：com.readknows.server1 -> server1）
    PROFILE_ID=$(echo "$ANDROID_APPLICATION_ID" | sed 's/.*\.//')
    if [ "$PROFILE_ID" != "app" ] && [ -n "$PROFILE_ID" ]; then
        PROFILE_SUFFIX="-${PROFILE_ID}"
    fi
fi

# 如果原始文件是未签名的，在文件名中标注
if [[ "$APK_PATH" == *"-unsigned"* ]]; then
    NEW_APK_NAME="ReadKnows-${VERSION}${PROFILE_SUFFIX}-${FULL_RANDOM_CODE}-unsigned${APK_EXT}"
else
    NEW_APK_NAME="ReadKnows-${VERSION}${PROFILE_SUFFIX}-${FULL_RANDOM_CODE}${APK_EXT}"
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
