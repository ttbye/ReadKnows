#!/bin/bash
# Docker 容器内安装 TTS 模型的脚本

echo "========================================"
echo "在 Docker 容器内安装 TTS 模型"
echo "========================================"
echo ""

# 检查是否在 Docker 容器内
if [ -z "$IS_DOCKER" ]; then
    echo "⚠️  此脚本应在 Docker 容器内运行"
    echo "使用方法:"
    echo "  docker exec -it readknow-tts-api bash"
    echo "  ./install-models-docker.sh"
    exit 1
fi

MODELS_DIR=${MODELS_DIR:-/app/models}

echo "模型目录: $MODELS_DIR"
echo ""

# 1. 安装 IndexTTS2
echo "========================================"
echo "1. 安装 IndexTTS2"
echo "========================================"
read -p "是否安装 IndexTTS2？(y/N): " install_indextts2
if [[ $install_indextts2 =~ ^[Yy]$ ]]; then
    echo "ℹ️  安装 IndexTTS2..."
    python3 scripts/download-indextts2.py $MODELS_DIR/indextts2
    if [ $? -eq 0 ]; then
        echo "✅ IndexTTS2 安装成功"
    else
        echo "❌ IndexTTS2 安装失败"
    fi
else
    echo "⏭️  跳过 IndexTTS2 安装"
fi

echo ""

# 2. 安装 CosyVoice
echo "========================================"
echo "2. 安装 CosyVoice"
echo "========================================"
read -p "是否安装 CosyVoice？(y/N): " install_cosyvoice
if [[ $install_cosyvoice =~ ^[Yy]$ ]]; then
    echo "ℹ️  安装 CosyVoice..."
    python3 scripts/download-cosyvoice.py $MODELS_DIR/cosyvoice
    if [ $? -eq 0 ]; then
        echo "✅ CosyVoice 安装成功"
    else
        echo "❌ CosyVoice 安装失败"
        echo "   尝试直接安装..."
        pip install git+https://github.com/FunAudioLLM/CosyVoice.git
        if [ $? -eq 0 ]; then
            echo "✅ CosyVoice 安装成功（通过 pip）"
        else
            echo "❌ CosyVoice 安装失败"
        fi
    fi
else
    echo "⏭️  跳过 CosyVoice 安装"
fi

echo ""
echo "========================================"
echo "安装完成"
echo "========================================"
echo ""
echo "验证安装:"
python3 check-models.py

