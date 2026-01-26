#!/bin/bash

# 使用默认服务器地址构建 APK 的便捷脚本
# 服务器地址: https://127.0.0.1:1281

cd "$(dirname "$0")"

# 使用默认服务器地址构建
USE_DEFAULT_SERVER=true ./build-apk.sh "$@"
