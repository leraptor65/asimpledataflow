#!/bin/sh

# Trap termination signals and forward to children
cleanup() {
    echo "Stopping ASDF services..."
    kill -TERM "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" 2>/dev/null
    wait "$FRONTEND_PID" 2>/dev/null
    exit 0
}

trap cleanup INT TERM

# Start backend server in the background
echo "Starting ASDF Go Backend on port ${BACKEND_PORT:-8080}..."
PORT="${BACKEND_PORT:-8080}" ./backend-server &
BACKEND_PID=$!

# Start Next.js frontend server in the background
echo "Starting ASDF Next.js Frontend on port 3000..."
node server.js &
FRONTEND_PID=$!

# Wait for either process to exit
wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE=$?

# If one died, stop the other
echo "A service process exited with code $EXIT_CODE. Stopping remaining processes..."
kill -TERM "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
wait
exit $EXIT_CODE
