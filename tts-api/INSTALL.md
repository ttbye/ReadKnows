# TTS API 安装指南

本文档详细说明 TTS API 的安装和配置方法。

## 目录

- [系统要求](#系统要求)
- [Docker 安装](#docker-安装)
- [本地安装](#本地安装)
- [模型安装](#模型安装)
- [配置说明](#配置说明)
- [验证安装](#验证安装)
- [故障排除](#故障排除)

## 系统要求

### 最低要求

- **操作系统**: Linux, macOS, Windows
- **Python**: 3.11 或更高版本
- **内存**: 4GB RAM（推荐 8GB+）
- **磁盘空间**: 至少 10GB（用于模型文件）
- **网络**: 用于下载模型和在线服务

### 推荐配置

- **CPU**: 4 核或更多
- **内存**: 16GB RAM
- **GPU**: NVIDIA GPU（可选，用于加速）
- **磁盘空间**: 50GB+（包含所有模型）

## Docker 安装

### 方式一：使用 install.sh 脚本（推荐）

在项目根目录运行：

```bash
./install.sh
```

选择选项 `6) 安装 TTS API 服务 (Docker)`

### 方式二：手动 Docker 安装

#### 1. 克隆或下载项目

```bash
cd tts-api
```

#### 2. 选择 docker-compose 文件

根据你的平台选择对应的配置文件：

- **Linux**: `docker-compose-linux.yml`
- **macOS**: `docker-compose-macos.yml`
- **Windows**: `docker-compose-windows.yml`
- **Synology NAS**: `docker-compose-synology.yml`
- **通用**: `docker-compose.yml`

#### 3. 配置环境变量

创建 `.env` 文件（可选）：

```env
API_KEY=your-api-key-here
QWEN_API_KEY=your-qwen-api-key
```

#### 4. 启动服务

```bash
# 使用平台特定的配置文件
docker-compose -f docker-compose-linux.yml up -d

# 或使用通用配置
docker-compose up -d
```

#### 5. 查看日志

```bash
docker logs -f readknow-tts-api
```

#### 6. 停止服务

```bash
docker stop readknow-tts-api
docker rm readknow-tts-api
```

### Docker 配置说明

#### 端口映射

默认端口 `5050`，可在 `docker-compose.yml` 中修改：

```yaml
ports:
  - "5050:5050"
```

#### 数据卷

模型和临时文件目录：

```yaml
volumes:
  - ./models:/app/models
  - ./temp:/app/temp
```

#### 环境变量

```yaml
environment:
  - PORT=5050
  - API_KEY=${API_KEY:-}
  - MODELS_DIR=/app/models
  - TEMP_DIR=/app/temp
  - AUTO_INSTALL_INDEXTTS2=true
  - AUTO_INSTALL_COSYVOICE=true
```

## 本地安装

### 1. 安装 Python 依赖

```bash
cd tts-api
pip install -r requirements.txt
```

### 2. 安装系统依赖

#### Linux

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y ffmpeg git git-lfs

# CentOS/RHEL
sudo yum install -y ffmpeg git git-lfs
```

#### macOS

```bash
brew install ffmpeg git git-lfs
```

#### Windows

1. 下载并安装 [FFmpeg](https://ffmpeg.org/download.html)
2. 下载并安装 [Git](https://git-scm.com/download/win)
3. 下载并安装 [Git LFS](https://git-lfs.github.com/)

### 3. 配置环境变量

创建 `.env` 文件：

```env
# 服务配置
PORT=5050
API_KEY=your-api-key-here

# 目录配置
TEMP_DIR=./temp
MODELS_DIR=./models

# Qwen-TTS 配置
QWEN_API_KEY=your-qwen-api-key
QWEN_TTS_API_URL=https://dashscope.aliyuncs.com/api/v1/services/audio/tts

# FFmpeg 配置
FFMPEG_BIN=ffmpeg

# IndexTTS2 配置
INDEXTTS2_PATH=./models/indextts2/index-tts
```

### 4. 启动服务

```bash
# 使用 uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 5050

# 或使用启动脚本
./start.sh
```

## 模型安装

### Edge-TTS

无需安装，已包含在 `requirements.txt` 中。

### Qwen-TTS

1. 访问 [阿里云 DashScope](https://dashscope.console.aliyun.com/)
2. 注册账号并获取 API Key
3. 在 `.env` 文件中设置：
   ```env
   QWEN_API_KEY=your-api-key
   ```

### IndexTTS2

#### 方式一：使用脚本（推荐）

```bash
python3 scripts/download-indextts2.py models/indextts2
```

#### 方式二：手动安装

1. 下载模型文件到 `models/indextts2/` 目录
2. 确保目录结构如下：
   ```
   models/indextts2/
   ├── index-tts/
   │   └── indextts/
   └── Qwen/
   ```

### CosyVoice

#### 方式一：使用脚本（推荐）

```bash
python3 scripts/download-cosyvoice.py models/cosyvoice
```

#### 方式二：手动安装

1. **下载模型文件**：
   - 将模型文件复制到 `models/cosyvoice/pretrained_models/` 目录
   - 支持的模型：
     - CosyVoice-300M
     - CosyVoice-300M-SFT
     - CosyVoice-300M-Instruct
     - CosyVoice-300M-25Hz
     - CosyVoice2-0.5B

2. **安装 CosyVoice 源码**：
   - 将 `cosyvoice-source` 目录复制到 `models/cosyvoice/` 目录
   - 或使用 pip 安装：
     ```bash
     pip install git+https://github.com/FunAudioLLM/CosyVoice.git
     ```

3. **配置声音克隆**（可选）：
   - 将参考音频文件（`.wav`, `.mp3` 等）放置到 `models/cosyvoice/reference_audio/` 目录
   - 为每个音频文件创建对应的文本文件（`.txt`），包含音频对应的文字内容
   - 例如：
     - `models/cosyvoice/reference_audio/魔嘉嘉.mp3`
     - `models/cosyvoice/reference_audio/魔嘉嘉.txt`

#### 目录结构

```
models/cosyvoice/
├── pretrained_models/
│   ├── CosyVoice-300M/
│   ├── CosyVoice-300M-SFT/
│   ├── CosyVoice-300M-Instruct/
│   └── ...
├── cosyvoice-source/  # 或通过 pip 安装
├── reference_audio/
│   ├── 魔嘉嘉.mp3
│   ├── 魔嘉嘉.txt
│   └── ...
└── third_party/
    ├── Matcha-TTS/
    └── AcademiCodec/
```

### MultiTTS

#### 方式一：使用脚本

```bash
python3 scripts/download-multitts.py models/multitts
```

#### 方式二：使用 pip

```bash
pip install multi-tts
```

### Coqui XTTS-v2

```bash
# 安装 TTS 库
pip install TTS

# 模型文件会自动下载到 models/coqui/ 目录
```

## 配置说明

### 环境变量详解

| 变量名 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `PORT` | 服务端口 | `5050` | 否 |
| `API_KEY` | API 认证密钥 | 无 | 否 |
| `TEMP_DIR` | 临时文件目录 | `./temp` | 否 |
| `MODELS_DIR` | 模型文件目录 | `./models` | 否 |
| `FFMPEG_BIN` | FFmpeg 可执行文件路径 | `ffmpeg` | 否 |
| `QWEN_API_KEY` | Qwen-TTS API Key | 无 | 是（使用 Qwen-TTS 时） |
| `QWEN_TTS_API_URL` | Qwen-TTS API URL | 默认 URL | 否 |
| `INDEXTTS2_PATH` | IndexTTS2 模型路径 | `./models/indextts2/index-tts` | 否 |
| `AUTO_INSTALL_INDEXTTS2` | 自动安装 IndexTTS2 | `true` | 否（Docker） |
| `AUTO_INSTALL_COSYVOICE` | 自动安装 CosyVoice | `true` | 否（Docker） |

### Docker 环境变量

在 `docker-compose.yml` 中设置：

```yaml
environment:
  - PORT=5050
  - API_KEY=${API_KEY:-}
  - MODELS_DIR=/app/models
  - TEMP_DIR=/app/temp
  - AUTO_INSTALL_INDEXTTS2=${AUTO_INSTALL_INDEXTTS2:-true}
  - AUTO_INSTALL_COSYVOICE=${AUTO_INSTALL_COSYVOICE:-true}
```

### 路径配置

#### Linux/macOS

```env
MODELS_DIR=/path/to/models
TEMP_DIR=/path/to/temp
```

#### Windows

```env
MODELS_DIR=D:\path\to\models
TEMP_DIR=D:\path\to\temp
```

## 验证安装

### 1. 检查服务状态

```bash
curl http://localhost:5050/health
```

预期响应：
```json
{
  "status": "ok"
}
```

### 2. 检查模型列表

```bash
curl http://localhost:5050/api/tts/models
```

### 3. 检查语音列表

```bash
curl "http://localhost:5050/api/tts/voices?model=cosyvoice"
```

### 4. 测试语音合成

```bash
curl -X POST "http://localhost:5050/api/tts/synthesize" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "测试",
    "model": "cosyvoice",
    "voice": "中文女"
  }' \
  --output test.mp3
```

### 5. 使用 Web 测试页面

打开浏览器访问：`http://localhost:5050/test`

## 故障排除

### 问题 1: 服务无法启动

**症状**: 端口被占用或启动失败

**解决方案**:
1. 检查端口是否被占用：
   ```bash
   # Linux/macOS
   lsof -i :5050
   
   # Windows
   netstat -ano | findstr :5050
   ```
2. 修改端口或停止占用端口的进程
3. 查看日志：
   ```bash
   docker logs readknow-tts-api
   ```

### 问题 2: 模型不可用

**症状**: API 返回模型不可用

**解决方案**:
1. 检查模型文件是否存在：
   ```bash
   ls -la models/cosyvoice/pretrained_models/
   ```
2. 运行模型检查脚本：
   ```bash
   python check-models.py
   ```
3. 查看详细模型状态：
   ```bash
   python check-models-detailed.py
   ```

### 问题 3: 依赖安装失败

**症状**: pip install 失败

**解决方案**:
1. 更新 pip：
   ```bash
   pip install --upgrade pip
   ```
2. 使用国内镜像源：
   ```bash
   pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
   ```
3. 检查 Python 版本（需要 3.11+）

### 问题 4: 声音克隆失败

**症状**: 返回错误 "无法确定合成模式"

**解决方案**:
1. 检查参考音频文件是否存在
2. 检查音频文件格式（支持 `.wav`, `.mp3` 等）
3. 对于 CosyVoice Zero-shot 模式，确保有对应的文本文件
4. 检查文件路径是否正确（Docker 中使用容器内路径）

### 问题 5: Docker 容器无法访问模型文件

**症状**: 模型文件找不到

**解决方案**:
1. 检查数据卷挂载：
   ```bash
   docker inspect readknow-tts-api | grep Mounts
   ```
2. 确保模型目录路径正确
3. 检查文件权限

### 问题 6: Windows 上的路径问题

**症状**: 路径相关错误

**解决方案**:
1. 使用正斜杠 `/` 或双反斜杠 `\\`
2. 使用绝对路径
3. 检查路径中的特殊字符

### 问题 7: 内存不足

**症状**: 服务崩溃或响应缓慢

**解决方案**:
1. 增加系统内存
2. 使用在线模型（Edge-TTS, Qwen-TTS）
3. 限制并发请求数量
4. 使用 Docker 限制内存：
   ```yaml
   deploy:
     resources:
       limits:
         memory: 8G
   ```

## 性能优化

### 1. 使用 GPU 加速

如果使用 NVIDIA GPU，可以配置 CUDA：

```bash
# 安装 CUDA 版本的 PyTorch
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### 2. 模型缓存

模型会在首次使用时加载到内存，后续请求会更快。

### 3. 并发处理

使用异步请求可以提高处理效率：

```python
import asyncio
import aiohttp

async def batch_synthesize(texts):
    async with aiohttp.ClientSession() as session:
        tasks = []
        for text in texts:
            task = session.post(url, json={"text": text, ...})
            tasks.append(task)
        results = await asyncio.gather(*tasks)
        return results
```

## 更新和维护

### 更新服务

```bash
# Docker
docker-compose pull
docker-compose up -d

# 本地
git pull
pip install -r requirements.txt --upgrade
```

### 清理临时文件

```bash
# 清理临时文件
rm -rf temp/*

# 清理 Docker 缓存
docker system prune -a
```

### 备份模型

```bash
# 备份模型目录
tar -czf models-backup.tar.gz models/
```

## 更多帮助

- [README.md](./README.md) - 项目说明
- [API.md](./API.md) - API 使用说明
- [GitHub Issues](https://github.com/your-repo/issues) - 问题反馈

