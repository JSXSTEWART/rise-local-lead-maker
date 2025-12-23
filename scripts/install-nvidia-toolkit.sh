#!/bin/bash
# NVIDIA Container Toolkit Installation Script
# For Ubuntu/Debian systems with NVIDIA GPUs

set -e

echo "====================================="
echo "NVIDIA Container Toolkit Installation"
echo "====================================="
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)" 
   exit 1
fi

# Check for NVIDIA GPU
if ! command -v nvidia-smi &> /dev/null; then
    echo "ERROR: nvidia-smi not found. Please install NVIDIA drivers first."
    exit 1
fi

echo "NVIDIA GPU detected:"
nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
echo ""

# Add NVIDIA package repository
echo "Adding NVIDIA Container Toolkit repository..."
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Update package list
echo "Updating package list..."
apt-get update

# Install NVIDIA Container Toolkit
echo "Installing NVIDIA Container Toolkit..."
apt-get install -y nvidia-container-toolkit

# Configure Docker runtime
echo "Configuring Docker runtime..."
nvidia-ctk runtime configure --runtime=docker

# Restart Docker
echo "Restarting Docker..."
systemctl restart docker

# Verify installation
echo ""
echo "====================================="
echo "Verifying Installation"
echo "====================================="
echo ""

if docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
    echo "✓ NVIDIA Container Toolkit installed successfully!"
    echo ""
    echo "GPU access from Docker containers is working."
    echo ""
    docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi
else
    echo "✗ Installation verification failed"
    echo "Please check Docker logs and NVIDIA driver status"
    exit 1
fi

echo ""
echo "====================================="
echo "Installation Complete"
echo "====================================="
echo ""
echo "You can now deploy GPU-enabled LLM containers."
echo "See docker/compose/vllm-stack.yml for example configurations."
