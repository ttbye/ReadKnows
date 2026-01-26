#!/bin/bash

# 管理API Key和私有访问密钥的Shell脚本
# 用法: ./manage-keys.sh [command] [args...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/manageKeys.js"

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 未找到Node.js，请先安装Node.js"
    exit 1
fi

# 检查脚本文件是否存在
if [ ! -f "$NODE_SCRIPT" ]; then
    echo "错误: 找不到脚本文件 $NODE_SCRIPT"
    exit 1
fi

# 运行Node.js脚本
node "$NODE_SCRIPT" "$@"
