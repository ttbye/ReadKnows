# TTS-API-Lite

轻量级 TTS（文本转语音）API 服务，仅支持在线 TTS 引擎。

## ✨ 特性

- 🚀 **轻量级**：不包含 PyTorch、TensorFlow 等重型依赖，镜像体积小
- ⚡ **快速启动**：无需下载模型文件，启动即用
- 🌐 **在线服务**：支持 Edge-TTS 和 Qwen-TTS 在线服务
- 🔒 **API Key 验证**：可选的身份验证机制
- 📦 **Docker 支持**：提供 Docker 镜像，一键部署
- 🎯 **简单易用**：清晰的 API 接口和测试页面

## 📋 支持的 TTS 引擎

### 1. Edge-TTS（微软）
- **类型**：在线服务
- **特点**：高质量多语言支持，免费使用
- **语言**：支持 100+ 种语言和方言
- **安装**：无需额外配置，已包含在依赖中

### 2. Qwen-TTS（阿里云）
- **类型**：在线服务
- **特点**：高质量中文语音合成
- **语言**：中文（简体）
- **安装**：需要设置 `QWEN_API_KEY` 环境变量

## 🚀 快速开始

### 方式一：Docker（推荐）

```bash
# 1. 克隆或下载项目
cd TTS-API-Lite

# 2. 创建 .env 文件（可选）
cp .env.example .env
# 编辑 .env 文件，设置 API_KEY 和 QWEN_API_KEY（如需要）

# 3. 启动服务
docker-compose up -d

# 4. 访问测试页面
# http://localhost:5050/test
```

### 方式二：本地运行

```bash
# 1. 安装 Python 3.11+
# 2. 安装依赖
pip install -r requirements.txt

# 3. 创建 .env 文件（可选）
cp .env.example .env

# 4. 启动服务
python -m uvicorn app.main:app --host 0.0.0.0 --port 5050

# 5. 访问测试页面
# http://localhost:5050/test
```

## 📖 API 文档

### 获取模型列表

```bash
GET /api/tts/models
```

响应示例：
```json
{
  "models": [
    {
      "id": "edge-tts",
      "name": "Edge-TTS",
      "type": "online",
      "available": true,
      "description": "微软 Edge-TTS 在线服务，高质量多语言支持"
    },
    {
      "id": "qwen-tts",
      "name": "Qwen-TTS",
      "type": "online",
      "available": true,
      "description": "阿里云 Qwen-TTS 在线服务"
    }
  ]
}
```

### 获取语音列表

```bash
GET /api/tts/voices?model=edge-tts
```

响应示例：
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
    }
  ]
}
```

### 合成语音

```bash
POST /api/tts/synthesize
Content-Type: application/json

{
  "text": "你好，这是一个测试。",
  "model": "edge-tts",
  "voice": "zh-CN-XiaoxiaoNeural",
  "speed": 1.0
}
```

响应：返回音频文件（MP3 或 WAV）

## 🔧 配置

### 环境变量

| 变量名 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `PORT` | 服务端口 | `5050` | 否 |
| `API_KEY` | API Key（启用验证） | - | 否 |
| `QWEN_API_KEY` | Qwen-TTS API Key | - | 否（使用 Qwen-TTS 时必需） |
| `TEMP_DIR` | 临时文件目录 | `./temp` | 否 |
| `FFMPEG_BIN` | FFmpeg 路径 | `ffmpeg` | 否 |

### API Key 验证

如果设置了 `API_KEY` 环境变量，所有 API 请求都需要提供 API Key：

**方式 1：请求头**
```bash
X-API-Key: your-api-key
```

**方式 2：查询参数**
```bash
?apiKey=your-api-key
```

**方式 3：Authorization 头**
```bash
Authorization: Bearer your-api-key
```

## 📊 与完整版 TTS-API 的对比

| 特性 | TTS-API-Lite | TTS-API（完整版） |
|------|--------------|------------------|
| 镜像大小 | ~200MB | ~5GB+ |
| 启动时间 | < 5秒 | 30秒+ |
| 内存占用 | ~100MB | ~2GB+ |
| 支持的引擎 | Edge-TTS, Qwen-TTS | Edge-TTS, Qwen-TTS, CosyVoice, IndexTTS2, MultiTTS, Coqui |
| 模型下载 | 不需要 | 需要 |
| 离线支持 | ❌ | ✅ |
| 声音克隆 | ❌ | ✅ |
| 适用场景 | 生产环境、快速部署 | 开发、研究、离线使用 |

## 🐳 Docker 镜像

### 构建镜像

```bash
docker build -t ttbye/tts-api-lite:latest .
```

### 运行容器

```bash
docker run -d \
  --name tts-api-lite \
  -p 5050:5050 \
  -e API_KEY=your-api-key \
  -e QWEN_API_KEY=your-qwen-key \
  -v $(pwd)/temp:/app/temp \
  ttbye/tts-api-lite:latest
