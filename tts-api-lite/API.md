# TTS-API-Lite API 文档

## 基础信息

- **Base URL**: `http://localhost:5050`
- **API 前缀**: `/api/tts`
- **内容类型**: `application/json`
- **响应格式**: JSON（除音频文件外）

## 认证

如果服务启用了 API Key 验证（设置了 `API_KEY` 环境变量），需要在请求中包含 API Key：

### 方式 1：请求头
```
X-API-Key: your-api-key
```

### 方式 2：查询参数
```
?apiKey=your-api-key
```

### 方式 3：Authorization 头
```
Authorization: Bearer your-api-key
```

## API 端点

### 1. 获取模型列表

获取所有可用的 TTS 模型列表。

**请求**
```http
GET /api/tts/models
```

**响应**
```json
{
  "models": [
    {
      "id": "edge-tts",
      "name": "Edge-TTS",
      "type": "online",
      "available": true,
      "description": "微软 Edge-TTS 在线服务，高质量多语言支持",
      "install_required": false,
      "install_guide": "已包含在 requirements.txt 中，运行 pip install -r requirements.txt 即可"
    },
    {
      "id": "qwen-tts",
      "name": "Qwen-TTS",
      "type": "online",
      "available": true,
      "description": "阿里云 Qwen-TTS 在线服务",
      "install_required": false,
      "install_guide": "需要在 .env 文件中设置 QWEN_API_KEY=your-api-key"
    }
  ]
}
```

**字段说明**
- `id`: 模型唯一标识符
- `name`: 模型显示名称
- `type`: 模型类型（`online` 表示在线服务）
- `available`: 模型是否可用
- `description`: 模型描述
- `install_required`: 是否需要额外安装
- `install_guide`: 安装指南

---

### 2. 获取语音列表

获取指定模型的所有可用语音。

**请求**
```http
GET /api/tts/voices?model={model_id}
```

**参数**
- `model` (必需): 模型 ID（`edge-tts` 或 `qwen-tts`）

**响应（Edge-TTS）**
```json
{
  "model": "edge-tts",
  "voices": [
    {
      "id": "zh-CN-XiaoxiaoNeural",
      "name": "Xiaoxiao",
      "gender": "Female",
      "locale": "zh-CN",
      "language": "Chinese"
    },
    {
      "id": "zh-CN-YunyangNeural",
      "name": "Yunyang",
      "gender": "Male",
      "locale": "zh-CN",
      "language": "Chinese"
    }
  ]
}
```

**响应（Qwen-TTS）**
```json
{
  "model": "qwen-tts",
  "voices": [
    {
      "id": "zh-CN-female-1",
      "name": "中文女声1",
      "gender": "female",
      "language": "zh-CN"
    },
    {
      "id": "zh-CN-male-1",
      "name": "中文男声1",
      "gender": "male",
      "language": "zh-CN"
    }
  ]
}
```

**字段说明**
- `id`: 语音唯一标识符（用于合成请求）
- `name`: 语音显示名称
- `gender`: 性别（`Female`/`Male` 或 `female`/`male`）
- `locale`: 语言区域代码（Edge-TTS）
- `language`: 语言名称

---

### 3. 合成语音

将文本转换为语音。

**请求**
```http
POST /api/tts/synthesize
Content-Type: application/json
```

**请求体**
```json
{
  "text": "你好，这是一个测试。",
  "model": "edge-tts",
  "voice": "zh-CN-XiaoxiaoNeural",
  "speed": 1.0
}
```

**参数说明**
- `text` (必需): 要合成的文本
- `model` (必需): 模型 ID（`edge-tts` 或 `qwen-tts`）
- `voice` (必需): 语音 ID（从 `/api/tts/voices` 获取）
- `speed` (可选): 语速，范围 0.5-2.0，默认 1.0

**响应**

成功时返回音频文件（MP3 或 WAV），HTTP 状态码 200。

**错误响应**
```json
{
  "detail": "语音合成失败: 错误信息"
}
```

常见错误：
- `400`: 请求参数错误
- `401`: API Key 验证失败
- `500`: 服务器内部错误

---

### 4. 健康检查

检查服务健康状态。

**请求**
```http
GET /health
```

**响应**
```json
{
  "status": "ok",
  "version": "1.0.0-lite"
}
```

---

## 使用示例

### cURL

```bash
# 获取模型列表
curl http://localhost:5050/api/tts/models

# 获取 Edge-TTS 语音列表
curl http://localhost:5050/api/tts/voices?model=edge-tts

# 合成语音
curl -X POST http://localhost:5050/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "text": "你好，世界！",
    "model": "edge-tts",
    "voice": "zh-CN-XiaoxiaoNeural",
    "speed": 1.0
  }' \
  --output output.mp3
```

