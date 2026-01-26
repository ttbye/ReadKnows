/**
 * @file douban.ts
 * @author ttbye
 * @date 2025-12-11
 */

import axios from 'axios';
import https from 'https';
import { db } from '../db';

// 从数据库获取豆瓣API地址
function getDoubanApiBase(): string {
  try {
    const setting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('douban_api_base') as any;
    const apiBase = setting?.value;
    
    if (!apiBase || apiBase.trim() === '') {
      throw new Error('豆瓣API地址未配置，请在系统设置中配置豆瓣API地址');
    }
    
    // 清理URL：移除末尾的斜杠，确保URL格式正确
    let cleanedBase = apiBase.trim();
    // 移除末尾的斜杠
    cleanedBase = cleanedBase.replace(/\/+$/, '');
    
    // 验证URL格式
    try {
      new URL(cleanedBase);
    } catch (e) {
      throw new Error(`豆瓣API地址格式不正确: ${cleanedBase}`);
    }
    
    console.log('[豆瓣API] 当前使用的API地址:', cleanedBase);
    return cleanedBase;
  } catch (error: any) {
    console.error('[豆瓣API] 获取API地址失败:', error.message || error);
    // 如果是格式错误，抛出原始错误；否则抛出配置错误
    if (error.message && error.message.includes('格式不正确')) {
      throw error;
    }
    throw new Error('豆瓣API地址未配置，请在系统设置中配置豆瓣API地址');
  }
}

export interface DoubanBookInfo {
  id?: string;
  title?: string;
  author?: string[];
  isbn?: string;
  publisher?: string;
  pubdate?: string;
  summary?: string;
  image?: string;
  rating?: {
    average?: number;
  };
  tags?: Array<{
    name?: string;
    title?: string;
    count?: number;
  }>;
}

export async function searchBookByName(bookName: string): Promise<DoubanBookInfo[]> {
  try {
    const apiBase = getDoubanApiBase();
    const url = `${apiBase}/v2/book/search`;
    console.log('[豆瓣API] 搜索书籍:', { bookName, url });
    
    const response = await axios.get(url, {
      params: { q: bookName },
      timeout: 15000, // 15秒超时
      validateStatus: (status) => status < 500, // 允许4xx状态码，但不允许5xx
      httpsAgent: apiBase.startsWith('https://') ? new https.Agent({
        rejectUnauthorized: false, // 允许自签名证书
      }) : undefined,
    });
    
    // 检查响应状态
    if (response.status >= 400) {
      throw new Error(`豆瓣API返回错误: ${response.status} ${response.statusText || '未知错误'}`);
    }
    
    const books = response.data?.books || [];
    console.log('[豆瓣API] 搜索成功，找到', books.length, '本书');
    
    // 映射豆瓣API返回的数据结构到我们的接口
    // 豆瓣返回的是 images: { small, medium, large }，需要映射到 image
    const mappedBooks = books.map((book: any) => ({
      ...book,
      image: book.images?.large || book.images?.medium || book.images?.small || book.image,
    }));
    
    return mappedBooks;
  } catch (error: any) {
    // 如果是配置错误或格式错误，直接抛出
    if (error.message && (error.message.includes('未配置') || error.message.includes('格式不正确'))) {
      throw error;
    }
    
    // 如果是axios错误，提取详细信息
    if (error.response) {
      // 服务器返回了错误响应
      const status = error.response.status;
      const statusText = error.response.statusText;
      const data = error.response.data;
      console.error('[豆瓣API] 搜索书籍失败 - 服务器错误:', {
        status,
        statusText,
        data,
        url: error.config?.url,
      });
      throw new Error(`豆瓣API请求失败 (${status}): ${statusText || JSON.stringify(data) || '未知错误'}`);
    } else if (error.request) {
      // 请求已发出但没有收到响应
      console.error('[豆瓣API] 搜索书籍失败 - 无响应:', {
        message: error.message,
        url: error.config?.url,
      });
      throw new Error(`无法连接到豆瓣API服务: ${error.message || '网络错误或服务不可用'}`);
    } else {
      // 其他错误
      console.error('[豆瓣API] 搜索书籍失败 - 其他错误:', {
        message: error.message,
        url: error.config?.url,
      });
      throw new Error(`搜索书籍失败: ${error.message || '未知错误'}`);
    }
  }
}

