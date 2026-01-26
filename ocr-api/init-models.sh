#!/bin/bash

# OCR 模型初始化脚本
# 确保模型下载到挂载的持久化目录

set -e

# 从环境变量获取模型目录，如果没有则使用默认值
MODELS_TARGET="${OCR_MODELS_DIR:-/app/models}"
MODELS_SOURCE="/root/.paddlex/official_models"

echo "=========================================="
echo "OCR 模型初始化"
echo "=========================================="
echo ""
echo "目标模型目录: $MODELS_TARGET"
echo "默认模型目录: $MODELS_SOURCE"

# 确保目标目录存在
mkdir -p "$MODELS_TARGET"

# 设置 PADDLEX_HOME 环境变量，确保模型下载到指定目录
export PADDLEX_HOME="$MODELS_TARGET"
export OCR_MODELS_DIR="$MODELS_TARGET"
# 禁用模型源检查，避免网络连通性检查导致的超时
export DISABLE_MODEL_SOURCE_CHECK="True"

# 检查目标目录是否已有模型文件
if [ "$(ls -A $MODELS_TARGET 2>/dev/null)" ]; then
    echo "✅ 模型目录已有文件，跳过下载"
    echo ""
    echo "已存在的模型:"
    ls -lh "$MODELS_TARGET" | head -10
    echo ""
    echo "=========================================="
    echo "模型初始化完成（使用已有模型）"
    echo "=========================================="
    exit 0
fi

# 检查默认目录是否有模型（可能是之前下载的）
if [ -d "$MODELS_SOURCE" ] && [ "$(ls -A $MODELS_SOURCE 2>/dev/null)" ]; then
    echo "⚠️  检测到默认目录中有模型文件，正在复制到目标目录..."
    echo "源目录: $MODELS_SOURCE"
    echo "目标目录: $MODELS_TARGET"
    
    # 复制模型文件到目标目录
    cp -r "$MODELS_SOURCE"/* "$MODELS_TARGET"/ 2>/dev/null || true
    
    if [ "$(ls -A $MODELS_TARGET 2>/dev/null)" ]; then
        echo "✅ 模型文件已复制到目标目录"
        echo ""
        echo "已复制的模型:"
        ls -lh "$MODELS_TARGET" | head -10
        echo ""
        echo "=========================================="
        echo "模型初始化完成（从默认目录复制）"
        echo "=========================================="
        exit 0
    fi
fi

# 目录为空，需要下载模型
echo "⚠️  模型目录为空，正在下载模型..."
echo "这可能需要一些时间（首次下载约 100-200MB）..."
echo ""

# 确保 PADDLEX_HOME 在 Python 环境中也生效
export PYTHONPATH="/app:$PYTHONPATH"

# 临时修改 HOME 环境变量，让 PaddleOCR 将模型下载到目标目录
# 注意：这只是临时修改，不会影响容器内的其他进程
ORIGINAL_HOME="$HOME"
export HOME="/tmp/paddleocr-home"
mkdir -p "$HOME/.paddlex"
# 创建符号链接指向目标目录
rm -rf "$HOME/.paddlex/official_models" 2>/dev/null || true
mkdir -p "$(dirname "$HOME/.paddlex/official_models")" 2>/dev/null || true
ln -sf "$MODELS_TARGET" "$HOME/.paddlex/official_models" 2>/dev/null || true

# 使用 download_models.py 下载模型
if python3 download_models.py "$MODELS_TARGET"; then
    echo ""
    echo "✅ 模型下载完成"
    
    # 恢复原始 HOME
    export HOME="$ORIGINAL_HOME"
    
    # 再次检查，如果模型下载到了默认位置，复制到目标目录
    if [ -d "$MODELS_SOURCE" ] && [ "$(ls -A $MODELS_SOURCE 2>/dev/null)" ]; then
        if [ ! "$(ls -A $MODELS_TARGET 2>/dev/null)" ]; then
            echo "⚠️  模型下载到了默认位置，正在复制到目标目录..."
            cp -r "$MODELS_SOURCE"/* "$MODELS_TARGET"/ 2>/dev/null || true
        fi
    fi
    
    echo ""
    echo "已下载的模型:"
    ls -lh "$MODELS_TARGET" 2>/dev/null | head -10 || echo "（目录为空或无法列出）"
    echo ""
    echo "=========================================="
    echo "模型初始化完成"
    echo "=========================================="
    exit 0
else
    # 恢复原始 HOME
    export HOME="$ORIGINAL_HOME"
    echo ""
    echo "❌ 模型下载失败"
    echo "=========================================="
    exit 1
fi
