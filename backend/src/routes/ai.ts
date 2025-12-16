/**
 * @file ai.ts
 * @author ttbye
 * @date 2025-12-11
 */

import express from 'express';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { extractBookText } from '../utils/bookTextExtractor';

const router = express.Router();

// 检测是否在 Docker 容器中运行
function isDockerContainer(): boolean {
  // 方法1: 检查 /.dockerenv 文件
  if (fs.existsSync('/.dockerenv')) {
    return true;
  }
  // 方法2: 检查环境变量
  if (process.env.DOCKER_CONTAINER === 'true' || process.env.IN_DOCKER === 'true') {
    return true;
  }
  // 方法3: 检查 cgroup（Linux）
  try {
    if (fs.existsSync('/proc/self/cgroup')) {
      const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf-8');
      if (cgroup.includes('docker') || cgroup.includes('containerd')) {
        return true;
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return false;
}

// 检测是否使用 host 网络模式
function isHostNetworkMode(): boolean {
  // 方法1: 检查环境变量
  if (process.env.NETWORK_MODE === 'host' || process.env.DOCKER_NETWORK_MODE === 'host') {
    return true;
  }
  // 方法2: 在 host 网络模式下，容器可以直接访问宿主机的网络接口
  // 检查是否有多个网络接口（host 模式下会有宿主机的所有接口）
  try {
    const interfaces = os.networkInterfaces();
    const interfaceCount = Object.keys(interfaces).length;
    // host 模式下通常会有更多网络接口（包括宿主机的所有接口）
    // 这是一个启发式检测，不是100%准确
    if (interfaceCount > 3) {
      // 检查是否有典型的宿主机网络接口（如 eth0, wlan0 等）
      const hasHostInterfaces = Object.keys(interfaces).some(name => 
        name.includes('eth') || name.includes('wlan') || name.includes('enp') || name.includes('wlp')
      );
      if (hasHostInterfaces) {
        return true;
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return false;
}

// 检测是否在群晖（Synology）环境中运行
function isSynologyEnvironment(): boolean {
  // 方法1: 检查环境变量
  if (process.env.SYNOLOGY === 'true' || process.env.SYNO === 'true') {
    return true;
  }
  // 方法2: 检查主机名（群晖通常包含 synology 或 diskstation）
  try {
    const hostname = os.hostname().toLowerCase();
    if (hostname.includes('synology') || hostname.includes('diskstation') || hostname.includes('ds')) {
      return true;
    }
  } catch (e) {
    // 忽略错误
  }
  // 方法3: 检查是否在群晖 Docker 环境中（通过检查网络接口）
  try {
    if (fs.existsSync('/proc/net/route')) {
      const route = fs.readFileSync('/proc/net/route', 'utf-8');
      // 群晖 Docker 通常使用特定的网络配置
      if (route.includes('172.17') || route.includes('172.18')) {
        // 进一步检查是否是群晖环境
        // 群晖 Docker 可能不支持 host.docker.internal
        return true;
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return false;
}

// 获取宿主机 IP 地址（用于群晖等不支持 host.docker.internal 的环境）
function getHostIP(): string | null {
  try {
    // 方法1: 从默认网关获取
    if (fs.existsSync('/proc/net/route')) {
      const route = fs.readFileSync('/proc/net/route', 'utf-8');
      const lines = route.split('\n');
      for (const line of lines) {
        if (line.includes('00000000')) {
          // 找到默认路由
          const parts = line.split(/\s+/);
          if (parts.length > 2) {
            const gateway = parts[2];
            // 将十六进制转换为 IP
            const ip = gateway.match(/.{2}/g)?.reverse().map(hex => parseInt(hex, 16)).join('.');
            if (ip && ip.startsWith('172.17.0.1')) {
              // 这是 Docker 默认网关，在群晖中可能需要使用实际宿主机 IP
              // 尝试获取宿主机网络接口 IP
              return null; // 返回 null 表示需要用户手动配置
            }
          }
        }
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return null;
}

// 获取AI配置（按用户）
function getAIConfig(userId: string) {
  try {
    console.log('[AI Config] ========== 开始读取用户AI配置 ==========');
    console.log('[AI Config] 用户ID:', userId);
    
    // 从用户AI设置表读取配置
    let userSettings: any = null;
    try {
      userSettings = db.prepare('SELECT * FROM user_ai_settings WHERE user_id = ?').get(userId) as any;
    } catch (dbError: any) {
      console.error('[AI Config] 数据库查询失败:', {
        error: dbError.message,
        code: dbError.code,
        name: dbError.name,
      });
      // 如果表不存在，尝试初始化数据库表
      if (dbError.message && dbError.message.includes('no such table')) {
        console.warn('[AI Config] user_ai_settings 表不存在，尝试初始化...');
        try {
          db.exec(`
            CREATE TABLE IF NOT EXISTS user_ai_settings (
              id TEXT PRIMARY KEY,
              user_id TEXT UNIQUE NOT NULL,
              provider TEXT DEFAULT 'ollama',
              api_url TEXT DEFAULT 'http://127.0.0.1:11434',
              api_key TEXT DEFAULT '',
              model TEXT DEFAULT 'deepseek-v3.1:671b-cloud',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
          `);
          console.log('[AI Config] 已创建 user_ai_settings 表');
        } catch (initError: any) {
          console.error('[AI Config] 初始化表失败:', initError.message);
        }
      }
      // 继续使用默认配置
    }
    
    // 默认配置
    const defaultConfig = {
      provider: 'ollama',
      api_url: 'http://127.0.0.1:11434',
      api_key: '',
      model: 'deepseek-v3.1:671b-cloud',
    };

    let config: {
      provider: string;
      api_url: string;
      api_key: string;
      model: string;
    };

    if (userSettings) {
      // 使用用户配置
      config = {
        provider: userSettings.provider || defaultConfig.provider,
        api_url: userSettings.api_url || defaultConfig.api_url,
        api_key: userSettings.api_key || defaultConfig.api_key,
        model: userSettings.model || defaultConfig.model,
      };
      console.log('[AI Config] 找到用户配置:', JSON.stringify(userSettings, null, 2));
    } else {
      // 使用默认配置
      config = defaultConfig;
      console.log('[AI Config] 未找到用户配置，使用默认配置');
      
      // 自动创建默认配置
      try {
        const id = uuidv4();
        db.prepare(`
          INSERT INTO user_ai_settings (id, user_id, provider, api_url, api_key, model)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, userId, config.provider, config.api_url, config.api_key, config.model);
        console.log('[AI Config] 已创建默认用户配置');
      } catch (e) {
        console.warn('[AI Config] 创建默认配置失败:', e);
      }
    }

    // 检查配置是否存在
    const hasProvider = !!config.provider;
    const hasApiUrl = !!config.api_url;
    const hasApiKey = !!config.api_key;
    const hasModel = !!config.model;

    console.log('[AI Config] 配置检查:', {
      hasProvider,
      hasApiUrl,
      hasApiKey,
      hasModel,
      model_value: config.model,
      model_type: typeof config.model,
      model_length: config.model?.length,
      config_keys: Object.keys(config),
    });

    // 获取模型名称：优先使用配置值，只有在配置不存在或为空时才使用默认值
    let modelValue = 'deepseek-v3.1:671b-cloud'; // 默认值
    
    // 直接检查config中的值
    const modelFromConfig = config.model;
    console.log('[AI Config] ========== 模型配置检查 ==========');
    console.log('[AI Config] hasModel:', hasModel);
    console.log('[AI Config] modelFromConfig:', modelFromConfig);
    console.log('[AI Config] modelFromConfig type:', typeof modelFromConfig);
    console.log('[AI Config] modelFromConfig length:', modelFromConfig?.length);
    console.log('[AI Config] 所有配置键:', Object.keys(config));
    console.log('[AI Config] 所有配置值:', Object.entries(config).map(([k, v]) => `${k}="${v}"`));
    
    // 强制使用配置中的值（如果存在且不为空）
    // 直接使用config.model，确保正确读取
    const aiModelValue = config.model;
    console.log('[AI Config] 直接读取config.model:', aiModelValue);
    console.log('[AI Config] config.model类型:', typeof aiModelValue);
    console.log('[AI Config] config.model是否为空:', !aiModelValue || aiModelValue === '');
    
    if (aiModelValue && typeof aiModelValue === 'string' && aiModelValue.trim() !== '') {
      const trimmed = aiModelValue.trim();
      if (trimmed !== 'null' && trimmed !== 'undefined') {
        modelValue = trimmed;
        console.log('[AI Config] ✓✓✓✓✓ 使用配置的模型名称:', modelValue);
      } else {
        console.warn('[AI Config] ✗ 模型配置是null或undefined字符串:', trimmed);
      }
    } else {
      console.warn('[AI Config] ✗ 模型配置不存在或为空');
      console.warn('[AI Config] config.model:', aiModelValue);
      console.warn('[AI Config] 使用默认值:', modelValue);
    }
    console.log('[AI Config] =================================');

    // 最终确定模型名称：如果modelValue还是默认值，但config中有值，强制使用config中的值
    let finalModelValue = modelValue;
    
    // 强制检查：如果modelValue是默认值，但config中有有效的模型名称，强制使用
    if ((modelValue === 'deepseek-v3.1:671b-cloud' || !modelValue || modelValue.trim() === '') && config.model) {
      const configModel = String(config.model).trim();
      if (configModel !== '' && configModel !== 'null' && configModel !== 'undefined') {
          finalModelValue = configModel;
          console.log('[AI Config] ⚠️⚠️⚠️⚠️⚠️ 强制修正：使用配置中的模型名称:', finalModelValue);
      }
    }

    // 获取 Provider：如果存在且不为空，使用配置值；否则使用默认值
    const providerValue = hasProvider && config.provider && config.provider.trim() !== ''
      ? config.provider.trim()
      : 'ollama';
    
    // 获取 API URL：如果存在且不为空，使用配置值；否则使用默认值
    let apiUrlValue = hasApiUrl && config.api_url && config.api_url.trim() !== '' 
      ? config.api_url.trim() 
      : 'http://127.0.0.1:11434';
    
    // 处理地址转换：在 Docker 环境中，localhost 需要转换为 host.docker.internal
    // 局域网IP地址（如 192.168.x.x）直接使用，不需要转换
    if (providerValue === 'ollama' && apiUrlValue) {
      try {
        const url = new URL(apiUrlValue);
        const hostname = url.hostname;
        
        // 检查是否是 localhost 或 127.0.0.1
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        
        // 检查是否是 Docker 网桥网关地址（172.17.0.1 是 Docker 默认网桥的网关）
        // 注意：172.17.x.x 是 Docker 默认网桥，但在容器内访问 172.17.0.1 可能无法访问宿主机
        const isDockerBridge = hostname === '172.17.0.1' || hostname.startsWith('172.17.');
        
        // 检查是否是局域网IP地址（192.168.x.x, 10.x.x.x, 172.16-31.x.x，但排除 Docker 网桥）
        const isPrivateIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname) && !isDockerBridge;
        
        // 检测是否在 Docker 容器中
        const inDocker = isDockerContainer();
        // 检测是否在群晖环境中
        const inSynology = isSynologyEnvironment();
        // 检测是否使用 host 网络模式
        const inHostMode = isHostNetworkMode();
        
        if (isLocalhost || isDockerBridge) {
          // 如果使用 host 网络模式，localhost 和 127.0.0.1 可以直接访问宿主机，无需转换
          if (inHostMode) {
            console.log('[AI Config] ========== Host 网络模式检测 ==========');
            console.log('[AI Config] ✓ 检测到使用 host 网络模式');
            console.log('[AI Config] ✓ localhost 和 127.0.0.1 可以直接访问宿主机服务');
            console.log('[AI Config] 使用原地址:', apiUrlValue);
            console.log('[AI Config] 提示：host 模式下，容器直接使用宿主机网络，可以直接访问 localhost:11434');
            console.log('[AI Config] ========================================');
            // host 模式下，localhost 可以直接使用，不需要转换
          } else {
            // 如果是 localhost 或 Docker 网桥地址，在 Docker 环境或生产环境中需要转换
            // 群晖环境通常不支持 host.docker.internal，需要使用其他方式
            const shouldConvert = inDocker || process.env.NODE_ENV === 'production';
            
            console.log('[AI Config] ========== 地址检测 ==========');
            console.log('[AI Config] 检测到地址:', apiUrlValue);
            console.log('[AI Config] 地址类型:', isLocalhost ? 'localhost' : 'Docker网桥');
            console.log('[AI Config] Docker 检测结果:', inDocker);
            console.log('[AI Config] 群晖环境检测结果:', inSynology);
            console.log('[AI Config] Host 网络模式:', inHostMode);
            console.log('[AI Config] NODE_ENV:', process.env.NODE_ENV);
            console.log('[AI Config] 是否需要转换:', shouldConvert);
            
            if (shouldConvert) {
              if (inSynology) {
                // 群晖环境：不支持 host.docker.internal，需要用户手动配置实际 IP
                console.log('[AI Config] ========== 群晖环境检测 ==========');
                console.log('[AI Config] ⚠️ 检测到群晖（Synology）环境');
                console.log('[AI Config] ⚠️ 群晖 Docker 不支持 host.docker.internal');
                console.log('[AI Config] 原始地址（系统设置）:', apiUrlValue);
                console.log('[AI Config] 建议配置方式：');
                console.log('[AI Config] 1. 推荐：使用 host 网络模式（修改 docker-compose.yml，设置 network_mode: host）');
                console.log('[AI Config]    这样可以直接使用 http://127.0.0.1:11434 或 http://localhost:11434');
                console.log('[AI Config] 2. 如果 Ollama 在群晖宿主机上（使用 bridge 模式）：');
                console.log('[AI Config]    - 使用群晖的实际 IP 地址，如：http://192.168.x.x:11434');
                console.log('[AI Config] 3. 如果 Ollama 在局域网其他机器上：');
                console.log('[AI Config]    - 使用该机器的实际 IP 地址，如：http://192.168.x.x:11434');
                console.log('[AI Config] 4. 如果 Ollama 在远程服务器上：');
                console.log('[AI Config]    - 使用公网 IP 或域名，如：http://example.com:11434');
                console.log('[AI Config] ========================================');
                // 在群晖环境中，不自动转换，保留原地址或提示用户
                // 如果用户配置了 172.17.0.1，这通常无法工作，但让用户看到错误信息更清楚
              } else {
                // 标准 Docker 环境：转换为 host.docker.internal
                const newUrl = new URL(apiUrlValue);
                newUrl.hostname = 'host.docker.internal';
                const originalUrl = apiUrlValue;
                apiUrlValue = newUrl.toString();
                console.log('[AI Config] ========== 执行地址转换 ==========');
                console.log('[AI Config] 原始地址（系统设置）:', originalUrl);
                console.log('[AI Config] 转换为:', apiUrlValue);
                console.log('[AI Config] 原因：容器内的 localhost 或 Docker 网桥地址（172.17.0.1）无法可靠访问宿主机，需要转换为 host.docker.internal');
                console.log('[AI Config] ========================================');
              }
            } else {
              console.log('[AI Config] ⚠️ 未执行转换，使用原地址:', apiUrlValue);
              console.log('[AI Config] 提示：如果在 Docker 环境中，此地址可能无法访问宿主机服务');
              if (inSynology) {
                console.log('[AI Config] 特别提示：群晖环境不支持 host.docker.internal，建议使用 host 网络模式或实际 IP 地址');
              } else {
                console.log('[AI Config] 建议：在系统设置中直接配置 http://host.docker.internal:11434 或实际 IP 地址');
              }
            }
          }
        } else if (isPrivateIP) {
          // 如果是局域网IP地址，直接使用，不需要转换
          // Docker 容器默认可以访问宿主机的局域网（如果宿主机可以访问）
          console.log('[AI Config] 使用局域网IP地址:', apiUrlValue);
          console.log('[AI Config] 提示：确保 Docker 容器可以访问宿主机局域网');
          console.log('[AI Config] 提示：如果无法访问，请检查 Docker 网络配置或防火墙设置');
        } else {
          // 其他地址（域名或公网IP），直接使用
          console.log('[AI Config] 使用配置的地址:', apiUrlValue);
        }
      } catch (e) {
        // URL 解析失败，使用原值
        console.warn('[AI Config] URL 解析失败，使用原值:', apiUrlValue);
        console.warn('[AI Config] 错误详情:', e);
      }
    }

    const result = {
      provider: providerValue,
      apiUrl: apiUrlValue,
      apiKey: hasApiKey ? config.api_key : '',
      model: finalModelValue, // 使用最终确定的模型名称
    };

    console.log('[AI Config] ========== 最终配置 ==========');
    console.log('[AI Config] Provider:', result.provider);
    console.log('[AI Config] API URL:', result.apiUrl);
    console.log('[AI Config] Model:', result.model, '(这是实际使用的模型名称)');
    console.log('[AI Config] Model Value (变量):', modelValue);
    console.log('[AI Config] Final Model Value (变量):', finalModelValue);
    console.log('[AI Config] Has API Key:', !!result.apiKey);
    console.log('[AI Config] Raw Config:', JSON.stringify(config, null, 2));
    console.log('[AI Config] ==============================');

    return result;
  } catch (error: any) {
    console.error('[AI Config] 获取配置失败:', error);
    console.error('[AI Config] 错误堆栈:', error.stack);
    // 返回默认配置
    // 在生产环境中，默认使用 host.docker.internal 而不是 127.0.0.1
    let defaultApiUrl = 'http://127.0.0.1:11434';
    const inDocker = isDockerContainer();
    if (process.env.NODE_ENV === 'production' || inDocker) {
      defaultApiUrl = 'http://host.docker.internal:11434';
      console.log('[AI Config] 使用 Docker/生产环境默认地址:', defaultApiUrl);
      console.log('[AI Config] Docker 检测结果:', inDocker);
    }
    return {
      provider: 'ollama',
      apiUrl: defaultApiUrl,
      apiKey: '',
      model: 'deepseek-v3.1:671b-cloud',
    };
  }
}

// 获取用户AI设置
router.get('/settings', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const settings = db.prepare('SELECT * FROM user_ai_settings WHERE user_id = ?').get(userId) as any;
    
    if (settings) {
      res.json({
        provider: settings.provider || 'ollama',
        api_url: settings.api_url || 'http://127.0.0.1:11434',
        api_key: settings.api_key || '',
        model: settings.model || 'deepseek-v3.1:671b-cloud',
      });
    } else {
      // 返回默认配置
      res.json({
        provider: 'ollama',
        api_url: 'http://127.0.0.1:11434',
        api_key: '',
        model: 'deepseek-v3.1:671b-cloud',
      });
    }
  } catch (error: any) {
    console.error('[AI Settings] 获取用户AI设置失败:', error);
    res.status(500).json({ error: '获取设置失败' });
  }
});

// 更新用户AI设置
router.put('/settings', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { provider, api_url, api_key, model } = req.body;

    // 检查是否已有设置
    const existing = db.prepare('SELECT id FROM user_ai_settings WHERE user_id = ?').get(userId) as any;

    if (existing) {
      // 更新现有设置
      db.prepare(`
        UPDATE user_ai_settings 
        SET provider = ?, api_url = ?, api_key = ?, model = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        provider || 'ollama',
        api_url || 'http://127.0.0.1:11434',
        api_key || '',
        model || 'deepseek-v3.1:671b-cloud',
        userId
      );
    } else {
      // 创建新设置
      const id = uuidv4();
      db.prepare(`
        INSERT INTO user_ai_settings (id, user_id, provider, api_url, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        provider || 'ollama',
        api_url || 'http://127.0.0.1:11434',
        api_key || '',
        model || 'deepseek-v3.1:671b-cloud'
      );
    }

    res.json({ message: 'AI设置已保存' });
  } catch (error: any) {
    console.error('[AI Settings] 更新用户AI设置失败:', error);
    res.status(500).json({ error: '保存设置失败' });
  }
});

// 测试AI配置
router.get('/test', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    console.log('[AI Test] ========== 开始测试AI配置 ==========');
    console.log('[AI Test] 用户ID:', userId);
    
    let config;
    try {
      config = getAIConfig(userId);
      console.log('[AI Test] 配置获取成功:', {
        provider: config.provider,
        apiUrl: config.apiUrl,
        model: config.model,
      });
    } catch (configError: any) {
      console.error('[AI Test] 获取配置失败:', {
        error: configError.message,
        stack: configError.stack,
        name: configError.name,
      });
      return res.status(500).json({
        success: false,
        error: `获取AI配置失败: ${configError.message || '未知错误'}`,
        details: process.env.NODE_ENV === 'development' ? {
          message: configError.message,
          stack: configError.stack,
          name: configError.name,
        } : undefined,
      });
    }
    
    // 测试连接
    if (config.provider === 'ollama') {
      try {
        // 确保URL格式正确
        const baseUrl = config.apiUrl.replace(/\/$/, '');
        const testUrl = `${baseUrl}/api/tags`;
        
        console.log('[AI Test] ========== 开始测试Ollama连接 ==========');
        console.log('[AI Test] 原始配置URL:', config.apiUrl);
        console.log('[AI Test] 清理后URL:', baseUrl);
        console.log('[AI Test] 测试URL:', testUrl);
        console.log('[AI Test] 是否在Docker中:', isDockerContainer());
        console.log('[AI Test] NODE_ENV:', process.env.NODE_ENV);
        
        // 增加超时时间，并添加重试机制
        let response;
        let lastError: any = null;
        const maxRetries = 2;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[AI Test] 尝试连接 (${attempt}/${maxRetries})...`);
            
            response = await axios.get(testUrl, {
              timeout: 20000, // 增加到20秒超时（远程部署可能需要更长时间）
              validateStatus: (status) => status < 500,
              headers: {
                'User-Agent': 'ReadKnow-AI-Client/1.0',
              },
              // 对于远程部署，可能需要更宽松的网络设置
              maxRedirects: 5,
            });

            if (response.status >= 400) {
              throw new Error(`HTTP ${response.status}: ${response.data?.error || response.statusText}`);
            }

            console.log('[AI Test] ✓ Ollama连接成功');
            console.log('[AI Test] 响应状态:', response.status);
            console.log('[AI Test] 模型数量:', response.data?.models?.length || 0);
            
            res.json({
              success: true,
              config: {
                ...config,
                apiUrl: baseUrl, // 返回清理后的URL
              },
              message: 'Ollama连接成功',
              models: response.data?.models || [],
            });
            return; // 成功，直接返回
          } catch (attemptError: any) {
            lastError = attemptError;
            console.warn(`[AI Test] 尝试 ${attempt} 失败:`, {
              error: attemptError.message,
              code: attemptError.code,
              status: attemptError.response?.status,
            });
            
            // 如果不是最后一次尝试，等待后重试
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
            }
          }
        }
        
        // 所有尝试都失败，抛出最后一个错误
        if (lastError) {
          throw lastError;
        } else {
          throw new Error('连接失败：未知错误');
        }
      } catch (error: any) {
        console.error('[AI Test] ========== Ollama连接测试失败 ==========');
        console.error('[AI Test] 错误类型:', error?.name || 'Unknown');
        console.error('[AI Test] 错误代码:', error?.code || 'N/A');
        console.error('[AI Test] 错误消息:', error?.message || 'Unknown error');
        console.error('[AI Test] 响应状态:', error?.response?.status);
        console.error('[AI Test] 响应数据:', error?.response?.data);
        console.error('[AI Test] 请求URL:', error?.config?.url || config.apiUrl);
        console.error('[AI Test] 堆栈:', error?.stack);
        
        // 确保有有效的错误对象
        if (!error || typeof error !== 'object') {
          error = { message: '未知错误', code: 'UNKNOWN' };
        }
        
        let errorMessage = `无法连接到Ollama服务: ${error.message || '未知错误'}`;
        
        // 提供详细的错误信息和解决建议
        if (error.code === 'ECONNREFUSED') {
          errorMessage += '\n\n连接被拒绝，可能的原因：';
          errorMessage += '\n1. Ollama 服务器未运行';
          errorMessage += '\n2. 地址或端口不正确';
          if (isDockerContainer()) {
            const inSynology = isSynologyEnvironment();
            errorMessage += '\n3. 在Docker容器中，请使用：';
            if (inSynology) {
              errorMessage += '\n   ⚠️ 检测到群晖（Synology）环境：';
              errorMessage += '\n   - 群晖 Docker 不支持 host.docker.internal';
              errorMessage += '\n   - 如果 Ollama 在群晖宿主机上：使用群晖的实际 IP 地址，如 http://192.168.x.x:11434';
              errorMessage += '\n   - 如果 Ollama 在局域网其他机器上：使用该机器的实际 IP 地址';
              errorMessage += '\n   - 如果 Ollama 在远程服务器上：使用公网 IP 或域名';
              errorMessage += '\n   - 或者使用 host 网络模式运行容器（需要修改 Docker 配置）';
            } else {
              errorMessage += '\n   - 宿主机上的Ollama: http://host.docker.internal:11434';
              errorMessage += '\n   - 局域网其他机器: http://192.168.x.x:11434 (使用实际IP)';
              errorMessage += '\n   - 同一Docker网络: 使用容器名称或服务名';
              errorMessage += '\n   - 远程服务器: 使用公网IP或域名（确保防火墙开放端口）';
            }
          }
        } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
          errorMessage += '\n\nDNS解析失败，可能的原因：';
          errorMessage += '\n1. 主机名无法解析（检查地址是否正确）';
          errorMessage += '\n2. 网络连接问题';
          if (isDockerContainer()) {
            errorMessage += '\n3. 在Docker容器中，建议使用IP地址而不是主机名';
            errorMessage += '\n4. 如果是远程部署，确保使用正确的公网IP或域名';
          }
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          errorMessage += '\n\n连接超时，可能的原因：';
          errorMessage += '\n1. Ollama 服务器响应慢或无响应';
          errorMessage += '\n2. 网络延迟过高（远程部署时常见）';
          errorMessage += '\n3. 防火墙阻止了连接';
          errorMessage += '\n4. 地址或端口不正确';
          errorMessage += '\n5. 如果是远程部署，检查：';
          errorMessage += '\n   - 防火墙规则是否允许访问Ollama端口';
          errorMessage += '\n   - 网络路由是否正确';
          errorMessage += '\n   - Ollama服务器是否监听在正确的接口上（0.0.0.0而不是127.0.0.1）';
        } else if (error.code === 'ECONNRESET') {
          errorMessage += '\n\n连接被重置，可能的原因：';
          errorMessage += '\n1. Ollama 服务器主动关闭了连接';
          errorMessage += '\n2. 网络不稳定';
          errorMessage += '\n3. 防火墙或代理服务器中断了连接';
        } else if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
          errorMessage += '\n\nSSL证书验证失败，可能的原因：';
          errorMessage += '\n1. SSL证书已过期';
          errorMessage += '\n2. 使用了自签名证书';
          errorMessage += '\n3. 证书链不完整';
          errorMessage += '\n解决方案：使用有效的SSL证书，或使用HTTP而不是HTTPS';
        } else if (error.response) {
          errorMessage += `\n\nHTTP错误 ${error.response.status}:`;
          if (error.response.data) {
            errorMessage += ` ${JSON.stringify(error.response.data)}`;
          }
        } else if (error.message) {
          errorMessage += `\n\n错误详情: ${error.message}`;
        }
        
        // 添加通用建议
        errorMessage += '\n\n建议：';
        errorMessage += '\n1. 确认Ollama服务器正在运行';
        errorMessage += '\n2. 检查API地址和端口是否正确';
        if (isDockerContainer()) {
          errorMessage += '\n3. 在Docker环境中，确保使用正确的网络配置';
          errorMessage += '\n4. 检查Docker网络设置和防火墙规则';
        }
        errorMessage += '\n5. 尝试在浏览器中直接访问: ' + config.apiUrl.replace(/\/$/, '') + '/api/tags';
        
        res.status(500).json({
          success: false,
          config: {
            ...config,
            apiUrl: config.apiUrl,
          },
          error: errorMessage,
          details: {
            code: error.code,
            message: error.message,
            status: error.response?.status,
            responseData: error.response?.data,
            isDocker: isDockerContainer(),
          },
        });
      }
    } else {
      res.json({
        success: true,
        config,
        message: '配置已加载（未测试连接）',
      });
    }
  } catch (error: any) {
    console.error('[AI Test] ========== 测试失败（外层捕获）==========');
    console.error('[AI Test] 错误类型:', error.name);
    console.error('[AI Test] 错误代码:', error.code);
    console.error('[AI Test] 错误消息:', error.message);
    console.error('[AI Test] 错误堆栈:', error.stack);
    console.error('[AI Test] 响应头已发送:', res.headersSent);
    
    // 确保响应头未发送
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || '测试失败',
        details: {
          name: error.name,
          code: error.code,
          message: error.message,
          ...(process.env.NODE_ENV === 'development' ? {
            stack: error.stack,
          } : {}),
          isDocker: isDockerContainer(),
        },
      });
    } else {
      console.error('[AI Test] 响应头已发送，无法返回错误信息');
    }
  }
});

// 调用AI API
async function callAI(userId: string, prompt: string, systemPrompt?: string, conversationHistory?: any[]): Promise<string> {
  const config = getAIConfig(userId);
  console.log('[AI Call] ========== 开始AI调用 ==========');
  console.log('[AI Call] Provider:', config.provider);
  console.log('[AI Call] API URL:', config.apiUrl);
  console.log('[AI Call] Model:', config.model, '(这是实际使用的模型名称)');
  console.log('[AI Call] Has API Key:', !!config.apiKey);
  console.log('[AI Call] =================================');

  const messages: any[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // 添加对话历史
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }

  // 添加当前用户消息
  messages.push({ role: 'user', content: prompt });

  try {
    if (config.provider === 'ollama') {
      // 检查模型名称是否设置
      if (!config.model || config.model.trim() === '') {
        throw new Error('模型名称未设置，请在系统设置中选择或输入模型名称');
      }

      // Ollama API
      // 确保URL格式正确（移除末尾的斜杠，避免双斜杠）
      const baseUrl = config.apiUrl.replace(/\/$/, '');
      const url = `${baseUrl}/api/chat`;
      console.log('[AI] 调用Ollama API:', { 
        baseUrl: config.apiUrl,
        cleanedBaseUrl: baseUrl,
        url, 
        model: config.model, 
        messagesCount: messages.length,
        messages: messages.map(m => ({ role: m.role, contentLength: m.content?.length }))
      });

      // 确保使用正确的模型名称 - 直接使用config.model
      let modelToUse = config.model;
      
      console.log('[AI Call] 初始modelToUse:', modelToUse);
      console.log('[AI Call] config.model:', config.model);
      console.log('[AI Call] config.model类型:', typeof config.model);
      
      // 如果config.model不存在或为空，尝试重新获取配置
      // 注意：不再检查是否为默认值，因为默认值也是有效的模型名称
      if (!modelToUse || modelToUse.trim() === '' || modelToUse === 'null' || modelToUse === 'undefined') {
        console.warn('[AI Call] ⚠️ 警告：config.model为空或无效！');
        console.warn('[AI Call] config.model:', config.model);
        console.warn('[AI Call] config.model type:', typeof config.model);
        console.warn('[AI Call] config.model length:', config.model?.length);
        
        // 尝试重新获取配置
        const freshConfig = getAIConfig(userId);
        console.log('[AI Call] 重新获取的配置:', JSON.stringify(freshConfig, null, 2));
        if (freshConfig.model && freshConfig.model.trim() !== '' && freshConfig.model !== 'null' && freshConfig.model !== 'undefined') {
          modelToUse = freshConfig.model.trim();
          console.log('[AI Call] ✓ 使用重新获取的模型名称:', modelToUse);
        } else {
          console.warn('[AI Call] ✗ 重新获取的配置也无效');
          console.warn('[AI Call] freshConfig.model:', freshConfig.model);
          
          // 最后尝试：直接从用户AI设置表读取
          try {
            const userSettings = db.prepare('SELECT model FROM user_ai_settings WHERE user_id = ?').get(userId) as any;
            if (userSettings && userSettings.model) {
              const dbModelValue = String(userSettings.model).trim();
              if (dbModelValue !== '' && dbModelValue !== 'null' && dbModelValue !== 'undefined') {
                modelToUse = dbModelValue;
                console.log('[AI Call] ✓✓✓ 直接从用户AI设置表读取模型名称:', modelToUse);
              }
            }
          } catch (dbError: any) {
            console.error('[AI Call] 从用户AI设置表读取失败:', dbError);
          }
        }
      }
      
      // 最终trim
      modelToUse = modelToUse ? modelToUse.trim() : '';
      
      console.log('[AI Call] 准备发送请求到Ollama:', {
        url,
        modelToUse,
        modelFromConfig: config.model,
        modelFromConfigType: typeof config.model,
        modelFromConfigLength: config.model?.length,
        messagesCount: messages.length,
      });

      // 最终验证模型名称
      // 注意：如果用户确实想使用默认模型 'deepseek-v3.1:671b-cloud'，这是允许的
      // 只有当模型名称为空或无效时才报错
      if (!modelToUse || modelToUse.trim() === '' || modelToUse === 'null' || modelToUse === 'undefined') {
        console.error('[AI Call] ⚠️⚠️⚠️ 最终警告：使用的模型是空值或无效！');
        console.error('[AI Call] modelToUse:', modelToUse);
        console.error('[AI Call] config.model:', config.model);
        console.error('[AI Call] config对象:', JSON.stringify(config, null, 2));
        throw new Error('模型名称未正确配置，请在系统设置中选择或输入模型名称');
      }
      
      // 如果模型名称是默认值，记录警告但不阻止（允许使用默认模型）
      if (modelToUse === 'deepseek-v3.1:671b-cloud') {
        console.warn('[AI Call] ⚠️ 使用默认模型名称，如果这不是您想要的，请在系统设置中配置模型名称');
      }

      const requestBody = {
        model: modelToUse,
        messages: messages,
        stream: false,
      };
      console.log('[AI Call] 最终请求体:', JSON.stringify(requestBody, null, 2));

      const response = await axios.post(
        url,
        requestBody,
        {
          timeout: 120000, // 2分钟超时
          headers: {
            'Content-Type': 'application/json',
          },
          validateStatus: (status) => status < 500, // 允许4xx状态码，以便捕获错误
        }
      );

      console.log('[AI] Ollama响应:', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
        dataType: typeof response.data,
      });

      // 检查是否有错误响应
      if (response.status >= 400) {
        const errorMsg = response.data?.error || `HTTP ${response.status}: ${response.statusText}`;
        console.error('[AI] Ollama API错误:', {
          status: response.status,
          error: errorMsg,
          data: response.data,
          url,
          model: config.model,
        });
        
        // 提供更友好的错误信息
        if (errorMsg.includes('not found') || errorMsg.includes('model')) {
          throw new Error(`模型 "${config.model}" 未找到。请检查系统设置中的模型名称是否正确，或使用 "ollama list" 命令查看可用的模型。`);
        }
        throw new Error(`Ollama API错误: ${errorMsg}`);
      }

      // Ollama的响应格式：{ model, created_at, message: { role, content }, done }
      const content = response.data?.message?.content;

      if (!content) {
        console.error('[AI] Ollama响应格式异常:', JSON.stringify(response.data, null, 2));
        throw new Error(`Ollama返回的响应格式不正确。响应: ${JSON.stringify(response.data)}`);
      }

      console.log('[AI Call] ✓ Ollama调用成功，响应长度:', content.length);
      return content;
    } else if (config.provider === 'openai' || config.provider === 'deepseek') {
      // OpenAI/DeepSeek API
      const apiUrl = config.provider === 'openai' 
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.deepseek.com/v1/chat/completions';

      console.log('[AI] 调用OpenAI/DeepSeek API:', { apiUrl, model: config.model });

      if (!config.apiKey) {
        throw new Error('API密钥未配置，请在系统设置中配置API密钥');
      }

      const response = await axios.post(
        apiUrl,
        {
          model: config.model,
          messages: messages,
        },
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        console.error('[AI] OpenAI/DeepSeek响应格式异常:', JSON.stringify(response.data, null, 2));
        throw new Error('API返回的响应格式不正确');
      }

      return content;
    } else {
      throw new Error(`不支持的AI提供商: ${config.provider}`);
    }
  } catch (error: any) {
    console.error('[AI Call] ========== API调用失败 ==========');
    console.error('[AI Call] Provider:', config.provider);
    console.error('[AI Call] API URL:', config.apiUrl);
    console.error('[AI Call] Model:', config.model);
    console.error('[AI Call] 错误类型:', error.name);
    console.error('[AI Call] 错误代码:', error.code);
    console.error('[AI Call] 错误消息:', error.message);
    console.error('[AI Call] 响应状态:', error.response?.status);
    console.error('[AI Call] 响应数据:', error.response?.data);
    console.error('[AI Call] 请求URL:', error.config?.url);
    console.error('[AI Call] 错误堆栈:', error.stack);

    // 详细的错误信息
    if (error.response) {
      // 服务器返回了错误响应
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 404) {
        throw new Error(`无法连接到AI服务，请检查API地址是否正确: ${config.apiUrl}`);
      } else if (status === 401 || status === 403) {
        throw new Error('API密钥无效，请在系统设置中检查API密钥配置');
      } else if (status >= 500) {
        const errorDetail = data?.error || error.message;
        throw new Error(`AI服务内部错误 (${status}): ${errorDetail}`);
      } else {
        const errorDetail = data?.error?.message || data?.error || error.message;
        throw new Error(`AI API请求失败 (${status}): ${errorDetail}`);
      }
    } else if (error.request) {
      // 请求已发出但没有收到响应
      let errorMessage = `无法连接到AI服务 (${config.apiUrl})`;
      
      // 根据错误代码提供更详细的建议
      if (error.code === 'ECONNREFUSED') {
        errorMessage += '\n\n连接被拒绝，可能的原因：';
        errorMessage += '\n1. Ollama 服务器未运行';
        errorMessage += '\n2. 地址或端口不正确';
        if (isDockerContainer()) {
          errorMessage += '\n3. 在Docker容器中，请使用：';
          errorMessage += '\n   - 宿主机上的Ollama: http://host.docker.internal:11434';
          errorMessage += '\n   - 局域网其他机器: http://192.168.x.x:11434 (使用实际IP)';
        }
      } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        errorMessage += '\n\nDNS解析失败，可能的原因：';
        errorMessage += '\n1. 主机名无法解析（检查地址是否正确）';
        errorMessage += '\n2. 网络连接问题';
        if (isDockerContainer()) {
          errorMessage += '\n3. 在Docker容器中，建议使用IP地址而不是主机名';
        }
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorMessage += '\n\n连接超时，可能的原因：';
        errorMessage += '\n1. Ollama 服务器响应慢或无响应';
        errorMessage += '\n2. 网络延迟过高';
        errorMessage += '\n3. 防火墙阻止了连接';
      } else {
        errorMessage += '\n\n可能的原因：';
        errorMessage += '\n1. Ollama 服务器未运行或地址不正确';
        if (isDockerContainer()) {
          errorMessage += '\n2. 在Docker容器中，请使用：http://host.docker.internal:11434';
        }
        errorMessage += '\n3. 检查网络连接和防火墙设置';
      }
      
      throw new Error(errorMessage);
    } else {
      // 其他错误（如配置错误等）
      throw new Error(`AI API调用失败: ${error.message || '未知错误'}`);
    }
  }
}

