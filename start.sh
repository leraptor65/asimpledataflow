#!/bin/sh

# Start backend server in the background
echo "Starting ASDF Go Backend on port 8080..."
./backend-server &
BACKEND_PID=$!

# Start Next.js frontend server in the foreground
echo "Starting ASDF Next.js Frontend on port 3000..."
node server.js &
FRONTEND_PID=$!

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
