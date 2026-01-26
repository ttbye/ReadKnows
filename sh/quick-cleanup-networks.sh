#!/bin/bash
# 快速清理未使用的 Docker 网络

set -e

echo "🔍 检查未使用的网络..."

# 需要清理的网络列表
CLEANUP_NETWORKS=("sh_readknows-network" "sh_tts-lite-network")

for network in "${CLEANUP_NETWORKS[@]}"; do
    # 检查网络是否存在
    if docker network ls | grep -q " ${network}$"; then
        # 检查是否有容器在使用
        CONTAINERS=$(docker network inspect "${network}" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo "")
        
        if [ -z "$CONTAINERS" ] || [ "$CONTAINERS" = "" ]; then
            echo "🗑️  删除未使用的网络: ${network}"
            if docker network rm "${network}" 2>/dev/null; then
                echo "✅ ${network} 已删除"
            else
                echo "❌ 删除 ${network} 失败"
            fi
        else
            echo "⚠️  网络 ${network} 正在被使用，跳过删除"
        fi
    fi
done

echo ""
echo "📋 当前网络列表："
docker network ls

