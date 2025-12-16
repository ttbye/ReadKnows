# ReadKnows (读士私人书库) Docker 镜像导入说明

## 文件说明

- `readknows-backend-latest.tar.gz` - 后端服务镜像
- `readknows-frontend-latest.tar.gz` - 前端服务镜像

## 导入方法

### 方法一：使用导入脚本（推荐）

1. 将整个 `docker-images` 目录复制到目标服务器
2. 在目标服务器上运行：
   ```bash
   ./import-images.sh
   ```

### 方法二：手动导入

1. 将镜像文件复制到目标服务器
2. 在目标服务器上执行：
   ```bash
   # 导入后端镜像
   gunzip -c readknows-backend-latest.tar.gz | docker load
   
   # 导入前端镜像
   gunzip -c readknows-frontend-latest.tar.gz | docker load
   ```

3. 验证镜像：
   ```bash
   docker images | grep readknows
   ```

## 安装部署

导入镜像后，在目标服务器上运行：
```bash
./install.sh
```

或者使用 docker-compose：
```bash
docker-compose up -d
```

## 注意事项

1. 确保目标服务器已安装 Docker 和 Docker Compose
2. 确保目标服务器有足够的磁盘空间（建议至少 5GB）
3. 导入镜像后，需要确保 docker-compose.yml 和 .env 文件配置正确
