#!/bin/bash

# TTS API 开发启动脚本

echo "========================================"
echo "TTS API 开发环境启动"
echo "========================================"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
fi

# 检查 FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg 未安装，音频转换可能失败"
    echo "   安装: brew install ffmpeg (macOS) 或 apt-get install ffmpeg (Linux)"
fi

# 安装依赖
if [ ! -d "venv" ]; then
    echo "ℹ️  创建虚拟环境..."
    python3 -m venv venv
fi

echo "ℹ️  激活虚拟环境..."
source venv/bin/activate

echo "ℹ️  安装依赖..."
pip install -r requirements.txt

# 创建必要的目录
mkdir -p models temp static

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "ℹ️  创建 .env 文件..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件设置 API_KEY 等配置"
fi

# 设置模型目录（如果未设置，尝试使用 Docker 挂载目录）
if [ -z "$MODELS_DIR" ]; then
    # 检查常见的 Docker 挂载路径
    if [ -d "/mnt/d/Docker/ReadKnows/tts-models" ]; then
        export MODELS_DIR="/mnt/d/Docker/ReadKnows/tts-models"
        echo "ℹ️  使用 Docker 挂载的模型目录: $MODELS_DIR"
    elif [ -d "$HOME/Docker/ReadKnows/tts-models" ]; then
        export MODELS_DIR="$HOME/Docker/ReadKnows/tts-models"
        echo "ℹ️  使用 Docker 挂载的模型目录: $MODELS_DIR"
    else
        echo "ℹ️  使用本地模型目录: $(pwd)/models"
        echo "   提示: 设置 MODELS_DIR 环境变量可指定其他目录"
    fi
else
    echo "ℹ️  使用自定义模型目录: $MODELS_DIR"
fi

# 启动服务
echo "✅ 启动服务..."
echo "📍 API 文档 (Swagger): http://localhost:5050/docs"
echo "📍 API 文档 (ReDoc): http://localhost:5050/redoc"
echo "📍 测试页面: http://localhost:5050/test"
echo ""
uvicorn app.main:app --host 0.0.0.0 --port 5050 --reload

