# 密钥管理脚本使用说明

## 概述

`manageKeys.js` 和 `manage-keys.sh` 是用于管理数据库中API Key和私有访问密钥的命令行工具。

## 使用方法

### 方式1：使用Shell脚本（推荐）

```bash
cd backend/scripts
./manage-keys.sh [command] [args...]
```

### 方式2：直接使用Node.js脚本

```bash
cd backend/scripts
node manageKeys.js [command] [args...]
```

## 命令列表

### 1. 显示当前密钥

```bash
./manage-keys.sh show
# 或
node manageKeys.js show
```

**输出示例**:
```
========================================
当前密钥信息
========================================
API Key: xxxxxxxxxxxxxxxx
私有访问密钥: xxxxxxxxxxxxxxxxxxxx
========================================
```

### 2. 设置API Key

```bash
./manage-keys.sh set-api-key "your-api-key-here"
# 或
node manageKeys.js set-api-key "your-api-key-here"
```

**要求**:
- API Key长度至少8位
- 建议使用强密钥（包含大小写字母、数字和特殊字符）

### 3. 设置私有访问密钥

```bash
./manage-keys.sh set-private-key "your-private-key-here"
# 或
node manageKeys.js set-private-key "your-private-key-here"
```

**要求**:
- 私有访问密钥长度至少8位
- 建议使用强密钥

### 4. 生成新的API Key

```bash
./manage-keys.sh generate-api-key
# 或
node manageKeys.js generate-api-key
```

**说明**:
- 自动生成16位随机密钥
- 包含大小写字母、数字和特殊字符

### 5. 生成新的私有访问密钥

```bash
./manage-keys.sh generate-private-key
# 或
node manageKeys.js generate-private-key
```

**说明**:
- 自动生成20位随机密钥
- 包含大小写字母、数字和特殊字符

### 6. 生成所有密钥

```bash
./manage-keys.sh generate-all
# 或
node manageKeys.js generate-all
```

**说明**:
- 同时生成API Key和私有访问密钥
- 适用于首次安装或重置所有密钥

## 使用示例

### 示例1：查看当前密钥

```bash
cd backend/scripts
./manage-keys.sh show
```

### 示例2：设置自定义API Key

```bash
cd backend/scripts
./manage-keys.sh set-api-key "MyCustomAPIKey123!@#"
```

### 示例3：生成新的API Key

```bash
cd backend/scripts
./manage-keys.sh generate-api-key
```

### 示例4：重置所有密钥

```bash
cd backend/scripts
./manage-keys.sh generate-all
```

## 环境变量

可以通过环境变量指定数据库路径：

```bash
export DB_PATH=/path/to/database.db
./manage-keys.sh show
```

默认数据库路径：`./data/database.db`（相对于backend目录）

## 安全注意事项

1. **密钥安全**：
   - 不要在公共场合显示密钥
   - 不要将密钥提交到代码仓库
   - 定期更换密钥

2. **权限控制**：
   - 确保脚本文件权限正确（建议：`chmod 700 manage-keys.sh`）
   - 只有管理员应该能够运行此脚本

3. **备份**：
   - 更新密钥前，建议先备份数据库
   - 记录旧密钥，以便需要时恢复

4. **通知**：
   - 更新API Key后，需要更新所有使用该密钥的客户端
   - 更新私有访问密钥后，需要通知所有需要此密钥的用户

## 故障排除

### 问题1：找不到数据库文件

**错误信息**:
```
错误: 无法打开数据库文件
```

**解决方法**:
1. 检查数据库路径是否正确
2. 使用环境变量指定数据库路径：`export DB_PATH=/path/to/database.db`
3. 确保数据库文件存在且有读取权限

### 问题2：权限不足

**错误信息**:
```
错误: 无法写入数据库
```

**解决方法**:
1. 检查数据库文件权限
2. 确保有写入权限：`chmod 644 database.db`
3. 确保数据库目录有写入权限

### 问题3：Node.js未安装

**错误信息**:
```
错误: 未找到Node.js
```

**解决方法**:
1. 安装Node.js：`brew install node` (macOS) 或 `apt-get install nodejs` (Linux)
2. 验证安装：`node --version`

## 与API接口的区别

| 功能 | 脚本工具 | API接口 |
|------|---------|---------|
| 使用场景 | 命令行/服务器管理 | Web界面/程序调用 |
| 权限要求 | 服务器文件系统访问 | 管理员JWT Token |
| 适用场景 | 初始化、紧急重置 | 日常管理 |
| 优势 | 无需登录、快速操作 | 图形界面、远程操作 |

## 相关文件

- `manageKeys.js` - Node.js脚本主文件
- `manage-keys.sh` - Shell包装脚本
- `resetPassword.js` - 密码重置脚本（参考实现）
- `initAdmin.js` - 管理员初始化脚本

## 更新日志

- 2025-01-01: 初始版本，支持查看、设置和生成API Key和私有访问密钥
