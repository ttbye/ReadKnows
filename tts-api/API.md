# TTS API 使用说明

本文档详细说明 TTS API 的使用方法、参数和示例。

## 目录

- [基础信息](#基础信息)
- [API 认证](#api-认证)
- [API 端点](#api-端点)
- [请求示例](#请求示例)
- [错误处理](#错误处理)
- [最佳实践](#最佳实践)

## 基础信息

### 服务地址

- **开发环境**: `http://localhost:5050`
- **生产环境**: 根据实际部署地址配置

### API 文档

- **Swagger UI**: `http://localhost:5050/docs`
- **ReDoc**: `http://localhost:5050/redoc`
- **测试页面**: `http://localhost:5050/test`

### 支持的格式

- **请求格式**: JSON
- **响应格式**: 
  - 成功: 音频文件（MP3 或 WAV）
  - 失败: JSON 错误信息

## API 认证

如果服务配置了 `API_KEY`，需要在请求中包含认证信息。

### 方式 1: Header（推荐）

```http
X-API-Key: your-api-key-here
```

### 方式 2: Query 参数

```
?apiKey=your-api-key-here
```

### 方式 3: Bearer Token

```http
Authorization: Bearer your-api-key-here
```

## API 端点

### 1. 健康检查

检查服务是否正常运行。

```http
GET /health
```

**响应示例**:
```json
{
  "status": "ok"
}
```

### 2. 获取模型列表

获取所有可用的 TTS 模型及其状态。

```http
GET /api/tts/models
```

**响应示例**:
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
      "id": "cosyvoice",
      "name": "CosyVoice",
      "type": "offline",
      "available": true,
      "description": "阿里云 CosyVoice 离线模型，支持声音克隆",
      "install_required": false,
      "install_guide": "运行: python3 scripts/download-cosyvoice.py models/cosyvoice"
    }
  ]
}
```

**字段说明**:
- `id`: 模型唯一标识符
- `name`: 模型显示名称
- `type`: 模型类型（`online` 或 `offline`）
- `available`: 模型是否可用
- `description`: 模型描述
- `install_required`: 是否需要安装
- `install_guide`: 安装指南

### 3. 获取语音列表

获取指定模型的所有可用语音。

```http
GET /api/tts/voices?model={model_id}
```

**参数**:
- `model` (必需): 模型 ID

**响应示例**:
```json
{
  "model": "cosyvoice",
  "voices": [
    {
      "id": "中文女",
      "name": "中文女",
      "type": "predefined",
      "gender": "Female",
      "locale": "zh-CN"
    },
    {
      "id": "cosyvoice-魔嘉嘉",
      "name": "魔嘉嘉 (女) - 参考音频",
      "type": "reference_audio",
      "description": "从参考音频克隆的声音"
    }
  ]
}
```

**字段说明**:
- `id`: 语音唯一标识符（用于合成请求）
- `name`: 语音显示名称
- `type`: 语音类型
  - `predefined`: 预定义语音
  - `reference_audio`: 参考音频克隆语音
  - `custom`: 自定义语音
- `gender`: 性别（`Male` 或 `Female`）
- `locale`: 语言区域代码
- `description`: 语音描述

### 4. 语音合成

将文本转换为语音。

```http
POST /api/tts/synthesize
Content-Type: application/json
```

**请求体**:
```json
{
  "text": "要合成的文本内容",
  "model": "cosyvoice",
  "voice": "中文女",
  "speed": 1.0,
  "referenceAudio": null,
  "emotion": null,
  "language": null
}
```

**参数说明**:

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `text` | string | 是 | - | 要合成的文本内容 |
| `model` | string | 是 | - | 模型 ID（如 `edge-tts`, `cosyvoice`） |
| `voice` | string | 是 | - | 语音 ID（从 `/api/tts/voices` 获取） |
| `speed` | float | 否 | 1.0 | 语速，范围 0.5-2.0 |
| `referenceAudio` | string | 否 | null | 参考音频文件路径（用于声音克隆） |
| `emotion` | string | 否 | null | 情感类型（仅 CosyVoice Instruct 模式） |
| `language` | string | 否 | null | 语言代码（仅 Coqui XTTS-v2） |

**响应**:
- **成功** (200): 返回音频文件流
  - Content-Type: `audio/mpeg` (MP3) 或 `audio/wav` (WAV)
  - Content-Disposition: `attachment; filename="tts-{uuid}.mp3"`
- **失败** (400/500): 返回 JSON 错误信息

**错误响应示例**:
```json
{
  "detail": "语音合成失败: CosyVoice 合成失败: 无法确定合成模式：需要 speaker 或 reference_audio"
}
```

## 请求示例

### cURL

#### 基础合成

```bash
curl -X POST "http://localhost:5050/api/tts/synthesize" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "text": "你好，世界！",
    "model": "cosyvoice",
    "voice": "中文女",
    "speed": 1.0
  }' \
  --output output.mp3
```

#### 声音克隆（CosyVoice）

```bash
curl -X POST "http://localhost:5050/api/tts/synthesize" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "这是使用克隆声音合成的文本。",
    "model": "cosyvoice",
    "voice": "cosyvoice-魔嘉嘉",
    "referenceAudio": "/app/models/cosyvoice/reference_audio/魔嘉嘉.mp3",
    "speed": 1.0
  }' \
  --output cloned.mp3
```

#### 情感控制（CosyVoice）

```bash
curl -X POST "http://localhost:5050/api/tts/synthesize" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "今天天气真好！",
    "model": "cosyvoice",
    "voice": "中文女",
    "emotion": "happy",
    "speed": 1.0
  }' \
  --output happy.mp3
