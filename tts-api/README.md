# ReadKnow TTS API

一个支持多种 TTS 引擎的统一 API 服务，支持在线和离线语音合成。

## 功能特性

- 🌐 **在线 TTS 引擎**
  - Edge-TTS：微软 Edge-TTS 在线服务，高质量多语言支持
  - Qwen-TTS：阿里云 Qwen-TTS 在线服务

- 🏠 **离线 TTS 引擎**
  - IndexTTS2：支持声音克隆的离线模型
  - CosyVoice：阿里云 CosyVoice 离线模型，支持声音克隆和情感控制
  - MultiTTS：多语言离线模型
  - Coqui XTTS-v2：支持 17 种语言和声音克隆

- ✨ **核心功能**
  - 统一 API 接口
  - 声音克隆（Voice Cloning）
  - 情感控制（Emotion Control）
  - 语速调节
  - 多语言支持
  - Docker 容器化部署
  - Web 测试界面

## 快速开始

### 方式一：Docker 部署（推荐）

#### 1. 使用 install.sh 脚本安装

在项目根目录运行：

```bash
./install.sh
```

选择选项 `6) 安装 TTS API 服务 (Docker)`

#### 2. 手动 Docker 部署

```bash
cd tts-api

# 构建并启动
docker-compose up -d

# 查看日志
docker logs -f readknow-tts-api

# 停止服务
docker stop readknow-tts-api
```

#### 3. 平台特定的 docker-compose 文件

- `docker-compose.yml` - 通用配置
- `docker-compose-linux.yml` - Linux 平台
- `docker-compose-macos.yml` - macOS 平台
- `docker-compose-windows.yml` - Windows 平台
- `docker-compose-synology.yml` - Synology NAS

### 方式二：本地 Python 环境部署

#### 1. 安装依赖

```bash
cd tts-api
pip install -r requirements.txt
```

#### 2. 配置环境变量

创建 `.env` 文件：

```env
# 服务配置
PORT=5050
API_KEY=your-api-key-here  # 可选，用于 API 认证

# 目录配置
TEMP_DIR=./temp
MODELS_DIR=./models

# Qwen-TTS 配置（可选）
QWEN_API_KEY=your-qwen-api-key
QWEN_TTS_API_URL=https://dashscope.aliyuncs.com/api/v1/services/audio/tts

# FFmpeg 配置
FFMPEG_BIN=ffmpeg

# IndexTTS2 配置
INDEXTTS2_PATH=./models/indextts2/index-tts
```

#### 3. 启动服务

```bash
# 使用 uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 5050

# 或使用启动脚本
./start.sh
```

## API 文档

### 基础信息

- **服务地址**: `http://localhost:5050`
- **API 文档**: `http://localhost:5050/docs` (Swagger)
- **ReDoc 文档**: `http://localhost:5050/redoc`
- **测试页面**: `http://localhost:5050/test`
- **健康检查**: `http://localhost:5050/health`

### API 认证

如果设置了 `API_KEY` 环境变量，需要在请求中包含 API Key：

**方式 1：Header**
```
X-API-Key: your-api-key
```

**方式 2：Query 参数**
```
?apiKey=your-api-key
```

**方式 3：Bearer Token**
```
Authorization: Bearer your-api-key
```

### API 端点

