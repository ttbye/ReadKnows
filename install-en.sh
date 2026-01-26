#!/bin/bash

# ReadKnows One-Click Installation and Deployment Script
# For installing and deploying ReadKnows Docker containers

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print colored messages
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker not found, please install Docker first"
        echo ""
        print_info "Docker installation methods:"
        echo "  Ubuntu/Debian: curl -fsSL https://get.docker.com | sh"
        echo "  Or visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    print_success "Docker installed: $(docker --version)"
}

# Check if Docker Compose is installed
check_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
        print_success "Docker Compose installed: $(docker-compose --version)"
    elif docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
        print_success "Docker Compose installed: $(docker compose version)"
    else
        print_error "Docker Compose not found, please install Docker Compose first"
        echo ""
        print_info "Docker Compose installation methods:"
        echo "  Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
}

# Check if Docker service is running
check_docker_service() {
    if ! docker info &> /dev/null; then
        print_error "Docker service is not running, please start Docker service"
        echo ""
        print_info "Docker service startup methods:"
        echo "  Linux: sudo systemctl start docker"
        echo "  macOS: Open Docker Desktop"
        exit 1
    fi
    print_success "Docker service is running"
}

# Check Docker registry mirror configuration
check_docker_registry() {
    print_info "Checking Docker registry mirror configuration..."
    
    # Get registry mirror configuration
    REGISTRY_INFO=$(docker info 2>/dev/null | grep -A 10 "Registry Mirrors" || echo "")
    
    if [ -z "$REGISTRY_INFO" ] || echo "$REGISTRY_INFO" | grep -q "hub-mirror.c.163.com"; then
        # Test registry mirror connectivity
        if echo "$REGISTRY_INFO" | grep -q "hub-mirror.c.163.com"; then
            print_warning "Detected potentially inaccessible registry mirror: hub-mirror.c.163.com"
            echo ""
            print_info "If build fails, run the fix script:"
            echo "  ./fix-docker-registry.sh"
            echo ""
            print_info "Or manually fix:"
            echo "  1. Open Docker Desktop"
            echo "  2. Settings → Docker Engine"
            echo "  3. Remove or replace inaccessible registry mirrors"
            echo "  4. Click 'Apply & Restart'"
            echo ""
            read -p "Continue installation? (Y/n, default: Y): " continue_with_registry
            continue_with_registry=${continue_with_registry:-y}
            if [ "$continue_with_registry" != "y" ] && [ "$continue_with_registry" != "Y" ]; then
                print_info "Installation cancelled, please fix registry configuration first"
                exit 0
            fi
        fi
    else
        print_success "Docker registry mirror configuration is normal"
    fi
}

# Get project root directory
get_project_root() {
    # Get script directory
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # If script is in sh/ directory, return parent directory (project root)
    if [ "$(basename "$SCRIPT_DIR")" = "sh" ]; then
        echo "$(dirname "$SCRIPT_DIR")"
    # If script is in tts-service directory, return parent directory (project root)
    elif [ "$(basename "$SCRIPT_DIR")" = "tts-service" ]; then
        echo "$(dirname "$SCRIPT_DIR")"
    # Otherwise return script directory
    else
        echo "$SCRIPT_DIR"
    fi
}

# Detect operating system platform
detect_platform() {
    local platform=""
    local uname_s=$(uname -s)
    
    # Detect macOS
    if [ "$uname_s" = "Darwin" ]; then
        platform="macos"
    # Detect Windows (WSL or Git Bash)
    elif [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ] || \
         echo "$uname_s" | grep -qE "^MINGW(64|32)_NT" || \
         echo "$uname_s" | grep -qE "^MSYS_NT" || \
         echo "$uname_s" | grep -qE "^CYGWIN_NT"; then
        platform="windows"
    # Detect Linux/Synology (Synology also uses Linux configuration)
    elif [ "$uname_s" = "Linux" ]; then
        platform="linux"
    else
        platform="unknown"
    fi
    
    echo "$platform"
}

# Detect if running in Synology/NAS environment
detect_nas_environment() {
    # Method 1: Check environment variables
    if [ "$SYNOLOGY" = "true" ] || [ "$SYNO" = "true" ] || [ "$NAS" = "true" ]; then
        return 0
    fi
    
    # Method 2: Check hostname
    if command -v hostname &> /dev/null; then
        HOSTNAME=$(hostname | tr '[:upper:]' '[:lower:]')
        if echo "$HOSTNAME" | grep -qE "(synology|diskstation|ds[0-9])"; then
            return 0
        fi
    fi
    
    # Method 3: Check if running in Docker container and might be NAS environment
    if [ -f "/.dockerenv" ]; then
        # Check network interface (Synology Docker usually has specific configuration)
        if [ -f "/proc/net/route" ] && grep -q "172\.17\|172\.18" /proc/net/route 2>/dev/null; then
            return 0
        fi
    fi
    
    return 1
}

# Global variable: docker-compose file path
COMPOSE_FILE_PATH=""

# Manually select docker-compose file
manual_select_compose_file() {
    PROJECT_ROOT=$(get_project_root)
    
    print_info "Please select deployment environment:"
    echo "  1) Standard environment (sh/docker-compose.yml) - General configuration"
    echo "  2) macOS environment (sh/docker-compose-MACOS.yml)"
    echo "  3) Windows environment (sh/docker-compose-WINDOWS.yml)"
    echo "  4) Linux environment (sh/docker-compose-Linux.yml)"
    echo "  5) Synology environment (sh/docker-compose-Synology.yml)"
    echo ""
    read -p "Enter option (1-5, default: 1): " env_choice
    env_choice=${env_choice:-1}
    
    case $env_choice in
        2)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-MACOS.yml" ]; then
                COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose-MACOS.yml"
                print_success "Using macOS configuration: sh/docker-compose-MACOS.yml"
                return 0
            else
                print_warning "sh/docker-compose-MACOS.yml not found, using default configuration"
            fi
            ;;
        3)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml" ]; then
                COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml"
                print_success "Using Windows configuration: sh/docker-compose-WINDOWS.yml"
                return 0
            else
                print_warning "sh/docker-compose-WINDOWS.yml not found, using default configuration"
            fi
            ;;
        4)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-Linux.yml" ]; then
                COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose-Linux.yml"
                print_success "Using Linux configuration: sh/docker-compose-Linux.yml"
                return 0
            else
                print_warning "sh/docker-compose-Linux.yml not found, using default configuration"
            fi
            ;;
        5)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-Synology.yml" ]; then
                COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose-Synology.yml"
                print_success "Using Synology configuration: sh/docker-compose-Synology.yml"
                return 0
            else
                print_warning "sh/docker-compose-Synology.yml not found, using default configuration"
            fi
            ;;
        1|*)
            ;;
    esac
    
    # Default to docker-compose.yml
    if [ -f "$PROJECT_ROOT/sh/docker-compose.yml" ]; then
        COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/docker-compose.yml"
        print_success "Using standard configuration: sh/docker-compose.yml"
        return 0
    else
        print_error "sh/docker-compose.yml file not found"
        exit 1
    fi
}

# Select docker-compose file
select_compose_file() {
    PROJECT_ROOT=$(get_project_root)
    
    # If COMPOSE_FILE environment variable is set, use it
    if [ -n "$COMPOSE_FILE" ]; then
        # If path starts with sh/, use directly; otherwise try to find in sh/ directory
        if [ -f "$PROJECT_ROOT/$COMPOSE_FILE" ]; then
            COMPOSE_FILE_PATH="$PROJECT_ROOT/$COMPOSE_FILE"
            print_info "Using configuration file specified by environment variable: $COMPOSE_FILE"
            return 0
        elif [ -f "$PROJECT_ROOT/sh/$COMPOSE_FILE" ]; then
            COMPOSE_FILE_PATH="$PROJECT_ROOT/sh/$COMPOSE_FILE"
            print_info "Using configuration file specified by environment variable: sh/$COMPOSE_FILE"
            return 0
        else
            print_warning "Configuration file specified by environment variable does not exist: $COMPOSE_FILE, will auto-select"
        fi
    fi
    
    # Detect platform
    PLATFORM=$(detect_platform)
    print_info "Detected platform: $PLATFORM"
    
    # Select corresponding docker-compose file based on platform
    AUTO_SELECTED_FILE=""
    AUTO_SELECTED_NAME=""
    
    case $PLATFORM in
        macos)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-MACOS.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose-MACOS.yml"
                AUTO_SELECTED_NAME="sh/docker-compose-MACOS.yml"
            fi
            ;;
        windows)
            if [ -f "$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml"
                AUTO_SELECTED_NAME="sh/docker-compose-WINDOWS.yml"
            fi
            ;;
        linux)
            # Linux platform (including Synology), prioritize Linux config, then Synology config, finally default config
            if [ -f "$PROJECT_ROOT/sh/docker-compose-Linux.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose-Linux.yml"
                AUTO_SELECTED_NAME="sh/docker-compose-Linux.yml"
            elif [ -f "$PROJECT_ROOT/sh/docker-compose-Synology.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose-Synology.yml"
                AUTO_SELECTED_NAME="sh/docker-compose-Synology.yml"
            elif [ -f "$PROJECT_ROOT/sh/docker-compose.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose.yml"
                AUTO_SELECTED_NAME="sh/docker-compose.yml (Standard configuration)"
            fi
            ;;
        unknown)
            # Unknown platform, use default configuration
            if [ -f "$PROJECT_ROOT/sh/docker-compose.yml" ]; then
                AUTO_SELECTED_FILE="$PROJECT_ROOT/sh/docker-compose.yml"
                AUTO_SELECTED_NAME="sh/docker-compose.yml (Standard configuration)"
            fi
            ;;
    esac
    # if [-n "$Auto-test-c"]
    # If auto-selection succeeded, ask user to confirm
    if [ -n "$AUTO_SELECTED_FILE" ] && [ -f "$AUTO_SELECTED_FILE" ]; then
        print_success "Auto-selected configuration file: $AUTO_SELECTED_NAME"
        echo ""
        read -p "Use this configuration? (Y/n, default: Y): " confirm_choice
        confirm_choice=${confirm_choice:-y}
        
        if [ "$confirm_choice" = "y" ] || [ "$confirm_choice" = "Y" ]; then
            COMPOSE_FILE_PATH="$AUTO_SELECTED_FILE"
            print_success "Confirmed using: $AUTO_SELECTED_NAME"
        return 0
    else
            print_info "Auto-selection cancelled, please manually select configuration"
            echo ""
            manual_select_compose_file
            return $?
        fi
    else
        # If auto-selection failed, directly ask user
        print_warning "Unable to auto-select configuration file, please manually select"
        echo ""
        manual_select_compose_file
        return $?
    fi
}

# Check necessary files
check_files() {
    PROJECT_ROOT=$(get_project_root)
    
    # Select docker-compose file
    select_compose_file
    
    # Update COMPOSE_CMD to include -f parameter
    if [ -n "$COMPOSE_FILE_PATH" ]; then
        COMPOSE_CMD="$COMPOSE_CMD -f $COMPOSE_FILE_PATH"
        print_info "Docker Compose command: $COMPOSE_CMD"
    fi
    
    if [ ! -f "$PROJECT_ROOT/backend/Dockerfile" ]; then
        print_warning "Backend Dockerfile not found, will use docker-compose to build"
    fi
    
    if [ ! -f "$PROJECT_ROOT/frontend/Dockerfile" ]; then
        print_warning "Frontend Dockerfile not found, will use docker-compose to build"
    fi
    
    print_success "Necessary files check completed"
}

# Create .env file
create_env_file() {
    PROJECT_ROOT=$(get_project_root)
    ENV_FILE="$PROJECT_ROOT/.env"
    
    if [ -f "$ENV_FILE" ]; then
        print_info ".env file already exists, skipping creation"
        return
    fi
    
    print_info "Creating .env configuration file..."
    
    # Generate random JWT secret
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    
    cat > "$ENV_FILE" << EOF
# JWT Configuration
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# Douban API Configuration (Optional)
DOUBAN_API_BASE=

# AI Configuration (Optional)
AI_PROVIDER=ollama
AI_API_URL=http://frontend:1280/ollama-proxy
AI_API_KEY=
AI_MODEL=llama2

# Ollama Server Address (for nginx proxy)
# If ollama is on the host machine, use: http://host.docker.internal:11434
# If ollama is on another machine in the LAN, use: http://192.168.1.100:11434
OLLAMA_URL=http://host.docker.internal:11434

# TTS Configuration (Optional)
# Qwen3-TTS API Key (if you need to use Qwen3-TTS, configure this key)
# How to get: Visit https://dashscope.console.aliyun.com/ to apply for API key
QWEN3_TTS_API_KEY=
QWEN3_TTS_API_URL=https://dashscope.aliyuncs.com/api/v1/services/audio/tts
EOF
    
    print_success ".env file created: $ENV_FILE"
    print_warning "Please edit the configuration in .env file as needed"
}

# Create necessary directories
create_directories() {
    PROJECT_ROOT=$(get_project_root)
    
    print_info "Creating necessary directories..."
    
    # Determine if it's NAS environment based on selected compose file
    if echo "$COMPOSE_FILE_PATH" | grep -qiE "(NAS|Synology|Linux)"; then
        # Default path for NAS environment
        DEFAULT_DATA_DIR="/volume5/docker/ReadKnows"
        if [ -d "$DEFAULT_DATA_DIR" ]; then
            print_info "Using NAS default data directory: $DEFAULT_DATA_DIR"
        else
            print_warning "NAS default data directory does not exist: $DEFAULT_DATA_DIR"
            print_info "Please ensure correct volume paths are configured in docker-compose-NAS.yml"
        fi
    else
        # Default path for standard environment
        DEFAULT_DATA_DIR="$PROJECT_ROOT/data"
        if [ ! -d "$DEFAULT_DATA_DIR" ]; then
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/data"
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/books"
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/covers"
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/fonts"
            mkdir -p "$DEFAULT_DATA_DIR/ReadKnows/import"
            print_info "Created local data directory: $DEFAULT_DATA_DIR"
        else
            print_info "Data directory already exists: $DEFAULT_DATA_DIR"
        fi
        print_warning "If you need to use other paths, please modify the volumes configuration in docker-compose.yml"
    fi
}

# Check port occupancy
check_ports() {
    print_info "Checking port occupancy..."
    
    check_port() {
        local port=$1
        local name=$2
        
        if command -v lsof &> /dev/null; then
            if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
                print_warning "Port $port ($name) is already in use"
                return 1
            else
                print_success "Port $port ($name) is available"
                return 0
            fi
        elif command -v netstat &> /dev/null; then
            if netstat -tuln 2>/dev/null | grep -q ":$port "; then
                print_warning "Port $port ($name) is already in use"
                return 1
            else
                print_success "Port $port ($name) is available"
                return 0
            fi
        else
            print_warning "Port checking tool not found, skipping check"
            return 0
        fi
    }
    
    PORT_1280_OK=0
    PORT_1281_OK=0
    
    check_port 1280 "Frontend" && PORT_1280_OK=1
    check_port 1281 "Backend" && PORT_1281_OK=1
    
    if [ $PORT_1280_OK -eq 0 ] || [ $PORT_1281_OK -eq 0 ]; then
        print_warning "Some ports are already in use, but will continue installation"
        echo ""
        read -p "Continue? (Y/n, default: Y): " continue_install
        continue_install=${continue_install:-y}
        if [ "$continue_install" != "y" ] && [ "$continue_install" != "Y" ]; then
            print_info "Installation cancelled"
            exit 0
        fi
    fi
}

# Stop existing containers
stop_existing_containers() {
    print_info "Checking existing containers..."
    
    if $COMPOSE_CMD ps -q | grep -q .; then
        print_warning "Found running containers"
        echo ""
        read -p "Stop and remove existing containers? (Y/n, default: Y): " remove_existing
        remove_existing=${remove_existing:-y}
        if [ "$remove_existing" = "y" ] || [ "$remove_existing" = "Y" ]; then
            print_info "Stopping and removing existing containers..."
            $COMPOSE_CMD down
            print_success "Existing containers stopped and removed"
        fi
    else
        print_success "No running containers found"
    fi
}

# Check if images exist
check_images_exist() {
    BACKEND_EXISTS=false
    FRONTEND_EXISTS=false
    
    # Read image names from docker-compose file
    if [ -f "$COMPOSE_FILE_PATH" ]; then
        # Extract backend service image name (find image: under backend: section)
        BACKEND_IMAGE=$(awk '/backend:/,/^[[:space:]]*[a-zA-Z]/ {if (/image:/) {gsub(/^[[:space:]]*image:[[:space:]]*/, ""); gsub(/["'\'']/, ""); print; exit}}' "$COMPOSE_FILE_PATH")
        # Extract frontend service image name (find image: under frontend: section)
        FRONTEND_IMAGE=$(awk '/frontend:/,/^[[:space:]]*[a-zA-Z]/ {if (/image:/) {gsub(/^[[:space:]]*image:[[:space:]]*/, ""); gsub(/["'\'']/, ""); print; exit}}' "$COMPOSE_FILE_PATH")
        
        # If extraction fails, use default values
        if [ -z "$BACKEND_IMAGE" ]; then
            BACKEND_IMAGE="ttbye/readknows-backend:latest"
        fi
        if [ -z "$FRONTEND_IMAGE" ]; then
            FRONTEND_IMAGE="ttbye/readknows-frontend:latest"
        fi
    else
        # If compose file doesn't exist, use default values
        BACKEND_IMAGE="ttbye/readknows-backend:latest"
        FRONTEND_IMAGE="ttbye/readknows-frontend:latest"
    fi
    
    # Check if images exist (docker images output format: REPOSITORY TAG)
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${BACKEND_IMAGE}$"; then
        BACKEND_EXISTS=true
        print_success "Found backend image: $BACKEND_IMAGE"
    else
        print_warning "Backend image not found: $BACKEND_IMAGE"
    fi
    
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${FRONTEND_IMAGE}$"; then
        FRONTEND_EXISTS=true
        print_success "Found frontend image: $FRONTEND_IMAGE"
    else
        print_warning "Frontend image not found: $FRONTEND_IMAGE"
    fi
    
    if [ "$BACKEND_EXISTS" = true ] && [ "$FRONTEND_EXISTS" = true ]; then
        return 0  # All images exist
    else
        return 1  # Images don't exist
    fi
}

