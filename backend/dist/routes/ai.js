"use strict";
/**
 * @file ai.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const bookTextExtractor_1 = require("../utils/bookTextExtractor");
const router = express_1.default.Router();
// 检测是否在 Docker 容器中运行
function isDockerContainer() {
    // 方法1: 检查 /.dockerenv 文件
    if (fs_1.default.existsSync('/.dockerenv')) {
        return true;
    }
    // 方法2: 检查环境变量
    if (process.env.DOCKER_CONTAINER === 'true' || process.env.IN_DOCKER === 'true') {
        return true;
    }
    // 方法3: 检查 cgroup（Linux）
    try {
        if (fs_1.default.existsSync('/proc/self/cgroup')) {
            const cgroup = fs_1.default.readFileSync('/proc/self/cgroup', 'utf-8');
            if (cgroup.includes('docker') || cgroup.includes('containerd')) {
                return true;
            }
        }
    }
    catch (e) {
        // 忽略错误
    }
    return false;
}
// 获取AI配置（按用户）
function getAIConfig(userId) {
    try {
        console.log('[AI Config] ========== 开始读取用户AI配置 ==========');
        console.log('[AI Config] 用户ID:', userId);
        // 从用户AI设置表读取配置
        let userSettings = null;
        try {
            userSettings = db_1.db.prepare('SELECT * FROM user_ai_settings WHERE user_id = ?').get(userId);
        }
        catch (dbError) {
            console.error('[AI Config] 数据库查询失败:', {
                error: dbError.message,
                code: dbError.code,
                name: dbError.name,
            });
            // 如果表不存在，尝试初始化数据库表
            if (dbError.message && dbError.message.includes('no such table')) {
                console.warn('[AI Config] user_ai_settings 表不存在，尝试初始化...');
                try {
                    db_1.db.exec(`
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
                }
                catch (initError) {
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
        let config;
        if (userSettings) {
            // 使用用户配置
            config = {
                provider: userSettings.provider || defaultConfig.provider,
                api_url: userSettings.api_url || defaultConfig.api_url,
                api_key: userSettings.api_key || defaultConfig.api_key,
                model: userSettings.model || defaultConfig.model,
            };
            console.log('[AI Config] 找到用户配置:', JSON.stringify(userSettings, null, 2));
        }
        else {
            // 使用默认配置
            config = defaultConfig;
            console.log('[AI Config] 未找到用户配置，使用默认配置');
            // 自动创建默认配置
            try {
                const id = (0, uuid_1.v4)();
                db_1.db.prepare(`
          INSERT INTO user_ai_settings (id, user_id, provider, api_url, api_key, model)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, userId, config.provider, config.api_url, config.api_key, config.model);
                console.log('[AI Config] 已创建默认用户配置');
            }
            catch (e) {
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
            }
            else {
                console.warn('[AI Config] ✗ 模型配置是null或undefined字符串:', trimmed);
            }
        }
        else {
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
                const isDockerBridge = hostname === '172.17.0.1' || hostname.startsWith('172.17.');
                // 检查是否是局域网IP地址（192.168.x.x, 10.x.x.x, 172.16-31.x.x，但排除 Docker 网桥）
                const isPrivateIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname) && !isDockerBridge;
                // 检测是否在 Docker 容器中
                const inDocker = isDockerContainer();
                if (isLocalhost || isDockerBridge) {
                    // 如果是 localhost 或 Docker 网桥地址，在 Docker 环境或生产环境中需要转换为 host.docker.internal
                    // 强制在生产环境中转换（因为生产环境通常在 Docker 中运行）
                    const shouldConvert = process.env.NODE_ENV === 'production' || inDocker;
                    console.log('[AI Config] ========== 地址检测 ==========');
                    console.log('[AI Config] 检测到地址:', apiUrlValue);
                    console.log('[AI Config] 地址类型:', isLocalhost ? 'localhost' : 'Docker网桥');
                    console.log('[AI Config] Docker 检测结果:', inDocker);
                    console.log('[AI Config] NODE_ENV:', process.env.NODE_ENV);
                    console.log('[AI Config] 是否需要转换:', shouldConvert);
                    if (shouldConvert) {
                        // 在 Docker 环境或生产环境中，将 localhost 或 Docker 网桥地址转换为 host.docker.internal
                        const newUrl = new URL(apiUrlValue);
                        newUrl.hostname = 'host.docker.internal';
                        const originalUrl = apiUrlValue;
                        apiUrlValue = newUrl.toString();
                        console.log('[AI Config] ========== 执行地址转换 ==========');
                        console.log('[AI Config] 原始地址（系统设置）:', originalUrl);
                        console.log('[AI Config] 转换为:', apiUrlValue);
                        console.log('[AI Config] 原因：容器内的 localhost 或 Docker 网桥地址无法可靠访问宿主机，需要转换为 host.docker.internal');
                        console.log('[AI Config] ========================================');
                    }
                    else {
                        console.log('[AI Config] ⚠️ 未执行转换，使用原地址:', apiUrlValue);
                        console.log('[AI Config] 提示：如果在 Docker 环境中，此地址可能无法访问宿主机服务');
                        console.log('[AI Config] 建议：在系统设置中直接配置 http://host.docker.internal:11434 或实际 IP 地址');
                    }
                }
                else if (isPrivateIP) {
                    // 如果是局域网IP地址，直接使用，不需要转换
                    // Docker 容器默认可以访问宿主机的局域网（如果宿主机可以访问）
                    console.log('[AI Config] 使用局域网IP地址:', apiUrlValue);
                    console.log('[AI Config] 提示：确保 Docker 容器可以访问宿主机局域网');
                    console.log('[AI Config] 提示：如果无法访问，请检查 Docker 网络配置或防火墙设置');
                }
                else {
                    // 其他地址（域名或公网IP），直接使用
                    console.log('[AI Config] 使用配置的地址:', apiUrlValue);
                }
            }
            catch (e) {
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
    }
    catch (error) {
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
router.get('/settings', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const settings = db_1.db.prepare('SELECT * FROM user_ai_settings WHERE user_id = ?').get(userId);
        if (settings) {
            res.json({
                provider: settings.provider || 'ollama',
                api_url: settings.api_url || 'http://127.0.0.1:11434',
                api_key: settings.api_key || '',
                model: settings.model || 'deepseek-v3.1:671b-cloud',
            });
        }
        else {
            // 返回默认配置
            res.json({
                provider: 'ollama',
                api_url: 'http://127.0.0.1:11434',
                api_key: '',
                model: 'deepseek-v3.1:671b-cloud',
            });
        }
    }
    catch (error) {
        console.error('[AI Settings] 获取用户AI设置失败:', error);
        res.status(500).json({ error: '获取设置失败' });
    }
});
// 更新用户AI设置
router.put('/settings', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { provider, api_url, api_key, model } = req.body;
        // 检查是否已有设置
        const existing = db_1.db.prepare('SELECT id FROM user_ai_settings WHERE user_id = ?').get(userId);
        if (existing) {
            // 更新现有设置
            db_1.db.prepare(`
        UPDATE user_ai_settings 
        SET provider = ?, api_url = ?, api_key = ?, model = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(provider || 'ollama', api_url || 'http://127.0.0.1:11434', api_key || '', model || 'deepseek-v3.1:671b-cloud', userId);
        }
        else {
            // 创建新设置
            const id = (0, uuid_1.v4)();
            db_1.db.prepare(`
        INSERT INTO user_ai_settings (id, user_id, provider, api_url, api_key, model)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, userId, provider || 'ollama', api_url || 'http://127.0.0.1:11434', api_key || '', model || 'deepseek-v3.1:671b-cloud');
        }
        res.json({ message: 'AI设置已保存' });
    }
    catch (error) {
        console.error('[AI Settings] 更新用户AI设置失败:', error);
        res.status(500).json({ error: '保存设置失败' });
    }
});
// 测试AI配置
router.get('/test', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
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
        }
        catch (configError) {
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
                console.log('[AI Test] 测试Ollama连接:', { baseUrl: config.apiUrl, cleanedUrl: baseUrl, testUrl });
                const response = await axios_1.default.get(testUrl, {
                    timeout: 5000,
                    validateStatus: (status) => status < 500,
                });
                if (response.status >= 400) {
                    throw new Error(`HTTP ${response.status}: ${response.data?.error || response.statusText}`);
                }
                console.log('[AI Test] Ollama连接成功，模型数量:', response.data?.models?.length || 0);
                res.json({
                    success: true,
                    config: {
                        ...config,
                        apiUrl: baseUrl, // 返回清理后的URL
                    },
                    message: 'Ollama连接成功',
                    models: response.data?.models || [],
                });
            }
            catch (error) {
                console.error('[AI Test] Ollama连接测试失败:', {
                    apiUrl: config.apiUrl,
                    error: error.message,
                    response: error.response?.data,
                    status: error.response?.status,
                    code: error.code,
                    name: error.name,
                });
                let errorMessage = `无法连接到Ollama服务: ${error.message}`;
                // 提供详细的错误信息和解决建议
                if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
                    errorMessage += '\n\n可能的原因：';
                    errorMessage += '\n1. Ollama 服务器未运行或地址不正确';
                    errorMessage += '\n2. 如果 Ollama 在宿主机上，请使用：http://host.docker.internal:11434';
                    errorMessage += '\n3. 如果 Ollama 在局域网其他机器上，请使用实际 IP 地址，如：http://192.168.6.20:11434';
                    errorMessage += '\n4. 检查网络连接和防火墙设置';
                    errorMessage += '\n5. 确认 Ollama 服务器在指定地址和端口上运行';
                }
                res.status(500).json({
                    success: false,
                    config,
                    error: errorMessage,
                    details: error.response?.data || error.message,
                });
            }
        }
        else {
            res.json({
                success: true,
                config,
                message: '配置已加载（未测试连接）',
            });
        }
    }
    catch (error) {
        console.error('[AI Test] 测试失败:', {
            error: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
        });
        // 确保响应头未发送
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: error.message || '测试失败',
                details: process.env.NODE_ENV === 'development' ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                    code: error.code,
                } : undefined,
            });
        }
        else {
            console.error('[AI Test] 响应头已发送，无法返回错误信息');
        }
    }
});
// 调用AI API
async function callAI(userId, prompt, systemPrompt, conversationHistory) {
    const config = getAIConfig(userId);
    console.log('[AI Call] ========== 开始AI调用 ==========');
    console.log('[AI Call] Provider:', config.provider);
    console.log('[AI Call] API URL:', config.apiUrl);
    console.log('[AI Call] Model:', config.model, '(这是实际使用的模型名称)');
    console.log('[AI Call] Has API Key:', !!config.apiKey);
    console.log('[AI Call] =================================');
    const messages = [];
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
            // 如果config.model不存在、为空或是默认值，尝试重新获取配置
            if (!modelToUse || modelToUse.trim() === '' || modelToUse === 'llama2') {
                console.error('[AI Call] ⚠️⚠️⚠️ 警告：config.model是默认值或空值！');
                console.error('[AI Call] config.model:', config.model);
                console.error('[AI Call] config.model type:', typeof config.model);
                console.error('[AI Call] config.model length:', config.model?.length);
                // 尝试重新获取配置
                const freshConfig = getAIConfig(userId);
                console.error('[AI Call] 重新获取的配置:', JSON.stringify(freshConfig, null, 2));
                if (freshConfig.model && freshConfig.model !== 'deepseek-v3.1:671b-cloud' && freshConfig.model.trim() !== '') {
                    modelToUse = freshConfig.model.trim();
                    console.log('[AI Call] ✓ 使用重新获取的模型名称:', modelToUse);
                }
                else {
                    console.error('[AI Call] ✗ 重新获取的配置也是默认值或无效');
                    console.error('[AI Call] freshConfig.model:', freshConfig.model);
                    // 最后尝试：直接从数据库读取
                    try {
                        const dbModel = db_1.db.prepare('SELECT value FROM system_settings WHERE key = ?').get('ai_model');
                        if (dbModel && dbModel.value) {
                            const dbModelValue = String(dbModel.value).trim();
                            if (dbModelValue !== '' && dbModelValue !== 'llama2') {
                                modelToUse = dbModelValue;
                                console.log('[AI Call] ✓✓✓ 直接从数据库读取模型名称:', modelToUse);
                            }
                        }
                    }
                    catch (dbError) {
                        console.error('[AI Call] 从数据库读取失败:', dbError);
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
            if (!modelToUse || modelToUse === 'deepseek-v3.1:671b-cloud' || modelToUse.trim() === '') {
                console.error('[AI Call] ⚠️⚠️⚠️ 最终警告：使用的模型是默认值或空值！');
                console.error('[AI Call] modelToUse:', modelToUse);
                console.error('[AI Call] config.model:', config.model);
                throw new Error('模型名称未正确配置，请检查系统设置');
            }
            const requestBody = {
                model: modelToUse,
                messages: messages,
                stream: false,
            };
            console.log('[AI Call] 最终请求体:', JSON.stringify(requestBody, null, 2));
            const response = await axios_1.default.post(url, requestBody, {
                timeout: 120000, // 2分钟超时
                headers: {
                    'Content-Type': 'application/json',
                },
                validateStatus: (status) => status < 500, // 允许4xx状态码，以便捕获错误
            });
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
            return content;
        }
        else if (config.provider === 'openai' || config.provider === 'deepseek') {
            // OpenAI/DeepSeek API
            const apiUrl = config.provider === 'openai'
                ? 'https://api.openai.com/v1/chat/completions'
                : 'https://api.deepseek.com/v1/chat/completions';
            console.log('[AI] 调用OpenAI/DeepSeek API:', { apiUrl, model: config.model });
            if (!config.apiKey) {
                throw new Error('API密钥未配置，请在系统设置中配置API密钥');
            }
            const response = await axios_1.default.post(apiUrl, {
                model: config.model,
                messages: messages,
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 120000,
            });
            const content = response.data.choices[0]?.message?.content;
            if (!content) {
                console.error('[AI] OpenAI/DeepSeek响应格式异常:', JSON.stringify(response.data, null, 2));
                throw new Error('API返回的响应格式不正确');
            }
            return content;
        }
        else {
            throw new Error(`不支持的AI提供商: ${config.provider}`);
        }
    }
    catch (error) {
        console.error('[AI] API调用失败:', {
            provider: config.provider,
            apiUrl: config.apiUrl,
            model: config.model,
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            statusText: error.response?.statusText,
        });
        // 详细的错误信息
        if (error.response) {
            // 服务器返回了错误响应
            const status = error.response.status;
            const data = error.response.data;
            if (status === 404) {
                throw new Error(`无法连接到AI服务，请检查API地址是否正确: ${config.apiUrl}`);
            }
            else if (status === 401 || status === 403) {
                throw new Error('API密钥无效，请在系统设置中检查API密钥配置');
            }
            else if (status >= 500) {
                throw new Error(`AI服务内部错误 (${status}): ${data?.error || error.message}`);
            }
            else {
                throw new Error(`AI API请求失败 (${status}): ${data?.error?.message || data?.error || error.message}`);
            }
        }
        else if (error.request) {
            // 请求已发出但没有收到响应
            let errorMessage = `无法连接到AI服务 (${config.apiUrl})，请检查服务是否运行或网络连接是否正常`;
            // 提供详细的错误信息和解决建议
            errorMessage += '\n\n可能的原因：';
            errorMessage += '\n1. Ollama 服务器未运行或地址不正确';
            errorMessage += '\n2. 如果 Ollama 在宿主机上，请使用：http://host.docker.internal:11434';
            errorMessage += '\n3. 如果 Ollama 在局域网其他机器上，请使用实际 IP 地址，如：http://192.168.6.20:11434';
            errorMessage += '\n4. 检查网络连接和防火墙设置';
            errorMessage += '\n5. 确认 Ollama 服务器在指定地址和端口上运行';
            throw new Error(errorMessage);
        }
        else {
            // 其他错误
            throw new Error(`AI API调用失败: ${error.message || '未知错误'}`);
        }
    }
}
// AI聊天
router.post('/chat', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
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
        const book = db_1.db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
        if (!book) {
            return res.status(404).json({ error: '书籍不存在' });
        }
        // 提取书籍文本（限制长度）
        let bookText = '';
        try {
            bookText = await (0, bookTextExtractor_1.extractBookText)(bookId, 30000); // 限制为30K字符
            console.log('[AI Chat] 书籍文本提取成功，长度:', bookText.length);
        }
        catch (error) {
            console.error('[AI Chat] 提取书籍文本失败:', error);
            // 如果提取失败，继续使用空文本
        }
        // 构建系统提示
        const systemPrompt = `你是一个专业的阅读助手。用户正在阅读《${book.title}》${book.author ? `（作者：${book.author}）` : ''}。

书籍内容摘要：
${bookText ? bookText.substring(0, 10000) : '无法获取书籍内容'}

请基于书籍内容回答用户的问题。如果问题与书籍内容无关，请礼貌地说明。`;
        // 构建对话历史
        const history = (conversationHistory || []).map((m) => ({
            role: m.role,
            content: m.content,
        }));
        // 调用AI
        console.log('[AI Chat] 开始调用AI...');
        let response;
        try {
            response = await callAI(userId, message, systemPrompt, history);
            console.log('[AI Chat] AI响应成功，长度:', response.length);
            if (!response || response.trim().length === 0) {
                throw new Error('AI返回的响应为空');
            }
        }
        catch (aiError) {
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
    }
    catch (error) {
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
            }
            else if (error.message && error.message.includes('未找到')) {
                errorMessage = error.message;
            }
            else if (error.message && error.message.includes('无法连接')) {
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
        }
        else {
            console.error('[AI Chat] 响应头已发送，无法返回错误信息');
        }
    }
});
// 分析书籍
router.post('/analyze', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bookId } = req.body;
        console.log('[AI Analyze] 收到请求:', { bookId });
        if (!bookId) {
            return res.status(400).json({ error: '请提供书籍ID' });
        }
        // 获取书籍信息
        const book = db_1.db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
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
                fileExt: book.file_name ? path_1.default.extname(book.file_name).toLowerCase() : 'unknown',
            });
            bookText = await (0, bookTextExtractor_1.extractBookText)(bookId, 50000); // 限制为50K字符
            console.log('[AI Analyze] 书籍文本提取成功，长度:', bookText.length);
            if (!bookText || bookText.trim().length === 0) {
                console.warn('[AI Analyze] 提取的文本为空');
            }
        }
        catch (error) {
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
            }
            else if (error.message.includes('格式')) {
                errorMessage = `不支持的文件格式，当前支持：EPUB、PDF、TXT`;
            }
            else if (error.message.includes('无法确定')) {
                errorMessage = '无法确定书籍文件格式，请检查文件扩展名';
            }
            else {
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
        console.log('[AI Analyze] 开始调用AI进行分析...');
        const analysis = await callAI(userId, prompt);
        console.log('[AI Analyze] AI分析完成，响应长度:', analysis.length);
        res.json({ analysis });
    }
    catch (error) {
        console.error('[AI Analyze] 分析书籍失败:', {
            message: error.message,
            stack: error.stack,
            bookId: req.body?.bookId,
            name: error.name,
            code: error.code,
        });
        // 确保响应头未发送
        if (!res.headersSent) {
            res.status(500).json({
                error: error.message || '分析书籍失败',
                details: process.env.NODE_ENV === 'development' ? {
                    stack: error.stack,
                    name: error.name,
                    code: error.code,
                } : undefined
            });
        }
        else {
            console.error('[AI Analyze] 响应头已发送，无法返回错误信息');
        }
    }
});
// 文本转语音（TTS）
router.post('/tts', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
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
                const response = await axios_1.default.post(`${config.apiUrl}/api/generate`, {
                    model: 'tts', // 需要安装TTS模型
                    prompt: textToConvert,
                }, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                });
                res.setHeader('Content-Type', 'audio/mpeg');
                res.send(Buffer.from(response.data));
            }
            else {
                // 对于其他提供商，可以使用Web Speech API或第三方TTS服务
                // 这里返回一个简单的提示
                return res.status(501).json({ error: '当前AI提供商不支持TTS功能，请使用Ollama或配置TTS服务' });
            }
        }
        catch (error) {
            console.error('TTS失败:', error);
            return res.status(500).json({ error: 'TTS服务不可用，请检查配置' });
        }
    }
    catch (error) {
        console.error('TTS请求失败:', error);
        res.status(500).json({ error: error.message || 'TTS请求失败' });
    }
});
exports.default = router;
//# sourceMappingURL=ai.js.map