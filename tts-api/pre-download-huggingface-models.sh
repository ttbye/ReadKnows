#!/bin/bash
# 预下载 HuggingFace 模型脚本

echo "========================================"
echo "预下载 HuggingFace 模型"
echo "========================================"
echo ""

# 设置缓存目录（使用挂载的卷）
HF_CACHE_DIR=${HF_CACHE_DIR:-/app/models/.cache/huggingface}
export HF_HOME=$HF_CACHE_DIR
export TRANSFORMERS_CACHE=$HF_CACHE_DIR
export HF_DATASETS_CACHE=$HF_CACHE_DIR

# 创建缓存目录
mkdir -p "$HF_CACHE_DIR"

echo "HuggingFace 缓存目录: $HF_CACHE_DIR"
echo ""

# 下载 facebook/w2v-bert-2.0 模型
echo "正在下载 facebook/w2v-bert-2.0..."
python3 << 'PYTHON_SCRIPT'
import os
import sys

# 设置环境变量
os.environ['HF_HOME'] = os.environ.get('HF_CACHE_DIR', '/app/models/.cache/huggingface')
os.environ['TRANSFORMERS_CACHE'] = os.environ['HF_HOME']
os.environ['HF_DATASETS_CACHE'] = os.environ['HF_HOME']

try:
    from transformers import Wav2Vec2BertModel, SeamlessM4TFeatureExtractor
    
    print("下载 Wav2Vec2BertModel...")
    model = Wav2Vec2BertModel.from_pretrained('facebook/w2v-bert-2.0', cache_dir=os.environ['HF_HOME'])
    print("✅ Wav2Vec2BertModel 下载完成")
    
    print("下载 SeamlessM4TFeatureExtractor...")
    extractor = SeamlessM4TFeatureExtractor.from_pretrained('facebook/w2v-bert-2.0', cache_dir=os.environ['HF_HOME'])
    print("✅ SeamlessM4TFeatureExtractor 下载完成")
    
    print("\n✅ 所有模型下载完成")
    print(f"缓存位置: {os.environ['HF_HOME']}")
    
except ImportError as e:
    print(f"❌ 导入失败: {e}")
    print("请确保已安装 transformers: pip install transformers")
    sys.exit(1)
except Exception as e:
    print(f"❌ 下载失败: {e}")
    print("\n可能的原因:")
    print("1. 网络连接问题")
    print("2. HuggingFace 服务不可用")
    print("3. 磁盘空间不足")
    sys.exit(1)
PYTHON_SCRIPT

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "✅ 预下载完成"
    echo "========================================"
    echo ""
    echo "模型已保存到: $HF_CACHE_DIR"
    echo "现在可以使用 IndexTTS2 了"
else
    echo ""
    echo "========================================"
    echo "❌ 预下载失败"
    echo "========================================"
    echo ""
    echo "请检查网络连接或手动下载模型"
    exit 1
fi

