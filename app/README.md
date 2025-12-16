# ReadKnows Android WebView App (Wrapper)

这是一个最小的 Android WebView 包装应用，用于在不改动现有前后端代码的前提下，将前端移动端体验封装为 APK。应用仅作为外壳，加载现有前端服务（默认指向本地/内网运行的前端 1280 端口）。

## 目录结构
```
app/
├── README.md              本说明
├── build.gradle           顶层 Gradle 构建文件
├── settings.gradle        Gradle 设置
├── gradle.properties      Gradle 基础属性
└── app/
    ├── build.gradle       模块构建文件
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/readknows/webapp/MainActivity.kt
        ├── res/layout/activity_main.xml
        ├── res/values/strings.xml
        └── res/xml/network_security_config.xml
```

## 运行前准备
1) 安装 Android Studio（推荐最新稳定版），确保已安装 Android SDK 34 及以上。
2) 在项目根目录（包含 `app/`）下执行或用 Android Studio 直接打开 `app/` 目录。
3) 如需使用本地后端，保持前端/后端通过 Docker 或本机运行，默认前端地址 `http://10.0.2.2:1280`（Android 模拟器访问宿主机）。
4) 真实设备测试时，请将 `WEB_APP_URL` 改为可访问的局域网地址（如 `http://192.168.x.x:1280`），或配置 HTTPS。

## 调整前端地址
修改 `app/src/main/java/com/readknows/webapp/MainActivity.kt` 中的 `WEB_APP_URL` 常量。默认：
```kotlin
private const val WEB_APP_URL = "http://10.0.2.2:1280"
```

## 构建与安装

### 快速开始

**使用构建脚本（推荐）：**
```bash
cd app
./build-apk.sh
```

**手动构建：**
```bash
cd app
# 构建 Release APK
./gradlew assembleRelease

# 构建 Debug APK（用于测试）
./gradlew assembleDebug

# 安装到已连接的设备/模拟器
./gradlew installDebug
```

### 详细构建指南

请参阅 [BUILD.md](./BUILD.md) 了解：
- 环境配置（Java JDK、Android SDK）
- 详细的构建步骤
- 常见问题排查
- APK 签名配置

## 特性
- 保留前端已有的移动端 UI/逻辑，WebView 外壳不改动前后端代码。
- 启用 JS、DOM Storage、文件访问、缓存；允许混合内容（HTTP/HTTPS 混合）和自定义 Network Security Config，便于访问本地服务。
- 处理返回键：WebView 内部后退优先，其次退出应用。

## 注意事项
- 若要发布到应用商店，请改用 HTTPS，收紧混合内容和网络安全策略。
- 若需离线/打包静态资源，可后续将前端构建产物嵌入本地 `android_asset`，当前版本使用远程 URL。 