```

## 📝 使用示例

### Python

```python
import requests

# 合成语音
response = requests.post(
    'http://localhost:5050/api/tts/synthesize',
    json={
        'text': '你好，世界！',
        'model': 'edge-tts',
        'voice': 'zh-CN-XiaoxiaoNeural',
        'speed': 1.0
    },
    headers={'X-API-Key': 'your-api-key'}  # 如果启用了 API Key
)

# 保存音频文件
with open('output.mp3', 'wb') as f:
    f.write(response.content)
```

### cURL

```bash
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

### JavaScript

```javascript
const response = await fetch('http://localhost:5050/api/tts/synthesize', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    text: '你好，世界！',
    model: 'edge-tts',
    voice: 'zh-CN-XiaoxiaoNeural',
    speed: 1.0
  })
});

const blob = await response.blob();
const url = URL.createObjectURL(blob);
// 使用 audio 元素播放
```

## 🔍 健康检查

```bash
GET /health
```

响应：
```json
{
  "status": "ok",
  "version": "1.0.0-lite"
}
```

## 📚 API 文档

启动服务后，访问以下地址查看交互式 API 文档：

- Swagger UI: http://localhost:5050/docs
- ReDoc: http://localhost:5050/redoc

## 🛠️ 开发

### 本地开发

```bash
# 安装依赖
pip install -r requirements.txt

# 运行开发服务器（自动重载）
uvicorn app.main:app --reload --host 0.0.0.0 --port 5050
```

### 项目结构

```
TTS-API-Lite/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── middleware/          # 中间件
│   │   ├── __init__.py
│   │   └── auth.py          # API Key 验证
│   ├── models/              # TTS 模型
│   │   ├── __init__.py
│   │   ├── edge_tts.py     # Edge-TTS 实现
│   │   └── qwen_tts.py      # Qwen-TTS 实现
│   └── routes/              # API 路由
│       ├── __init__.py
│       └── tts.py           # TTS API 路由
├── static/                  # 静态文件
│   └── index.html          # 测试页面
├── temp/                   # 临时文件目录
├── .env.example            # 环境变量示例
├── .dockerignore           # Docker 忽略文件
├── Dockerfile              # Docker 镜像定义
├── docker-compose.yml      # Docker Compose 配置
├── requirements.txt        # Python 依赖
└── README.md              # 本文档
```

## ⚠️ 注意事项

1. **网络要求**：由于使用在线服务，需要稳定的网络连接
2. **API Key**：使用 Qwen-TTS 需要有效的 API Key
3. **临时文件**：生成的音频文件会保存在 `temp` 目录，建议定期清理
4. **FFmpeg**：如果需要 MP3 格式输出，需要安装 FFmpeg

## 📄 许可证

本项目遵循与主项目相同的许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

如有问题，请访问：
- 项目主页：https://github.com/your-repo/TTS-API-Lite
- 问题反馈：https://github.com/your-repo/TTS-API-Lite/issues