```

### Python

#### 基础使用

```python
import requests

url = "http://localhost:5050/api/tts/synthesize"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "your-api-key"  # 如果设置了 API_KEY
}

data = {
    "text": "你好，世界！",
    "model": "cosyvoice",
    "voice": "中文女",
    "speed": 1.0
}

response = requests.post(url, json=data, headers=headers)

if response.status_code == 200:
    with open("output.mp3", "wb") as f:
        f.write(response.content)
    print("音频已保存到 output.mp3")
else:
    print(f"错误: {response.json()}")
```

#### 声音克隆

```python
import requests

url = "http://localhost:5050/api/tts/synthesize"
headers = {"Content-Type": "application/json"}

data = {
    "text": "这是使用克隆声音合成的文本。",
    "model": "cosyvoice",
    "voice": "cosyvoice-魔嘉嘉",
    "referenceAudio": "/app/models/cosyvoice/reference_audio/魔嘉嘉.mp3",
    "speed": 1.0
}

response = requests.post(url, json=data, headers=headers)

if response.status_code == 200:
    with open("cloned.mp3", "wb") as f:
        f.write(response.content)
    print("克隆音频已保存")
else:
    error = response.json()
    print(f"错误: {error['detail']}")
```

#### 批量合成

```python
import requests
from pathlib import Path

url = "http://localhost:5050/api/tts/synthesize"
headers = {"Content-Type": "application/json"}

texts = [
    "第一段文本。",
    "第二段文本。",
    "第三段文本。"
]

for i, text in enumerate(texts, 1):
    data = {
        "text": text,
        "model": "cosyvoice",
        "voice": "中文女",
        "speed": 1.0
    }
    
    response = requests.post(url, json=data, headers=headers)
    
    if response.status_code == 200:
        output_file = f"output_{i}.mp3"
        with open(output_file, "wb") as f:
            f.write(response.content)
        print(f"已保存: {output_file}")
    else:
        print(f"错误 {i}: {response.json()}")
```

### JavaScript/TypeScript

#### 基础使用

```javascript
async function synthesize(text, model, voice) {
  const response = await fetch('http://localhost:5050/api/tts/synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your-api-key'  // 如果设置了 API_KEY
    },
    body: JSON.stringify({
      text: text,
      model: model,
      voice: voice,
      speed: 1.0
    })
  });

  if (response.ok) {
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'output.mp3';
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } else {
    const error = await response.json();
    console.error('错误:', error.detail);
    return false;
  }
}

