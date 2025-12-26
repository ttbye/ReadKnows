FROM python:3.11-slim

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    git-lfs \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 初始化 Git LFS
RUN git lfs install

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制源代码
COPY . .

# 创建必要的目录
RUN mkdir -p /app/models /app/temp /app/static && \
    mkdir -p /app/models/{indextts2,cosyvoice,multitts,coqui}/reference_audio

# 生成版本号
RUN python3 -m app.utils.version || echo "版本号生成失败，使用默认版本"

# 复制启动脚本和预下载脚本
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY pre-download-huggingface-models.sh /app/pre-download-huggingface-models.sh
RUN chmod +x /app/docker-entrypoint.sh /app/pre-download-huggingface-models.sh

# 暴露端口
EXPOSE 5050

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5050/health || exit 1

# 使用启动脚本
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5050"]

