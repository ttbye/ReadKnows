#!/usr/bin/env python3
"""
CosyVoice 模型下载脚本
"""
import sys
import os
import subprocess
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("Usage: python download-cosyvoice.py <models_dir>")
        sys.exit(1)
    
    models_dir = Path(sys.argv[1])
    cosyvoice_source_dir = models_dir / 'cosyvoice-source'
    
    print(f"[CosyVoice] 开始安装...")
    
    # 检查 Git 是否可用
    try:
        subprocess.run(['git', '--version'], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("ERROR: Git 未安装或不可用")
        print("")
        print("macOS 安装 Git:")
        print("  brew install git")
        print("  或下载 Xcode Command Line Tools: xcode-select --install")
        print("")
        sys.exit(1)
    
    # 检查 Xcode license（macOS）
    if sys.platform == 'darwin':
        try:
            result = subprocess.run(['xcodebuild', '-license', 'check'], capture_output=True, text=True)
            if result.returncode != 0:
                print("WARNING: Xcode license 未同意")
                print("")
                print("请运行以下命令同意 Xcode license:")
                print("  sudo xcodebuild -license")
                print("  然后输入 'agree' 并回车")
                print("")
                print("是否现在尝试同意 license？(y/N): ", end='')
                try:
                    answer = input().strip().lower()
                    if answer == 'y':
                        print("正在同意 Xcode license...")
                        subprocess.run(['sudo', 'xcodebuild', '-license', 'accept'], check=True)
                        print("✅ Xcode license 已同意")
                    else:
                        print("请手动运行: sudo xcodebuild -license")
                        sys.exit(1)
                except (EOFError, KeyboardInterrupt):
                    print("\n请手动运行: sudo xcodebuild -license")
                    sys.exit(1)
        except FileNotFoundError:
            print("WARNING: xcodebuild 未找到，跳过 license 检查")
    
    # 方法1: 尝试使用 pip 直接安装（如果包存在）
    print("[CosyVoice] 尝试方法1: 使用 pip 安装...")
    try:
        subprocess.run([
            sys.executable, '-m', 'pip', 'install',
            'git+https://github.com/FunAudioLLM/CosyVoice.git'
        ], check=True, capture_output=True)
        print("✅ CosyVoice 安装成功（方法1）")
        return
    except subprocess.CalledProcessError:
        print("⚠️  方法1 失败，尝试方法2...")
    
    # 方法2: 手动克隆并安装
    print("[CosyVoice] 尝试方法2: 手动克隆仓库...")
    
    # 确保目录存在
    models_dir.mkdir(parents=True, exist_ok=True)
    
    # 如果已存在，先删除
    if cosyvoice_source_dir.exists():
        print(f"[CosyVoice] 清理已存在的目录: {cosyvoice_source_dir}")
        import shutil
        shutil.rmtree(cosyvoice_source_dir)
    
    # 克隆仓库
    try:
        print(f"[CosyVoice] 克隆仓库到: {cosyvoice_source_dir}")
        subprocess.run([
            'git', 'clone', '--depth', '1',
            'https://github.com/FunAudioLLM/CosyVoice.git',
            str(cosyvoice_source_dir)
        ], check=True)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: 克隆仓库失败: {e}")
        print("")
        print("可能的原因:")
        print("1. 网络问题 - 检查网络连接")
        print("2. Git 未正确安装")
        print("3. Xcode license 未同意（macOS）")
        sys.exit(1)
    
    # 查找 setup.py 或 pyproject.toml
    setup_py = cosyvoice_source_dir / 'setup.py'
    pyproject_toml = cosyvoice_source_dir / 'pyproject.toml'
    
    if setup_py.exists():
        print(f"[CosyVoice] 找到 setup.py，使用 setup.py 安装...")
        try:
            subprocess.run([
                sys.executable, 'setup.py', 'install'
            ], cwd=str(cosyvoice_source_dir), check=True)
            print("✅ CosyVoice 安装成功（方法2: setup.py）")
            return
        except subprocess.CalledProcessError as e:
            print(f"ERROR: setup.py 安装失败: {e}")
    elif pyproject_toml.exists():
        print(f"[CosyVoice] 找到 pyproject.toml，使用 pip 安装...")
        try:
            subprocess.run([
                sys.executable, '-m', 'pip', 'install', '-e', str(cosyvoice_source_dir)
            ], check=True)
            print("✅ CosyVoice 安装成功（方法2: pyproject.toml）")
            return
        except subprocess.CalledProcessError as e:
            print(f"ERROR: pyproject.toml 安装失败: {e}")
    else:
        # 方法3: 尝试查找子目录中的安装文件
        print("[CosyVoice] 尝试方法3: 查找子目录...")
        for subdir in cosyvoice_source_dir.iterdir():
            if subdir.is_dir():
                sub_setup_py = subdir / 'setup.py'
                sub_pyproject_toml = subdir / 'pyproject.toml'
                
                if sub_setup_py.exists():
                    print(f"[CosyVoice] 在 {subdir.name} 中找到 setup.py...")
                    try:
                        subprocess.run([
                            sys.executable, '-m', 'pip', 'install', '-e', str(subdir)
                        ], check=True)
                        print(f"✅ CosyVoice 安装成功（方法3: {subdir.name}）")
                        return
                    except subprocess.CalledProcessError:
                        continue
                elif sub_pyproject_toml.exists():
                    print(f"[CosyVoice] 在 {subdir.name} 中找到 pyproject.toml...")
                    try:
                        subprocess.run([
                            sys.executable, '-m', 'pip', 'install', '-e', str(subdir)
                        ], check=True)
                        print(f"✅ CosyVoice 安装成功（方法3: {subdir.name}）")
                        return
                    except subprocess.CalledProcessError:
                        continue
    
    # 如果所有方法都失败
    print("ERROR: CosyVoice 安装失败")
    print("")
    print("可能的原因:")
    print("1. 仓库结构已更改，不包含标准的 Python 包结构")
    print("2. 需要手动安装依赖")
    print("")
    print("建议:")
    print("1. 查看 CosyVoice 官方文档获取正确的安装方法")
    print("2. 或者暂时跳过 CosyVoice，使用其他模型（Edge-TTS、IndexTTS2）")
    print("")
    print(f"已克隆的仓库位置: {cosyvoice_source_dir}")
    print("您可以手动检查并安装")
    sys.exit(1)


if __name__ == '__main__':
    main()

