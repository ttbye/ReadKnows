# ⚡ Docker 脚本 - 快速参考

## 🚀 一键命令

```bash
# 完整重新部署（推荐）⭐
./redeploy.sh

# 快速部署（无交互）
./deploy-quick.sh

# 重启容器
./docker-restart.sh

# 查看日志
./docker-logs.sh

# 状态检查
./docker-status.sh
```

---

## 📊 功能对比

| 脚本 | 重建镜像 | 时间 | 交互 | 场景 |
|------|---------|------|------|------|
| `redeploy.sh` | ✅ | 5-10分钟 | ✅ | 正式部署 |
| `deploy-quick.sh` | ✅ | 3-5分钟 | ❌ | 快速重建 |
| `docker-restart.sh` | ❌ | 10秒 | ❌ | 重启容器 |

---

## 🎯 常用场景

### 更新代码后

```bash
./redeploy.sh
# 或
git pull && ./deploy-quick.sh
```

### 修改配置后

```bash
# 只修改环境变量或 docker-compose.yml
./docker-restart.sh

# 修改了 Dockerfile
./redeploy.sh
```

### 调试问题

```bash
./docker-status.sh    # 检查状态
./docker-logs.sh      # 查看日志
```

---

## ⚡ 最快部署

```bash
./deploy-quick.sh
```

---

## 🔍 检查健康

```bash
./docker-status.sh
```

---

## 📝 手动命令

```bash
# 停止
docker-compose down

# 构建
docker-compose build --no-cache

# 启动
docker-compose up -d

# 状态
docker-compose ps

# 日志
docker-compose logs -f backend
```

---

## 💡 提示

- **首次部署**：使用 `redeploy.sh`
- **日常更新**：使用 `deploy-quick.sh`
- **遇到问题**：使用 `docker-status.sh` + `docker-logs.sh`
