/**
 * @file epubParser.ts
 * @author ttbye
 * @date 2025-12-11
 */

import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { parseString } from 'xml2js';
import { v4 as uuidv4 } from 'uuid';

// 简单的EPUB元数据提取（包含封面图片）
export function extractEpubMetadata(filePath: string, bookDir?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const zip = new AdmZip(filePath);
      const containerEntry = zip.getEntry('META-INF/container.xml');
      
      if (!containerEntry) {
        return reject(new Error('Invalid EPUB file: missing container.xml'));
      }

      const containerXml = zip.readAsText(containerEntry);
      parseString(containerXml, (err: any, result: any) => {
        if (err) return reject(err);

        try {
          const rootfiles = result.container?.rootfiles?.[0];
          const rootfile = rootfiles?.rootfile?.[0];
          const opfPath = rootfile?.$?.['full-path'];
          
          if (!opfPath) {
            return reject(new Error('Invalid EPUB file: cannot find OPF path'));
          }
          
          const opfEntry = zip.getEntry(opfPath);
          
          if (!opfEntry) {
            return reject(new Error('Invalid EPUB file: missing OPF file'));
          }

          const opfBasePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
          const opfXml = zip.readAsText(opfEntry);
          parseString(opfXml, async (err2: any, opfResult: any) => {
            if (err2) return reject(err2);

            try {
              const metadata = opfResult.package?.metadata?.[0] || {};
              const manifest = opfResult.package?.manifest?.[0] || {};
              
              // 提取基本元数据
              const titleObj = metadata['dc:title']?.[0];
              const title = (titleObj && typeof titleObj === 'object' && titleObj._) ? titleObj._ : (titleObj || '未知标题');
              const creatorObj = metadata['dc:creator']?.[0];
              const creator = (creatorObj && typeof creatorObj === 'object' && creatorObj._) ? creatorObj._ : (creatorObj || '未知作者');
              const descObj = metadata['dc:description']?.[0];
              const description = (descObj && typeof descObj === 'object' && descObj._) ? descObj._ : (descObj || '');
              const langObj = metadata['dc:language']?.[0];
              const language = (langObj && typeof langObj === 'object' && langObj._) ? langObj._ : (langObj || 'zh');

              // 提取封面图片
              let coverUrl: string | null = null;
              
              try {
                // 方法1: 查找metadata中的cover属性
                const metaItems = metadata.meta || [];
                let coverId: string | null = null;
                
                for (const metaItem of metaItems) {
                  const name = metaItem.$?.name || metaItem.$?.property;
                  const content = metaItem.$?.content;
                  if ((name === 'cover' || name === 'cover-image') && content) {
                    coverId = content;
                    break;
                  }
                }
                
                // 方法2: 如果没有找到，查找manifest中id为"cover"或"cover-image"的项
                if (!coverId) {
                  const manifestItems = manifest.item || [];
                  for (const item of manifestItems) {
                    const itemId = item.$?.id;
                    if (itemId && (itemId === 'cover' || itemId === 'cover-image' || itemId.toLowerCase().includes('cover'))) {
                      coverId = itemId;
                      break;
                    }
                  }
                }
                
                // 方法3: 查找manifest中media-type为image的项，且id包含cover
                if (!coverId) {
                  const manifestItems = manifest.item || [];
                  for (const item of manifestItems) {
                    const itemId = item.$?.id;
                    const mediaType = item.$?.['media-type'];
                    if (mediaType && mediaType.startsWith('image/') && itemId && itemId.toLowerCase().includes('cover')) {
                      coverId = itemId;
                      break;
                    }
                  }
                }
                
                // 如果找到了封面ID，从manifest中获取对应的href
                if (coverId) {
                  const manifestItems = manifest.item || [];
                  for (const item of manifestItems) {
                    if (item.$?.id === coverId) {
                      const coverHref = item.$?.href;
                      if (coverHref) {
                        // 解析封面图片路径
                        let coverPath = coverHref;
                        if (!coverPath.startsWith('/')) {
                          coverPath = opfBasePath + coverPath;
                        } else {
                          coverPath = coverPath.substring(1);
                        }
                        
                        // 从ZIP中提取封面图片
                        const coverEntry = zip.getEntry(coverPath);
                        if (coverEntry) {
                          if (bookDir) {
                            try {
                              // 确保目录存在
                              console.log('[EPUB封面提取] 开始处理封面:', {
                                bookDir,
                                coverPath,
                                bookDirExists: fs.existsSync(bookDir)
                              });
                              
                              if (!fs.existsSync(bookDir)) {
                                fs.mkdirSync(bookDir, { recursive: true });
                                console.log('[EPUB封面提取] 创建书籍目录:', bookDir);
                              }
                              
                              // 检查目录权限
                              try {
                                fs.accessSync(bookDir, fs.constants.W_OK);
                                console.log('[EPUB封面提取] 目录可写');
                              } catch (permError) {
                                console.error('[EPUB封面提取] 目录不可写:', bookDir, permError);
                                throw new Error(`目录不可写: ${bookDir}`);
                              }
                              
                            // 保存封面图片到书籍目录下，命名为cover
                            const coverExt = path.extname(coverPath) || '.jpg';
                            const coverFileName = `cover${coverExt}`;
                            const coverFilePath = path.join(bookDir, coverFileName);
                              
                              console.log('[EPUB封面提取] 封面文件路径:', coverFilePath);
                            
                              // 读取封面图片数据
                            const coverBuffer = zip.readFile(coverEntry);
                              if (!coverBuffer) {
                                console.warn('[EPUB封面提取] 无法读取封面图片数据:', coverPath);
                                coverUrl = 'cover';
                              } else {
                                console.log('[EPUB封面提取] 封面数据大小:', coverBuffer.length, 'bytes');
                                
                                // 写入封面文件
                            fs.writeFileSync(coverFilePath, coverBuffer);
                                console.log('[EPUB封面提取] 封面文件已写入');
                                
                                // 验证文件是否写入成功
                                if (fs.existsSync(coverFilePath)) {
                                  const stats = fs.statSync(coverFilePath);
                                  console.log('[EPUB封面提取] 封面文件验证成功:', {
                                    path: coverFilePath,
                                    size: stats.size
                                  });
                                } else {
                                  console.error('[EPUB封面提取] 封面文件写入后不存在!');
                                  throw new Error('封面文件写入失败');
                                }
                            
                            // 返回相对于booksDir的路径
                            const booksDir = process.env.BOOKS_DIR || './books';
                            const relativePath = path.relative(booksDir, coverFilePath);
                            coverUrl = `/books/${relativePath.replace(/\\/g, '/')}`;
                                console.log('[EPUB封面提取] 封面图片已保存:', {
                                  coverPath,
                                  coverFilePath,
                                  coverUrl,
                                  fileSize: coverBuffer.length,
                                  bookDir,
                                  relativePath
                                });
                              }
                            } catch (saveError: any) {
                              console.error('[EPUB封面提取] 保存封面图片失败:', {
                                error: saveError.message,
                                stack: saveError.stack,
                                bookDir,
                                coverPath
                              });
                              // 保存失败时返回标识，让调用者知道需要保存封面
                              coverUrl = 'cover';
                            }
                          } else {
                            // 如果没有提供bookDir，返回标识
                            console.log('[EPUB封面提取] 未提供bookDir，跳过保存');
                            coverUrl = 'cover';
                          }
                        } else {
                          console.warn('[EPUB封面提取] 封面图片条目不存在:', coverPath);
                        }
                        break;
                      }
                    }
                  }
                }
              } catch (coverError: any) {
                console.warn('提取封面图片失败:', coverError);
                // 封面提取失败不影响其他元数据的提取
              }

              resolve({
                title: typeof title === 'string' ? title : '未知标题',
                author: typeof creator === 'string' ? creator : '未知作者',
                description: typeof description === 'string' ? description : '',
                language: typeof language === 'string' ? language : 'zh',
                cover_url: coverUrl,
              });
            } catch (e) {
              resolve({
                title: '未知标题',
                author: '未知作者',
                description: '',
                language: 'zh',
                cover_url: null,
              });
            }
          });
        } catch (e) {
          resolve({
            title: path.basename(filePath, '.epub'),
            author: '未知作者',
            description: '',
            language: 'zh',
            cover_url: null,
          });
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
