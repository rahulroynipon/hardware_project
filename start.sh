#!/bin/bash

# ==============================================================================
# DIGITAL ELECTION SYSTEM - FULL-STACK RUNNER WITH ARDUINO AUTO-SYNC
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "=========================================================="
echo "  🗳️  DIGITAL VOTING SYSTEM & ARDUINO HARDWARE BRIDGE"
echo "=========================================================="
echo ""

# 1. Clean up any existing processes on ports 5050, 5173, 5174 to avoid EADDRINUSE
echo "  🧹 Checking & freeing network ports (5050, 5173)..."
lsof -ti:5050 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true
sleep 1

# 2. Check for Connected Arduino Hardware
ARDUINO_PORT=$(ls /dev/cu.usbmodem* 2>/dev/null | head -n 1)

if [ -n "$ARDUINO_PORT" ]; then
  echo "  ✅ Arduino Uno Detected at: $ARDUINO_PORT"
  export ARDUINO_PORT="$ARDUINO_PORT"
else
  echo "  ⚠️  No Arduino detected on USB. Retrying automatically in background..."
  export ARDUINO_PORT="/dev/cu.usbmodem11201"
fi

# 3. Check PostgreSQL Connection
if pg_isready -h localhost -p 5432 -q 2>/dev/null; then
  echo "  ✅ PostgreSQL Database connected on localhost:5432"
else
  echo "  ℹ️  PostgreSQL check skipped or service starting..."
fi

echo ""
echo "  🚀 Starting Express Server (Port 5050)..."
echo "  🌐 Starting React Frontend (Port 5173)..."
echo "  🔄 Live Telemetry & Arduino Push-Button Sync Ready"
echo "=========================================================="
echo ""

# 4. Launch Server and Client Concurrently
npx concurrently \
  -k \
  -n "SERVER,CLIENT" \
  -c "blue.bold,green.bold" \
  "npm --prefix server run dev" \
  "npm --prefix client run dev"
