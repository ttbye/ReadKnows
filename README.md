# 📚 ReadKnows (Private Digital Library)

<div align="right">
<sub>[English](README.md) | [中文](README-zh.md)</sub>
</div>

<div align="center">

![Version](https://img.shields.io/badge/version-2.4.262-blue.svg)
![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20NAS-lightgrey.svg)

**Multi-format, Multi-platform, Multi-user Private E-book Management Platform**

[Features](#-features) • [Quick Start](#-quick-start) • [Installation](#-installation) • [Documentation](#-documentation)

</div>

---

## 📖 Project Introduction

**Friendly Reminder**: This system is for personal learning and book/document management only!

> 💡 **Special Notes**:
> - The Android APP works well on open e-ink devices (such as iReader e-readers, etc.) after installation, providing an excellent reading experience for e-ink screens.
> - iPad or iPhone and other iOS devices can use it via PWA (Progressive Web App). No need to install through the App Store - simply access the website in Safari browser and add it to the home screen to use.

ReadKnows is a powerful private e-book management platform that supports reading and management of e-books in multiple formats including EPUB, PDF, TXT, MOBI, DOCX, MD, etc. Built with modern web technologies, it provides a smooth reading experience and powerful management features.

### ✨ Core Features

- 📚 **Multi-format Support**: EPUB, PDF, TXT, MOBI, DOCX, MD
- 🌐 **Multi-platform Access**: Web, iOS (PWA), Android (APK), macOS, Windows
- 👥 **Multi-user System**: Independent personal libraries and reading progress
- 📱 **PWA Support**: Install to device home screen
- 🎨 **Professional Reader**: Built-in EPUB and PDF readers with multiple themes
- 🔍 **Smart Search**: Full-text search support
- 📊 **Reading Statistics**: Detailed reading history and progress
- 🤖 **AI Integration**: Supports Ollama and other AI services
- 📦 **Batch Import**: Scan and import local books automatically
- 🔐 **Secure & Reliable**: JWT authentication, IP access control
- 📝 **Note Management**: Reading notes, highlights, export as note books
- 🏷️ **Category Management**: Book categories and tag management
- 📡 **OPDS Support**: Compatible with mainstream readers
- 🔊 **Voice Reading**: Online TTS voice reading (Beta)
- 📄 **Office Documents**: Word, Excel, PowerPoint support
- 🎧 **Audiobooks**: Import, organize and play audiobooks
- 💬 **Book Friends & Chat**: Friends, groups, messaging, file sharing
- 🔤 **OCR Recognition**: Image text recognition for PDF and images (supports multiple languages)

---

## 🚀 Features

### 📖 Reading Features
- Multi-format reader (EPUB, PDF, TXT, MOBI, DOCX, MD)
- Multiple reading themes (light, dark, eye-care, green)
- Customizable font size, font type, line spacing
- Custom fonts support
- Table of contents navigation
- Bookmark management
- Notes and highlights (offline sync)
- Full-text search
- Reading progress sync across devices
- OCR text recognition for PDF images (supports multiple languages)

### 📚 Management Features
- Upload, delete, edit book information
- Automatic metadata extraction
- Douban API integration for book info
- Book categories and tags
- Batch operations
- Personal library management
- Batch import with file monitoring
- Recursive directory scanning

### 👥 User Features
- Multi-user support
- User registration and login
- Admin backend
- Reading statistics
- Personal settings

### 🤖 AI Features
- Ollama local AI service support
- Intelligent reading assistance
- Book content analysis
- AI conversation

### 🔐 Security Features
- JWT authentication
- IP access control (whitelist/blacklist)
- Captcha protection
- Password encryption (bcrypt)

---

## 🐳 Installation

### Prerequisites

- **Docker**: 20.10+ and Docker Compose 2.0+
- **Memory**: At least 2GB available (4GB+ recommended)
- **Disk Space**: At least 5GB available (10GB+ recommended)
- **Network**: Internet access required

### System Requirements

- **macOS**: 10.15+ (Catalina or later) with Docker Desktop
- **Windows**: 10/11 (64-bit) with WSL 2 or Docker Desktop
- **Linux**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+ / Fedora 34+ with Docker Engine
- **Synology NAS**: DSM 7.0+ or DSM 6.2+ with Docker Package

---

## 🚀 Quick Start (Docker Installation)

### Method 1: One-Click Installation Script (Recommended)

This is the simplest and fastest installation method. The script will automatically complete all configurations.

#### Step 1: Clone the Project

```bash
git clone https://github.com/ttbye/readknows.git
cd readknows
```

#### Step 2: Run Installation Script

```bash
# Grant execute permission
chmod +x install-en.sh

# Run installation script
./install-en.sh
```

The installation script will:
1. Check Docker and Docker Compose installation
2. Check Docker service status
3. Auto-detect your platform (macOS/Windows/Linux/Synology)
4. Create `.env` environment file with random JWT_SECRET
5. Create data directories
6. Check port availability (1280 for frontend, 1281 for backend)
7. Build Docker images (if needed)
8. Start containers
9. Initialize admin account (optional)

#### Step 3: Access the Application

After installation completes, you will see:

```
========================================
Installation Complete
========================================
✅ ReadKnows has been successfully installed and started!

Access addresses:
  🌐 Frontend: http://localhost:1280
  🔌 Backend API: http://localhost:1281

Default Admin Account:
  Username: books
  Password: readknows

⚠️  Please change the default password after first login!
```

Open your browser and visit: **http://localhost:1280**

---

### Method 2: Manual Docker Deployment

If you want to manually control the deployment process, follow these steps.

#### Step 1: Clone the Project

```bash
git clone https://github.com/ttbye/readknows.git
cd readknows
```

#### Step 2: Create Environment Variables File

Create `.env` file in the project root:

```bash
cat > .env << EOF
# JWT Configuration
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d

# Douban API Configuration (Optional)
DOUBAN_API_BASE=

# AI Configuration (Optional)
AI_PROVIDER=ollama
AI_API_URL=http://frontend:1280/ollama-proxy
AI_API_KEY=
AI_MODEL=llama2

# Ollama Server Address
OLLAMA_URL=http://host.docker.internal:11434

# CORS Configuration (Required for Public Domain Access)
# Replace 'your-domain.com' with your actual domain name
# Multiple domains can be separated by commas
ALLOWED_ORIGINS=https://your-domain.com:1280
EOF
```

> ⚠️ **Important**: If deploying to a public domain, replace `your-domain.com` in `ALLOWED_ORIGINS` with your actual domain name. For local development, you can omit this configuration.

#### Step 3: Create Data Directories

```bash
# Create data directory structure
mkdir -p data/backend/{data,books,covers,fonts,import}
```

#### Step 4: Select docker-compose File

Choose the appropriate configuration file based on your platform:

- **Standard Environment**: `sh/docker-compose.yml`
- **macOS**: `sh/docker-compose-MACOS.yml`
- **Windows**: `sh/docker-compose-WINDOWS.yml`
- **Linux**: `sh/docker-compose-Linux.yml`
- **Synology NAS**: `sh/docker-compose-Synology.yml`

#### Step 5: Build and Start Services

```bash
# Enter sh directory
cd sh

# Build and start with standard configuration
docker compose -f docker-compose.yml up -d --build

# Or use platform-specific configuration (Linux example)
docker compose -f docker-compose-Linux.yml up -d --build
```

#### Step 6: Check Service Status

```bash
# Check container status
docker compose -f docker-compose.yml ps

# View logs
docker compose -f docker-compose.yml logs -f

# View backend logs only
docker compose -f docker-compose.yml logs -f backend

# View frontend logs only
docker compose -f docker-compose.yml logs -f frontend
```

#### Step 7: Initialize Admin Account

```bash
# Execute initialization script
docker compose -f docker-compose.yml exec backend node scripts/initAdmin.js

# Or use script in project root
cd ..
chmod +x sh/init-admin.sh
./sh/init-admin.sh
```

#### Step 8: Access the Application

Open your browser and visit: **http://localhost:1280**

Login with default credentials:
- **Username**: `books`
- **Password**: `readknows`

> ⚠️ **Security Warning**: Please change the default password immediately after first login!

---

## ⚙️ Configuration

### Environment Variables

The `.env` file contains the following configuration items:

```env
# JWT Authentication Configuration
JWT_SECRET=your-secret-key-here-change-in-production
JWT_EXPIRES_IN=7d

# Douban API Configuration (Optional)
DOUBAN_API_BASE=https://api.douban.com/v2

# AI Configuration (Optional)
AI_PROVIDER=ollama
AI_API_URL=http://frontend:1280/ollama-proxy
AI_API_KEY=
AI_MODEL=llama2

# Ollama Server Configuration
OLLAMA_URL=http://host.docker.internal:11434

# CORS Configuration (Required for Public Domain Access)
# Format: Multiple domains separated by commas
# Example: https://example.com:1280,https://www.example.com:1280
# If not configured, only local network access is allowed
ALLOWED_ORIGINS=https://your-domain.com:1280
```

> ⚠️ **Important**: If you are deploying to a public domain, you **must** configure `ALLOWED_ORIGINS` in your `.env` file or docker-compose configuration file. Replace `your-domain.com` with your actual domain name. Multiple domains can be separated by commas.

### Data Directory Structure

Default data directory structure:

```
data/
└── backend/
    ├── data/          # SQLite database files
    ├── books/         # Book file storage
    ├── covers/        # Cover image storage
    ├── fonts/         # Font file storage
    └── import/        # Import directory (monitored for auto-import)
```

### Port Configuration

Default ports:
- **Frontend**: 1280 (HTTP)
- **Backend API**: 1281 (HTTP)

To modify ports, edit the `ports` section in `docker-compose.yml`:

```yaml
services:
  frontend:
    ports:
      - "8080:1280"  # Change frontend port to 8080
  backend:
    ports:
      - "8081:1281"  # Change backend port to 8081
```

### CORS Configuration (Public Domain Access)

If you are deploying ReadKnows to a public domain (not just localhost), you **must** configure the `ALLOWED_ORIGINS` environment variable to allow CORS requests from your domain.

#### Method 1: Configure in `.env` file

Add to your `.env` file:

```env
ALLOWED_ORIGINS=https://your-domain.com:1280
```

For multiple domains:

```env
ALLOWED_ORIGINS=https://example.com:1280,https://www.example.com:1280,https://app.example.com:1280
```

#### Method 2: Configure in docker-compose file

If you're using platform-specific docker-compose files (e.g., `docker-compose-MACOS.yml`, `docker-compose-Linux.yml`), you can modify the `ALLOWED_ORIGINS` environment variable directly in the file:

```yaml
environment:
  - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-https://your-domain.com:1280}
```

Replace `your-domain.com` with your actual domain name.

#### Important Notes:

- **Local Development**: If you're only accessing via `localhost` or local network, you can omit this configuration.
- **Public Domain**: If deploying to a public domain, this configuration is **required** to prevent CORS errors.
- **Port Number**: Make sure the port number in `ALLOWED_ORIGINS` matches your frontend port (default is 1280).
- **HTTPS**: If using HTTPS, use `https://` in the URL. For HTTP, use `http://`.
- **Multiple Domains**: Separate multiple domains with commas (no spaces).

---

## 📖 Usage

### First Login

After installation, login with default admin account:
- **Username**: `books`
- **Password**: `readknows`
- **Email**: `admin@readknows.local`

> ⚠️ **Security Warning**: Please change the default password immediately after first login!

### Install Calibre (MOBI to EPUB Conversion)

If you need MOBI to EPUB conversion, install Calibre:

```bash
chmod +x sh/install-calibre.sh
./sh/install-calibre.sh
```

### Batch Import Books

#### Method 1: Web Interface
1. Login to system
2. Go to **Upload** page
3. Click **Batch Import** or **Scan Import**
4. Select directory to import

#### Method 2: File Monitoring Auto-Import
1. Place book files in `data/backend/import/` directory
2. System will automatically monitor and import new files

### Common Management Commands

```bash
# Check service status
docker compose -f sh/docker-compose.yml ps

# View logs
docker compose -f sh/docker-compose.yml logs -f

# Restart services
docker compose -f sh/docker-compose.yml restart

# Stop services
docker compose -f sh/docker-compose.yml stop

# Start services
docker compose -f sh/docker-compose.yml start

# Stop and remove containers
docker compose -f sh/docker-compose.yml down

# Rebuild images
docker compose -f sh/docker-compose.yml build --no-cache
```

---

## 🐛 Troubleshooting

### Container Fails to Start

1. **Check Docker service**:
   ```bash
   docker info
   ```

2. **Check port availability**:
   ```bash
   # Linux/macOS
   lsof -i :1280
   lsof -i :1281
   
   # Windows
   netstat -ano | findstr :1280
   netstat -ano | findstr :1281
   ```

3. **View container logs**:
   ```bash
   docker compose -f sh/docker-compose.yml logs backend
   docker compose -f sh/docker-compose.yml logs frontend
   ```

### EPUB Cover Cannot be Extracted

Usually a directory permission issue:

```bash
# Fix permissions
sudo chmod -R 777 data/backend/covers

# Restart container
docker compose -f sh/docker-compose.yml restart backend
```

### Cannot Access Host Services (e.g., Ollama)

Check network configuration:

1. **Use host.docker.internal**:
   ```env
   OLLAMA_URL=http://host.docker.internal:11434
   ```

2. **Linux requires additional configuration**:
   ```yaml
   # Add to docker-compose.yml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```

### MOBI Files Cannot be Converted

Install Calibre:

```bash
./sh/install-calibre.sh
```

### Forgot Admin Password

Reset password:

```bash
docker compose -f sh/docker-compose.yml exec backend node scripts/resetPassword.js
```

---

## 🔒 Security

### Production Environment Recommendations

1. **Change Default Password**: Change default admin password immediately after first login
2. **Use Strong JWT_SECRET**: Generate a strong random string for JWT_SECRET
3. **Configure HTTPS**: Use Nginx reverse proxy to configure HTTPS
4. **Regular Backups**: Regularly backup database and book files
5. **IP Access Control**: Configure IP whitelist to limit access
6. **Update Dependencies**: Regularly update dependencies to fix security vulnerabilities
7. **Firewall Configuration**: Configure firewall rules to limit port access

---

## 📄 License

This project is licensed under [Apache License 2.0](LICENSE).

---

## 🙏 Acknowledgments

- [EPUB.js](https://github.com/futurepress/epub.js) - EPUB reader
- [PDF.js](https://github.com/mozilla/pdf.js) - PDF reader
- [Calibre](https://calibre-ebook.com/) - E-book management tool
- [React](https://react.dev/) - UI framework
- [Express](https://expressjs.com/) - Web framework

---

## 📮 Contact

- **Author**: ttbye
- **Project URL**: https://github.com/ttbye/readknows
- **Issue Tracker**: https://github.com/ttbye/readknows/issues

---

<div align="center">

**Made with ❤️ by ttbye**

[⬆ Back to Top](#-readknows-private-digital-library)

</div>
