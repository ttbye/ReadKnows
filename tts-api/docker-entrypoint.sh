#!/bin/bash
# Docker 容器启动脚本 - 自动安装 TTS 模型

# 不使用 set -e，确保即使安装失败也能启动服务

echo "========================================"
echo "TTS API 容器启动"
echo "========================================"
echo ""

# 检查是否启用自动安装（默认启用）
AUTO_INSTALL_INDEXTTS2=${AUTO_INSTALL_INDEXTTS2:-true}
AUTO_INSTALL_COSYVOICE=${AUTO_INSTALL_COSYVOICE:-true}

MODELS_DIR=${MODELS_DIR:-/app/models}

echo "模型目录: $MODELS_DIR"
echo "自动安装 IndexTTS2: $AUTO_INSTALL_INDEXTTS2"
echo "自动安装 CosyVoice: $AUTO_INSTALL_COSYVOICE"
echo ""

# 函数：检查模型是否已安装
check_indextts2_installed() {
    local indextts2_path="$MODELS_DIR/indextts2/index-tts"
    if [ -d "$indextts2_path" ] && [ -f "$indextts2_path/indextts/infer_v2.py" ]; then
        python3 -c "import sys; sys.path.insert(0, '$indextts2_path'); from indextts.infer_v2 import IndexTTS2" 2>/dev/null && return 0
    fi
    return 1
}

check_cosyvoice_installed() {
    python3 -c "import cosyvoice" 2>/dev/null && return 0
    return 1
}

# 安装 IndexTTS2
if [ "$AUTO_INSTALL_INDEXTTS2" = "true" ]; then
    echo "检查 IndexTTS2..."
    if check_indextts2_installed; then
        echo "✅ IndexTTS2 已安装"
    else
        echo "ℹ️  IndexTTS2 未安装，开始自动安装..."
        if python3 scripts/download-indextts2.py "$MODELS_DIR/indextts2" 2>&1; then
            echo "✅ IndexTTS2 安装成功"
        else
            echo "⚠️  IndexTTS2 安装失败，将继续启动服务"
            echo "   您可以稍后手动安装: docker exec -it readknow-tts-api python3 scripts/download-indextts2.py $MODELS_DIR/indextts2"
        fi
    fi
fi

echo ""

# 安装 CosyVoice
if [ "$AUTO_INSTALL_COSYVOICE" = "true" ]; then
    echo "检查 CosyVoice..."
    if check_cosyvoice_installed; then
        echo "✅ CosyVoice 已安装"
    else
        echo "ℹ️  CosyVoice 未安装，开始自动安装..."
        # 方法1: 直接 pip 安装
        if pip install --quiet --no-cache-dir git+https://github.com/FunAudioLLM/CosyVoice.git 2>&1; then
            echo "✅ CosyVoice 安装成功"
        else
            echo "⚠️  方法1 失败，尝试方法2..."
            # 方法2: 使用下载脚本
            if python3 scripts/download-cosyvoice.py "$MODELS_DIR/cosyvoice" 2>&1; then
                echo "✅ CosyVoice 安装成功"
            else
                echo "⚠️  CosyVoice 安装失败，将继续启动服务"
                echo "   您可以稍后手动安装: docker exec -it readknow-tts-api pip install git+https://github.com/FunAudioLLM/CosyVoice.git"
            fi
        fi
    fi
fi

# 检查 HuggingFace 模型（IndexTTS2 需要）
echo ""
echo "检查 HuggingFace 模型缓存..."
HF_CACHE_DIR="$MODELS_DIR/.cache/huggingface"
OTHER_MODELS_DIR="$MODELS_DIR/../other_models"

# 优先检查 other_models 目录
if [ -d "$OTHER_MODELS_DIR" ]; then
    # 检查是否有标准缓存格式
    if [ -d "$OTHER_MODELS_DIR/.cache/huggingface" ]; then
        echo "✅ 检测到 other_models/.cache/huggingface 目录"
        export HF_HOME="$OTHER_MODELS_DIR/.cache/huggingface"
        export TRANSFORMERS_CACHE="$OTHER_MODELS_DIR/.cache/huggingface"
        export HF_DATASETS_CACHE="$OTHER_MODELS_DIR/.cache/huggingface"
        export HF_HUB_CACHE="$OTHER_MODELS_DIR/.cache/huggingface/hub"
    elif [ -d "$OTHER_MODELS_DIR/huggingface" ]; then
        echo "✅ 检测到 other_models/huggingface 目录"
        export HF_HOME="$OTHER_MODELS_DIR/huggingface"
        export TRANSFORMERS_CACHE="$OTHER_MODELS_DIR/huggingface"
        export HF_DATASETS_CACHE="$OTHER_MODELS_DIR/huggingface"
        export HF_HUB_CACHE="$OTHER_MODELS_DIR/huggingface/hub"
    elif [ -n "$(find $OTHER_MODELS_DIR -name 'config.json' 2>/dev/null | head -1)" ]; then
        echo "✅ 检测到 other_models 目录包含模型文件"
        # 创建标准缓存结构
        mkdir -p "$OTHER_MODELS_DIR/.cache/huggingface/hub"
        export HF_HOME="$OTHER_MODELS_DIR/.cache/huggingface"
        export TRANSFORMERS_CACHE="$OTHER_MODELS_DIR/.cache/huggingface"
        export HF_DATASETS_CACHE="$OTHER_MODELS_DIR/.cache/huggingface"
        export HF_HUB_CACHE="$OTHER_MODELS_DIR/.cache/huggingface/hub"
    fi
fi

# 检查标准缓存目录
if [ -d "$HF_CACHE_DIR" ] && [ -n "$(ls -A $HF_CACHE_DIR 2>/dev/null)" ]; then
    echo "✅ HuggingFace 缓存已存在（标准位置）"
elif [ -z "$HF_HOME" ]; then
    echo "⚠️  HuggingFace 模型未预下载"
    echo "   如果 IndexTTS2 使用失败，请运行:"
    echo "   docker exec -it readknow-tts-api bash /app/pre-download-huggingface-models.sh"
    echo "   或者将模型放到: $OTHER_MODELS_DIR"
fi

echo ""
echo "========================================"
echo "模型状态检查"
echo "========================================"
python3 check-models.py || true

echo ""
echo "========================================"
echo "启动 TTS API 服务"
echo "========================================"
echo ""

# 执行原始命令（uvicorn）
exec "$@"

