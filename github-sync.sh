#!/bin/bash

# ===========================================
# GitHub 同步管理脚本 - 功能强大版
# 适用于 ReadKnows 项目
# ===========================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR" && pwd)"
DEFAULT_BRANCH="main"
REMOTE_NAME="origin"

# 日志函数
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

# 显示帮助信息
show_help() {
    cat << EOF
===================================================
    GitHub 同步管理脚本 - 功能强大版
===================================================

用法: $0 [命令] [选项]

命令:
    status          显示当前git状态
    add [文件]      添加文件到暂存区 (不指定文件则添加所有)
    commit [消息]   提交更改 (需要提交消息)
    push            推送到GitHub
    pull            从GitHub拉取最新更改
    sync            完整同步流程 (add + commit + push)
    fetch           获取远程分支信息
    branch          分支管理
    merge [分支]    合并分支
    rebase [分支]   变基操作
    reset           重置工作目录
    clean           清理未跟踪文件
    log [数量]      显示提交历史
    diff            显示更改差异
    stash           储藏更改
    unstash         恢复储藏
    tag [标签]      创建标签
    remote          远程仓库管理
    config          Git配置管理

选项:
    -m, --message   提交消息
    -f, --force     强制操作
    -b, --branch    指定分支
    -r, --remote    指定远程仓库
    -h, --help      显示帮助信息

示例:
    $0 status                           # 查看状态
    $0 add                              # 添加所有更改
    $0 commit "修复bug"                 # 提交更改
    $0 push                             # 推送到GitHub
    $0 sync "更新功能"                  # 完整同步
    $0 pull                             # 拉取最新更改
    $0 branch -b feature/new-feature    # 创建分支
    $0 merge develop                    # 合并develop分支
    $0 reset --hard                     # 硬重置
    $0 log 10                           # 显示10条提交记录

===================================================
EOF
}

# 检查git仓库状态
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        error "当前目录不是git仓库: $PROJECT_DIR"
        exit 1
    fi

    log "Git仓库检查通过"
}

# 获取当前分支
get_current_branch() {
    git rev-parse --abbrev-ref HEAD
}

# 检查是否有未提交的更改
has_uncommitted_changes() {
    ! git diff --quiet || ! git diff --staged --quiet
}

# 显示git状态
show_status() {
    log "当前分支: $(get_current_branch)"
    echo

    # 显示状态
    echo "📊 Git状态:"
    echo "----------------------------------------"
    git status --porcelain
    echo

    # 显示最近提交
    echo "📝 最近提交:"
    echo "----------------------------------------"
    git log --oneline -5
    echo

    # 显示分支信息
    echo "🌿 分支信息:"
    echo "----------------------------------------"
    git branch -v
    echo

    # 显示远程信息
    echo "🌐 远程仓库:"
    echo "----------------------------------------"
    git remote -v
}

# 添加文件到暂存区
add_files() {
    local files="$1"

    if [ -z "$files" ]; then
        info "添加所有更改到暂存区..."
        git add .
    else
        info "添加指定文件到暂存区: $files"
        # shellcheck disable=SC2086
        git add $files
    fi

    success "文件已添加到暂存区"
}

# 提交更改
commit_changes() {
    local message="$1"
    local force="$2"

    if [ -z "$message" ]; then
        error "提交消息不能为空"
        exit 1
    fi

    if ! has_uncommitted_changes; then
        warn "没有需要提交的更改"
        return
    fi

    info "提交更改..."

    if [ "$force" = "true" ]; then
        git commit -m "$message" --allow-empty
    else
        git commit -m "$message"
    fi

    success "更改已提交: $message"
}

# 推送更改
push_changes() {
    local branch="$1"
    local remote="$2"
    local force="$3"

    if [ -z "$branch" ]; then
        branch=$(get_current_branch)
    fi

    if [ -z "$remote" ]; then
        remote="$REMOTE_NAME"
    fi

    info "推送分支 '$branch' 到远程 '$remote'..."

    # 检查远程分支是否存在
    if ! git ls-remote --heads "$remote" "$branch" > /dev/null 2>&1; then
        info "远程分支不存在，正在推送并设置上游..."
        git push -u "$remote" "$branch"
    else
        if [ "$force" = "true" ]; then
            warn "使用强制推送..."
            git push -f "$remote" "$branch"
        else
            git push "$remote" "$branch"
        fi
    fi

    success "推送完成"
}

# 拉取更改
pull_changes() {
    local remote="$1"
    local branch="$2"

    if [ -z "$remote" ]; then
        remote="$REMOTE_NAME"
    fi

    if [ -z "$branch" ]; then
        branch=$(get_current_branch)
    fi

    info "从远程 '$remote' 拉取分支 '$branch'..."

    # 检查是否有未提交的更改
    if has_uncommitted_changes; then
        warn "工作目录有未提交的更改，请先提交或储藏"
        read -p "是否要储藏更改? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git stash
            success "更改已储藏"
        else
            error "请先处理未提交的更改"
            exit 1
        fi
    fi

    git pull "$remote" "$branch"
    success "拉取完成"
}

