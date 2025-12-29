# 📚 ReadKnows (Private Digital Library)

<div align="right">
<sub>[English](README.md) | [中文](README-zh.md)</sub>
</div>

<div align="center">

![Version](https://img.shields.io/badge/version-1.225.12-blue.svg)
![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20NAS-lightgrey.svg)

**Multi-format, Multi-platform, Multi-user Private E-book Management Platform**

[Features](#-features) • [Quick Start](#-quick-start) • [Installation](#-installation) • [Documentation](#-documentation) • [Development Guide](#-development-guide)

</div>

---

## 📖 Project Introduction

**Friendly Reminder**: In China, individuals are not allowed to publish online. Maintaining a public book website is illegal! This system is for personal learning and book/document management only!

ReadKnows is a powerful private e-book management platform that supports reading and management of e-books in multiple formats including EPUB, PDF, TXT, MOBI, etc. Built with modern web technologies, it provides a smooth reading experience and powerful management features.

### ✨ Core Features

- 📚 **Multi-format Support**: EPUB, PDF, TXT, MOBI (auto-convert to EPUB)
- 🌐 **Multi-platform Access**: Supports Web, iOS, iPad, Mac, Windows, and more
- 👥 **Multi-user System**: Supports multiple users with independent personal libraries and reading progress
- 📱 **PWA Support**: Progressive Web App support, can be installed to device home screen
- 🎨 **Professional Reader**: Built-in professional EPUB and PDF readers with multiple reading themes
- 🔍 **Smart Search**: Full-text search support for quick content location
- 📊 **Reading Statistics**: Detailed reading history and progress statistics
- 🤖 **AI Integration**: Supports Ollama and other AI services for intelligent reading assistance
- 📦 **Batch Import**: Supports batch scanning and importing local books
- 🔐 **Secure & Reliable**: JWT authentication, IP access control, encrypted data storage
- 📝 **Note Management**: Supports reading notes, highlights, export and import as note books
- 🏷️ **Category Management**: Supports book categories and tag management
- 📡 **OPDS Support**: Supports OPDS protocol, compatible with mainstream readers
- 🔊 **Voice Reading**: Supports online TTS voice reading (Beta)
- 📄 **Office Documents**: Supports uploading and browsing Office documents (Word, Excel, PowerPoint)
- 🤖 **TTS Service**: Supports both TTS-API and TTS-API-Lite TTS services

---

## 🚀 Features

### 📖 Reading Features

- ✅ **Multi-format Reader**
  - EPUB: Professional-grade reader with table of contents navigation, bookmarks, highlights, notes
  - PDF: Complete PDF reading experience with zoom, page turning, table of contents, search
  - TXT: Plain text reading with automatic formatting and encoding detection
  - MOBI: Auto-convert to EPUB format (requires Calibre installation)

- ✅ **Reading Settings**
  - Multiple reading themes (light, dark, eye-care, green)
  - Customizable font size, font type, line spacing
  - Support for custom fonts (can upload font files)
  - Automatic reading progress saving
  - Reading history records
  - Page turning animation effects

- ✅ **Reading Assistance**
  - Table of contents navigation (supports multi-level)
  - Bookmark management (add, delete, jump)
  - Notes and highlights (offline available, auto-sync when online)
  - Full-text search (supports regular expressions)
  - Reading progress sync (multi-device sync + cross-device progress change notifications)
  - Progress display: EPUB defaults to "percentage progress (2 decimal places)" for better cross-device stability

### 📚 Management Features

- ✅ **Book Management**
  - Upload, delete, edit book information
  - Automatic book metadata extraction (title, author, cover, etc.)
  - Supports Douban API for automatic book information retrieval
  - Book categories and tag management
  - Batch operations (batch delete, batch categorize)
  - Book detail editing (title, author, description, tags)

- ✅ **Library Management**
  - Create personal exclusive libraries
  - Book collection and categorization
  - Batch operations
  - Library statistics (book count, reading progress)

- ✅ **Batch Import**
  - Scan local directories for automatic import
  - Supports automatic conversion (TXT → EPUB, MOBI → EPUB)
  - Automatic book metadata retrieval
  - File monitoring for automatic import (monitors import directory)
  - Supports recursive subdirectory scanning

- ✅ **Category Management**
  - Create and manage book categories
  - Category hierarchy management
  - Category statistics

### 👥 User Features

- ✅ **User System**
  - Multi-user support
  - User registration, login, permission management
  - Admin backend
  - User role management (regular user, admin)
  - User statistics (uploaded books count, library count)

- ✅ **Personal Center**
  - Reading statistics (reading duration, reading progress, reading history)
  - Reading history (recent reading, reading records)
  - Personal settings (account information, password change)
  - Personal profile management

- ✅ **User Management** (Admin feature)
  - View user list
  - Create new users
  - Edit user information
  - Reset user passwords
  - Delete users
  - User permission management

### 🤖 AI Features

- ✅ **AI Integration**
  - Supports Ollama local AI service
  - Intelligent reading assistance
  - Book content analysis
  - AI conversation functionality
  - Reading assistant (Q&A, summary, translation)

### 🔐 Security Features

- ✅ **Security Features**
  - JWT authentication
  - IP access control (whitelist/blacklist)
  - Captcha protection (login, registration)
  - Encrypted data storage
  - Password encryption (bcrypt)
  - Session management

- ✅ **IP Management** (Admin feature)
  - IP whitelist management
  - IP blacklist management
  - IP access logs

### 📝 Note Features

- ✅ **Note Management**
  - Create reading notes
  - Edit and delete notes
  - Note categorization
  - Note search
  - Export notes/highlights as Markdown
  - One-click export as "Note Book" (private book, categorized as "Notes", cover with "Notes" overlay)
  - Supports adding exported notes as new books to server

### 🔊 Voice Reading Feature (Beta)

- ✅ **TTS Service Support**
  - **TTS-API-Lite**: Lightweight TTS online generation API system, recommended for regular servers
  - **TTS-API**: Supports online TTS and local TTS generation, requires higher GPU hardware
  - Online Edge-TTS voice reading (Beta, for experience only)

### 📄 Office Document Support

- ✅ **Office Document Browsing**
  - Supports Word (.docx) document upload and browsing
  - Supports Excel (.xlsx) document upload and browsing
  - Simple document browsing functionality

### ✨ Reader Experience Enhancements (Recent Updates)

- ✅ **Text Selection Menu Enhancement (EPUB)**
  - Highlight/unhighlight
  - New note (fixed mobile/PWA click not opening popup issue)
  - Copy / Baidu Search / Dictionary / Translate
  - Clicking highlighted area automatically selects the highlight and shows menu

- ✅ **Offline & Sync (Highlights)**
  - Offline: Local cache and queue
  - Online: Auto-sync to server and persist
  - Reopen book: Auto-render historical highlights

- ✅ **Cross-device Progress Notifications (EPUB/TXT/MD/PDF)**
  - When Device A and B progress differ: Auto-fetch server progress when returning to foreground/focus and prompt to jump
  - Notification includes: Local/other device progress and chapter title
  - 409 conflicts no longer spam (handled as normal conflict signal, prompt once and pause reporting)

- ✅ **Reading Experience Fixes**
  - EPUB: Fixed various TypeErrors caused by epubjs hooks parameter issues (getElementsByTagName/createElement/ownerDocument, etc.)
  - PDF: Fixed mobile/PWA vertical stretch causing text distortion
  - Markdown: Added top/bottom/left/right margins and clearer layout styles
  - Navigation bar: Fixed top bar to avoid navigation bar shaking caused by pull-to-refresh/elastic scrolling
  - Note/TOC panel: Supports safe-area (notch screens) and reading theme adaptation

### 📡 OPDS Support

- ✅ **OPDS Protocol**
  - Supports OPDS 1.2 protocol
  - Compatible with mainstream readers (such as Calibre, KOReader, etc.)
  - OPDS catalog browsing
  - OPDS search

---

## 🛠️ Tech Stack

### Frontend

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **UI Framework**: Tailwind CSS 3.4
- **State Management**: Zustand 4.4
- **Routing**: React Router v6
- **Readers**: 
  - EPUB.js (EPUB reading)
  - PDF.js (PDF reading)
  - react-pdf (PDF rendering)
- **PWA**: Vite PWA Plugin
- **HTTP Client**: Axios
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

### Backend

- **Runtime**: Node.js 20
- **Framework**: Express.js 4.18
- **Language**: TypeScript 5.3
- **Database**: SQLite (better-sqlite3)
- **Authentication**: JWT (jsonwebtoken)
- **File Processing**:
  - EPUB parsing and generation (epub-gen)
  - PDF parsing and metadata extraction (pdf-parse, pdfjs-dist)
  - Image processing (Canvas, Sharp)
  - Document conversion (mammoth, xlsx, pptx2json)
- **Format Conversion**: Calibre (MOBI → EPUB)
- **Captcha**: svg-captcha
- **Email**: nodemailer

### Deployment

- **Containerization**: Docker + Docker Compose
- **Web Server**: Nginx (frontend)
- **Platform Support**: 
  - macOS
  - Windows (WSL)
  - Linux
  - Synology NAS
  - Other Docker-supported platforms

---

## 📦 Quick Start

### Prerequisites

- **Docker**: 20.10+ and Docker Compose 2.0+
- **Memory**: At least 2GB available memory (4GB+ recommended)
- **Disk Space**: At least 5GB available disk space (10GB+ recommended)
- **Network**: Internet access required (for downloading images and dependencies)

### System Requirements

#### macOS
- macOS 10.15+ (Catalina or later)
- Docker Desktop for Mac

#### Windows
- Windows 10/11 (64-bit)
- WSL 2 or Docker Desktop for Windows

#### Linux
- Ubuntu 20.04+ / Debian 11+ / CentOS 8+ / Fedora 34+
- Docker Engine 20.10+
- Docker Compose 2.0+

#### Synology NAS
- DSM 7.0+ or DSM 6.2+
- Docker Package

---

## 🐳 Installation

### Method 1: One-Click Installation Script (Recommended)

This is the simplest and fastest installation method. The script will automatically complete all configurations.

#### 1. Clone the Project

```bash
# Clone project to local
git clone https://github.com/ttbye/readknows.git
cd readknows
```

#### 2. Run Installation Script

```bash
# Grant execute permission
chmod +x install.sh

# Run installation script
./install.sh
```

The installation script will prompt you to select your preferred language (English or Chinese) at the beginning.

#### 3. Installation Script Features

The `install.sh` script automatically performs the following operations:

1. **Environment Check**
   - Check if Docker is installed
   - Check if Docker Compose is installed
   - Check if Docker service is running
   - Check Docker registry mirror configuration

2. **Platform Detection**
   - Auto-detect operating system platform (macOS/Windows/Linux/Synology)
   - Auto-select corresponding docker-compose configuration file
   - Support manual configuration file selection

3. **Configuration File Creation**
   - Automatically create `.env` environment variable file
   - Automatically generate JWT_SECRET (random key)
   - Configure default environment variables

4. **Directory Creation**
   - Create data directory structure
   - Create book storage directory
   - Create cover storage directory
   - Create font storage directory
   - Create import directory

5. **Port Check**
   - Check if port 1280 (frontend) is occupied
   - Check if port 1281 (backend) is occupied
   - Provide port conflict solutions

6. **Container Management**
   - Check and stop existing containers
   - Build Docker images (if not exist)
   - Start service containers

7. **Service Readiness Check**
   - Wait for services to start
   - Check service health status

8. **Calibre Installation** (Optional)
   - Check if Calibre is installed
   - Prompt to install Calibre (MOBI to EPUB conversion)

9. **Admin Initialization** (Optional)
   - Initialize default admin account
   - Set default admin password

#### 4. Installation Script Interaction

During installation, the script will prompt you for the following choices:

- **Select Deployment Environment** (if auto-detection fails):
  ```
  1) Standard environment (sh/docker-compose.yml)
  2) macOS environment (sh/docker-compose-MACOS.yml)
  3) Windows environment (sh/docker-compose-WINDOWS.yml)
  4) Linux environment (sh/docker-compose-Linux.yml)
  5) Synology environment (sh/docker-compose-Synology.yml)
  ```

- **Pre-pull Base Images** (speed up build):
  - Select `Y` to download base images (node, nginx, etc.) first
  - Select `n` to download automatically during build

- **Install Calibre** (MOBI to EPUB conversion):
  - Select `Y` to automatically install Calibre
  - Select `n` to install manually later

- **Initialize Admin Account**:
  - Select `Y` to create default admin account
  - Select `n` to initialize manually later

#### 5. Installation Complete

After installation completes, you will see:

```
========================================
Installation Complete
========================================
✅ ReadKnows has been successfully installed and started!

Access addresses:
  🌐 Frontend: http://localhost:1280
  🔌 Backend API: http://localhost:1281

Next steps:
  1. Open browser and visit http://localhost:1280
  2. Login with the admin account created during initialization
  3. Start using ReadKnows!
```

### Method 2: Manual Docker Deployment

If you want to manually control the deployment process, follow these steps.

#### 1. Clone the Project

```bash
git clone https://github.com/ttbye/readknows.git
cd readknows
```

#### 2. Create Environment Variables File

Create `.env` file:

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
EOF
```

#### 3. Create Data Directories

```bash
# Create data directory structure
mkdir -p data/backend/{data,books,covers,fonts,import}
```

#### 4. Select docker-compose File

Select the corresponding configuration file based on your platform:

- **Standard Environment**: `sh/docker-compose.yml`
- **macOS**: `sh/docker-compose-MACOS.yml`
- **Windows**: `sh/docker-compose-WINDOWS.yml`
- **Linux**: `sh/docker-compose-Linux.yml`
- **Synology NAS**: `sh/docker-compose-Synology.yml`

#### 5. Build and Start Services

```bash
# Enter sh directory
cd sh

# Build and start with standard configuration
docker compose -f docker-compose.yml up -d --build

# Or use platform-specific configuration (Linux example)
docker compose -f docker-compose-Linux.yml up -d --build
```

#### 6. Check Service Status

```bash
# Check container status
docker compose -f docker-compose.yml ps

# View logs
docker compose -f docker-compose.yml logs -f
```

#### 7. Initialize Admin Account

```bash
# Execute initialization script
docker compose -f docker-compose.yml exec backend node scripts/initAdmin.js

# Or use script in project root
cd ..
chmod +x sh/init-admin.sh
./sh/init-admin.sh
```

### Method 3: Synology NAS Deployment

#### 1. Connect to Synology via SSH

```bash
ssh admin@your-nas-ip
```

#### 2. Clone the Project

```bash
cd /volume1/docker  # Or other directory where you want to install
git clone https://github.com/ttbye/readknows.git
cd readknows
```

#### 3. Modify docker-compose-Synology.yml

Modify data directory paths according to your Synology configuration:

```yaml
volumes:
  - /volume1/docker/ReadKnows/data:/app/data
  - /volume1/docker/ReadKnows/books:/app/books
  # ... other directories
```

#### 4. Run Installation Script

```bash
chmod +x install.sh
./install.sh
```

The installation script will automatically detect Synology environment and use corresponding configuration.

#### 5. Manage via Synology Docker Package

You can also manage containers through Synology's Docker Package GUI:

1. Open **Docker** Package
2. Select **Container** tab
3. Find `readknows-backend` and `readknows-frontend` containers
4. You can start, stop, view logs, etc. here

---

## ⚙️ Configuration

### Environment Variables

The `.env` file contains the following configuration items:

```env
# ============================================
# JWT Authentication Configuration
# ============================================
JWT_SECRET=your-secret-key-here-change-in-production
JWT_EXPIRES_IN=7d

# ============================================
# Douban API Configuration (Optional)
# ============================================
# Used for automatic book information retrieval, requires Douban API Key
DOUBAN_API_BASE=https://api.douban.com/v2

# ============================================
# AI Configuration (Optional)
# ============================================
# AI service provider: ollama, openai, anthropic, etc.
AI_PROVIDER=ollama

# AI API Address
# If using Ollama, frontend nginx will proxy to OLLAMA_URL
AI_API_URL=http://frontend:1280/ollama-proxy

# AI API Key (required for some services)
AI_API_KEY=

# AI Model Name
AI_MODEL=llama2

# ============================================
# Ollama Server Configuration
# ============================================
# Ollama Server Address
# If Ollama is on host machine: http://host.docker.internal:11434
# If Ollama is on another machine in LAN: http://192.168.1.100:11434
OLLAMA_URL=http://host.docker.internal:11434
```

### Data Directory Structure

Default data directory structure:

```
data/
├── backend/
│   ├── data/          # SQLite database files
│   │   └── database.db
│   ├── books/         # Book file storage directory
│   │   ├── public/    # Public books
│   │   └── user/      # User private books
│   ├── covers/        # Cover image storage directory
│   ├── fonts/         # Font file storage directory
│   └── import/        # Import directory (monitors this directory for auto-import)
```

### Port Configuration

Default port configuration:

- **Frontend**: 1280 (HTTP)
- **Backend API**: 1281 (HTTP)

To modify ports:

Modify port mappings in `docker-compose.yml`:

```yaml
services:
  frontend:
    ports:
      - "8080:1280"  # Change frontend port to 8080
  backend:
    ports:
      - "8081:1281"  # Change backend port to 8081
```

### Network Configuration

#### Access Host Services

If you need to access services on the host machine (such as Ollama) from containers, use `host.docker.internal`:

```env
OLLAMA_URL=http://host.docker.internal:11434
```

#### Access Other Devices on LAN

Use IP address directly:

```env
OLLAMA_URL=http://192.168.1.100:11434
```

---

## 📖 Documentation

### First Login

After installation, login with default admin account:

- **Username**: `books`
- **Password**: `books`
- **Email**: `admin@readknows.local`

> ⚠️ **Security Warning**: Please change the default password immediately after first login!

### Install Calibre (MOBI to EPUB Conversion)

If you need MOBI to EPUB conversion, install Calibre:

```bash
# Method 1: Use installation script (Recommended)
chmod +x sh/install-calibre.sh
./sh/install-calibre.sh

# Method 2: Manual installation
docker compose exec backend bash
# Execute installation script inside container
```

After installation, the system will automatically support MOBI format conversion.

### Initialize Admin Account

If you skipped admin initialization during installation, you can initialize manually:

```bash
# Method 1: Use script
chmod +x sh/init-admin.sh
./sh/init-admin.sh

# Method 2: Direct execution
docker compose exec backend node scripts/initAdmin.js
```

### Batch Import Books

#### Method 1: Import via Web Interface

1. Login to system
2. Go to **Upload** page
3. Click **Batch Import** or **Scan Import**
4. Select directory to import
5. System will automatically scan and import books

#### Method 2: File Monitoring Auto-Import

1. Place book files in `data/backend/import/` directory
2. System will automatically monitor this directory
3. Auto-import when new files are detected

#### Method 3: Manual File Copy

1. Copy book files to `data/backend/books/public/` or `data/backend/books/user/{username}/`
2. Click **Scan Import** in Web interface
3. System will scan and identify new files

### Common Management Commands

```bash
# Check service status
docker compose -f sh/docker-compose.yml ps

# View logs
docker compose -f sh/docker-compose.yml logs -f

# View backend logs
docker compose -f sh/docker-compose.yml logs -f backend

# View frontend logs
docker compose -f sh/docker-compose.yml logs -f frontend

# Restart services
docker compose -f sh/docker-compose.yml restart

# Stop services
docker compose -f sh/docker-compose.yml stop

# Start services
docker compose -f sh/docker-compose.yml start

# Stop and remove containers
docker compose -f sh/docker-compose.yml down

# Stop and remove containers and volumes (Warning: will delete data)
docker compose -f sh/docker-compose.yml down -v

# Rebuild images
docker compose -f sh/docker-compose.yml build --no-cache

# Enter backend container
docker compose -f sh/docker-compose.yml exec backend bash

# Enter frontend container
docker compose -f sh/docker-compose.yml exec frontend sh
```

### Data Backup

#### Backup Database

```bash
# Backup database file
cp data/backend/data/database.db backup/database-$(date +%Y%m%d).db
```

#### Backup Book Files

```bash
# Backup books directory
tar -czf backup/books-$(date +%Y%m%d).tar.gz data/backend/books/
```

#### Full Backup

```bash
# Backup entire data directory
tar -czf backup/readknows-$(date +%Y%m%d).tar.gz data/backend/
```

### Data Restore

```bash
# Restore database
cp backup/database-20251213.db data/backend/data/database.db

# Restore book files
tar -xzf backup/books-20251213.tar.gz -C data/backend/

# Restore full data
tar -xzf backup/readknows-20251213.tar.gz -C data/backend/
```

### Image Management

#### Export Images (for migration)

```bash
# Use script to export
chmod +x sh/Dockerexport-images.sh
./sh/Dockerexport-images.sh

# Or manually export
docker save ttbye/readknows-backend:latest -o docker-images/readknows-backend-latest.tar
docker save ttbye/readknows-frontend:latest -o docker-images/readknows-frontend-latest.tar
```

#### Import Images (on new server)

```bash
# Use script to import
chmod +x sh/Dockerimport-images.sh
./sh/Dockerimport-images.sh

# Or manually import
docker load -i docker-images/readknows-backend-latest.tar
docker load -i docker-images/readknows-frontend-latest.tar
```

---

## 🔧 Development Guide

### Local Development Environment Setup

#### 1. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

#### 2. Configure Environment Variables

Create `backend/.env`:

```env
PORT=1281
JWT_SECRET=dev-secret-key
JWT_EXPIRES_IN=7d
DB_PATH=./data/database.db
BOOKS_DIR=./books
```

#### 3. Initialize Database

```bash
cd backend
npm run build
npm start
# Database will be created automatically
```

#### 4. Start Development Servers

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

Access addresses:
- Frontend dev server: http://localhost:5173
- Backend dev server: http://localhost:1281

### Project Structure

```
readknows/
├── backend/                 # Backend service
│   ├── src/                # Source code
│   │   ├── db/            # Database related
│   │   ├── routes/        # API routes
│   │   ├── utils/         # Utility functions
│   │   └── index.ts       # Entry file
│   ├── scripts/           # Utility scripts
│   │   ├── initAdmin.js   # Initialize admin
│   │   ├── resetPassword.js
│   │   └── clearDatabase.js
│   ├── dist/              # Compiled output
│   ├── Dockerfile         # Docker configuration
│   ├── Dockerfile.debian  # Debian version Dockerfile
│   └── package.json
├── frontend/              # Frontend application
│   ├── src/              # Source code
│   │   ├── components/   # Components
│   │   ├── pages/        # Pages
│   │   ├── hooks/        # Hooks
│   │   ├── store/         # State management
│   │   ├── utils/         # Utility functions
│   │   └── App.tsx        # Entry component
│   ├── public/           # Static resources
│   ├── dist/             # Build output
│   ├── Dockerfile        # Docker configuration
│   └── package.json
├── sh/                   # Scripts directory
│   ├── docker-compose.yml           # Standard configuration
│   ├── docker-compose-MACOS.yml     # macOS configuration
│   ├── docker-compose-WINDOWS.yml   # Windows configuration
│   ├── docker-compose-Linux.yml     # Linux configuration
│   ├── docker-compose-Synology.yml  # Synology configuration
│   ├── install-calibre.sh           # Calibre installation script
│   ├── init-admin.sh                 # Admin initialization script
│   └── ...                          # Other scripts
├── data/                 # Data directory (created at runtime)
├── docker-images/        # Exported image files
├── install.sh           # One-click installation script
├── install-en.sh        # English installation script
├── install-zh.sh        # Chinese installation script
├── .env                 # Environment variables configuration
└── README.md            # Project documentation
```

### Build Project

#### Build Backend

```bash
cd backend
npm run build
```

#### Build Frontend

```bash
cd frontend
npm run build
```

#### Build Docker Images

```bash
# Build backend image
cd backend
docker build -t ttbye/readknows-backend:latest -f Dockerfile.debian .

# Build frontend image
cd frontend
docker build -t ttbye/readknows-frontend:latest .
```

### API Documentation

#### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/me` - Get current user information
- `POST /api/auth/logout` - User logout

#### Books

- `GET /api/books` - Get book list (supports pagination, search, sorting)
- `GET /api/books/:id` - Get book details
- `POST /api/books/upload` - Upload book
- `PUT /api/books/:id` - Update book information
- `DELETE /api/books/:id` - Delete book
- `GET /api/books/recent` - Get recently added books
- `POST /api/books/:id/extract-cover` - Extract book cover

#### Library

- `GET /api/shelf/my` - Get my library
- `POST /api/shelf/add` - Add to library
- `DELETE /api/shelf/remove/:bookId` - Remove from library
- `GET /api/shelf/check/:bookId` - Check if in library

#### Reading

- `GET /api/reading/progress` - Get all reading progress
- `GET /api/reading/progress/:bookId` - Get book reading progress
- `POST /api/reading/progress` - Update reading progress
- `GET /api/reading/history` - Get reading history
- `GET /api/reading/history/stats/summary` - Get reading statistics

#### Notes

- `GET /api/notes` - Get note list
- `POST /api/notes` - Create note
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note

#### Highlights (EPUB)

- `GET /api/highlights/book/:bookId` - Get highlight list for a book
- `POST /api/highlights` - Add/update highlight (supports offline upsert)
- `DELETE /api/highlights/:id` - Delete highlight (soft delete)

#### AI

- `GET /api/ai/test` - Test AI configuration
- `POST /api/ai/chat` - AI chat

#### User Management (Admin)

- `GET /api/users` - Get user list
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user information
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/:id/reset-password` - Reset user password

#### IP Management (Admin)

- `GET /api/ip/whitelist` - Get IP whitelist
- `POST /api/ip/whitelist` - Add IP to whitelist
- `DELETE /api/ip/whitelist/:id` - Remove from whitelist
- `GET /api/ip/blacklist` - Get IP blacklist
- `POST /api/ip/blacklist` - Add IP to blacklist
- `DELETE /api/ip/blacklist/:id` - Remove from blacklist

#### Others

- `GET /api/health` - Health check
- `GET /api/fonts` - Get font list
- `POST /api/fonts/upload` - Upload font
- `GET /opds` - OPDS catalog

---

## 🤝 Contributing

We welcome all forms of contributions!

### How to Contribute

1. **Report Issues**: Report bugs or suggest features in [Issues](https://github.com/ttbye/readknows/issues)
2. **Submit Code**: Fork the project, create a feature branch, submit Pull Request
3. **Improve Documentation**: Help improve project documentation
4. **Share Feedback**: Share usage experience and improvement suggestions

### Development Workflow

1. Fork this repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

### Code Standards

- Use TypeScript for type checking
- Follow ESLint code standards
- Run tests before committing
- Write clear commit messages
- Add necessary comments

---

## 📝 Version History

### v1.225.12 (2025-12-26)

#### ✨ New Features

1. **TTS-API-Lite (Lightweight TTS Online Generation API System)**
   - Lightweight TTS service, recommended for regular servers
   - Provides online TTS generation API
   - Low resource usage, suitable for production environments

2. **TTS-API (Full TTS Service)**
   - Supports online TTS and local TTS generation
   - Requires higher GPU hardware
   - Slower voice generation, for experience only

3. **Office Document Support**
   - Added Office document (Word, Excel, PowerPoint) upload functionality
   - Supports simple document browsing

4. **Note Export and Import Enhancement**
   - Notes and highlights can be exported as Markdown
   - Supports adding exported notes as new books to server

5. **Voice Reading Feature (Beta)**
   - Uses online Edge-TTS for voice reading
   - Currently Beta version, for experience only
   - Will continue to be improved in future versions

#### 🐛 Fixes

1. **Fixed Ollama Local Service Connection Issue**
   - Fixed local Ollama service connection problem
   - Improved service discovery and connection mechanism

2. **Fixed Multiple Bugs**
   - Fixed multiple known issues
   - Improved system stability and performance

#### ⚠️ Known Issues

1. **Voice Reading Feature Experience Needs Improvement**
   - Current voice reading feature is Beta version
   - Experience needs improvement
   - Will continue to optimize in future versions

2. **OPDS Feature Has Temporary Issues**
   - OPDS feature currently has some issues
   - Being fixed, expected to be resolved in next version

#### 📋 Technical Details

- **Version**: 1.225.12
- **Build Date**: 2025-12-26
- **Node.js**: 20.x
- **Database**: SQLite

### v1.2025.12 (2025-12-17)

#### ✨ New Features / Optimizations

- ✅ EPUB highlights (offline cache + online sync) and highlight click re-selection
- ✅ Text selection menu upgrade (highlight/note/copy/search/dictionary/translate)
- ✅ Notes and highlights export to Markdown; can import as "Note Book" (private book, categorized as "Notes", cover with "Notes" overlay)
- ✅ Cross-device progress change notifications (detect when returning to foreground/focus; includes chapter info; avoid duplicate notifications)
- ✅ EPUB progress display changed to percentage (2 decimal places) for better stability

#### 🐛 Fixes

- ✅ epubjs hooks compatibility: Fixed various TypeErrors and Locations.parse(ownerDocument) related errors
- ✅ PDF mobile/PWA vertical stretch distortion issue
- ✅ Markdown reader margins and rendering style optimization
- ✅ Top navigation bar fixed and pull-to-refresh experience fixes

---

### Previous Versions

#### Versions before v1.1025.12

- ✅ Initial version release
- ✅ Support for EPUB, PDF, TXT, MOBI formats
- ✅ Multi-user system
- ✅ PWA support
- ✅ Docker deployment
- ✅ AI integration (Ollama)
- ✅ Batch import functionality
- ✅ Reading notes and highlights
- ✅ Book category management
- ✅ User management features
- ✅ IP access control
- ✅ OPDS support
- ✅ Full-text search
- ✅ Reading statistics
- ✅ File monitoring auto-import

---

## Screenshots
<img width="2634" height="2434" alt="image" src="https://github.com/user-attachments/assets/b097653e-546d-4541-a233-b328ec977956" />
<img width="2628" height="2382" alt="image" src="https://github.com/user-attachments/assets/a75f07ab-188f-4d38-bac3-13a7269bee5a" />
<img width="856" height="1858" alt="image" src="https://github.com/user-attachments/assets/8118a411-1eed-4367-a7fa-2aa47ec671ee" />
<img width="856" height="1862" alt="image" src="https://github.com/user-attachments/assets/1015994a-67e1-4ed2-b883-87c0516097da" />


## 🐛 FAQ

### Docker Related Issues

#### Q: What to do if container fails to start?

A: Check the following:

1. **Check if Docker service is running**:
   ```bash
   docker info
   ```

2. **Check if ports are occupied**:
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
   docker compose logs backend
   docker compose logs frontend
   ```

4. **Check disk space**:
   ```bash
   df -h
   ```

#### Q: EPUB cover cannot be extracted/displayed

A: Usually a directory permission issue:

```bash
# Fix permissions
sudo chmod -R 777 data/backend/covers

# Restart container
docker compose restart backend
```

#### Q: Cannot access host services (such as Ollama)

A: Check network configuration:

1. **Use host.docker.internal**:
   ```env
   OLLAMA_URL=http://host.docker.internal:11434
   ```

2. **Linux requires additional configuration**:
   ```bash
   # Add to docker-compose.yml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```

### Feature Related Issues

#### Q: MOBI files cannot be converted

A: Need to install Calibre:

```bash
./sh/install-calibre.sh
```

#### Q: Large file upload fails

A: Check the following configurations:

1. **Nginx upload size limit** (frontend):
   Modify `client_max_body_size` in `frontend/nginx.conf`

2. **Backend request size limit**:
   Already set to 500MB in code

#### Q: Forgot admin password

A: Reset password:

```bash
docker compose exec backend node scripts/resetPassword.js
```

### Performance Optimization

#### Q: How to improve performance?

A: Recommendations:

1. **Use SSD storage for data directory**
2. **Increase Docker memory limit**
3. **Regularly clean unused images and containers**
4. **Use reverse proxy (Nginx) to cache static resources**

---

## 🔒 Security

### Production Environment Security Recommendations

1. **Change Default Password**: Change default admin password immediately after first login
2. **Use Strong Password**: JWT_SECRET should use strong random string
3. **Configure HTTPS**: Recommend using Nginx reverse proxy to configure HTTPS
4. **Regular Backups**: Regularly backup database and book files
5. **IP Access Control**: Configure IP whitelist to limit access
6. **Update Dependencies**: Regularly update dependencies to fix security vulnerabilities
7. **Firewall Configuration**: Configure firewall rules to limit port access

### Data Security

- Passwords stored encrypted with bcrypt
- JWT Token has expiration time
- Supports IP access control
- Database file permission control

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
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [Vite](https://vitejs.dev/) - Build tool

---

## 📮 Contact

- **Author**: ttbye
- **Project URL**: https://github.com/ttbye/readknows
- **Issue Tracker**: https://github.com/ttbye/readknows/issues

---

## ⭐ Star History

If this project helps you, please give it a Star ⭐!

---

<div align="center">

**Made with ❤️ by ttbye**

[⬆ Back to Top](#-readknows-private-digital-library)

</div>

