#!/bin/bash

# ==============================================================================
# ARDUINO UNO FIRMWARE COMPILER & UPLOADER
# Automatically detects port & handles serial bridge safely
# ==============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

SKETCH_DIR="$PROJECT_DIR/digital_voting_machine"
SKETCH_FILE="$SKETCH_DIR/digital_voting_machine.ino"

echo ""
echo "=========================================================="
echo "  ⚡ ARDUINO UNO FIRMWARE UPLOADER"
echo "=========================================================="
echo ""

# 1. Locate arduino-cli executable
ARDUINO_CLI=""
if [ -x "/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli" ]; then
  ARDUINO_CLI="/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli"
elif command -v arduino-cli &> /dev/null; then
  ARDUINO_CLI="$(command -v arduino-cli)"
else
  echo "❌ Error: arduino-cli not found. Please install Arduino IDE or arduino-cli."
  exit 1
fi

echo "  🔧 Using CLI: $ARDUINO_CLI"

# 2. Detect Arduino USB Port
ARDUINO_PORT=$(ls /dev/cu.usbmodem* 2>/dev/null | head -n 1 || true)

if [ -z "$ARDUINO_PORT" ]; then
  echo "❌ Error: No Arduino Uno detected on USB (/dev/cu.usbmodem*)."
  echo "   Please plug in the Arduino Uno and try again."
  exit 1
fi

echo "  🔌 Detected Arduino on port: $ARDUINO_PORT"

# 3. Check if local backend server is running (port 5050)
# If running, use the live API to gracefully release the serial port and upload
if curl -s --connect-timeout 1 http://localhost:5050/api/hardware/status > /dev/null 2>&1; then
  echo "  🌐 Local Express server is active on port 5050."
  echo "  🔄 Requesting server to release serial port and flash firmware..."
  echo ""
  
  RESPONSE=$(curl -s -X POST http://localhost:5050/api/hardware/flash)
  
  if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "  ✅ Firmware flashed and verified successfully via live bridge!"
    echo "  📡 Serial connection re-established with Arduino Uno."
    echo ""
    echo "=========================================================="
    echo "  🎉 Upload Complete! Machine is ready."
    echo "=========================================================="
    exit 0
  else
    echo "⚠️  Live API flash failed: $RESPONSE"
    echo "   Attempting direct upload fallback..."
  fi
fi

# 4. Direct Upload (when server is not running or fallback)
echo "  📦 Compiling and uploading directly..."
"$ARDUINO_CLI" compile --upload -p "$ARDUINO_PORT" --fqbn arduino:avr:uno "$SKETCH_DIR"

echo ""
echo "=========================================================="
echo "  ✅ Firmware uploaded successfully to $ARDUINO_PORT!"
echo "=========================================================="
echo ""