// 使用示例
synthesize('你好，世界！', 'cosyvoice', '中文女');
```

#### 使用 Audio API 播放

```javascript
async function synthesizeAndPlay(text, model, voice) {
  const response = await fetch('http://localhost:5050/api/tts/synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: text,
      model: model,
      voice: voice,
      speed: 1.0
    })
  });

  if (response.ok) {
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();
    
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };
  } else {
    const error = await response.json();
    console.error('错误:', error.detail);
  }
}
```

### Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

async function synthesize(text, model, voice) {
  try {
    const response = await axios.post(
      'http://localhost:5050/api/tts/synthesize',
      {
        text: text,
        model: model,
        voice: voice,
        speed: 1.0
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'your-api-key'  // 如果设置了 API_KEY
        },
        responseType: 'arraybuffer'
      }
    );

    fs.writeFileSync('output.mp3', response.data);
    console.log('音频已保存到 output.mp3');
  } catch (error) {
    if (error.response) {
      console.error('错误:', error.response.data);
    } else {
      console.error('错误:', error.message);
    }
  }
}

// 使用示例
synthesize('你好，世界！', 'cosyvoice', '中文女');
```

## 错误处理

### 常见错误码

| 状态码 | 说明 | 解决方案 |
|--------|------|----------|
| 200 | 成功 | - |
| 400 | 请求参数错误 | 检查请求参数格式和内容 |
| 401 | 认证失败 | 检查 API Key 是否正确 |
| 404 | 资源不存在 | 检查模型或语音 ID 是否正确 |
| 500 | 服务器内部错误 | 查看服务器日志，检查模型是否正常 |

### 错误响应格式

```json
{
  "detail": "错误描述信息"
}
```

### 错误处理示例

```python
import requests

def synthesize_with_error_handling(text, model, voice):
    url = "http://localhost:5050/api/tts/synthesize"
    headers = {"Content-Type": "application/json"}
    
    data = {
        "text": text,
        "model": model,
        "voice": voice,
        "speed": 1.0
    }
    
    try:
        response = requests.post(url, json=data, headers=headers, timeout=30)
        
        if response.status_code == 200:
            return response.content
        elif response.status_code == 400:
            error = response.json()
            raise ValueError(f"请求参数错误: {error['detail']}")
        elif response.status_code == 401:
            raise PermissionError("API 认证失败，请检查 API Key")
        elif response.status_code == 500:
            error = response.json()
            raise RuntimeError(f"服务器错误: {error['detail']}")
        else:
            raise Exception(f"未知错误: {response.status_code}")
            
    except requests.exceptions.Timeout:
        raise TimeoutError("请求超时，请稍后重试")
    except requests.exceptions.ConnectionError:
        raise ConnectionError("无法连接到服务器，请检查服务是否运行")
```

## 最佳实践

### 1. 文本预处理

- 清理特殊字符
- 处理长文本（建议分段处理）
- 检查文本编码

```python
def preprocess_text(text):
    # 移除特殊字符
    import re
    text = re.sub(r'[^\w\s\u4e00-\u9fff]', '', text)
    
    # 分段处理长文本
    max_length = 500
    if len(text) > max_length:
        segments = [text[i:i+max_length] for i in range(0, len(text), max_length)]
        return segments
    return [text]
```

### 2. 错误重试

```python
import time
import requests

def synthesize_with_retry(text, model, voice, max_retries=3):
    url = "http://localhost:5050/api/tts/synthesize"
    headers = {"Content-Type": "application/json"}
    
    data = {
        "text": text,
        "model": model,
        "voice": voice,
        "speed": 1.0
    }
    
    for attempt in range(max_retries):
        try:
            response = requests.post(url, json=data, headers=headers, timeout=30)
            if response.status_code == 200:
                return response.content
            elif response.status_code == 500:
                # 服务器错误，等待后重试
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # 指数退避
                    continue
            raise Exception(f"请求失败: {response.status_code}")
        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise
    raise Exception("重试次数用尽")
```

### 3. 异步处理

```python
import asyncio
import aiohttp

async def synthesize_async(text, model, voice):
    url = "http://localhost:5050/api/tts/synthesize"
    headers = {"Content-Type": "application/json"}
    
    data = {
        "text": text,
        "model": model,
        "voice": voice,
        "speed": 1.0
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=data, headers=headers) as response:
            if response.status == 200:
                return await response.read()
            else:
                error = await response.json()
                raise Exception(f"错误: {error['detail']}")

# 批量异步合成
async def batch_synthesize(texts, model, voice):
    tasks = [synthesize_async(text, model, voice) for text in texts]
    results = await asyncio.gather(*tasks)
    return results
```

### 4. 缓存机制

