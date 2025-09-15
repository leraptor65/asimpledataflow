#!/bin/bash

# This script stops and rebuilds the 'asimpledataflow' project using Docker Compose.

# --- Step 1: Stop and remove the project's containers and volumes ---
echo "--- Stopping and removing old containers, networks, and volumes... ---"
# The --volumes flag removes the data volume mapped to ./data
# The --remove-orphans flag removes any orphaned containers
docker compose -f docker-compose.dev.yml down --volumes --remove-orphans

# --- Step 2: Build the project from a clean state and run in detached mode ---
echo "--- Building and starting the new container... ---"
# --build: forces a rebuild of the images, ignoring the cache
# -d: runs the containers in detached (background) mode
docker compose -f docker-compose.dev.yml up --build -d

echo "--- Build complete. Access the app at http://localhost:3000 ---"