# Pre-pull base images
pre_pull_images() {
    print_info "Pre-pulling base images to speed up build..."
    
    # Pull backend base image
    print_info "Pulling node:20-slim..."
    docker pull node:20-slim > /dev/null 2>&1 || print_warning "Failed to pull node:20-slim, will download automatically during build"
    
    # Pull frontend base image
    print_info "Pulling node:20-alpine..."
    docker pull node:20-alpine > /dev/null 2>&1 || print_warning "Failed to pull node:20-alpine, will download automatically during build"
    
    print_info "Pulling nginx:alpine..."
    docker pull nginx:alpine > /dev/null 2>&1 || print_warning "Failed to pull nginx:alpine, will download automatically during build"
    
    print_success "Base images pre-pull completed"
}

# Pull external service images (douban-api-rs, etc.)
pull_external_images() {
    print_info "Pulling external service images..."
    
    # Read external images from docker-compose file
    if [ -f "$COMPOSE_FILE_PATH" ]; then
        # Extract douban-rs-api service image name
        DOUBAN_IMAGE=$(awk '/douban-rs-api:/,/^[[:space:]]*[a-zA-Z]/ {if (/image:/) {gsub(/^[[:space:]]*image:[[:space:]]*/, ""); gsub(/["'\'']/, ""); print; exit}}' "$COMPOSE_FILE_PATH")
        
        if [ -n "$DOUBAN_IMAGE" ]; then
            print_info "Pulling Douban API image: $DOUBAN_IMAGE..."
            if docker pull "$DOUBAN_IMAGE" 2>&1; then
                print_success "Douban API image pulled successfully"
            else
                print_warning "Failed to pull Douban API image, will be pulled automatically on startup"
            fi
        fi
        
        # Add other external images here if needed
        # e.g., OCR API, TTS API, etc.
    else
        # If compose file doesn't exist, use default image
        print_info "Pulling Douban API image: ghcr.io/cxfksword/douban-api-rs..."
        if docker pull ghcr.io/cxfksword/douban-api-rs 2>&1; then
            print_success "Douban API image pulled successfully"
        else
            print_warning "Failed to pull Douban API image, will be pulled automatically on startup"
        fi
    fi
    
    print_success "External service images pull completed"
}

# Build and start services
build_and_start() {
    print_header "Build and Start Services"
    
    PROJECT_ROOT=$(get_project_root)
    # docker-compose file is in sh/ directory, build context path is relative to sh/ directory
    # So need to execute docker compose command in sh/ directory
    COMPOSE_DIR=""
    if [ -n "$COMPOSE_FILE_PATH" ]; then
        COMPOSE_DIR="$(dirname "$COMPOSE_FILE_PATH")"
    else
        COMPOSE_DIR="$PROJECT_ROOT/sh"
    fi
    
    # Switch to docker-compose file directory
    cd "$COMPOSE_DIR"
    
    # Ask if user wants to install Douban API service (optional, default: no)
    print_info "Douban API Service Configuration..."
    echo -e "${YELLOW}Douban API is used to automatically fetch book information (title, author, cover, etc.)${NC}"
    echo -e "${YELLOW}Note: Requires pulling image from GitHub Container Registry, may take a while${NC}"
    read -p "Install Douban API service? (y/N, default: N): " install_douban
    install_douban=${install_douban:-n}
    DOUBAN_PROFILE=""
    if [ "$install_douban" = "y" ] || [ "$install_douban" = "Y" ]; then
        print_info "Will install Douban API service"
        DOUBAN_PROFILE="--profile douban"
        # Pull Douban API image
        print_info "Pulling Douban API image..."
        if docker pull ghcr.io/cxfksword/douban-api-rs:latest 2>&1; then
            print_success "Douban API image pulled successfully"
        else
            print_warning "Failed to pull Douban API image, will be pulled automatically on startup"
        fi
        echo ""
    else
        print_info "Skipping Douban API service installation (default)"
        echo -e "${YELLOW}Tip: To install later, use: docker-compose --profile douban up -d${NC}"
        echo ""
    fi
    
    # Check if images exist
    print_info "Checking if images exist..."
    if check_images_exist; then
        print_info "Images detected, skipping build step"
        print_info "Starting services directly..."
        if [ -n "$DOUBAN_PROFILE" ]; then
            print_info "Starting services (with Douban API)..."
            $COMPOSE_CMD $DOUBAN_PROFILE up -d
        else
            $COMPOSE_CMD up -d
        fi
    else
        print_info "Images not found, will build images..."
        echo ""
        print_warning "Build process may take 5-15 minutes, depending on network speed and system performance"
        print_info "Build steps include:"
        echo "  1. Download base images (node, nginx)"
        echo "  2. Install dependencies"
        echo "  3. Compile frontend code"
        echo "  4. Compile backend code"
        echo "  5. Install Calibre (backend)"
        echo ""
        read -p "Pre-pull base images to speed up build? (Y/n, default: Y): " pre_pull
        pre_pull=${pre_pull:-y}
        if [ "$pre_pull" = "y" ] || [ "$pre_pull" = "Y" ]; then
            pre_pull_images
            echo ""
        fi
        
        print_info "Starting image build, please wait patiently..."
        print_info "Tip: You can press Ctrl+C to interrupt the build, then rerun this script later to continue"
        echo ""
        
        # Use buildx parallel build (if available)
        if docker buildx version &> /dev/null 2>&1; then
            print_info "Docker Buildx detected, will use parallel build..."
            $COMPOSE_CMD build --parallel
            if [ $? -eq 0 ]; then
                print_success "Image build completed"
                print_info "Starting services..."
                if [ -n "$DOUBAN_PROFILE" ]; then
                    print_info "Starting services (with Douban API)..."
                    $COMPOSE_CMD $DOUBAN_PROFILE up -d
                else
                    $COMPOSE_CMD up -d
                fi
            else
                print_error "Image build failed"
                exit 1
            fi
        else
            # Standard build
            if [ -n "$DOUBAN_PROFILE" ]; then
                $COMPOSE_CMD $DOUBAN_PROFILE up -d --build
            else
                $COMPOSE_CMD up -d --build
            fi
        fi
    fi
    
    if [ $? -eq 0 ]; then
        print_success "Services started successfully"
        
        # Display external service information
        echo ""
        print_info "External service information:"
        if [ -n "$DOUBAN_PROFILE" ]; then
            echo "  Douban API: Installed, please configure DOUBAN_API_BASE=http://douban-rs-api:1552 in system settings"
        else
            echo "  Douban API: Not installed (to install, run: docker-compose --profile douban up -d)"
        fi
        echo "  Calibre: Used for MOBI to EPUB conversion, will be installed automatically after container startup"
    else
        print_error "Service startup failed"
        exit 1
    fi
}

# Wait for services to be ready
wait_for_services() {
    print_info "Waiting for services to start..."
    
    local max_attempts=30
    local attempt=0
    
    # Determine container names based on compose file
    if echo "$COMPOSE_FILE_PATH" | grep -qiE "(NAS|Synology|Linux)"; then
        BACKEND_CONTAINER="knowbooks-backend"
        FRONTEND_CONTAINER="knowbooks-frontend"
    else
        BACKEND_CONTAINER="readknows-backend"
        FRONTEND_CONTAINER="readknows-frontend"
    fi
    
    while [ $attempt -lt $max_attempts ]; do
        if docker ps | grep -q "$BACKEND_CONTAINER" && docker ps | grep -q "$FRONTEND_CONTAINER"; then
            # Check health status (if using host network mode, health check may differ)
            if docker inspect "$BACKEND_CONTAINER" --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy"; then
                print_success "Services are ready"
                return 0
            elif docker inspect "$BACKEND_CONTAINER" --format='{{.State.Status}}' 2>/dev/null | grep -q "running"; then
                # If no health check, at least check if container is running
                print_success "Services started (containers running)"
                return 0
            fi
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    print_warning "Service startup timeout, but may still be running"
}

# Show service status
show_status() {
    print_header "Service Status"
    
    echo ""
    print_info "Container status:"
    $COMPOSE_CMD ps
    
    echo ""
    print_info "Service addresses:"
    echo "  Frontend: http://localhost:1280"
    echo "  Backend API: http://localhost:1281"
    echo ""
    
    print_info "Common commands:"
    echo "  View logs: $COMPOSE_CMD logs -f"
    echo "  View backend logs: $COMPOSE_CMD logs -f backend"
    echo "  View frontend logs: $COMPOSE_CMD logs -f frontend"
    echo "  Stop services: $COMPOSE_CMD down"
    echo "  Restart services: $COMPOSE_CMD restart"
    echo "  View status: $COMPOSE_CMD ps"
}

# Check and install Calibre
check_and_install_calibre() {
    print_header "Check Calibre Installation"
    
    print_info "Checking if Calibre is installed..."
    
    if docker compose exec -T backend test -f /usr/local/bin/ebook-convert 2>/dev/null || \
       docker compose exec -T backend test -f /opt/calibre/calibre/ebook-convert 2>/dev/null || \
       docker compose exec -T backend test -f /opt/calibre/ebook-convert 2>/dev/null; then
        print_success "Calibre is installed"
        docker compose exec -T backend ebook-convert --version 2>&1 | head -1 || true
    else
        print_warning "Calibre is not installed, MOBI to EPUB conversion will be unavailable"
        echo ""
        read -p "Install Calibre now? (Y/n, default: Y): " install_calibre
        install_calibre=${install_calibre:-y}
        if [ "$install_calibre" = "y" ] || [ "$install_calibre" = "Y" ]; then
            print_info "Starting Calibre installation..."
            PROJECT_ROOT=$(get_project_root)
            SCRIPT_PATH="$PROJECT_ROOT/sh/install-calibre.sh"
            # If script not found, try compatible paths
            if [ ! -f "$SCRIPT_PATH" ]; then
                ALT_PATHS=(
                    "./sh/install-calibre.sh"
                    "../sh/install-calibre.sh"
                    "$PROJECT_ROOT/install-calibre.sh"
                )
                for p in "${ALT_PATHS[@]}"; do
                    if [ -f "$p" ]; then
                        SCRIPT_PATH="$p"
                        break
                    fi
                done
                # Still not found, use find to search (limit depth to avoid slowness)
                if [ ! -f "$SCRIPT_PATH" ]; then
                    FOUND_PATH=$(find "$PROJECT_ROOT" -maxdepth 3 -type f -name "install-calibre.sh" 2>/dev/null | head -1)
                    if [ -n "$FOUND_PATH" ]; then
                        SCRIPT_PATH="$FOUND_PATH"
                    fi
                fi
            fi

            if [ -f "$SCRIPT_PATH" ]; then
                print_info "Executing Calibre installation script: $SCRIPT_PATH"
                bash "$SCRIPT_PATH"
            else
                print_warning "install-calibre.sh script not found"
                print_info "You can manually run it later: sh/install-calibre.sh"
            fi
        else
            print_info "Skipping Calibre installation"
            print_info "You can run it later: sh/install-calibre.sh"
        fi
    fi
    echo ""
}

# Initialize admin account
init_admin() {
    print_header "Initialize Admin Account"
    
    echo ""
    read -p "Initialize admin account now? (Y/n, default: Y): " init_admin_choice
    init_admin_choice=${init_admin_choice:-y}
    
    if [ "$init_admin_choice" = "y" ] || [ "$init_admin_choice" = "Y" ]; then
        print_info "Initializing admin account..."
        
        if $COMPOSE_CMD exec -T backend node scripts/initAdmin.js 2>/dev/null; then
            print_success "Admin account initialized successfully"
        else
            print_warning "Admin account initialization failed, service may not be fully started"
            print_info "You can manually run it later: $COMPOSE_CMD exec backend node scripts/initAdmin.js"
        fi
    else
        print_info "Skipping admin account initialization"
        print_info "You can run it later: $COMPOSE_CMD exec backend node scripts/initAdmin.js"
    fi
}

