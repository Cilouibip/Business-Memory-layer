#!/bin/bash
echo "🔄 Restarting BML dev server..."

# Kill only the process on port 3000
PORT_PID=$(lsof -ti:3000 2>/dev/null)
if [ -n "$PORT_PID" ]; then
  echo "Killing process on port 3000 (PID: $PORT_PID)"
  kill -9 $PORT_PID 2>/dev/null
  sleep 1
fi

# Clean Next.js lock
rm -f .next/dev/lock

# Restart
echo "Starting dev server on localhost:3000..."
npm run dev -- -p 3000 --hostname localhost