# 完整同步流程
sync_all() {
    local message="$1"
    local force="$2"

    if [ -z "$message" ]; then
        message="自动同步 $(date +'%Y-%m-%d %H:%M:%S')"
    fi

    info "开始完整同步流程..."

    # 检查状态
    if ! has_uncommitted_changes; then
        info "没有需要同步的更改"

        # 即使没有更改也尝试推送（可能有新的提交）
        push_changes "" "" "$force"
        return
    fi

    # 添加更改
    add_files ""

    # 提交更改
    commit_changes "$message" "$force"

    # 推送更改
    push_changes "" "" "$force"

    success "同步完成！"
}

# 分支管理
manage_branches() {
    local action="$1"
    local branch_name="$2"

    case "$action" in
        "list")
            echo "📋 本地分支:"
            git branch -v
            echo
            echo "📋 远程分支:"
            git branch -r
            ;;
        "create")
            if [ -z "$branch_name" ]; then
                error "请指定分支名称"
                exit 1
            fi
            info "创建分支: $branch_name"
            git checkout -b "$branch_name"
            success "分支已创建并切换"
            ;;
        "switch")
            if [ -z "$branch_name" ]; then
                error "请指定分支名称"
                exit 1
            fi
            info "切换到分支: $branch_name"
            git checkout "$branch_name"
            success "分支已切换"
            ;;
        "delete")
            if [ -z "$branch_name" ]; then
                error "请指定分支名称"
                exit 1
            fi
            read -p "确定要删除分支 '$branch_name'? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                if git branch -D "$branch_name" 2>/dev/null; then
                    success "分支已删除: $branch_name"
                else
                    error "删除分支失败"
                fi
            fi
            ;;
        *)
            error "未知的分支操作: $action"
            echo "可用操作: list, create, switch, delete"
            exit 1
            ;;
    esac
}

# 合并分支
merge_branch() {
    local branch="$1"
    local strategy="$2"

    if [ -z "$branch" ]; then
        error "请指定要合并的分支"
        exit 1
    fi

    info "合并分支: $branch"

    if [ "$strategy" = "no-ff" ]; then
        git merge --no-ff "$branch"
    else
        git merge "$branch"
    fi

    success "分支合并完成"
}

# 重置工作目录
reset_workspace() {
    local mode="$1"

    case "$mode" in
        "soft")
            info "软重置到上一个提交..."
            git reset --soft HEAD~1
            ;;
        "hard")
            warn "硬重置将丢失所有未提交的更改！"
            read -p "确定要硬重置吗? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                git reset --hard HEAD
                success "工作目录已重置"
            fi
            ;;
        "mixed")
            info "混合重置..."
            git reset --mixed HEAD
            ;;
        *)
            error "未知的重置模式: $mode"
            echo "可用模式: soft, mixed, hard"
            exit 1
            ;;
    esac
}

# 清理未跟踪文件
clean_workspace() {
    info "显示将要删除的文件..."
    git clean -fdn

    read -p "确定要删除这些文件吗? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git clean -fd
        success "未跟踪文件已清理"
    fi
}

# 显示提交历史
show_log() {
    local count="$1"

    if [ -z "$count" ]; then
        count=10
    fi

    echo "📝 提交历史 (最近 $count 条):"
    echo "----------------------------------------"
    git log --oneline -"$count" --graph --decorate
}

# 显示差异
show_diff() {
    local staged="$1"

    if [ "$staged" = "staged" ]; then
        info "显示暂存区的差异..."
        git diff --staged
    else
        info "显示工作目录的差异..."
        git diff
    fi
}

# 储藏管理
manage_stash() {
    local action="$1"

    case "$action" in
        "list")
            echo "📦 储藏列表:"
            git stash list
            ;;
        "save")
            local message="$2"
            if [ -z "$message" ]; then
                message="自动储藏 $(date +'%Y-%m-%d %H:%M:%S')"
            fi
            git stash save "$message"
            success "更改已储藏: $message"
            ;;
        "pop")
            if git stash list | grep -q "stash@"; then
                git stash pop
                success "储藏已恢复"
            else
                warn "没有可恢复的储藏"
            fi
            ;;
        "drop")
            if git stash list | grep -q "stash@"; then
                git stash drop
                success "储藏已删除"
            else
                warn "没有可删除的储藏"
            fi
            ;;
        *)
            error "未知的储藏操作: $action"
            echo "可用操作: list, save, pop, drop"
            exit 1
            ;;
    esac
}