// AI聊天
router.post('/chat', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId, message, messages: conversationHistory } = req.body;

    console.log('[AI Chat] 收到请求:', {
      bookId,
      messageLength: message?.length,
      historyLength: conversationHistory?.length,
    });

    if (!bookId || !message) {
      return res.status(400).json({ error: '请提供书籍ID和消息' });
    }

    // 获取书籍信息
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 提取书籍文本（限制长度）
    let bookText = '';
    try {
      bookText = await extractBookText(bookId, 30000); // 限制为30K字符
      console.log('[AI Chat] 书籍文本提取成功，长度:', bookText.length);
    } catch (error: any) {
      console.error('[AI Chat] 提取书籍文本失败:', error);
      // 如果提取失败，继续使用空文本
    }

    // 构建系统提示
    const systemPrompt = `你是一个专业的阅读助手。用户正在阅读《${book.title}》${book.author ? `（作者：${book.author}）` : ''}。

书籍内容摘要：
${bookText ? bookText.substring(0, 10000) : '无法获取书籍内容'}

请基于书籍内容回答用户的问题。如果问题与书籍内容无关，请礼貌地说明。`;

    // 构建对话历史
    const history = (conversationHistory || []).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // 调用AI
    console.log('[AI Chat] 开始调用AI...');
    let response: string;
    try {
      response = await callAI(userId, message, systemPrompt, history);
      console.log('[AI Chat] AI响应成功，长度:', response.length);
      
      if (!response || response.trim().length === 0) {
        throw new Error('AI返回的响应为空');
      }
    } catch (aiError: any) {
      console.error('[AI Chat] AI调用失败:', {
        message: aiError.message,
        stack: aiError.stack,
        response: aiError.response?.data,
        status: aiError.response?.status,
        name: aiError.name,
        code: aiError.code,
      });
      // 重新抛出错误，让外层catch处理
      throw aiError;
    }

    res.json({ response });
  } catch (error: any) {
    console.error('[AI Chat] 聊天失败:', {
      message: error.message,
      stack: error.stack,
      bookId: req.body?.bookId,
      name: error.name,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
    });
    
    // 确保响应头未发送
    if (!res.headersSent) {
      // 根据错误类型提供更友好的错误信息
      let errorMessage = error.message || 'AI聊天失败';
      
      // 如果是模型配置错误
      if (error.message && error.message.includes('模型名称')) {
        errorMessage = '模型名称未正确配置，请在系统设置中选择或输入模型名称';
      } else if (error.message && error.message.includes('未找到')) {
        errorMessage = error.message;
      } else if (error.message && error.message.includes('无法连接')) {
        errorMessage = error.message;
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: error.code,
        } : undefined
      });
    } else {
      console.error('[AI Chat] 响应头已发送，无法返回错误信息');
    }
  }
});