# Build APK
build_apk() {
    print_header "Build Android APK"
    
    PROJECT_ROOT=$(get_project_root)
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    BUILD_SCRIPT="$FRONTEND_DIR/build-apk.sh"
    BUILD_MULTI_SCRIPT="$FRONTEND_DIR/build-apk-multi.sh"
    PROFILES_FILE="$FRONTEND_DIR/apk-profiles.json"
    
    if [ ! -f "$BUILD_SCRIPT" ]; then
        print_error "APK build script not found: $BUILD_SCRIPT"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    if [ ! -d "$FRONTEND_DIR/android" ]; then
        print_error "Android project not found. Please run 'npx cap add android' first in the frontend directory."
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check if multi-profile configuration exists
    USE_MULTI_PROFILE=false
    if [ -f "$PROFILES_FILE" ] && [ -f "$BUILD_MULTI_SCRIPT" ]; then
        echo ""
        print_info "Multi-server configuration file detected: $PROFILES_FILE"
        echo ""
        print_info "Please select build mode:"
        echo "  1) Use multi-server configuration (select from config file)"
        echo "  2) Manual input configuration (traditional mode)"
        echo "  0) Cancel"
        echo ""
        read -p "Enter option (0-2, default: 1): " mode_choice
        mode_choice=${mode_choice:-1}
        
        case $mode_choice in
            1)
                USE_MULTI_PROFILE=true
                ;;
            2)
                USE_MULTI_PROFILE=false
                ;;
            0)
                print_info "Cancelled"
                echo ""
                read -p "Press Enter to return..."
                return
                ;;
            *)
                print_warning "Invalid option, using multi-server configuration"
                USE_MULTI_PROFILE=true
                ;;
        esac
    fi
    
    # Select build type
    echo ""
    print_info "Please select build type:"
    echo "  1) Debug APK (for testing)"
    echo "  2) Release APK (for distribution)"
    echo "  0) Cancel"
    echo ""
    read -p "Enter option (0-2, default: 1): " build_choice
    build_choice=${build_choice:-1}
    
    case $build_choice in
        1)
            BUILD_TYPE="debug"
            ;;
        2)
            BUILD_TYPE="release"
            ;;
        0)
            print_info "Cancelled"
            echo ""
            read -p "Press Enter to return..."
            return
            ;;
        *)
            print_warning "Invalid option, using debug build"
            BUILD_TYPE="debug"
            ;;
    esac
    
    # Multi-server configuration mode
    if [ "$USE_MULTI_PROFILE" = true ]; then
        echo ""
        print_info "Reading server configurations from config file..."
        
        # Check if Node.js is available
        if ! command -v node >/dev/null 2>&1; then
            print_error "Node.js is required to parse the configuration file"
            echo ""
            read -p "Press Enter to return..."
            return
        fi
        
        # Read all profile names from config file
        cd "$FRONTEND_DIR"
        PROFILE_NAMES=$(node -e "
            try {
                const fs = require('fs');
                const config = JSON.parse(fs.readFileSync('$PROFILES_FILE', 'utf8'));
                const names = Object.keys(config);
                console.log(names.join(','));
            } catch (e) {
                console.error('Failed to read config');
                process.exit(1);
            }
        " 2>/dev/null)
        
        if [ $? -ne 0 ] || [ -z "$PROFILE_NAMES" ]; then
            print_error "Unable to read config file or config file format error"
            echo ""
            read -p "Press Enter to return..."
            return
        fi
        
        # Convert profile names to array
        IFS=',' read -ra PROFILE_ARRAY <<< "$PROFILE_NAMES"
        
        echo ""
        print_info "Please select server configuration:"
        INDEX=1
        for profile in "${PROFILE_ARRAY[@]}"; do
            # Read profile details for display
            PROFILE_INFO=$(node -e "
                const fs = require('fs');
                const config = JSON.parse(fs.readFileSync('$PROFILES_FILE', 'utf8'));
                const p = config['$profile'];
                if (p) {
                    console.log(p.appName || '$profile' + ' | ' + (p.apiUrl || 'No API URL') + ' | Package: ' + (p.applicationId || 'Not set'));
                }
            " 2>/dev/null)
            echo "  $INDEX) $profile"
            if [ -n "$PROFILE_INFO" ]; then
                echo "     $PROFILE_INFO"
            fi
            INDEX=$((INDEX + 1))
        done
        echo "  0) Cancel"
        echo ""
        read -p "Enter option (0-$((INDEX-1)), default: 1): " profile_choice
        profile_choice=${profile_choice:-1}
        
        if [ "$profile_choice" = "0" ]; then
            print_info "Cancelled"
            echo ""
            read -p "Press Enter to return..."
            return
        fi
        
        if [ "$profile_choice" -lt 1 ] || [ "$profile_choice" -gt "${#PROFILE_ARRAY[@]}" ]; then
            print_warning "Invalid option, using first configuration"
            profile_choice=1
        fi
        
        SELECTED_PROFILE="${PROFILE_ARRAY[$((profile_choice-1))]}"
        
        echo ""
        print_warning "This will build the Android APK, which may take several minutes"
        print_info "Build type: $BUILD_TYPE"
        print_info "Configuration name: $SELECTED_PROFILE"
        echo ""
        read -p "Press Enter to start building..."
        
        cd "$FRONTEND_DIR"
        
        # Use multi-version build script
        bash "$BUILD_MULTI_SCRIPT" "$SELECTED_PROFILE" "$BUILD_TYPE"
        BUILD_RESULT=$?
        
        if [ $BUILD_RESULT -eq 0 ]; then
            print_success "APK build completed!"
            echo ""
            
            # Find generated APK file (build-apk-multi.sh will rename the file)
            APK_DIR="$FRONTEND_DIR/android/app/build/outputs/apk"
            if [ "$BUILD_TYPE" = "release" ]; then
                APK_PATH=$(find "$APK_DIR/release" -name "*-${SELECTED_PROFILE}.apk" 2>/dev/null | head -1)
                if [ -z "$APK_PATH" ]; then
                    # If renamed file not found, try to find original file
                    APK_PATH=$(find "$APK_DIR/release" -name "*.apk" 2>/dev/null | head -1)
                fi
            else
                APK_PATH=$(find "$APK_DIR/debug" -name "*-${SELECTED_PROFILE}.apk" 2>/dev/null | head -1)
                if [ -z "$APK_PATH" ]; then
                    APK_PATH=$(find "$APK_DIR/debug" -name "*.apk" 2>/dev/null | head -1)
                fi
            fi
            
            if [ -n "$APK_PATH" ] && [ -f "$APK_PATH" ]; then
                print_info "APK location: $APK_PATH"
                if [ "$BUILD_TYPE" = "release" ]; then
                    if [[ "$APK_PATH" == *"-unsigned"* ]]; then
                        print_warning "Note: Release APK needs to be signed before installation"
                    fi
                else
                    print_info "You can install it directly: adb install $APK_PATH"
                fi
            else
                print_warning "Unable to automatically find APK file, please check manually: $APK_DIR"
            fi
        else
            print_error "APK build failed"
        fi
        
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Traditional manual input mode
    echo ""
    print_info "Please enter API server URL (leave empty to use default or configure in app):"
    read -p "API URL (default: empty): " api_url
    
    echo ""
    DEFAULT_API_KEY="YZC8M%y6"
    print_info "Please enter API KEY (leave empty to use default or configure in app):"
    read -p "API KEY (default: $DEFAULT_API_KEY): " api_key
    api_key=${api_key:-$DEFAULT_API_KEY}
    
    echo ""
    print_warning "This will build the Android APK, which may take several minutes"
    print_info "Build type: $BUILD_TYPE"
    if [ -n "$api_url" ]; then
        print_info "API URL: $api_url"
    fi
    print_info "API KEY: $api_key"
    echo ""
    read -p "Press Enter to start building..."
    
    cd "$FRONTEND_DIR"
    
    if [ -n "$api_url" ] && [ -n "$api_key" ]; then
        VITE_API_URL="$api_url" VITE_API_KEY="$api_key" bash "$BUILD_SCRIPT" "$BUILD_TYPE"
    elif [ -n "$api_url" ]; then
        VITE_API_URL="$api_url" bash "$BUILD_SCRIPT" "$BUILD_TYPE"
    elif [ -n "$api_key" ]; then
        VITE_API_KEY="$api_key" bash "$BUILD_SCRIPT" "$BUILD_TYPE"
    else
        bash "$BUILD_SCRIPT" "$BUILD_TYPE"
    fi
    
    BUILD_RESULT=$?
    
    if [ $BUILD_RESULT -eq 0 ]; then
        print_success "APK build completed!"
        echo ""
        
        # Find generated APK file (build-apk.sh will rename the file)
        APK_DIR="$FRONTEND_DIR/android/app/build/outputs/apk"
        if [ "$BUILD_TYPE" = "release" ]; then
            # Find APK file in release directory (may be renamed)
            APK_PATH=$(find "$APK_DIR/release" -name "ReadKnows-*.apk" 2>/dev/null | head -1)
            if [ -z "$APK_PATH" ]; then
                # If renamed file not found, try to find original file
                if [ -f "$APK_DIR/release/app-release.apk" ]; then
                    APK_PATH="$APK_DIR/release/app-release.apk"
                elif [ -f "$APK_DIR/release/app-release-unsigned.apk" ]; then
                    APK_PATH="$APK_DIR/release/app-release-unsigned.apk"
                fi
            fi
            
            if [ -n "$APK_PATH" ] && [ -f "$APK_PATH" ]; then
                print_info "Release APK location: $APK_PATH"
                if [[ "$APK_PATH" == *"-unsigned"* ]]; then
                    print_warning "Note: Release APK needs to be signed before installation"
                fi
            else
                print_warning "Unable to automatically find APK file, please check manually: $APK_DIR/release"
            fi
        else
            # Find APK file in debug directory
            APK_PATH=$(find "$APK_DIR/debug" -name "ReadKnows-*.apk" 2>/dev/null | head -1)
            if [ -z "$APK_PATH" ]; then
                if [ -f "$APK_DIR/debug/app-debug.apk" ]; then
                    APK_PATH="$APK_DIR/debug/app-debug.apk"
                fi
            fi
            
            if [ -n "$APK_PATH" ] && [ -f "$APK_PATH" ]; then
                print_info "Debug APK location: $APK_PATH"
                print_info "You can install it directly: adb install $APK_PATH"
            else
                print_warning "Unable to automatically find APK file, please check manually: $APK_DIR/debug"
            fi
        fi
    else
        print_error "APK build failed"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Development mode submenu
show_dev_menu() {
    while true; do
        print_header "Development Mode"
        echo ""
        print_info "Please select startup option:"
        echo "  1) Frontend only"
        echo "  2) Frontend + Backend"
        echo "  3) Frontend + Backend + TTS-API"
        echo "  4) Frontend + Backend + TTS-API-Lite"
        echo "  5) Frontend + Backend + OCR-API"
        echo "  0) Return to main menu"
        echo ""
        read -p "Enter option (0-5): " dev_choice
        
        case $dev_choice in
            1)
                start_dev_frontend
                ;;
            2)
                start_dev_frontend_backend
                ;;
            3)
                start_dev_full
                ;;
            4)
                start_dev_with_lite
                ;;
            5)
                start_dev_with_ocr
                ;;
            0)
                return
                ;;
            *)
                print_warning "Invalid option, please select again"
                sleep 1
                ;;
        esac
    done
}

# Start frontend only
start_dev_frontend() {
    print_header "Start Frontend Only"
    
    PROJECT_ROOT=$(get_project_root)
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    
    if [ ! -d "$FRONTEND_DIR" ]; then
        print_error "Frontend directory not found: $FRONTEND_DIR"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    print_info "Starting frontend development server..."
    print_info "Press Ctrl+C to stop"
    echo ""
    read -p "Press Enter to start..."
    
    cd "$FRONTEND_DIR"
    npm run dev
}

# Start frontend + backend
start_dev_frontend_backend() {
    print_header "Start Frontend + Backend"
    
    PROJECT_ROOT=$(get_project_root)
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    BACKEND_DIR="$PROJECT_ROOT/backend"
    
    if [ ! -d "$FRONTEND_DIR" ] || [ ! -d "$BACKEND_DIR" ]; then
        print_error "Frontend or backend directory not found"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    print_info "Starting frontend and backend development servers..."
    print_info "Press Ctrl+C to stop all services"
    echo ""
    read -p "Press Enter to start..."
    
    # Start backend in background
    cd "$BACKEND_DIR"
    npm run dev > "$PROJECT_ROOT/backend.log" 2>&1 &
    BACKEND_PID=$!
    
    sleep 3
    
    # Start frontend in foreground
    cd "$FRONTEND_DIR"
    npm run dev &
    FRONTEND_PID=$!
    
    # Cleanup function
    cleanup() {
        echo ""
        print_warning "Stopping services..."
        kill $BACKEND_PID 2>/dev/null || true
        kill $FRONTEND_PID 2>/dev/null || true
        wait $BACKEND_PID 2>/dev/null || true
        wait $FRONTEND_PID 2>/dev/null || true
        print_success "Services stopped"
        exit 0
    }
    
    trap cleanup SIGINT SIGTERM
    
    wait
}

# Start frontend + backend + TTS-API
start_dev_full() {
    print_header "Start Frontend + Backend + TTS-API"
    
    PROJECT_ROOT=$(get_project_root)
    START_SCRIPT="$PROJECT_ROOT/sh/start.sh"
    
    if [ ! -f "$START_SCRIPT" ]; then
        ALT_PATHS=(
            "./sh/start.sh"
            "../sh/start.sh"
            "$PROJECT_ROOT/start.sh"
        )
        for p in "${ALT_PATHS[@]}"; do
            if [ -f "$p" ]; then
                START_SCRIPT="$p"
                break
            fi
        done
    fi
    
    if [ ! -f "$START_SCRIPT" ]; then
        print_error "Start script not found: start.sh"
        print_info "Tried paths: $PROJECT_ROOT/sh/start.sh and compatible paths"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    print_info "Executing start script: $START_SCRIPT"
    echo ""
    print_warning "This will start local development environment (frontend, backend, TTS API)"
    print_info "Press Ctrl+C to stop services"
    echo ""
    read -p "Press Enter to start..."
    
    bash "$START_SCRIPT"
    
    echo ""
    read -p "Press Enter to return..."
}

# Start frontend + backend + TTS-API-Lite
start_dev_with_lite() {
    print_header "Start Frontend + Backend + TTS-API-Lite"
    
    PROJECT_ROOT=$(get_project_root)
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    BACKEND_DIR="$PROJECT_ROOT/backend"
    TTS_LITE_DIR="$PROJECT_ROOT/tts-api-lite"
    
    if [ ! -d "$FRONTEND_DIR" ] || [ ! -d "$BACKEND_DIR" ]; then
        print_error "Frontend or backend directory not found"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    if [ ! -d "$TTS_LITE_DIR" ]; then
        print_error "TTS-API-Lite directory not found: $TTS_LITE_DIR"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    print_info "Starting frontend, backend, and TTS-API-Lite..."
    print_info "Press Ctrl+C to stop all services"
    echo ""
    read -p "Press Enter to start..."
    
    # Start backend in background
    cd "$BACKEND_DIR"
    export TTS_BASE_URL="http://127.0.0.1:5051"
    npm run dev > "$PROJECT_ROOT/backend.log" 2>&1 &
    BACKEND_PID=$!
    
    sleep 3
    
    # Start TTS-API-Lite in background
    cd "$TTS_LITE_DIR"
    if [ -f "start.sh" ]; then
        bash start.sh > "$PROJECT_ROOT/tts-api-lite.log" 2>&1 &
        TTS_PID=$!
    else
        print_warning "TTS-API-Lite start.sh not found, skipping TTS service"
        TTS_PID=""
    fi
    
    sleep 3
    
    # Start frontend in foreground
    cd "$FRONTEND_DIR"
    npm run dev &
    FRONTEND_PID=$!
    
    # Cleanup function
    cleanup() {
        echo ""
        print_warning "Stopping services..."
        kill $BACKEND_PID 2>/dev/null || true
        kill $FRONTEND_PID 2>/dev/null || true
        [ -n "$TTS_PID" ] && kill $TTS_PID 2>/dev/null || true
        wait $BACKEND_PID 2>/dev/null || true
        wait $FRONTEND_PID 2>/dev/null || true
        [ -n "$TTS_PID" ] && wait $TTS_PID 2>/dev/null || true
        print_success "Services stopped"
        exit 0
    }
    
    trap cleanup SIGINT SIGTERM
    
    wait
}