# 标签管理
manage_tags() {
    local tag_name="$1"

    if [ -z "$tag_name" ]; then
        echo "🏷️  现有标签:"
        git tag -l
        return
    fi

    info "创建标签: $tag_name"
    git tag "$tag_name"

    # 推送标签
    read -p "是否推送到远程仓库? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push origin "$tag_name"
        success "标签已创建并推送: $tag_name"
    else
        success "标签已创建: $tag_name"
    fi
}

# 远程仓库管理
manage_remotes() {
    local action="$1"
    local name="$2"
    local url="$3"

    case "$action" in
        "list")
            echo "🌐 远程仓库:"
            git remote -v
            ;;
        "add")
            if [ -z "$name" ] || [ -z "$url" ]; then
                error "请提供远程仓库名称和URL"
                exit 1
            fi
            git remote add "$name" "$url"
            success "远程仓库已添加: $name -> $url"
            ;;
        "remove")
            if [ -z "$name" ]; then
                error "请提供远程仓库名称"
                exit 1
            fi
            git remote remove "$name"
            success "远程仓库已删除: $name"
            ;;
        *)
            error "未知的远程仓库操作: $action"
            echo "可用操作: list, add, remove"
            exit 1
            ;;
    esac
}

# Git配置管理
manage_config() {
    local action="$1"
    local key="$2"
    local value="$3"

    case "$action" in
        "list")
            echo "⚙️  Git配置:"
            echo "----------------------------------------"
            echo "用户信息:"
            git config --list | grep user
            echo
            echo "其他配置:"
            git config --list | grep -v user | head -10
            ;;
        "set")
            if [ -z "$key" ] || [ -z "$value" ]; then
                error "请提供配置键和值"
                exit 1
            fi
            git config "$key" "$value"
            success "配置已设置: $key = $value"
            ;;
        "get")
            if [ -z "$key" ]; then
                error "请提供配置键"
                exit 1
            fi
            local result
            result=$(git config "$key")
            if [ -n "$result" ]; then
                echo "$key = $result"
            else
                warn "配置不存在: $key"
            fi
            ;;
        *)
            error "未知的配置操作: $action"
            echo "可用操作: list, set, get"
            exit 1
            ;;
    esac
}

# 主函数
main() {
    local command="$1"
    shift

    # 检查是否在git仓库中
    check_git_repo

    # 切换到项目目录
    cd "$PROJECT_DIR"

    # 解析命令行参数
    local message=""
    local force=false
    local branch=""
    local remote=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            -m|--message)
                message="$2"
                shift 2
                ;;
            -f|--force)
                force=true
                shift
                ;;
            -b|--branch)
                branch="$2"
                shift 2
                ;;
            -r|--remote)
                remote="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                break
                ;;
        esac
    done

    # 执行命令
    case "$command" in
        "status"|"st")
            show_status
            ;;
        "add"|"a")
            add_files "$@"
            ;;
        "commit"|"c")
            if [ -z "$message" ] && [ $# -gt 0 ]; then
                message="$1"
            fi
            commit_changes "$message" "$force"
            ;;
        "push"|"p")
            push_changes "$branch" "$remote" "$force"
            ;;
        "pull"|"pl")
            pull_changes "$remote" "$branch"
            ;;
        "sync"|"s")
            if [ -z "$message" ] && [ $# -gt 0 ]; then
                message="$1"
            fi
            sync_all "$message" "$force"
            ;;
        "fetch"|"f")
            info "获取远程分支信息..."
            git fetch --all
            success "获取完成"
            ;;
        "branch"|"br")
            if [ $# -eq 0 ]; then
                manage_branches "list"
            else
                manage_branches "$1" "$2"
            fi
            ;;
        "merge"|"m")
            merge_branch "$1" "$2"
            ;;
        "rebase"|"rb")
            info "变基到分支: $1"
            git rebase "$1"
            success "变基完成"
            ;;
        "reset"|"rs")
            reset_workspace "${1:-mixed}"
            ;;
        "clean"|"cl")
            clean_workspace
            ;;
        "log"|"lg")
            show_log "$1"
            ;;
        "diff"|"d")
            show_diff "$1"
            ;;
        "stash"|"st")
            if [ $# -eq 0 ]; then
                manage_stash "list"
            else
                manage_stash "$1" "$2"
            fi
            ;;
        "tag"|"t")
            manage_tags "$1"
            ;;
        "remote"|"rm")
            if [ $# -eq 0 ]; then
                manage_remotes "list"
            else
                manage_remotes "$1" "$2" "$3"
            fi
            ;;
        "config"|"cfg")
            if [ $# -eq 0 ]; then
                manage_config "list"
            else
                manage_config "$1" "$2" "$3"
            fi
            ;;
        "help"|"-h"|"--help"|"h")
            show_help
            ;;
        "")
            show_help
            ;;
        *)
            error "未知命令: $command"
            echo
            show_help
            exit 1
            ;;
    esac
}

# 检查参数
if [ $# -eq 0 ] || [[ "$1" == "help" ]] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    show_help
    exit 0
fi

# 执行主函数
main "$@"