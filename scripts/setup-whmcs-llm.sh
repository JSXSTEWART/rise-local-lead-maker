#!/bin/bash
# WHMCS LLM Provisioning System - Quick Setup Script

set -e

echo "==========================================="
echo "WHMCS LLM Provisioning System - Setup"
echo "==========================================="
echo ""

# Check if running with proper permissions
if [[ $EUID -eq 0 ]]; then
   echo "WARNING: Running as root. This is fine for server setup."
   echo "Press Enter to continue or Ctrl+C to cancel..."
   read
fi

# Detect environment
if [[ -f /.dockerenv ]]; then
    ENV="docker"
    echo "Environment: Docker container"
elif command -v cagebreak &> /dev/null || [[ -d /usr/local/cpanel ]]; then
    ENV="cpanel"
    echo "Environment: cPanel server"
else
    ENV="standalone"
    echo "Environment: Standalone server"
fi
echo ""

# Check prerequisites
echo "Checking prerequisites..."
MISSING=""

if ! command -v docker &> /dev/null; then
    MISSING="$MISSING docker"
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    MISSING="$MISSING docker-compose"
fi

if [[ ! -z "$MISSING" ]]; then
    echo "ERROR: Missing required packages:$MISSING"
    echo "Please install Docker and Docker Compose first."
    exit 1
fi

echo "✓ Docker found: $(docker --version)"
if docker compose version &> /dev/null 2>&1; then
    echo "✓ Docker Compose found: $(docker compose version)"
else
    echo "✓ Docker Compose found: $(docker-compose --version)"
fi
echo ""

# Check for GPU
if command -v nvidia-smi &> /dev/null; then
    echo "✓ NVIDIA GPU detected"
    GPU_AVAILABLE=true
else
    echo "⚠ No NVIDIA GPU detected (CPU-only mode)"
    GPU_AVAILABLE=false
fi
echo ""

# Create directories
echo "Creating directory structure..."
mkdir -p docker/compose
mkdir -p docker/prometheus/rules
mkdir -p docker/traefik/dynamic
mkdir -p whmcs-module/modules/servers/llmcontainer/{lib,templates}
mkdir -p kubernetes/{helm,network-policies,monitoring}
echo "✓ Directories created"
echo ""

# Check for .env file
if [[ ! -f .env ]]; then
    echo "Creating .env file from example..."
    if [[ -f .env.example ]]; then
        cp .env.example .env
        echo "✓ .env file created"
        echo "⚠ Please edit .env file with your configuration"
    else
        echo "⚠ .env.example not found, skipping"
    fi
else
    echo "✓ .env file exists"
fi
echo ""

# Deploy infrastructure
echo "Would you like to deploy the infrastructure now? (y/n)"
read -r DEPLOY

if [[ "$DEPLOY" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Deploying infrastructure..."
    
    # Create Docker network
    echo "Creating Docker network..."
    docker network create llm-network || echo "Network already exists"
    
    # Deploy Traefik (if selected)
    echo ""
    echo "Deploy Traefik API Gateway? (y/n)"
    read -r DEPLOY_TRAEFIK
    
    if [[ "$DEPLOY_TRAEFIK" =~ ^[Yy]$ ]]; then
        if [[ -f docker/compose/traefik.yml ]]; then
            echo "Starting Traefik..."
            cd docker/compose
            docker compose -f traefik.yml up -d
            cd ../..
            echo "✓ Traefik deployed"
        else
            echo "⚠ traefik.yml not found"
        fi
    fi
    
    # Deploy monitoring (if GPU available)
    if [[ "$GPU_AVAILABLE" = true ]]; then
        echo ""
        echo "Deploy monitoring stack (Prometheus + Grafana)? (y/n)"
        read -r DEPLOY_MONITORING
        
        if [[ "$DEPLOY_MONITORING" =~ ^[Yy]$ ]]; then
            if [[ -f docker/compose/monitoring-stack.yml ]]; then
                echo "Starting monitoring stack..."
                cd docker/compose
                docker compose -f monitoring-stack.yml up -d
                cd ../..
                echo "✓ Monitoring stack deployed"
                echo ""
                echo "Access Grafana at: http://localhost:3000 (admin/admin)"
                echo "Access Prometheus at: http://localhost:9090"
            else
                echo "⚠ monitoring-stack.yml not found"
            fi
        fi
    fi
fi

echo ""
echo "==========================================="
echo "Setup Complete!"
echo "==========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Edit .env file with your configuration"
echo "2. Install Portainer (if not already installed):"
echo "   docker volume create portainer_data"
echo "   docker run -d -p 9443:9443 --name portainer --restart=always \\"
echo "     -v /var/run/docker.sock:/var/run/docker.sock \\"
echo "     -v portainer_data:/data \\"
echo "     portainer/portainer-ce:latest"
echo ""
echo "3. Copy WHMCS module:"
echo "   cp -r whmcs-module/modules/servers/llmcontainer /var/www/whmcs/modules/servers/"
echo ""
echo "4. Configure WHMCS:"
echo "   - Setup → Servers → Add New Server"
echo "   - Type: LLM Container Provisioning"
echo ""
echo "5. See README_WHMCS.md for complete documentation"
echo ""
