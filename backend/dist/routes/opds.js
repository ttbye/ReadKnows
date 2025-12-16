"use strict";
/**
 * @file opds.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("../db");
const router = express_1.default.Router();
// OPDS根目录
router.get('/', (req, res) => {
    res.set('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:the-book-path</id>
  <title>书名达理</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>The Book Path</name>
  </author>
  <link rel="self" href="${req.protocol}://${req.get('host')}/opds/" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${req.protocol}://${req.get('host')}/opds/" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <entry>
    <title>所有书籍</title>
    <id>urn:uuid:all-books</id>
    <updated>${new Date().toISOString()}</updated>
    <link rel="subsection" href="${req.protocol}://${req.get('host')}/opds/books" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">浏览所有书籍</content>
  </entry>
  <entry>
    <title>最新书籍</title>
    <id>urn:uuid:recent-books</id>
    <updated>${new Date().toISOString()}</updated>
    <link rel="subsection" href="${req.protocol}://${req.get('host')}/opds/books/recent" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">查看最新添加的书籍</content>
  </entry>
</feed>`);
});
// 获取所有书籍
router.get('/books', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const books = db_1.db
        .prepare('SELECT * FROM books ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset);
    const total = db_1.db.prepare('SELECT COUNT(*) as count FROM books').get();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:all-books</id>
  <title>所有书籍</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>The Book Path</name>
  </author>
  <link rel="self" href="${baseUrl}/opds/books?page=${page}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds/" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
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
        feed += `  <entry>
    <id>urn:uuid:book-${book.id}</id>
    <title>${escapeXml(book.title)}</title>
    <updated>${new Date(book.updated_at).toISOString()}</updated>
    <author>
      <name>${escapeXml(book.author || '未知作者')}</name>
    </author>
    <dc:language>${book.language || 'zh'}</dc:language>
    <dc:issued>${book.publish_date || ''}</dc:issued>
    <summary type="text">${escapeXml(book.description || '')}</summary>
    ${coverUrl ? `<link rel="http://opds-spec.org/image" href="${coverUrl}" type="image/jpeg"/>` : ''}
    <link rel="http://opds-spec.org/acquisition" href="${fileUrl}" type="application/epub+zip"/>
    <link rel="alternate" href="${baseUrl}/books/${book.id}" type="text/html"/>
  </entry>
`;
    });
    feed += `</feed>`;
    res.set('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(feed);
});
// 获取最新书籍
router.get('/books/recent', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const books = db_1.db
        .prepare('SELECT * FROM books ORDER BY created_at DESC LIMIT ?')
        .all(limit);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:recent-books</id>
  <title>最新书籍</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>The Book Path</name>
  </author>
  <link rel="self" href="${baseUrl}/opds/books/recent" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds/" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
`;
    books.forEach((book) => {
        const fileName = book.file_path.split('/').pop() || book.file_name;
        const fileUrl = `${baseUrl}/books/${fileName}`;
        const coverUrl = book.cover_url ? book.cover_url : '';
        feed += `  <entry>
    <id>urn:uuid:book-${book.id}</id>
    <title>${escapeXml(book.title)}</title>
    <updated>${new Date(book.updated_at).toISOString()}</updated>
    <author>
      <name>${escapeXml(book.author || '未知作者')}</name>
    </author>
    <dc:language>${book.language || 'zh'}</dc:language>
    <summary type="text">${escapeXml(book.description || '')}</summary>
    ${coverUrl ? `<link rel="http://opds-spec.org/image" href="${coverUrl}" type="image/jpeg"/>` : ''}
    <link rel="http://opds-spec.org/acquisition" href="${fileUrl}" type="application/epub+zip"/>
  </entry>
`;
    });
    feed += `</feed>`;
    res.set('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(feed);
});
// 搜索书籍
router.get('/search', (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).send('Missing query parameter');
    }
    const books = db_1.db
        .prepare('SELECT * FROM books WHERE title LIKE ? OR author LIKE ? LIMIT 50')
        .all(`%${query}%`, `%${query}%`);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:search-${encodeURIComponent(query)}</id>
  <title>搜索结果: ${escapeXml(query)}</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>The Book Path</name>
  </author>
  <link rel="self" href="${baseUrl}/opds/search?q=${encodeURIComponent(query)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
`;
    books.forEach((book) => {
        const fileName = book.file_path.split('/').pop() || book.file_name;
        const fileUrl = `${baseUrl}/books/${fileName}`;
        const coverUrl = book.cover_url ? book.cover_url : '';
        feed += `  <entry>
    <id>urn:uuid:book-${book.id}</id>
    <title>${escapeXml(book.title)}</title>
    <updated>${new Date(book.updated_at).toISOString()}</updated>
    <author>
      <name>${escapeXml(book.author || '未知作者')}</name>
    </author>
    <summary type="text">${escapeXml(book.description || '')}</summary>
    ${coverUrl ? `<link rel="http://opds-spec.org/image" href="${coverUrl}" type="image/jpeg"/>` : ''}
    <link rel="http://opds-spec.org/acquisition" href="${fileUrl}" type="application/epub+zip"/>
  </entry>
`;
    });
    feed += `</feed>`;
    res.set('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(feed);
});
// XML转义函数
function escapeXml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
exports.default = router;
//# sourceMappingURL=opds.js.map