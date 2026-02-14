#!/bin/bash
# Build script for Render deployment
# Installs greenlight CLI and Node dependencies

set -e

echo "📦 Installing Node.js dependencies..."
npm install

echo "🔧 Installing Greenlight CLI..."

# Check if Go is available
if ! command -v go &> /dev/null; then
    echo "❌ ERROR: Go is not available"
    echo "Render should have Go pre-installed. If not, check environment settings."
    exit 1
fi

echo "Go version: $(go version)"

# Create bin directory
mkdir -p bin

# Set Go environment variables
export GOBIN="$(pwd)/bin"
export CGO_ENABLED=0

# Install greenlight from source
echo "Installing greenlight from github.com/RevylAI/greenlight..."
go install github.com/RevylAI/greenlight/cmd/greenlight@latest

# Verify installation
if [ ! -f bin/greenlight ]; then
    echo "❌ ERROR: Greenlight installation failed!"
    echo "Expected binary at: $(pwd)/bin/greenlight"
    ls -la bin/ || echo "bin/ directory doesn't exist"
    exit 1
fi

# Make executable (should already be)
chmod +x bin/greenlight

# Test greenlight
echo "Testing greenlight installation..."
if ./bin/greenlight --version 2>&1 | grep -i greenlight; then
    echo "✅ Greenlight installed successfully!"
else
    echo "Testing greenlight --help instead..."
    ./bin/greenlight --help | head -5 || echo "Greenlight binary exists but version/help failed (might be OK)"
fi

echo "✅ Build complete!"
echo "Greenlight binary: $(pwd)/bin/greenlight"
ls -lh bin/greenlight
