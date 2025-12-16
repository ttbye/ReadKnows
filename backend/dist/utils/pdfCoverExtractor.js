"use strict";
/**
 * @file pdfCoverExtractor.ts
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
exports.extractPdfCover = extractPdfCover;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * 从PDF第一页提取封面图片
 * 使用pdfjs-dist + canvas来渲染PDF第一页为图片
 * @param pdfFilePath PDF文件路径
 * @param outputDir 输出目录
 * @returns 封面图片的相对路径（相对于booksDir）
 */
async function extractPdfCover(pdfFilePath, outputDir) {
    try {
        // 确保输出目录存在
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        }
        // 尝试使用pdfjs-dist + canvas
        return await extractPdfCoverWithPdfjs(pdfFilePath, outputDir);
    }
    catch (error) {
        console.error('提取PDF封面失败:', error);
        // 重新抛出错误，让调用者能够获取详细的错误信息
        throw error;
    }
}
/**
 * Node.js环境的CanvasFactory实现
 * 用于适配pdfjs-dist在Node.js环境中使用node-canvas
 */
class NodeCanvasFactory {
    constructor(createCanvasFn) {
        this.createCanvas = createCanvasFn;
    }
    create(width, height) {
        const canvas = this.createCanvas(width, height);
        const context = canvas.getContext('2d');
        return {
            canvas: canvas,
            context: context,
        };
    }
    reset(canvasAndContext, width, height) {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
    }
    destroy(canvasAndContext) {
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
    }
}
/**
 * 使用pdfjs-dist从PDF第一页提取封面图片
 */
async function extractPdfCoverWithPdfjs(pdfFilePath, outputDir) {
    try {
        // 首先加载canvas库
        let createCanvas;
        try {
            const canvasModule = await Promise.resolve().then(() => __importStar(require('canvas')));
            createCanvas = canvasModule.createCanvas;
            if (!createCanvas) {
                throw new Error('无法获取createCanvas函数');
            }
            console.log('[PDF封面提取] canvas库加载成功');
        }
        catch (e) {
            const errorMsg = e.message || String(e);
            console.error('[PDF封面提取] canvas库加载失败:', errorMsg);
            if (errorMsg.includes('Cannot find module') || errorMsg.includes('MODULE_NOT_FOUND')) {
                throw new Error('PDF封面提取需要canvas依赖，请运行: npm install canvas\n注意：canvas包需要系统依赖，请参考 https://github.com/Automattic/node-canvas#installation');
            }
            else if (errorMsg.includes('The module') || errorMsg.includes('was compiled against')) {
                throw new Error('canvas模块版本不兼容，请重新安装: npm rebuild canvas\n或运行: npm install canvas --force');
            }
            else {
                throw new Error(`canvas库加载失败: ${errorMsg}\n请确保已安装canvas依赖: npm install canvas`);
            }
        }
        // 动态导入pdfjs-dist
        let pdfjsLib;
        try {
            // 尝试使用标准版本
            pdfjsLib = await Promise.resolve().then(() => __importStar(require('pdfjs-dist')));
            console.log('[PDF封面提取] pdfjs-dist 加载成功');
        }
        catch (e) {
            console.error('[PDF封面提取] pdfjs-dist 加载失败:', e.message);
            throw new Error('pdfjs-dist 未安装或加载失败，请运行: npm install pdfjs-dist');
        }
        // 读取PDF文件
        const pdfBuffer = fs_1.default.readFileSync(pdfFilePath);
        console.log('[PDF封面提取] PDF文件大小:', pdfBuffer.length, 'bytes');
        // 将Buffer转换为Uint8Array（pdfjs-dist要求使用Uint8Array而不是Buffer）
        const pdfBytes = new Uint8Array(pdfBuffer);
        // 设置worker路径（禁用worker以避免路径问题）
        if (pdfjsLib.GlobalWorkerOptions) {
            // 在Node.js环境中禁用worker
            pdfjsLib.GlobalWorkerOptions.workerSrc = '';
            console.log('[PDF封面提取] 已禁用PDF.js worker');
        }
        // 创建自定义CanvasFactory
        const canvasFactory = new NodeCanvasFactory(createCanvas);
        // 加载PDF文档，使用自定义CanvasFactory
        console.log('[PDF封面提取] 开始加载PDF文档...');
        const loadingTask = pdfjsLib.getDocument({
            data: pdfBytes,
            useWorkerFetch: false,
            isEvalSupported: false,
            useSystemFonts: true,
            canvasFactory: canvasFactory, // 使用自定义CanvasFactory
        });
        const pdf = await loadingTask.promise;
        console.log('[PDF封面提取] PDF文档加载成功，总页数:', pdf.numPages);
        if (pdf.numPages === 0) {
            console.warn('PDF文件没有页面');
            return null;
        }
        // 获取第一页
        console.log('[PDF封面提取] 开始获取第一页...');
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 }); // 使用2倍缩放以获得更好的质量
        console.log('[PDF封面提取] 页面尺寸:', viewport.width, 'x', viewport.height);
        // 使用CanvasFactory创建canvas
        const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
        const canvas = canvasAndContext.canvas;
        const context = canvasAndContext.context;
        console.log('[PDF封面提取] Canvas创建成功', {
            width: canvas.width,
            height: canvas.height,
        });
        // 渲染PDF页面到canvas
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };
        console.log('[PDF封面提取] 开始渲染页面到canvas...');
        await page.render(renderContext).promise;
        console.log('[PDF封面提取] 页面渲染完成');
        // 将canvas转换为图片并保存
        const coverExt = '.jpg';
        const coverFileName = `cover${coverExt}`;
        const coverFilePath = path_1.default.join(outputDir, coverFileName);
        // 将canvas转换为buffer并保存为JPEG
        console.log('[PDF封面提取] 开始转换为JPEG...');
        const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
        fs_1.default.writeFileSync(coverFilePath, buffer);
        console.log('[PDF封面提取] 封面文件已保存:', coverFilePath, '大小:', buffer.length, 'bytes');
        // 返回相对于booksDir的路径
        const booksDir = process.env.BOOKS_DIR || './books';
        const relativePath = path_1.default.relative(booksDir, coverFilePath);
        const coverUrl = `/books/${relativePath.replace(/\\/g, '/')}`;
        console.log('[PDF封面提取] 封面提取成功:', {
            coverFilePath,
            coverUrl,
            width: viewport.width,
            height: viewport.height,
            fileSize: buffer.length
        });
        return coverUrl;
    }
    catch (error) {
        const errorMessage = error.message || String(error);
        console.error('使用pdfjs-dist提取PDF封面失败:', errorMessage);
        // 重新抛出错误，让调用者处理
        // 这样可以在路由层提供更详细的错误信息
        throw error;
    }
}
//# sourceMappingURL=pdfCoverExtractor.js.map