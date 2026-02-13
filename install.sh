#!/bin/bash

# iOS Compliance Scanner - Installation Script
# Built by Unc Lumen 💎

set -e

echo "🚀 Installing iOS Compliance Scanner..."
echo ""

# Check if greenlight is installed
if ! command -v greenlight &> /dev/null; then
    echo "📦 Installing Greenlight CLI..."
    
    # Try Homebrew first
    if command -v brew &> /dev/null; then
        brew install revylai/tap/greenlight
    else
        echo "❌ Homebrew not found. Please install greenlight manually:"
        echo "   https://github.com/RevylAI/greenlight"
        exit 1
    fi
else
    echo "✅ Greenlight CLI already installed"
fi

# Check Node.js version
echo ""
echo "🔍 Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Current: v$NODE_VERSION"
    exit 1
fi
echo "✅ Node.js $(node -v) found"

# Install API dependencies
echo ""
echo "📦 Installing API dependencies..."
cd "$(dirname "$0")"
npm install

# Create uploads directory
mkdir -p uploads

echo ""
echo "✅ Installation complete!"
echo ""
echo "🎯 Quick Start:"
echo "   npm start           # Start API server"
echo "   npm run dev         # Start with auto-reload"
echo ""
echo "📋 API Endpoints:"
echo "   http://localhost:3456/health"
echo "   http://localhost:3456/api/guidelines"
echo "   http://localhost:3456/api/scan/upload"
echo "   http://localhost:3456/api/scan/url"
echo ""
echo "📖 Documentation:"
echo "   cat README.md"
echo "   cat ../DEPLOYMENT_GUIDE.md"
echo ""
echo "🚀 Ready to scan iOS apps!"
