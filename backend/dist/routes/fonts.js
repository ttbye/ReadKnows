"use strict";
/**
 * @file fonts.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const fontsDir = process.env.FONTS_DIR || './fonts';
// 确保字体目录存在
if (!fs_1.default.existsSync(fontsDir)) {
    fs_1.default.mkdirSync(fontsDir, { recursive: true });
}
// 配置multer用于字体文件上传
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, fontsDir);
    },
    filename: (req, file, cb) => {
        // 保留原始文件名，但添加唯一ID前缀避免冲突
        const uniqueName = `${(0, uuid_1.v4)()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.ttf', '.otf', '.woff', '.woff2'];
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error('不支持的字体格式，仅支持 .ttf, .otf, .woff, .woff2'));
        }
    },
});
// 上传字体文件
router.post('/upload', auth_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请选择要上传的字体文件' });
        }
        const fontName = path_1.default.basename(req.file.originalname, path_1.default.extname(req.file.originalname));
        const fontPath = req.file.path;
        const fileName = req.file.filename;
        const fileSize = req.file.size;
        const fileType = path_1.default.extname(req.file.originalname).substring(1);
        // 保存字体信息到数据库
        const fontId = (0, uuid_1.v4)();
        db_1.db.prepare(`
      INSERT INTO fonts (id, name, file_name, file_path, file_size, file_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(fontId, fontName, fileName, fontPath, fileSize, fileType);
        res.status(201).json({
            message: '字体上传成功',
            font: {
                id: fontId,
                name: fontName,
                file_name: fileName,
                file_type: fileType,
                file_size: fileSize,
                url: `/fonts/${fileName}`,
            },
        });
    }
    catch (error) {
        console.error('上传字体错误:', error);
        res.status(500).json({ error: error.message || '上传失败' });
    }
});
// 获取所有字体
router.get('/', async (req, res) => {
    try {
        const fonts = db_1.db.prepare('SELECT * FROM fonts ORDER BY created_at DESC').all();
        const fontsWithUrl = fonts.map((font) => ({
            ...font,
            url: `/fonts/${font.file_name}`,
        }));
        res.json({ fonts: fontsWithUrl });
    }
    catch (error) {
        console.error('获取字体列表错误:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
// 删除字体
router.delete('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const font = db_1.db.prepare('SELECT * FROM fonts WHERE id = ?').get(id);
        if (!font) {
            return res.status(404).json({ error: '字体不存在' });
        }
        // 删除文件
        try {
            if (fs_1.default.existsSync(font.file_path)) {
                fs_1.default.unlinkSync(font.file_path);
            }
        }
        catch (e) {
            console.error('删除字体文件失败:', e);
        }
        // 删除数据库记录
        db_1.db.prepare('DELETE FROM fonts WHERE id = ?').run(id);
        res.json({ message: '字体已删除' });
    }
    catch (error) {
        console.error('删除字体错误:', error);
        res.status(500).json({ error: '删除失败' });
    }
});
// 下载常用字体
router.post('/download-defaults', auth_1.authenticateToken, async (req, res) => {
    try {
        const { downloadAllFonts } = require('../utils/downloadFonts');
        await downloadAllFonts();
        res.json({ message: '常用字体下载完成' });
    }
    catch (error) {
        console.error('下载字体错误:', error);
        res.status(500).json({ error: error.message || '下载失败' });
    }
});
exports.default = router;
//# sourceMappingURL=fonts.js.map