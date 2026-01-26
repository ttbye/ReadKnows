#!/bin/bash

# ReadKnows Installation Script - Language Selector
# This script allows users to choose their preferred installation language

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

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Language selection
print_header "ReadKnows Installation Script"
echo ""
print_info "Please select your preferred installation language:"
echo "  1) English"
echo "  2) 中文 (Chinese)"
echo ""
read -p "Enter your choice (1-2, default: 1): " lang_choice
lang_choice=${lang_choice:-1}

case $lang_choice in
    1)
        # English installation
        INSTALL_SCRIPT="$SCRIPT_DIR/install-en.sh"
        if [ ! -f "$INSTALL_SCRIPT" ]; then
            print_error "English installation script not found: $INSTALL_SCRIPT"
            exit 1
        fi
        print_info "Starting English installation..."
        bash "$INSTALL_SCRIPT"
        ;;
    2)
        # Chinese installation
        INSTALL_SCRIPT="$SCRIPT_DIR/install-zh.sh"
        if [ ! -f "$INSTALL_SCRIPT" ]; then
            print_error "Chinese installation script not found: $INSTALL_SCRIPT"
            exit 1
        fi
        print_info "Starting Chinese installation..."
        bash "$INSTALL_SCRIPT"
        ;;
    *)
        print_error "Invalid choice. Please run the script again and select 1 or 2."
        exit 1
        ;;
esac

