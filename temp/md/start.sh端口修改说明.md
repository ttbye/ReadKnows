# 🔧 start.sh 端口修改说明

## 🎯 问题

用户使用 `start.sh` 一键启动时，端口仍然是 3000 和 3001，而不是新的 1280 和 1281。

## ✅ 已修复

### 修改的文件

1. **start.sh** - 一键启动脚本
2. **frontend/vite.config.ts** - 前端开发服务器端口
3. **md/README.md** - 文档中的端口说明

---

## 📝 修改详情

### 1. start.sh 修改内容

#### ✅ 环境变量默认值
```bash
# 修改前
PORT=3001

# 修改后
PORT=1281
```

#### ✅ 端口检查
```bash
# 修改前
check_port 3001
check_port 3000
PORT_3001_OK=0
PORT_3000_OK=0

# 修改后
check_port 1281
check_port 1280
PORT_1281_OK=0
PORT_1280_OK=0
```

#### ✅ 后端健康检查
```bash
# 修改前
curl -s http://localhost:3001/api/health
echo "API地址: http://localhost:3001"
echo "OPDS地址: http://localhost:3001/opds/"

# 修改后
curl -s http://localhost:1281/api/health
echo "API地址: http://localhost:1281"
echo "OPDS地址: http://localhost:1281/opds/"
```

#### ✅ 前端健康检查
```bash
# 修改前
curl -s http://localhost:3000
echo "前端地址: http://localhost:3000"

# 修改后
curl -s http://localhost:1280
echo "前端地址: http://localhost:1280"
```

#### ✅ 显示信息
```bash
# 修改前
echo "前端: http://localhost:3000"
echo "后端: http://localhost:3001"
echo "OPDS: http://localhost:3001/opds/"
echo "确保防火墙允许端口 3000 和 3001"

# 修改后
echo "前端: http://localhost:1280"
echo "后端: http://localhost:1281"
echo "OPDS: http://localhost:1281/opds/"
echo "确保防火墙允许端口 1280 和 1281"
```

---

### 2. frontend/vite.config.ts 修改

```typescript
// 修改前
server: {
  host: '0.0.0.0',
  port: 3000,
  ...
}

// 修改后
server: {
  host: '0.0.0.0',
  port: 1280,
  ...
}
```

---

### 3. md/README.md 修改

```markdown
# 修改前
PORT=3001
后端服务器: http://localhost:3001
前端开发服务器: http://localhost:3000
访问: http://localhost:3000
默认端口: 3001

# 修改后
PORT=1281
后端服务器: http://localhost:1281
前端开发服务器: http://localhost:1280
访问: http://localhost:1280
默认端口: 1281
```

---

## 🚀 使用方法

### 一键启动

```bash
cd /Users/ttbye/MyCODE/KnowBooks
./start.sh
```

### 预期输出

```
========================================
  EpubManager 一键启动脚本
========================================

✓ Node.js 版本: v20.x.x
✓ npm 版本: 10.x.x

📦 检查根目录依赖...
✓ 根目录依赖已安装

📦 检查后端依赖...
✓ 后端依赖已安装

🔧 检查 better-sqlite3...
✓ better-sqlite3 就绪

📦 检查前端依赖...
✓ 前端依赖已安装

⚙️  检查配置文件...
✓ 配置文件就绪

📁 创建必要目录...
✓ 目录已创建

🔍 检查端口占用...
✓ 端口 1281 可用
✓ 端口 1280 可用

🚀 启动后端服务器...
等待后端启动...
✓ 后端服务器启动成功 (PID: xxxxx)
   API地址: http://localhost:1281
   OPDS地址: http://localhost:1281/opds/

🚀 启动前端服务器...
等待前端启动...
✓ 前端服务器启动成功 (PID: xxxxx)
   前端地址: http://localhost:1280

========================================
  ✅ 服务启动成功！
========================================

本地访问：
  前端: http://localhost:1280
  后端: http://localhost:1281
  OPDS: http://localhost:1281/opds/

局域网访问：
  前端: http://192.168.x.x:1280
  后端: http://192.168.x.x:1281
  OPDS: http://192.168.x.x:1281/opds/

💡 提示: 确保防火墙允许端口 1280 和 1281

日志文件:
  后端: /path/to/backend.log
  前端: /path/to/frontend.log

按 Ctrl+C 停止服务
```

---

## ✅ 验证

### 1. 检查端口

```bash
# 检查端口是否监听
lsof -i :1280
lsof -i :1281

# 或使用 netstat
netstat -tlnp | grep -E "1280|1281"
```

### 2. 测试服务

```bash
# 测试后端
curl http://localhost:1281/api/health

# 测试前端
curl http://localhost:1280

# 测试前端代理后端
curl http://localhost:1280/api/health
```

### 3. 浏览器访问

- **前端**：http://localhost:1280
- **后端API**：http://localhost:1281/api/health
- **OPDS**：http://localhost:1281/opds/

---

## 📊 端口总结

| 服务 | 开发环境 | Docker环境 | 说明 |
|------|---------|-----------|------|
| **前端** | 1280 | 1280 | 统一使用1280 |
| **后端** | 1281 | 1281 | 统一使用1281 |

---

## 🎯 关键修改点

1. ✅ **start.sh** - 所有端口引用已更新
2. ✅ **vite.config.ts** - 开发服务器端口已更新
3. ✅ **README.md** - 文档已更新

---

## ⚠️ 注意事项

### 如果已有 .env 文件

如果 `backend/.env` 文件中已经设置了 `PORT=3001`，需要手动修改：

```bash
# 编辑 .env 文件
cd backend
nano .env  # 或使用其他编辑器

# 修改 PORT
PORT=1281
```

### 如果端口被占用

```bash
# 检查占用
lsof -i :1280
lsof -i :1281

# 停止占用进程
kill -9 <PID>
```

---

## ✅ 完成

所有端口配置已统一修改完成！

**修改日期**：2025-12-11  
**状态**：✅ 已完成

现在运行 `./start.sh` 应该使用正确的端口 1280 和 1281 了！