# Start frontend + backend + OCR-API
start_dev_with_ocr() {
    print_header "Start Frontend + Backend + OCR-API"
    
    PROJECT_ROOT=$(get_project_root)
    FRONTEND_DIR="$PROJECT_ROOT/frontend"
    BACKEND_DIR="$PROJECT_ROOT/backend"
    OCR_API_DIR="$PROJECT_ROOT/ocr-api"
    
    if [ ! -d "$FRONTEND_DIR" ] || [ ! -d "$BACKEND_DIR" ]; then
        print_error "Frontend or backend directory not found"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    if [ ! -d "$OCR_API_DIR" ]; then
        print_error "OCR-API directory not found: $OCR_API_DIR"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    print_info "Starting frontend, backend, and OCR-API..."
    print_info "Press Ctrl+C to stop all services"
    echo ""
    read -p "Press Enter to start..."
    echo ""
    
    # Start backend in background
    print_info "Starting backend service..."
    cd "$BACKEND_DIR" || {
        print_error "Cannot change to backend directory: $BACKEND_DIR"
        read -p "Press Enter to return..."
        return 1
    }
    export OCR_BASE_URL="http://127.0.0.1:5060"
    npm run dev > "$PROJECT_ROOT/backend.log" 2>&1 &
    BACKEND_PID=$!
    print_success "Backend service started (PID: $BACKEND_PID, log: backend.log)"
    
    sleep 3
    
    # Start OCR-API in background
    print_info "Starting OCR-API service..."
    cd "$OCR_API_DIR" || {
        print_error "Cannot change to OCR-API directory: $OCR_API_DIR"
        read -p "Press Enter to return..."
        return 1
    }
    if [ -f "docker-compose.yml" ]; then
        if docker-compose up -d > "$PROJECT_ROOT/ocr-api.log" 2>&1 || docker compose up -d > "$PROJECT_ROOT/ocr-api.log" 2>&1; then
            print_success "OCR-API service started (Docker, log: ocr-api.log)"
        else
            print_warning "OCR-API service may have failed to start, please check log: ocr-api.log"
        fi
    else
        print_warning "OCR-API docker-compose.yml not found, skipping OCR service"
    fi
    
    sleep 3
    
    # Start frontend in foreground
    print_info "Starting frontend service..."
    cd "$FRONTEND_DIR" || {
        print_error "Cannot change to frontend directory: $FRONTEND_DIR"
        read -p "Press Enter to return..."
        return 1
    }
    npm run dev &
    FRONTEND_PID=$!
    print_success "Frontend service started (PID: $FRONTEND_PID)"
    echo ""
    print_info "All services started, frontend output will be shown below..."
    echo ""
    
    # Cleanup function
    cleanup() {
        echo ""
        print_warning "Stopping services..."
        kill $BACKEND_PID 2>/dev/null || true
        kill $FRONTEND_PID 2>/dev/null || true
        cd "$OCR_API_DIR"
        docker-compose down 2>/dev/null || docker compose down 2>/dev/null || true
        wait $BACKEND_PID 2>/dev/null || true
        wait $FRONTEND_PID 2>/dev/null || true
        print_success "Services stopped"
        exit 0
    }
    
    trap cleanup SIGINT SIGTERM
    
    wait
}

# Export images submenu
show_export_images_menu() {
    while true; do
        print_header "Docker Image Export"
        echo ""
        print_info "Please select image to export:"
        echo "  1) Export frontend image"
        echo "  2) Export backend image"
        echo "  3) Export TTS API service image"
        echo "  4) Export TTS API Lite service image"
        echo "  5) Export all images"
        echo "  0) Return to main menu"
        echo ""
        read -p "Enter option (0-5): " export_choice
        
        case $export_choice in
            1)
                export_single_image "frontend"
                ;;
            2)
                export_single_image "backend"
                ;;
            3)
                export_single_image "tts-api"
                ;;
            4)
                export_single_image "tts-api-lite"
                ;;
            5)
                export_images
                ;;
            0)
                return
                ;;
            *)
                print_warning "Invalid option, please select again"
                sleep 1
                ;;
        esac
    done
}

# Export single image
export_single_image() {
    local image_type=$1
    PROJECT_ROOT=$(get_project_root)
    EXPORT_DIR="$PROJECT_ROOT/docker-images"
    mkdir -p "$EXPORT_DIR"
    
    print_header "Export ${image_type} Image"
    
    # Determine image name
    case $image_type in
        frontend)
            IMAGE_NAME="ttbye/readknows-frontend:latest"
            EXPORT_FILE="$EXPORT_DIR/readknows-frontend-latest.tar.gz"
            ;;
        backend)
            IMAGE_NAME="ttbye/readknows-backend:latest"
            EXPORT_FILE="$EXPORT_DIR/readknows-backend-latest.tar.gz"
            ;;
        tts-api)
            IMAGE_NAME="ttbye/tts-api:latest"
            EXPORT_FILE="$EXPORT_DIR/tts-api-latest.tar.gz"
            ;;
        tts-api-lite)
            IMAGE_NAME="ttbye/tts-api-lite:latest"
            EXPORT_FILE="$EXPORT_DIR/tts-api-lite-latest.tar.gz"
            ;;
        *)
            print_error "Unknown image type: $image_type"
            echo ""
            read -p "Press Enter to return..."
            return
            ;;
    esac
    
    # Check if image exists
    if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE_NAME}$"; then
        print_error "Image does not exist: $IMAGE_NAME"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    print_info "Exporting image: $IMAGE_NAME"
    
    if docker save "$IMAGE_NAME" | gzip > "$EXPORT_FILE"; then
        FILE_SIZE=$(du -h "$EXPORT_FILE" | cut -f1)
        print_success "Image exported successfully: $(basename "$EXPORT_FILE") ($FILE_SIZE)"
    else
        print_error "Image export failed"
        rm -f "$EXPORT_FILE" 2>/dev/null || true
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Import images submenu
show_import_images_menu() {
    while true; do
        print_header "Docker Image Import"
        echo ""
        print_info "Please select image to import:"
        echo "  1) Import frontend image"
        echo "  2) Import backend image"
        echo "  3) Import TTS API service image"
        echo "  4) Import TTS API Lite service image"
        echo "  5) Import all images"
        echo "  0) Return to main menu"
        echo ""
        read -p "Enter option (0-5): " import_choice
        
        case $import_choice in
            1)
                import_single_image "frontend"
                ;;
            2)
                import_single_image "backend"
                ;;
            3)
                import_single_image "tts-api"
                ;;
            4)
                import_single_image "tts-api-lite"
                ;;
            5)
                import_images
                ;;
            0)
                return
                ;;
            *)
                print_warning "Invalid option, please select again"
                sleep 1
                ;;
        esac
    done
}

# Import single image
import_single_image() {
    local image_type=$1
    PROJECT_ROOT=$(get_project_root)
    IMAGE_DIR="$PROJECT_ROOT/docker-images"
    
    print_header "Import ${image_type} Image"
    
    # Determine image file name
    case $image_type in
        frontend)
            IMAGE_FILE="$IMAGE_DIR/readknows-frontend-latest.tar.gz"
            ;;
        backend)
            IMAGE_FILE="$IMAGE_DIR/readknows-backend-latest.tar.gz"
            ;;
        tts-api)
            IMAGE_FILE="$IMAGE_DIR/tts-api-latest.tar.gz"
            ;;
        tts-api-lite)
            IMAGE_FILE="$IMAGE_DIR/tts-api-lite-latest.tar.gz"
            ;;
        *)
            print_error "Unknown image type: $image_type"
            echo ""
            read -p "Press Enter to return..."
            return
            ;;
    esac
    
    if [ ! -f "$IMAGE_FILE" ]; then
        print_error "Image file does not exist: $IMAGE_FILE"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    print_info "Importing image: $(basename "$IMAGE_FILE")"
    print_info "This may take a few minutes, please wait patiently..."
    
    if gunzip -c "$IMAGE_FILE" | docker load; then
        print_success "Image imported successfully"
    else
        print_error "Image import failed"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Delete images submenu
show_delete_images_menu() {
    while true; do
        print_header "Delete Docker Images"
        echo ""
        print_info "Please select image to delete:"
        echo "  1) Delete frontend image"
        echo "  2) Delete backend image"
        echo "  3) Delete TTS API service image"
        echo "  4) Delete TTS API Lite service image"
        echo "  5) Delete all images"
        echo "  0) Return to main menu"
        echo ""
        read -p "Enter option (0-5): " delete_choice
        
        case $delete_choice in
            1)
                delete_single_image "frontend"
                ;;
            2)
                delete_single_image "backend"
                ;;
            3)
                delete_single_image "tts-api"
                ;;
            4)
                delete_single_image "tts-api-lite"
                ;;
            5)
                delete_all_images
                ;;
            0)
                return
                ;;
            *)
                print_warning "Invalid option, please select again"
                sleep 1
                ;;
        esac
    done
}

# Delete single image
delete_single_image() {
    local image_type=$1
    
    print_header "Delete ${image_type} Image"
    
    # Determine image name
    case $image_type in
        frontend)
            IMAGE_NAME="ttbye/readknows-frontend:latest"
            CONTAINER_NAME="readknows-frontend"
            ;;
        backend)
            IMAGE_NAME="ttbye/readknows-backend:latest"
            CONTAINER_NAME="readknows-backend"
            ;;
        tts-api)
            IMAGE_NAME="ttbye/tts-api:latest"
            CONTAINER_NAME="readknow-tts-api"
            ;;
        tts-api-lite)
            IMAGE_NAME="ttbye/tts-api-lite:latest"
            CONTAINER_NAME="readknow-tts-api-lite"
            ;;
        *)
            print_error "Unknown image type: $image_type"
            echo ""
            read -p "Press Enter to return..."
            return
            ;;
    esac
    
    # Check if image exists
    if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE_NAME}$"; then
        print_warning "Image does not exist: $IMAGE_NAME"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Check containers
    if docker ps -a --format "{{.Names}}" | grep -qE "^${CONTAINER_NAME}$"; then
        print_warning "Found related container: $CONTAINER_NAME"
        read -p "Delete container first? (Y/n, default: Y): " delete_container
        delete_container=${delete_container:-y}
        if [ "$delete_container" = "y" ] || [ "$delete_container" = "Y" ]; then
            docker stop "$CONTAINER_NAME" 2>/dev/null || true
            docker rm "$CONTAINER_NAME" 2>/dev/null || true
            print_success "Container deleted"
        fi
    fi
    
    echo ""
    print_warning "This operation will permanently delete image: $IMAGE_NAME"
    read -p "Confirm deletion? (y/N, default: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "Deletion cancelled"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    if docker rmi "$IMAGE_NAME" 2>/dev/null; then
        print_success "Image deleted successfully"
    else
        print_warning "Normal deletion failed, trying force delete..."
        if docker rmi -f "$IMAGE_NAME" 2>/dev/null; then
            print_success "Image force deleted successfully"
        else
            print_error "Image deletion failed"
        fi
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Delete all images
delete_all_images() {
    print_header "Delete All Docker Images"
    
    BACKEND_IMAGE="ttbye/readknows-backend:latest"
    FRONTEND_IMAGE="ttbye/readknows-frontend:latest"
    TTS_IMAGE="ttbye/tts-api:latest"
    TTS_LITE_IMAGE="ttbye/tts-api-lite:latest"
    
    echo ""
    print_info "The following images will be deleted:"
    
    IMAGES_TO_DELETE=()
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${BACKEND_IMAGE}$"; then
        echo "  - $BACKEND_IMAGE"
        IMAGES_TO_DELETE+=("$BACKEND_IMAGE")
    fi
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${FRONTEND_IMAGE}$"; then
        echo "  - $FRONTEND_IMAGE"
        IMAGES_TO_DELETE+=("$FRONTEND_IMAGE")
    fi
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${TTS_IMAGE}$"; then
        echo "  - $TTS_IMAGE"
        IMAGES_TO_DELETE+=("$TTS_IMAGE")
    fi
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${TTS_LITE_IMAGE}$"; then
        echo "  - $TTS_LITE_IMAGE"
        IMAGES_TO_DELETE+=("$TTS_LITE_IMAGE")
    fi
    
    if [ ${#IMAGES_TO_DELETE[@]} -eq 0 ]; then
        print_warning "No images found"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    echo ""
    print_warning "This operation will permanently delete all the above Docker images, cannot be recovered!"
    print_warning "If containers are running, they will be automatically stopped and deleted."
    echo ""
    read -p "Confirm deletion? (y/N, default: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "Deletion cancelled"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Delete related containers
    CONTAINERS=("readknows-backend" "readknows-frontend" "readknow-tts-api" "readknow-tts-api-lite")
    for container in "${CONTAINERS[@]}"; do
        if docker ps -a --format "{{.Names}}" | grep -qE "^${container}$"; then
            print_info "Stopping and deleting container: $container"
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
        fi
    done
    
    sleep 1
    
    # Delete images
    DELETED_COUNT=0
    for image in "${IMAGES_TO_DELETE[@]}"; do
        print_info "Deleting image: $image"
        if docker rmi "$image" 2>/dev/null || docker rmi -f "$image" 2>/dev/null; then
            print_success "Image deleted successfully: $image"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            print_warning "Image deletion failed: $image"
        fi
    done
    
    echo ""
    if [ $DELETED_COUNT -gt 0 ]; then
        print_success "Deletion completed! Deleted $DELETED_COUNT images"
    else
        print_warning "No images deleted"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Other functions submenu
show_other_menu() {
    while true; do
        print_header "Other Functions"
        echo ""
        print_info "Please select function:"
        echo "  1) Install Calibre"
        echo "  2) Download CosyVoice model"
        echo "  3) Download IndexTTS2 model"
        echo "  4) Admin account initialization (Username: books, Password: books)"
        echo "  5) Delete exported image files (docker-images directory)"
        echo "  6) Delete TTS-API-Lite service"
        echo "  7) Delete OCR-API service"
        echo "  8) Manage API Key and Private Access Key"
        echo "  0) Return to main menu"
        echo ""
        read -p "Enter option (0-8): " other_choice
        
        case $other_choice in
            1)
                install_calibre_standalone
                ;;
            2)
                download_cosyvoice_model
                ;;
            3)
                download_indextts2_model
                ;;
            4)
                init_admin_with_defaults
                ;;
            5)
                delete_exported_images
                ;;
            6)
                remove_tts_api_lite
                ;;
            7)
                remove_ocr_service
                ;;
            8)
                manage_security_keys
                ;;
            0)
                return
                ;;
            *)
                print_warning "Invalid option, please select again"
                sleep 1
                ;;
        esac
    done
}

