@echo off
REM ============================================
REM ReadKnows Docker 网络清理脚本 (Windows)
REM ============================================

echo 🧹 清理 ReadKnows Docker 网络...
echo.

REM 检查是否有活动的容器
echo 检查活动容器...
for /f "tokens=*" %%i in ('docker ps -a --filter "network=sh_readknows-network" --format "{{.Names}}" 2^>nul') do (
    echo 发现容器: %%i
    echo 停止容器: %%i
    docker stop %%i 2>nul
    echo 移除容器: %%i
    docker rm %%i 2>nul
)

echo.

REM 尝试移除网络
echo 移除网络 sh_readknows-network...
docker network rm sh_readknows-network 2>nul
if %errorlevel% equ 0 (
    echo ✓ 网络已移除
) else (
    echo ❌ 网络移除失败，可能仍有容器在使用
    echo.
    echo 提示: 请手动检查并停止相关容器
    echo.
    echo 检查命令:
    echo   docker ps -a --filter "network=sh_readknows-network"
    echo   docker network inspect sh_readknows-network
)

echo.
echo ✅ 清理完成！
pause

