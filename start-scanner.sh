#!/bin/bash
# Start iOS Compliance Scanner on Mac Studio
# Ensures greenlight path is correctly set

cd "$(dirname "$0")"

# Set greenlight path (built locally)
export GREENLIGHT_PATH="/Users/jimmysmacstudio/clawd-main/greenlight/build/greenlight"

# Verify greenlight exists
if [ ! -f "$GREENLIGHT_PATH" ]; then
    echo "❌ ERROR: Greenlight binary not found at $GREENLIGHT_PATH"
    echo "Building greenlight..."
    cd /Users/jimmysmacstudio/clawd-main/greenlight
    make build
    cd -
fi

# Kill old instance if running
pkill -f "node server.js"
sleep 2

# Start scanner
echo "🚀 Starting iOS Compliance Scanner..."
nohup node server.js > scanner.log 2>&1 &
PID=$!

echo "✅ Scanner started (PID: $PID)"
echo "   Port: 3456"
echo "   Logs: $(pwd)/scanner.log"
echo "   Greenlight: $GREENLIGHT_PATH"

# Wait for startup
sleep 3

# Check health
echo ""
echo "Health check:"
curl -s http://localhost:3456/health | jq '.'
