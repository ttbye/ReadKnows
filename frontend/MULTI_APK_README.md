# 多服务器 APK 构建指南

本指南介绍如何为不同的服务器构建不同的 APK，使它们可以同时安装在同一设备上。

## 问题说明

默认情况下，所有 APK 使用相同的包名（`com.readknows.app`），Android 系统会将它们视为同一个应用，因此无法同时安装多个版本。

## 解决方案

为每个服务器配置不同的：
1. **包名（applicationId）** - 这是最重要的，必须不同
2. **应用名称** - 可选，用于区分不同服务器
3. **应用图标** - 可选，每个服务器可以使用不同的图标（默认：`./readknows-sw.png`）
4. **签名密钥** - 可选，但建议使用不同的密钥
5. **API 地址和密钥** - 每个服务器不同

## 使用方法

### 方法 1：使用多配置脚本（推荐）

1. **创建配置文件** `apk-profiles.json`：

```json
{
  "server1": {
    "applicationId": "com.readknows.server1",
    "appName": "ReadKnows Server1",
    "appIconPath": "./readknows-sw.png",
    "apiUrl": "https://server1.example.com",
    "apiKey": "your-api-key-1",
    "keystoreFile": "server1-key.jks",
    "keystorePassword": "password1",
    "keyAlias": "server1",
    "keyPassword": "password1"
  },
  "server2": {
    "applicationId": "com.readknows.server2",
    "appName": "ReadKnows Server2",
    "appIconPath": "./custom-icon-server2.png",
    "apiUrl": "https://server2.example.com",
    "apiKey": "your-api-key-2",
    "keystoreFile": "server2-key.jks",
    "keystorePassword": "password2",
    "keyAlias": "server2",
    "keyPassword": "password2"
  }
}
```

2. **为每个服务器生成密钥库**（如果使用不同的签名）：

```bash
cd android
# 为 server1 生成密钥库
keytool -genkey -v -keystore server1-key.jks \
  -alias server1 -keyalg RSA -keysize 2048 \
  -validity 10000 -storepass password1 -keypass password1

# 为 server2 生成密钥库
keytool -genkey -v -keystore server2-key.jks \
  -alias server2 -keyalg RSA -keysize 2048 \
  -validity 10000 -storepass password2 -keypass password2
```

3. **构建 APK**：

```bash
cd frontend

# 构建 server1 的 APK
./build-apk-multi.sh server1 release

# 构建 server2 的 APK
./build-apk-multi.sh server2 release
```

构建完成后，APK 文件会自动重命名为包含配置名称的格式，例如：
- `app-release-server1.apk`
- `app-release-server2.apk`

### 方法 2：使用环境变量

```bash
cd frontend

# 构建 server1 的 APK
ANDROID_APPLICATION_ID="com.readknows.server1" \
APP_NAME="ReadKnows Server1" \
APP_ICON_PATH="./readknows-sw.png" \
VITE_API_URL="https://server1.example.com" \
VITE_API_KEY="your-api-key-1" \
KEYSTORE_FILE="android/server1-key.jks" \
KEYSTORE_PASSWORD="password1" \
KEY_ALIAS="server1" \
KEY_PASSWORD="password1" \
./build-apk.sh release

# 构建 server2 的 APK
ANDROID_APPLICATION_ID="com.readknows.server2" \
APP_NAME="ReadKnows Server2" \
APP_ICON_PATH="./custom-icon-server2.png" \
VITE_API_URL="https://server2.example.com" \
VITE_API_KEY="your-api-key-2" \
KEYSTORE_FILE="android/server2-key.jks" \
KEYSTORE_PASSWORD="password2" \
KEY_ALIAS="server2" \
KEY_PASSWORD="password2" \
./build-apk.sh release
```

## 配置说明

### 必需配置

- **applicationId**: 包名，必须唯一，格式：`com.公司名.应用名.服务器标识`
  - 示例：`com.readknows.server1`、`com.readknows.server2`

