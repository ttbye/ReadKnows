/**
 * @file manageKeys.js
 * @author ttbye
 * @date 2025-01-01
 * @description 管理API Key和私有访问密钥的脚本
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 获取数据库路径
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/database.db');
const dbDir = path.dirname(dbPath);

// 确保目录存在
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 连接数据库
const db = new Database(dbPath);

// 生成随机密钥
function generateRandomKey(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 获取密钥
function getKey(keyType) {
  try {
    const setting = db
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get(keyType);
    
    if (!setting || !setting.value) {
      console.log(`密钥 "${keyType}" 不存在或为空`);
      return null;
    }
    
    return setting.value;
  } catch (error) {
    console.error(`获取密钥失败:`, error);
    return null;
  }
}

// 设置密钥
function setKey(keyType, value, description) {
  try {
    // 检查设置是否存在
    const existing = db
      .prepare('SELECT id FROM system_settings WHERE key = ?')
      .get(keyType);
    
    if (existing) {
      // 更新现有设置
      db.prepare(
        'UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?'
      ).run(value, keyType);
      console.log(`密钥 "${keyType}" 已更新`);
    } else {
      // 创建新设置
      const id = require('uuid').v4();
      db.prepare(
        'INSERT INTO system_settings (id, key, value, description) VALUES (?, ?, ?, ?)'
      ).run(id, keyType, value, description || '');
      console.log(`密钥 "${keyType}" 已创建`);
    }
    
    return true;
  } catch (error) {
    console.error(`设置密钥失败:`, error);
    return false;
  }
}

// 显示所有密钥
function showKeys() {
  console.log('\n========================================');
  console.log('当前密钥信息');
  console.log('========================================');
  
  const apiKey = getKey('api_key');
  const privateKey = getKey('private_access_key');
  
  if (apiKey) {
    console.log('API Key:', apiKey);
  } else {
    console.log('API Key: (未设置)');
  }
  
  if (privateKey) {
    console.log('私有访问密钥:', privateKey);
  } else {
    console.log('私有访问密钥: (未设置)');
  }
  
  console.log('========================================\n');
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log('用法:');
    console.log('  node manageKeys.js show                    # 显示当前密钥');
    console.log('  node manageKeys.js set-api-key <key>      # 设置API Key');
    console.log('  node manageKeys.js set-private-key <key>   # 设置私有访问密钥');
    console.log('  node manageKeys.js generate-api-key        # 生成新的API Key');
    console.log('  node manageKeys.js generate-private-key    # 生成新的私有访问密钥');
    console.log('  node manageKeys.js generate-all             # 生成所有密钥');
    console.log('');
    console.log('示例:');
    console.log('  node manageKeys.js show');
    console.log('  node manageKeys.js set-api-key "my-api-key-123"');
    console.log('  node manageKeys.js generate-api-key');
    process.exit(0);
  }
  
  try {
    switch (command) {
      case 'show':
        showKeys();
        break;
        
      case 'set-api-key':
        if (!args[1]) {
          console.error('错误: 请提供API Key值');
          process.exit(1);
        }
        if (args[1].length < 8) {
          console.error('错误: API Key长度至少8位');
          process.exit(1);
        }
        if (setKey('api_key', args[1], 'API访问密钥（用于API请求认证）')) {
          console.log('========================================');
          console.log('API Key设置成功！');
          console.log('========================================');
          console.log(`API Key: ${args[1]}`);
          console.log('========================================');
          console.log('请妥善保管API Key！');
          console.log('========================================\n');
        }
        break;
        
      case 'set-private-key':
        if (!args[1]) {
          console.error('错误: 请提供私有访问密钥值');
          process.exit(1);
        }
        if (args[1].length < 8) {
          console.error('错误: 私有访问密钥长度至少8位');
          process.exit(1);
        }
        if (setKey('private_access_key', args[1], '私有访问密钥')) {
          console.log('========================================');
          console.log('私有访问密钥设置成功！');
          console.log('========================================');
          console.log(`私有访问密钥: ${args[1]}`);
          console.log('========================================');
          console.log('请妥善保管私有访问密钥！');
          console.log('========================================\n');
        }
        break;
        
      case 'generate-api-key':
        const newApiKey = generateRandomKey(16);
        if (setKey('api_key', newApiKey, 'API访问密钥（用于API请求认证）')) {
          console.log('========================================');
          console.log('API Key生成成功！');
          console.log('========================================');
          console.log(`API Key: ${newApiKey}`);
          console.log('========================================');
          console.log('请妥善保管API Key！');
          console.log('请确保更新所有使用该API Key的客户端配置！');
          console.log('========================================\n');
        }
        break;
        
      case 'generate-private-key':
        const newPrivateKey = generateRandomKey(20);
        if (setKey('private_access_key', newPrivateKey, '私有访问密钥')) {
          console.log('========================================');
          console.log('私有访问密钥生成成功！');
          console.log('========================================');
          console.log(`私有访问密钥: ${newPrivateKey}`);
          console.log('========================================');
          console.log('请妥善保管私有访问密钥！');
          console.log('请确保通知所有需要此密钥的用户！');
          console.log('========================================\n');
        }
        break;
        
      case 'generate-all':
        const apiKey = generateRandomKey(16);
        const privateKey = generateRandomKey(20);
        if (setKey('api_key', apiKey, 'API访问密钥（用于API请求认证）') &&
            setKey('private_access_key', privateKey, '私有访问密钥')) {
          console.log('========================================');
          console.log('所有密钥生成成功！');
          console.log('========================================');
          console.log(`API Key: ${apiKey}`);
          console.log(`私有访问密钥: ${privateKey}`);
          console.log('========================================');
          console.log('请妥善保管这些密钥！');
          console.log('请确保更新所有使用这些密钥的客户端配置！');
          console.log('========================================\n');
        }
        break;
        
      default:
        console.error(`错误: 未知命令 "${command}"`);
        console.log('使用 "node manageKeys.js" 查看帮助');
        process.exit(1);
    }
  } catch (error) {
    console.error('操作失败:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 运行主函数
main();
