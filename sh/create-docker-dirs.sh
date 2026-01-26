#!/bin/bash

# ============================================
# 自动创建 Docker 挂载目录
# ============================================

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 脚本目录（sh/）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${1:-docker-compose-Linux.yml}"

# 如果未指定文件，尝试根据环境选择
if [ ! -f "$SCRIPT_DIR/$COMPOSE_FILE" ]; then
    echo -e "${YELLOW}⚠️  文件 $COMPOSE_FILE 不存在，尝试其他文件...${NC}"
    # 尝试查找可用的 docker-compose 文件
    if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
        COMPOSE_FILE="docker-compose.yml"
    else
        echo -e "${RED}❌ 找不到 docker-compose 文件${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}📁 正在检查并创建 Docker 挂载目录...${NC}"
echo -e "${BLUE}使用配置文件: $COMPOSE_FILE${NC}"
echo ""

# 从 docker-compose 文件中提取 volumes 路径
# 匹配格式: - /path/to/dir:/container/path 或 - ${VAR:-default}/path:/container/path
create_dirs_from_compose() {
    local compose_file="$1"
    local created_count=0
    local skipped_count=0
    local error_count=0
    
    # 读取环境变量 READKNOWS_DATA_DIR（如果设置）
    local data_dir="${READKNOWS_DATA_DIR:-/volume5/docker/ReadKnows}"
    
    # 使用 grep 和 sed 提取 volumes 路径
    # 匹配以 - 开头，包含 : 的行（volume 配置）
    # 排除注释行和相对路径（如 ../cache）
    while IFS= read -r line; do
        # 移除注释和前后空格
        line=$(echo "$line" | sed 's/#.*$//' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
        
        # 跳过空行
        [ -z "$line" ] && continue
        
        # 检查是否是 volume 配置行（以 - 开头且包含 :）
        if [[ "$line" =~ ^-[[:space:]]+.*:.* ]]; then
            # 提取主机路径部分（冒号前的部分）
            host_path=$(echo "$line" | sed 's/^-[[:space:]]*//' | cut -d: -f1 | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
            
            # 跳过相对路径（以 ../ 或 ./ 开头）
            if [[ "$host_path" =~ ^\.\./ ]] || [[ "$host_path" =~ ^\./ ]]; then
                continue
            fi
            
            # 处理环境变量替换 ${VAR:-default}
            if [[ "$host_path" =~ \$\{.*\} ]]; then
                # 提取变量名和默认值
                if [[ "$host_path" =~ \$\{READKNOWS_DATA_DIR:-(.*)\} ]]; then
                    # 如果是 READKNOWS_DATA_DIR，使用环境变量或默认值
                    var_part="${BASH_REMATCH[0]}"
                    default_part="${BASH_REMATCH[1]}"
                    if [ -n "$READKNOWS_DATA_DIR" ]; then
                        host_path=$(echo "$host_path" | sed "s|\${READKNOWS_DATA_DIR:-$default_part}|$READKNOWS_DATA_DIR|")
                    else
                        host_path=$(echo "$host_path" | sed "s|\${READKNOWS_DATA_DIR:-$default_part}|$default_part|")
                    fi
                else
                    # 其他环境变量，使用 eval 替换（注意安全性）
                    host_path=$(eval echo "$host_path")
                fi
            fi
            
            # 只处理绝对路径
            if [[ "$host_path" =~ ^/ ]]; then
                # 检查目录是否存在
                if [ ! -d "$host_path" ]; then
                    echo -e "${YELLOW}📁 创建目录: $host_path${NC}"
                    if mkdir -p "$host_path" 2>/dev/null; then
                        echo -e "${GREEN}   ✅ 创建成功${NC}"
                        created_count=$((created_count + 1))
                    else
                        echo -e "${RED}   ❌ 创建失败（可能需要权限）${NC}"
                        error_count=$((error_count + 1))
                    fi
                else
                    skipped_count=$((skipped_count + 1))
                fi
            fi
        fi
    done < "$compose_file"
    
    echo ""
    if [ $created_count -gt 0 ]; then
        echo -e "${GREEN}✅ 成功创建 $created_count 个目录${NC}"
    fi
    if [ $skipped_count -gt 0 ]; then
        echo -e "${BLUE}ℹ️  跳过 $skipped_count 个已存在的目录${NC}"
    fi
    if [ $error_count -gt 0 ]; then
        echo -e "${RED}❌ $error_count 个目录创建失败${NC}"
        return 1
    fi
    return 0
}

# 手动定义需要创建的目录（更可靠的方法）
create_dirs_manual() {
    # 读取环境变量，如果没有设置则根据系统自动检测
    local data_dir="${READKNOWS_DATA_DIR}"
    
    # 如果未设置环境变量，根据系统和 compose 文件自动检测
    if [ -z "$data_dir" ]; then
        if [[ "$COMPOSE_FILE" == *"Linux"* ]] || [[ "$COMPOSE_FILE" == *"Synology"* ]] || [[ "$COMPOSE_FILE" == *"docker-compose.yml" ]]; then
            data_dir="/volume5/docker/ReadKnows"
        elif [[ "$COMPOSE_FILE" == *"MACOS"* ]]; then
            data_dir="/Users/ttbye/ReadKnows"
        elif [[ "$COMPOSE_FILE" == *"WINDOWS"* ]]; then
            data_dir="D:/docker/ReadKnows"
        elif [[ "$COMPOSE_FILE" == *"local"* ]]; then
            # 本地开发环境，使用项目根目录的相对路径
            SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
            data_dir="$PROJECT_ROOT"
        else
            # 默认使用 Linux 路径
            data_dir="/volume5/docker/ReadKnows"
        fi
    fi
    
    local created_count=0
    local skipped_count=0
    local error_count=0
    
    # 根据 compose 文件确定需要创建的目录
    local dirs=()
    
    if [[ "$COMPOSE_FILE" == *"local"* ]]; then
        # 本地开发环境，使用相对路径
        dirs=(
            "../data"
            "../data/books"
            "../data/covers"
            "../data/fonts"
            "../data/import"
            "../data/messages"
            "../data/cache/ocr"
            "../data/cache/tts"
            "../cache/calibre"
        )
    else
        # Linux/Synology/macOS/Windows 使用绝对路径
        # 注意：Calibre 缓存目录在 docker-compose 中使用的是 ${READKNOWS_DATA_DIR:-/volume5/docker/ReadKnows}/cache/calibre
        dirs=(
            "$data_dir/data"
            "$data_dir/data/books"
            "$data_dir/data/covers"
            "$data_dir/data/fonts"
            "$data_dir/data/import"
            "$data_dir/data/messages"
            "$data_dir/data/cache/ocr"
            "$data_dir/data/cache/tts"
            "$data_dir/cache/calibre"
        )
    fi
    
    for dir in "${dirs[@]}"; do
        if [ -n "$dir" ]; then
            # 如果是相对路径，转换为绝对路径
            if [[ "$dir" =~ ^\.\./ ]]; then
                # 相对路径，基于脚本目录
                dir="$(cd "$SCRIPT_DIR" && cd "$(dirname "$dir")" && pwd)/$(basename "$dir")"
            fi
            
            if [ ! -d "$dir" ]; then
                echo -e "${YELLOW}📁 创建目录: $dir${NC}"
                if mkdir -p "$dir" 2>/dev/null; then
                    echo -e "${GREEN}   ✅ 创建成功${NC}"
                    created_count=$((created_count + 1))
                else
                    # 检查是否是权限问题还是路径不存在
                    local parent_dir=$(dirname "$dir")
                    if [ ! -d "$parent_dir" ]; then
                        echo -e "${RED}   ❌ 父目录不存在: $parent_dir${NC}"
                        echo -e "${YELLOW}   提示: 请先创建父目录或设置 READKNOWS_DATA_DIR 环境变量${NC}"
                        error_count=$((error_count + 1))
                    else
                        echo -e "${RED}   ❌ 创建失败（可能需要 sudo 权限）${NC}"
                        echo -e "${YELLOW}   尝试使用 sudo...${NC}"
                        if sudo mkdir -p "$dir" 2>/dev/null; then
                            echo -e "${GREEN}   ✅ 使用 sudo 创建成功${NC}"
                            created_count=$((created_count + 1))
                        else
                            error_count=$((error_count + 1))
                        fi
                    fi
                fi
            else
                skipped_count=$((skipped_count + 1))
            fi
        fi
    done
    
    echo ""
    if [ $created_count -gt 0 ]; then
        echo -e "${GREEN}✅ 成功创建 $created_count 个目录${NC}"
    fi
    if [ $skipped_count -gt 0 ]; then
        echo -e "${BLUE}ℹ️  跳过 $skipped_count 个已存在的目录${NC}"
    fi
    if [ $error_count -gt 0 ]; then
        echo -e "${RED}❌ $error_count 个目录创建失败${NC}"
        return 1
    fi
    return 0
}

# 执行目录创建
cd "$SCRIPT_DIR" || exit 1

# 使用手动方法（更可靠）
create_dirs_manual

exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ 目录检查完成${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ 部分目录创建失败${NC}"
    echo -e "${RED}请检查权限或手动创建目录${NC}"
    echo -e "${RED}========================================${NC}"
fi

exit $exit_code
