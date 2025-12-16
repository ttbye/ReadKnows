/**
 * @file epubParser.ts
 * @author ttbye
 * @date 2025-12-11
 */

import JSZip from 'jszip';

// EPUB文件结构解析
export interface EpubMetadata {
  title?: string;
  creator?: string;
  language?: string;
  publisher?: string;
  date?: string;
  description?: string;
}

export interface EpubChapter {
  id: string;
  href: string;
  title: string;
  order: number;
  html: string;
}

export interface EpubTOC {
  id: string;
  href: string;
  label: string;
  children?: EpubTOC[];
}

export class EpubParser {
  private zip: JSZip;
  private opfPath: string = '';
  private basePath: string = '';
  private metadata: EpubMetadata = {};
  private spine: any[] = [];
  private manifest: Map<string, string> = new Map();
  private toc: EpubTOC[] = [];

  constructor(zip: JSZip) {
    this.zip = zip;
  }

  // 解析EPUB文件
  async parse(): Promise<{
    metadata: EpubMetadata;
    chapters: EpubChapter[];
    toc: EpubTOC[];
  }> {
    // 1. 读取META-INF/container.xml找到OPF文件路径
    await this.findOPFPath();

    // 2. 解析OPF文件获取元数据和spine
    await this.parseOPF();

    // 3. 解析目录
    await this.parseTOC();

    // 4. 提取所有章节的HTML内容
    const chapters = await this.extractChapters();

    return {
      metadata: this.metadata,
      chapters,
      toc: this.toc,
    };
  }

  // 查找OPF文件路径
  private async findOPFPath() {
    const containerXml = await this.zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) {
      throw new Error('无法找到container.xml');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(containerXml, 'text/xml');
    const rootfile = doc.querySelector('rootfile[media-type="application/oebps-package+xml"]');
    const fullPath = rootfile?.getAttribute('full-path') || '';

    if (!fullPath) {
      throw new Error('无法找到OPF文件路径');
    }

    this.opfPath = fullPath;
    this.basePath = fullPath.substring(0, fullPath.lastIndexOf('/') + 1);
  }

