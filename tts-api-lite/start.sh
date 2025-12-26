#!/bin/bash
# TTS-API-Lite 启动脚本

set -e

echo "=========================================="
echo "TTS-API-Lite 启动脚本"
echo "=========================================="

# 检查 Python 版本
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 未安装，请先安装 Python 3.11+"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✅ Python 版本: $(python3 --version)"

# 检查依赖
if [ ! -d "venv" ]; then
    echo "ℹ️  创建虚拟环境..."
    python3 -m venv venv
fi

echo "ℹ️  激活虚拟环境..."
source venv/bin/activate

echo "ℹ️  安装依赖..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

# 创建必要的目录
mkdir -p temp static

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，使用默认配置"
    echo "   提示：可以复制 .env.example 到 .env 并修改配置"
fi

# 设置环境变量
export PORT=${PORT:-5050}
export TEMP_DIR=${TEMP_DIR:-./temp}

echo ""
echo "=========================================="
echo "启动 TTS-API-Lite 服务"
echo "=========================================="
echo "端口: $PORT"
echo "临时目录: $TEMP_DIR"
echo ""
echo "访问地址:"
echo "  - API 文档: http://localhost:$PORT/docs"
echo "  - 测试页面: http://localhost:$PORT/test"
echo "  - 健康检查: http://localhost:$PORT/health"
echo ""
echo "按 Ctrl+C 停止服务"
echo "=========================================="
echo ""

# 启动服务
uvicorn app.main:app --host 0.0.0.0 --port $PORT

