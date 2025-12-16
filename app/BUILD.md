# Android APK 构建指南

本文档说明如何构建 ReadKnows Android APK 安装包。

## 前置要求

### 1. 安装 Java JDK

构建 Android APK 需要 Java JDK 11 或更高版本。

**macOS:**
```bash
# 使用 Homebrew 安装
brew install openjdk@17

# 设置环境变量（添加到 ~/.zshrc 或 ~/.bash_profile）
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install openjdk-17-jdk

# 设置环境变量
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH="$JAVA_HOME/bin:$PATH"
```

**Windows:**
1. 下载并安装 [Adoptium OpenJDK](https://adoptium.net/)
2. 设置环境变量 `JAVA_HOME` 指向 JDK 安装目录

### 2. 安装 Android SDK

有两种方式安装 Android SDK：

#### 方式一：安装 Android Studio（推荐）

1. 下载并安装 [Android Studio](https://developer.android.com/studio)
2. 打开 Android Studio，完成初始设置
3. SDK 默认安装在：
   - **macOS**: `~/Library/Android/sdk`
   - **Linux**: `~/Android/Sdk`
   - **Windows**: `%LOCALAPPDATA%\Android\Sdk`

#### 方式二：仅安装命令行工具

**macOS:**
```bash
brew install --cask android-studio
```

**Linux:**
```bash
# 下载命令行工具
wget https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip
unzip commandlinetools-linux-9477386_latest.zip
mkdir -p ~/Android/Sdk/cmdline-tools
mv cmdline-tools ~/Android/Sdk/cmdline-tools/latest
```

### 3. 配置环境变量

将以下内容添加到 `~/.zshrc`（macOS）或 `~/.bashrc`（Linux）：

```bash
# Android SDK
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS
# export ANDROID_HOME=$HOME/Android/Sdk        # Linux
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

然后重新加载配置：
```bash
source ~/.zshrc  # macOS
# source ~/.bashrc  # Linux
```

### 4. 安装必要的 SDK 组件

运行以下命令安装构建所需的组件：

```bash
# 接受许可证
yes | sdkmanager --licenses

# 安装 Android Platform 34
sdkmanager "platforms;android-34"

# 安装 Build Tools
sdkmanager "build-tools;34.0.0"

# 安装其他必要组件
sdkmanager "platform-tools" "tools"
```

## 构建 APK

### 方法一：使用构建脚本（推荐）

```bash
cd app
./build-apk.sh
```

脚本会自动检查环境并构建 APK。

### 方法二：手动构建

```bash
cd app

# 清理之前的构建
./gradlew clean

# 构建 Release APK
./gradlew assembleRelease

# 构建 Debug APK（用于测试）
./gradlew assembleDebug
```

## 生成的 APK 位置

构建成功后，APK 文件位于：

- **Release APK**: `app/build/outputs/apk/release/app-release.apk`
- **Debug APK**: `app/build/outputs/apk/debug/app-debug.apk`

## 安装 APK

### 方法一：通过 ADB 安装（需要连接设备）

```bash
# 连接 Android 设备并启用 USB 调试
adb devices

# 安装 APK
adb install app/build/outputs/apk/release/app-release.apk
```

### 方法二：手动安装

1. 将 APK 文件传输到 Android 设备（通过 USB、邮件、云存储等）
2. 在设备上打开"设置" > "安全" > 启用"未知来源"或"允许安装未知应用"
3. 在设备上找到 APK 文件并点击安装

## 配置应用

构建前，请确保在 `app/app/src/main/java/com/readknows/webapp/MainActivity.kt` 中配置正确的后端服务地址：

```kotlin
// 修改这行以匹配您的后端地址
private val WEB_APP_URL = "http://10.0.2.2:1280"  // 模拟器
// private val WEB_APP_URL = "http://192.168.1.100:1280"  // 真机局域网
// private val WEB_APP_URL = "https://your-domain.com"  // 生产环境
```

## 签名 APK（可选）

如果要发布到应用商店，需要对 APK 进行签名：

```bash
# 生成密钥库（首次）
keytool -genkey -v -keystore readknows-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias readknows

# 配置签名（编辑 app/app/build.gradle）
# 在 android {} 块中添加：
# signingConfigs {
#     release {
#         storeFile file('../readknows-release-key.jks')
#         storePassword 'your-store-password'
#         keyAlias 'readknows'
#         keyPassword 'your-key-password'
#     }
# }
# 在 buildTypes.release {} 中添加：
# signingConfig signingConfigs.release
```

## 常见问题

### 1. "Unable to locate a Java Runtime"
- 确保已安装 Java JDK 11 或更高版本
- 检查 `JAVA_HOME` 环境变量是否正确设置

### 2. "ANDROID_HOME is not set"
- 设置 `ANDROID_HOME` 环境变量指向 Android SDK 目录
- 确保已安装 Android SDK

### 3. "SDK location not found"
- 检查 `local.properties` 文件（如果存在）中的 `sdk.dir` 设置
- 或创建 `local.properties` 文件：
  ```
  sdk.dir=/path/to/android/sdk
  ```

### 4. 构建失败：缺少 SDK 组件
- 运行 `sdkmanager` 安装缺失的组件
- 确保已接受所有许可证：`yes | sdkmanager --licenses`

## 更多信息

- [Android 开发者文档](https://developer.android.com/)
- [Gradle 构建文档](https://developer.android.com/studio/build)
- [Android Studio 下载](https://developer.android.com/studio)

