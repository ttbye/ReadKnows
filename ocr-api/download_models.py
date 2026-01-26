#!/usr/bin/env python3
"""
下载 PaddleOCR 模型文件到指定目录
"""

import os
import sys
from pathlib import Path

def download_models(models_dir: str = "./models"):
    """下载 PaddleOCR 模型到指定目录"""
    models_path = Path(models_dir)
    models_path.mkdir(parents=True, exist_ok=True)
    
    # 获取绝对路径
    absolute_path = models_path.absolute()
    
    # 设置模型下载路径（PaddleOCR 使用 PADDLEX_HOME 环境变量）
    os.environ['PADDLEX_HOME'] = str(absolute_path)
    # 某些版本也可能使用这个环境变量
    os.environ['PADDLEOCR_HOME'] = str(absolute_path)
    # 禁用模型源检查，避免网络连通性检查导致的超时（特别是在群晖等受限环境中）
    os.environ['DISABLE_MODEL_SOURCE_CHECK'] = 'True'
    
    print(f"[模型下载] 模型将保存到: {absolute_path}")
    print(f"[模型下载] PADDLEX_HOME={absolute_path}")
    print("[模型下载] 正在初始化 PaddleOCR 并下载模型...")
    print("[模型下载] 这可能需要几分钟时间，请耐心等待...")
    
    try:
        from paddleocr import PaddleOCR
        
        # 初始化 PaddleOCR（会自动下载模型）
        print("[模型下载] 正在下载中文模型...")
        # PaddleOCR 3.x 版本参数
        try:
            # 尝试 3.x 版本参数
            ocr = PaddleOCR(lang='ch', det_model_dir=None, rec_model_dir=None, cls_model_dir=None)
        except Exception:
            # 如果失败，尝试 2.6.x 版本参数
            try:
                ocr = PaddleOCR(
                    use_angle_cls=True,
                    lang='ch',
                    use_gpu=False
                )
            except Exception as e:
                # 最后尝试，不指定任何参数，让 PaddleOCR 自动处理
                print(f"[模型下载] 警告: 使用兼容模式初始化: {e}")
                ocr = PaddleOCR()
        
        print("[模型下载] ✅ 模型下载完成！")
        
        # 检查模型文件位置 - PaddleOCR 可能将模型下载到 /root/.paddlex/official_models
        default_models_dir = Path("/root/.paddlex/official_models")
        home_models_dir = Path(os.path.expanduser("~/.paddlex/official_models"))
        
        # 如果模型下载到了默认位置，复制到目标目录
        models_to_copy = []
        if default_models_dir.exists() and any(default_models_dir.iterdir()):
            models_to_copy.append(("默认位置", default_models_dir))
        if home_models_dir.exists() and home_models_dir != default_models_dir and any(home_models_dir.iterdir()):
            models_to_copy.append(("HOME目录", home_models_dir))
        
        if models_to_copy and not any(models_path.iterdir()):
            print(f"\n[模型下载] ⚠️  检测到模型下载到了其他位置，正在复制到目标目录...")
            for location_name, source_dir in models_to_copy:
                try:
                    import shutil
                    if source_dir.exists():
                        print(f"[模型下载] 从 {location_name} ({source_dir}) 复制模型...")
                        for item in source_dir.iterdir():
                            dest_item = models_path / item.name
                            if dest_item.exists():
                                if dest_item.is_dir():
                                    shutil.rmtree(dest_item)
                                else:
                                    dest_item.unlink()
                            if item.is_dir():
                                shutil.copytree(item, dest_item)
                            else:
                                shutil.copy2(item, dest_item)
                        print(f"[模型下载] ✅ 模型已从 {location_name} 复制到 {absolute_path}")
                        break  # 只复制第一个找到的位置
                except Exception as e:
                    print(f"[模型下载] ⚠️  从 {location_name} 复制模型时出错: {e}")
        
        print(f"[模型下载] 模型文件位置: {absolute_path}")
        
        # 列出下载的模型
        model_dirs = list(models_path.glob("*"))
        if model_dirs:
            print("\n[模型下载] 已下载的模型:")
            for model_dir in model_dirs:
                if model_dir.is_dir():
                    size = sum(f.stat().st_size for f in model_dir.rglob('*') if f.is_file())
                    size_mb = size / (1024 * 1024)
                    print(f"  - {model_dir.name} ({size_mb:.2f} MB)")
                elif model_dir.is_file():
                    size_mb = model_dir.stat().st_size / (1024 * 1024)
                    print(f"  - {model_dir.name} ({size_mb:.2f} MB)")
        else:
            print("\n[模型下载] ⚠️  警告: 目标模型目录为空")
            if default_models_dir.exists() and any(default_models_dir.iterdir()):
                print(f"[模型下载] 模型可能位于: {default_models_dir}")
                print(f"[模型下载] 将在容器启动时自动复制到挂载目录")
        
        return True
    except Exception as e:
        print(f"[模型下载] ❌ 模型下载失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    # 默认下载到 ./models 目录
    models_dir = sys.argv[1] if len(sys.argv) > 1 else "./models"
    
    print("=" * 60)
    print("PaddleOCR 模型下载工具")
    print("=" * 60)
    
    success = download_models(models_dir)
    
    sys.exit(0 if success else 1)
