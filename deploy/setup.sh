#!/bin/bash
# Rise Local Lead Maker - Setup Script
# Supports both cPanel (PM2) and Docker Container deployment
# Usage: bash deploy/setup.sh [cpanel|docker]

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect deployment mode
DEPLOY_MODE="${1:-}"

# Configuration
PROJECT_HOME="$HOME/rise-local-lead-maker"
API_DIR="$PROJECT_HOME/rise-local-lead-creation/api"
DEPLOY_DIR="$PROJECT_HOME/deploy"
LOG_DIR="$PROJECT_HOME/logs"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Rise Local Lead Maker - Setup Script${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Function to print status messages
status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
    exit 1
}

warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# ============================================================================
# DEPLOYMENT MODE SELECTION
# ============================================================================
if [ -z "$DEPLOY_MODE" ]; then
    echo -e "${BLUE}Select deployment mode:${NC}"
    echo "  1) cPanel (PM2) - Traditional cPanel deployment with PM2 process manager"
    echo "  2) Docker - Container-based deployment with Docker Compose"
    echo ""
    read -p "Enter choice (1 or 2): " choice
    
    case $choice in
        1)
            DEPLOY_MODE="cpanel"
            ;;
        2)
            DEPLOY_MODE="docker"
            ;;
        *)
            error "Invalid choice. Please run again and select 1 or 2."
            ;;
    esac
fi

echo ""
info "Deployment mode: ${DEPLOY_MODE}"
echo ""

# ============================================================================
# DOCKER DEPLOYMENT PATH
# ============================================================================
if [ "$DEPLOY_MODE" = "docker" ]; then
    echo -e "${YELLOW}[Docker Deployment Mode]${NC}"
    echo ""
    
    # Check Docker prerequisites
    echo -e "${YELLOW}[1/4] Verifying Docker Prerequisites...${NC}"
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker: https://docs.docker.com/get-docker/"
    fi
    status "Docker $(docker --version) detected"
    
    if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose: https://docs.docker.com/compose/install/"
    fi
    if command -v docker compose &> /dev/null; then
        status "Docker Compose (plugin) detected"
        DOCKER_COMPOSE_CMD="docker compose"
    else
        status "Docker Compose $(docker-compose --version) detected"
        DOCKER_COMPOSE_CMD="docker-compose"
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running. Please start Docker."
    fi
    status "Docker daemon is running"
    
    # Verify Dockerfile exists
    echo ""
    echo -e "${YELLOW}[2/4] Verifying Project Files...${NC}"
    
    if [ ! -f "$API_DIR/Dockerfile" ]; then
        error "Dockerfile not found at $API_DIR/Dockerfile"
    fi
    status "Dockerfile found"
    
    if [ ! -f "$PROJECT_HOME/compose.yaml" ]; then
        error "compose.yaml not found at $PROJECT_HOME/compose.yaml"
    fi
    status "Docker Compose configuration found"
    
    # Check environment file
    echo ""
    echo -e "${YELLOW}[3/4] Environment Configuration...${NC}"
    
    if [ ! -f "$PROJECT_HOME/.env" ]; then
        warning ".env file not found at $PROJECT_HOME/.env"
        echo ""
        echo "To complete setup, you must create a .env file:"
        echo "  1. Copy the example:"
        echo "     cp $PROJECT_HOME/.env.example $PROJECT_HOME/.env"
        echo ""
        echo "  2. Edit the .env file with your actual credentials:"
        echo "     nano $PROJECT_HOME/.env"
        echo ""
        echo "  Required variables:"
        echo "    - DB_PASSWORD"
        echo "    - MYSQL_ROOT_PASSWORD"
        echo "    - ANTHROPIC_API_KEY (optional)"
        echo "    - GEMINI_API_KEY (optional)"
        echo "    - GOOGLE_PLACES_API_KEY (optional)"
        echo ""
    else
        status ".env file exists"
    fi
    
    # Build and start containers
    echo ""
    echo -e "${YELLOW}[4/4] Building and Starting Containers...${NC}"
    
    cd "$PROJECT_HOME"
    
    echo "Building Docker images..."
    $DOCKER_COMPOSE_CMD build || error "Failed to build Docker images"
    status "Docker images built successfully"
    
    echo ""
    echo "Starting containers..."
    $DOCKER_COMPOSE_CMD up -d || error "Failed to start containers"
    status "Containers started"
    
    # Wait for services to be healthy
    echo ""
    echo "Waiting for services to become healthy..."
    sleep 10
    
    # Check container status
    if $DOCKER_COMPOSE_CMD ps | grep -q "unhealthy"; then
        warning "Some containers are unhealthy. Check logs with: $DOCKER_COMPOSE_CMD logs"
    else
        status "All containers are running"
    fi
    
    # ========================================================================
    # DOCKER DEPLOYMENT SUMMARY
    # ========================================================================
    echo ""
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}Docker Deployment Complete!${NC}"
    echo -e "${GREEN}======================================${NC}"
    echo ""
    echo "Services:"
    echo "  • API:   http://localhost:3001"
    echo "  • MySQL: localhost:3306"
    echo ""
    echo "Common Commands:"
    echo "  View logs:        $DOCKER_COMPOSE_CMD logs -f"
    echo "  Stop services:    $DOCKER_COMPOSE_CMD down"
    echo "  Restart services: $DOCKER_COMPOSE_CMD restart"
    echo "  Rebuild images:   $DOCKER_COMPOSE_CMD build"
    echo ""
    echo "Next Steps:"
    if [ ! -f "$PROJECT_HOME/.env" ]; then
        echo "  1. Create .env file: cp .env.example .env"
        echo "  2. Edit .env with your credentials"
        echo "  3. Restart containers: $DOCKER_COMPOSE_CMD restart"
    else
        echo "  1. Verify API is running:"
        echo "     curl http://localhost:3001/health"
        echo ""
        echo "  2. Access the GUI:"
        echo "     Open gui/index.html in your browser"
        echo ""
        echo "  3. Import sample data or start using the API"
    fi
    echo ""
    
    exit 0
