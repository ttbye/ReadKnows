#!/bin/bash

# ReadKnows Android APK 构建脚本
# 此脚本用于构建 Android APK 安装包

set -e

echo "=========================================="
echo "  ReadKnows Android APK 构建脚本"
echo "=========================================="
echo ""

# 检查 Java
echo "📋 检查 Java 环境..."
if ! command -v java &> /dev/null; then
    echo "❌ 未找到 Java，请先安装 Java JDK 11 或更高版本"
    echo ""
    echo "安装方法："
    echo "1. macOS: brew install openjdk@17"
    echo "2. 设置环境变量（添加到 ~/.zshrc）："
    echo "   export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
    echo "   export PATH=\"\$JAVA_HOME/bin:\$PATH\""
    echo "3. 或访问: https://adoptium.net/"
    exit 1
fi

# 尝试获取 Java 版本信息
# 暂时禁用 set -e 以防止命令失败导致脚本退出
set +e
JAVA_VERSION_OUTPUT=$(java -version 2>&1)
JAVA_EXIT_CODE=$?
set -e

# 检查 Java 命令是否执行成功
if [ $JAVA_EXIT_CODE -ne 0 ]; then
    echo "❌ Java 命令执行失败（退出码: $JAVA_EXIT_CODE）"
    echo "   输出: $JAVA_VERSION_OUTPUT"
    echo ""
    echo "请确保 Java 已正确安装并配置："
    echo "1. macOS: brew install openjdk@17"
    echo "2. 设置环境变量（添加到 ~/.zshrc）："
    echo "   export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
    echo "   export PATH=\"\$JAVA_HOME/bin:\$PATH\""
    echo "3. 重新加载配置: source ~/.zshrc"
    exit 1
fi
if echo "$JAVA_VERSION_OUTPUT" | grep -qi "unable to locate\|operation couldn't be completed\|no java runtime"; then
    echo "❌ Java 未正确安装或配置"
    echo ""
    echo "安装方法："
    echo "1. macOS: brew install openjdk@17"
    echo "2. 设置环境变量（添加到 ~/.zshrc）："
    echo "   export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
    echo "   export PATH=\"\$JAVA_HOME/bin:\$PATH\""
    echo "3. 或访问: https://adoptium.net/"
    exit 1
fi

# 解析 Java 版本号（尝试多种格式）
JAVA_VERSION=""
# 尝试从 "version "X.Y.Z" 格式提取
JAVA_VERSION=$(echo "$JAVA_VERSION_OUTPUT" | head -n 1 | grep -oE 'version "[0-9]+' | grep -oE '[0-9]+' | head -n 1)

# 如果无法解析，尝试从 "openjdk version" 格式提取
if [ -z "$JAVA_VERSION" ]; then
    JAVA_VERSION=$(echo "$JAVA_VERSION_OUTPUT" | head -n 1 | sed -nE 's/.*version "([0-9]+)\..*/\1/p')
fi

# 如果仍然无法解析，尝试使用 javac
if [ -z "$JAVA_VERSION" ] && command -v javac &> /dev/null; then
    JAVAC_VERSION_OUTPUT=$(javac -version 2>&1 || true)
    JAVA_VERSION=$(echo "$JAVAC_VERSION_OUTPUT" | grep -oE '[0-9]+' | head -n 1)
fi

# 验证版本号是否为数字
if [ -z "$JAVA_VERSION" ] || ! [[ "$JAVA_VERSION" =~ ^[0-9]+$ ]]; then
    echo "⚠️  无法确定 Java 版本，但 Java 命令可用"
    echo "   输出: $(echo "$JAVA_VERSION_OUTPUT" | head -n 1)"
    echo ""
    echo "请确保已安装 JDK 11 或更高版本"
    JAVA_VERSION=0
fi

# 检查版本是否满足要求
if [ "$JAVA_VERSION" -gt 0 ] && [ "$JAVA_VERSION" -lt 11 ]; then
    echo "❌ Java 版本过低，需要 JDK 11 或更高版本，当前版本: $JAVA_VERSION"
    exit 1
fi

if [ "$JAVA_VERSION" -gt 0 ]; then
    echo "✅ Java 版本: $(echo "$JAVA_VERSION_OUTPUT" | head -n 1) (检测到版本 $JAVA_VERSION)"
else
    echo "✅ Java 已安装: $(echo "$JAVA_VERSION_OUTPUT" | head -n 1)"
fi

# 检查 Android SDK
echo ""
echo "📋 检查 Android SDK..."
if [ -z "$ANDROID_HOME" ]; then
    # 尝试查找常见的 Android SDK 位置
    if [ -d "$HOME/Library/Android/sdk" ]; then
        export ANDROID_HOME="$HOME/Library/Android/sdk"
    elif [ -d "$HOME/Android/Sdk" ]; then
        export ANDROID_HOME="$HOME/Android/Sdk"
    else
        echo "❌ 未找到 Android SDK"
        echo ""
        echo "请设置 ANDROID_HOME 环境变量，或安装 Android Studio："
        echo "1. 下载 Android Studio: https://developer.android.com/studio"
        echo "2. 安装后，设置环境变量："
        echo "   export ANDROID_HOME=\$HOME/Library/Android/sdk"
        echo "   export PATH=\$PATH:\$ANDROID_HOME/tools:\$ANDROID_HOME/platform-tools"
        echo ""
        echo "或者使用命令行工具安装 SDK："
        echo "   brew install --cask android-studio"
        exit 1
    fi
