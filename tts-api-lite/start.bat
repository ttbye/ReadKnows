@echo off
REM TTS-API-Lite Windows 启动脚本

echo ==========================================
echo TTS-API-Lite 启动脚本
echo ==========================================

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] Python 未安装，请先安装 Python 3.11+
    pause
    exit /b 1
)

echo [信息] Python 版本:
python --version

REM 检查虚拟环境
if not exist "venv" (
    echo [信息] 创建虚拟环境...
    python -m venv venv
)

echo [信息] 激活虚拟环境...
call venv\Scripts\activate.bat

echo [信息] 安装依赖...
python -m pip install -q --upgrade pip
python -m pip install -q -r requirements.txt

REM 创建必要的目录
if not exist "temp" mkdir temp
if not exist "static" mkdir static

REM 检查 .env 文件
if not exist ".env" (
    echo [警告] 未找到 .env 文件，使用默认配置
    echo [提示] 可以复制 .env.example 到 .env 并修改配置
)

REM 设置环境变量
if "%PORT%"=="" set PORT=5050
if "%TEMP_DIR%"=="" set TEMP_DIR=./temp

echo.
echo ==========================================
echo 启动 TTS-API-Lite 服务
echo ==========================================
echo 端口: %PORT%
echo 临时目录: %TEMP_DIR%
echo.
echo 访问地址:
echo   - API 文档: http://localhost:%PORT%/docs
echo   - 测试页面: http://localhost:%PORT%/test
echo   - 健康检查: http://localhost:%PORT%/health
echo.
echo 按 Ctrl+C 停止服务
echo ==========================================
echo.

REM 启动服务
uvicorn app.main:app --host 0.0.0.0 --port %PORT%

pause

