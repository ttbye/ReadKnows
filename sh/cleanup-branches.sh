#!/bin/bash

# 清理分支脚本 - 仅保留 main 分支
# 使用方法: ./sh/cleanup-branches.sh

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
echo -e "${BLUE}  🧹 清理分支 - 仅保留 main${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查是否在 git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ 错误: 当前目录不是 git 仓库${NC}"
    exit 1
fi

# 确保在 main 分支
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${YELLOW}⚠️  当前不在 main 分支，正在切换到 main...${NC}"
    git checkout main || exit 1
fi

echo -e "${YELLOW}📋 当前分支状态:${NC}"
echo ""

# 显示本地分支
echo -e "${BLUE}本地分支:${NC}"
LOCAL_BRANCHES=$(git branch | grep -v "^\*" | sed 's/^[ ]*//' | grep -v "^main$")
if [ -z "$LOCAL_BRANCHES" ]; then
    echo -e "${GREEN}  ✅ 只有 main 分支，无需清理${NC}"
else
    echo "$LOCAL_BRANCHES" | while read -r branch; do
        echo -e "  - ${branch}"
    done
fi

echo ""

# 显示远程分支
echo -e "${BLUE}远程分支:${NC}"
REMOTE_BRANCHES=$(git branch -r | grep -v "origin/HEAD" | grep -v "origin/main" | sed 's|origin/||' | sed 's/^[ ]*//')
if [ -z "$REMOTE_BRANCHES" ]; then
    echo -e "${GREEN}  ✅ 只有 main 分支，无需清理${NC}"
else
    echo "$REMOTE_BRANCHES" | while read -r branch; do
        echo -e "  - ${branch}"
    done
fi

echo ""

# 检查是否有需要删除的分支
if [ -z "$LOCAL_BRANCHES" ] && [ -z "$REMOTE_BRANCHES" ]; then
    echo -e "${GREEN}✅ 当前只有 main 分支，无需删除其他分支${NC}"
    exit 0
fi

# 确认删除
echo -e "${YELLOW}⚠️  警告: 将删除除 main 之外的所有分支${NC}"
read -p "是否继续? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ 已取消${NC}"
    exit 0
fi

# 删除本地分支
if [ -n "$LOCAL_BRANCHES" ]; then
    echo ""
    echo -e "${BLUE}🗑️  删除本地分支...${NC}"
    echo "$LOCAL_BRANCHES" | while read -r branch; do
        if [ -n "$branch" ]; then
            echo -e "  删除: ${branch}"
            git branch -D "$branch" 2>/dev/null || echo -e "  ${YELLOW}⚠️  无法删除 ${branch}（可能未合并）${NC}"
        fi
    done
fi

# 删除远程分支
if [ -n "$REMOTE_BRANCHES" ]; then
    echo ""
    echo -e "${BLUE}🗑️  删除远程分支...${NC}"
    echo "$REMOTE_BRANCHES" | while read -r branch; do
        if [ -n "$branch" ]; then
            echo -e "  删除: origin/${branch}"
            git push origin --delete "$branch" 2>/dev/null || echo -e "  ${YELLOW}⚠️  无法删除 origin/${branch}${NC}"
        fi
    done
fi

# 清理远程跟踪分支
echo ""
echo -e "${BLUE}🧹 清理远程跟踪分支引用...${NC}"
git fetch --prune

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ 清理完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}当前分支:${NC}"
git branch -a

