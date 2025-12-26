/**
 * @file opds.ts
 * @author ttbye
 * @date 2025-12-11
 */

import express from 'express';
import { db } from '../db';

const router = express.Router();

// 获取正确的基础URL（优先使用前端端口，确保外部客户端可以访问）
function getBaseUrl(req: express.Request): string {
  // 1. 优先使用 X-Forwarded-Host（如果通过反向代理访问）
  const forwardedHost = req.get('X-Forwarded-Host');
  if (forwardedHost) {
    const protocol = req.get('X-Forwarded-Proto') || req.protocol;
    return `${protocol}://${forwardedHost}`;
  }

  // 2. 检查 Referer 头（如果从浏览器访问）
  const referer = req.get('Referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      // 如果 Referer 是前端端口，使用它
      if (refererUrl.port === '1280') {
        return `${refererUrl.protocol}//${refererUrl.host}`;
      }
    } catch (e) {
      // Referer 解析失败，继续使用其他方法
    }
  }

  // 3. 从环境变量获取前端端口（如果配置了）
  const frontendPort = process.env.FRONTEND_PORT || '1280';
  const backendPort = process.env.PORT || '1281';
  const host = req.get('host') || 'localhost:1281';
  
  // 4. 解析当前 Host
  let hostname: string;
  let currentPort: string;
  
  if (host.includes(':')) {
    [hostname, currentPort] = host.split(':');
  } else {
    hostname = host;
    currentPort = req.protocol === 'https' ? '443' : '80';
  }
  
  // 5. 如果当前端口是后端端口（1281），替换为前端端口（1280）
  // 这样确保外部客户端可以通过前端端口访问 OPDS
  if (currentPort === backendPort) {
    return `${req.protocol}://${hostname}:${frontendPort}`;
  }

  // 6. 如果 Host 已经是前端端口或其他端口，直接使用
  return `${req.protocol}://${host}`;
}

