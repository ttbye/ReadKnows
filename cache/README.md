# Calibre 安装缓存目录

此目录用于缓存 Calibre 的安装文件，加速重复安装过程。

## 缓存内容

- `linux-installer.sh`: Calibre 安装脚本（约 10-20KB）
- `calibre-*.tar.xz`: Calibre 二进制安装包（约 100-200MB）

## 工作原理

1. **首次安装**：
   - 下载安装脚本和二进制文件
   - 自动保存到 `./cache/calibre/` 目录

2. **后续安装**：
   - 自动检测缓存目录
   - 如果存在缓存文件，直接使用，无需重新下载
   - 大幅缩短安装时间（从几分钟缩短到几秒钟）

## 缓存位置

- 宿主机：`./cache/calibre/`
- 容器内：`/app/cache/calibre/`（通过 Docker volume 挂载）

## 清理缓存

如果需要强制重新下载，可以删除缓存目录：

```bash
rm -rf ./cache/calibre
```

## 注意事项

- 缓存文件不会自动更新，如果 Calibre 发布了新版本，需要手动清理缓存
- 缓存目录已添加到 `.gitignore`，不会提交到 Git 仓库

