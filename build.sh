#!/bin/bash
# Build script for Render deployment
# Installs greenlight CLI and Node dependencies

set -e

echo "📦 Installing Node.js dependencies..."
npm install

echo "🔧 Installing Greenlight CLI via Go..."

# Install Go if not present (Render should have it)
if ! command -v go &> /dev/null; then
    echo "Go not found. Installing Go 1.22..."
    curl -L https://go.dev/dl/go1.22.0.linux-amd64.tar.gz -o go.tar.gz
    tar -C /tmp -xzf go.tar.gz
    export PATH="/tmp/go/bin:$PATH"
    export GOPATH="/tmp/go-workspace"
    rm go.tar.gz
fi

# Create bin directory
mkdir -p bin

# Install greenlight from source
echo "Installing greenlight from source..."
GOBIN="$(pwd)/bin" go install github.com/RevylAI/greenlight/cmd/greenlight@latest

# Make executable
chmod +x bin/greenlight || true

echo "✅ Build complete!"
if [ -f bin/greenlight ]; then
    echo "Greenlight installed at: bin/greenlight"
    ./bin/greenlight --version || echo "Greenlight ready (version check skipped)"
else
    echo "⚠️ Greenlight installation failed - scans will be limited"
fi