#### 1. 获取模型列表

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
      "install_required": false
    },
    {
      "id": "cosyvoice",
      "name": "CosyVoice",
      "type": "offline",
      "available": true,
      "description": "阿里云 CosyVoice 离线模型，支持声音克隆",
      "install_required": false
    }
  ]
}
```

#### 2. 获取语音列表

```http
GET /api/tts/voices?model={model_id}
```

**参数**:
- `model` (必需): 模型 ID，如 `edge-tts`, `cosyvoice`, `indextts2` 等

**响应示例**:
```json
{
  "voices": [
    {
      "id": "zh-CN-XiaoxiaoNeural",
      "name": "晓晓 (女)",
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

#### 3. 语音合成

```http
POST /api/tts/synthesize
Content-Type: application/json
```

**请求体**:
```json
{
  "text": "你好，这是一段测试文本。",
  "model": "cosyvoice",
  "voice": "中文女",
  "speed": 1.0,
  "referenceAudio": null,
  "emotion": null,
  "language": null
}
```

**参数说明**:
- `text` (必需): 要合成的文本
- `model` (必需): 模型 ID
- `voice` (必需): 语音 ID
- `speed` (可选): 语速，默认 1.0，范围 0.5-2.0
- `referenceAudio` (可选): 参考音频文件路径（用于声音克隆）
- `emotion` (可选): 情感类型（仅 CosyVoice Instruct 模式支持）
  - `happy`: 开心
  - `sad`: 悲伤
  - `angry`: 愤怒
  - `surprised`: 惊讶
  - `neutral`: 中性（默认）
- `language` (可选): 语言代码（仅 Coqui XTTS-v2 支持，如 `en`, `zh-cn`, `ja`）

**响应**:
- 成功: 返回音频文件（MP3 或 WAV 格式）
- 失败: 返回 JSON 错误信息

**cURL 示例**:
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

**Python 示例**:
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

**JavaScript 示例**:
```javascript
const response = await fetch('http://localhost:5050/api/tts/synthesize', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'  // 如果设置了 API_KEY
  },
  body: JSON.stringify({
    text: '你好，世界！',
    model: 'cosyvoice',
    voice: '中文女',
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
} else {
  const error = await response.json();
  console.error('错误:', error);
}
```

## 模型安装指南

### Edge-TTS

无需安装，已包含在 `requirements.txt` 中。

### Qwen-TTS

1. 获取 API Key：访问 [阿里云 DashScope](https://dashscope.console.aliyun.com/)
2. 在 `.env` 文件中设置：
   ```env
   QWEN_API_KEY=your-api-key
   ```

### IndexTTS2

```bash
# 下载模型
python3 scripts/download-indextts2.py models/indextts2

# 或手动下载到 models/indextts2/ 目录
```

### CosyVoice

#### 方式 1：使用脚本下载（推荐）

```bash
python3 scripts/download-cosyvoice.py models/cosyvoice
```

#### 方式 2：手动安装

1. 将模型文件复制到 `models/cosyvoice/pretrained_models/` 目录
2. 将 `cosyvoice-source` 目录复制到 `models/cosyvoice/` 目录

#### 声音克隆

将参考音频文件（`.wav`, `.mp3` 等）和对应的文本文件（`.txt`）放置到：
```
models/cosyvoice/reference_audio/
```

例如：
- `models/cosyvoice/reference_audio/魔嘉嘉.mp3`
- `models/cosyvoice/reference_audio/魔嘉嘉.txt`

文本文件应包含音频对应的文字内容。

### MultiTTS

```bash
# 使用脚本下载
python3 scripts/download-multitts.py models/multitts

# 或使用 pip 安装
pip install multi-tts
```

### Coqui XTTS-v2

```bash
# 安装 TTS 库
pip install TTS

# 模型文件会自动下载到 models/coqui/ 目录
```

## 声音克隆使用指南

### CosyVoice 声音克隆

CosyVoice 支持两种声音克隆模式：

#### 1. Zero-shot 模式（推荐）

需要参考音频和对应的文本：

```json
{
  "text": "要合成的文本",
  "model": "cosyvoice",
  "voice": "cosyvoice-魔嘉嘉",
  "referenceAudio": "/path/to/reference_audio.mp3"
}
```

#### 2. Cross-lingual 模式

只需要参考音频（无需文本）：

```json
{
  "text": "要合成的文本",
  "model": "cosyvoice",
  "voice": "cosyvoice-魔嘉嘉",
  "referenceAudio": "/path/to/reference_audio.mp3"
}
```

### IndexTTS2 声音克隆

```json
{
  "text": "要合成的文本",
  "model": "indextts2",
  "voice": "indextts2-custom-voice-name",
  "referenceAudio": "/path/to/reference_audio.wav"
}
```

### Coqui XTTS-v2 声音克隆

```json
{
  "text": "要合成的文本",
  "model": "coqui",
  "voice": "coqui-custom-voice-name",
  "referenceAudio": "/path/to/reference_audio.wav",
  "language": "zh-cn"
}
```

## 情感控制（CosyVoice）

CosyVoice 支持情感控制，使用 Instruct 模式：

```json
{
  "text": "要合成的文本",
  "model": "cosyvoice",
  "voice": "中文女",
  "emotion": "happy",
  "speed": 1.0
}
```

**支持的情感类型**:
- `happy`: 开心
- `sad`: 悲伤
- `angry`: 愤怒
- `surprised`: 惊讶
- `neutral`: 中性（默认）

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `5050` |
| `API_KEY` | API 认证密钥 | 无（可选） |
| `TEMP_DIR` | 临时文件目录 | `./temp` |
| `MODELS_DIR` | 模型文件目录 | `./models` |
| `FFMPEG_BIN` | FFmpeg 可执行文件路径 | `ffmpeg` |
| `QWEN_API_KEY` | Qwen-TTS API Key | 无 |
| `INDEXTTS2_PATH` | IndexTTS2 模型路径 | `./models/indextts2/index-tts` |

### Docker 环境变量

在 `docker-compose.yml` 中可以设置：

```yaml
environment:
  - PORT=5050
  - API_KEY=${API_KEY:-}
  - MODELS_DIR=/app/models
  - TEMP_DIR=/app/temp
  - AUTO_INSTALL_INDEXTTS2=true
  - AUTO_INSTALL_COSYVOICE=true
```

## 故障排除

### 1. 服务无法启动

- 检查端口 5050 是否被占用
- 查看日志：`docker logs readknow-tts-api`
- 检查环境变量配置

### 2. 模型不可用

- 检查模型文件是否已下载
- 查看模型目录结构是否正确
- 运行 `python check-models.py` 检查模型状态

### 3. 声音克隆失败

- 确保参考音频文件存在且格式正确
- 检查音频文件路径是否正确
- 对于 CosyVoice，确保有对应的文本文件（Zero-shot 模式）

### 4. 依赖问题

- 确保已安装所有依赖：`pip install -r requirements.txt`
- 检查 Python 版本（推荐 3.11+）
- 对于 Windows，可能需要安装 Visual C++ 运行库

## 开发指南

### 项目结构

```
tts-api/
├── app/
│   ├── main.py              # FastAPI 应用入口
│   ├── routes/              # API 路由
│   │   ├── tts.py           # TTS API 端点
│   │   └── download.py      # 模型下载端点
│   ├── models/              # TTS 模型实现
│   │   ├── edge_tts.py
│   │   ├── cosyvoice.py
│   │   ├── indextts2.py
│   │   └── ...
│   └── utils/               # 工具函数
├── models/                   # 模型文件目录
├── temp/                     # 临时文件目录
├── static/                   # 静态文件（测试页面）
├── scripts/                  # 安装脚本
├── docker-compose.yml        # Docker 配置
├── Dockerfile               # Docker 镜像定义
└── requirements.txt         # Python 依赖
```

### 添加新的 TTS 引擎

1. 在 `app/models/` 目录创建新的模型文件
2. 实现以下函数：
   - `check_xxx_available()`: 检查模型是否可用
   - `get_xxx_voices()`: 获取语音列表
   - `synthesize_with_xxx()`: 执行语音合成
3. 在 `app/routes/tts.py` 中注册新模型

## 许可证

本项目采用 MIT 许可证。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关链接

- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [Edge-TTS](https://github.com/rany2/edge-tts)
- [CosyVoice](https://github.com/FunAudioLLM/CosyVoice)
- [IndexTTS2](https://github.com/IndexTTS/IndexTTS2)
- [Coqui TTS](https://github.com/coqui-ai/TTS)

