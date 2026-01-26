FROM python:3.11-slim

# 配置 apt 使用国内镜像源（阿里云）
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list 2>/dev/null || true

# 安装系统依赖
# 彻底解决 OpenGL 库问题：安装所有必要的库
# 添加构建工具以支持 PyMuPDF 编译（PaddleOCR 的可选依赖）
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgthread-2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    curl \
    build-essential \
    gcc \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY requirements.txt .

# 配置 pip 使用国内镜像源（清华源）
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip config set global.trusted-host pypi.tuna.tsinghua.edu.cn

# 升级 pip 和基础工具
RUN pip install --upgrade pip wheel setuptools

# 安装核心依赖（分步安装以确保稳定性）
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    python-multipart==0.0.6 \
    python-dotenv==1.0.0 \
    pydantic==2.5.0 \
    pydantic-settings==2.1.0 \
    setuptools>=65.0.0 \
    protobuf>=3.20.0 \
    Pillow>=10.0.0 \
    numpy>=1.24.0 \
    requests>=2.31.0

# 安装 OpenCV（使用 headless 版本，不需要 GUI）
RUN pip install --no-cache-dir opencv-python-headless>=4.8.0

# 安装 PaddlePaddle
# 默认安装 CPU 版本，如果需要在构建时支持 GPU，可以使用构建参数
# 例如: docker build --build-arg PADDLE_GPU=true
ARG PADDLE_GPU=false
RUN if [ "$PADDLE_GPU" = "true" ]; then \
        echo "安装 PaddlePaddle GPU 版本..." && \
        pip install --no-cache-dir "paddlepaddle-gpu>=2.5.0"; \
    else \
        echo "安装 PaddlePaddle CPU 版本..." && \
        pip install --no-cache-dir "paddlepaddle>=2.5.0"; \
    fi

# 安装 PaddleOCR（使用最新稳定版本）
# PyMuPDF 是可选依赖，如果编译失败不影响核心功能
RUN pip install --no-cache-dir "paddleocr>=2.7.0" 2>&1 | tee /tmp/paddleocr.log || \
    (echo "尝试安装 2.6.x 版本..." && \
     pip install --no-cache-dir "paddleocr>=2.6.1.3,<2.7.0" 2>&1 | tee -a /tmp/paddleocr.log || \
     (echo "安装失败，尝试跳过 PyMuPDF..." && \
      pip install --no-cache-dir "paddleocr>=2.6.1.3,<2.7.0" --no-deps && \
      pip install --no-cache-dir scikit-image shapely pyclipper lmdb rapidfuzz opencv-python==4.6.0.66 cython lxml premailer openpyxl attrdict beautifulsoup4 fonttools fire pdf2docx python-docx visualdl || true))

# 验证安装（设置环境变量避免 OpenGL 错误）
RUN LD_LIBRARY_PATH=/usr/lib/aarch64-linux-gnu:/usr/lib/x86_64-linux-gnu:/usr/lib:$LD_LIBRARY_PATH \
    python -c "import os; os.environ['LD_LIBRARY_PATH'] = '/usr/lib/aarch64-linux-gnu:/usr/lib/x86_64-linux-gnu:/usr/lib:' + os.environ.get('LD_LIBRARY_PATH', ''); import paddleocr; print('PaddleOCR installed successfully')" || \
    echo "WARNING: PaddleOCR import test failed, but package is installed. Will check at runtime."

# 复制源代码
COPY . .

# 创建必要的目录（包括模型目录）
RUN mkdir -p /app/temp /app/static /app/models

# 复制模型管理脚本
COPY init-models.sh download_models.py ./
RUN chmod +x init-models.sh download_models.py

# 设置模型目录环境变量（可以在 docker-compose 中覆盖）
ENV OCR_MODELS_DIR=/app/models
ENV PADDLEX_HOME=/app/models

# 设置环境变量
ENV LD_LIBRARY_PATH=/usr/lib/aarch64-linux-gnu:/usr/lib/x86_64-linux-gnu:/usr/lib:$LD_LIBRARY_PATH
ENV PYTHONUNBUFFERED=1

# 暴露端口
EXPOSE 5080

# 健康检查（使用环境变量PORT或默认5080）
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-5080}/health || exit 1

# 启动命令（使用环境变量PORT或默认5080）
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-5080}"]