// 分析书籍
router.post('/analyze', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId } = req.body;

    console.log('[AI Analyze] 收到请求:', { bookId });

    if (!bookId) {
      return res.status(400).json({ error: '请提供书籍ID' });
    }

    // 获取书籍信息
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;
    if (!book) {
      console.error('[AI Analyze] 书籍不存在:', bookId);
      return res.status(404).json({ error: '书籍不存在' });
    }

    console.log('[AI Analyze] 书籍信息:', {
      id: book.id,
      title: book.title,
      author: book.author,
      fileName: book.file_name,
      fileType: book.file_type,
      filePath: book.file_path,
    });

    // 提取书籍文本
    let bookText = '';
    try {
      console.log('[AI Analyze] 开始提取书籍文本...');
      console.log('[AI Analyze] 书籍格式:', {
        fileName: book.file_name,
        fileType: book.file_type,
        fileExt: book.file_name ? path.extname(book.file_name).toLowerCase() : 'unknown',
      });
      
      bookText = await extractBookText(bookId, 50000); // 限制为50K字符
      console.log('[AI Analyze] 书籍文本提取成功，长度:', bookText.length);
      
      if (!bookText || bookText.trim().length === 0) {
        console.warn('[AI Analyze] 提取的文本为空');
      }
    } catch (error: any) {
      console.error('[AI Analyze] 提取书籍文本失败:', {
        bookId,
        fileName: book.file_name,
        fileType: book.file_type,
        filePath: book.file_path,
        error: error.message,
        stack: error.stack,
        errorName: error.name,
      });
      
      // 根据错误类型提供更友好的错误信息
      let errorMessage = '无法提取书籍内容';
      if (error.message.includes('不存在')) {
        errorMessage = '书籍文件不存在，请检查文件是否已上传';
      } else if (error.message.includes('格式')) {
        errorMessage = `不支持的文件格式，当前支持：EPUB、PDF、TXT`;
      } else if (error.message.includes('无法确定')) {
        errorMessage = '无法确定书籍文件格式，请检查文件扩展名';
      } else {
        errorMessage = `提取书籍内容失败: ${error.message}`;
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          stack: error.stack,
          fileName: book.file_name,
          fileType: book.file_type,
        } : undefined
      });
    }

    if (!bookText || bookText.trim().length === 0) {
      console.warn('[AI Analyze] 书籍文本为空');
      return res.status(400).json({ error: '书籍内容为空，无法进行分析' });
    }

    // 构建分析提示
    const prompt = `请分析以下书籍内容，生成结构化的全书大纲和章节摘要。

书籍信息：
- 书名：${book.title}
- 作者：${book.author || '未知'}

书籍内容：
${bookText}

请按照以下格式输出分析结果：
# 全书大纲

## 主要内容
[简要概述全书的主要内容]

## 核心主题
[列出核心主题和观点]

## 章节结构
[列出主要章节和每个章节的简要摘要]

## 关键人物/概念
[列出关键人物或重要概念]

## 阅读建议
[提供阅读建议和重点]

请确保分析准确、结构清晰。`;

    // 调用AI
    console.log('[AI Analyze] ========== 开始调用AI进行分析 ==========');
    console.log('[AI Analyze] 用户ID:', userId);
    console.log('[AI Analyze] 提示长度:', prompt.length);
    
    let analysis: string;
    try {
      analysis = await callAI(userId, prompt);
      console.log('[AI Analyze] ✓ AI分析完成');
      console.log('[AI Analyze] 响应长度:', analysis.length);
    } catch (aiError: any) {
      console.error('[AI Analyze] ========== AI调用失败 ==========');
      console.error('[AI Analyze] 错误类型:', aiError.name);
      console.error('[AI Analyze] 错误代码:', aiError.code);
      console.error('[AI Analyze] 错误消息:', aiError.message);
      console.error('[AI Analyze] 错误堆栈:', aiError.stack);
      
      // 根据错误类型提供更友好的错误信息
      let errorMessage = 'AI分析失败';
      
      if (aiError.message && aiError.message.includes('模型名称')) {
        errorMessage = '模型名称未正确配置，请在系统设置中选择或输入模型名称';
      } else if (aiError.message && aiError.message.includes('无法连接')) {
        errorMessage = aiError.message;
      } else if (aiError.message && aiError.message.includes('ECONNREFUSED')) {
        errorMessage = '无法连接到Ollama服务器，请检查系统设置中的API地址配置';
      } else if (aiError.message && aiError.message.includes('ENOTFOUND')) {
        errorMessage = '无法解析Ollama服务器地址，请检查系统设置中的API地址是否正确';
      } else if (aiError.message && aiError.message.includes('ETIMEDOUT')) {
        errorMessage = '连接Ollama服务器超时，请检查网络连接或增加超时时间';
      } else {
        errorMessage = `AI分析失败: ${aiError.message || '未知错误'}`;
      }
      
      return res.status(500).json({
        error: errorMessage,
        details: {
          code: aiError.code,
          message: aiError.message,
          ...(process.env.NODE_ENV === 'development' ? {
            stack: aiError.stack,
            name: aiError.name,
          } : {}),
        },
      });
    }

    res.json({ analysis });
  } catch (error: any) {
    console.error('[AI Analyze] ========== 分析书籍失败（外层捕获）==========');
    console.error('[AI Analyze] 错误类型:', error.name);
    console.error('[AI Analyze] 错误代码:', error.code);
    console.error('[AI Analyze] 错误消息:', error.message);
    console.error('[AI Analyze] 错误堆栈:', error.stack);
    console.error('[AI Analyze] 书籍ID:', req.body?.bookId);
    console.error('[AI Analyze] 响应头已发送:', res.headersSent);
    
    // 确保响应头未发送
    if (!res.headersSent) {
      res.status(500).json({ 
        error: error.message || '分析书籍失败',
        details: {
          code: error.code,
          message: error.message,
          ...(process.env.NODE_ENV === 'development' ? {
            stack: error.stack,
            name: error.name,
          } : {}),
        },
      });
    } else {
      console.error('[AI Analyze] 响应头已发送，无法返回错误信息');
    }
  }
});

// 文本转语音（TTS）
router.post('/tts', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请提供要转换的文本' });
    }

    // 限制文本长度
    const textToConvert = text.substring(0, 1000);

    const config = getAIConfig(userId);

    try {
      if (config.provider === 'ollama') {
        // Ollama TTS (如果支持)
        const response = await axios.post(
          `${config.apiUrl}/api/generate`,
          {
            model: 'tts', // 需要安装TTS模型
            prompt: textToConvert,
          },
          {
            responseType: 'arraybuffer',
            timeout: 60000,
          }
        );

        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(response.data));
      } else {
        // 对于其他提供商，可以使用Web Speech API或第三方TTS服务
        // 这里返回一个简单的提示
        return res.status(501).json({ error: '当前AI提供商不支持TTS功能，请使用Ollama或配置TTS服务' });
      }
    } catch (error: any) {
      console.error('TTS失败:', error);
      return res.status(500).json({ error: 'TTS服务不可用，请检查配置' });
    }
  } catch (error: any) {
    console.error('TTS请求失败:', error);
    res.status(500).json({ error: error.message || 'TTS请求失败' });
  }
});

export default router;

