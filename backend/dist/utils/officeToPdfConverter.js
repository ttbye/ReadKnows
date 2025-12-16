"use strict";
/**
 * @file officeToPdfConverter.ts
 * @author ttbye
 * @date 2025-12-11
 * Office 文档转 PDF 转换器
 * 支持 docx, xlsx, pptx 等格式转换为 PDF
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertOfficeToPdf = convertOfficeToPdf;
exports.checkLibreOfficeAvailable = checkLibreOfficeAvailable;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * 使用 LibreOffice 将 Office 文档转换为 PDF
 */
async function convertOfficeToPdf(inputPath, outputDir, outputFileName) {
    try {
        // 检查输入文件是否存在
        if (!fs_1.default.existsSync(inputPath)) {
            throw new Error(`输入文件不存在: ${inputPath}`);
        }
        // 确保输出目录存在
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        }
        // 确定输出文件名
        const inputExt = path_1.default.extname(inputPath).toLowerCase();
        const baseName = outputFileName || path_1.default.basename(inputPath, inputExt);
        const pdfPath = path_1.default.join(outputDir, `${baseName}.pdf`);
        // 检查 LibreOffice 是否可用
        let libreOfficeCmd = '';
        try {
            // 尝试不同的 LibreOffice 命令路径
            const { stdout } = await execAsync('which libreoffice || which soffice || echo ""');
            const cmd = stdout.trim();
            if (cmd) {
                libreOfficeCmd = cmd;
            }
            else {
                // 尝试常见路径
                const commonPaths = [
                    '/Applications/LibreOffice.app/Contents/MacOS/soffice', // macOS
                    '/usr/bin/libreoffice',
                    '/usr/bin/soffice',
                    'C:\\Program Files\\LibreOffice\\program\\soffice.exe', // Windows
                ];
                for (const commonPath of commonPaths) {
                    if (fs_1.default.existsSync(commonPath)) {
                        libreOfficeCmd = commonPath;
                        break;
                    }
                }
            }
        }
        catch (error) {
            // 继续尝试
        }
        if (!libreOfficeCmd) {
            throw new Error('LibreOffice 未安装或未找到。请安装 LibreOffice 以支持 Office 转 PDF 功能。');
        }
        console.log('[Office转PDF] 使用 LibreOffice:', libreOfficeCmd);
        console.log('[Office转PDF] 输入文件:', inputPath);
        console.log('[Office转PDF] 输出目录:', outputDir);
        // 构建转换命令
        // --headless: 无界面模式
        // --convert-to pdf: 转换为 PDF
        // --outdir: 输出目录
        // --nofirststartwizard: 不显示首次启动向导
        const command = `"${libreOfficeCmd}" --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}" --nofirststartwizard`;
        console.log('[Office转PDF] 执行命令:', command);
        // 执行转换
        const { stdout, stderr } = await execAsync(command, {
            timeout: 60000, // 60秒超时
            maxBuffer: 10 * 1024 * 1024, // 10MB 缓冲区
        });
        if (stderr && !stderr.includes('INFO')) {
            console.warn('[Office转PDF] 警告信息:', stderr);
        }
        console.log('[Office转PDF] 转换输出:', stdout);
        // 检查生成的 PDF 文件
        // LibreOffice 会使用输入文件名（去掉扩展名）+ .pdf 作为输出文件名
        const inputBaseName = path_1.default.basename(inputPath, inputExt);
        const expectedPdfPath = path_1.default.join(outputDir, `${inputBaseName}.pdf`);
        // 如果指定了输出文件名，重命名文件
        if (outputFileName && fs_1.default.existsSync(expectedPdfPath)) {
            if (fs_1.default.existsSync(pdfPath)) {
                fs_1.default.unlinkSync(pdfPath); // 删除已存在的文件
            }
            fs_1.default.renameSync(expectedPdfPath, pdfPath);
        }
        else if (fs_1.default.existsSync(expectedPdfPath)) {
            // 如果没有指定输出文件名，使用 LibreOffice 生成的文件名
            return expectedPdfPath;
        }
        // 检查最终文件是否存在
        if (!fs_1.default.existsSync(pdfPath)) {
            throw new Error(`PDF 文件生成失败: ${pdfPath}`);
        }
        console.log('[Office转PDF] 转换成功:', pdfPath);
        return pdfPath;
    }
    catch (error) {
        console.error('[Office转PDF] 转换失败:', error);
        throw new Error(`Office 转 PDF 失败: ${error.message}`);
    }
}
/**
 * 检查 LibreOffice 是否可用
 */
async function checkLibreOfficeAvailable() {
    try {
        let libreOfficeCmd = '';
        try {
            const { stdout } = await execAsync('which libreoffice || which soffice || echo ""');
            const cmd = stdout.trim();
            if (cmd) {
                libreOfficeCmd = cmd;
            }
            else {
                const commonPaths = [
                    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
                    '/usr/bin/libreoffice',
                    '/usr/bin/soffice',
                    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
                ];
                for (const commonPath of commonPaths) {
                    if (fs_1.default.existsSync(commonPath)) {
                        libreOfficeCmd = commonPath;
                        break;
                    }
                }
            }
        }
        catch (error) {
            return false;
        }
        if (!libreOfficeCmd) {
            return false;
        }
        // 尝试运行版本命令
        await execAsync(`"${libreOfficeCmd}" --version`, { timeout: 5000 });
        return true;
    }
    catch (error) {
        return false;
    }
}
//# sourceMappingURL=officeToPdfConverter.js.map