```python
import hashlib
import os
from pathlib import Path

def get_cache_path(text, model, voice, speed):
    # 生成缓存键
    cache_key = f"{text}_{model}_{voice}_{speed}"
    cache_hash = hashlib.md5(cache_key.encode()).hexdigest()
    
    cache_dir = Path("cache")
    cache_dir.mkdir(exist_ok=True)
    
    return cache_dir / f"{cache_hash}.mp3"

def synthesize_with_cache(text, model, voice, speed=1.0):
    cache_path = get_cache_path(text, model, voice, speed)
    
    # 检查缓存
    if cache_path.exists():
        print(f"使用缓存: {cache_path}")
        return cache_path.read_bytes()
    
    # 合成语音
    url = "http://localhost:5050/api/tts/synthesize"
    headers = {"Content-Type": "application/json"}
    
    data = {
        "text": text,
        "model": model,
        "voice": voice,
        "speed": speed
    }
    
    response = requests.post(url, json=data, headers=headers)
    
    if response.status_code == 200:
        audio_data = response.content
        # 保存到缓存
        cache_path.write_bytes(audio_data)
        return audio_data
    else:
        raise Exception(f"合成失败: {response.json()}")
```

### 5. 性能优化

- 使用连接池
- 批量请求
- 异步处理
- 合理设置超时时间

```python
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# 创建会话并配置重试策略
session = requests.Session()
retry_strategy = Retry(
    total=3,
    backoff_factor=1,
    status_forcelist=[500, 502, 503, 504]
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("http://", adapter)
session.mount("https://", adapter)

# 使用会话发送请求
response = session.post(url, json=data, headers=headers, timeout=30)
```

## 模型特定说明

### CosyVoice

#### 声音克隆

CosyVoice 支持两种声音克隆模式：

1. **Zero-shot 模式**（推荐，需要参考文本）：
   ```json
   {
     "text": "要合成的文本",
     "model": "cosyvoice",
     "voice": "cosyvoice-魔嘉嘉",
     "referenceAudio": "/path/to/reference.mp3"
   }
   ```
   需要确保参考音频目录下有对应的 `.txt` 文件。

2. **Cross-lingual 模式**（仅需参考音频）：
   ```json
   {
     "text": "要合成的文本",
     "model": "cosyvoice",
     "voice": "cosyvoice-魔嘉嘉",
     "referenceAudio": "/path/to/reference.mp3"
   }
   ```

#### 情感控制

```json
{
  "text": "要合成的文本",
  "model": "cosyvoice",
  "voice": "中文女",
  "emotion": "happy",
  "speed": 1.0
}
```

支持的情感：`happy`, `sad`, `angry`, `surprised`, `neutral`

### IndexTTS2

```json
{
  "text": "要合成的文本",
  "model": "indextts2",
  "voice": "indextts2-custom-voice",
  "referenceAudio": "/path/to/reference.wav",
  "speed": 1.0
}
```

### Coqui XTTS-v2

```json
{
  "text": "要合成的文本",
  "model": "coqui",
  "voice": "coqui-custom-voice",
  "referenceAudio": "/path/to/reference.wav",
  "language": "zh-cn",
  "speed": 1.0
}
```

支持的语言：`en`, `zh-cn`, `ja`, `es`, `fr`, `de`, `pt`, `pl`, `it`, `tr`, `ru`, `nl`, `cs`, `ar`, `zh-tw`, `hu`, `ko`

## 常见问题

### Q: 如何检查模型是否可用？

A: 调用 `/api/tts/models` 接口，检查 `available` 字段。

### Q: 如何获取所有可用的语音？

A: 调用 `/api/tts/voices?model={model_id}` 接口。

### Q: 声音克隆失败怎么办？

A: 
1. 检查参考音频文件是否存在
2. 检查音频文件格式是否支持
3. 对于 CosyVoice，确保有对应的文本文件（Zero-shot 模式）

### Q: 如何提高合成速度？

A:
1. 使用在线模型（Edge-TTS, Qwen-TTS）
2. 使用缓存机制
3. 使用异步请求
4. 优化文本长度

### Q: 支持哪些音频格式？

A: 输出格式为 MP3 或 WAV，根据模型自动选择。

## 更多资源

- [README.md](./README.md) - 项目说明和安装指南
- [Swagger UI](http://localhost:5050/docs) - 交互式 API 文档
- [测试页面](http://localhost:5050/test) - Web 测试界面