# Download CosyVoice model
download_cosyvoice_model() {
    print_header "Download CosyVoice Model"
    
    PROJECT_ROOT=$(get_project_root)
    TTS_API_DIR="$PROJECT_ROOT/tts-api"
    
    if [ ! -d "$TTS_API_DIR" ]; then
        print_error "TTS API directory not found: $TTS_API_DIR"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    DOWNLOAD_SCRIPT="$TTS_API_DIR/scripts/download-cosyvoice.py"
    
    if [ ! -f "$DOWNLOAD_SCRIPT" ]; then
        print_error "Download script not found: $DOWNLOAD_SCRIPT"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    PLATFORM=$(detect_platform)
    TTS_PATHS=$(get_tts_api_paths "$PLATFORM")
    MODELS_DIR="${TTS_PATHS%%|*}"
    
    print_info "Model directory: $MODELS_DIR/cosyvoice"
    echo ""
    
    cd "$TTS_API_DIR"
    if python3 "$DOWNLOAD_SCRIPT" "$MODELS_DIR/cosyvoice"; then
        print_success "CosyVoice model download completed"
    else
        print_error "CosyVoice model download failed"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Download IndexTTS2 model
download_indextts2_model() {
    print_header "Download IndexTTS2 Model"
    
    PROJECT_ROOT=$(get_project_root)
    TTS_API_DIR="$PROJECT_ROOT/tts-api"
    
    if [ ! -d "$TTS_API_DIR" ]; then
        print_error "TTS API directory not found: $TTS_API_DIR"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    DOWNLOAD_SCRIPT="$TTS_API_DIR/scripts/download-indextts2.py"
    
    if [ ! -f "$DOWNLOAD_SCRIPT" ]; then
        print_error "Download script not found: $DOWNLOAD_SCRIPT"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    PLATFORM=$(detect_platform)
    TTS_PATHS=$(get_tts_api_paths "$PLATFORM")
    MODELS_DIR="${TTS_PATHS%%|*}"
    
    print_info "Model directory: $MODELS_DIR/indextts2"
    echo ""
    
    cd "$TTS_API_DIR"
    if python3 "$DOWNLOAD_SCRIPT" "$MODELS_DIR/indextts2"; then
        print_success "IndexTTS2 model download completed"
    else
        print_error "IndexTTS2 model download failed"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Initialize admin with defaults
init_admin_with_defaults() {
    print_header "Admin Account Initialization"
    
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/init-admin.sh"
    
    if [ ! -f "$SCRIPT_PATH" ]; then
        print_error "Script not found: $SCRIPT_PATH"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    print_info "Will initialize admin account with default values"
    print_info "Username: books"
    print_info "Password: readknows"
    echo ""
    read -p "Confirm initialization? (Y/n, default: Y): " confirm
    confirm=${confirm:-y}
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "Cancelled"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Check if backend container is running
    if ! docker ps --format "{{.Names}}" | grep -qE "^(readknows-backend|knowbooks-backend)$"; then
        print_error "Backend container is not running, please start backend service first"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Get container name
    BACKEND_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "^(readknows-backend|knowbooks-backend)$" | head -1)
    
    print_info "Initializing admin account..."
    
    # Execute initialization (using default values: books/readknows)
    if docker exec "$BACKEND_CONTAINER" node scripts/initAdmin.js books admin@readknows.local readknows 2>&1; then
        print_success "Admin account initialized successfully!"
        echo ""
        print_info "Account information:"
        echo "  Username: books"
        echo "  Email: admin@readknows.local"
        echo "  Password: readknows"
        echo ""
        print_warning "Please keep the password safe and change it promptly after first login!"
    else
        print_error "Admin account initialization failed"
        print_info "Please check if backend container is running normally"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Manage security keys (API Key and Private Access Key)
manage_security_keys() {
    print_header "Manage API Key and Private Access Key"
    
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/backend/scripts/manageKeys.js"
    
    if [ ! -f "$SCRIPT_PATH" ]; then
        print_error "Key management script not found: $SCRIPT_PATH"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Check if backend container is running
    BACKEND_CONTAINER=""
    if docker ps --format "{{.Names}}" | grep -qE "^(readknows-backend|knowbooks-backend)$"; then
        BACKEND_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "^(readknows-backend|knowbooks-backend)$" | head -1)
        
        # Check if script exists in container, if not, copy it
        if ! docker exec "$BACKEND_CONTAINER" test -f /app/scripts/manageKeys.js 2>/dev/null; then
            print_info "Detected missing script file in container, copying..."
            if docker cp "$SCRIPT_PATH" "$BACKEND_CONTAINER:/app/scripts/manageKeys.js" 2>/dev/null; then
                docker exec "$BACKEND_CONTAINER" chmod +x /app/scripts/manageKeys.js 2>/dev/null || true
                print_success "Script copied to container"
                print_warning "Tip: To permanently include this script, please rebuild the container image"
            else
                print_error "Unable to copy script to container, please copy manually or rebuild container"
            fi
        fi
    fi
    
    while true; do
        echo ""
        print_info "Please select operation:"
        echo "  1) View current keys"
        echo "  2) Set API Key (manual input)"
        echo "  3) Set Private Access Key (manual input)"
        echo "  4) Generate new API Key (auto-generate)"
        echo "  5) Generate new Private Access Key (auto-generate)"
        echo "  6) Generate all keys (generate both API Key and Private Access Key)"
        echo "  0) Return"
        echo ""
        read -p "Enter option (0-6): " key_choice
        
        case $key_choice in
            1)
                print_header "View Current Keys"
                if [ -n "$BACKEND_CONTAINER" ]; then
                    # Execute in container, use absolute path
                    docker exec -w /app "$BACKEND_CONTAINER" node scripts/manageKeys.js show
                else
                    # Execute directly on host (requires database path)
                    cd "$PROJECT_ROOT/backend/scripts"
                    if [ -f "manageKeys.js" ]; then
                        node manageKeys.js show
                    else
                        print_error "Script file not found: $PROJECT_ROOT/backend/scripts/manageKeys.js"
                    fi
                fi
                echo ""
                read -p "Press Enter to continue..."
                ;;
            2)
                print_header "Set API Key"
                echo ""
                read -p "Enter new API Key (at least 8 characters): " new_api_key
                if [ -z "$new_api_key" ]; then
                    print_error "API Key cannot be empty"
                    echo ""
                    read -p "Press Enter to continue..."
                    continue
                fi
                if [ ${#new_api_key} -lt 8 ]; then
                    print_error "API Key must be at least 8 characters"
                    echo ""
                    read -p "Press Enter to continue..."
                    continue
                fi
                if [ -n "$BACKEND_CONTAINER" ]; then
                    docker exec -w /app "$BACKEND_CONTAINER" node scripts/manageKeys.js set-api-key "$new_api_key"
                else
                    cd "$PROJECT_ROOT/backend/scripts"
                    if [ -f "manageKeys.js" ]; then
                        node manageKeys.js set-api-key "$new_api_key"
                    else
                        print_error "Script file not found: $PROJECT_ROOT/backend/scripts/manageKeys.js"
                    fi
                fi
                echo ""
                read -p "Press Enter to continue..."
                ;;
            3)
                print_header "Set Private Access Key"
                echo ""
                read -p "Enter new Private Access Key (at least 8 characters): " new_private_key
                if [ -z "$new_private_key" ]; then
                    print_error "Private Access Key cannot be empty"
                    echo ""
                    read -p "Press Enter to continue..."
                    continue
                fi
                if [ ${#new_private_key} -lt 8 ]; then
                    print_error "Private Access Key must be at least 8 characters"
                    echo ""
                    read -p "Press Enter to continue..."
                    continue
                fi
                if [ -n "$BACKEND_CONTAINER" ]; then
                    docker exec -w /app "$BACKEND_CONTAINER" node scripts/manageKeys.js set-private-key "$new_private_key"
                else
                    cd "$PROJECT_ROOT/backend/scripts"
                    if [ -f "manageKeys.js" ]; then
                        node manageKeys.js set-private-key "$new_private_key"
                    else
                        print_error "Script file not found: $PROJECT_ROOT/backend/scripts/manageKeys.js"
                    fi
                fi
                echo ""
                read -p "Press Enter to continue..."
                ;;
            4)
                print_header "Generate New API Key"
                echo ""
                print_warning "Will generate a new 16-character random API Key, old API Key will be replaced"
                read -p "Confirm generation? (Y/n, default: Y): " confirm
                confirm=${confirm:-y}
                if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                    if [ -n "$BACKEND_CONTAINER" ]; then
                        docker exec -w /app "$BACKEND_CONTAINER" node scripts/manageKeys.js generate-api-key
                    else
                        cd "$PROJECT_ROOT/backend/scripts"
                        if [ -f "manageKeys.js" ]; then
                            node manageKeys.js generate-api-key
                        else
                            print_error "Script file not found: $PROJECT_ROOT/backend/scripts/manageKeys.js"
                        fi
                    fi
                    echo ""
                    print_warning "Please ensure to update all client configurations using this API Key!"
                else
                    print_info "Cancelled"
                fi
                echo ""
                read -p "Press Enter to continue..."
                ;;
            5)
                print_header "Generate New Private Access Key"
                echo ""
                print_warning "Will generate a new 20-character random Private Access Key, old key will be replaced"
                read -p "Confirm generation? (Y/n, default: Y): " confirm
                confirm=${confirm:-y}
                if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                    if [ -n "$BACKEND_CONTAINER" ]; then
                        docker exec -w /app "$BACKEND_CONTAINER" node scripts/manageKeys.js generate-private-key
                    else
                        cd "$PROJECT_ROOT/backend/scripts"
                        if [ -f "manageKeys.js" ]; then
                            node manageKeys.js generate-private-key
                        else
                            print_error "Script file not found: $PROJECT_ROOT/backend/scripts/manageKeys.js"
                        fi
                    fi
                    echo ""
                    print_warning "Please ensure to notify all users who need this key!"
                else
                    print_info "Cancelled"
                fi
                echo ""
                read -p "Press Enter to continue..."
                ;;
            6)
                print_header "Generate All Keys"
                echo ""
                print_warning "Will generate both new API Key and Private Access Key, old keys will be replaced"
                read -p "Confirm generation? (Y/n, default: Y): " confirm
                confirm=${confirm:-y}
                if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                    if [ -n "$BACKEND_CONTAINER" ]; then
                        docker exec -w /app "$BACKEND_CONTAINER" node scripts/manageKeys.js generate-all
                    else
                        cd "$PROJECT_ROOT/backend/scripts"
                        if [ -f "manageKeys.js" ]; then
                            node manageKeys.js generate-all
                        else
                            print_error "Script file not found: $PROJECT_ROOT/backend/scripts/manageKeys.js"
                        fi
                    fi
                    echo ""
                    print_warning "Please ensure to update all client configurations using these keys!"
                else
                    print_info "Cancelled"
                fi
                echo ""
                read -p "Press Enter to continue..."
                ;;
            0)
                return
                ;;
            *)
                print_warning "Invalid option, please select again"
                sleep 1
                ;;
        esac
    done
}

# Show main menu
show_main_menu() {
    while true; do
        print_header "ReadKnows Installation Tool"
        echo ""
        print_info "Please select function:"
        echo "  1) Install system (Frontend & Backend)"
        echo "  2) Install service (TTS-API)"
        echo "  3) Install service (TTS-API-Lite)"
        echo "  4) Install service (OCR-API)"
        echo "  5) Development mode (Flexible startup)"
        echo "  6) Build Android APK"
        echo "  7) Docker image export"
        echo "  8) Docker image import"
        echo "  9) Delete Docker images"
        echo "  10) Other functions"
        echo "  0) Exit"
        echo ""
        read -p "Enter option (0-10, default: 1): " menu_choice
        menu_choice=${menu_choice:-1}
        
        case $menu_choice in
            1)
                # Install system (Frontend & Backend)
                run_installation
                break
                ;;
            2)
                # Install service (TTS-API)
                install_tts_service
                ;;
            3)
                # Install service (TTS-API-Lite)
                install_tts_api_lite
                ;;
            4)
                # Install service (OCR-API)
                install_ocr_service
                ;;
            5)
                # Development mode
                show_dev_menu
                ;;
            6)
                # Build Android APK
                build_apk
                ;;
            7)
                # Docker image export
                show_export_images_menu
                ;;
            8)
                # Docker image import
                show_import_images_menu
                ;;
            9)
                # Delete Docker images
                show_delete_images_menu
                ;;
            10)
                # Other functions
                show_other_menu
                ;;
            0)
                print_info "Exited"
                exit 0
                ;;
            *)
                print_warning "Invalid option, please select again"
                sleep 1
                ;;
        esac
    done
}

# Import images
import_images() {
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/Dockerimport-images.sh"
    
    # If script not found, try compatible paths
    if [ ! -f "$SCRIPT_PATH" ]; then
        ALT_PATHS=(
            "./sh/Dockerimport-images.sh"
            "../sh/Dockerimport-images.sh"
            "$(dirname "$PROJECT_ROOT")/sh/Dockerimport-images.sh"
        )
        for p in "${ALT_PATHS[@]}"; do
            if [ -f "$p" ]; then
                SCRIPT_PATH="$p"
                break
            fi
        done
        # Still not found, use find to search (limit depth to avoid slowness)
        if [ ! -f "$SCRIPT_PATH" ]; then
            FOUND_PATH=$(find "$(dirname "$PROJECT_ROOT")" -maxdepth 3 -type f -name "Dockerimport-images.sh" 2>/dev/null | head -1)
            if [ -n "$FOUND_PATH" ]; then
                SCRIPT_PATH="$FOUND_PATH"
            fi
        fi
    fi
    
    if [ -f "$SCRIPT_PATH" ]; then
        print_info "Executing image import script: $SCRIPT_PATH"
        bash "$SCRIPT_PATH"
        print_success "Image import completed"
    else
        print_error "Script not found: Dockerimport-images.sh"
        print_info "Tried paths: $PROJECT_ROOT/sh/Dockerimport-images.sh and compatible paths"
        print_info "Please confirm the script has been copied to the sh/ directory in the project root and try again."
    fi
    echo ""
    read -p "Press Enter to return..."
}

# Export images
export_images() {
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/Dockerexport-images.sh"
    
    # If script not found, try compatible paths
    if [ ! -f "$SCRIPT_PATH" ]; then
        ALT_PATHS=(
            "./sh/Dockerexport-images.sh"
            "../sh/Dockerexport-images.sh"
            "$(dirname "$PROJECT_ROOT")/sh/Dockerexport-images.sh"
        )
        for p in "${ALT_PATHS[@]}"; do
            if [ -f "$p" ]; then
                SCRIPT_PATH="$p"
                break
            fi
        done
        # Still not found, use find to search (limit depth to avoid slowness)
        if [ ! -f "$SCRIPT_PATH" ]; then
            FOUND_PATH=$(find "$(dirname "$PROJECT_ROOT")" -maxdepth 3 -type f -name "Dockerexport-images.sh" 2>/dev/null | head -1)
            if [ -n "$FOUND_PATH" ]; then
                SCRIPT_PATH="$FOUND_PATH"
            fi
        fi
    fi
    
    if [ -f "$SCRIPT_PATH" ]; then
        print_info "Executing image export script: $SCRIPT_PATH"
        bash "$SCRIPT_PATH"
        print_success "Image export completed"
    else
        print_error "Script not found: Dockerexport-images.sh"
        print_info "Tried paths: $PROJECT_ROOT/sh/Dockerexport-images.sh and compatible paths"
        print_info "Please confirm the script has been copied to the sh/ directory in the project root and try again."
    fi
    echo ""
    read -p "Press Enter to return..."
}

# Standalone Calibre installation
install_calibre_standalone() {
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/install-calibre.sh"
    
    # If script not found, try compatible paths
    if [ ! -f "$SCRIPT_PATH" ]; then
        ALT_PATHS=(
            "./sh/install-calibre.sh"
            "../sh/install-calibre.sh"
            "$PROJECT_ROOT/install-calibre.sh" # Compatible with old location
        )
        for p in "${ALT_PATHS[@]}"; do
            if [ -f "$p" ]; then
                SCRIPT_PATH="$p"
                break
            fi
        done
        # Still not found, use find to search (limit depth to avoid slowness)
        if [ ! -f "$SCRIPT_PATH" ]; then
            FOUND_PATH=$(find "$PROJECT_ROOT" -maxdepth 3 -type f -name "install-calibre.sh" 2>/dev/null | head -1)
            if [ -n "$FOUND_PATH" ]; then
                SCRIPT_PATH="$FOUND_PATH"
            fi
        fi
    fi

    if [ -f "$SCRIPT_PATH" ]; then
        print_info "Executing Calibre installation script: $SCRIPT_PATH"
        bash "$SCRIPT_PATH"
        print_success "Calibre installation completed"
    else
        print_error "install-calibre.sh script not found (tried paths: $PROJECT_ROOT/sh/install-calibre.sh and compatible paths)"
        print_info "Please confirm the script has been copied to the sh/ directory in the project root and try again."
    fi
    echo ""
    read -p "Press Enter to return..."
}

# Standalone admin initialization
init_admin_standalone() {
    PROJECT_ROOT=$(get_project_root)
    SCRIPT_PATH="$PROJECT_ROOT/sh/init-admin.sh"
    
    if [ -f "$SCRIPT_PATH" ]; then
        print_info "Executing admin initialization script..."
        bash "$SCRIPT_PATH"
        print_success "Admin initialization completed"
    else
        print_error "Script not found: $SCRIPT_PATH"
    fi
    echo ""
    read -p "Press Enter to return..."
}

# Get TTS API model and temporary directory paths (based on platform)
get_tts_api_paths() {
    local platform=$1
    local models_dir=""
    local temp_dir=""
    
    case $platform in
        macos)
            models_dir="/Users/ttbye/ReadKnows/tts/models"
            temp_dir="/Users/ttbye/ReadKnows/tts/temp"
            ;;
        linux)
            models_dir="/volume5/docker/ReadKnows/tts-models"
            temp_dir="/volume5/docker/ReadKnows/tts-temp"
            ;;
        windows)
            models_dir="D:\\Docker\\ReadKnows\\tts-models"
            temp_dir="D:\\Docker\\ReadKnows\\tts-temp"
            ;;
        *)
            # Default to relative paths under project directory
            PROJECT_ROOT=$(get_project_root)
            models_dir="$PROJECT_ROOT/tts-api/models"
            temp_dir="$PROJECT_ROOT/tts-api/temp"
            ;;
    esac
    
    echo "$models_dir|$temp_dir"
}

