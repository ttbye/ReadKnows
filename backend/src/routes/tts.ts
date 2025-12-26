/**
 * @file tts.ts
 * @author ttbye
 * @date 2025-12-17
 *
 * 语音朗读（第一版最小闭环）：
 * - 群晖后端负责鉴权、缓存、对外提供 MP3
 * - Mac mini（内网）提供 TTS 引擎服务（HTTP）
 *
 * 说明：
 * - 本路由不负责“从 EPUB 生成段落列表”，第一版先由前端/阅读器侧提供段落文本与 paragraphId。
 * - 后续再补 /paragraphs（EPUB cfi、TXT/MD scrollTop）生成逻辑。
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { authenticateToken, AuthRequest, requireAdmin } from '../middleware/auth';
import { db } from '../db';

const router = express.Router();

// TTS 服务器地址：优先使用系统设置，其次环境变量，最后默认值
function getTTSBaseUrl(): string {
  // 从系统设置中读取 TTS 服务器配置（每次调用都重新读取，确保获取最新值）
  try {
    const hostSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('tts_server_host') as any;
    const portSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('tts_server_port') as any;
    
    const host = hostSetting?.value ? String(hostSetting.value).trim() : '';
    const port = portSetting?.value ? String(portSetting.value).trim() : '';
    
    if (host && port) {
      const baseUrl = `http://${host}:${port}`;
      console.log(`[TTS] 从系统设置读取TTS服务器地址: ${baseUrl} (host=${host}, port=${port})`);
      return baseUrl;
    } else {
      console.warn(`[TTS] 系统设置中的TTS服务器地址不完整: host=${host || '(空)'}, port=${port || '(空)'}`);
    }
  } catch (e) {
    console.warn('[TTS] 读取系统设置失败，使用默认值', e);
  }
  
  // 环境变量
  if (process.env.TTS_BASE_URL) {
    console.log(`[TTS] 从环境变量读取TTS服务器地址: ${process.env.TTS_BASE_URL}`);
    return process.env.TTS_BASE_URL;
  }
  
  // 默认值：优先使用容器名称（Docker 网络），如果不在 Docker 中则使用 localhost
  // 在 Docker 容器中，可以使用容器名称访问同一网络中的其他容器
  // 如果 TTS 服务在宿主机上运行，使用 host.docker.internal（macOS/Windows）或宿主机 IP
  const isDocker = fs.existsSync('/.dockerenv');
  if (isDocker) {
    // 在 Docker 容器中，尝试使用容器名称
    // 检查是否使用 Lite 版本（端口 5051）
    const defaultPort = process.env.TTS_API_LITE_PORT ? parseInt(process.env.TTS_API_LITE_PORT, 10) : 5050;
    const containerName = defaultPort === 5051 ? 'readknow-tts-api-lite' : 'readknow-tts-api';
    const defaultUrl = `http://${containerName}:${defaultPort}`;
    console.warn(`[TTS] 使用Docker默认地址: ${defaultUrl} (Lite=${defaultPort === 5051})`);
    return defaultUrl;
  }
  
  // 不在 Docker 中，使用 localhost
  // 检查是否使用 Lite 版本（端口 5051）
  const defaultPort = process.env.TTS_API_LITE_PORT ? parseInt(process.env.TTS_API_LITE_PORT, 10) : 5050;
  const defaultUrl = `http://127.0.0.1:${defaultPort}`;
  console.warn(`[TTS] 使用本地默认地址: ${defaultUrl} (Lite=${defaultPort === 5051})`);
  return defaultUrl;
}
const TTS_CACHE_DIR = process.env.TTS_CACHE_DIR || './data/tts-cache';

// 将后端模型名称映射到 TTS API 模型名称
function mapModelToTTSAPI(model: string): string {
  const modelMap: Record<string, string> = {
    'edge': 'edge-tts',
    'qwen3': 'qwen-tts',
    'qwen-tts': 'qwen-tts',
    'edge-tts': 'edge-tts',
    'indextts2': 'indextts2',
    'cosyvoice': 'cosyvoice',
    'multitts': 'multitts',
    'coqui': 'coqui',
  };
  return modelMap[model.toLowerCase()] || model;
}

// 获取 TTS API Key
function getTTSApiKey(): string | undefined {
  // 优先从环境变量读取
  if (process.env.TTS_API_KEY) {
    return process.env.TTS_API_KEY;
  }
  // 从系统设置读取
  try {
    const apiKeySetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('tts_api_key') as any;
    if (apiKeySetting?.value) {
      return String(apiKeySetting.value).trim();
    }
  } catch (e) {
    console.warn('[TTS] 读取 TTS API Key 失败', e);
  }
  return undefined;
}

// 创建 TTS API 请求配置（包含 API Key）
function getTTSRequestConfig(timeout: number = 5000) {
  const apiKey = getTTSApiKey();
  const config: any = {
    timeout: timeout,
  };
  if (apiKey) {
    config.headers = {
      'X-API-Key': apiKey,
    };
  }
  return config;
}

// 从系统设置读取TTS默认值
function getTTSDefaults(): { model: string; voice: string; speed: number; autoRole: boolean } {
  try {
    const modelSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('tts_default_model') as any;
    const voiceSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('tts_default_voice') as any;
    const speedSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('tts_default_speed') as any;
    const autoRoleSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('tts_auto_role') as any;
    
    const model = modelSetting?.value || 'edge';
    const voice = voiceSetting?.value || 'zh-CN-XiaoxiaoNeural';
    const speed = Number(speedSetting?.value) || 1.0;
    const autoRole = autoRoleSetting?.value === 'true';
    
    console.log(`[TTS] 从数据库读取系统设置: model=${model}, voice=${voice}, speed=${speed}, autoRole=${autoRole}`);
    console.log(`[TTS] 数据库原始值: modelSetting=${JSON.stringify(modelSetting)}, voiceSetting=${JSON.stringify(voiceSetting)}`);
    
    return {
      model,
      voice,
      speed,
      autoRole,
    };
  } catch (e) {
    console.warn('[TTS] 读取系统设置失败，使用默认值', e);
    return {
      model: 'edge',
      voice: 'zh-CN-XiaoxiaoNeural',
      speed: 1.0,
      autoRole: false,
    };
  }
}

// 从系统设置读取TTS测试内容样本
function getTTSTestSample(): string {
  try {
    const testSampleSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('tts_test_sample') as any;
    if (testSampleSetting?.value) {
      const sample = String(testSampleSetting.value).trim();
      if (sample) {
        return sample;
      }
    }
  } catch (e) {
    console.warn('[TTS] 读取测试内容样本失败，使用默认值', e);
  }
  // 默认中英文混读测试文本
  return 'Hello, 你好！This is a test. 这是一个测试。';
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeSegment(s: string) {
  // 防止路径注入：仅保留安全字符
  return String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function buildCachePath(opts: {
  bookId: string;
  chapterId: string;
  paragraphId: string;
  profile: string;
  speed: number;
}) {
  const bookId = safeSegment(opts.bookId);
  const chapterId = safeSegment(opts.chapterId);
  const paragraphId = safeSegment(opts.paragraphId);
  const profile = safeSegment(opts.profile || 'natural');
  const speed = Number.isFinite(opts.speed) ? opts.speed : 1.0;
  const speedKey = String(Math.round(speed * 100)).padStart(3, '0');

  const dir = path.join(TTS_CACHE_DIR, bookId, profile, `spd-${speedKey}`, chapterId);
  ensureDir(dir);
  return path.join(dir, `${paragraphId}.mp3`);
}

type VoiceProfile = {
  id: string;
  label: string;
  zhVoice: string;
  enVoice: string;
};

// 语音配置：支持Edge-TTS和Piper
const VOICE_PROFILES: Record<string, VoiceProfile> = {
  natural: {
    id: 'natural',
    label: '自然',
    zhVoice: process.env.TTS_ZH_VOICE_NATURAL || 'zh-CN-XiaoxiaoNeural', // Edge-TTS默认
    enVoice: process.env.TTS_EN_VOICE_NATURAL || 'en-US-JennyNeural',
  },
  clear: {
    id: 'clear',
    label: '清晰',
    zhVoice: process.env.TTS_ZH_VOICE_CLEAR || 'zh-CN-XiaohanNeural',
    enVoice: process.env.TTS_EN_VOICE_CLEAR || 'en-US-GuyNeural',
  },
  // Edge-TTS 中文女声
  'zh-female-xiaoxiao': {
    id: 'zh-female-xiaoxiao',
    label: '晓晓（温柔女声）',
    zhVoice: 'zh-CN-XiaoxiaoNeural',
    enVoice: 'en-US-JennyNeural',
  },
  'zh-female-xiaohan': {
    id: 'zh-female-xiaohan',
    label: '晓涵（自然女声）',
    zhVoice: 'zh-CN-XiaohanNeural',
    enVoice: 'en-US-JennyNeural',
  },
  'zh-female-xiaomo': {
    id: 'zh-female-xiaomo',
    label: '晓墨（成熟女声）',
    zhVoice: 'zh-CN-XiaomoNeural',
    enVoice: 'en-US-JennyNeural',
  },
  'zh-female-xiaoyi': {
    id: 'zh-female-xiaoyi',
    label: '晓伊（可爱女声）',
    zhVoice: 'zh-CN-XiaoyiNeural',
    enVoice: 'en-US-JennyNeural',
  },
  // Edge-TTS 中文男声
  'zh-male-yunxi': {
    id: 'zh-male-yunxi',
    label: '云希（年轻男声）',
    zhVoice: 'zh-CN-YunxiNeural',
    enVoice: 'en-US-GuyNeural',
  },
  'zh-male-yunyang': {
    id: 'zh-male-yunyang',
    label: '云扬（成熟男声）',
    zhVoice: 'zh-CN-YunyangNeural',
    enVoice: 'en-US-GuyNeural',
  },
  'zh-male-yunjian': {
    id: 'zh-male-yunjian',
    label: '云健（专业男声）',
    zhVoice: 'zh-CN-YunjianNeural',
    enVoice: 'en-US-GuyNeural',
  },
  // 旁白/播音
  'zh-narrator': {
    id: 'zh-narrator',
    label: '旁白（播音员）',
    zhVoice: 'zh-CN-YunyangNeural', // 成熟男声适合旁白
    enVoice: 'en-US-GuyNeural',
  },
};

type Lang = 'zh' | 'en';

// 数字转中文（简单版本，支持0-9999）
function numberToChinese(num: number): string {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  
  if (num === 0) return '零';
  if (num < 10) return digits[num];
  if (num < 20) return num === 10 ? '十' : `十${digits[num % 10]}`;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${digits[tens]}十${ones > 0 ? digits[ones] : ''}`;
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    return `${digits[hundreds]}百${remainder > 0 ? (remainder < 10 ? `零${numberToChinese(remainder)}` : numberToChinese(remainder)) : ''}`;
  }
  if (num < 10000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    return `${digits[thousands]}千${remainder > 0 ? (remainder < 100 ? `零${numberToChinese(remainder)}` : numberToChinese(remainder)) : ''}`;
  }
  // 超过9999，逐位读
  return String(num).split('').map(d => numberToChinese(parseInt(d, 10))).join('');
}

// 判断字符是否为中文字符
function isChineseChar(ch: string): boolean {
  return /[\u4e00-\u9fa5]/.test(ch);
}

// 判断字符是否为英文字母（不包括数字）
function isEnglishLetter(ch: string): boolean {
  return /[A-Za-z]/.test(ch);
}

// 判断字符是否为数字
function isDigit(ch: string): boolean {
  return /[0-9]/.test(ch);
}

function splitZhEn(text: string): Array<{ lang: Lang; text: string }> {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];

  // 简单规则：连续 ASCII（字母/数字/常见符号）视为英文片段，其余视为中文片段
  const out: Array<{ lang: Lang; text: string }> = [];
  let buf = '';
  let cur: Lang | null = null;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    let lang: Lang;
    
    if (isChineseChar(ch)) {
      // 中文字符
      lang = 'zh';
    } else if (isEnglishLetter(ch)) {
      // 英文字母
      lang = 'en';
    } else if (isDigit(ch)) {
      // 数字：根据上下文决定语言
      // 如果当前是中文上下文，或者前后有中文，则用中文
      if (cur === 'zh' || (i > 0 && isChineseChar(s[i - 1])) || (i < s.length - 1 && isChineseChar(s[i + 1]))) {
        lang = 'zh';
      } else {
        lang = cur || 'en'; // 默认英文，但如果前面是中文则用中文
      }
    } else {
      // 标点符号、空格等：继承当前语言，如果没有则默认中文
      lang = cur || 'zh';
    }
    
    if (cur === null) {
      cur = lang;
      buf = ch;
      continue;
    }
    
    if (lang === cur) {
      buf += ch;
    } else {
      // 语言切换
      if (buf.trim()) {
        // 处理数字：如果是中文片段且包含数字，转换为中文数字
        if (cur === 'zh' && /\d+/.test(buf)) {
          buf = buf.replace(/\d+/g, (match) => {
            const num = parseInt(match, 10);
            return numberToChinese(num);
          });
        }
        out.push({ lang: cur, text: buf.trim() });
      }
      cur = lang;
      buf = ch;
    }
  }
  
  // 处理最后一段
  if (cur && buf.trim()) {
    // 处理数字：如果是中文片段且包含数字，转换为中文数字
    if (cur === 'zh' && /\d+/.test(buf)) {
      buf = buf.replace(/\d+/g, (match) => {
        const num = parseInt(match, 10);
        return numberToChinese(num);
      });
    }
    out.push({ lang: cur, text: buf.trim() });
  }

  // 合并过短的英文碎片（避免 “a b c” 被切太碎）
  const merged: Array<{ lang: Lang; text: string }> = [];
  for (const seg of out) {
    const prev = merged[merged.length - 1];
    // 如果语言相同，直接合并（不添加空格，保持原样，提高连贯性）
    if (prev && seg.lang === prev.lang) {
      prev.text = `${prev.text}${seg.text}`.trim();
      continue;
    }
    
    // 如果当前是中文片段，且前一个是英文片段，但英文片段很短（<=3个字符），尝试合并到中文
    if (seg.lang === 'zh' && prev && prev.lang === 'en' && prev.text.length <= 3) {
      // 检查是否是常见的英文缩写或单词
      const isCommonAbbr = /^(a|an|the|is|are|was|were|to|of|in|on|at|by|for|with|and|or|but|so|if|as|it|this|that|he|she|we|you|they)$/i.test(prev.text);
      if (!isCommonAbbr) {
        // 合并到中文片段
        prev.text = `${prev.text}${seg.text}`.trim();
        prev.lang = 'zh';
        continue;
      }
    }
    
    // 如果当前是英文片段，且前一个是中文片段，但英文片段很短（<=2个字符），尝试合并到中文
    if (seg.lang === 'en' && prev && prev.lang === 'zh' && seg.text.length <= 2) {
      const isCommonAbbr = /^(a|an|i|am|is|to|of|in|on|at|by|or|it)$/i.test(seg.text);
      if (!isCommonAbbr) {
        prev.text = `${prev.text}${seg.text}`.trim();
        continue;
      }
    }
    merged.push({ ...seg });
  }
  return merged;
}

// 检查TTS服务是否可用
async function checkTTSServiceAvailable(baseUrl: string): Promise<boolean> {
  try {
    const config = getTTSRequestConfig();
    config.timeout = 3000;
    const healthResp = await axios.get(`${baseUrl}/health`, config);
    return healthResp.data?.status === 'ok';
  } catch {
    return false;
  }
}

async function callMacMiniTTS(opts: { text: string; voice: string; speed: number; ttsBaseUrl?: string; autoRole?: boolean; model?: string }) {
  const baseUrl = opts.ttsBaseUrl || getTTSBaseUrl();
  // 如果明确指定了model，使用指定的model；否则使用系统默认值
  const defaults = getTTSDefaults();
  const model = opts.model || defaults.model;
  console.log(`[TTS] callMacMiniTTS: 请求的model=${opts.model}, 系统默认model=${defaults.model}, 最终使用的model=${model}`);
  const isOnlineModel = model === 'edge' || model === 'qwen3';
  
  try {
    // 对于在线TTS，先检查服务是否可用，如果不可用给出更友好的错误
    if (isOnlineModel) {
      const isAvailable = await checkTTSServiceAvailable(baseUrl);
      if (!isAvailable) {
        throw new Error(`TTS服务不可用（${baseUrl}）。在线TTS（${model}）需要本地TTS服务来运行。请确保TTS服务已启动并运行在 ${baseUrl}。`);
      }
    }
    
    // 映射模型名称到 TTS API 格式
    const ttsModel = mapModelToTTSAPI(model);
    console.log(`[TTS] 调用TTS服务: ${baseUrl}/api/tts/synthesize, model=${ttsModel} (原始: ${model}), voice=${opts.voice}, text="${opts.text.substring(0, 50)}..."`);
    const apiKey = getTTSApiKey();
    const requestConfig: any = {
      timeout: 120_000,
      responseType: 'arraybuffer',
      validateStatus: () => true, // 不抛出错误，手动检查
    };
    if (apiKey) {
      requestConfig.headers = {
        'X-API-Key': apiKey,
      };
    }
    const resp = await axios.post(`${baseUrl}/api/tts/synthesize`, {
      text: opts.text,
      model: ttsModel,
      voice: opts.voice,
      speed: opts.speed,
      format: 'mp3',
      autoRole: opts.autoRole || false,
    }, requestConfig);
    
    // 检查响应类型
    const contentType = resp.headers['content-type'] || '';
    
    if (resp.status !== 200) {
      const errorText = Buffer.from(resp.data || '').toString('utf-8');
      let errorData: any = null;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText || `HTTP ${resp.status}` };
      }
      const errorMsg = errorData.message || errorData.error || `HTTP ${resp.status}`;
      console.error(`[TTS] TTS服务返回错误: ${resp.status}, ${errorMsg}`);
      throw new Error(`TTS服务错误: ${errorMsg}`);
    }
    
    // 检查响应是否是JSON错误（即使状态码是200）
    if (contentType.includes('application/json') || (resp.data && resp.data.byteLength < 1000)) {
      try {
        const text = Buffer.from(resp.data).toString('utf-8');
        const jsonData = JSON.parse(text);
        if (jsonData.error || jsonData.message) {
          const errorMsg = jsonData.message || jsonData.error || 'TTS服务返回错误';
          console.error(`[TTS] TTS服务返回JSON错误: ${errorMsg}`);
          throw new Error(`TTS服务错误: ${errorMsg}`);
        }
      } catch (e) {
        // 如果不是JSON或解析失败，继续检查
        if (e instanceof SyntaxError === false && e instanceof Error && e.message.includes('TTS服务错误')) {
          throw e;
        }
      }
    }
    
    if (!resp.data || resp.data.byteLength === 0) {
      throw new Error('TTS服务返回空数据');
    }
    
    // 检查文件大小是否合理（MP3文件应该至少几KB）
    if (resp.data.byteLength < 1000) {
      const text = Buffer.from(resp.data).toString('utf-8');
      try {
        const jsonData = JSON.parse(text);
        if (jsonData.error || jsonData.message) {
          throw new Error(`TTS服务错误: ${jsonData.message || jsonData.error}`);
        }
      } catch {
        // 不是JSON，可能是真的小文件
      }
      console.warn(`[TTS] 警告：返回的文件很小（${resp.data.byteLength} bytes），可能有问题`);
    }
    
    console.log(`[TTS] TTS服务调用成功，返回 ${resp.data.byteLength} bytes`);
    return Buffer.from(resp.data);
  } catch (e: any) {
    console.error(`[TTS] callMacMiniTTS失败:`, e.message || e);
    throw e;
  }
}

// 生成并缓存：POST /api/tts/synthesize
router.post('/synthesize', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { bookId, chapterId, paragraphId, text, profile = 'natural', speed, model, voice, autoRole } = req.body || {};
    const ttsBaseUrl = getTTSBaseUrl();
    
    // 详细的参数验证
    if (!bookId) {
      console.error('[TTS] synthesize 缺少参数: bookId');
      return res.status(400).json({ error: '缺少参数：bookId' });
    }
    if (!chapterId) {
      console.error('[TTS] synthesize 缺少参数: chapterId');
      return res.status(400).json({ error: '缺少参数：chapterId' });
    }
    if (!paragraphId) {
      console.error('[TTS] synthesize 缺少参数: paragraphId');
      return res.status(400).json({ error: '缺少参数：paragraphId' });
    }
    if (typeof text !== 'string' || !text.trim()) {
      console.error('[TTS] synthesize 缺少参数或文本为空: text=', typeof text, text?.substring(0, 50));
      return res.status(400).json({ error: '缺少参数或文本为空：text' });
    }
    
    console.log(`[TTS] synthesize 请求参数: bookId=${bookId}, chapterId=${chapterId}, paragraphId=${paragraphId}, text长度=${text.length}, model=${model}, voice=${voice}`);

    // 从系统设置获取默认值
    const defaults = getTTSDefaults();
    const spd = speed !== undefined ? Number(speed) : defaults.speed;
    const selectedModel = model || defaults.model;
    const selectedVoice = voice || null; // 如果指定了voice，直接使用
    const useAutoRole = autoRole !== undefined ? autoRole : defaults.autoRole;
    
    // 支持自定义语音配置（格式：zh_voiceId 或 en_voiceId 或 natural/clear）
    let prof: VoiceProfile;
    if (selectedVoice) {
      // 如果指定了voice，创建一个临时profile
      prof = {
        id: `custom_${selectedModel}_${selectedVoice}`,
        label: `自定义-${selectedVoice}`,
        zhVoice: selectedVoice,
        enVoice: selectedVoice,
      };
    } else if (profile.startsWith('zh_') || profile.startsWith('en_')) {
      // 自定义语音：从profile ID中提取voice ID
      const voiceId = profile.replace(/^(zh_|en_)/, '');
      const lang = profile.startsWith('zh_') ? 'zh' : 'en';
      prof = {
        id: profile,
        label: lang === 'zh' ? `中文-${voiceId}` : `English-${voiceId}`,
        zhVoice: lang === 'zh' ? voiceId : (VOICE_PROFILES.natural.zhVoice),
        enVoice: lang === 'en' ? voiceId : (VOICE_PROFILES.natural.enVoice),
      };
    } else {
      prof = VOICE_PROFILES[String(profile)] || VOICE_PROFILES.natural;
    }
    const cachePath = buildCachePath({ bookId, chapterId, paragraphId, profile: prof.id, speed: spd });

    if (fs.existsSync(cachePath)) {
      return res.json({ ok: true, cached: true });
    }

    const segments = splitZhEn(text);
    if (segments.length === 0) {
      return res.status(400).json({ error: '文本为空' });
    }

    // 检查是否启用自动角色识别（仅对中文段落）
    const shouldUseAutoRole = useAutoRole && prof.zhVoice.startsWith('zh-CN');
    
    const buffers: Buffer[] = [];
    for (const seg of segments) {
      let voiceToUse = seg.lang === 'en' ? prof.enVoice : prof.zhVoice;
      
      // 如果启用自动角色识别且是中文段落，让TTS服务自动选择语音
      if (shouldUseAutoRole && seg.lang === 'zh') {
        const buf = await callMacMiniTTS({ 
          text: seg.text, 
          model: selectedModel,
          voice: voiceToUse, // 仍然传递默认voice作为fallback
          speed: spd, 
          ttsBaseUrl,
          autoRole: true,
        });
        buffers.push(buf);
      } else {
        const buf = await callMacMiniTTS({ 
          text: seg.text, 
          model: selectedModel,
          voice: voiceToUse, 
          speed: spd, 
          ttsBaseUrl 
        });
        buffers.push(buf);
      }
    }

    // MVP：直接拼接 MP3 buffer（大多数情况下可用；后续可用 ffmpeg 做更严格的拼接）
    const mp3 = Buffer.concat(buffers);
    ensureDir(path.dirname(cachePath));
    fs.writeFileSync(cachePath, mp3);

    res.json({ ok: true, cached: false });
  } catch (e: any) {
    console.error('[TTS] synthesize failed', {
      message: e?.message || String(e),
      stack: e?.stack,
      name: e?.name,
      code: e?.code,
      response: e?.response?.data,
      status: e?.response?.status,
    });
    
    // 提供更详细的错误信息
    let errorMessage = 'TTS 生成失败';
    let errorDetails = e?.message || String(e);
    
    // 如果是TTS服务调用失败，提供更具体的错误信息
    if (e?.message?.includes('TTS服务')) {
      errorMessage = e.message;
    } else if (e?.response?.data) {
      // 如果是TTS API返回的错误
      errorDetails = JSON.stringify(e.response.data);
    }
    
    res.status(500).json({ 
      error: errorMessage, 
      details: errorDetails,
      stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
    });
  }
});

// 取音频（支持 Range）：GET /api/tts/audio?bookId&chapterId&paragraphId&profile&speed&model&voice
router.get('/audio', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const bookId = String(req.query.bookId || '');
    const chapterId = String(req.query.chapterId || '');
    const paragraphId = String(req.query.paragraphId || '');
    const profile = String(req.query.profile || 'natural');
    const voice = typeof req.query.voice === 'string' ? req.query.voice : null;
    const text = typeof req.query.text === 'string' ? req.query.text : null;
    const ttsBaseUrl = getTTSBaseUrl();

    if (!bookId || !chapterId || !paragraphId) {
      return res.status(400).json({ error: '缺少参数：bookId/chapterId/paragraphId' });
    }

    // 从系统设置获取默认值
    const defaults = getTTSDefaults();
    const speed = req.query.speed !== undefined ? Number(req.query.speed) : defaults.speed;
    const model = req.query.model ? String(req.query.model) : defaults.model;
    const useAutoRole = req.query.autoRole !== undefined 
      ? req.query.autoRole === 'true' 
      : defaults.autoRole;

    // 支持自定义语音配置
    let prof: VoiceProfile;
    if (voice) {
      // 如果指定了voice，创建一个临时profile
      prof = {
        id: `custom_${model}_${voice}`,
        label: `自定义-${voice}`,
        zhVoice: voice,
        enVoice: voice,
      };
    } else if (profile.startsWith('zh_') || profile.startsWith('en_')) {
      const voiceId = profile.replace(/^(zh_|en_)/, '');
      const lang = profile.startsWith('zh_') ? 'zh' : 'en';
      prof = {
        id: profile,
        label: lang === 'zh' ? `中文-${voiceId}` : `English-${voiceId}`,
        zhVoice: lang === 'zh' ? voiceId : (VOICE_PROFILES.natural.zhVoice),
        enVoice: lang === 'en' ? voiceId : (VOICE_PROFILES.natural.enVoice),
      };
    } else {
      prof = VOICE_PROFILES[profile] || VOICE_PROFILES.natural;
    }
    const cachePath = buildCachePath({ bookId, chapterId, paragraphId, profile: prof.id, speed });

    // 缓存没有：如果提供了 text，则即时生成；否则 404
    if (!fs.existsSync(cachePath)) {
      if (!text) {
        return res.status(404).json({ error: '未生成音频（缓存不存在）' });
      }
      
      // 检查是否启用自动角色识别
      const shouldUseAutoRole = useAutoRole && prof.zhVoice.startsWith('zh-CN');
      
      const segments = splitZhEn(text);
      const buffers: Buffer[] = [];
      for (const seg of segments) {
        let voiceToUse = seg.lang === 'en' ? prof.enVoice : prof.zhVoice;
        
        // 如果启用自动角色识别且是中文段落，让TTS服务自动选择语音
        if (shouldUseAutoRole && seg.lang === 'zh') {
          buffers.push(await callMacMiniTTS({ 
            text: seg.text, 
            model: model,
            voice: voiceToUse,
            speed, 
            ttsBaseUrl,
            autoRole: true,
          }));
        } else {
          buffers.push(await callMacMiniTTS({ 
            text: seg.text, 
            model: model,
            voice: voiceToUse, 
            speed, 
            ttsBaseUrl 
          }));
        }
      }
      const mp3 = Buffer.concat(buffers);
      ensureDir(path.dirname(cachePath));
      fs.writeFileSync(cachePath, mp3);
    }

    const stat = fs.statSync(cachePath);
    const range = req.headers.range;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const m = /bytes=(\d+)-(\d+)?/.exec(range);
      if (!m) {
        return res.status(416).end();
      }
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (start >= stat.size || end >= stat.size) {
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(cachePath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(cachePath).pipe(res);
  } catch (e: any) {
    console.error('[TTS] audio failed', e?.message || e);
    res.status(500).json({ error: '读取音频失败', details: e?.message });
  }
});

// 获取可用模型列表
router.get('/models', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const ttsBaseUrl = getTTSBaseUrl();
    try {
      const modelsResp = await axios.get(`${ttsBaseUrl}/api/tts/models`, getTTSRequestConfig());
      const models = modelsResp.data?.models || [];
      
      // 确保返回的模型列表格式正确
      if (Array.isArray(models) && models.length > 0) {
        console.log(`[TTS] 成功从TTS服务获取 ${models.length} 个模型`);
        res.json({ models });
        return;
      } else {
        console.warn('[TTS] TTS服务返回的模型列表为空或格式不正确');
      }
    } catch (e: any) {
      console.warn('[TTS] 获取模型列表失败，使用默认配置', e.message || e);
      // 如果连接失败，记录详细错误信息
      if (e.code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED')) {
        console.error(`[TTS] 无法连接到TTS服务: ${ttsBaseUrl}`);
      }
    }
    
    // 返回默认模型列表（当TTS服务不可用时）
    // 注意：模型ID使用后端格式（edge, qwen3），前端会通过mapModelToTTSAPI映射到TTS API格式
    const defaultModels = [
      { id: 'edge', name: 'Edge-TTS', description: '微软Edge TTS（在线，高质量）', type: 'online', available: false },
      { id: 'qwen3', name: 'Qwen3-TTS', description: '通义千问TTS（在线，高质量）', type: 'online', available: false },
      { id: 'indextts2', name: 'IndexTTS2', description: 'IndexTTS2（离线，高质量，支持情感）', type: 'offline', available: false },
    ];
    
    console.warn(`[TTS] 返回默认模型列表（TTS服务不可用）: ${defaultModels.length} 个模型`);
    res.json({ models: defaultModels });
  } catch (e: any) {
    console.error('[TTS] 获取models失败', e);
    res.status(500).json({ error: '获取模型列表失败', details: e.message });
  }
});

// 获取可用语音列表（支持model参数和lang语言筛选参数）
router.get('/voices', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const ttsBaseUrl = getTTSBaseUrl();
    const model = String(req.query.model || 'edge');
    const lang = String(req.query.lang || '').toLowerCase(); // 语言筛选参数：'zh' 或 'en'
    const ttsModel = mapModelToTTSAPI(model);
    
    // 如果没有指定lang参数，尝试从系统设置读取
    let filterLang = lang;
    if (!filterLang) {
      try {
        const langSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('system_language') as any;
        if (langSetting?.value) {
          const systemLang = String(langSetting.value).trim();
          filterLang = systemLang === 'zh-CN' ? 'zh' : (systemLang === 'en' ? 'en' : '');
        }
      } catch (e) {
        console.warn('[TTS] 读取系统语言设置失败，使用默认行为', e);
      }
    }
    
    try {
      // 获取语音列表可能需要更长时间（特别是 Edge-TTS 需要从微软服务器获取）
      const config = getTTSRequestConfig(30000); // 30秒超时
      console.log(`[TTS] 获取语音列表: model=${model} -> ttsModel=${ttsModel}, lang=${filterLang || '(未指定)'}, url=${ttsBaseUrl}/api/tts/voices?model=${encodeURIComponent(ttsModel)}`);
      const voicesResp = await axios.get(`${ttsBaseUrl}/api/tts/voices?model=${encodeURIComponent(ttsModel)}`, config);
      
      console.log(`[TTS] TTS API 响应:`, {
        status: voicesResp.status,
        dataType: typeof voicesResp.data,
        hasVoices: !!voicesResp.data?.voices,
        voicesLength: voicesResp.data?.voices?.length || 0,
        dataKeys: voicesResp.data ? Object.keys(voicesResp.data) : []
      });
      
      // TTS API 返回格式: {model: string, voices: array}
      let voices = voicesResp.data?.voices || voicesResp.data || [];
      
      // 如果返回的是数组，直接使用；如果是对象，提取 voices 字段
      if (!Array.isArray(voices)) {
        voices = [];
      }
      
      // 根据语言参数筛选音色
      if (filterLang && (filterLang === 'zh' || filterLang === 'en')) {
        const targetLang = filterLang;
        const filteredVoices = voices.filter((v: any) => {
          const locale = (v.locale || '').toLowerCase();
          const language = (v.language || '').toLowerCase();
          const id = (v.id || '').toLowerCase();
          
          if (targetLang === 'zh') {
            // 筛选中文音色
            return locale.includes('zh') || 
                   language.includes('chinese') || 
                   language.includes('中文') || 
                   id.includes('zh-cn') || 
                   id.includes('zh_');
          } else if (targetLang === 'en') {
            // 筛选英文音色
            return locale.includes('en') || 
                   language.includes('english') || 
                   language.includes('英文') || 
                   id.includes('en-us') || 
                   id.includes('en_') ||
                   id.includes('en-');
          }
          return false;
        });
        
        voices = filteredVoices;
        console.log(`[TTS] 根据语言 ${targetLang} 筛选音色：从 ${voicesResp.data?.voices?.length || 0} 个音色中筛选出 ${voices.length} 个`);
      } else {
        // 如果没有指定语言筛选，使用原来的逻辑：根据系统语言优先显示，但不强制过滤
        // 检测系统语言（从 Accept-Language）
        const acceptLanguage = req.headers['accept-language'] || '';
        // 检测是否偏好中文（但不强制，如果用户需要其他语言音色，应该能看到所有音色）
        const preferChinese = acceptLanguage.includes('zh') || !acceptLanguage || acceptLanguage.includes('*');
        
        // 如果偏好中文，将中文音色排在前面，但不过滤掉其他语言
        if (preferChinese && voices.length > 0) {
          // 分离中文音色和其他音色
          const chineseVoices = voices.filter((v: any) => {
            const locale = (v.locale || '').toLowerCase();
            const language = (v.language || '').toLowerCase();
            const id = (v.id || '').toLowerCase();
            return locale.includes('zh') || language.includes('chinese') || language.includes('中文') || id.includes('zh-cn') || id.includes('zh_');
          });
          
          const otherVoices = voices.filter((v: any) => {
            const locale = (v.locale || '').toLowerCase();
            const language = (v.language || '').toLowerCase();
            const id = (v.id || '').toLowerCase();
            return !(locale.includes('zh') || language.includes('chinese') || language.includes('中文') || id.includes('zh-cn') || id.includes('zh_'));
          });
          
          // 将中文音色排在前面，其他音色排在后面
          if (chineseVoices.length > 0) {
            voices = [...chineseVoices, ...otherVoices];
            console.log(`[TTS] 已排序音色列表：${chineseVoices.length} 个中文音色在前，${otherVoices.length} 个其他音色在后（共 ${voices.length} 个音色）`);
          } else {
            console.log(`[TTS] 未找到中文音色，返回所有音色（共 ${voices.length} 个）`);
          }
        } else {
          console.log(`[TTS] 返回所有音色（共 ${voices.length} 个）`);
        }
      }
      
      // 返回格式：{model: string, voices: array}
      console.log(`[TTS] 返回语音列表: model=${ttsModel}, lang=${filterLang || '(未指定)'}, voices数量=${voices.length}`);
      res.json({
        model: ttsModel,
        voices: voices
      });
    } catch (e: any) {
      console.warn(`[TTS] 获取语音列表失败 (model=${model})，使用默认配置`, e.message || e);
      
      // 如果TTS服务不可用，返回默认语音列表
      const defaultVoices: Array<{ id: string; name: string; lang: string; gender?: string; style?: string; description?: string; model?: string }> = [];
      
      if (model === 'qwen3') {
        // Qwen3-TTS 默认语音列表
        defaultVoices.push(
          { id: 'qwen-zh-female-1', name: '温柔女声', lang: 'zh', gender: 'female', style: '温柔', description: '温柔、自然的女声', model: 'qwen3' },
          { id: 'qwen-zh-female-2', name: '清晰女声', lang: 'zh', gender: 'female', style: '清晰', description: '清晰、明亮的女声', model: 'qwen3' },
          { id: 'qwen-zh-female-3', name: '甜美女声', lang: 'zh', gender: 'female', style: '甜美', description: '甜美、可爱的女声', model: 'qwen3' },
          { id: 'qwen-zh-male-1', name: '成熟男声', lang: 'zh', gender: 'male', style: '成熟', description: '成熟、稳重的男声', model: 'qwen3' },
          { id: 'qwen-zh-male-2', name: '年轻男声', lang: 'zh', gender: 'male', style: '年轻', description: '年轻、活力的男声', model: 'qwen3' },
          { id: 'qwen-zh-male-3', name: '磁性男声', lang: 'zh', gender: 'male', style: '磁性', description: '磁性、有魅力的男声', model: 'qwen3' },
          { id: 'qwen-zh-narrator', name: '旁白（播音员）', lang: 'zh', gender: 'male', style: '播音', description: '专业播音员风格', model: 'qwen3' },
        );
      } else if (model === 'edge') {
        // Edge-TTS 默认语音列表（中文）- 完整列表
        defaultVoices.push(
          // 中文女声
          { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（温柔女声）', lang: 'zh', gender: 'female', style: '温柔', description: '温柔、自然的女声', model: 'edge' },
          { id: 'zh-CN-XiaohanNeural', name: '晓涵（自然女声）', lang: 'zh', gender: 'female', style: '自然', description: '自然、清晰的女声', model: 'edge' },
          { id: 'zh-CN-XiaomoNeural', name: '晓墨（成熟女声）', lang: 'zh', gender: 'female', style: '成熟', description: '成熟、稳重的女声', model: 'edge' },
          { id: 'zh-CN-XiaoyiNeural', name: '晓伊（可爱女声）', lang: 'zh', gender: 'female', style: '可爱', description: '可爱、活泼的女声', model: 'edge' },
          { id: 'zh-CN-XiaoyouNeural', name: '晓悠（温柔女声）', lang: 'zh', gender: 'female', style: '温柔', description: '温柔、甜美的女声', model: 'edge' },
          { id: 'zh-CN-XiaoxuanNeural', name: '晓萱（活泼女声）', lang: 'zh', gender: 'female', style: '活泼', description: '活泼、开朗的女声', model: 'edge' },
          { id: 'zh-CN-XiaoruiNeural', name: '晓睿（知性女声）', lang: 'zh', gender: 'female', style: '知性', description: '知性、优雅的女声', model: 'edge' },
          { id: 'zh-CN-XiaoshuangNeural', name: '晓双（专业女声）', lang: 'zh', gender: 'female', style: '专业', description: '专业、清晰的女声', model: 'edge' },
          // 中文男声
          { id: 'zh-CN-YunxiNeural', name: '云希（年轻男声）', lang: 'zh', gender: 'male', style: '年轻', description: '年轻、活力的男声', model: 'edge' },
          { id: 'zh-CN-YunyangNeural', name: '云扬（成熟男声）', lang: 'zh', gender: 'male', style: '成熟', description: '成熟、稳重的男声', model: 'edge' },
          { id: 'zh-CN-YunjianNeural', name: '云健（专业男声）', lang: 'zh', gender: 'male', style: '专业', description: '专业、清晰的男声', model: 'edge' },
          { id: 'zh-CN-YunyeNeural', name: '云野（磁性男声）', lang: 'zh', gender: 'male', style: '磁性', description: '磁性、有魅力的男声', model: 'edge' },
          { id: 'zh-CN-YunfengNeural', name: '云枫（沉稳男声）', lang: 'zh', gender: 'male', style: '沉稳', description: '沉稳、大气的男声', model: 'edge' },
        );
      } else if (model === 'indextts2') {
        // IndexTTS2 默认语音列表
        defaultVoices.push(
          { id: 'indextts2-zh-female-1', name: '中文女声1（温柔）', lang: 'zh', gender: 'female', style: '温柔', description: '温柔、自然的女声', model: 'indextts2' },
          { id: 'indextts2-zh-female-2', name: '中文女声2（清晰）', lang: 'zh', gender: 'female', style: '清晰', description: '清晰、明亮的女声', model: 'indextts2' },
          { id: 'indextts2-zh-male-1', name: '中文男声1（成熟）', lang: 'zh', gender: 'male', style: '成熟', description: '成熟、稳重的男声', model: 'indextts2' },
          { id: 'indextts2-zh-male-2', name: '中文男声2（年轻）', lang: 'zh', gender: 'male', style: '年轻', description: '年轻、活力的男声', model: 'indextts2' },
        );
      } else if (model === 'coqui') {
        // Coqui TTS 默认语音列表
        defaultVoices.push(
          { id: 'zh-CN-female-1', name: '中文女声1（温柔）', lang: 'zh', gender: 'female', style: '温柔', description: '温柔、自然的女声', model: 'coqui' },
          { id: 'zh-CN-female-2', name: '中文女声2（清晰）', lang: 'zh', gender: 'female', style: '清晰', description: '清晰、明亮的女声', model: 'coqui' },
          { id: 'zh-CN-male-1', name: '中文男声1（成熟）', lang: 'zh', gender: 'male', style: '成熟', description: '成熟、稳重的男声', model: 'coqui' },
          { id: 'zh-CN-male-2', name: '中文男声2（年轻）', lang: 'zh', gender: 'male', style: '年轻', description: '年轻、活力的男声', model: 'coqui' },
        );
      } else if (model === 'piper') {
        // Piper TTS 默认语音列表
        defaultVoices.push(
          { id: 'zh', name: '中文默认', lang: 'zh', description: '中文默认语音', model: 'piper' },
          { id: 'zh-CN', name: '中文（标准）', lang: 'zh', description: '中文标准语音', model: 'piper' },
          { id: 'en', name: 'English Default', lang: 'en', description: 'English default voice', model: 'piper' },
          { id: 'en-US', name: 'English (US)', lang: 'en', description: 'English US voice', model: 'piper' },
        );
      } else if (model === 'cosyvoice') {
        // CosyVoice 默认语音列表
        defaultVoices.push(
          { id: 'cosyvoice-中文女', name: '中文女（预训练）', lang: 'zh', gender: 'female', style: '自然', description: 'CosyVoice 预训练中文女声', model: 'cosyvoice' },
          { id: 'cosyvoice-中文男', name: '中文男（预训练）', lang: 'zh', gender: 'male', style: '自然', description: 'CosyVoice 预训练中文男声', model: 'cosyvoice' },
          { id: 'cosyvoice-英文女', name: '英文女（预训练）', lang: 'en', gender: 'female', style: '自然', description: 'CosyVoice 预训练英文女声', model: 'cosyvoice' },
          { id: 'cosyvoice-英文男', name: '英文男（预训练）', lang: 'en', gender: 'male', style: '自然', description: 'CosyVoice 预训练英文男声', model: 'cosyvoice' },
        );
      } else {
        // 其他未知模型，提供通用选项
        defaultVoices.push(
          { id: 'zh', name: '中文默认', lang: 'zh', description: '中文默认语音', model: model },
          { id: 'en', name: 'English Default', lang: 'en', description: 'English default voice', model: model },
        );
      }
      
      // 返回默认语音列表，而不是错误
      // 返回格式：{model: string, voices: array}
      console.log(`[TTS] 使用默认语音列表: model=${model}, voices数量=${defaultVoices.length}`);
      res.json({
        model: model,
        voices: defaultVoices,
        engineAvailable: false,
        supportsRoleDetection: model === 'edge' || model === 'qwen3' || model === 'indextts2' || model === 'coqui' || model === 'cosyvoice',
        supportsEmotion: model === 'indextts2' || model === 'coqui' || model === 'cosyvoice',
        warning: 'TTS服务不可用，返回默认语音列表',
      });
    }
  } catch (e: any) {
    console.error('[TTS] 获取voices失败', e);
    res.status(500).json({ error: '获取语音列表失败', details: e.message });
  }
});

// 获取可选 voiceProfile（前端 UI 用）
router.get('/profiles', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const ttsBaseUrl = getTTSBaseUrl();
    
    // 从TTS服务获取可用语音列表
    let availableVoices: Array<{ id: string; name: string; lang: string; gender?: string; style?: string; model?: string }> = [];
    let engine = 'edge';
    try {
      // 获取语音列表可能需要更长时间（特别是 Edge-TTS 需要从微软服务器获取）
      const voicesResp = await axios.get(`${ttsBaseUrl}/api/tts/voices?model=edge-tts`, getTTSRequestConfig(30000));
      
      // TTS API 返回格式: {model: string, voices: array}
      let voices = voicesResp.data?.voices || voicesResp.data || [];
      if (!Array.isArray(voices)) {
        voices = [];
      }
      
      // 优先显示中文音色，但不强制过滤
      if (voices.length > 0) {
        // 分离中文音色和其他音色
        const chineseVoices = voices.filter((v: any) => {
          const locale = (v.locale || '').toLowerCase();
          const language = (v.language || '').toLowerCase();
          const id = (v.id || '').toLowerCase();
          return locale.includes('zh') || language.includes('chinese') || language.includes('中文') || id.includes('zh-cn') || id.includes('zh_');
        });
        
        const otherVoices = voices.filter((v: any) => {
          const locale = (v.locale || '').toLowerCase();
          const language = (v.language || '').toLowerCase();
          const id = (v.id || '').toLowerCase();
          return !(locale.includes('zh') || language.includes('chinese') || language.includes('中文') || id.includes('zh-cn') || id.includes('zh_'));
        });
        
        // 将中文音色排在前面，其他音色排在后面
        if (chineseVoices.length > 0) {
          availableVoices = [...chineseVoices, ...otherVoices];
          console.log(`[TTS] 已排序音色列表：${chineseVoices.length} 个中文音色在前，${otherVoices.length} 个其他音色在后（共 ${availableVoices.length} 个音色）`);
        } else {
          availableVoices = voices;
          console.log(`[TTS] 未找到中文音色，返回所有音色（共 ${voices.length} 个）`);
        }
      }
      
      engine = voicesResp.data?.model || 'edge';
    } catch (e) {
      console.warn('[TTS] 获取可用语音列表失败，使用默认配置', e);
    }
    
    // 构建语音配置列表
    const voiceOptions: Array<{ id: string; label: string; zhVoice?: string; enVoice?: string; engine?: string }> = [];
    
    // 添加Edge-TTS语音选项（如果引擎支持）
    if (engine === 'edge' || availableVoices.some(v => v.id.startsWith('zh-CN-'))) {
      voiceOptions.push(
        { id: 'edge-female-1', label: 'EDGE - 中文女声1（温柔）', zhVoice: 'zh-CN-XiaoxiaoNeural', enVoice: 'en-US-JennyNeural', engine: 'edge' },
        { id: 'edge-female-2', label: 'EDGE - 中文女声2（清晰）', zhVoice: 'zh-CN-XiaohanNeural', enVoice: 'en-US-JennyNeural', engine: 'edge' },
        { id: 'edge-male-1', label: 'EDGE - 中文男声1（成熟）', zhVoice: 'zh-CN-YunyangNeural', enVoice: 'en-US-GuyNeural', engine: 'edge' },
        { id: 'edge-male-2', label: 'EDGE - 中文男声2（年轻）', zhVoice: 'zh-CN-YunxiNeural', enVoice: 'en-US-GuyNeural', engine: 'edge' },
        { id: 'edge-narrator', label: 'EDGE - 旁白（播音员）', zhVoice: 'zh-CN-YunyangNeural', enVoice: 'en-US-GuyNeural', engine: 'edge' },
      );
    }
    
    // 添加Coqui TTS语音选项（如果引擎支持）
    if (engine === 'coqui' || availableVoices.some(v => v.id.startsWith('zh-CN-female') || v.id.startsWith('zh-CN-male'))) {
      voiceOptions.push(
        { id: 'zh-CN-female-1', label: '中文女声1（温柔）', zhVoice: 'zh-CN-female-1', enVoice: 'en-US-female', engine: 'coqui' },
        { id: 'zh-CN-female-2', label: '中文女声2（清晰）', zhVoice: 'zh-CN-female-2', enVoice: 'en-US-female', engine: 'coqui' },
        { id: 'zh-CN-male-1', label: '中文男声1（成熟）', zhVoice: 'zh-CN-male-1', enVoice: 'en-US-male', engine: 'coqui' },
        { id: 'zh-CN-male-2', label: '中文男声2（年轻）', zhVoice: 'zh-CN-male-2', enVoice: 'en-US-male', engine: 'coqui' },
        { id: 'zh-CN-narrator', label: '旁白（播音员）', zhVoice: 'zh-CN-narrator', enVoice: 'en-US-male', engine: 'coqui' },
      );
    }
    
    // 添加预设的profiles
    const defaultProfiles = Object.values(VOICE_PROFILES).map((p) => ({ 
      id: p.id, 
      label: p.label,
      zhVoice: p.zhVoice,
      enVoice: p.enVoice
    }));
    voiceOptions.push(...defaultProfiles);
    
    res.json({ 
      profiles: voiceOptions, 
      availableVoices,
      engine,
      ttsBaseUrl 
    });
  } catch (e: any) {
    console.error('[TTS] 获取profiles失败', e);
    // 回退到默认配置
    const profiles = Object.values(VOICE_PROFILES).map((p) => ({ id: p.id, label: p.label }));
    res.json({ profiles, ttsBaseUrl: getTTSBaseUrl() });
  }
});

// 测试中英文混读（仅管理员，用于调试）
router.post('/test-mixed', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const ttsBaseUrl = getTTSBaseUrl();
    const testText = 'Hello, 你好！This is a test. 这是一个测试。';
    
    console.log(`[TTS Test] 测试中英文混读: ${testText}`);
    
    // 分段合成
    const segments = [
      { text: 'Hello, ', voice: 'en' },
      { text: '你好！', voice: 'zh' },
      { text: 'This is a test. ', voice: 'en' },
      { text: '这是一个测试。', voice: 'zh' }
    ];
    
    const buffers: Buffer[] = [];
    const errors: string[] = [];
    
    for (const seg of segments) {
      try {
        const buf = await callMacMiniTTS({ 
          text: seg.text, 
          voice: seg.voice, 
          speed: 1.0, 
          ttsBaseUrl 
        });
        buffers.push(buf);
        console.log(`[TTS Test] ✅ ${seg.voice} 片段合成成功: "${seg.text}" (${buf.length} bytes)`);
      } catch (e: any) {
        const errorMsg = `${seg.voice}片段失败: ${e.message}`;
        errors.push(errorMsg);
        console.error(`[TTS Test] ❌ ${errorMsg}`);
      }
    }
    
    if (buffers.length === 0) {
      return res.status(500).json({
        success: false,
        error: '所有片段合成失败',
        errors
      });
    }
    
    // 拼接音频
    const mixedAudio = Buffer.concat(buffers);
    
    res.json({
      success: true,
      message: '中英文混读测试成功',
      totalSize: mixedAudio.length,
      segments: segments.length,
      successfulSegments: buffers.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (e: any) {
    console.error('[TTS Test] 混读测试失败:', e);
    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

// 测试 TTS 服务连接（仅管理员）
router.post('/test', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { voice, text, model } = req.body || {};
    const ttsBaseUrl = getTTSBaseUrl();
    console.log('[TTS] 测试 TTS 服务连接，地址:', ttsBaseUrl);
    console.log('[TTS] 环境变量 TTS_BASE_URL:', process.env.TTS_BASE_URL);
    console.log('[TTS] 测试请求参数: voice=', voice, ', text=', text?.substring(0, 50), ', model=', model);
    
    // 1. 测试健康检查端点
    let healthCheckPassed = false;
    let healthCheckError: string | null = null;
    try {
      console.log('[TTS] 尝试连接健康检查端点:', `${ttsBaseUrl}/health`);
      const healthConfig = getTTSRequestConfig();
      healthConfig.timeout = 5000;
      const healthResp = await axios.get(`${ttsBaseUrl}/health`, healthConfig);
      if (healthResp.data?.status === 'ok') {
        healthCheckPassed = true;
      }
    } catch (e: any) {
      healthCheckError = e.message || '连接超时或服务不可用';
      console.error('[TTS] 健康检查失败', {
        error: healthCheckError,
        code: e.code,
        url: `${ttsBaseUrl}/health`,
        stack: e.stack
      });
      
      // 检查错误类型，如果是连接拒绝，说明服务未启动
      if (e.code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED')) {
        // 对于在线TTS，给出更友好的提示
        return res.status(500).json({ 
          error: '无法连接到 TTS 服务',
          details: `TTS服务未运行在 ${ttsBaseUrl}。即使是在线TTS（Edge-TTS、Qwen3-TTS），也需要本地TTS服务来运行Python脚本。`,
          ttsBaseUrl,
          suggestion: `请确保TTS服务已启动并运行在 ${ttsBaseUrl}。在线TTS虽然调用在线API，但需要通过本地TTS服务的Python环境来执行。`,
          isOnlineTTS: true,
          help: '在线TTS（Edge-TTS、Qwen3-TTS）需要本地TTS服务来运行Python脚本，请启动TTS服务容器或进程。'
        });
      }
    }
    
    // 2. 测试获取 voices 列表
    let voicesAvailable = false;
    let availableVoices: any[] = [];
    try {
      // 确定要测试的模型（优先使用请求参数，其次使用系统默认）
      const defaults = getTTSDefaults();
      const testModelForVoices = model || defaults.model;
      const ttsModelForVoices = mapModelToTTSAPI(testModelForVoices);
      
      console.log(`[TTS] 测试获取语音列表: model=${testModelForVoices} -> ttsModel=${ttsModelForVoices}`);
      
      // 获取语音列表可能需要更长时间（特别是 Edge-TTS 需要从微软服务器获取）
      const voicesResp = await axios.get(`${ttsBaseUrl}/api/tts/voices?model=${encodeURIComponent(ttsModelForVoices)}`, getTTSRequestConfig(30000));
      
      // TTS API 返回格式: {model: string, voices: array}
      let voices = voicesResp.data?.voices || voicesResp.data || [];
      if (!Array.isArray(voices)) {
        voices = [];
      }
      
      // 优先显示中文音色，但不强制过滤
      if (voices.length > 0) {
        // 分离中文音色和其他音色
        const chineseVoices = voices.filter((v: any) => {
          const locale = (v.locale || '').toLowerCase();
          const language = (v.language || '').toLowerCase();
          const id = (v.id || '').toLowerCase();
          return locale.includes('zh') || language.includes('chinese') || language.includes('中文') || id.includes('zh-cn') || id.includes('zh_');
        });
        
        const otherVoices = voices.filter((v: any) => {
          const locale = (v.locale || '').toLowerCase();
          const language = (v.language || '').toLowerCase();
          const id = (v.id || '').toLowerCase();
          return !(locale.includes('zh') || language.includes('chinese') || language.includes('中文') || id.includes('zh-cn') || id.includes('zh_'));
        });
        
        // 将中文音色排在前面，其他音色排在后面
        if (chineseVoices.length > 0) {
          availableVoices = [...chineseVoices, ...otherVoices];
          console.log(`[TTS] 测试端点：已排序音色列表：${chineseVoices.length} 个中文音色在前，${otherVoices.length} 个其他音色在后（共 ${availableVoices.length} 个音色）`);
        } else {
          availableVoices = voices;
          console.log(`[TTS] 测试端点：未找到中文音色，返回所有音色（共 ${voices.length} 个）`);
        }
        voicesAvailable = availableVoices.length > 0;
      }
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      let details = errorMsg;
      if (errorMsg.includes('timeout')) {
        details = '获取语音列表超时。Edge-TTS 需要从微软服务器获取语音列表，可能需要更长时间。请稍后重试或检查网络连接。';
      }
      return res.status(500).json({ 
        error: '无法获取 TTS 语音列表',
        details: details,
        ttsBaseUrl 
      });
    }
    
    // 3. 测试实际 TTS 合成（使用简单文本或指定文本）
    let synthesisWorks = false;
    let synthesisError: string | null = null;
    let testModel: string | null = null; // 用于测试的模型
    let testVoice: string | null = null; // 用于测试的语音
    
    // 优先从请求参数读取模型，其次从系统设置读取默认模型和语音
    const defaults = getTTSDefaults();
    testModel = model || defaults.model;  // 优先使用请求参数中的model
    testVoice = defaults.voice;
    
    console.log(`[TTS] 测试配置: model=${testModel} (请求参数: ${model || '未指定'}, 系统默认: ${defaults.model}), voice=${testVoice}`);
    
    try {
      // 优先使用请求参数中的text，其次使用系统设置中的测试样本，最后使用默认值
      const testText = text || getTTSTestSample();
      
      // 如果请求参数中指定了voice，优先使用请求参数
      if (voice) {
        console.log(`[TTS] 使用请求参数中的voice: ${voice}`);
        // 解析voice profile ID，提取实际的voice ID
        const prof = VOICE_PROFILES[voice];
        if (prof) {
          testVoice = prof.zhVoice;
          console.log(`[TTS] 从profile解析得到中文语音: ${testVoice}`);
        } else if (voice.startsWith('edge-')) {
          // Edge-TTS语音ID映射
          const edgeVoiceMap: Record<string, string> = {
            'edge-female-1': 'zh-CN-XiaoxiaoNeural',
            'edge-female-2': 'zh-CN-XiaohanNeural',
            'edge-male-1': 'zh-CN-YunyangNeural',
            'edge-male-2': 'zh-CN-YunxiNeural',
            'edge-narrator': 'zh-CN-YunyangNeural',
          };
          testVoice = edgeVoiceMap[voice] || 'zh-CN-XiaoxiaoNeural';
          testModel = 'edge'; // 明确指定使用 edge 模型
          console.log(`[TTS] Edge-TTS语音映射: ${voice} -> ${testVoice}`);
        } else if (voice.startsWith('zh-CN-')) {
          // 直接是Edge-TTS语音ID
          testVoice = voice;
          testModel = 'edge';
          console.log(`[TTS] 直接使用Edge-TTS语音ID: ${testVoice}`);
        } else if (voice.startsWith('qwen-')) {
          // Qwen3-TTS语音ID
          testVoice = voice;
          testModel = 'qwen3';
          console.log(`[TTS] 使用Qwen3-TTS语音ID: ${testVoice}`);
        } else if (voice.startsWith('cosyvoice-')) {
          // CosyVoice语音ID
          testVoice = voice;
          testModel = 'cosyvoice';
          console.log(`[TTS] 使用CosyVoice语音ID: ${testVoice}`);
        } else {
          // 其他情况，检查是否是有效的Edge-TTS语音ID
          // 如果voice是简单的"zh"或"en"（Piper格式），需要转换为Edge-TTS格式
          if (voice === 'zh' || voice === 'en') {
            console.warn(`[TTS] ⚠️ 检测到Piper格式的语音ID(${voice})，但当前使用Edge-TTS，自动转换为Edge-TTS格式`);
            if (voice === 'zh') {
              testVoice = 'zh-CN-XiaoxiaoNeural'; // 默认中文女声
            } else {
              testVoice = 'en-US-JennyNeural'; // 默认英文女声
            }
            console.log(`[TTS] 语音已转换: ${voice} -> ${testVoice}`);
          } else if (voice.startsWith('en-US-') || voice.startsWith('zh-CN-')) {
            // 已经是Edge-TTS格式，直接使用
          testVoice = voice;
            console.log(`[TTS] 直接使用Edge-TTS语音ID: ${testVoice}`);
          } else {
            // 其他未知格式，尝试直接使用，但记录警告
            testVoice = voice;
            console.warn(`[TTS] ⚠️ 未知的语音ID格式: ${voice}，尝试直接使用`);
          }
        }
      }
      
      // 验证模型是否可用，并确保语音与模型匹配
      try {
        const modelsResp = await axios.get(`${ttsBaseUrl}/api/tts/models`, getTTSRequestConfig());
        const availableModels = modelsResp.data?.models || [];
        const selectedModel = availableModels.find((m: any) => m.id === testModel && m.available === true);
        
        if (selectedModel) {
          // 系统设置的模型可用
          // 检查语音是否明显不匹配（比如edge模型使用了qwen语音或coqui语音）
          // 如果语音明显不匹配，才需要调整；否则直接使用系统设置的语音
          // Edge-TTS格式：zh-CN-XXXNeural 或 en-US-XXXNeural
          // Coqui TTS格式：zh-CN-female-1, zh-CN-male-1 等
          const isEdgeTTSVoiceFormat = (voiceId: string): boolean => {
            return /^(zh-CN|en-US)-[A-Za-z]+Neural(-narrator)?$/.test(voiceId);
          };
          
          const voiceClearlyMismatches = 
            (testModel === 'edge' && testVoice && (
              testVoice.startsWith('qwen-') || 
              testVoice.startsWith('indextts2-') ||
              testVoice.startsWith('cosyvoice-') ||
              !isEdgeTTSVoiceFormat(testVoice) // 不是Edge-TTS格式
            )) ||
            (testModel === 'qwen3' && testVoice && !testVoice.startsWith('qwen-')) ||
            (testModel === 'indextts2' && testVoice && !testVoice.startsWith('indextts2-')) ||
            (testModel === 'coqui' && testVoice && (
              testVoice.startsWith('qwen-') || 
              testVoice.startsWith('indextts2-') ||
              testVoice.startsWith('cosyvoice-') ||
              isEdgeTTSVoiceFormat(testVoice) // Edge-TTS格式不适用于Coqui
            )) ||
            (testModel === 'cosyvoice' && testVoice && (
              testVoice.startsWith('qwen-') || 
              testVoice.startsWith('indextts2-') ||
              isEdgeTTSVoiceFormat(testVoice) // Edge-TTS格式不适用于CosyVoice
            )) ||
            (testModel === 'piper' && testVoice && (
              testVoice.startsWith('zh-CN-') || 
              testVoice.startsWith('qwen-') || 
              testVoice.startsWith('indextts2-') ||
              testVoice.startsWith('cosyvoice-')
            ));
          
          if (voiceClearlyMismatches) {
            // 语音明显不匹配模型，根据模型设置合适的默认语音
            // 注意：不同TTS引擎的语音ID格式完全不同，不应该尝试转换，直接使用该引擎的默认语音
            console.warn(`[TTS] ⚠️ 语音 ${testVoice} 不匹配模型 ${testModel}，使用模型默认语音`);
            console.warn(`[TTS] 提示：不同TTS引擎的语音ID格式不同，切换引擎时需要使用对应引擎的语音ID`);
            const originalVoice = testVoice;
            
            if (testModel === 'edge') {
              // Edge-TTS格式：zh-CN-XXXNeural
              testVoice = 'zh-CN-XiaoxiaoNeural';
            } else if (testModel === 'qwen3') {
              // Qwen3-TTS格式：qwen-zh-female-1
              testVoice = 'qwen-zh-female-1';
            } else if (testModel === 'indextts2') {
              // IndexTTS2格式：indextts2-zh-female-1
              testVoice = 'indextts2-zh-female-1';
            } else if (testModel === 'coqui') {
              // Coqui TTS格式：zh-CN-female-1
              testVoice = 'zh-CN-female-1';
            } else if (testModel === 'cosyvoice') {
              // CosyVoice格式：cosyvoice-中文女
              testVoice = 'cosyvoice-中文女';
            } else if (testModel === 'piper') {
              // Piper格式：zh 或 en
              testVoice = 'zh';
            }
            
            console.warn(`[TTS] 语音已从 ${originalVoice} 调整为 ${testVoice}（${testModel}引擎默认语音）`);
          } else {
            // 语音匹配或可能匹配，直接使用系统设置的语音（不进行任何修改）
            // 让TTS服务自己判断语音是否有效
            console.log(`[TTS] ✅ 使用系统设置的模型和语音: model=${testModel}, voice=${testVoice}`);
            console.log(`[TTS] 注意：如果语音无效，TTS服务会返回错误，届时可以调整`);
          }
        } else {
          // 系统设置的模型不可用，尝试查找其他可用模型
          console.warn(`[TTS] 系统设置的模型 ${testModel} 不可用，尝试查找其他可用模型`);
          const modelPriority = ['edge', 'cosyvoice', 'indextts2', 'coqui', 'piper', 'qwen3'];
          for (const modelId of modelPriority) {
            const model = availableModels.find((m: any) => m.id === modelId && m.available === true);
            if (model) {
              testModel = modelId;
              // 根据模型设置默认语音
              if (modelId === 'edge') {
                testVoice = 'zh-CN-XiaoxiaoNeural';
              } else if (modelId === 'qwen3') {
                testVoice = 'qwen-zh-female-1';
              } else if (modelId === 'indextts2') {
                testVoice = 'indextts2-zh-female-1';
              } else if (modelId === 'coqui') {
                testVoice = 'zh-CN-female-1';
              } else if (modelId === 'cosyvoice') {
                testVoice = 'cosyvoice-中文女';
              } else if (modelId === 'piper') {
                testVoice = 'zh';
              }
              console.log(`[TTS] 切换到可用模型: ${testModel}, 语音: ${testVoice}`);
              break;
            }
          }
        }
        
        // 如果还是没有找到可用模型，使用 edge 作为默认（edge通常总是可用的，不需要API密钥）
        if (!testModel) {
          testModel = 'edge';
          testVoice = testVoice || 'zh-CN-XiaoxiaoNeural';
          console.warn(`[TTS] 未找到可用模型，使用默认: model=${testModel}, voice=${testVoice}`);
        }
      } catch (e) {
        // 如果获取模型列表失败，使用系统设置或默认值
        console.warn('[TTS] 获取模型列表失败，使用系统设置或默认值', e);
        // 如果系统设置的是qwen3但获取失败，可能是API密钥问题，自动切换到edge
        if (testModel === 'qwen3') {
          console.warn('[TTS] Qwen3-TTS可能不可用（缺少API密钥），自动切换到edge模型');
          testModel = 'edge';
          testVoice = 'zh-CN-XiaoxiaoNeural';
        } else if (!testModel) {
          testModel = 'edge';
        }
        if (!testVoice) {
          testVoice = 'zh-CN-XiaoxiaoNeural';
        }
      }
      
      // 确保testVoice不为空
      if (!testVoice) {
        testVoice = 'zh-CN-XiaoxiaoNeural';
        console.warn(`[TTS] testVoice为空，使用默认: ${testVoice}`);
      }
      
        console.log(`[TTS] ========== 最终配置 ==========`);
      console.log(`[TTS] 模型: ${testModel}`);
      console.log(`[TTS] 语音: ${testVoice}`);
      console.log(`[TTS] 测试文本: "${testText.substring(0, 50)}${testText.length > 50 ? '...' : ''}"`);
      console.log(`[TTS] 系统设置中的默认语音: ${defaults.voice}`);
      console.log(`[TTS] 系统设置中的默认模型: ${defaults.model}`);
      console.log(`[TTS] =============================`);
      
      // 直接使用用户提供的测试文本或系统测试样本进行验证
      // 不再使用硬编码的"测试"文本，避免不必要的额外生成
      const validationText = text || testText;
      
      // 确保对于中文测试文本，使用中文语音
      let testVoiceForValidation = testVoice;
      if (validationText && /[\u4e00-\u9fa5]/.test(validationText)) {
        // 如果测试文本包含中文，确保使用中文语音
        if (testVoiceForValidation && testVoiceForValidation.startsWith('en-US-')) {
          console.warn(`[TTS] ⚠️ 测试文本是中文但使用了英文语音(${testVoiceForValidation})，自动切换到中文语音`);
          // 尝试从英文语音映射到对应的中文语音
          if (testVoiceForValidation === 'en-US-GuyNeural') {
            testVoiceForValidation = 'zh-CN-YunxiNeural'; // 年轻男声
          } else if (testVoiceForValidation === 'en-US-JennyNeural') {
            testVoiceForValidation = 'zh-CN-XiaoxiaoNeural'; // 温柔女声
          } else {
            testVoiceForValidation = 'zh-CN-XiaoxiaoNeural'; // 默认中文女声
          }
        }
      }
      
      console.log(`[TTS] ========== 验证测试 ==========`);
      console.log(`[TTS] 模型: ${testModel}`);
      console.log(`[TTS] 语音: ${testVoiceForValidation}`);
      console.log(`[TTS] 文本: "${validationText.substring(0, 50)}${validationText.length > 50 ? '...' : ''}"`);
      console.log(`[TTS] TTS服务地址: ${ttsBaseUrl}/api/tts/synthesize`);
      console.log(`[TTS] =============================`);
      
      const apiKey = getTTSApiKey();
      const synthesisConfig: any = {
        timeout: 30000, // 增加到30秒，Edge-TTS可能需要更长时间
        validateStatus: () => true, // 不抛出错误，手动检查状态码
        responseType: 'arraybuffer'
      };
      if (apiKey) {
        synthesisConfig.headers = {
          'X-API-Key': apiKey,
        };
      }
      const ttsTestModel = mapModelToTTSAPI(testModel);
      const synthesisResp = await axios.post(
        `${ttsBaseUrl}/api/tts/synthesize`,
        { text: validationText, model: ttsTestModel, voice: testVoiceForValidation, speed: 1.0, format: 'mp3' },
        synthesisConfig
      );
      
      console.log(`[TTS] 验证测试响应: status=${synthesisResp.status}, contentType=${synthesisResp.headers['content-type']}, dataSize=${synthesisResp.data?.byteLength || 0}`);
      
      if (synthesisResp.status === 200) {
        // 检查响应是否是音频数据
        const contentType = synthesisResp.headers['content-type'] || '';
        const hasAudioData = synthesisResp.data && 
                           (synthesisResp.data.byteLength > 0 || 
                            contentType.includes('audio/'));
        if (hasAudioData) {
          synthesisWorks = true;
          console.log(`[TTS] ✅ 验证测试成功: 收到音频数据，大小=${synthesisResp.data.byteLength} bytes`);
        } else {
          // 检查是否是JSON错误响应
          try {
            const errorText = Buffer.from(synthesisResp.data || '').toString('utf-8');
            const errorData = JSON.parse(errorText);
            if (errorData.error || errorData.message) {
              synthesisError = errorData.message || errorData.error;
              // 如果是Qwen3-TTS API密钥错误，标记需要切换模型
              if (synthesisError && (synthesisError.includes('QWEN3_TTS_API_KEY') || synthesisError.includes('API密钥'))) {
                throw new Error('QWEN3_API_KEY_MISSING');
              }
            }
          } catch (parseError: any) {
            if (parseError.message === 'QWEN3_API_KEY_MISSING') {
              throw parseError;
            }
          }
          if (!synthesisError) {
            synthesisError = '响应格式错误：期望音频数据但收到空响应';
          }
          console.warn(`[TTS] ⚠️ 验证测试失败: ${synthesisError}`);
        }
      } else {
        // 状态码不是 200，尝试从响应体中读取 JSON 错误信息
        // 由于使用了 responseType: 'arraybuffer'，响应体是 ArrayBuffer/Buffer
        try {
          let errorData: any = null;
          if (synthesisResp.data) {
            // 将 ArrayBuffer/Buffer 转换为字符串，然后解析为 JSON
            const responseText = Buffer.from(synthesisResp.data).toString('utf-8');
            console.log(`[TTS] 验证测试错误响应: ${responseText.substring(0, 200)}`);
            try {
              errorData = JSON.parse(responseText);
            } catch {
              // 如果不是 JSON，使用原始文本
              errorData = { message: responseText || `HTTP ${synthesisResp.status}` };
            }
          }
          
          if (errorData?.error || errorData?.message) {
            synthesisError = errorData.message || errorData.error || `HTTP ${synthesisResp.status}`;
          } else {
            synthesisError = `HTTP ${synthesisResp.status}`;
          }
          console.warn(`[TTS] ⚠️ 验证测试失败: status=${synthesisResp.status}, error=${synthesisError}`);
        } catch (parseError: any) {
          synthesisError = `HTTP ${synthesisResp.status}`;
          console.warn(`[TTS] ⚠️ 验证测试失败: 无法解析错误响应, status=${synthesisResp.status}`);
        }
      }
    } catch (e: any) {
      // 网络错误或其他异常
      console.error(`[TTS] ❌ 验证测试异常:`, e.message || e);
      if (e.response) {
        // 有响应但状态码异常，尝试读取错误信息
        if (e.response.data) {
          // 如果响应是 Buffer，尝试转换为字符串或使用状态码
          if (Buffer.isBuffer(e.response.data)) {
            try {
              const errorText = e.response.data.toString('utf-8');
              console.log(`[TTS] 验证测试错误响应内容: ${errorText.substring(0, 200)}`);
              const errorJson = JSON.parse(errorText);
              synthesisError = errorJson.message || errorJson.error || `HTTP ${e.response.status}`;
            } catch {
              synthesisError = `HTTP ${e.response.status}`;
            }
          } else if (typeof e.response.data === 'object') {
            synthesisError = e.response.data.message || 
                           e.response.data.error || 
                           `HTTP ${e.response.status}`;
          } else {
            synthesisError = `HTTP ${e.response.status}`;
          }
        } else {
          synthesisError = `HTTP ${e.response.status}`;
        }
      } else {
        synthesisError = e.message || '合成失败';
      }
      console.error(`[TTS] ❌ 验证测试失败: ${synthesisError}`);
    }
    
    // 检查是否是Qwen3-TTS API密钥错误，如果是，自动切换到edge模型并重试
    // 检查错误消息中是否包含API密钥相关的错误
    const isQwen3ApiKeyError = testModel === 'qwen3' && synthesisError && (
      synthesisError.includes('QWEN3_TTS_API_KEY') || 
      synthesisError.includes('API密钥') || 
      synthesisError.includes('API_KEY') ||
      synthesisError.includes('Qwen3-TTS 生成失败') && synthesisError.includes('QWEN3')
    );
    
    if (isQwen3ApiKeyError) {
        console.warn(`[TTS] ⚠️ Qwen3-TTS API密钥未设置，自动切换到edge模型并重试`);
        testModel = 'edge';
        testVoice = 'zh-CN-XiaoxiaoNeural';
        synthesisError = null;
        synthesisWorks = false;
        
        // 使用edge模型重试
        try {
          const simpleTestText = '测试';
          console.log(`[TTS] 使用edge模型重试: model=${testModel}, voice=${testVoice}, text="${simpleTestText}"`);
          const retryConfig: any = {
            timeout: 30000,
            validateStatus: () => true,
            responseType: 'arraybuffer'
          };
          const retryApiKey = getTTSApiKey();
          if (retryApiKey) {
            retryConfig.headers = {
              'X-API-Key': retryApiKey,
            };
          }
          const retryTTSModel = mapModelToTTSAPI(testModel);
          const retryResp = await axios.post(
            `${ttsBaseUrl}/api/tts/synthesize`,
            { text: simpleTestText, model: retryTTSModel, voice: testVoice, speed: 1.0, format: 'mp3' },
            retryConfig
          );
          
          if (retryResp.status === 200) {
            const contentType = retryResp.headers['content-type'] || '';
            const hasAudioData = retryResp.data && 
                               (retryResp.data.byteLength > 0 || 
                                contentType.includes('audio/'));
            if (hasAudioData) {
              synthesisWorks = true;
              console.log(`[TTS] ✅ 使用edge模型重试成功`);
            } else {
              synthesisError = 'edge模型重试失败：响应格式错误';
            }
          } else {
            const errorText = Buffer.from(retryResp.data || '').toString('utf-8');
            try {
              const errorData = JSON.parse(errorText);
              synthesisError = errorData.message || errorData.error || `HTTP ${retryResp.status}`;
            } catch {
              synthesisError = errorText || `HTTP ${retryResp.status}`;
            }
          }
        } catch (retryError: any) {
          synthesisError = retryError.message || 'edge模型重试失败';
          console.error(`[TTS] edge模型重试失败:`, retryError);
        }
      }
    
    // 如果合成测试成功，生成测试音频并返回
    // 注意：即使验证测试失败，也尝试生成测试音频，如果成功则认为整体测试成功
    let testAudio: Buffer | null = null;
    let audioGenerationSuccess = false;
    
    // 尝试生成测试音频（即使验证测试失败，也尝试生成）
      try {
        // 优先使用请求参数中的text，其次使用系统设置中的测试样本，最后使用默认值
        const testTextForAudio = text || getTTSTestSample();
        // 使用指定的voice或默认voice，确保不为null
      let testVoiceForAudio = testVoice || 'zh-CN-XiaoxiaoNeural';
      
      // 如果voice是简单的"zh"或"en"（Piper格式），转换为Edge-TTS格式
      if (testVoiceForAudio === 'zh' || testVoiceForAudio === 'en') {
        console.warn(`[TTS] ⚠️ 检测到Piper格式的语音ID(${testVoiceForAudio})，自动转换为Edge-TTS格式`);
        if (testVoiceForAudio === 'zh') {
          testVoiceForAudio = 'zh-CN-XiaoxiaoNeural'; // 默认中文女声
        } else {
          testVoiceForAudio = 'en-US-JennyNeural'; // 默认英文女声
        }
        console.log(`[TTS] 语音已转换: ${testVoice} -> ${testVoiceForAudio}`);
      }
      
      // 确保对于中文文本，使用中文语音
      if (testTextForAudio && /[\u4e00-\u9fa5]/.test(testTextForAudio)) {
        // 如果测试文本包含中文，确保使用中文语音
        if (testVoiceForAudio && testVoiceForAudio.startsWith('en-US-')) {
          console.warn(`[TTS] ⚠️ 测试文本包含中文但使用了英文语音(${testVoiceForAudio})，自动切换到中文语音`);
          // 尝试从英文语音映射到对应的中文语音
          if (testVoiceForAudio === 'en-US-GuyNeural') {
            testVoiceForAudio = 'zh-CN-YunxiNeural'; // 年轻男声
          } else if (testVoiceForAudio === 'en-US-JennyNeural') {
            testVoiceForAudio = 'zh-CN-XiaoxiaoNeural'; // 温柔女声
          } else {
            testVoiceForAudio = 'zh-CN-XiaoxiaoNeural'; // 默认中文女声
          }
        }
      }
      
        const testModelForAudio = testModel || 'edge';
        console.log(`[TTS] ========== 生成测试音频 ==========`);
        console.log(`[TTS] 模型: ${testModelForAudio}`);
        console.log(`[TTS] 语音: ${testVoiceForAudio}`);
        console.log(`[TTS] 文本: "${testTextForAudio.substring(0, 50)}${testTextForAudio.length > 50 ? '...' : ''}"`);
        console.log(`[TTS] ===================================`);
        testAudio = await callMacMiniTTS({ 
          text: testTextForAudio, 
          model: testModelForAudio,
          voice: testVoiceForAudio, 
          speed: 1.0, 
          ttsBaseUrl 
        });
      if (testAudio && testAudio.length > 0) {
        audioGenerationSuccess = true;
        console.log(`[TTS] ✅ 测试音频生成成功，大小: ${testAudio.length} bytes, model: ${testModelForAudio}, voice: ${testVoiceForAudio}`);
        // 如果生成测试音频成功，即使验证测试失败，也认为整体测试成功
        if (!synthesisWorks) {
          console.log(`[TTS] ℹ️ 验证测试失败但生成测试音频成功，认为整体测试成功`);
          synthesisWorks = true;
          synthesisError = null; // 清除之前的错误
        }
      } else {
        console.warn(`[TTS] ⚠️ 测试音频生成失败: 音频数据为空或无效`);
        if (!synthesisWorks) {
          synthesisError = synthesisError || '测试音频生成失败：音频数据为空';
        }
      }
      } catch (e: any) {
      console.error(`[TTS] ❌ 生成测试音频异常:`, e.message || e);
      if (e.response) {
        // 尝试从响应中提取错误信息
        if (e.response.data) {
          if (Buffer.isBuffer(e.response.data)) {
            try {
              const errorText = e.response.data.toString('utf-8');
              const errorJson = JSON.parse(errorText);
              const errorMsg = errorJson.message || errorJson.error || e.message;
              console.error(`[TTS] ❌ 生成测试音频失败: ${errorMsg}`);
              if (!synthesisWorks) {
                synthesisError = synthesisError || `生成测试音频失败: ${errorMsg}`;
              }
            } catch {
              if (!synthesisWorks) {
                synthesisError = synthesisError || `生成测试音频失败: ${e.message}`;
              }
            }
          } else if (typeof e.response.data === 'object') {
            const errorMsg = e.response.data.message || e.response.data.error || e.message;
            console.error(`[TTS] ❌ 生成测试音频失败: ${errorMsg}`);
            if (!synthesisWorks) {
              synthesisError = synthesisError || `生成测试音频失败: ${errorMsg}`;
            }
          } else {
            if (!synthesisWorks) {
              synthesisError = synthesisError || `生成测试音频失败: ${e.message}`;
            }
          }
        } else {
          if (!synthesisWorks) {
            synthesisError = synthesisError || `生成测试音频失败: HTTP ${e.response.status}`;
          }
        }
      } else {
        console.error(`[TTS] ❌ 生成测试音频失败: ${e.message}`);
        // 如果验证测试也失败，保留错误信息
        if (!synthesisWorks) {
          synthesisError = synthesisError || `生成测试音频失败: ${e.message}`;
        }
      }
    }
    
    // 如果请求头中包含 Accept: audio/mpeg，直接返回音频
    const acceptHeader = req.headers.accept || '';
    if (testAudio && acceptHeader.includes('audio/mpeg')) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', testAudio.length.toString());
      return res.send(testAudio);
    }
    
    // 注意：测试接口应该始终返回JSON格式，包含测试结果和音频数据
    // 即使指定了text参数，也应该返回JSON，以便前端显示测试结果和播放音频
    // 直接返回音频只适用于专门的音频获取接口
    
    // 返回JSON结果（包含音频的base64编码）
    res.json({
      success: true,
      ttsBaseUrl,
      healthCheck: { status: 'ok' },
      voices: { available: voicesAvailable },
      synthesis: { 
        works: synthesisWorks,
        error: synthesisError || null,
        model: testModel || null,
        voice: testVoice || null
      },
      message: synthesisWorks 
        ? `TTS 服务运行正常（使用模型: ${testModel || '未知'}）` 
        : `TTS 服务连接成功，但合成测试${synthesisError ? '失败: ' + synthesisError : '未完成'}`,
      // 添加详细的调试信息
      debug: {
        validationTest: {
          passed: synthesisWorks && !audioGenerationSuccess, // 如果只有验证测试成功
          error: synthesisError || null
        },
        audioGeneration: {
          passed: audioGenerationSuccess,
          hasAudio: !!testAudio
        }
      },
      // 如果测试成功，包含音频数据的base64编码
      audioData: testAudio ? testAudio.toString('base64') : null,
      audioSize: testAudio ? testAudio.length : null
    });
  } catch (e: any) {
    console.error('[TTS] 测试失败', e);
    
    // 提供更详细的错误信息
    let errorMessage = e.message || '未知错误';
    let errorDetails = '';
    
    // 检查是否是voice参数问题
    if (errorMessage.includes('voice') || errorMessage.includes('语音')) {
      errorDetails = '语音ID格式可能不正确。Edge-TTS需要使用完整格式，如：zh-CN-XiaoxiaoNeural';
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('连接')) {
      errorDetails = `无法连接到TTS服务(${getTTSBaseUrl()})，请确保TTS服务已启动`;
    } else if (errorMessage.includes('timeout')) {
      errorDetails = 'TTS服务响应超时，请检查服务状态';
    }
    
    // 返回错误信息，但不返回500，而是返回200但标记为失败
    res.json({
      success: false,
      error: '测试 TTS 服务失败', 
      message: errorMessage,
      details: errorDetails || e.message,
      ttsBaseUrl: getTTSBaseUrl(),
      healthCheck: { status: 'unknown' },
      voices: { available: false },
      synthesis: {
        works: false,
        error: errorMessage,
        model: null,
        voice: null
      }
    });
  }
});

// 获取当前章节的段落列表（第一版：EPUB/TXT/MD）
router.get('/paragraphs', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { bookId, chapter } = req.query;
    if (!bookId || typeof bookId !== 'string') {
      return res.status(400).json({ error: '缺少 bookId' });
    }

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    const fileType = (book.file_type || '').toLowerCase();
    if (!['epub', 'txt', 'md'].includes(fileType)) {
      return res.status(400).json({ error: '当前仅支持 EPUB/TXT/MD 格式' });
    }

    // 第一版：简单实现，从书籍文本提取段落
    // 后续可优化为：EPUB 用 cfi 定位，TXT/MD 用 scrollTop/index
    const { extractBookText } = await import('../utils/bookTextExtractor');
    const fullText = await extractBookText(bookId, 1000000); // 提取足够长的文本

    // 清理文本：移除 HTML 标签、URL、元数据等
    const cleanText = fullText
      // 移除 HTML 标签
      .replace(/<[^>]+>/g, ' ')
      // 移除 URL
      .replace(/https?:\/\/[^\s]+/gi, ' ')
      // 移除 calibre 相关的元数据标识
      .replace(/\bcalibre\d+\b/gi, ' ')
      // 移除 XML 命名空间 URL
      .replace(/http:\/\/www\.w3\.org\/[^\s]+/gi, ' ')
      // 移除多余的空白字符
      .replace(/\s+/g, ' ')
      .trim();

    // 按段落分割（空行、换行符）
    // 先按双换行符分割，再按单换行符和句号等分割
    const rawParagraphs = cleanText
      .split(/\n\s*\n|\r\n\s*\r\n/)
      .flatMap((block) => {
        // 对于每个块，按句号、问号、感叹号进一步分割
        return block.split(/([。！？])/).filter((p) => p && p.trim().length > 0);
      })
      .map((p) => p?.trim())
      .filter((p) => p && p.length > 0);

    // 进一步过滤和合并段落
    const paragraphs: any[] = [];
    let currentPara = '';
    
    for (const p of rawParagraphs) {
      // 跳过太短的段落（可能是标点符号）
      if (p.length < 3) {
        if (currentPara) {
          currentPara += p;
        }
        continue;
      }
      
      // 跳过只包含 URL、数字、符号的段落
      if (/^[\d\s\-_\.\/\\:;,\[\]{}()]+$/.test(p)) continue;
      if (/https?:\/\//i.test(p)) continue; // 包含 URL 的段落
      if (/calibre/i.test(p)) continue; // 包含 calibre 元数据的段落
      if (/http:\/\/www\.w3\.org/i.test(p)) continue; // 包含 XML 命名空间的段落
      if (/^[\s\-\_\.\/\\:;,\[\]{}()]+$/.test(p)) continue; // 只包含符号和空白
      
      // 检查是否包含有意义的文本（至少 2 个中文字符或 3 个英文单词）
      const hasChinese = /[\u4e00-\u9fa5]/.test(p);
      const chineseChars = (p.match(/[\u4e00-\u9fa5]/g) || []).length;
      const englishWords = p.match(/\b[a-zA-Z]{3,}\b/g) || [];
      const meaningful = hasChinese ? chineseChars >= 2 : englishWords.length >= 3;
      
      // 如果段落中 URL/元数据占比过高（超过 30%），也跳过
      const urlMatches = (p.match(/https?:\/\/[^\s]+/gi) || []).join('').length;
      const metadataMatches = (p.match(/\bcalibre\d+\b|http:\/\/www\.w3\.org[^\s]+/gi) || []).join('').length;
      if ((urlMatches + metadataMatches) / p.length > 0.3) continue;
      
      if (!meaningful) {
        // 如果当前段落还不完整，继续累积
        if (currentPara) {
          currentPara += ' ' + p;
        }
        continue;
      }
      
      // 合并到当前段落或创建新段落
      if (currentPara) {
        currentPara += ' ' + p;
      } else {
        currentPara = p;
      }
      
      // 如果段落足够长（超过 50 个字符），或者包含句号/问号/感叹号，则作为一个段落
      if (currentPara.length >= 50 || /[。！？]$/.test(currentPara)) {
        paragraphs.push({
          id: `p${paragraphs.length}`,
          text: currentPara.trim(),
          order: paragraphs.length,
          anchor: {
            type: fileType === 'epub' ? 'epub_cfi' : 'scroll',
            value: fileType === 'epub' ? `chapter-${chapter || 0}-p${paragraphs.length}` : paragraphs.length,
          },
        });
        currentPara = '';
      }
    }
    
    // 处理最后一个段落
    if (currentPara && currentPara.trim().length >= 10) {
      paragraphs.push({
        id: `p${paragraphs.length}`,
        text: currentPara.trim(),
        order: paragraphs.length,
        anchor: {
          type: fileType === 'epub' ? 'epub_cfi' : 'scroll',
          value: fileType === 'epub' ? `chapter-${chapter || 0}-p${paragraphs.length}` : paragraphs.length,
        },
      });
    }

    res.json({ paragraphs, chapter: chapter || '0' });
  } catch (e: any) {
    console.error('[TTS] paragraphs failed', e?.message || e);
    res.status(500).json({ error: '获取段落列表失败', details: e?.message });
  }
});

export default router;