export async function getBookById(id: string): Promise<DoubanBookInfo | null> {
  try {
    const apiBase = getDoubanApiBase();
    const url = `${apiBase}/v2/book/id/${id}`;
    console.log('[豆瓣API] 根据ID获取书籍:', { id, url });
    const response = await axios.get(url, {
      timeout: 15000, // 15秒超时
      validateStatus: (status) => status < 500,
      httpsAgent: apiBase.startsWith('https://') ? new https.Agent({
        rejectUnauthorized: false, // 允许自签名证书
      }) : undefined,
    });
    
    if (response.status >= 400) {
      throw new Error(`豆瓣API返回错误: ${response.status} ${response.statusText || '未知错误'}`);
    }
    
    const book = response.data;
    console.log('[豆瓣API] 获取成功:', book?.title || '未知');
    
    if (!book) {
      return null;
    }
    
    // 映射豆瓣API返回的数据结构
    return {
      ...book,
      image: book.images?.large || book.images?.medium || book.images?.small || book.image,
    };
  } catch (error: any) {
    if (error.message && (error.message.includes('未配置') || error.message.includes('格式不正确'))) {
      throw error;
    }
    
    if (error.response) {
      console.error('[豆瓣API] 获取书籍信息失败 - 服务器错误:', {
        id,
        status: error.response.status,
        statusText: error.response.statusText,
        url: error.config?.url,
      });
      throw new Error(`豆瓣API请求失败 (${error.response.status}): ${error.response.statusText || '未知错误'}`);
    } else if (error.request) {
      console.error('[豆瓣API] 获取书籍信息失败 - 无响应:', { id, url: error.config?.url });
      throw new Error(`无法连接到豆瓣API服务: ${error.message || '网络错误或服务不可用'}`);
    } else {
      console.error('[豆瓣API] 获取书籍信息失败 - 其他错误:', { id, message: error.message });
      throw new Error(`获取书籍信息失败: ${error.message || '未知错误'}`);
    }
  }
}

export async function getBookByISBN(isbn: string): Promise<DoubanBookInfo | null> {
  try {
    const apiBase = getDoubanApiBase();
    const url = `${apiBase}/v2/book/isbn/${isbn}`;
    console.log('[豆瓣API] 根据ISBN获取书籍:', { isbn, url });
    const response = await axios.get(url, {
      timeout: 15000, // 15秒超时
      validateStatus: (status) => status < 500,
      httpsAgent: apiBase.startsWith('https://') ? new https.Agent({
        rejectUnauthorized: false, // 允许自签名证书
      }) : undefined,
    });
    
    if (response.status >= 400) {
      throw new Error(`豆瓣API返回错误: ${response.status} ${response.statusText || '未知错误'}`);
    }
    
    const book = response.data;
    console.log('[豆瓣API] 获取成功:', book?.title || '未知');
    
    if (!book) {
      return null;
    }
    
    // 映射豆瓣API返回的数据结构
    return {
      ...book,
      image: book.images?.large || book.images?.medium || book.images?.small || book.image,
    };
  } catch (error: any) {
    if (error.message && (error.message.includes('未配置') || error.message.includes('格式不正确'))) {
      throw error;
    }
    
    if (error.response) {
      console.error('[豆瓣API] 获取书籍信息失败 - 服务器错误:', {
        isbn,
        status: error.response.status,
        statusText: error.response.statusText,
        url: error.config?.url,
      });
      throw new Error(`豆瓣API请求失败 (${error.response.status}): ${error.response.statusText || '未知错误'}`);
    } else if (error.request) {
      console.error('[豆瓣API] 获取书籍信息失败 - 无响应:', { isbn, url: error.config?.url });
      throw new Error(`无法连接到豆瓣API服务: ${error.message || '网络错误或服务不可用'}`);
    } else {
      console.error('[豆瓣API] 获取书籍信息失败 - 其他错误:', { isbn, message: error.message });
      throw new Error(`获取书籍信息失败: ${error.message || '未知错误'}`);
    }
  }
}

