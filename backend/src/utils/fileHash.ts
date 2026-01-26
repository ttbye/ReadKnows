/**
 * @file fileHash.ts
 * @author ttbye
 * @date 2025-12-11
 */

import crypto from 'crypto';
import fs from 'fs';

/**
 * 计算文件的SHA256哈希值
 */
export function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 生成短hash（用于目录名）
 */
export function getShortHash(fullHash: string, length: number = 8): string {
  return fullHash.substring(0, length);
}

