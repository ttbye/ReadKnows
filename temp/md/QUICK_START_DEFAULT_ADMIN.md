# 🚀 默认管理员账号 - 快速参考

## 📋 默认账号信息

```plaintext
用户名：books
密码：books
私人访问密钥：books
```

## ⚡ 快速开始

### Docker部署（推荐）

```bash
# 1. 启动
docker-compose up -d

# 2. 访问
http://localhost:1280

# 3. 登录
用户名: books
密码: books
```

### 开发环境

```bash
# 1. 启动
npm run dev

# 2. 访问
http://localhost:3000

# 3. 登录
用户名: books
密码: books
```

## ⚠️ 重要提醒

**首次登录后必须操作**：

1. ✅ 修改默认密码
2. ✅ 修改私人访问密钥

## 🔍 查看日志

```bash
# Docker环境
docker-compose logs backend | grep "默认管理员"

# 本地环境
# 查看控制台输出
```

## 📚 完整文档

- [DEFAULT_ADMIN.md](./DEFAULT_ADMIN.md) - 详细说明
- [CHANGELOG_DEFAULT_ADMIN.md](./CHANGELOG_DEFAULT_ADMIN.md) - 更新日志
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - 实现总结

## 🧪 测试

```bash
# 运行测试脚本
./test-default-admin.sh
```

## ❓ 常见问题

**Q: 什么时候会创建默认账号？**  
A: 仅在数据库完全为空（首次启动）时自动创建。

**Q: 已有用户会受影响吗？**  
A: 不会。只有全新部署才会创建默认账号。

**Q: 如何修改密码？**  
A: 登录后 → 右上角头像 → 个人设置 → 修改密码

**Q: 如何修改私人访问密钥？**  
A: 设置 → 系统设置 → 私人访问密钥 → 修改并保存

**Q: 忘记密码怎么办？**  
A: 查看 [DEFAULT_ADMIN.md](./DEFAULT_ADMIN.md) 的"如果忘记密码"章节

---

**提示**：这是一个快速参考，完整信息请查看 `DEFAULT_ADMIN.md`
