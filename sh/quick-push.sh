#!/bin/bash

# 快速推送脚本 - 使用 Personal Access Token

cd "$(dirname "$0")/.." || exit 1

echo "📤 准备推送到 GitHub..."
echo ""

# 检查是否有未推送的提交
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u} 2>/dev/null)

if [ -z "$REMOTE" ]; then
    echo "⚠️  未设置上游分支，使用: git push -u origin main"
    git push -u origin main
else
    if [ "$LOCAL" = "$REMOTE" ]; then
        echo "✅ 所有更改已推送"
        exit 0
    fi
    echo "🚀 开始推送..."
    git push origin main
fi

