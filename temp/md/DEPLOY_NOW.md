# 🚀 立即部署指令

## ⚡ 快速部署（复制粘贴到远程服务器）

```bash
# =====================================
# KnowBooks 快速部署脚本
# =====================================

cd /volume5/docker/bookpath/install

echo "========================================" 
echo "1. 拉取最新代码"
echo "========================================" 
git pull

echo ""
echo "========================================" 
echo "2. 重新构建镜像"
echo "========================================" 
docker-compose build --no-cache

echo ""
echo "========================================" 
echo "3. 停止旧容器"
echo "========================================" 
docker-compose down

echo ""
echo "========================================" 
echo "4. 启动新容器"
echo "========================================" 
docker-compose up -d

echo ""
echo "========================================" 
echo "5. 等待服务启动（30秒）"
echo "========================================" 
sleep 30

echo ""
echo "========================================" 
echo "6. 验证服务状态"
echo "========================================" 

echo "检查容器状态："
docker-compose ps

echo ""
echo "检查后端健康："
curl -s http://localhost:1201/api/health | head -5

echo ""
echo "检查前端："
curl -s -I http://localhost:1280/ | head -5

echo ""
echo "检查PWA图标："
curl -s -I http://localhost:1280/pwa-192x192.png | head -3

echo ""
echo "测试封面图片："
curl -s -I "http://localhost:1280/books/public/%E6%96%87%E5%AD%A6/%E6%98%8E%E9%81%93/%E4%BA%BA%E6%80%A7%E9%AB%98%E6%89%8B/cover.jpg" | head -5

echo ""
echo "查看默认管理员创建日志："
docker-compose logs backend | grep "默认管理员" | tail -20

echo ""
echo "========================================" 
echo "✅ 部署完成！"
echo "========================================" 
echo ""
echo "🌐 访问地址："
echo "   https://vlistttbye.i234.me:12280"
echo ""
echo "🔑 默认账号："
echo "   用户名: books"
echo "   密码: books"
echo "   私钥: books"
echo ""
echo "⚠️  安全提醒："
echo "   1. 首次登录后立即修改密码"
echo "   2. 修改私人访问密钥"
echo "   3. 配置访问控制策略"
echo ""
echo "📚 查看文档："
echo "   - FIX_SUMMARY.md"
echo "   - DEFAULT_ADMIN.md"
echo "   - QUICK_START_DEFAULT_ADMIN.md"
echo ""
echo "========================================" 
```

---

## 📋 部署检查清单

### 部署前

- [ ] 代码已提交到Git仓库
- [ ] 远程服务器已拉取最新代码
- [ ] 确认Docker服务正常运行

### 部署中

- [ ] 执行 `docker-compose build --no-cache`
- [ ] 执行 `docker-compose down`
- [ ] 执行 `docker-compose up -d`
- [ ] 等待容器启动（30秒）

### 部署后

- [ ] 容器状态正常（`docker-compose ps`）
- [ ] 后端API正常（`/api/health` 返回200）
- [ ] 前端服务正常（可以访问）
- [ ] PWA图标正常（`/pwa-192x192.png` 返回200）
- [ ] 封面图片正常（中文路径返回200）
- [ ] 默认管理员已创建（查看日志）

### 安全配置

- [ ] 使用默认账号登录成功
- [ ] 修改默认密码
- [ ] 修改私人访问密钥
- [ ] 配置访问控制策略

---

## 🧪 快速测试命令

```bash
# 在远程服务器上执行

# 1. 测试后端
curl http://localhost:1201/api/health

# 2. 测试前端
curl -I http://localhost:1280/

# 3. 测试PWA图标
curl -I http://localhost:1280/pwa-192x192.png

# 4. 测试封面图片（使用你实际的图片路径）
curl -I "http://localhost:1280/books/public/文学/明道/人性高手/cover.jpg"

# 5. 测试公网访问
curl -k -I https://vlistttbye.i234.me:12280/

# 6. 查看日志
docker-compose logs -f backend | grep -E "默认管理员|收到文件请求"
```

---

## 🔧 如果遇到问题

### 问题1: Git pull 冲突

```bash
# 保存本地修改
git stash

# 拉取最新代码
git pull

# 恢复本地修改（如果需要）
git stash pop
```

### 问题2: 容器启动失败

```bash
# 查看错误日志
docker-compose logs backend
docker-compose logs frontend

# 检查端口占用
netstat -tlnp | grep -E "1201|1280"

# 重启Docker服务
systemctl restart docker
docker-compose up -d
```

### 问题3: PWA图标404

```bash
# 在容器内创建图标
cd /volume5/docker/bookpath/install

# 下载并执行创建脚本
./create-pwa-icons-remote.sh

# 或者，在容器内手动创建
docker exec knowbooks-frontend sh -c "
  cd /usr/share/nginx/html
  echo 'iVBORw0KGgoAAAANSUhEUgAAAMAAAADAAQMAAABoEv5EAAAABlBMVEVPRuV8Ou0qVCl1AAAAy0lEQVRYw+3WMQ6AIBBFUbfxNrANx+U4tocDdsRaK03MUoig84qf6P4kMD8AAAAAAAAAAADgvxQ0bMo2FdO0zdVxg5qGTdmmYpq2uTpuUNOwKdtUTNM2V8cNaho2ZZuKadrm6rhBTcOmbFMxTdtcHTeoadiUbSqmaZur4wY1DZuyTcU0bXN13KCmYVO2qZimba6OG9Q0bMo2FdO0zdVxg5qGTdmmYpq2uTpuUNOwKdtUTNM2V8cNaho2ZZuKadrm6rhBTcOmbFMxTdtcHTcAAAD4tQsHOwMDbOT3SQAAAABJRU5ErkJggg==' | base64 -d > pwa-192x192.png
  cp pwa-192x192.png pwa-512x512.png
  ls -lh pwa-*.png
"
```

### 问题4: 默认账号无法登录

```bash
# 检查数据库
docker exec knowbooks-backend node -e "
  const Database = require('better-sqlite3');
  const db = new Database('./data/database.db');
  const users = db.prepare('SELECT username, email, role FROM users').all();
  console.log(JSON.stringify(users, null, 2));
  db.close();
"

# 如果没有用户，删除数据库重新初始化
docker-compose down
rm /volume5/docker/bookpath/data/database.db
docker-compose up -d
```

---

## 📱 移动端测试

部署完成后，在手机浏览器测试：

1. 访问：https://vlistttbye.i234.me:12280
2. 登录系统
3. 点击浏览器菜单 → "添加到主屏幕"
4. 查看PWA图标是否正常显示
5. 测试离线功能

---

## 🎉 部署成功标志

- ✅ 访问网站正常，无502错误
- ✅ 可以使用 books/books 登录
- ✅ 封面图片正常显示
- ✅ PWA图标正常，无报错
- ✅ 可以添加到主屏幕
- ✅ 阅读功能正常

---

**准备好了吗？**

复制上面的快速部署脚本到远程服务器执行即可！🚀
