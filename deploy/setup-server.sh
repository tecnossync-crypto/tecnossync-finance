#!/usr/bin/env bash
# Prepara una instancia EC2 nueva (Ubuntu 24.04) para Cuadre. Ejecutar una sola vez:
#   curl -fsSL https://raw.githubusercontent.com/... | bash   o bien   bash deploy/setup-server.sh
set -euo pipefail

sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git unzip

# Docker + Compose
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# AWS CLI (para subir respaldos a S3)
if ! command -v aws >/dev/null; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscli.zip
  unzip -q /tmp/awscli.zip -d /tmp && sudo /tmp/aws/install && rm -rf /tmp/aws /tmp/awscli.zip
fi

# 2 GB de swap: el build del frontend en instancias pequeñas se queda sin memoria
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "Listo. Cierra la sesión SSH y vuelve a entrar para usar docker sin sudo."