fi

if [ ! -d "$ANDROID_HOME" ]; then
    echo "❌ Android SDK 目录不存在: $ANDROID_HOME"
    exit 1
fi

echo "✅ Android SDK 路径: $ANDROID_HOME"

# 检查必要的 SDK 组件
echo ""
echo "📋 检查 Android SDK 组件..."

# 检查 Build Tools
BUILD_TOOLS_FOUND=false
if [ -d "$ANDROID_HOME/build-tools" ]; then
    # 检查是否有任何版本的 build-tools
    BUILD_TOOLS_COUNT=$(find "$ANDROID_HOME/build-tools" -maxdepth 1 -type d | wc -l | tr -d ' ')
    if [ "$BUILD_TOOLS_COUNT" -gt 1 ]; then
        BUILD_TOOLS_FOUND=true
        BUILD_TOOLS_VERSION=$(ls -1 "$ANDROID_HOME/build-tools" | head -n 1)
        echo "✅ 找到 Android Build Tools: $BUILD_TOOLS_VERSION"
    fi
fi

if [ "$BUILD_TOOLS_FOUND" = false ]; then
    echo "⚠️  未找到 Android Build Tools"
    echo ""
    echo "安装方法："
    echo "1. 通过 Android Studio:"
    echo "   - 打开 Android Studio"
    echo "   - Tools > SDK Manager"
    echo "   - SDK Tools 标签页"
    echo "   - 勾选 'Android SDK Build-Tools' 并安装"
    echo ""
    echo "2. 通过命令行（如果已安装 cmdline-tools）："
    # 查找 sdkmanager
    SDKMANAGER_PATH=""
    if [ -f "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
        SDKMANAGER_PATH="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
    elif [ -f "$ANDROID_HOME/tools/bin/sdkmanager" ]; then
        SDKMANAGER_PATH="$ANDROID_HOME/tools/bin/sdkmanager"
    fi
    
    if [ -n "$SDKMANAGER_PATH" ]; then
        echo "   运行: $SDKMANAGER_PATH 'build-tools;34.0.0'"
    else
        echo "   需要先安装 Android SDK Command-line Tools"
        echo "   在 Android Studio > SDK Manager > SDK Tools 中安装"
    fi
    exit 1
fi

# 检查 Android Platform
PLATFORM_FOUND=false
PLATFORM_VERSION=""
if [ -d "$ANDROID_HOME/platforms" ]; then
    # 检查是否有 android-34 或更高版本
    for platform_dir in "$ANDROID_HOME/platforms"/android-*; do
        if [ -d "$platform_dir" ]; then
            PLATFORM_VERSION=$(basename "$platform_dir" | sed 's/android-//')
            if [ "$PLATFORM_VERSION" -ge 34 ]; then
                PLATFORM_FOUND=true
                echo "✅ 找到 Android Platform: android-$PLATFORM_VERSION"
                break
            fi
        fi
    done
fi

if [ "$PLATFORM_FOUND" = false ]; then
    echo "⚠️  未找到 Android Platform 34 或更高版本"
    if [ -n "$PLATFORM_VERSION" ]; then
        echo "   当前最高版本: android-$PLATFORM_VERSION"
    fi
    echo ""
    echo "安装方法："
    echo "1. 通过 Android Studio:"
    echo "   - 打开 Android Studio"
    echo "   - Tools > SDK Manager"
    echo "   - SDK Platforms 标签页"
    echo "   - 勾选 'Android 14.0 (API 34)' 或更高版本并安装"
    echo ""
    echo "2. 通过命令行（如果已安装 cmdline-tools）："
    # 查找 sdkmanager
    SDKMANAGER_PATH=""
    if [ -f "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
        SDKMANAGER_PATH="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
    elif [ -f "$ANDROID_HOME/tools/bin/sdkmanager" ]; then
        SDKMANAGER_PATH="$ANDROID_HOME/tools/bin/sdkmanager"
    fi
    
    if [ -n "$SDKMANAGER_PATH" ]; then
        echo "   运行: $SDKMANAGER_PATH 'platforms;android-34'"
    else
        echo "   需要先安装 Android SDK Command-line Tools"
        echo "   在 Android Studio > SDK Manager > SDK Tools 中安装"
    fi
    exit 1
fi

echo "✅ Android SDK 组件检查通过"

# 设置环境变量
export PATH="$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools"

# 构建 APK
echo ""
echo "=========================================="
echo "  开始构建 APK..."
echo "=========================================="
echo ""

# 清理之前的构建
echo "🧹 清理之前的构建..."
./gradlew clean

# 构建 Release APK
echo ""
echo "🔨 构建 Release APK..."
./gradlew assembleRelease

# 查找生成的 APK
APK_PATH=$(find app/build/outputs/apk/release -name "*.apk" 2>/dev/null | head -n 1)

if [ -n "$APK_PATH" ]; then
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    echo ""
    echo "=========================================="
    echo "  ✅ APK 构建成功！"
    echo "=========================================="
    echo ""
    echo "📦 APK 文件位置: $APK_PATH"
    echo "📊 APK 文件大小: $APK_SIZE"
    echo ""
    echo "安装方法："
    echo "1. 将 APK 文件传输到 Android 设备"
    echo "2. 在设备上启用"未知来源"安装权限"
    echo "3. 点击 APK 文件进行安装"
    echo ""
else
    echo ""
    echo "❌ 未找到生成的 APK 文件"
    exit 1
fi