  // 解析OPF文件
  private async parseOPF() {
    const opfFile = await this.zip.file(this.opfPath)?.async('string');
    if (!opfFile) {
      throw new Error('无法读取OPF文件');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(opfFile, 'text/xml');

    // 解析元数据
    const metadata = doc.querySelector('metadata');
    if (metadata) {
      this.metadata = {
        title: metadata.querySelector('dc\\:title, title')?.textContent || '',
        creator: metadata.querySelector('dc\\:creator, creator')?.textContent || '',
        language: metadata.querySelector('dc\\:language, language')?.textContent || '',
        publisher: metadata.querySelector('dc\\:publisher, publisher')?.textContent || '',
        date: metadata.querySelector('dc\\:date, date')?.textContent || '',
        description: metadata.querySelector('dc\\:description, description')?.textContent || '',
      };
    }

    // 解析manifest
    const manifestItems = doc.querySelectorAll('manifest item');
    manifestItems.forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) {
        this.manifest.set(id, href);
      }
    });

    // 解析spine
    const spine = doc.querySelector('spine');
    if (spine) {
      const itemrefs = spine.querySelectorAll('itemref');
      itemrefs.forEach((itemref) => {
        const idref = itemref.getAttribute('idref');
        if (idref) {
          const href = this.manifest.get(idref);
          if (href) {
            this.spine.push({ id: idref, href });
          }
        }
      });
    }
  }

  // 解析目录
  private async parseTOC() {
    // 尝试从OPF中找到nav或ncx文件
    const navHref = this.manifest.get('nav') || this.manifest.get('toc');
    if (!navHref) {
      // 如果没有nav，尝试找ncx文件
      for (const [id, href] of this.manifest.entries()) {
        if (href.endsWith('.ncx')) {
          await this.parseNCX(href);
          return;
        }
      }
      return;
    }

    const navPath = this.resolvePath(navHref);
    const navFile = await this.zip.file(navPath)?.async('string');
    if (!navFile) {
      // 如果没有nav文件，尝试ncx
      for (const [id, href] of this.manifest.entries()) {
        if (href.endsWith('.ncx')) {
          await this.parseNCX(href);
          return;
        }
      }
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(navFile, 'text/html');
    const nav = doc.querySelector('nav[epub\\:type="toc"], nav#toc');
    if (nav) {
      this.toc = this.parseNavElement(nav);
    }
  }

  // 解析NCX文件（EPUB 2.0）
  private async parseNCX(ncxHref: string) {
    const ncxPath = this.resolvePath(ncxHref);
    const ncxFile = await this.zip.file(ncxPath)?.async('string');
    if (!ncxFile) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(ncxFile, 'text/xml');
    const navPoints = doc.querySelectorAll('navPoint');

    this.toc = Array.from(navPoints).map((navPoint) => {
      const id = navPoint.getAttribute('id') || '';
      const navLabel = navPoint.querySelector('navLabel');
      const label = navLabel?.querySelector('text')?.textContent || '';
      const content = navPoint.querySelector('content');
      const href = content?.getAttribute('src') || '';

      return {
        id,
        href,
        label,
      };
    });
  }

  // 解析nav元素
  private parseNavElement(element: Element): EpubTOC[] {
    const items: EpubTOC[] = [];
    const ol = element.querySelector('ol');
    if (!ol) return items;

    const liElements = ol.querySelectorAll('li');
    liElements.forEach((li, index) => {
      const a = li.querySelector('a');
      if (a) {
        const href = a.getAttribute('href') || '';
        const label = a.textContent || '';
        const id = `toc-${index}`;

        const item: EpubTOC = {
          id,
          href,
          label,
        };

        // 递归处理子目录
        const nestedOl = li.querySelector('ol');
        if (nestedOl) {
          item.children = this.parseNavElement(li);
        }

        items.push(item);
      }
    });

    return items;
  }

  // 提取所有章节
  private async extractChapters(): Promise<EpubChapter[]> {
    const chapters: EpubChapter[] = [];

    for (let i = 0; i < this.spine.length; i++) {
      const item = this.spine[i];
      const chapterPath = this.resolvePath(item.href);
      
      const zipFile = this.zip.file(chapterPath);
      if (!zipFile) {
        console.warn(`章节文件不存在: ${chapterPath}，尝试其他路径`);
        // 尝试直接使用href
        const altZipFile = this.zip.file(item.href);
        if (altZipFile) {
          const chapterFile = await altZipFile.async('string');
          if (chapterFile) {
            const processedHtml = await this.processChapterHtml(chapterFile, item.href);
            chapters.push({
              id: item.id,
              href: item.href,
              title: this.getChapterTitle(chapterFile, item.href),
              order: i,
              html: processedHtml,
            });
          }
        } else {
          console.error(`章节文件不存在: ${chapterPath} 和 ${item.href}`);
        }
        continue;
      }
      
      const chapterFile = await zipFile.async('string');
      
      if (chapterFile) {
        const title = this.getChapterTitle(chapterFile, item.href);
        const processedHtml = await this.processChapterHtml(chapterFile, item.href);
        chapters.push({
          id: item.id,
          href: item.href,
          title,
          order: i,
          html: processedHtml,
        });
      } else {
        console.warn(`章节 ${i + 1} 内容为空: ${chapterPath}`);
      }
    }

    return chapters;
  }

  // 规范化路径，处理 ../ 和 ./ 等相对路径
  private normalizePath(path: string, baseDir: string): string {
    // 处理URL编码
    let normalized = decodeURIComponent(path);
    normalized = normalized.replace(/\\/g, '/');
    
    // 如果是绝对路径（以/开头），去掉开头的/
    if (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    
    // 如果已经是绝对路径（不包含../），直接返回
    if (!normalized.includes('../') && !normalized.includes('./')) {
      return normalized;
    }
    
    // 处理相对路径
    const baseParts = baseDir.split('/').filter(p => p);
    const pathParts = normalized.split('/');
    const result: string[] = [];
    
    for (const part of pathParts) {
      if (part === '..') {
        // 向上一级
        if (result.length > 0) {
          result.pop();
        } else if (baseParts.length > 0) {
          baseParts.pop();
        }
      } else if (part === '.' || part === '') {
        // 当前目录或空，忽略
        continue;
      } else {
        result.push(part);
      }
    }
    
    // 合并基础路径和结果路径
    const finalParts = [...baseParts, ...result];
    return finalParts.join('/');
  }

  // 处理章节HTML，将图片路径转换为base64或blob URL
  private async processChapterHtml(html: string, chapterHref: string): Promise<string> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 获取章节所在目录（去掉文件名，只保留目录）
    const chapterDir = chapterHref.substring(0, chapterHref.lastIndexOf('/') + 1);
    // 去掉末尾的斜杠，因为normalizePath会处理
    const baseDir = chapterDir.endsWith('/') ? chapterDir.slice(0, -1) : chapterDir;
    
    // 处理所有图片
    const images = doc.querySelectorAll('img');
    for (const img of Array.from(images)) {
      const src = img.getAttribute('src');
      if (!src) continue;
      
      // 跳过已经是data URL或完整URL的图片
      if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
        continue;
      }
      
      // 规范化图片路径
      let imagePath = this.normalizePath(src, baseDir);
      
      // 尝试从ZIP中读取图片
      let imageFile = this.zip.file(imagePath);
      
      // 如果找不到，尝试其他可能的路径
      if (!imageFile) {
        // 尝试1: 使用basePath
        if (this.basePath) {
          const altPath1 = this.basePath + imagePath;
          imageFile = this.zip.file(altPath1);
        }
        
        // 尝试2: 直接从manifest中查找（通过文件名匹配）
        if (!imageFile) {
          const imageFileName = imagePath.split('/').pop() || imagePath;
          for (const [manifestId, manifestHref] of this.manifest.entries()) {
            const manifestFileName = manifestHref.split('/').pop() || manifestHref;
            if (manifestFileName === imageFileName || manifestHref.endsWith(imageFileName)) {
              const resolvedPath = this.resolvePath(manifestHref);
              imageFile = this.zip.file(resolvedPath);
              if (imageFile) {
                break;
              }
            }
          }
        }
        
        // 尝试3: 尝试不同的路径组合
        if (!imageFile) {
          const possiblePaths = [
            imagePath,
            `images/${imagePath.split('/').pop()}`,
            `EPUB/images/${imagePath.split('/').pop()}`,
            imagePath.replace(/^EPUB\//, ''),
            imagePath.replace(/^xhtml\//, ''),
          ];
          
          for (const possiblePath of possiblePaths) {
            imageFile = this.zip.file(possiblePath);
            if (imageFile) {
              break;
            }
          }
        }
        
        // 尝试4: 遍历所有文件，通过文件名匹配
        if (!imageFile) {
          const imageFileName = imagePath.split('/').pop() || imagePath;
          this.zip.forEach((relativePath, file) => {
            if (relativePath.endsWith(imageFileName) && 
                (relativePath.includes('image') || relativePath.includes('Image') || 
                 relativePath.endsWith('.png') || relativePath.endsWith('.jpg') || 
                 relativePath.endsWith('.jpeg') || relativePath.endsWith('.gif'))) {
              imageFile = file;
              return false; // 停止遍历
            }
          });
        }
      }
      
      if (imageFile) {
        try {
          // 将图片转换为base64 data URL
          const imageBlob = await imageFile.async('blob');
          const reader = new FileReader();
          
          await new Promise<void>((resolve, reject) => {
            reader.onload = () => {
              img.setAttribute('src', reader.result as string);
              resolve();
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob);
          });
        } catch (error) {
          console.error(`转换图片失败: ${src}`, error);
          // 如果转换失败，保持原路径（可能会显示失败）
        }
      } else {
        console.warn(`图片文件未找到: ${imagePath} (原始路径: ${src}, baseDir: ${baseDir})`);
      }
    }
    
    // 处理其他资源（如CSS中的背景图片等）
    const styleElements = doc.querySelectorAll('style');
    for (const style of Array.from(styleElements)) {
      let cssText = style.textContent || '';
      // 这里可以处理CSS中的url()引用，但比较复杂，暂时跳过
    }
    
    return doc.documentElement.outerHTML;
  }

  // 获取章节标题
  private getChapterTitle(html: string, href: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const title = doc.querySelector('h1, h2, title')?.textContent || '';
    return title || href.split('/').pop() || `章节 ${href}`;
  }

  // 解析路径
  private resolvePath(href: string): string {
    // 处理URL编码的路径
    let decodedHref = decodeURIComponent(href);
    
    // 如果href包含锚点，移除它
    if (decodedHref.includes('#')) {
      decodedHref = decodedHref.split('#')[0];
    }
    
    if (decodedHref.startsWith('/')) {
      return decodedHref.substring(1);
    }
    
    // 如果basePath为空，直接返回href
    if (!this.basePath) {
      return decodedHref;
    }
    
    // 合并路径
    const resolved = this.basePath + decodedHref;
    return resolved;
  }

  // 静态方法：从URL加载EPUB（支持Blob URL）
  static async loadFromUrl(url: string | Promise<string>): Promise<EpubParser> {
    // 如果url是Promise，等待它解析
    const actualUrl = typeof url === 'string' ? url : await url;
    
    let arrayBuffer: ArrayBuffer;
    
    // 如果是blob URL，直接从blob读取
    if (actualUrl.startsWith('blob:')) {
      const response = await fetch(actualUrl);
      if (!response.ok) {
        throw new Error(`无法加载EPUB文件: ${response.status} ${response.statusText}`);
      }
      arrayBuffer = await response.arrayBuffer();
    } else {
      // 从服务器URL加载
      const response = await fetch(actualUrl, {
        headers: {
          'Accept': 'application/epub+zip, application/zip, application/octet-stream, */*',
        },
      });
      
      if (!response.ok) {
        console.error('EPUB文件请求失败:', response.status, response.statusText);
        throw new Error(`无法加载EPUB文件: ${response.status} ${response.statusText}`);
      }

      // 检查Content-Length，确保文件完整
      const contentLength = response.headers.get('content-length');

      // 读取完整的ArrayBuffer
      arrayBuffer = await response.arrayBuffer();
      
      if (contentLength && parseInt(contentLength) !== arrayBuffer.byteLength) {
        console.warn('文件大小不匹配:', {
          expected: contentLength,
          actual: arrayBuffer.byteLength
        });
      }
    }

    // 验证ArrayBuffer不为空
    if (arrayBuffer.byteLength === 0) {
      throw new Error('EPUB文件为空');
    }

    // 验证前几个字节是否是ZIP文件签名
    const view = new Uint8Array(arrayBuffer);
    const zipSignature = view[0] === 0x50 && view[1] === 0x4B; // PK (ZIP文件签名)
    if (!zipSignature) {
      console.error('文件不是有效的ZIP格式，前16字节:', Array.from(view.slice(0, 16)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      throw new Error('文件不是有效的EPUB格式（ZIP签名不匹配）');
    }

    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      return new EpubParser(zip);
    } catch (error: any) {
      console.error('ZIP文件解析失败:', error);
      throw new Error(`EPUB文件损坏或格式不正确: ${error.message || '未知错误'}`);
    }
  }
}

