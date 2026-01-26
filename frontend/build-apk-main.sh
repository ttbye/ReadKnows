#!/bin/bash

# 构建 APK 主脚本 - 自动检测平台并提供选择
# 使用方法: ./build-apk-main.sh [debug|release] [--auto]

set -e

BUILD_TYPE=${1:-debug}
AUTO_MODE=${2:-}

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
OS_NAME=""

case "$OS" in
    linux)   OS_NAME="Linux";;
    macos)   OS_NAME="macOS";;
    windows) OS_NAME="Windows (Git Bash/MSYS)";;
    *)       OS_NAME="未知";;
esac

# 显示欢迎信息
echo "═══════════════════════════════════════════════════════════"
echo "  📱 ReadKnows Android APK 构建工具"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "🔍 检测到的平台: $OS_NAME"
echo "📦 构建类型: $BUILD_TYPE"
echo ""

# 如果不是自动模式，询问用户
if [ "$AUTO_MODE" != "--auto" ]; then
    echo "请选择操作:"
    echo "  1) 使用自动检测的平台 ($OS_NAME) [默认]"
    echo "  2) 手动选择平台"
    echo "  3) 退出"
    echo ""
    read -p "请输入选项 (1-3) [默认: 1]: " choice
    choice=${choice:-1}
    
    case "$choice" in
        1)
            SELECTED_OS="$OS"
            echo ""
            echo "✅ 使用自动检测的平台: $OS_NAME"
            ;;
        2)
            echo ""
            echo "请选择目标平台:"
            echo "  1) Linux"
            echo "  2) macOS"
            echo "  3) Windows (Git Bash/MSYS)"
            echo ""
            read -p "请输入选项 (1-3): " platform_choice
            
            case "$platform_choice" in
                1) SELECTED_OS="linux";;
                2) SELECTED_OS="macos";;
                3) SELECTED_OS="windows";;
                *)
                    echo "❌ 无效的选择"
                    exit 1
                    ;;
            esac
            echo ""
            echo "✅ 已选择平台: $SELECTED_OS"
            ;;
        3)
            echo "退出构建"
            exit 0
            ;;
        *)
            echo "❌ 无效的选择，使用默认平台"
            SELECTED_OS="$OS"
            ;;
    esac
else
    SELECTED_OS="$OS"
    echo "✅ 自动模式: 使用检测到的平台 $OS_NAME"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""

# 调用实际的构建脚本
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_SCRIPT="$SCRIPT_DIR/build-apk.sh"

if [ ! -f "$BUILD_SCRIPT" ]; then
    echo "❌ 构建脚本不存在: $BUILD_SCRIPT"
    exit 1
fi

# 设置平台环境变量（如果需要）
export DETECTED_OS="$SELECTED_OS"

# 执行构建脚本
exec "$BUILD_SCRIPT" "$BUILD_TYPE"


