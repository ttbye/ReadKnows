# 临时文件目录

此目录包含已移动到临时位置的文件，这些文件可能不再需要，但保留作为备份。

## 目录结构

- `SH/` - 原 SH 目录下的所有脚本
- `*.sh` - 各种部署、诊断、修复脚本
- `*.js` - PWA 图标生成脚本等

## 说明

如果需要使用这些文件，可以从 temp 目录中恢复。

## 保留的核心脚本

以下脚本保留在项目根目录：

### 安装相关
- `install.sh` - 主安装脚本
- `install-calibre.sh` - Calibre 安装和修复脚本
- `init-admin.sh` - 管理员账户初始化脚本

### Docker 相关
- `DockerbuildImages.sh` - Docker 镜像构建脚本（通用平台）
- `DockerbuildImages-synology.sh` - Docker 镜像构建脚本（群晖 NAS）
- `Dockerrebuild.sh` - Docker 镜像重建脚本
- `docker-restart.sh` - Docker 容器重启脚本
- `docker-status.sh` - Docker 状态检查脚本
- `Dockerexport-images.sh` - Docker 镜像导出脚本
- `Dockerimport-images.sh` - Docker 镜像导入脚本

