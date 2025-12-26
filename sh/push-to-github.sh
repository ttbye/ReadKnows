#!/bin/bash

# 一键更新代码到 GitHub
# 使用方法: ./push-to-github.sh [提交信息]
# 例如: ./push-to-github.sh "修复OPDS功能"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 切换到项目根目录
cd "$PROJECT_DIR" || exit 1

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  📤 一键更新代码到 GitHub${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查是否在 git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ 错误: 当前目录不是 git 仓库${NC}"
    exit 1
fi

# 检查是否有远程仓库
if ! git remote | grep -q "origin"; then
    echo -e "${RED}❌ 错误: 未找到远程仓库 'origin'${NC}"
    exit 1
fi

# 获取远程仓库 URL
REMOTE_URL=$(git remote get-url origin)
echo -e "${YELLOW}📍 远程仓库: ${REMOTE_URL}${NC}"
echo ""

# 检查是否有未提交的更改
if git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}ℹ️  没有未提交的更改${NC}"
    
    # 检查是否有未推送的提交
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse @{u} 2>/dev/null)
    BASE=$(git merge-base @ @{u} 2>/dev/null)
    
    if [ -z "$REMOTE" ] || [ -z "$BASE" ]; then
        echo -e "${YELLOW}ℹ️  无法检查远程分支状态，可能没有设置上游分支${NC}"
        echo -e "${YELLOW}💡 提示: 使用 'git push -u origin <branch>' 设置上游分支${NC}"
        exit 0
    fi
    
    if [ "$LOCAL" = "$REMOTE" ]; then
        echo -e "${GREEN}✅ 所有更改已推送到远程仓库${NC}"
        exit 0
    elif [ "$LOCAL" = "$BASE" ]; then
        echo -e "${YELLOW}ℹ️  本地分支落后于远程分支，建议先拉取: git pull${NC}"
        exit 0
    else
        echo -e "${YELLOW}ℹ️  有未推送的提交，正在推送...${NC}"
        git push origin HEAD
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ 推送成功！${NC}"
        else
            echo -e "${RED}❌ 推送失败${NC}"
            exit 1
        fi
        exit 0
    fi
fi

# 显示当前更改状态
echo -e "${YELLOW}📋 当前更改状态:${NC}"
git status --short
echo ""

# 获取提交信息
if [ -z "$1" ]; then
    # 如果没有提供提交信息，生成默认信息
    COMMIT_MSG="更新代码: $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${YELLOW}💡 未提供提交信息，使用默认信息: ${COMMIT_MSG}${NC}"
else
    COMMIT_MSG="$1"
fi

echo ""
echo -e "${YELLOW}📝 提交信息: ${COMMIT_MSG}${NC}"
echo ""

# 确认是否继续
read -p "是否继续提交并推送? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ 已取消${NC}"
    exit 0
fi

# 添加所有更改
echo -e "${BLUE}📦 添加所有更改...${NC}"
git add -A

# 检查是否有文件被添加
if git diff --cached --quiet; then
    echo -e "${YELLOW}ℹ️  没有需要提交的文件${NC}"
    exit 0
fi

# 提交更改
echo -e "${BLUE}💾 提交更改...${NC}"
git commit -m "$COMMIT_MSG"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 提交失败${NC}"
    exit 1
fi

# 获取当前分支
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${BLUE}🌿 当前分支: ${CURRENT_BRANCH}${NC}"

# 推送更改
echo -e "${BLUE}📤 推送到远程仓库...${NC}"
git push origin "$CURRENT_BRANCH"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  ✅ 更新成功！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${GREEN}📊 提交信息: ${COMMIT_MSG}${NC}"
    echo -e "${GREEN}🌿 分支: ${CURRENT_BRANCH}${NC}"
    echo -e "${GREEN}🔗 仓库: ${REMOTE_URL}${NC}"
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  ❌ 推送失败${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo -e "${YELLOW}💡 提示:${NC}"
    echo -e "${YELLOW}  1. 检查网络连接${NC}"
    echo -e "${YELLOW}  2. 检查是否有权限推送到远程仓库${NC}"
    echo -e "${YELLOW}  3. 如果远程有新的提交，先执行: git pull${NC}"
    exit 1
fi

