#!/bin/bash

# 修复 Calibre 缓存目录路径问题
# 确保所有必要的缓存目录存在

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}修复 Calibre 缓存目录...${NC}"

# 读取环境变量 READKNOWS_DATA_DIR（如果设置）
DATA_DIR="${READKNOWS_DATA_DIR:-/volume5/docker/ReadKnows}"

# 需要创建的目录
CACHE_DIRS=(
    "$DATA_DIR/cache/calibre"
    "/volume5/docker/ReadKnows/cache/calibre"
    "/Users/ttbye/ReadKnows/cache/calibre"
    "D:/docker/ReadKnows/cache/calibre"
)

# 创建目录
for dir in "${CACHE_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        echo -e "${YELLOW}创建目录: $dir${NC}"
        mkdir -p "$dir" 2>/dev/null && echo -e "${GREEN}  ✅ 成功${NC}" || echo -e "${RED}  ❌ 失败（可能需要权限）${NC}"
    else
        echo -e "${GREEN}目录已存在: $dir${NC}"
    fi
done

echo -e "${GREEN}完成！${NC}"