# Install TTS API service
install_tts_service() {
    print_header "Install TTS API Service"
    
    PROJECT_ROOT=$(get_project_root)
    TTS_API_DIR="$PROJECT_ROOT/tts-api"
    
    if [ ! -d "$TTS_API_DIR" ]; then
        print_error "TTS API directory not found: $TTS_API_DIR"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Detect platform
    PLATFORM=$(detect_platform)
    
    # If platform detection failed, try manual detection
    if [ "$PLATFORM" = "unknown" ]; then
        print_warning "Automatic platform detection failed, trying manual detection..."
        UNAME_S=$(uname -s)
        if [ "$UNAME_S" = "Darwin" ]; then
            PLATFORM="macos"
        elif [ "$UNAME_S" = "Linux" ]; then
            PLATFORM="linux"
        elif [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ] || echo "$UNAME_S" | grep -qE "^MINGW(64|32)_NT" || echo "$UNAME_S" | grep -qE "^MSYS_NT" || echo "$UNAME_S" | grep -qE "^CYGWIN_NT"; then
            PLATFORM="windows"
        else
            print_warning "Unable to auto-detect platform, please manually select"
            echo ""
            echo "  1) Linux"
            echo "  2) macOS"
            echo "  3) Windows"
            echo "  4) Synology NAS"
            echo ""
            read -p "Select platform (1-4, default: 1): " platform_choice
            platform_choice=${platform_choice:-1}
            case $platform_choice in
                1) PLATFORM="linux" ;;
                2) PLATFORM="macos" ;;
                3) PLATFORM="windows" ;;
                4) PLATFORM="synology" ;;
                *) PLATFORM="linux" ;;
            esac
        fi
    fi
    
    print_info "Detected platform: $PLATFORM"
    
    # Get TTS API paths
    TTS_PATHS=$(get_tts_api_paths "$PLATFORM")
    TTS_MODELS_DIR="${TTS_PATHS%%|*}"
    TTS_TEMP_DIR="${TTS_PATHS#*|}"
    
    print_info "TTS model directory: $TTS_MODELS_DIR"
    print_info "TTS temporary directory: $TTS_TEMP_DIR"
    
    # Create directories
    mkdir -p "$TTS_MODELS_DIR" "$TTS_TEMP_DIR"
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker service is not running, please start Docker service"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check port occupancy
    if command -v lsof &> /dev/null; then
        if lsof -Pi :5050 -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "Port 5050 is already in use"
            read -p "Continue? (Y/n, default: Y): " continue_install
            continue_install=${continue_install:-y}
            if [ "$continue_install" != "y" ] && [ "$continue_install" != "Y" ]; then
                print_info "Installation cancelled"
                echo ""
                read -p "Press Enter to return to main menu..."
                return
            fi
        fi
    fi
    
    # Check if TTS API container already exists
    if docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api$"; then
        print_warning "Found existing TTS API container"
        read -p "Stop and remove existing container? (Y/n, default: Y): " remove_existing
        remove_existing=${remove_existing:-y}
        if [ "$remove_existing" = "y" ] || [ "$remove_existing" = "Y" ]; then
            print_info "Stopping and removing existing container..."
            docker stop readknow-tts-api 2>/dev/null || true
            docker rm readknow-tts-api 2>/dev/null || true
            print_success "Existing container removed"
        fi
    fi
    
    # Select docker-compose file (search from sh directory)
    SH_DIR="$PROJECT_ROOT/sh"
    TTS_COMPOSE_FILE=""
    case $PLATFORM in
        macos)
            if [ -f "$SH_DIR/docker-compose-TTS-MACOS.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-MACOS.yml"
            elif [ -f "$SH_DIR/docker-compose-TTS-macos.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-macos.yml"
            fi
            ;;
        linux)
            if [ -f "$SH_DIR/docker-compose-TTS-Linux.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Linux.yml"
            elif [ -f "$SH_DIR/docker-compose-TTS-linux.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-linux.yml"
            fi
            ;;
        windows)
            if [ -f "$SH_DIR/docker-compose-TTS-WINDOWS.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-WINDOWS.yml"
            elif [ -f "$SH_DIR/docker-compose-TTS-windows.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-windows.yml"
            fi
            ;;
        synology)
            if [ -f "$SH_DIR/docker-compose-TTS-Synology.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Synology.yml"
            elif [ -f "$SH_DIR/docker-compose-TTS-synology.yml" ]; then
                TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-synology.yml"
            fi
            ;;
    esac
    
    # If platform-specific file not found, try to find generic file
    if [ -z "$TTS_COMPOSE_FILE" ]; then
        # Try to find generic TTS compose file
        if [ -f "$SH_DIR/docker-compose-TTS.yml" ]; then
            TTS_COMPOSE_FILE="$SH_DIR/docker-compose-TTS.yml"
        elif [ -f "$TTS_API_DIR/docker-compose.yml" ]; then
            TTS_COMPOSE_FILE="$TTS_API_DIR/docker-compose.yml"
        else
            print_error "TTS API docker-compose file not found"
            print_info "Please confirm one of the following files exists:"
            echo "  - $SH_DIR/docker-compose-TTS-Linux.yml"
            echo "  - $SH_DIR/docker-compose-TTS-MACOS.yml"
            echo "  - $SH_DIR/docker-compose-TTS-WINDOWS.yml"
            echo "  - $SH_DIR/docker-compose-TTS-Synology.yml"
            echo ""
            read -p "Press Enter to return to main menu..."
            return
        fi
    fi
    
    print_info "Using configuration file: $TTS_COMPOSE_FILE"
    
    # Switch to sh directory (where docker-compose file is located)
    cd "$SH_DIR"
    
    # Check if image already exists (speed up installation)
    TTS_IMAGE="ttbye/tts-api:latest"
    COMPOSE_FILE_NAME=$(basename "$TTS_COMPOSE_FILE")
    
    # Ensure COMPOSE_CMD is set
    if [ -z "$COMPOSE_CMD" ]; then
        if command -v docker-compose &> /dev/null; then
            COMPOSE_CMD="docker-compose"
        elif docker compose version &> /dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
        else
            print_error "Docker Compose not found"
            echo ""
            read -p "Press Enter to return to main menu..."
            return
        fi
    fi
    
    # Build docker compose command array (handle space issues)
    if [ "$COMPOSE_CMD" = "docker-compose" ]; then
        COMPOSE_ARGS=("docker-compose" "-f" "$COMPOSE_FILE_NAME")
    else
        COMPOSE_ARGS=("docker" "compose" "-f" "$COMPOSE_FILE_NAME")
    fi
    
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${TTS_IMAGE}$"; then
        print_info "TTS API image detected, skipping build"
        print_info "Starting service directly..."
        "${COMPOSE_ARGS[@]}" up -d
    else
        print_info "Starting TTS API image build..."
        print_warning "Build process may take 5-15 minutes, depending on network speed"
        print_info "Build steps include:"
        echo "  1. Download base image (python:3.11-slim)"
        echo "  2. Install system dependencies (FFmpeg, Git, Git LFS)"
        echo "  3. Install Python dependencies"
        echo "  4. Copy source code"
        echo ""
        
        # Pre-pull base images to speed up build
        read -p "Pre-pull base images to speed up build? (Y/n, default: Y): " pre_pull
        pre_pull=${pre_pull:-y}
        if [ "$pre_pull" = "y" ] || [ "$pre_pull" = "Y" ]; then
            print_info "Pre-pulling base images..."
            docker pull python:3.11-slim > /dev/null 2>&1 || print_warning "Failed to pull python:3.11-slim, will download automatically during build"
            print_success "Base images pre-pull completed"
            echo ""
        fi
        
        print_info "Starting image build, please wait patiently..."
        print_info "Tip: You can press Ctrl+C to interrupt the build, then rerun this script later to continue"
        echo ""
        
        # Use buildx parallel build (if available)
        if docker buildx version &> /dev/null 2>&1; then
            print_info "Docker Buildx detected, will use parallel build..."
            "${COMPOSE_ARGS[@]}" build
        else
            "${COMPOSE_ARGS[@]}" build
        fi
        
        if [ $? -eq 0 ]; then
            print_success "Image build completed"
            print_info "Starting services..."
            "${COMPOSE_ARGS[@]}" up -d
        else
            print_error "Image build failed"
            echo ""
            read -p "Press Enter to return to main menu..."
            return
        fi
    fi
    
    if [ $? -eq 0 ]; then
        print_success "TTS API service started successfully"
        echo ""
        print_info "Waiting for service to be ready..."
        sleep 5
        
        # Test service health status
        max_attempts=15
        attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if curl -f http://localhost:5050/health &> /dev/null 2>&1; then
                print_success "TTS API service is ready"
                echo ""
                print_info "Service information:"
                echo "  Service address: http://localhost:5050"
                echo "  Health check: http://localhost:5050/health"
                echo "  Model list: http://localhost:5050/api/tts/models"
                echo "  Voice list: http://localhost:5050/api/tts/voices"
                echo "  Test page: http://localhost:5050/test"
                echo ""
                print_info "Common commands:"
                echo "  View logs: docker logs -f readknow-tts-api"
                echo "  Stop service: docker stop readknow-tts-api"
                echo "  Restart service: docker restart readknow-tts-api"
                echo "  Delete service: Run install.sh, select option 7: Delete TTS API service"
                echo ""
                print_warning "Please configure TTS server address and port in system settings"
                break
            fi
            attempt=$((attempt + 1))
            echo -n "."
            sleep 2
        done
        
        if [ $attempt -ge $max_attempts ]; then
            print_warning "Service startup timeout, but may still be running"
            print_info "Please check logs: docker logs readknow-tts-api"
        fi
    else
        print_error "TTS API service startup failed"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Remove TTS API service
remove_tts_api() {
    print_header "Remove TTS API Service"
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker service is not running"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check if container exists
    if ! docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api$"; then
        print_warning "TTS API container not found"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check container status
    CONTAINER_STATUS=$(docker ps --format "{{.Names}}" | grep -qE "^readknow-tts-api$" && echo "running" || echo "stopped")
    
    echo ""
    print_info "Container status: $CONTAINER_STATUS"
    print_warning "This operation will stop and delete the TTS API container, but will not delete model files"
    echo ""
    read -p "Confirm deletion? (y/N, default: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "Deletion cancelled"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Stop container
    if [ "$CONTAINER_STATUS" = "running" ]; then
        print_info "Stopping container..."
        docker stop readknow-tts-api 2>/dev/null || true
        sleep 2
    fi
    
    # Delete container
    print_info "Deleting container..."
    if docker rm readknow-tts-api 2>/dev/null; then
        print_success "Container deleted"
    else
        print_error "Container deletion failed, trying force delete..."
        docker rm -f readknow-tts-api 2>/dev/null || true
        if docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api$"; then
            print_error "Container deletion failed"
        else
            print_success "Container force deleted"
                fi
            fi
            
    # Ask if delete image
    echo ""
    read -p "Also delete TTS API image? (y/N, default: N): " delete_image
    delete_image=${delete_image:-n}
    
    if [ "$delete_image" = "y" ] || [ "$delete_image" = "Y" ]; then
        TTS_IMAGE="ttbye/tts-api:latest"
        if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${TTS_IMAGE}$"; then
            print_info "Deleting image: $TTS_IMAGE"
            if docker rmi "$TTS_IMAGE" 2>/dev/null; then
                print_success "Image deleted"
            else
                print_warning "Image deletion failed (may be used by other containers)"
            fi
        else
            print_info "Image does not exist, skipping deletion"
        fi
    fi
    
    echo ""
    print_success "TTS API service removal completed"
    echo ""
    read -p "Press Enter to return..."
    }
    
# Install TTS-API-Lite service
install_tts_api_lite() {
    print_header "Install TTS-API-Lite Service"
    
    PROJECT_ROOT=$(get_project_root)
    TTS_API_LITE_DIR="$PROJECT_ROOT/tts-api-lite"
    
    if [ ! -d "$TTS_API_LITE_DIR" ]; then
        print_error "TTS-API-Lite directory not found: $TTS_API_LITE_DIR"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Detect platform
    PLATFORM=$(detect_platform)
    
    # If platform detection failed, try manual detection
    if [ "$PLATFORM" = "unknown" ]; then
        print_warning "Automatic platform detection failed, trying manual detection..."
        UNAME_S=$(uname -s)
        if [ "$UNAME_S" = "Darwin" ]; then
            PLATFORM="macos"
        elif [ "$UNAME_S" = "Linux" ]; then
            PLATFORM="linux"
        elif [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ] || echo "$UNAME_S" | grep -qE "^MINGW(64|32)_NT" || echo "$UNAME_S" | grep -qE "^MSYS_NT" || echo "$UNAME_S" | grep -qE "^CYGWIN_NT"; then
            PLATFORM="windows"
        else
            print_warning "Unable to auto-detect platform, please manually select"
            echo ""
            echo "  1) Linux"
            echo "  2) macOS"
            echo "  3) Windows"
            echo "  4) Synology NAS"
            echo ""
            read -p "Select platform (1-4, default: 1): " platform_choice
            platform_choice=${platform_choice:-1}
            case $platform_choice in
                1) PLATFORM="linux" ;;
                2) PLATFORM="macos" ;;
                3) PLATFORM="windows" ;;
                4) PLATFORM="synology" ;;
                *) PLATFORM="linux" ;;
            esac
        fi
    fi
    
    print_info "Detected platform: $PLATFORM"
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker service is not running, please start Docker service"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check port occupancy (Lite uses 5051)
    if command -v lsof &> /dev/null; then
        if lsof -Pi :5051 -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "Port 5051 is already in use"
            read -p "Continue? (Y/n, default: Y): " continue_install
            continue_install=${continue_install:-y}
            if [ "$continue_install" != "y" ] && [ "$continue_install" != "Y" ]; then
                print_info "Installation cancelled"
        echo ""
                read -p "Press Enter to return to main menu..."
                return
            fi
        fi
    fi
    
    # Check if TTS-API-Lite container already exists
    if docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api-lite$"; then
        print_warning "Found existing TTS-API-Lite container"
        read -p "Stop and remove existing container? (Y/n, default: Y): " remove_existing
        remove_existing=${remove_existing:-y}
        if [ "$remove_existing" = "y" ] || [ "$remove_existing" = "Y" ]; then
            print_info "Stopping and removing existing container..."
            docker stop readknow-tts-api-lite 2>/dev/null || true
            docker rm readknow-tts-api-lite 2>/dev/null || true
            print_success "Existing container removed"
        fi
    fi
    
    # Select docker-compose file (search from sh directory)
    SH_DIR="$PROJECT_ROOT/sh"
    TTS_LITE_COMPOSE_FILE=""
    case $PLATFORM in
        macos)
            if [ -f "$SH_DIR/docker-compose-TTS-Lite-MACOS.yml" ]; then
                TTS_LITE_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Lite-MACOS.yml"
            fi
            ;;
        linux)
            if [ -f "$SH_DIR/docker-compose-TTS-Lite-Linux.yml" ]; then
                TTS_LITE_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Lite-Linux.yml"
            fi
            ;;
        windows)
            if [ -f "$SH_DIR/docker-compose-TTS-Lite-WINDOWS.yml" ]; then
                TTS_LITE_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Lite-WINDOWS.yml"
            fi
            ;;
        synology)
            if [ -f "$SH_DIR/docker-compose-TTS-Lite-Synology.yml" ]; then
                TTS_LITE_COMPOSE_FILE="$SH_DIR/docker-compose-TTS-Lite-Synology.yml"
            fi
            ;;
    esac
    
    if [ -z "$TTS_LITE_COMPOSE_FILE" ]; then
        print_error "TTS-API-Lite docker-compose file not found"
        print_info "Please confirm one of the following files exists:"
        echo "  - $SH_DIR/docker-compose-TTS-Lite-Linux.yml"
        echo "  - $SH_DIR/docker-compose-TTS-Lite-MACOS.yml"
        echo "  - $SH_DIR/docker-compose-TTS-Lite-WINDOWS.yml"
        echo "  - $SH_DIR/docker-compose-TTS-Lite-Synology.yml"
    echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    print_info "Using configuration file: $TTS_LITE_COMPOSE_FILE"
    
    # Switch to sh directory
    cd "$SH_DIR"
    
    # Check if image already exists
    TTS_LITE_IMAGE="ttbye/tts-api-lite:latest"
    COMPOSE_FILE_NAME=$(basename "$TTS_LITE_COMPOSE_FILE")
    
    # Ensure COMPOSE_CMD is set
    if [ -z "$COMPOSE_CMD" ]; then
        if command -v docker-compose &> /dev/null; then
            COMPOSE_CMD="docker-compose"
        elif docker compose version &> /dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
        else
            print_error "Docker Compose not found"
    echo ""
            read -p "Press Enter to return to main menu..."
            return
        fi
    fi
    
    # Build docker compose command array
    if [ "$COMPOSE_CMD" = "docker-compose" ]; then
        COMPOSE_ARGS=("docker-compose" "-f" "$COMPOSE_FILE_NAME")
    else
        COMPOSE_ARGS=("docker" "compose" "-f" "$COMPOSE_FILE_NAME")
    fi
    
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${TTS_LITE_IMAGE}$"; then
        print_info "TTS-API-Lite image detected, skipping build"
        print_info "Starting service directly..."
        "${COMPOSE_ARGS[@]}" up -d
    else
        print_info "Starting TTS-API-Lite image build..."
        print_info "Lightweight version builds faster, usually takes only 2-5 minutes"
        print_info "Build steps include:"
        echo "  1. Download base image (python:3.11-slim)"
        echo "  2. Install system dependencies (FFmpeg)"
        echo "  3. Install Python dependencies (online TTS only)"
        echo "  4. Copy source code"
        echo ""
        
        # Pre-pull base images
        read -p "Pre-pull base images to speed up build? (Y/n, default: Y): " pre_pull
        pre_pull=${pre_pull:-y}
        if [ "$pre_pull" = "y" ] || [ "$pre_pull" = "Y" ]; then
            print_info "Pre-pulling base images..."
            docker pull python:3.11-slim > /dev/null 2>&1 || print_warning "Failed to pull python:3.11-slim, will download automatically during build"
            print_success "Base images pre-pull completed"
            echo ""
        fi
        
        print_info "Starting image build, please wait patiently..."
        echo ""
        
        # Use buildx parallel build (if available)
        if docker buildx version &> /dev/null 2>&1; then
            print_info "Docker Buildx detected, will use parallel build..."
            "${COMPOSE_ARGS[@]}" build
        else
            "${COMPOSE_ARGS[@]}" build
        fi
        
        if [ $? -eq 0 ]; then
            print_success "Image build completed"
            print_info "Starting services..."
            "${COMPOSE_ARGS[@]}" up -d
        else
            print_error "Image build failed"
            echo ""
            read -p "Press Enter to return to main menu..."
            return
        fi
    fi
    
    if [ $? -eq 0 ]; then
        print_success "TTS-API-Lite service started successfully"
        echo ""
        print_info "Waiting for service to be ready..."
        sleep 5
        
        # Test service health status
        max_attempts=15
        attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if curl -f http://localhost:5051/health &> /dev/null 2>&1; then
                print_success "TTS-API-Lite service is ready"
                echo ""
                print_info "Service information:"
                echo "  Service address: http://localhost:5051"
                echo "  Health check: http://localhost:5051/health"
                echo "  Model list: http://localhost:5051/api/tts/models"
                echo "  Voice list: http://localhost:5051/api/tts/voices"
                echo "  Test page: http://localhost:5051/test"
                echo ""
                print_info "Common commands:"
                echo "  View logs: docker logs -f readknow-tts-api-lite"
                echo "  Stop service: docker stop readknow-tts-api-lite"
                echo "  Restart service: docker restart readknow-tts-api-lite"
                echo "  Delete service: Run install.sh, select option 8 → Delete TTS-API-Lite service"
                echo ""
                print_warning "Note: TTS-API-Lite uses port 5051 (different from full TTS-API's port 5050)"
                print_warning "Please configure TTS server address and port to 5051 in system settings"
                break
            fi
            attempt=$((attempt + 1))
            echo -n "."
            sleep 2
        done
        
        if [ $attempt -ge $max_attempts ]; then
            print_warning "Service startup timeout, but may still be running"
            print_info "Please check logs: docker logs readknow-tts-api-lite"
        fi
    else
        print_error "TTS-API-Lite service startup failed"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Install OCR API service
