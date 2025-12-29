#!/usr/bin/env python3
"""
IndexTTS2 模型下载脚本
"""
import sys
import os
import subprocess
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("Usage: python download-indextts2.py <models_dir>")
        sys.exit(1)
    
    models_dir = Path(sys.argv[1])
    indextts2_dir = models_dir / 'index-tts'
    
    print(f"[IndexTTS2] 开始下载到: {indextts2_dir}")
    
    # 检查 Git LFS
    try:
        result = subprocess.run(['git', 'lfs', 'version'], check=True, capture_output=True, text=True)
        print(f"[IndexTTS2] Git LFS 已安装: {result.stdout.strip()}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("ERROR: Git LFS 未安装")
        print("")
        print("安装 Git LFS:")
        print("  Windows: 下载并安装 https://git-lfs.github.com/")
        print("           或使用 Chocolatey: choco install git-lfs")
        print("           然后运行: git lfs install")
        print("  macOS: brew install git-lfs && git lfs install")
        print("  Linux: sudo apt-get install git-lfs && git lfs install")
        print("         或 sudo yum install git-lfs && git lfs install")
        print("")
        sys.exit(1)
    
    # 克隆仓库
    if not indextts2_dir.exists():
        print(f"[IndexTTS2] 克隆仓库...")
        subprocess.run(['git', 'clone', 'https://github.com/index-tts/index-tts.git', str(indextts2_dir)], check=True)
    else:
        print(f"[IndexTTS2] 仓库已存在: {indextts2_dir}")
    
    # 安装依赖
    print(f"[IndexTTS2] 安装依赖...")
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-e', str(indextts2_dir)], check=True)
    
    print(f"[IndexTTS2] 下载完成")


if __name__ == '__main__':
    main()