### Python

```python
import requests

# 配置
BASE_URL = "http://localhost:5050"
API_KEY = "your-api-key"  # 如果启用了 API Key

headers = {
    "X-API-Key": API_KEY
} if API_KEY else {}

# 获取模型列表
response = requests.get(f"{BASE_URL}/api/tts/models", headers=headers)
models = response.json()
print("可用模型:", [m['name'] for m in models['models']])

# 获取语音列表
response = requests.get(
    f"{BASE_URL}/api/tts/voices",
    params={"model": "edge-tts"},
    headers=headers
)
voices = response.json()
print("可用语音:", [v['name'] for v in voices['voices']])

# 合成语音
response = requests.post(
    f"{BASE_URL}/api/tts/synthesize",
    json={
        "text": "你好，世界！",
        "model": "edge-tts",
        "voice": "zh-CN-XiaoxiaoNeural",
        "speed": 1.0
    },
    headers=headers
)

# 保存音频文件
if response.status_code == 200:
    with open("output.mp3", "wb") as f:
        f.write(response.content)
    print("音频已保存到 output.mp3")
else:
    print("错误:", response.json())
```

### JavaScript

```javascript
const BASE_URL = "http://localhost:5050";
const API_KEY = "your-api-key";  // 如果启用了 API Key

const headers = API_KEY ? { "X-API-Key": API_KEY } : {};

// 获取模型列表
async function getModels() {
    const response = await fetch(`${BASE_URL}/api/tts/models`, { headers });
    const data = await response.json();
    console.log("可用模型:", data.models.map(m => m.name));
    return data;
}

// 获取语音列表
async function getVoices(model) {
    const response = await fetch(
        `${BASE_URL}/api/tts/voices?model=${model}`,
        { headers }
    );
    const data = await response.json();
    console.log("可用语音:", data.voices.map(v => v.name));
    return data;
}

// 合成语音
async function synthesize(text, model, voice, speed = 1.0) {
    const response = await fetch(`${BASE_URL}/api/tts/synthesize`, {
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ text, model, voice, speed })
    });
    
    if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        // 创建音频元素播放
        const audio = new Audio(url);
        audio.play();
        return url;
    } else {
        const error = await response.json();
        throw new Error(error.detail);
    }
}

// 使用示例
(async () => {
    await getModels();
    await getVoices("edge-tts");
    await synthesize("你好，世界！", "edge-tts", "zh-CN-XiaoxiaoNeural");
})();
```

### Node.js

```javascript
const axios = require('axios');

const BASE_URL = "http://localhost:5050";
const API_KEY = "your-api-key";  // 如果启用了 API Key

const headers = API_KEY ? { "X-API-Key": API_KEY } : {};

// 获取模型列表
async function getModels() {
    const response = await axios.get(`${BASE_URL}/api/tts/models`, { headers });
    console.log("可用模型:", response.data.models.map(m => m.name));
    return response.data;
}

// 获取语音列表
async function getVoices(model) {
    const response = await axios.get(
        `${BASE_URL}/api/tts/voices`,
        { params: { model }, headers }
    );
    console.log("可用语音:", response.data.voices.map(v => v.name));
    return response.data;
}

// 合成语音
async function synthesize(text, model, voice, speed = 1.0) {
    const response = await axios.post(
        `${BASE_URL}/api/tts/synthesize`,
        { text, model, voice, speed },
        { headers, responseType: 'arraybuffer' }
    );
    
    // 保存文件
    const fs = require('fs');
    fs.writeFileSync('output.mp3', response.data);
    console.log("音频已保存到 output.mp3");
}

// 使用示例
(async () => {
    await getModels();
    await getVoices("edge-tts");
    await synthesize("你好，世界！", "edge-tts", "zh-CN-XiaoxiaoNeural");
})();
```

## 错误处理

所有错误响应都遵循以下格式：

```json
{
  "detail": "错误描述信息"
}
```

常见错误码：
- `400 Bad Request`: 请求参数错误
- `401 Unauthorized`: API Key 验证失败
- `404 Not Found`: 资源不存在
- `500 Internal Server Error`: 服务器内部错误

## 限制

1. **文本长度**：建议单次请求文本长度不超过 5000 字符
2. **请求频率**：建议控制请求频率，避免对在线服务造成压力
3. **文件格式**：输出格式取决于模型和 FFmpeg 可用性（MP3 或 WAV）

## 最佳实践

1. **错误处理**：始终检查响应状态码和错误信息
2. **超时设置**：设置合理的请求超时时间（建议 30-60 秒）
3. **重试机制**：对于网络错误，实现重试机制
4. **缓存**：对于相同文本，考虑缓存结果以减少请求
5. **API Key**：在生产环境中始终使用 API Key 验证

