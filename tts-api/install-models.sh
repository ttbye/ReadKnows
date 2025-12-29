#!/bin/bash

# TTS 模型安装脚本

echo "========================================"
echo "TTS 模型安装脚本"
echo "========================================"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
fi

# 创建虚拟环境（如果不存在）
if [ ! -d "venv" ]; then
    echo "ℹ️  创建虚拟环境..."
    python3 -m venv venv
fi

echo "ℹ️  激活虚拟环境..."
source venv/bin/activate

echo "ℹ️  安装基础依赖..."
pip install -r requirements.txt

# 创建模型目录
mkdir -p models/{indextts2,cosyvoice,multitts}/reference_audio

echo ""
echo "========================================"
echo "开始安装 TTS 模型"
echo "========================================"

# 1. Edge-TTS（已包含在 requirements.txt 中）
echo ""
echo "✅ Edge-TTS: 已安装（edge-tts 包）"

# 2. Qwen-TTS（需要 API Key）
echo ""
echo "ℹ️  Qwen-TTS: 需要设置 QWEN_API_KEY 环境变量"
echo "   在 .env 文件中设置: QWEN_API_KEY=your-api-key"

# 3. IndexTTS2
echo ""
read -p "是否安装 IndexTTS2？(y/N): " install_indextts2
if [[ $install_indextts2 =~ ^[Yy]$ ]]; then
    # 检查 Git LFS
    if ! command -v git-lfs &> /dev/null; then
        echo "⚠️  Git LFS 未安装"
        echo "   安装方法:"
        echo "   macOS: brew install git-lfs && git lfs install"
        echo "   Linux: sudo apt-get install git-lfs && git lfs install"
        echo ""
        read -p "是否现在安装 Git LFS？(y/N): " install_gitlfs
        if [[ $install_gitlfs =~ ^[Yy]$ ]]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                if command -v brew &> /dev/null; then
                    brew install git-lfs
                    git lfs install
                else
                    echo "❌ Homebrew 未安装，请手动安装 Git LFS"
                    exit 1
                fi
            else
                echo "请手动安装 Git LFS: sudo apt-get install git-lfs && git lfs install"
                exit 1
            fi
        else
            echo "⏭️  跳过 IndexTTS2 安装（需要 Git LFS）"
            install_indextts2="n"
        fi
    fi
    
    if [[ $install_indextts2 =~ ^[Yy]$ ]]; then
        echo "ℹ️  安装 IndexTTS2..."
        python3 scripts/download-indextts2.py models/indextts2
        if [ $? -eq 0 ]; then
            echo "✅ IndexTTS2 安装成功"
        else
            echo "❌ IndexTTS2 安装失败"
        fi
    fi
else
    echo "⏭️  跳过 IndexTTS2 安装"
fi

# 4. CosyVoice
echo ""
read -p "是否安装 CosyVoice？(y/N): " install_cosyvoice
if [[ $install_cosyvoice =~ ^[Yy]$ ]]; then
    # 检查 Xcode license（macOS）
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if xcodebuild -license check &> /dev/null; then
            echo "✅ Xcode license 已同意"
        else
            echo "⚠️  Xcode license 未同意"
            echo "   需要运行: sudo xcodebuild -license"
            echo ""
            read -p "是否现在同意 Xcode license？(需要输入密码) (y/N): " agree_license
            if [[ $agree_license =~ ^[Yy]$ ]]; then
                sudo xcodebuild -license accept
                if [ $? -eq 0 ]; then
                    echo "✅ Xcode license 已同意"
                else
                    echo "❌ Xcode license 同意失败，请手动运行: sudo xcodebuild -license"
                    echo "⏭️  跳过 CosyVoice 安装"
                    install_cosyvoice="n"
                fi
            else
                echo "⏭️  跳过 CosyVoice 安装（需要同意 Xcode license）"
                install_cosyvoice="n"
            fi
        fi
    fi
    
    if [[ $install_cosyvoice =~ ^[Yy]$ ]]; then
        echo "ℹ️  安装 CosyVoice..."
        python3 scripts/download-cosyvoice.py models/cosyvoice
        if [ $? -eq 0 ]; then
            echo "✅ CosyVoice 安装成功（模型会在首次使用时自动下载）"
        else
            echo "❌ CosyVoice 安装失败"
            echo "   可能的原因："
            echo "   1. Xcode license 未同意"
            echo "   2. Git 未安装"
            echo "   3. 网络问题"
        fi
    fi
else
    echo "⏭️  跳过 CosyVoice 安装"
fi

# 5. MultiTTS
echo ""
read -p "是否安装 MultiTTS？(y/N): " install_multitts
if [[ $install_multitts =~ ^[Yy]$ ]]; then
    echo "ℹ️  安装 MultiTTS..."
    python3 scripts/download-multitts.py models/multitts
    if [ $? -eq 0 ]; then
        echo "✅ MultiTTS 安装成功（模型会在首次使用时自动下载）"
    else
        echo "⚠️  MultiTTS 安装失败（包可能不存在）"
        echo "   可以暂时跳过，使用其他模型"
    fi
else
    echo "⏭️  跳过 MultiTTS 安装"
fi

echo ""
echo "========================================"
echo "安装完成"
echo "========================================"
echo ""
echo "📝 下一步："
echo "1. 编辑 .env 文件设置 API_KEY（可选）"
echo "2. 如果使用 Qwen-TTS，设置 QWEN_API_KEY"
echo "3. 运行服务: ./run.sh"
echo "4. 检查模型状态: python3 check-models.py"
echo ""