install_ocr_service() {
    print_header "Install OCR API Service"
    
    PROJECT_ROOT=$(get_project_root)
    OCR_API_DIR="$PROJECT_ROOT/ocr-api"
    
    if [ ! -d "$OCR_API_DIR" ]; then
        print_error "OCR API directory not found: $OCR_API_DIR"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Detect platform
    PLATFORM=$(detect_platform)
    
    # If platform detection fails, try manual detection
    if [ "$PLATFORM" = "unknown" ]; then
        print_warning "Automatic platform detection failed, trying manual detection..."
        UNAME_S=$(uname -s)
        if [ "$UNAME_S" = "Darwin" ]; then
            PLATFORM="macos"
        elif [ "$UNAME_S" = "Linux" ]; then
            PLATFORM="linux"
        elif [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ] || echo "$UNAME_S" | grep -qE "^MINGW(64|32)_NT" || echo "$UNAME_S" | grep -qE "^MSYS_NT" || echo "$UNAME_S" | grep -qE "^CYGWIN_NT"; then
            PLATFORM="windows"
        else
            print_warning "Unable to automatically detect platform, please select manually"
            echo ""
            echo "  1) Linux"
            echo "  2) macOS"
            echo "  3) Windows"
            echo "  4) Synology NAS"
            echo ""
            read -p "Please select platform (1-4, default: 1): " platform_choice
            platform_choice=${platform_choice:-1}
            case $platform_choice in
                1) PLATFORM="linux" ;;
                2) PLATFORM="macos" ;;
                3) PLATFORM="windows" ;;
                4) PLATFORM="synology" ;;
                *) PLATFORM="linux" ;;
            esac
        fi
    fi
    
    print_info "Detected platform: $PLATFORM"
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker service is not running, please start Docker service"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check port usage (OCR API uses port 5060)
    if command -v lsof &> /dev/null; then
        if lsof -Pi :5060 -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "Port 5060 is already in use"
            read -p "Continue? (Y/n, default: Y): " continue_install
            continue_install=${continue_install:-y}
            if [ "$continue_install" != "y" ] && [ "$continue_install" != "Y" ]; then
                print_info "Installation cancelled"
                echo ""
                read -p "Press Enter to return to main menu..."
                return
            fi
        fi
    fi
    
    # Check if OCR API container already exists
    if docker ps -a --format "{{.Names}}" | grep -qE "^ocr-api$"; then
        print_warning "Found existing OCR API container"
        read -p "Stop and delete existing container? (Y/n, default: Y): " remove_existing
        remove_existing=${remove_existing:-y}
        if [ "$remove_existing" = "y" ] || [ "$remove_existing" = "Y" ]; then
            print_info "Stopping and deleting existing container..."
            docker stop ocr-api 2>/dev/null || true
            docker rm ocr-api 2>/dev/null || true
            print_success "Existing container deleted"
        fi
    fi
    
    # Select docker-compose file (search from sh directory)
    SH_DIR="$PROJECT_ROOT/sh"
    OCR_COMPOSE_FILE=""
    case $PLATFORM in
        macos)
            if [ -f "$SH_DIR/docker-compose-OCR-MACOS.yml" ]; then
                OCR_COMPOSE_FILE="$SH_DIR/docker-compose-OCR-MACOS.yml"
            elif [ -f "$SH_DIR/docker-compose-OCR-macos.yml" ]; then
                OCR_COMPOSE_FILE="$SH_DIR/docker-compose-OCR-macos.yml"
            fi
            ;;
        linux)
            if [ -f "$SH_DIR/docker-compose-OCR-Linux.yml" ]; then
                OCR_COMPOSE_FILE="$SH_DIR/docker-compose-OCR-Linux.yml"
            elif [ -f "$SH_DIR/docker-compose-OCR-linux.yml" ]; then
                OCR_COMPOSE_FILE="$SH_DIR/docker-compose-OCR-linux.yml"
            fi
            ;;
        windows)
            if [ -f "$SH_DIR/docker-compose-OCR-WINDOWS.yml" ]; then
                OCR_COMPOSE_FILE="$SH_DIR/docker-compose-OCR-WINDOWS.yml"
            elif [ -f "$SH_DIR/docker-compose-OCR-windows.yml" ]; then
                OCR_COMPOSE_FILE="$SH_DIR/docker-compose-OCR-windows.yml"
            fi
            ;;
        synology)
            if [ -f "$SH_DIR/docker-compose-OCR-Synology.yml" ]; then
                OCR_COMPOSE_FILE="$SH_DIR/docker-compose-OCR-Synology.yml"
            elif [ -f "$SH_DIR/docker-compose-OCR-synology.yml" ]; then
                OCR_COMPOSE_FILE="$SH_DIR/docker-compose-OCR-synology.yml"
            fi
            ;;
    esac
    
    # If platform-specific file not found, try to find generic file
    if [ -z "$OCR_COMPOSE_FILE" ]; then
        # Try to find generic OCR compose file
        if [ -f "$SH_DIR/docker-compose-OCR.yml" ]; then
            OCR_COMPOSE_FILE="$SH_DIR/docker-compose-OCR.yml"
        elif [ -f "$OCR_API_DIR/docker-compose.yml" ]; then
            OCR_COMPOSE_FILE="$OCR_API_DIR/docker-compose.yml"
        else
            print_error "OCR API docker-compose file not found"
            print_info "Please confirm one of the following files exists:"
            echo "  - $SH_DIR/docker-compose-OCR-Linux.yml"
            echo "  - $SH_DIR/docker-compose-OCR-MACOS.yml"
            echo "  - $SH_DIR/docker-compose-OCR-WINDOWS.yml"
            echo "  - $SH_DIR/docker-compose-OCR-Synology.yml"
            echo ""
            read -p "Press Enter to return to main menu..."
            return
        fi
    fi
    
    print_info "Using configuration file: $OCR_COMPOSE_FILE"
    
    # Switch to sh directory (where docker-compose file is located)
    cd "$SH_DIR"
    COMPOSE_FILE_NAME=$(basename "$OCR_COMPOSE_FILE")
    
    # Check if image already exists
    OCR_IMAGE="ttbye/ocr-api:latest"
    
    # Ensure COMPOSE_CMD is set
    if [ -z "$COMPOSE_CMD" ]; then
        if command -v docker-compose &> /dev/null; then
            COMPOSE_CMD="docker-compose"
        elif docker compose version &> /dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
        else
            print_error "Docker Compose not found"
            echo ""
            read -p "Press Enter to return to main menu..."
            return
        fi
    fi
    
    # Build docker compose command array (handle space issues)
    if [ "$COMPOSE_CMD" = "docker-compose" ]; then
        COMPOSE_ARGS=("docker-compose" "-f" "$COMPOSE_FILE_NAME")
    else
        COMPOSE_ARGS=("docker" "compose" "-f" "$COMPOSE_FILE_NAME")
    fi
    
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${OCR_IMAGE}$"; then
        print_info "OCR API image detected, skipping build"
        print_info "Starting service directly..."
        "${COMPOSE_ARGS[@]}" up -d
    else
        print_info "Starting to build OCR API image..."
        print_warning "Build process may take 10-20 minutes, depending on network speed"
        print_info "Build steps include:"
        echo "  1. Download base image (python:3.11-slim)"
        echo "  2. Install system dependencies (libglx-mesa0, libgl1-mesa-dri, libglib2.0-0)"
        echo "  3. Install Python dependencies (PaddleOCR, PaddlePaddle, etc.)"
        echo "  4. Copy source code"
        echo ""
        print_warning "Note: PaddleOCR first installation will download model files (about 100-200MB), which takes a long time"
        echo ""
        
        # Pre-pull base image to speed up build
        read -p "Pre-pull base image to speed up build? (Y/n, default: Y): " pre_pull
        pre_pull=${pre_pull:-y}
        if [ "$pre_pull" = "y" ] || [ "$pre_pull" = "Y" ]; then
            print_info "Pre-pulling base image..."
            docker pull python:3.11-slim > /dev/null 2>&1 || print_warning "Failed to pull python:3.11-slim, will download during build"
            print_success "Base image pre-pull completed"
            echo ""
        fi
        
        # Ask if clear build cache (to fix libgl1-mesa-glx deprecation issue)
        read -p "Clear build cache and rebuild? (y/N, default: N, recommended Y if encountering package installation errors): " no_cache
        no_cache=${no_cache:-n}
        BUILD_ARGS=()
        if [ "$no_cache" = "y" ] || [ "$no_cache" = "Y" ]; then
            BUILD_ARGS+=("--no-cache")
            print_info "Will use --no-cache option to rebuild (avoid using old cache layers)"
        fi
        
        print_info "Starting to build image, please wait patiently..."
        print_info "Tip: You can press Ctrl+C to interrupt the build, then run this script again later to continue"
        echo ""
        
        # Use buildx parallel build (if available)
        if docker buildx version &> /dev/null 2>&1; then
            print_info "Docker Buildx detected, will use parallel build..."
            "${COMPOSE_ARGS[@]}" build "${BUILD_ARGS[@]}"
        else
            "${COMPOSE_ARGS[@]}" build "${BUILD_ARGS[@]}"
        fi
        
        if [ $? -eq 0 ]; then
            print_success "Image build completed"
            print_info "Starting service..."
            "${COMPOSE_ARGS[@]}" up -d
        else
            print_error "Image build failed"
            echo ""
            read -p "Press Enter to return to main menu..."
            return
        fi
    fi
    
    if [ $? -eq 0 ]; then
        print_success "OCR API service started successfully"
        echo ""
        print_info "Waiting for service to be ready..."
        sleep 5
        
        # Test service health status
        max_attempts=30
        attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if curl -f http://localhost:5060/health &> /dev/null 2>&1; then
                print_success "OCR API service is ready"
                echo ""
                print_info "Service information:"
                echo "  Service address: http://localhost:5060"
                echo "  Health check: http://localhost:5060/health"
                echo "  Recognition API: http://localhost:5060/api/ocr/recognize"
                echo ""
                print_info "Common commands:"
                echo "  View logs: docker logs -f ocr-api"
                echo "  Stop service: docker stop ocr-api"
                echo "  Restart service: docker restart ocr-api"
                echo "  Delete service: Run install.sh, select option 10 → 7: Delete OCR-API service"
                echo ""
                print_warning "Please configure OCR server address and port in system settings (default: ocr-api:5060)"
                break
            fi
            attempt=$((attempt + 1))
            echo -n "."
            sleep 2
        done
        
        if [ $attempt -ge $max_attempts ]; then
            print_warning "Service startup timeout, but may still be running"
            print_info "Please check logs: docker logs ocr-api"
        fi
    else
        print_error "OCR API service startup failed"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Remove TTS-API-Lite service
remove_tts_api_lite() {
    print_header "Remove TTS-API-Lite Service"
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker service is not running"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check if container exists
    if ! docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api-lite$"; then
        print_warning "TTS-API-Lite container not found"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check container status
    CONTAINER_STATUS=$(docker ps --format "{{.Names}}" | grep -qE "^readknow-tts-api-lite$" && echo "running" || echo "stopped")
    
    echo ""
    print_info "Container status: $CONTAINER_STATUS"
    print_warning "This operation will stop and delete the TTS-API-Lite container"
        echo ""
    read -p "Confirm deletion? (y/N, default: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "Deletion cancelled"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Stop container
    if [ "$CONTAINER_STATUS" = "running" ]; then
        print_info "Stopping container..."
        docker stop readknow-tts-api-lite 2>/dev/null || true
        sleep 2
    fi
    
    # Delete container
    print_info "Deleting container..."
    if docker rm readknow-tts-api-lite 2>/dev/null; then
        print_success "Container deleted"
    else
        print_error "Container deletion failed, trying force delete..."
        docker rm -f readknow-tts-api-lite 2>/dev/null || true
        if docker ps -a --format "{{.Names}}" | grep -qE "^readknow-tts-api-lite$"; then
            print_error "Container deletion failed"
        else
            print_success "Container force deleted"
        fi
    fi
    
    # Ask if delete image
        echo ""
    read -p "Also delete TTS-API-Lite image? (y/N, default: N): " delete_image
    delete_image=${delete_image:-n}
    
    if [ "$delete_image" = "y" ] || [ "$delete_image" = "Y" ]; then
        TTS_LITE_IMAGE="ttbye/tts-api-lite:latest"
        if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${TTS_LITE_IMAGE}$"; then
            print_info "Deleting image: $TTS_LITE_IMAGE"
            if docker rmi "$TTS_LITE_IMAGE" 2>/dev/null; then
                print_success "Image deleted"
            else
                print_warning "Image deletion failed (may be used by other containers)"
            fi
        else
            print_info "Image does not exist, skipping deletion"
        fi
    fi
    
    echo ""
    print_success "TTS-API-Lite service removal completed"
    echo ""
    read -p "Press Enter to return..."
}

