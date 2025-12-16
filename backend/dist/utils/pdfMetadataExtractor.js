"use strict";
/**
 * @file pdfMetadataExtractor.ts
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
exports.extractPdfMetadata = extractPdfMetadata;
const fs_1 = __importDefault(require("fs"));
/**
 * 从PDF文件中提取元数据（标题、作者等）
 * 优先使用pdf-parse，如果失败则尝试使用pdfjs-dist
 * @param pdfFilePath PDF文件路径
 * @returns 元数据对象
 */
async function extractPdfMetadata(pdfFilePath) {
    try {
        // 方法1: 尝试使用pdf-parse（更简单，适合Node.js环境）
        return await extractPdfMetadataWithPdfParse(pdfFilePath);
    }
    catch (error) {
        console.warn('使用pdf-parse提取PDF元数据失败，尝试使用pdfjs-dist:', error.message);
        try {
            // 方法2: 使用pdfjs-dist（更强大，但需要更多配置）
            return await extractPdfMetadataWithPdfjs(pdfFilePath);
        }
        catch (error2) {
            console.error('使用pdfjs-dist提取PDF元数据也失败:', error2.message);
            // 如果都失败，返回空对象
            return {};
        }
    }
}
/**
 * 使用pdf-parse提取PDF元数据
 */
async function extractPdfMetadataWithPdfParse(pdfFilePath) {
    try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs_1.default.readFileSync(pdfFilePath);
        const data = await pdfParse(dataBuffer);
        const metadata = {};
        // 提取元数据（pdf-parse返回的info对象）
        if (data.info) {
            // 处理标题
            if (data.info.Title) {
                metadata.title = decodePdfString(data.info.Title);
            }
            // 处理作者
            if (data.info.Author) {
                metadata.author = decodePdfString(data.info.Author);
            }
            // 处理主题
            if (data.info.Subject) {
                metadata.subject = decodePdfString(data.info.Subject);
            }
            // 处理创建者
            if (data.info.Creator) {
                metadata.creator = decodePdfString(data.info.Creator);
            }
            // 处理生产者
            if (data.info.Producer) {
                metadata.producer = decodePdfString(data.info.Producer);
            }
            // 处理关键词
            if (data.info.Keywords) {
                metadata.keywords = decodePdfString(data.info.Keywords);
            }
            // 处理创建日期
            if (data.info.CreationDate) {
                metadata.creationDate = data.info.CreationDate;
            }
            // 处理修改日期
            if (data.info.ModDate) {
                metadata.modificationDate = data.info.ModDate;
            }
        }
        console.log('PDF元数据提取成功 (pdf-parse):', metadata);
        return metadata;
    }
    catch (error) {
        throw new Error(`pdf-parse提取失败: ${error.message}`);
    }
}
/**
 * 使用pdfjs-dist提取PDF元数据
 */
async function extractPdfMetadataWithPdfjs(pdfFilePath) {
    try {
        // 动态导入pdfjs-dist
        let pdfjsLib;
        try {
            // 尝试不同的导入路径
            try {
                pdfjsLib = await Promise.resolve().then(() => __importStar(require('pdfjs-dist')));
            }
            catch (e1) {
                try {
                    // @ts-ignore - 动态导入路径
                    pdfjsLib = await Promise.resolve().then(() => __importStar(require('pdfjs-dist/legacy/build/pdf.mjs')));
                }
                catch (e2) {
                    // @ts-ignore - 动态导入路径
                    pdfjsLib = await Promise.resolve().then(() => __importStar(require('pdfjs-dist/build/pdf.mjs')));
                }
            }
        }
        catch (e) {
            throw new Error(`无法加载pdfjs-dist: ${e}`);
        }
        // 读取PDF文件
        const pdfBuffer = fs_1.default.readFileSync(pdfFilePath);
        // 将Buffer转换为Uint8Array（pdfjs-dist要求使用Uint8Array而不是Buffer）
        const pdfBytes = new Uint8Array(pdfBuffer);
        // 设置worker路径（如果需要）
        if (pdfjsLib.GlobalWorkerOptions) {
            try {
                const workerPaths = [
                    'pdfjs-dist/build/pdf.worker.mjs',
                    'pdfjs-dist/legacy/build/pdf.worker.mjs',
                    'pdfjs-dist/build/pdf.worker.js',
                ];
                let workerPath = null;
                for (const workerPathOption of workerPaths) {
                    try {
                        workerPath = require.resolve(workerPathOption);
                        break;
                    }
                    catch (e) {
                        // 继续尝试下一个路径
                    }
                }
                if (workerPath) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
                }
            }
            catch (e) {
                console.warn('设置PDF.js worker路径失败:', e.message);
            }
        }
        // 加载PDF文档
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;
        // 获取元数据
        const metadataObj = await pdf.getMetadata();
        const info = metadataObj.info || {};
        const metadata = {};
        // 提取元数据
        if (info.Title) {
            metadata.title = decodePdfString(info.Title);
        }
        if (info.Author) {
            metadata.author = decodePdfString(info.Author);
        }
        if (info.Subject) {
            metadata.subject = decodePdfString(info.Subject);
        }
        if (info.Creator) {
            metadata.creator = decodePdfString(info.Creator);
        }
        if (info.Producer) {
            metadata.producer = decodePdfString(info.Producer);
        }
        if (info.Keywords) {
            metadata.keywords = decodePdfString(info.Keywords);
        }
        if (info.CreationDate) {
            metadata.creationDate = info.CreationDate;
        }
        if (info.ModDate) {
            metadata.modificationDate = info.ModDate;
        }
        console.log('PDF元数据提取成功 (pdfjs-dist):', metadata);
        return metadata;
    }
    catch (error) {
        throw new Error(`pdfjs-dist提取失败: ${error.message}`);
    }
}
/**
 * 解码PDF字符串（处理编码问题）
 * PDF字符串可能是UTF-8、UTF-16BE、PDFDocEncoding等格式
 */
function decodePdfString(str) {
    if (!str)
        return '';
    // 如果已经是字符串，直接返回
    if (typeof str === 'string') {
        // 检查是否是UTF-16BE编码（以FE FF开头）
        if (str.charCodeAt(0) === 0xFEFF || (str.length >= 2 && str.charCodeAt(0) === 0xFE && str.charCodeAt(1) === 0xFF)) {
            try {
                // 尝试解码UTF-16BE
                const buffer = Buffer.from(str, 'utf16le');
                return buffer.toString('utf8');
            }
            catch (e) {
                // 如果失败，返回原字符串
            }
        }
        // 尝试处理常见的编码问题
        try {
            // 如果字符串包含乱码，尝试不同的编码
            if (/[\uFFFD\u0000-\u001F]/.test(str)) {
                // 尝试从Latin1转换
                const buffer = Buffer.from(str, 'latin1');
                return buffer.toString('utf8');
            }
        }
        catch (e) {
            // 如果失败，返回原字符串
        }
        return str;
    }
    // 如果是Buffer，尝试解码
    if (Buffer.isBuffer(str)) {
        try {
            return str.toString('utf8');
        }
        catch (e) {
            try {
                return str.toString('latin1');
            }
            catch (e2) {
                return str.toString();
            }
        }
    }
    // 其他情况，转换为字符串
    return String(str);
}
//# sourceMappingURL=pdfMetadataExtractor.js.map