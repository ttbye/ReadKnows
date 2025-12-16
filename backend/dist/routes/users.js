"use strict";
/**
 * @file users.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const router = express_1.default.Router();
// 获取当前用户信息
router.get('/me', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const user = db_1.db
            .prepare('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?')
            .get(userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        res.json({ user });
    }
    catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({ error: '获取用户信息失败' });
    }
});
// 更新当前用户信息（不允许修改用户名）
router.put('/me', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { email } = req.body;
        // 不允许修改用户名
        if (req.body.username) {
            return res.status(400).json({ error: '用户名注册后无法修改' });
        }
        if (!email) {
            return res.status(400).json({ error: '请提供邮箱' });
        }
        // 检查邮箱是否已存在（排除当前用户）
        const existingUser = db_1.db
            .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
            .get(email, userId);
        if (existingUser) {
            return res.status(400).json({ error: '邮箱已存在' });
        }
        // 更新邮箱
        db_1.db.prepare('UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(email, userId);
        const updatedUser = db_1.db
            .prepare('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?')
            .get(userId);
        res.json({ message: '用户信息更新成功', user: updatedUser });
    }
    catch (error) {
        console.error('更新用户信息错误:', error);
        res.status(500).json({ error: '更新用户信息失败' });
    }
});
// 修改当前用户密码
router.put('/me/password', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: '请提供当前密码和新密码' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少6位' });
        }
        // 获取当前用户密码
        const user = db_1.db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        // 验证当前密码
        const isValidPassword = await bcryptjs_1.default.compare(currentPassword, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: '当前密码错误' });
        }
        // 加密新密码
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        // 更新密码
        db_1.db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, userId);
        res.json({ message: '密码修改成功' });
    }
    catch (error) {
        console.error('修改密码错误:', error);
        res.status(500).json({ error: '修改密码失败' });
    }
});
// 创建新用户（仅管理员）
router.post('/', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: '请提供用户名、邮箱和密码' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度至少6位' });
        }
        if (role && !['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: '无效的角色，必须是 admin 或 user' });
        }
        // 检查用户是否已存在
        const existingUser = db_1.db
            .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
            .get(username, email);
        if (existingUser) {
            return res.status(400).json({ error: '用户名或邮箱已存在' });
        }
        // 加密密码
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        // 创建用户
        const userId = (0, uuid_1.v4)();
        const userRole = role || 'user';
        db_1.db.prepare('INSERT INTO users (id, username, email, password, role) VALUES (?, ?, ?, ?, ?)').run(userId, username, email, hashedPassword, userRole);
        const newUser = db_1.db
            .prepare('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?')
            .get(userId);
        res.status(201).json({ message: '用户创建成功', user: newUser });
    }
    catch (error) {
        console.error('创建用户错误:', error);
        res.status(500).json({ error: '创建用户失败' });
    }
});
// 获取所有用户列表（仅管理员）
router.get('/', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        let query = 'SELECT id, username, email, role, created_at, updated_at FROM users';
        const params = [];
        let countQuery = 'SELECT COUNT(*) as count FROM users';
        const countParams = [];
        if (search) {
            const searchCondition = ' WHERE username LIKE ? OR email LIKE ?';
            query += searchCondition;
            countQuery += searchCondition;
            params.push(`%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, `%${search}%`);
        }
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), offset);
        const users = db_1.db.prepare(query).all(...params);
        const total = db_1.db.prepare(countQuery).get(...countParams);
        // 获取每个用户的统计信息
        const usersWithStats = users.map((user) => {
            const bookCount = db_1.db
                .prepare('SELECT COUNT(*) as count FROM books WHERE uploader_id = ?')
                .get(user.id);
            const shelfCount = db_1.db
                .prepare('SELECT COUNT(*) as count FROM user_shelves WHERE user_id = ?')
                .get(user.id);
            return {
                ...user,
                bookCount: bookCount?.count || 0,
                shelfCount: shelfCount?.count || 0,
            };
        });
        res.json({
            users: usersWithStats,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: total.count,
            },
        });
    }
    catch (error) {
        console.error('获取用户列表错误:', error);
        res.status(500).json({ error: '获取用户列表失败' });
    }
});
// 更新用户信息（仅管理员）
router.put('/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        const currentUserId = req.userId;
        // 不允许修改用户名
        if (req.body.username) {
            return res.status(400).json({ error: '用户名注册后无法修改' });
        }
        // 检查用户是否存在
        const user = db_1.db.prepare('SELECT id FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        // 不能修改自己的基本信息（应该通过 /users/me 接口）
        if (id === currentUserId) {
            return res.status(400).json({ error: '请使用个人设置修改自己的信息' });
        }
        if (!email) {
            return res.status(400).json({ error: '请提供邮箱' });
        }
        // 检查邮箱是否已存在（排除当前用户）
        const existingUser = db_1.db
            .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
            .get(email, id);
        if (existingUser) {
            return res.status(400).json({ error: '邮箱已存在' });
        }
        // 更新邮箱
        db_1.db.prepare('UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(email, id);
        const updatedUser = db_1.db
            .prepare('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?')
            .get(id);
        res.json({ message: '用户信息更新成功', user: updatedUser });
    }
    catch (error) {
        console.error('更新用户信息错误:', error);
        res.status(500).json({ error: '更新用户信息失败' });
    }
});
// 获取单个用户信息（仅管理员）
router.get('/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const user = db_1.db
            .prepare('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?')
            .get(id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        // 获取用户统计信息
        const bookCount = db_1.db
            .prepare('SELECT COUNT(*) as count FROM books WHERE uploader_id = ?')
            .get(id);
        const shelfCount = db_1.db
            .prepare('SELECT COUNT(*) as count FROM user_shelves WHERE user_id = ?')
            .get(id);
        res.json({
            user: {
                ...user,
                bookCount: bookCount?.count || 0,
                shelfCount: shelfCount?.count || 0,
            },
        });
    }
    catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({ error: '获取用户信息失败' });
    }
});
// 更新用户角色（仅管理员）
router.put('/:id/role', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const currentUserId = req.userId;
        if (!role || !['admin', 'user'].includes(role)) {
            return res.status(400).json({ error: '无效的角色，必须是 admin 或 user' });
        }
        // 检查用户是否存在
        const user = db_1.db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        // 不能修改自己的角色
        if (id === currentUserId) {
            return res.status(400).json({ error: '不能修改自己的角色' });
        }
        // 确保至少有一个管理员
        if (user.role === 'admin' && role === 'user') {
            const adminCount = db_1.db
                .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
                .get();
            if (adminCount.count <= 1) {
                return res.status(400).json({ error: '至少需要保留一个管理员账号' });
            }
        }
        // 更新角色
        db_1.db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);
        const updatedUser = db_1.db
            .prepare('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?')
            .get(id);
        res.json({ message: '角色更新成功', user: updatedUser });
    }
    catch (error) {
        console.error('更新用户角色错误:', error);
        res.status(500).json({ error: '更新角色失败' });
    }
});
// 重置用户密码（仅管理员）
router.put('/:id/password', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ error: '密码长度至少6位' });
        }
        // 检查用户是否存在
        const user = db_1.db.prepare('SELECT id FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        // 加密新密码
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        // 更新密码
        db_1.db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, id);
        res.json({ message: '密码重置成功' });
    }
    catch (error) {
        console.error('重置密码错误:', error);
        res.status(500).json({ error: '重置密码失败' });
    }
});
// 删除用户（仅管理员）
router.delete('/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const currentUserId = req.userId;
        // 不能删除自己
        if (id === currentUserId) {
            return res.status(400).json({ error: '不能删除自己的账号' });
        }
        // 检查用户是否存在
        const user = db_1.db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        // 确保至少有一个管理员
        if (user.role === 'admin') {
            const adminCount = db_1.db
                .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
                .get();
            if (adminCount.count <= 1) {
                return res.status(400).json({ error: '至少需要保留一个管理员账号' });
            }
        }
        // 删除用户（外键约束会自动删除相关数据）
        db_1.db.prepare('DELETE FROM users WHERE id = ?').run(id);
        res.json({ message: '用户删除成功' });
    }
    catch (error) {
        console.error('删除用户错误:', error);
        res.status(500).json({ error: '删除用户失败' });
    }
});
// ========== 推送邮箱管理 ==========
// 获取当前用户的推送邮箱列表
router.get('/me/push-emails', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const emails = db_1.db
            .prepare(`
        SELECT id, email, is_kindle, last_used_at, created_at, updated_at
        FROM user_push_emails
        WHERE user_id = ?
        ORDER BY last_used_at DESC, created_at DESC
      `)
            .all(userId);
        res.json({ emails });
    }
    catch (error) {
        console.error('获取推送邮箱列表错误:', error);
        res.status(500).json({ error: '获取推送邮箱列表失败' });
    }
});
// 添加推送邮箱
router.post('/me/push-emails', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: '请提供有效的邮箱地址' });
        }
        // 检查是否已存在
        const existing = db_1.db
            .prepare('SELECT id FROM user_push_emails WHERE user_id = ? AND email = ?')
            .get(userId, email);
        if (existing) {
            return res.status(400).json({ error: '该邮箱已存在' });
        }
        // 判断是否为Kindle邮箱
        const isKindle = email.includes('@kindle.com') || email.includes('@free.kindle.com');
        // 插入新记录
        const emailId = (0, uuid_1.v4)();
        db_1.db.prepare(`
      INSERT INTO user_push_emails (id, user_id, email, is_kindle)
      VALUES (?, ?, ?, ?)
    `).run(emailId, userId, email, isKindle ? 1 : 0);
        const newEmail = db_1.db
            .prepare('SELECT id, email, is_kindle, last_used_at, created_at, updated_at FROM user_push_emails WHERE id = ?')
            .get(emailId);
        res.status(201).json({ message: '推送邮箱添加成功', email: newEmail });
    }
    catch (error) {
        console.error('添加推送邮箱错误:', error);
        res.status(500).json({ error: '添加推送邮箱失败' });
    }
});
// 删除推送邮箱
router.delete('/me/push-emails/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        // 检查邮箱是否属于当前用户
        const emailRecord = db_1.db
            .prepare('SELECT id FROM user_push_emails WHERE id = ? AND user_id = ?')
            .get(id, userId);
        if (!emailRecord) {
            return res.status(404).json({ error: '推送邮箱不存在或无权访问' });
        }
        // 删除记录
        db_1.db.prepare('DELETE FROM user_push_emails WHERE id = ?').run(id);
        res.json({ message: '推送邮箱删除成功' });
    }
    catch (error) {
        console.error('删除推送邮箱错误:', error);
        res.status(500).json({ error: '删除推送邮箱失败' });
    }
});
// 更新推送邮箱（主要用于更新最后使用时间，但也可以更新邮箱地址）
router.put('/me/push-emails/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { email } = req.body;
        // 检查邮箱是否属于当前用户
        const emailRecord = db_1.db
            .prepare('SELECT id, email FROM user_push_emails WHERE id = ? AND user_id = ?')
            .get(id, userId);
        if (!emailRecord) {
            return res.status(404).json({ error: '推送邮箱不存在或无权访问' });
        }
        // 如果提供了新邮箱地址，更新它
        if (email && email !== emailRecord.email) {
            if (!email.includes('@')) {
                return res.status(400).json({ error: '请提供有效的邮箱地址' });
            }
            // 检查新邮箱是否已被其他记录使用
            const existing = db_1.db
                .prepare('SELECT id FROM user_push_emails WHERE user_id = ? AND email = ? AND id != ?')
                .get(userId, email, id);
            if (existing) {
                return res.status(400).json({ error: '该邮箱已被使用' });
            }
            // 判断是否为Kindle邮箱
            const isKindle = email.includes('@kindle.com') || email.includes('@free.kindle.com');
            // 更新邮箱地址
            db_1.db.prepare(`
        UPDATE user_push_emails
        SET email = ?, is_kindle = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(email, isKindle ? 1 : 0, id);
        }
        else {
            // 只更新最后使用时间
            db_1.db.prepare('UPDATE user_push_emails SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
        }
        const updatedEmail = db_1.db
            .prepare('SELECT id, email, is_kindle, last_used_at, created_at, updated_at FROM user_push_emails WHERE id = ?')
            .get(id);
        res.json({ message: '推送邮箱更新成功', email: updatedEmail });
    }
    catch (error) {
        console.error('更新推送邮箱错误:', error);
        res.status(500).json({ error: '更新推送邮箱失败' });
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map