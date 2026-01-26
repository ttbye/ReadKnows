#!/bin/bash

# PaddleOCR 模型下载脚本
# 将模型下载到 app/models 目录

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="${SCRIPT_DIR}/models"

echo "=========================================="
echo "PaddleOCR 模型下载工具"
echo "=========================================="
echo ""
echo "模型将下载到: ${MODELS_DIR}"
echo ""

# 创建模型目录
mkdir -p "${MODELS_DIR}"

# 检查 Python 环境
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 Python 3"
    exit 1
fi

# 检查是否安装了 PaddleOCR
if ! python3 -c "import paddleocr" 2>/dev/null; then
    echo "警告: PaddleOCR 未安装，正在安装..."
    pip3 install paddleocr paddlepaddle
fi

# 运行 Python 脚本下载模型
echo "开始下载模型..."
python3 "${SCRIPT_DIR}/download_models.py" "${MODELS_DIR}"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ 模型下载完成！"
    echo "=========================================="
    echo "模型位置: ${MODELS_DIR}"
    echo ""
    echo "使用方法:"
    echo "1. 在 docker-compose.yml 中挂载此目录:"
    echo "   volumes:"
    echo "     - ./ocr-models:/app/models"
    echo ""
    echo "2. 设置环境变量:"
    echo "   OCR_MODELS_DIR=/app/models"
    echo "   PADDLEX_HOME=/app/models"
else
    echo ""
    echo "=========================================="
    echo "❌ 模型下载失败"
    echo "=========================================="
    exit 1
fi
