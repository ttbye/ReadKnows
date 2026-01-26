#!/bin/bash

# 生成 Android 签名密钥库的脚本
# 使用方法: ./generate-keystore.sh

set -e

KEYSTORE_FILE="readknows-release-key.jks"
KEYSTORE_PATH="$(dirname "$0")/$KEYSTORE_FILE"
PROPERTIES_FILE="$(dirname "$0")/keystore.properties"

echo "🔐 生成 Android 签名密钥库..."
echo ""

# 检查是否已存在密钥库
if [ -f "$KEYSTORE_PATH" ]; then
    echo "⚠️  密钥库文件已存在: $KEYSTORE_PATH"
    read -p "是否要覆盖现有密钥库？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消操作"
        exit 0
    fi
    rm -f "$KEYSTORE_PATH"
fi

# 获取密钥库信息
echo "请输入密钥库信息（留空使用默认值）:"
echo ""

read -p "密钥库密码 [readknows]: " STORE_PASSWORD
STORE_PASSWORD=${STORE_PASSWORD:-readknows}

read -p "密钥别名 [readknows]: " KEY_ALIAS
KEY_ALIAS=${KEY_ALIAS:-readknows}

read -p "密钥密码 [$STORE_PASSWORD]: " KEY_PASSWORD
KEY_PASSWORD=${KEY_PASSWORD:-$STORE_PASSWORD}

read -p "有效期（天） [10000]: " VALIDITY
VALIDITY=${VALIDITY:-10000}

read -p "姓名/组织名称 [ReadKnows]: " NAME
NAME=${NAME:-ReadKnows}

read -p "组织单位 [Development]: " ORG_UNIT
ORG_UNIT=${ORG_UNIT:-Development}

read -p "组织 [ReadKnows]: " ORGANIZATION
ORGANIZATION=${ORGANIZATION:-ReadKnows}

read -p "城市 [Beijing]: " CITY
CITY=${CITY:-Beijing}

read -p "省份/州 [Beijing]: " STATE
STATE=${STATE:-Beijing}

read -p "国家代码（2字母） [CN]: " COUNTRY
COUNTRY=${COUNTRY:-CN}

echo ""
echo "正在生成密钥库..."

# 生成密钥库
keytool -genkey -v \
    -keystore "$KEYSTORE_PATH" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity "$VALIDITY" \
    -storepass "$STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=$NAME, OU=$ORG_UNIT, O=$ORGANIZATION, L=$CITY, ST=$STATE, C=$COUNTRY"

echo ""
echo "✅ 密钥库生成成功: $KEYSTORE_PATH"

# 生成 keystore.properties 文件
if [ -f "$PROPERTIES_FILE" ]; then
    echo "⚠️  keystore.properties 文件已存在"
    read -p "是否要覆盖现有配置文件？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已保留现有配置文件"
        exit 0
    fi
fi

# 写入配置文件
cat > "$PROPERTIES_FILE" <<EOF
# Android 签名密钥库配置
# 此文件包含敏感信息，请不要提交到版本控制系统

storeFile=$KEYSTORE_FILE
storePassword=$STORE_PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASSWORD
EOF

echo "✅ 配置文件已生成: $PROPERTIES_FILE"
echo ""
echo "✨ 完成！"
echo ""
echo "💡 提示:"
echo "   - 密钥库文件: $KEYSTORE_PATH"
echo "   - 配置文件: $PROPERTIES_FILE"
echo "   - 请妥善保管密钥库文件和密码"
echo "   - 现在可以运行构建脚本生成已签名的 Release APK"