fi

# ============================================================================
# CPANEL DEPLOYMENT PATH (Original implementation)
# ============================================================================
echo -e "${YELLOW}[cPanel Deployment Mode]${NC}"
echo ""

# ============================================================================
# 1. VERIFY PREREQUISITES
# ============================================================================
echo ""
echo -e "${YELLOW}[1/6] Verifying Prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Please install Node.js v18+ from cPanel > Software > Manage Node.js"
fi
status "Node.js $(node --version) detected"

if ! command -v npm &> /dev/null; then
    error "npm is not installed"
fi
status "npm $(npm --version) detected"

if ! command -v git &> /dev/null; then
    warning "git is not installed. You may need to use cPanel File Manager to upload files."
fi

# ============================================================================
# 2. CREATE DIRECTORY STRUCTURE
# ============================================================================
echo ""
echo -e "${YELLOW}[2/6] Creating Directory Structure...${NC}"

mkdir -p "$LOG_DIR"
mkdir -p "$PROJECT_HOME/logs/pm2"
status "Created directories in $PROJECT_HOME"

# ============================================================================
# 3. INSTALL DEPENDENCIES
# ============================================================================
echo ""
echo -e "${YELLOW}[3/6] Installing Dependencies...${NC}"

cd "$API_DIR"

# Install runtime dependencies
echo "Installing npm packages (omitting dev dependencies)..."
npm install --omit=dev || error "Failed to install npm packages"
status "npm packages installed"

# Install TypeScript and build tools
echo "Installing build tools..."
npm install -D typescript @types/node @types/express @types/multer || error "Failed to install dev dependencies"
status "Build tools installed"

# ============================================================================
# 4. BUILD APPLICATION
# ============================================================================
echo ""
echo -e "${YELLOW}[4/6] Building TypeScript...${NC}"

npm run build || error "Failed to build TypeScript"
status "TypeScript compiled to dist/"

# Verify build
if [ ! -f "$API_DIR/dist/index.js" ]; then
    error "Build output not found at dist/index.js"
fi
status "Build verification passed"

# ============================================================================
# 5. SETUP PM2
# ============================================================================
echo ""
echo -e "${YELLOW}[5/6] Configuring PM2 Process Manager...${NC}"

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 globally..."
    npm install -g pm2 || error "Failed to install PM2"
    pm2 completion install --yes 2>/dev/null || true
    status "PM2 installed globally"
else
    status "PM2 already installed: $(pm2 --version)"
fi

# Copy ecosystem config
cp "$DEPLOY_DIR/ecosystem.config.js" "$PROJECT_HOME/"
status "Ecosystem config copied"

# Stop existing PM2 process if running
if pm2 list | grep -q "rise-api"; then
    echo "Stopping existing rise-api process..."
    pm2 stop rise-api || true
    pm2 delete rise-api || true
fi

# Start with PM2
cd "$PROJECT_HOME"
echo "Starting application with PM2..."
pm2 start ecosystem.config.js --env production || error "Failed to start PM2"
status "Application started with PM2"

# Enable PM2 autostart
echo "Configuring PM2 autostart on server reboot..."
pm2 startup 2>/dev/null || true
pm2 save || true
status "PM2 autostart configured"

# ============================================================================
# 6. ENVIRONMENT & DATABASE
# ============================================================================
echo ""
echo -e "${YELLOW}[6/6] Final Setup Steps...${NC}"

# Check for existing .env
if [ ! -f "$API_DIR/.env" ]; then
    warning ".env file not found at $API_DIR/.env"
    echo ""
    echo "To complete setup, you must:"
    echo "  1. Copy the .env template:"
    echo "     cp $DEPLOY_DIR/.env.production $API_DIR/.env"
    echo ""
    echo "  2. Edit the .env file with your actual credentials:"
    echo "     nano $API_DIR/.env"
    echo ""
    echo "  3. Then restart the application:"
    echo "     pm2 restart rise-api"
else
    status ".env file already exists"
fi

# Check database
echo ""
echo "Verifying database connection..."
if mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal -e "SELECT 1" &>/dev/null; then
    status "Database connection successful"
else
    warning "Could not connect to database. Please verify credentials:"
    echo "    Host: localhost"
    echo "    User: apex2600_riselocal"
    echo "    Database: apex2600_riselocal"
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "Next Steps:"
echo "  1. Setup environment variables:"
echo "     cp deploy/.env.production rise-local-lead-creation/api/.env"
echo "     nano rise-local-lead-creation/api/.env"
echo ""
echo "  2. Restart the application:"
echo "     pm2 restart rise-api"
echo ""
echo "  3. Check application status:"
echo "     pm2 status"
echo "     pm2 logs rise-api"
echo ""
echo "  4. Configure web server reverse proxy:"
echo "     - Apache: See deploy/DEPLOY_CPANEL.md for .htaccess"
echo "     - Nginx: See deploy/DEPLOY_CPANEL.md for server config"
echo ""
echo "  5. Verify API is running:"
echo "     curl http://localhost:3001/"
echo ""
echo "Documentation: $DEPLOY_DIR/DEPLOY_CPANEL.md"
echo ""
