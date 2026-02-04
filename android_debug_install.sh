#!/bin/bash

echo "🔍 APK安装问题诊断脚本"
echo "============================"

# 检查ADB是否可用
if command -v adb &> /dev/null; then
    echo "✅ ADB已安装"
    echo ""

    echo "📱 连接的设备："
    adb devices
    echo ""

    echo "🔧 安装Debug APK..."
    adb install -r app/build/outputs/apk/debug/app-debug.apk

    if [ $? -eq 0 ]; then
        echo "✅ APK安装成功！"
        echo ""
        echo "📋 请在手机上测试应用是否能正常启动"
        echo "如果仍有问题，请运行以下命令查看应用日志："
        echo "adb logcat | grep -i readknows"
    else
        echo "❌ APK安装失败"
        echo "请检查设备连接和USB调试权限"
    fi
else
    echo "❌ ADB未安装"
    echo "请安装Android SDK Platform Tools："
    echo "https://developer.android.com/studio/releases/platform-tools"
fi