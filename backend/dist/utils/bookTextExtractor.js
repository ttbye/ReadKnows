"use strict";
/**
 * @file bookTextExtractor.ts
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
exports.extractEpubText = extractEpubText;
exports.extractPdfText = extractPdfText;
exports.extractTxtText = extractTxtText;
exports.extractBookText = extractBookText;
exports.extractDocxText = extractDocxText;
exports.convertDocxToHtml = convertDocxToHtml;
exports.convertDocxToMarkdown = convertDocxToMarkdown;
exports.extractDocText = extractDocText;
exports.extractExcelText = extractExcelText;
exports.extractMarkdownText = extractMarkdownText;
exports.extractPptxText = extractPptxText;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const xml2js_1 = require("xml2js");
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const axios_1 = __importDefault(require("axios"));
const mammoth_1 = __importDefault(require("mammoth"));
const XLSX = __importStar(require("xlsx"));
const db_1 = require("../db");
const uuid_1 = require("uuid");
const booksDir = process.env.BOOKS_DIR || './books';
const tempDir = path_1.default.join(booksDir, '.temp');
// 提取EPUB文本内容
async function extractEpubText(filePath, maxLength = 50000) {
    try {
        const zip = new adm_zip_1.default(filePath);
        const containerEntry = zip.getEntry('META-INF/container.xml');
        if (!containerEntry) {
            throw new Error('Invalid EPUB file: missing container.xml');
        }
        const containerXml = zip.readAsText(containerEntry);
        let opfPath = '';
        await new Promise((resolve, reject) => {
            (0, xml2js_1.parseString)(containerXml, (err, result) => {
                if (err)
                    return reject(err);
                try {
                    const rootfiles = result.container?.rootfiles?.[0];
                    const rootfile = rootfiles?.rootfile?.[0];
                    opfPath = rootfile?.$?.['full-path'];
                    resolve();
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        if (!opfPath) {
            throw new Error('Invalid EPUB file: cannot find OPF path');
        }
        const opfBasePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
        const opfEntry = zip.getEntry(opfPath);
        if (!opfEntry) {
            throw new Error('Invalid EPUB file: OPF file not found');
        }
        const opfXml = zip.readAsText(opfEntry);
        let manifestItems = [];
        let spineItems = [];
        await new Promise((resolve, reject) => {
            (0, xml2js_1.parseString)(opfXml, (err, result) => {
                if (err)
                    return reject(err);
                try {
                    const packageElement = result.package;
                    const manifest = packageElement?.manifest?.[0];
                    const spine = packageElement?.spine?.[0];
                    if (manifest?.item) {
                        manifestItems = manifest.item;
                    }
                    if (spine?.itemref) {
                        spineItems = spine.itemref.map((item) => item.$.idref);
                    }
                    resolve();
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        const textParts = [];
        let totalLength = 0;
        for (const itemId of spineItems) {
            if (totalLength >= maxLength)
                break;
            const manifestItem = manifestItems.find((item) => item.$.id === itemId);
            if (!manifestItem)
                continue;
            const href = manifestItem.$.href;
            const fullPath = opfBasePath + href;
            const entry = zip.getEntry(fullPath);
            if (!entry)
                continue;
            try {
                const htmlContent = zip.readAsText(entry, 'utf8');
                await new Promise((resolve, reject) => {
                    (0, xml2js_1.parseString)(htmlContent, (err, result) => {
                        if (err)
                            return reject(err);
                        try {
                            const extractText = (node) => {
                                if (typeof node === 'string')
                                    return node;
                                if (Array.isArray(node)) {
                                    return node.map(extractText).join('');
                                }
                                if (node && typeof node === 'object') {
                                    if (node._)
                                        return node._;
                                    return Object.values(node).map(extractText).join('');
                                }
                                return '';
                            };
                            const body = result.html?.body?.[0] || result.body;
                            if (body) {
                                const text = extractText(body);
                                const remaining = maxLength - totalLength;
                                if (remaining > 0) {
                                    textParts.push(text.substring(0, remaining));
                                    totalLength += text.length;
                                }
                            }
                            resolve();
                        }
                        catch (error) {
                            reject(error);
                        }
                    });
                });
            }
            catch (error) {
                console.warn(`Failed to extract text from ${fullPath}:`, error);
            }
        }
        return textParts.join('\n\n').substring(0, maxLength);
    }
    catch (error) {
        throw new Error(`提取EPUB文本失败: ${error.message}`);
    }
}
// 提取PDF文本内容
async function extractPdfText(filePath, maxLength = 50000) {
    try {
        const dataBuffer = fs_1.default.readFileSync(filePath);
        const data = await (0, pdf_parse_1.default)(dataBuffer);
        let text = data.text;
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }
        return text.trim();
    }
    catch (error) {
        throw new Error(`提取PDF文本失败: ${error.message}`);
    }
}
// 提取TXT文本内容
async function extractTxtText(filePath, maxLength = 50000) {
    try {
        const content = fs_1.default.readFileSync(filePath, 'utf-8');
        let text = content;
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }
        return text.trim();
    }
    catch (error) {
        throw new Error(`提取TXT文本失败: ${error.message}`);
    }
}
// 从服务器下载书籍文件到临时目录（内部调用，直接读取文件系统）
async function downloadBookToTemp(bookId, fileExt, book) {
    console.log('[BookTextExtractor] [downloadBookToTemp] 开始下载/复制文件...');
    console.log('[BookTextExtractor] [downloadBookToTemp] 参数:', {
        bookId,
        fileExt,
        bookFileName: book.file_name,
        bookFilePath: book.file_path,
        booksDir,
    });
    // 确保临时目录存在
    if (!fs_1.default.existsSync(tempDir)) {
        fs_1.default.mkdirSync(tempDir, { recursive: true });
        console.log('[BookTextExtractor] [downloadBookToTemp] 创建临时目录:', tempDir);
    }
    const tempFileName = `${(0, uuid_1.v4)()}${fileExt}`;
    const tempFilePath = path_1.default.join(tempDir, tempFileName);
    console.log('[BookTextExtractor] [downloadBookToTemp] 临时文件路径:', tempFilePath);
    try {
        // 尝试多种可能的文件路径
        const possiblePaths = [
            // 使用file_path（可能是绝对路径）
            book.file_path && path_1.default.isAbsolute(book.file_path) ? book.file_path : null,
            // 使用file_path（相对路径，相对于 booksDir）
            book.file_path && !path_1.default.isAbsolute(book.file_path) ? path_1.default.join(booksDir, book.file_path) : null,
            // 使用file_name（相对于 booksDir）
            book.file_name ? path_1.default.join(booksDir, book.file_name) : null,
            // 使用book.id（相对于 booksDir）
            path_1.default.join(booksDir, `${bookId}${fileExt}`),
        ].filter(Boolean);
        console.log('[BookTextExtractor] [downloadBookToTemp] 尝试查找源文件:');
        possiblePaths.forEach((p, i) => {
            const exists = fs_1.default.existsSync(p);
            console.log(`  ${i + 1}. ${p} ${exists ? '✅' : '❌'}`);
        });
        let sourcePath = null;
        for (const possiblePath of possiblePaths) {
            if (fs_1.default.existsSync(possiblePath)) {
                sourcePath = possiblePath;
                console.log('[BookTextExtractor] [downloadBookToTemp] ✅ 找到源文件:', sourcePath);
                break;
            }
        }
        if (!sourcePath) {
            // 如果所有路径都不存在，尝试通过HTTP下载
            console.log('[BookTextExtractor] [downloadBookToTemp] ⚠️ 本地文件不存在，尝试通过HTTP下载...');
            const baseUrl = process.env.API_BASE_URL || 'http://localhost:1281'; // 使用新端口
            const downloadUrl = `${baseUrl}/books/${bookId}${fileExt}`;
            console.log('[BookTextExtractor] [downloadBookToTemp] 下载URL:', downloadUrl);
            try {
                const response = await axios_1.default.get(downloadUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    headers: {
                        'Accept': fileExt === '.epub' ? 'application/epub+zip' :
                            fileExt === '.pdf' ? 'application/pdf' :
                                'application/octet-stream',
                    },
                });
                fs_1.default.writeFileSync(tempFilePath, Buffer.from(response.data));
                console.log('[BookTextExtractor] [downloadBookToTemp] ✅ HTTP下载成功，大小:', response.data.byteLength);
                return tempFilePath;
            }
            catch (httpError) {
                console.error('[BookTextExtractor] [downloadBookToTemp] ❌ HTTP下载失败:', {
                    url: downloadUrl,
                    status: httpError.response?.status,
                    statusText: httpError.response?.statusText,
                    error: httpError.message,
                });
                throw new Error(`HTTP下载失败: ${httpError.response?.status || httpError.message}`);
            }
        }
        // 复制文件到临时目录
        console.log('[BookTextExtractor] [downloadBookToTemp] 复制文件到临时目录...');
        fs_1.default.copyFileSync(sourcePath, tempFilePath);
        const fileSize = fs_1.default.statSync(tempFilePath).size;
        console.log('[BookTextExtractor] [downloadBookToTemp] ✅ 文件复制成功，大小:', fileSize);
        return tempFilePath;
    }
    catch (error) {
        console.error('[BookTextExtractor] [downloadBookToTemp] ❌ 下载/复制失败:', {
            bookId,
            fileExt,
            bookFileName: book.file_name,
            bookFilePath: book.file_path,
            error: error.message,
            stack: error.stack,
            status: error.response?.status,
            statusText: error.response?.statusText,
        });
        throw new Error(`获取书籍文件失败: ${error.message || '未知错误'}`);
    }
}
// 根据文件类型提取文本
async function extractBookText(bookId, maxLength = 50000) {
    console.log('[BookTextExtractor] ========== 开始提取书籍文本 ==========');
    console.log('[BookTextExtractor] bookId:', bookId);
    console.log('[BookTextExtractor] booksDir:', booksDir);
    const book = db_1.db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!book) {
        console.error('[BookTextExtractor] ❌ 书籍不存在:', bookId);
        throw new Error('书籍不存在');
    }
    console.log('[BookTextExtractor] 书籍信息:', {
        id: book.id,
        title: book.title,
        file_name: book.file_name,
        file_type: book.file_type,
        file_path: book.file_path,
    });
    const fileExt = path_1.default.extname(book.file_name || '').toLowerCase() ||
        (book.file_type ? `.${book.file_type}` : '');
    if (!fileExt) {
        console.error('[BookTextExtractor] ❌ 无法确定文件格式:', {
            file_name: book.file_name,
            file_type: book.file_type,
        });
        throw new Error('无法确定书籍文件格式');
    }
    console.log('[BookTextExtractor] 文件扩展名:', fileExt);
    let filePath = null;
    let isTempFile = false;
    // 首先尝试从本地文件系统读取
    // 构建所有可能的路径
    const possiblePaths = [];
    // 1. 直接使用 file_path（如果是绝对路径）
    if (book.file_path) {
        if (path_1.default.isAbsolute(book.file_path)) {
            possiblePaths.push(book.file_path);
        }
        else {
            // 相对路径：尝试多种基础路径
            possiblePaths.push(path_1.default.join(booksDir, book.file_path));
            // 如果 booksDir 是相对路径，尝试基于当前工作目录
            if (!path_1.default.isAbsolute(booksDir)) {
                possiblePaths.push(path_1.default.resolve(process.cwd(), booksDir, book.file_path));
            }
        }
    }
    // 2. 使用 file_name（相对于 booksDir）
    if (book.file_name) {
        possiblePaths.push(path_1.default.join(booksDir, book.file_name));
        // 如果 booksDir 是相对路径，尝试基于当前工作目录
        if (!path_1.default.isAbsolute(booksDir)) {
            possiblePaths.push(path_1.default.resolve(process.cwd(), booksDir, book.file_name));
        }
    }
    // 3. 使用 book.id + 扩展名（相对于 booksDir）
    possiblePaths.push(path_1.default.join(booksDir, `${book.id}${fileExt}`));
    if (!path_1.default.isAbsolute(booksDir)) {
        possiblePaths.push(path_1.default.resolve(process.cwd(), booksDir, `${book.id}${fileExt}`));
    }
    // 去重
    const uniquePaths = Array.from(new Set(possiblePaths));
    console.log('[BookTextExtractor] 尝试查找文件路径:');
    console.log('[BookTextExtractor] booksDir (环境变量):', booksDir);
    console.log('[BookTextExtractor] booksDir (绝对路径):', path_1.default.isAbsolute(booksDir) ? booksDir : path_1.default.resolve(process.cwd(), booksDir));
    console.log('[BookTextExtractor] 当前工作目录:', process.cwd());
    uniquePaths.forEach((p, i) => {
        const exists = fs_1.default.existsSync(p);
        console.log(`  ${i + 1}. ${p} ${exists ? '✅' : '❌'}`);
    });
    for (const possiblePath of uniquePaths) {
        if (fs_1.default.existsSync(possiblePath)) {
            filePath = possiblePath;
            console.log('[BookTextExtractor] ✅ 找到本地文件:', filePath);
            break;
        }
    }
    // 如果本地文件不存在，尝试下载或复制
    if (!filePath) {
        console.log('[BookTextExtractor] ⚠️ 本地文件不存在，尝试下载或复制...');
        try {
            filePath = await downloadBookToTemp(bookId, fileExt, book);
            isTempFile = true;
            console.log('[BookTextExtractor] ✅ 下载/复制成功:', filePath);
        }
        catch (error) {
            console.error('[BookTextExtractor] ❌ 下载/复制失败:', {
                bookId,
                filePath: book.file_path,
                fileName: book.file_name,
                fileType: book.file_type,
                error: error.message,
                stack: error.stack,
            });
            // 提供更详细的错误信息
            let errorMessage = `无法获取书籍文件`;
            if (error.message) {
                errorMessage += `: ${error.message}`;
            }
            else {
                errorMessage += ': 文件不存在或无法访问';
            }
            throw new Error(errorMessage);
        }
    }
    if (!filePath || !fs_1.default.existsSync(filePath)) {
        console.error('[BookTextExtractor] ❌ 文件路径无效或文件不存在:', {
            filePath,
            exists: filePath ? fs_1.default.existsSync(filePath) : false,
            bookId,
            fileName: book.file_name,
            filePathInDb: book.file_path,
        });
        throw new Error(`书籍文件不存在: ${book.file_name || book.id} (路径: ${book.file_path || '未设置'})`);
    }
    console.log('[BookTextExtractor] 提取文本:', {
        bookId,
        fileExt,
        filePath,
        maxLength,
        isTempFile,
        bookTitle: book.title,
        bookFileName: book.file_name,
    });
    try {
        let text;
        console.log('[BookTextExtractor] 开始提取，格式:', fileExt);
        switch (fileExt) {
            case '.epub':
                console.log('[BookTextExtractor] 使用EPUB提取方法');
                text = await extractEpubText(filePath, maxLength);
                console.log('[BookTextExtractor] EPUB提取完成，文本长度:', text.length);
                break;
            case '.pdf':
                console.log('[BookTextExtractor] 使用PDF提取方法');
                text = await extractPdfText(filePath, maxLength);
                console.log('[BookTextExtractor] PDF提取完成，文本长度:', text.length);
                break;
            case '.txt':
                console.log('[BookTextExtractor] 使用TXT提取方法');
                text = await extractTxtText(filePath, maxLength);
                console.log('[BookTextExtractor] TXT提取完成，文本长度:', text.length);
                break;
            case '.docx':
                console.log('[BookTextExtractor] 使用DOCX提取方法');
                text = await extractDocxText(filePath, maxLength);
                console.log('[BookTextExtractor] DOCX提取完成，文本长度:', text.length);
                break;
            case '.doc':
                console.log('[BookTextExtractor] 使用DOC提取方法（转换为DOCX处理）');
                text = await extractDocText(filePath, maxLength);
                console.log('[BookTextExtractor] DOC提取完成，文本长度:', text.length);
                break;
            case '.xlsx':
            case '.xls':
                console.log('[BookTextExtractor] 使用Excel提取方法');
                text = await extractExcelText(filePath, maxLength);
                console.log('[BookTextExtractor] Excel提取完成，文本长度:', text.length);
                break;
            case '.pptx':
                console.log('[BookTextExtractor] 使用PowerPoint提取方法');
                text = await extractPptxText(filePath, maxLength);
                console.log('[BookTextExtractor] PowerPoint提取完成，文本长度:', text.length);
                break;
            case '.md':
                console.log('[BookTextExtractor] 使用Markdown提取方法');
                text = await extractMarkdownText(filePath, maxLength);
                console.log('[BookTextExtractor] Markdown提取完成，文本长度:', text.length);
                break;
            default:
                console.error('[BookTextExtractor] 不支持的文件格式:', fileExt);
                throw new Error(`不支持的文件格式: ${fileExt}。当前支持：.epub, .pdf, .txt, .docx, .doc, .xlsx, .xls, .pptx, .md`);
        }
        if (!text || text.trim().length === 0) {
            console.warn('[BookTextExtractor] 提取的文本为空');
            throw new Error(`提取的文本内容为空，可能是文件格式问题或文件损坏`);
        }
        // 清理临时文件
        if (isTempFile && fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.unlinkSync(filePath);
                console.log('[BookTextExtractor] 临时文件已清理:', filePath);
            }
            catch (cleanupError) {
                console.warn('[BookTextExtractor] 清理临时文件失败:', cleanupError);
            }
        }
        return text;
    }
    catch (error) {
        // 确保临时文件被清理
        if (isTempFile && filePath && fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.unlinkSync(filePath);
            }
            catch (cleanupError) {
                console.warn('[BookTextExtractor] 清理临时文件失败:', cleanupError);
            }
        }
        console.error('[BookTextExtractor] 提取失败:', {
            bookId,
            fileExt,
            filePath,
            error: error.message,
            stack: error.stack,
        });
        throw error;
    }
}
// 提取DOCX文档文本
async function extractDocxText(filePath, maxLength = 50000) {
    try {
        const result = await mammoth_1.default.extractRawText({ path: filePath });
        let text = result.value;
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }
        return text.trim();
    }
    catch (error) {
        throw new Error(`提取DOCX文本失败: ${error.message}`);
    }
}
// 将DOCX文档转换为HTML（保留格式）
async function convertDocxToHtml(filePath) {
    try {
        const result = await mammoth_1.default.convertToHtml({ path: filePath });
        let html = result.value;
        // 添加一些基本样式以确保显示效果
        const styledHtml = `
      <style>
        body {
          font-family: 'Microsoft YaHei', 'SimSun', 'SimHei', Arial, sans-serif;
          line-height: 1.6;
          color: inherit;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        p {
          margin: 0.5em 0;
        }
        h1, h2, h3, h4, h5, h6 {
          margin: 1em 0 0.5em 0;
          font-weight: bold;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }
        table td, table th {
          border: 1px solid #ddd;
          padding: 8px;
        }
        table th {
          background-color: #f2f2f2;
          font-weight: bold;
        }
        ul, ol {
          margin: 0.5em 0;
          padding-left: 2em;
        }
        img {
          max-width: 100%;
          height: auto;
        }
        strong {
          font-weight: bold;
        }
        em {
          font-style: italic;
        }
        u {
          text-decoration: underline;
        }
      </style>
      ${html}
    `;
        return styledHtml;
    }
    catch (error) {
        throw new Error(`转换DOCX为HTML失败: ${error.message}`);
    }
}
// 将DOCX文档转换为Markdown（保留格式，表格显示更好）
async function convertDocxToMarkdown(filePath) {
    try {
        // mammoth 没有直接的 convertToMarkdown 方法
        // 先转换为 HTML，然后转换为 Markdown
        const htmlResult = await mammoth_1.default.convertToHtml({ path: filePath });
        const html = htmlResult.value;
        // 使用 turndown 将 HTML 转换为 Markdown
        const TurndownService = (await Promise.resolve().then(() => __importStar(require('turndown')))).default;
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
        });
        // 配置表格转换
        turndownService.addRule('table', {
            filter: 'table',
            replacement: function (content) {
                return '\n\n' + content + '\n\n';
            }
        });
        const markdown = turndownService.turndown(html);
        return markdown;
    }
    catch (error) {
        throw new Error(`转换DOCX为Markdown失败: ${error.message}`);
    }
}
// 提取DOC文档文本（旧格式，尝试作为DOCX处理）
async function extractDocText(filePath, maxLength = 50000) {
    try {
        // DOC格式较老，mammoth可能不支持，返回提示信息
        throw new Error('DOC格式（旧版Word）暂不支持，请转换为DOCX格式');
    }
    catch (error) {
        throw new Error(`提取DOC文本失败: ${error.message}`);
    }
}
// 提取Excel文档文本
async function extractExcelText(filePath, maxLength = 50000) {
    try {
        const workbook = XLSX.readFile(filePath);
        const textParts = [];
        // 遍历所有工作表
        workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            // 将每行数据转换为文本
            jsonData.forEach((row) => {
                if (Array.isArray(row)) {
                    const rowText = row.map((cell) => String(cell || '')).join(' | ');
                    if (rowText.trim()) {
                        textParts.push(rowText);
                    }
                }
            });
        });
        let text = textParts.join('\n');
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }
        return text.trim();
    }
    catch (error) {
        throw new Error(`提取Excel文本失败: ${error.message}`);
    }
}
// 提取Markdown文档文本
async function extractMarkdownText(filePath, maxLength = 50000) {
    try {
        const content = fs_1.default.readFileSync(filePath, 'utf-8');
        let text = content;
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }
        return text.trim();
    }
    catch (error) {
        throw new Error(`提取Markdown文本失败: ${error.message}`);
    }
}
// 提取PowerPoint文档文本
async function extractPptxText(filePath, maxLength = 50000) {
    try {
        const zip = new adm_zip_1.default(filePath);
        const textParts = [];
        // PowerPoint文件是ZIP格式，包含多个XML文件
        const entries = zip.getEntries();
        // 查找所有包含文本的XML文件（通常在ppt/slides/目录下）
        entries.forEach((entry) => {
            if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml/)) {
                try {
                    const xmlContent = zip.readAsText(entry);
                    // 简单的XML文本提取（提取<a:t>标签中的文本）
                    const textMatches = xmlContent.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
                    if (textMatches) {
                        textMatches.forEach((match) => {
                            const textMatch = match.match(/<a:t[^>]*>([^<]*)<\/a:t>/);
                            if (textMatch && textMatch[1]) {
                                const slideText = textMatch[1].trim();
                                if (slideText) {
                                    textParts.push(slideText);
                                }
                            }
                        });
                    }
                }
                catch (error) {
                    // 忽略单个文件的错误
                }
            }
        });
        let text = textParts.join('\n\n');
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }
        return text.trim() || '无法提取PowerPoint文本内容';
    }
    catch (error) {
        throw new Error(`提取PowerPoint文本失败: ${error.message}`);
    }
}
//# sourceMappingURL=bookTextExtractor.js.map