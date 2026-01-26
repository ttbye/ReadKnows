/**
 * @file downloadFonts.ts
 * @author ttbye
 * @date 2025-12-11
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { db } from '../db';
import { fontsDir } from '../config/paths';

// 常用字体下载配置（使用可靠的CDN和直接下载链接）
const fontsToDownload = [
  // 中文字体 - 使用CDN直接下载
  {
    name: '霞鹜文楷',
    fileName: 'LXGWWenKai-Regular.ttf',
    url: 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai@v1.330/fonts/TTF/LXGWWenKai-Regular.ttf',
    type: 'ttf',
    isZip: false,
  },
  {
    name: '思源黑体',
    fileName: 'SourceHanSansCN-Regular.otf',
    url: 'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/OTF/SimplifiedChinese/SourceHanSansCN-Regular.otf',
    type: 'otf',
    isZip: false,
  },
  {
    name: '思源宋体',
    fileName: 'SourceHanSerifCN-Regular.otf',
    url: 'https://raw.githubusercontent.com/adobe-fonts/source-han-serif/release/OTF/SimplifiedChinese/SourceHanSerifCN-Regular.otf',
    type: 'otf',
    isZip: false,
  },
  // 英文字体 - 使用Google Fonts CDN
  {
    name: 'Roboto',
    fileName: 'Roboto-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf',
    type: 'ttf',
    isZip: false,
  },
  {
    name: 'Open Sans',
    fileName: 'OpenSans-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/opensans/v34/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0B4gaVc.ttf',
    type: 'ttf',
    isZip: false,
  },
  {
    name: 'Lato',
    fileName: 'Lato-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/lato/v23/S6uyw4BMUTPHjx4wXg.ttf',
    type: 'ttf',
    isZip: false,
  },
  {
    name: 'Merriweather',
    fileName: 'Merriweather-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/merriweather/v30/u-440qyriQwlOrhSvowK_l5-fCZMdeX3rg.ttf',
    type: 'ttf',
    isZip: false,
  },
  {
    name: 'Noto Sans',
    fileName: 'NotoSans-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/notosans/v27/o-0IIpQlx3QUlC5A4PNb4j5Ba_2c7A.ttf',
    type: 'ttf',
    isZip: false,
  },
];

// 下载文件
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlink(dest, () => {});
          return downloadFile(redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).href, dest)
            .then(resolve)
            .catch(reject);
        }
      }

      if (response.statusCode && response.statusCode >= 400) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`下载失败: ${response.statusCode} ${response.statusMessage || ''}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      file.close();
      fs.unlink(dest, () => {});
      reject(new Error('下载超时'));
    });
  });
}

// 解压ZIP文件（如果需要）
async function extractZipFile(zipPath: string, extractPath: string, destPath: string): Promise<void> {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    const zipEntry = zip.getEntry(extractPath);
    if (zipEntry) {
      fs.writeFileSync(destPath, zipEntry.getData());
    } else {
      throw new Error(`ZIP文件中未找到: ${extractPath}`);
    }
  } catch (error: any) {
    // 如果adm-zip不可用，尝试使用child_process调用unzip
    const { execSync } = require('child_process');
    try {
      execSync(`unzip -j "${zipPath}" "${extractPath}" -d "${path.dirname(destPath)}"`, { stdio: 'ignore' });
      // 重命名文件
      const extractedFile = path.join(path.dirname(destPath), path.basename(extractPath));
      if (fs.existsSync(extractedFile) && extractedFile !== destPath) {
        fs.renameSync(extractedFile, destPath);
      }
    } catch (e) {
      throw new Error(`无法解压ZIP文件: ${error.message}`);
    }
  }
}

// 下载并安装字体
export async function downloadAndInstallFont(fontConfig: typeof fontsToDownload[0]): Promise<void> {
  const fontPath = path.join(fontsDir, fontConfig.fileName);
  
  // 检查字体是否已存在
  if (fs.existsSync(fontPath)) {
    console.log(`字体 ${fontConfig.name} 已存在，跳过下载`);
    
    // 检查数据库中是否已有记录
    const existing = db.prepare('SELECT id FROM fonts WHERE file_name = ?').get(fontConfig.fileName) as any;
    if (!existing) {
      // 添加到数据库
      const fontId = require('uuid').v4();
      const stats = fs.statSync(fontPath);
      db.prepare(`
        INSERT INTO fonts (id, name, file_name, file_path, file_size, file_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(fontId, fontConfig.name, fontConfig.fileName, fontPath, stats.size, fontConfig.type);
      console.log(`字体 ${fontConfig.name} 已添加到数据库`);
    }
    return;
  }

  try {
    console.log(`开始下载字体: ${fontConfig.name}...`);
    
    if (fontConfig.isZip) {
      // 下载ZIP文件到临时位置
      const tempZipPath = path.join(fontsDir, `${fontConfig.fileName}.zip`);
      await downloadFile(fontConfig.url, tempZipPath);
      console.log(`下载完成，开始解压...`);
      
      // 解压并提取字体文件
      const extractPath = (fontConfig as any).extractPath || fontConfig.fileName;
      await extractZipFile(tempZipPath, extractPath, fontPath);
      
      // 删除临时ZIP文件
      fs.unlinkSync(tempZipPath);
    } else {
      // 直接下载字体文件
      await downloadFile(fontConfig.url, fontPath);
    }

    // 添加到数据库
    const fontId = require('uuid').v4();
    const stats = fs.statSync(fontPath);
    db.prepare(`
      INSERT INTO fonts (id, name, file_name, file_path, file_size, file_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(fontId, fontConfig.name, fontConfig.fileName, fontPath, stats.size, fontConfig.type);

    console.log(`字体 ${fontConfig.name} 下载并安装成功`);
  } catch (error: any) {
    console.error(`下载字体 ${fontConfig.name} 失败:`, error.message);
    throw error;
  }
}

// 下载所有字体
export async function downloadAllFonts(): Promise<void> {
  console.log('开始下载常用字体...');
  
  // 确保字体目录存在
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }

  for (const fontConfig of fontsToDownload) {
    try {
      await downloadAndInstallFont(fontConfig);
    } catch (error: any) {
      console.error(`跳过字体 ${fontConfig.name}:`, error.message);
    }
  }

  console.log('字体下载完成');
}

// 如果直接运行此文件，执行下载
if (require.main === module) {
  downloadAllFonts().catch(console.error);
}