### 可选配置

- **appName**: 应用显示名称，用于区分不同服务器
- **appIconPath**: 应用图标路径（相对于 `frontend` 目录），默认值：`./readknows-sw.png`
  - 支持相对路径（如 `./readknows-sw.png`）或绝对路径
  - 图标文件应为 512x512 像素的 PNG 格式
  - 脚本会自动生成 Android 所需的各种尺寸
- **apiUrl**: API 服务器地址
- **apiKey**: API 密钥
- **keystoreFile**: 密钥库文件路径（相对于 `android` 目录）
- **keystorePassword**: 密钥库密码
- **keyAlias**: 密钥别名
- **keyPassword**: 密钥密码

## 注意事项

1. **包名必须唯一**：每个服务器的 `applicationId` 必须不同，否则无法同时安装
2. **签名密钥**：虽然可以使用相同的密钥，但建议为每个服务器使用不同的密钥以提高安全性
3. **应用名称**：建议设置不同的应用名称，方便用户在设备上区分
4. **应用图标**：
   - 默认图标路径：`./readknows-sw.png`（相对于 `frontend` 目录）
   - 图标文件应为 512x512 像素的 PNG 格式
   - 如果图标文件不存在，构建会失败，请确保图标文件路径正确
   - 可以为每个服务器配置不同的图标，方便区分
5. **配置文件安全**：`apk-profiles.json` 包含敏感信息（密码、密钥），不要提交到版本控制系统
6. **包名格式**：遵循 Android 包名规范，使用小写字母和点分隔

## 包名建议

建议使用以下格式：
```
com.readknows.<服务器标识>
```

例如：
- `com.readknows.prod` - 生产服务器
- `com.readknows.test` - 测试服务器
- `com.readknows.dev` - 开发服务器
- `com.readknows.server1` - 服务器1
- `com.readknows.server2` - 服务器2

## 验证

构建完成后，可以验证包名是否正确：

```bash
# 使用 aapt 工具查看 APK 包名（需要 Android SDK）
aapt dump badging app-release-server1.apk | grep package

# 应该显示类似：
# package: name='com.readknows.server1' ...
```

## 故障排除

### 问题：仍然提示"软件包与现有软件包存在冲突"

**原因**：包名没有正确更新

**解决**：
1. 检查 `android/app/build.gradle` 中的 `applicationId` 是否正确
2. 检查 `capacitor.config.ts` 中的 `appId` 是否正确
3. 清理构建缓存：`cd android && ./gradlew clean`
4. 重新同步：`npx cap sync android`
5. 重新构建

### 问题：签名失败

**原因**：密钥库文件路径或密码错误

**解决**：
1. 检查密钥库文件是否存在
2. 验证密码是否正确
3. 检查密钥别名是否正确

### 问题：图标文件不存在

**原因**：`appIconPath` 指定的图标文件路径不正确

**解决**：
1. 检查图标文件路径是否正确（相对于 `frontend` 目录）
2. 确认图标文件存在：`ls -la frontend/readknows-sw.png`
3. 如果使用自定义图标，确保路径正确且文件存在
4. 图标文件应为 512x512 像素的 PNG 格式

## 示例配置文件

完整示例请参考 `apk-profiles.json.example`。

## 图标配置示例

```json
{
  "server1": {
    "applicationId": "com.readknows.server1",
    "appName": "ReadKnows Server1",
    "appIconPath": "./readknows-sw.png",  // 使用默认图标
    ...
  },
  "server2": {
    "applicationId": "com.readknows.server2",
    "appName": "ReadKnows Server2",
    "appIconPath": "./custom-icons/server2-icon.png",  // 使用自定义图标
    ...
  }
}
```

**图标路径说明**：
- 相对路径：相对于 `frontend` 目录（如 `./readknows-sw.png`）
- 绝对路径：完整文件路径（如 `/path/to/icon.png`）
- 默认值：如果未指定 `appIconPath`，使用 `./readknows-sw.png`
