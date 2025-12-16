"use strict";
/**
 * @file scan.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const douban_1 = require("../utils/douban");
const epubConverter_1 = require("../utils/epubConverter");
const epubParser_1 = require("../utils/epubParser");
const pdfMetadataExtractor_1 = require("../utils/pdfMetadataExtractor");
const fileHash_1 = require("../utils/fileHash");
const bookStorage_1 = require("../utils/bookStorage");
const tagHelper_1 = require("../utils/tagHelper");
const router = express_1.default.Router();
// 获取系统设置
function getSetting(key, defaultValue = '') {
    const setting = db_1.db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    return setting ? setting.value : defaultValue;
}
// 扫描文件并导入书籍
async function scanAndImportFile(filePath, fileName, storagePath, autoConvertTxt, autoConvertMobi, autoFetchDouban, userId, username, isPublic = false, category, deleteSource = false) {
    const ext = path_1.default.extname(fileName).toLowerCase();
    const allowedTypes = ['.epub', '.pdf', '.txt', '.mobi', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.md'];
    if (!allowedTypes.includes(ext)) {
        return { skipped: true, reason: '不支持的文件格式' };
    }
    // 计算文件hash
    const fileSize = fs_1.default.statSync(filePath).size;
    let fileHash;
    try {
        fileHash = await (0, fileHash_1.calculateFileHash)(filePath);
    }
    catch (error) {
        console.error(`计算文件hash失败 ${fileName}:`, error);
        return { skipped: true, reason: '计算文件hash失败' };
    }
    // 检查是否已存在相同hash的书籍
    const existing = (0, bookStorage_1.findBookByHash)(db_1.db, fileHash);
    if (existing) {
        (0, bookStorage_1.createImportHistory)(db_1.db, userId, fileName, filePath, 'skipped', '书籍已存在（相同hash）', existing.id);
        return { skipped: true, reason: '书籍已存在（相同hash）' };
    }
    let finalFilePath = filePath;
    let finalFileSize = fileSize;
    let finalFileType = ext.substring(1);
    let metadata = {};
    // 如果是txt文件且启用自动转换
    if (ext === '.txt' && autoConvertTxt) {
        try {
            const title = path_1.default.basename(fileName, '.txt');
            const epubPath = await (0, epubConverter_1.convertTxtToEpub)(filePath, title, '未知作者');
            finalFilePath = epubPath;
            finalFileSize = fs_1.default.statSync(epubPath).size;
            finalFileType = 'epub';
            metadata = { title, author: '未知作者' };
        }
        catch (error) {
            console.error(`转换TXT失败 ${fileName}:`, error);
            return { skipped: true, reason: 'TXT转换失败' };
        }
    }
    else if (ext === '.mobi' && autoConvertMobi) {
        // MOBI格式：自动转换为EPUB（因为MOBI无法在线阅读）
        try {
            console.log('开始转换 MOBI 到 EPUB:', fileName);
            const epubPath = await (0, epubConverter_1.convertMobiToEpub)(filePath);
            // 删除原始 MOBI 文件
            fs_1.default.unlinkSync(filePath);
            // 更新文件路径和元数据
            finalFilePath = epubPath;
            finalFileSize = fs_1.default.statSync(epubPath).size;
            finalFileType = 'epub';
            // 尝试从转换后的 EPUB 提取元数据
            try {
                metadata = await (0, epubParser_1.extractEpubMetadata)(epubPath);
                console.log('MOBI转EPUB后元数据提取结果:', {
                    title: metadata.title,
                    author: metadata.author,
                });
            }
            catch (error) {
                console.warn('提取转换后EPUB元数据失败，使用文件名:', error);
                metadata = {
                    title: path_1.default.basename(fileName, '.mobi'),
                    author: '未知作者',
                };
            }
        }
        catch (error) {
            console.error(`转换MOBI失败 ${fileName}:`, error);
            return { error: true, reason: `转换MOBI失败: ${error.message}` };
        }
    }
    else if (ext === '.mobi') {
        // MOBI文件但未启用转换
        metadata = {
            title: path_1.default.basename(fileName, '.mobi'),
            author: '未知作者',
        };
        console.warn('MOBI 文件未启用自动转换，将保存为 MOBI 格式（无法在线阅读）');
    }
    else if (ext === '.epub') {
        // 先获取分类和生成目录路径（用于保存封面）
        const category = metadata.category || '未分类';
        const tempTitle = path_1.default.basename(fileName, '.epub');
        const tempAuthor = '未知作者';
        const tempBookDir = (0, bookStorage_1.generateBookPath)(storagePath, tempTitle, tempAuthor, category);
        // 提取epub元数据（传入bookDir用于保存封面）
        try {
            metadata = await (0, epubParser_1.extractEpubMetadata)(finalFilePath, tempBookDir);
            // 如果提取成功，使用提取的标题和作者重新生成目录
            if (metadata.title && metadata.author) {
                const finalBookDir = (0, bookStorage_1.generateBookPath)(storagePath, metadata.title, metadata.author, category);
                // 如果封面已保存到临时目录，移动到最终目录
                if (metadata.cover_url && metadata.cover_url !== 'cover' && tempBookDir !== finalBookDir) {
                    const coverExt = path_1.default.extname(metadata.cover_url) || '.jpg';
                    const tempCoverPath = path_1.default.join(tempBookDir, `cover${coverExt}`);
                    const finalCoverPath = path_1.default.join(finalBookDir, `cover${coverExt}`);
                    if (fs_1.default.existsSync(tempCoverPath)) {
                        (0, bookStorage_1.ensureDirectoryExists)(finalBookDir);
                        fs_1.default.renameSync(tempCoverPath, finalCoverPath);
                        const relativePath = path_1.default.relative(storagePath, finalCoverPath);
                        metadata.cover_url = `/books/${relativePath.replace(/\\/g, '/')}`;
                    }
                }
            }
        }
        catch (error) {
            console.error(`提取EPUB元数据失败 ${fileName}:`, error);
            metadata = {
                title: path_1.default.basename(fileName, '.epub'),
                author: '未知作者',
            };
        }
    }
    else if (ext === '.pdf') {
        // PDF格式：提取元数据
        try {
            const pdfMetadata = await (0, pdfMetadataExtractor_1.extractPdfMetadata)(finalFilePath);
            metadata = {
                title: pdfMetadata.title || path_1.default.basename(fileName, ext),
                author: pdfMetadata.author || '未知作者',
                subject: pdfMetadata.subject,
                creator: pdfMetadata.creator,
                producer: pdfMetadata.producer,
                keywords: pdfMetadata.keywords,
            };
            console.log(`PDF元数据提取成功 ${fileName}:`, {
                title: metadata.title,
                author: metadata.author,
            });
        }
        catch (error) {
            console.error(`提取PDF元数据失败 ${fileName}:`, error);
            // 如果提取失败，使用文件名作为标题（处理编码问题）
            let fallbackTitle = path_1.default.basename(fileName, ext);
            try {
                // 尝试修复文件名编码问题
                if (/[\uFFFD\u0000-\u001F]/.test(fallbackTitle)) {
                    const buffer = Buffer.from(fallbackTitle, 'latin1');
                    fallbackTitle = buffer.toString('utf8');
                }
            }
            catch (e) {
                // 如果解码失败，使用原文件名
            }
            metadata = {
                title: fallbackTitle,
                author: '未知作者',
            };
        }
    }
    else {
        // 其他格式
        metadata = {
            title: path_1.default.basename(fileName, ext),
            author: '未知作者',
        };
    }
    // 如果启用自动获取豆瓣信息
    if (autoFetchDouban && metadata.title) {
        try {
            const searchResults = await (0, douban_1.searchBookByName)(metadata.title);
            if (searchResults.length > 0) {
                const doubanInfo = searchResults[0];
                // 提取标签
                const doubanTags = (0, tagHelper_1.extractTagsFromDouban)(doubanInfo.tags);
                metadata = {
                    ...metadata,
                    title: doubanInfo.title || metadata.title,
                    author: Array.isArray(doubanInfo.author)
                        ? doubanInfo.author.join(', ')
                        : doubanInfo.author || metadata.author,
                    isbn: doubanInfo.isbn || metadata.isbn,
                    publisher: doubanInfo.publisher || metadata.publisher,
                    publish_date: doubanInfo.pubdate || metadata.publish_date,
                    description: doubanInfo.summary || metadata.description,
                    cover_url: doubanInfo.image || metadata.cover_url,
                    rating: doubanInfo.rating?.average || metadata.rating,
                    tags: doubanTags || metadata.tags,
                };
            }
        }
        catch (error) {
            console.error(`获取豆瓣信息失败 ${fileName}:`, error);
        }
    }
    // 获取分类（优先使用传入的分类，然后是元数据，最后是默认值）
    const finalCategory = category || metadata.category || '未分类';
    // 生成存储路径
    const finalTitle = metadata.title || '未知标题';
    const finalAuthor = metadata.author || '未知作者';
    const bookDir = (0, bookStorage_1.generateBookPath)(storagePath, finalTitle, finalAuthor, finalCategory, isPublic, username);
    (0, bookStorage_1.ensureDirectoryExists)(bookDir);
    // 如果封面标识为'cover'，需要从EPUB中提取并保存
    if (metadata.cover_url === 'cover' && ext === '.epub') {
        try {
            // 重新提取封面并保存到最终目录
            const coverMetadata = await (0, epubParser_1.extractEpubMetadata)(finalFilePath, bookDir);
            if (coverMetadata.cover_url && coverMetadata.cover_url !== 'cover') {
                metadata.cover_url = coverMetadata.cover_url;
            }
        }
        catch (error) {
            console.warn('保存封面失败:', error);
            metadata.cover_url = null;
        }
    }
    // 生成最终文件名
    const finalFileExt = path_1.default.extname(finalFilePath);
    const finalFileName = (0, bookStorage_1.generateBookFileName)(finalTitle, finalFileExt);
    const targetFilePath = path_1.default.join(bookDir, finalFileName);
    // 检查同一本书是否已有其他格式
    const sameBooks = (0, bookStorage_1.findSameBookOtherFormats)(db_1.db, finalTitle, finalAuthor);
    let actualTargetPath = targetFilePath;
    let parentBookId = null;
    if (sameBooks.length > 0) {
        // 找到主书籍（没有parent_book_id的书或第一个书）
        const mainBook = sameBooks.find(b => !b.parent_book_id) || sameBooks[0];
        parentBookId = mainBook.id;
        // 使用已存在的书籍目录
        const existingBookDir = path_1.default.dirname(mainBook.file_path);
        actualTargetPath = path_1.default.join(existingBookDir, finalFileName);
        // 如果文件已存在，添加hash后缀
        if (fs_1.default.existsSync(actualTargetPath)) {
            const hashSuffix = fileHash.substring(0, 8);
            const nameWithoutExt = path_1.default.basename(finalFileName, finalFileExt);
            const newFileName = `${nameWithoutExt}_${hashSuffix}${finalFileExt}`;
            actualTargetPath = path_1.default.join(existingBookDir, newFileName);
        }
    }
    // 如果源文件路径和目标路径不同，移动文件
    if (finalFilePath !== actualTargetPath) {
        // 如果目标文件已存在，跳过
        if (fs_1.default.existsSync(actualTargetPath)) {
            return {
                success: false,
                skipped: true,
                reason: '目标文件已存在',
                fileName,
            };
        }
        // 根据deleteSource决定移动还是复制文件
        if (deleteSource) {
            (0, bookStorage_1.moveFile)(finalFilePath, actualTargetPath);
        }
        else {
            (0, bookStorage_1.copyFile)(finalFilePath, actualTargetPath);
        }
        finalFilePath = actualTargetPath;
    }
    // 保存到数据库
    const bookId = (0, uuid_1.v4)();
    db_1.db.prepare(`
    INSERT INTO books (
      id, title, author, isbn, publisher, publish_date,
      description, cover_url, file_path, file_name, file_size, file_type, 
      file_hash, category, language, rating, tags, uploader_id, is_public, parent_book_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(bookId, finalTitle, finalAuthor, metadata.isbn || null, metadata.publisher || null, metadata.publish_date || null, metadata.description || null, metadata.cover_url || null, finalFilePath, fileName, // 使用原始文件名（从文件系统读取，已正确编码）
    finalFileSize, finalFileType, fileHash, finalCategory, metadata.language || 'zh', metadata.rating || null, metadata.tags || null, userId, isPublic ? 1 : 0, parentBookId);
    // 创建导入历史记录
    (0, bookStorage_1.createImportHistory)(db_1.db, userId, fileName, finalFilePath, 'success', '导入成功', bookId);
    // 如果是私有书籍，自动添加到用户书架
    if (!isPublic) {
        try {
            const shelfId = (0, uuid_1.v4)();
            db_1.db.prepare(`
        INSERT OR IGNORE INTO user_shelves (id, user_id, book_id)
        VALUES (?, ?, ?)
      `).run(shelfId, userId, bookId);
            console.log(`私有书籍已自动添加到用户书架: ${bookId}`);
        }
        catch (shelfError) {
            console.warn('添加到书架失败:', shelfError);
            // 不影响导入流程，继续
        }
    }
    return {
        success: true,
        bookId,
        fileName,
        title: finalTitle,
        author: finalAuthor,
    };
}
// 扫描目录（仅扫描，不导入）
router.post('/scan-list', auth_1.authenticateToken, async (req, res) => {
    try {
        const { scanPath } = req.body;
        if (!scanPath) {
            return res.status(400).json({ error: '请提供扫描路径' });
        }
        // 处理路径，移除引号和多余空格
        let normalizedPath = scanPath.trim();
        // 移除首尾的引号（单引号或双引号）
        normalizedPath = normalizedPath.replace(/^['"]|['"]$/g, '');
        normalizedPath = normalizedPath.trim();
        // 如果是相对路径，转换为绝对路径（基于当前工作目录）
        if (!path_1.default.isAbsolute(normalizedPath)) {
            // 相对路径基于项目根目录
            normalizedPath = path_1.default.resolve(process.cwd(), normalizedPath);
        }
        console.log('原始路径:', scanPath);
        console.log('规范化路径:', normalizedPath);
        // 检查路径是否存在
        if (!fs_1.default.existsSync(normalizedPath)) {
            // 检查是否在Docker环境中
            const isDocker = fs_1.default.existsSync('/.dockerenv') || fs_1.default.existsSync('/run/.containerenv');
            return res.status(400).json({
                error: '扫描路径不存在',
                path: normalizedPath,
                isDocker,
                dockerHint: isDocker
                    ? '在Docker环境中，需要将宿主机目录挂载到容器。请在docker-compose.yml中添加卷挂载，例如：- /your/local/path:/app/scan:ro'
                    : undefined
            });
        }
        // 检查是否是目录
        let stat;
        try {
            stat = fs_1.default.statSync(normalizedPath);
        }
        catch (error) {
            console.error('获取路径信息失败:', error);
            return res.status(400).json({
                error: `无法访问路径: ${error.message}`,
                path: normalizedPath
            });
        }
        if (!stat.isDirectory()) {
            return res.status(400).json({
                error: '路径不是目录',
                path: normalizedPath
            });
        }
        const files = [];
        let errorCount = 0;
        // 递归扫描目录
        function scanDirectory(dir) {
            try {
                const items = fs_1.default.readdirSync(dir, { encoding: 'utf8' });
                for (const item of items) {
                    const itemPath = path_1.default.join(dir, item);
                    try {
                        const itemStat = fs_1.default.statSync(itemPath);
                        if (itemStat.isDirectory()) {
                            // 递归扫描子目录
                            scanDirectory(itemPath);
                        }
                        else if (itemStat.isFile()) {
                            // 处理文件
                            const ext = path_1.default.extname(item).toLowerCase();
                            if (['.epub', '.pdf', '.txt', '.mobi', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.md'].includes(ext)) {
                                files.push({
                                    path: itemPath,
                                    name: item,
                                    size: itemStat.size,
                                    ext: ext.substring(1), // 去掉点号
                                    modified: itemStat.mtime.toISOString(),
                                });
                            }
                        }
                    }
                    catch (error) {
                        errorCount++;
                        console.error(`扫描文件失败 ${itemPath}:`, error.message);
                        // 继续扫描其他文件，不中断
                    }
                }
            }
            catch (error) {
                errorCount++;
                console.error(`扫描目录失败 ${dir}:`, error.message);
                // 继续扫描其他目录，不中断
            }
        }
        // 开始扫描
        console.log('开始扫描目录...');
        scanDirectory(normalizedPath);
        console.log(`扫描完成，找到 ${files.length} 个文件，${errorCount} 个错误`);
        res.json({
            message: '扫描完成',
            files,
            total: files.length,
            errors: errorCount,
        });
    }
    catch (error) {
        console.error('扫描目录错误:', error);
        res.status(500).json({
            error: '扫描失败',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
// 批量导入书籍
router.post('/import-batch', auth_1.authenticateToken, async (req, res) => {
    try {
        const { files, autoConvertTxt, autoConvertMobi, autoFetchDouban, isPublic, category, deleteSource } = req.body;
        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: '请提供要导入的文件列表' });
        }
        const userId = req.userId;
        const username = db_1.db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        const storagePath = getSetting('books_storage_path', './books');
        const convertTxt = autoConvertTxt !== undefined ? autoConvertTxt : getSetting('auto_convert_txt', 'true') === 'true';
        const convertMobi = autoConvertMobi !== undefined ? autoConvertMobi : getSetting('auto_convert_mobi', 'true') === 'true';
        const fetchDouban = autoFetchDouban !== undefined ? autoFetchDouban : getSetting('auto_fetch_douban', 'true') === 'true';
        const publicMode = isPublic === true || isPublic === 'true';
        const selectedCategory = category || '未分类';
        // 确保存储路径存在
        if (!fs_1.default.existsSync(storagePath)) {
            fs_1.default.mkdirSync(storagePath, { recursive: true });
        }
        const results = [];
        const errors = [];
        // 逐本导入
        for (const file of files) {
            try {
                if (!file.path || !fs_1.default.existsSync(file.path)) {
                    const errorMsg = '文件不存在';
                    errors.push({ fileName: file.name || file.path, error: errorMsg });
                    (0, bookStorage_1.createImportHistory)(db_1.db, userId, file.name || file.path, file.path || null, 'error', errorMsg);
                    continue;
                }
                const result = await scanAndImportFile(file.path, file.name || path_1.default.basename(file.path), storagePath, convertTxt, convertMobi, fetchDouban, userId, username?.username || 'default', publicMode, selectedCategory, deleteSource === true || deleteSource === 'true');
                if (result.success) {
                    results.push(result);
                }
                else if (result.skipped) {
                    results.push({ skipped: true, fileName: file.name || file.path, reason: result.reason });
                }
                else {
                    const errorMsg = result.reason || '导入失败';
                    errors.push({ fileName: file.name || file.path, error: errorMsg });
                    (0, bookStorage_1.createImportHistory)(db_1.db, userId, file.name || file.path, file.path, 'error', errorMsg);
                }
            }
            catch (error) {
                const errorMsg = error.message || '导入失败';
                errors.push({ fileName: file.name || file.path, error: errorMsg });
                (0, bookStorage_1.createImportHistory)(db_1.db, userId, file.name || file.path, file.path || null, 'error', errorMsg);
            }
        }
        res.json({
            message: '批量导入完成',
            imported: results.filter((r) => r.success).length,
            skipped: results.filter((r) => r.skipped).length,
            errorCount: errors.length,
            results,
            errors: errors,
        });
    }
    catch (error) {
        console.error('批量导入错误:', error);
        res.status(500).json({ error: '批量导入失败' });
    }
});
// 扫描目录并自动导入（原有功能）
router.post('/scan', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const username = db_1.db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        const scanPath = getSetting('books_scan_path');
        const storagePath = getSetting('books_storage_path', './books');
        const autoConvertTxt = getSetting('auto_convert_txt', 'true') === 'true';
        const autoConvertMobi = getSetting('auto_convert_mobi', 'true') === 'true';
        const autoFetchDouban = getSetting('auto_fetch_douban', 'true') === 'true';
        if (!scanPath) {
            return res.status(400).json({ error: '请先设置书籍扫描路径' });
        }
        if (!fs_1.default.existsSync(scanPath)) {
            return res.status(400).json({ error: '扫描路径不存在' });
        }
        // 确保存储路径存在
        if (!fs_1.default.existsSync(storagePath)) {
            fs_1.default.mkdirSync(storagePath, { recursive: true });
        }
        const results = [];
        const errors = [];
        // 递归扫描目录
        async function scanDirectory(dir) {
            const files = fs_1.default.readdirSync(dir, { encoding: 'utf8' });
            for (const file of files) {
                const filePath = path_1.default.join(dir, file);
                const stat = fs_1.default.statSync(filePath);
                if (stat.isDirectory()) {
                    // 递归扫描子目录
                    await scanDirectory(filePath);
                }
                else if (stat.isFile()) {
                    // 处理文件
                    const ext = path_1.default.extname(file).toLowerCase();
                    if (['.epub', '.pdf', '.txt', '.mobi', '.docx', '.doc', '.xlsx', '.xls', '.pptx'].includes(ext)) {
                        try {
                            const result = await scanAndImportFile(filePath, file, storagePath, autoConvertTxt, autoConvertMobi, autoFetchDouban, userId, username?.username || 'default', false, undefined);
                            if (result.success) {
                                results.push(result);
                            }
                            else if (result.skipped) {
                                results.push({ skipped: true, fileName: file, reason: result.reason });
                            }
                        }
                        catch (error) {
                            errors.push({ fileName: file, error: error.message });
                        }
                    }
                }
            }
        }
        // 开始扫描
        await scanDirectory(scanPath);
        res.json({
            message: '扫描完成',
            imported: results.filter((r) => r.success).length,
            skipped: results.filter((r) => r.skipped).length,
            errors: errors.length,
            results,
            errorDetails: errors,
        });
    }
    catch (error) {
        console.error('扫描目录错误:', error);
        res.status(500).json({ error: '扫描失败' });
    }
});
// 获取导入历史
router.get('/import-history', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { limit = 100 } = req.query;
        const history = db_1.db.prepare(`
      SELECT * FROM import_history 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(userId, Number(limit));
        res.json({ history });
    }
    catch (error) {
        console.error('获取导入历史错误:', error);
        res.status(500).json({ error: '获取导入历史失败' });
    }
});
// 清空导入历史
router.delete('/import-history', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        db_1.db.prepare('DELETE FROM import_history WHERE user_id = ?').run(userId);
        res.json({ message: '导入历史已清空' });
    }
    catch (error) {
        console.error('清空导入历史错误:', error);
        res.status(500).json({ error: '清空导入历史失败' });
    }
});
exports.default = router;
//# sourceMappingURL=scan.js.map