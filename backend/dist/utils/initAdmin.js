"use strict";
/**
 * @file initAdmin.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAdmin = initAdmin;
const db_1 = require("../db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
/**
 * 初始化默认管理员账号
 * @param username 用户名，默认为 'ttbye'
 * @param email 邮箱
 * @param password 密码
 */
async function initAdmin(username = 'ttbye', email = 'ttbye@example.com', password = 'admin123456') {
    try {
        // 检查用户是否已存在
        const existingUser = db_1.db
            .prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?')
            .get(username, email);
        if (existingUser) {
            // 如果用户已存在，更新为管理员
            db_1.db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existingUser.id);
            console.log(`用户 "${existingUser.username}" 已存在，已更新为管理员`);
            return;
        }
        // 创建新管理员账号
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const userId = (0, uuid_1.v4)();
        db_1.db.prepare('INSERT INTO users (id, username, email, password, role) VALUES (?, ?, ?, ?, ?)').run(userId, username, email, hashedPassword, 'admin');
        console.log('========================================');
        console.log('默认管理员账号创建成功！');
        console.log('========================================');
        console.log(`用户名: ${username}`);
        console.log(`邮箱: ${email}`);
        console.log(`密码: ${password}`);
        console.log('========================================');
        console.log('请妥善保管密码，首次登录后请及时修改！');
        console.log('========================================');
    }
    catch (error) {
        console.error('初始化管理员账号失败:', error);
        throw error;
    }
}
// 如果直接运行此文件
if (require.main === module) {
    (async () => {
        try {
            // 确保数据库已初始化
            const dbModule = await Promise.resolve().then(() => __importStar(require('../db')));
            await dbModule.initDatabase();
            const args = process.argv.slice(2);
            const username = args[0] || 'ttbye';
            const email = args[1] || 'ttbye@example.com';
            const password = args[2] || 'admin123456';
            await initAdmin(username, email, password);
            process.exit(0);
        }
        catch (error) {
            console.error('初始化失败:', error);
            process.exit(1);
        }
    })();
}
//# sourceMappingURL=initAdmin.js.map