// OPDS根目录
router.get('/', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.set('Content-Type', 'application/atom+xml; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:readknows-opds-catalog</id>
  <title>ReadKnows 书库</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>ReadKnows</name>
  </author>
  <link rel="self" href="${baseUrl}/opds/" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${baseUrl}/opds/" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" href="${baseUrl}/opds/search?q={searchTerms}" type="application/atom+xml"/>
  <entry>
    <title>所有书籍</title>
    <id>urn:uuid:all-books</id>
    <updated>${new Date().toISOString()}</updated>
    <content type="text">浏览所有书籍</content>
    <link rel="subsection" href="${baseUrl}/opds/books" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>
  <entry>
    <title>最新书籍</title>
    <id>urn:uuid:recent-books</id>
    <updated>${new Date().toISOString()}</updated>
    <content type="text">查看最新添加的书籍</content>
    <link rel="subsection" href="${baseUrl}/opds/books/recent" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>
</feed>`);
});

// 获取所有书籍
router.get('/books', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const books = db
    .prepare('SELECT * FROM books ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as any[];

  const total = db.prepare('SELECT COUNT(*) as count FROM books').get() as any;

  const baseUrl = getBaseUrl(req);

  let feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:all-books</id>
  <title>所有书籍</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>ReadKnows</name>
  </author>
  <link rel="self" href="${baseUrl}/opds/books?page=${page}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds/" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" href="${baseUrl}/opds/search?q={searchTerms}" type="application/atom+xml"/>
`;

  if (page > 1) {
    feed += `  <link rel="previous" href="${baseUrl}/opds/books?page=${page - 1}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>\n`;
  }

  if (page * limit < total.count) {
    feed += `  <link rel="next" href="${baseUrl}/opds/books?page=${page + 1}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>\n`;
  }

  books.forEach((book) => {
    const fileName = book.file_path.split('/').pop() || book.file_name;
    const fileUrl = `${baseUrl}/books/${fileName}`;
    const coverUrl = book.cover_url ? book.cover_url : '';
    const fileType = book.file_type || 'epub';
    const mimeType = fileType === 'epub' ? 'application/epub+zip' : 
                     fileType === 'pdf' ? 'application/pdf' : 
                     fileType === 'txt' ? 'text/plain' : 
                     'application/octet-stream';

    feed += `  <entry>
    <id>urn:uuid:book-${book.id}</id>
    <title>${escapeXml(book.title || '无标题')}</title>
    <updated>${new Date(book.updated_at || book.created_at || new Date()).toISOString()}</updated>
    <author>
      <name>${escapeXml(book.author || '未知作者')}</name>
    </author>
    <dc:language>${book.language || 'zh'}</dc:language>
    ${book.publish_date ? `<dc:issued>${escapeXml(book.publish_date)}</dc:issued>` : ''}
    ${book.description ? `<summary type="text">${escapeXml(book.description)}</summary>` : ''}
    ${coverUrl ? `<link rel="http://opds-spec.org/image" href="${escapeXml(coverUrl)}" type="image/jpeg"/>` : ''}
    <link rel="http://opds-spec.org/acquisition/open-access" href="${escapeXml(fileUrl)}" type="${mimeType}"/>
  </entry>
`;
  });

  feed += `</feed>`;

  res.set('Content-Type', 'application/atom+xml; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.send(feed);
});

// 获取最新书籍
router.get('/books/recent', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;

  const books = db
    .prepare('SELECT * FROM books ORDER BY created_at DESC LIMIT ?')
    .all(limit) as any[];

  const baseUrl = getBaseUrl(req);

  let feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:recent-books</id>
  <title>最新书籍</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>ReadKnows</name>
  </author>
  <link rel="self" href="${baseUrl}/opds/books/recent" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds/" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" href="${baseUrl}/opds/search?q={searchTerms}" type="application/atom+xml"/>
`;

  books.forEach((book) => {
    const fileName = book.file_path.split('/').pop() || book.file_name;
    const fileUrl = `${baseUrl}/books/${fileName}`;
    const coverUrl = book.cover_url ? book.cover_url : '';
    const fileType = book.file_type || 'epub';
    const mimeType = fileType === 'epub' ? 'application/epub+zip' : 
                     fileType === 'pdf' ? 'application/pdf' : 
                     fileType === 'txt' ? 'text/plain' : 
                     'application/octet-stream';

    feed += `  <entry>
    <id>urn:uuid:book-${book.id}</id>
    <title>${escapeXml(book.title || '无标题')}</title>
    <updated>${new Date(book.updated_at || book.created_at || new Date()).toISOString()}</updated>
    <author>
      <name>${escapeXml(book.author || '未知作者')}</name>
    </author>
    <dc:language>${book.language || 'zh'}</dc:language>
    ${book.publish_date ? `<dc:issued>${escapeXml(book.publish_date)}</dc:issued>` : ''}
    ${book.description ? `<summary type="text">${escapeXml(book.description)}</summary>` : ''}
    ${coverUrl ? `<link rel="http://opds-spec.org/image" href="${escapeXml(coverUrl)}" type="image/jpeg"/>` : ''}
    <link rel="http://opds-spec.org/acquisition/open-access" href="${escapeXml(fileUrl)}" type="${mimeType}"/>
  </entry>
`;
  });

  feed += `</feed>`;

  res.set('Content-Type', 'application/atom+xml; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.send(feed);
});

// 搜索书籍
router.get('/search', (req, res) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).send('Missing query parameter');
  }

  const books = db
    .prepare('SELECT * FROM books WHERE title LIKE ? OR author LIKE ? LIMIT 50')
    .all(`%${query}%`, `%${query}%`) as any[];

  const baseUrl = getBaseUrl(req);

  let feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:search-${encodeURIComponent(query)}</id>
  <title>搜索结果: ${escapeXml(query)}</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>ReadKnows</name>
  </author>
  <link rel="self" href="${baseUrl}/opds/search?q=${encodeURIComponent(query)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds/" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" href="${baseUrl}/opds/search?q={searchTerms}" type="application/atom+xml"/>
`;

  books.forEach((book) => {
    const fileName = book.file_path.split('/').pop() || book.file_name;
    const fileUrl = `${baseUrl}/books/${fileName}`;
    const coverUrl = book.cover_url ? book.cover_url : '';
    const fileType = book.file_type || 'epub';
    const mimeType = fileType === 'epub' ? 'application/epub+zip' : 
                     fileType === 'pdf' ? 'application/pdf' : 
                     fileType === 'txt' ? 'text/plain' : 
                     'application/octet-stream';

    feed += `  <entry>
    <id>urn:uuid:book-${book.id}</id>
    <title>${escapeXml(book.title || '无标题')}</title>
    <updated>${new Date(book.updated_at || book.created_at || new Date()).toISOString()}</updated>
    <author>
      <name>${escapeXml(book.author || '未知作者')}</name>
    </author>
    <dc:language>${book.language || 'zh'}</dc:language>
    ${book.publish_date ? `<dc:issued>${escapeXml(book.publish_date)}</dc:issued>` : ''}
    ${book.description ? `<summary type="text">${escapeXml(book.description)}</summary>` : ''}
    ${coverUrl ? `<link rel="http://opds-spec.org/image" href="${escapeXml(coverUrl)}" type="image/jpeg"/>` : ''}
    <link rel="http://opds-spec.org/acquisition/open-access" href="${escapeXml(fileUrl)}" type="${mimeType}"/>
  </entry>
`;
  });

  feed += `</feed>`;

  res.set('Content-Type', 'application/atom+xml; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.send(feed);
});

// 处理OPTIONS请求（CORS预检）
router.options('*', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// XML转义函数
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default router;

