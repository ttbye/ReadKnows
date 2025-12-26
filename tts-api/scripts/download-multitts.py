#!/usr/bin/env python3
"""
MultiTTS 模型下载脚本
"""
import sys
import subprocess


def main():
    if len(sys.argv) < 2:
        print("Usage: python download-multitts.py <models_dir>")
        sys.exit(1)
    
    models_dir = sys.argv[1]
    
    print(f"[MultiTTS] 开始安装...")
    
    # 尝试安装 MultiTTS
    try:
        subprocess.run([
            sys.executable, '-m', 'pip', 'install', 'multi-tts'
        ], check=True, capture_output=True)
        print(f"[MultiTTS] 安装完成（模型会在首次使用时自动下载）")
    except subprocess.CalledProcessError:
        print("WARNING: multi-tts 包在 PyPI 上不存在")
        print("")
        print("MultiTTS 可能:")
        print("1. 不是标准的 PyPI 包")
        print("2. 需要从 GitHub 或其他源安装")
        print("3. 或者项目已改名/不再维护")
        print("")
        print("建议:")
        print("- 如果不需要 MultiTTS，可以跳过")
        print("- 如果需要，请查看 MultiTTS 官方文档获取正确的安装方法")
        print("")
        print("⚠️  MultiTTS 安装失败，但不会影响其他模型的使用")
        # 不抛出异常，允许继续
        return


if __name__ == '__main__':
    main()