# Remove OCR API service
remove_ocr_service() {
    print_header "Remove OCR API Service"
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker service is not running"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check if container exists
    if ! docker ps -a --format "{{.Names}}" | grep -qE "^ocr-api$"; then
        print_warning "OCR API container not found"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    # Check container status
    CONTAINER_STATUS=$(docker ps --format "{{.Names}}" | grep -qE "^ocr-api$" && echo "running" || echo "stopped")
    
    echo ""
    print_info "Container status: $CONTAINER_STATUS"
    print_warning "This operation will stop and delete the OCR API container"
    echo ""
    read -p "Confirm deletion? (y/N, default: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "Deletion cancelled"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Stop container
    if [ "$CONTAINER_STATUS" = "running" ]; then
        print_info "Stopping container..."
        docker stop ocr-api 2>/dev/null || true
        sleep 2
    fi
    
    # Delete container
    print_info "Deleting container..."
    if docker rm ocr-api 2>/dev/null; then
        print_success "Container deleted"
    else
        print_error "Container deletion failed, trying force delete..."
        docker rm -f ocr-api 2>/dev/null || true
        if docker ps -a --format "{{.Names}}" | grep -qE "^ocr-api$"; then
            print_error "Container deletion failed"
        else
            print_success "Container force deleted"
        fi
    fi
    
    # Ask if delete image
    echo ""
    read -p "Also delete OCR API image? (y/N, default: N): " delete_image
    delete_image=${delete_image:-n}
    
    if [ "$delete_image" = "y" ] || [ "$delete_image" = "Y" ]; then
        OCR_IMAGE="ttbye/ocr-api:latest"
        if docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "^${OCR_IMAGE}$"; then
            print_info "Deleting image: $OCR_IMAGE"
            if docker rmi "$OCR_IMAGE" 2>/dev/null; then
                print_success "Image deleted"
            else
                print_warning "Image deletion failed (may be used by other containers)"
            fi
        else
            print_info "Image does not exist, skipping deletion"
        fi
    fi
    
    echo ""
    print_success "OCR API service removal completed"
    echo ""
    read -p "Press Enter to return..."
}

# Download TTS models (deprecated, kept for compatibility)
download_tts_models() {
    print_header "Download TTS Models"
    
    print_warning "This feature is deprecated"
    print_info "TTS API service will automatically download required models on first startup"
    print_info "If you need to manually manage models, please directly operate the model directory"
    
    PROJECT_ROOT=$(get_project_root)
    PLATFORM=$(detect_platform)
    TTS_PATHS=$(get_tts_api_paths "$PLATFORM")
    MODELS_DIR="${TTS_PATHS%%|*}"
    
    print_info "Model directory: $MODELS_DIR"
    print_info "Please place model files in the following directories:"
    echo "  - IndexTTS2: $MODELS_DIR/indextts2/"
    echo "  - CosyVoice: $MODELS_DIR/cosyvoice/"
    echo "  - MultiTTS: $MODELS_DIR/multitts/"
    
    echo ""
    read -p "Press Enter to return..."
}

# Delete exported image files
delete_exported_images() {
    PROJECT_ROOT=$(get_project_root)
    IMAGE_DIR="$PROJECT_ROOT/docker-images"
    
    print_header "Delete Exported Image Files"
    
    if [ ! -d "$IMAGE_DIR" ]; then
        print_warning "Image directory does not exist: $IMAGE_DIR"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Find image files
    IMAGE_FILES=$(find "$IMAGE_DIR" -name "*.tar.gz" -type f 2>/dev/null)
    
    if [ -z "$IMAGE_FILES" ]; then
        print_info "No image files found"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    echo ""
    print_info "Found the following image files:"
    echo "$IMAGE_FILES" | while read -r file; do
        if [ -f "$file" ]; then
            SIZE=$(du -h "$file" | cut -f1)
            echo "  - $file ($SIZE)"
        fi
    done
    
    echo ""
    print_warning "This operation will permanently delete the above image files, cannot be recovered!"
    read -p "Confirm deletion? (y/N, default: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "Deletion cancelled"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Delete files
    DELETED_COUNT=0
    TOTAL_SIZE=0
    
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            SIZE=$(du -k "$file" 2>/dev/null | cut -f1 || echo "0")
            if rm -f "$file" 2>/dev/null; then
                DELETED_COUNT=$((DELETED_COUNT + 1))
                TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
                print_success "Deleted: $(basename "$file")"
            else
                print_error "Deletion failed: $(basename "$file")"
            fi
        fi
    done <<< "$IMAGE_FILES"
    
    # Try to delete README.md (if exists)
    if [ -f "$IMAGE_DIR/README.md" ]; then
        rm -f "$IMAGE_DIR/README.md" 2>/dev/null
    fi
    
    # If directory is empty, ask if delete directory
    if [ -d "$IMAGE_DIR" ] && [ -z "$(ls -A "$IMAGE_DIR" 2>/dev/null)" ]; then
        read -p "Directory is empty, delete directory? (y/N, default: N): " delete_dir
        delete_dir=${delete_dir:-n}
        if [ "$delete_dir" = "y" ] || [ "$delete_dir" = "Y" ]; then
            rmdir "$IMAGE_DIR" 2>/dev/null && print_success "Deleted empty directory: $IMAGE_DIR"
        fi
    fi
    
    echo ""
    if [ $DELETED_COUNT -gt 0 ]; then
        TOTAL_SIZE_MB=$((TOTAL_SIZE / 1024))
        print_success "Deletion completed! Deleted $DELETED_COUNT files, freed approximately ${TOTAL_SIZE_MB}MB"
    else
        print_warning "No files deleted"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Delete Docker images
delete_docker_images() {
    print_header "Delete Docker Images"
    
    PROJECT_ROOT=$(get_project_root)
    
    # If compose file not selected, try auto-select
    if [ -z "$COMPOSE_FILE_PATH" ]; then
        # Try to find compose files
        COMPOSE_FILES=(
            "$PROJECT_ROOT/sh/docker-compose.yml"
            "$PROJECT_ROOT/sh/docker-compose-Linux.yml"
            "$PROJECT_ROOT/sh/docker-compose-Synology.yml"
            "$PROJECT_ROOT/sh/docker-compose-MACOS.yml"
            "$PROJECT_ROOT/sh/docker-compose-WINDOWS.yml"
        )
        
        for file in "${COMPOSE_FILES[@]}"; do
            if [ -f "$file" ]; then
                COMPOSE_FILE_PATH="$file"
                break
            fi
        done
    fi
    
    # Read image names from docker-compose file
    BACKEND_IMAGE=""
    FRONTEND_IMAGE=""
    
    if [ -n "$COMPOSE_FILE_PATH" ] && [ -f "$COMPOSE_FILE_PATH" ]; then
        BACKEND_IMAGE=$(awk '/backend:/,/^[[:space:]]*[a-zA-Z]/ {if (/image:/) {gsub(/^[[:space:]]*image:[[:space:]]*/, ""); gsub(/["'\'']/, ""); print; exit}}' "$COMPOSE_FILE_PATH")
        FRONTEND_IMAGE=$(awk '/frontend:/,/^[[:space:]]*[a-zA-Z]/ {if (/image:/) {gsub(/^[[:space:]]*image:[[:space:]]*/, ""); gsub(/["'\'']/, ""); print; exit}}' "$COMPOSE_FILE_PATH")
    fi
    
    # If extraction failed, use default values
    if [ -z "$BACKEND_IMAGE" ]; then
        BACKEND_IMAGE="ttbye/readknows-backend:latest"
    fi
    if [ -z "$FRONTEND_IMAGE" ]; then
        FRONTEND_IMAGE="ttbye/readknows-frontend:latest"
    fi
    
    echo ""
    print_info "The following images will be deleted:"
    
    # Check backend image
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${BACKEND_IMAGE}$"; then
        BACKEND_SIZE=$(docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "^${BACKEND_IMAGE}" | awk '{print $2}')
        echo "  - $BACKEND_IMAGE ($BACKEND_SIZE)"
        BACKEND_EXISTS=true
    else
        echo "  - $BACKEND_IMAGE (not found)"
        BACKEND_EXISTS=false
    fi
    
    # Check frontend image
    if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${FRONTEND_IMAGE}$"; then
        FRONTEND_SIZE=$(docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "^${FRONTEND_IMAGE}" | awk '{print $2}')
        echo "  - $FRONTEND_IMAGE ($FRONTEND_SIZE)"
        FRONTEND_EXISTS=true
    else
        echo "  - $FRONTEND_IMAGE (not found)"
        FRONTEND_EXISTS=false
    fi
    
    if [ "$BACKEND_EXISTS" = false ] && [ "$FRONTEND_EXISTS" = false ]; then
        print_warning "No images found"
        echo ""
        read -p "Press Enter to return to main menu..."
        return
    fi
    
    echo ""
    print_warning "This operation will permanently delete the above Docker images, cannot be recovered!"
    print_warning "If containers are running, they will be automatically stopped and deleted."
    echo ""
    read -p "Confirm deletion? (y/N, default: N): " confirm_delete
    confirm_delete=${confirm_delete:-n}
    
    if [ "$confirm_delete" != "y" ] && [ "$confirm_delete" != "Y" ]; then
        print_info "Deletion cancelled"
        echo ""
        read -p "Press Enter to return..."
        return
    fi
    
    # Check and delete related containers (including running and stopped)
    if echo "$COMPOSE_FILE_PATH" | grep -qiE "(NAS|Synology|Linux)"; then
        BACKEND_CONTAINER="knowbooks-backend"
        FRONTEND_CONTAINER="knowbooks-frontend"
    else
        BACKEND_CONTAINER="readknows-backend"
        FRONTEND_CONTAINER="readknows-frontend"
    fi
    
    # Check all containers (including running and stopped)
    CONTAINERS_TO_DELETE=()
    
    # Check backend container
    if docker ps -a --format "{{.Names}}" | grep -qE "^${BACKEND_CONTAINER}$"; then
        CONTAINER_STATUS=$(docker ps --format "{{.Names}}" | grep -qE "^${BACKEND_CONTAINER}$" && echo "running" || echo "stopped")
        CONTAINERS_TO_DELETE+=("$BACKEND_CONTAINER:$CONTAINER_STATUS")
    fi
    
    # Check frontend container
    if docker ps -a --format "{{.Names}}" | grep -qE "^${FRONTEND_CONTAINER}$"; then
        CONTAINER_STATUS=$(docker ps --format "{{.Names}}" | grep -qE "^${FRONTEND_CONTAINER}$" && echo "running" || echo "stopped")
        CONTAINERS_TO_DELETE+=("$FRONTEND_CONTAINER:$CONTAINER_STATUS")
    fi
    
    # If containers exist, delete containers first
    if [ ${#CONTAINERS_TO_DELETE[@]} -gt 0 ]; then
        print_info "Related containers detected, will delete containers first..."
        
        # Try to use docker compose to delete (if available)
        if [ -n "$COMPOSE_FILE_PATH" ]; then
            COMPOSE_DIR="$(dirname "$COMPOSE_FILE_PATH")"
            OLD_DIR=$(pwd)
            cd "$COMPOSE_DIR"
            
            # Stop and delete containers
            print_info "Using docker compose to stop and delete containers..."
            $COMPOSE_CMD down --remove-orphans 2>/dev/null || true
            cd "$OLD_DIR"
        fi
        
        # Manually delete containers (as fallback)
        for container_info in "${CONTAINERS_TO_DELETE[@]}"; do
            CONTAINER_NAME="${container_info%%:*}"
            CONTAINER_STATUS="${container_info##*:}"
            
            if [ "$CONTAINER_STATUS" = "running" ]; then
                print_info "Stopping container: $CONTAINER_NAME"
                docker stop "$CONTAINER_NAME" 2>/dev/null || true
            fi
            
            print_info "Deleting container: $CONTAINER_NAME"
            docker rm "$CONTAINER_NAME" 2>/dev/null || true
            
            if docker ps -a --format "{{.Names}}" | grep -qE "^${CONTAINER_NAME}$"; then
                print_warning "Container $CONTAINER_NAME deletion failed, trying force delete..."
                docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
            else
                print_success "Container $CONTAINER_NAME deleted"
            fi
        done
    fi
    
    # Wait a bit to ensure containers are completely deleted
    sleep 1
    
    # Delete images
    DELETED_COUNT=0
    
    if [ "$BACKEND_EXISTS" = true ]; then
        print_info "Deleting backend image: $BACKEND_IMAGE"
        
        # Try normal delete first
        if docker rmi "$BACKEND_IMAGE" 2>/dev/null; then
            print_success "Backend image deleted successfully"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            # If failed, try force delete
            print_warning "Normal deletion failed, trying force delete..."
            if docker rmi -f "$BACKEND_IMAGE" 2>/dev/null; then
                print_success "Backend image force deleted successfully"
                DELETED_COUNT=$((DELETED_COUNT + 1))
            else
                print_error "Backend image deletion failed"
                print_info "Possible reasons:"
                echo "  1. Image is being used by other containers"
                echo "  2. Image is referenced by other tags"
                echo "  3. Insufficient permissions"
                echo ""
                print_info "You can try manual deletion:"
                echo "  docker rmi -f $BACKEND_IMAGE"
            fi
        fi
    fi
    
    if [ "$FRONTEND_EXISTS" = true ]; then
        print_info "Deleting frontend image: $FRONTEND_IMAGE"
        
        # Try normal delete first
        if docker rmi "$FRONTEND_IMAGE" 2>/dev/null; then
            print_success "Frontend image deleted successfully"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            # If failed, try force delete
            print_warning "Normal deletion failed, trying force delete..."
            if docker rmi -f "$FRONTEND_IMAGE" 2>/dev/null; then
                print_success "Frontend image force deleted successfully"
                DELETED_COUNT=$((DELETED_COUNT + 1))
            else
                print_error "Frontend image deletion failed"
                print_info "Possible reasons:"
                echo "  1. Image is being used by other containers"
                echo "  2. Image is referenced by other tags"
                echo "  3. Insufficient permissions"
                echo ""
                print_info "You can try manual deletion:"
                echo "  docker rmi -f $FRONTEND_IMAGE"
            fi
        fi
    fi
    
    echo ""
    if [ $DELETED_COUNT -gt 0 ]; then
        print_success "Deletion completed! Deleted $DELETED_COUNT images"
        print_info "You can now rerun the installation script for a complete rebuild"
    else
        print_warning "No images deleted"
    fi
    
    echo ""
    read -p "Press Enter to return..."
}

# Execute installation process
run_installation() {
    print_header "ReadKnows One-Click Installation and Deployment Script"
    
    # Check dependencies
    check_docker
    check_docker_compose
    check_docker_service
    check_docker_registry
    
    # Check files
    check_files
    
    # Create .env file
    create_env_file
    
    # Create directories
    create_directories
    
    # Check ports
    check_ports
    
    # Stop existing containers
    stop_existing_containers
    
    # Build and start
    build_and_start
    
    # Wait for services
    wait_for_services
    
    # Show status
    show_status
    
    # Check and install Calibre (if needed)
    check_and_install_calibre
    
    # Initialize admin
    init_admin
    
    print_header "Installation Complete"
    print_success "ReadKnows has been successfully installed and started!"
    echo ""
    print_info "Access addresses:"
    echo "  🌐 Frontend: http://localhost:1280"
    echo "  🔌 Backend API: http://localhost:1281"
    echo ""
    print_info "Next steps:"
    echo "  1. Open browser and visit http://localhost:1280"
    echo "  2. Login with the admin account created during initialization"
    echo "  3. Start using ReadKnows!"
    echo ""
}

# Main function
main() {
    show_main_menu
}

# Execute main function
main

