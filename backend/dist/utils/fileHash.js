"use strict";
/**
 * @file fileHash.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFileHash = calculateFileHash;
exports.getShortHash = getShortHash;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
/**
 * 计算文件的SHA256哈希值
 */
function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto_1.default.createHash('sha256');
        const stream = fs_1.default.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}
/**
 * 生成短hash（用于目录名）
 */
function getShortHash(fullHash, length = 8) {
    return fullHash.substring(0, length);
}
//# sourceMappingURL=fileHash.js.map