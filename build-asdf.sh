#!/bin/bash

# Clear the terminal before running.
clear

# This script stops and rebuilds the 'asimpledataflow' project using Docker Compose,
# and performs a thorough cleanup to save disk space.

# --- Step 1: Stop and remove the project's containers, networks, and volumes ---
echo "--- Stopping and removing old containers, networks, and volumes... ---"
# The --volumes flag removes the data volume mapped to ./data
# The --remove-orphans flag removes any orphaned containers
docker compose -f docker-compose.dev.yml down --volumes --remove-orphans

# --- Step 2: Clean up dangling Docker resources and build cache ---
echo "--- Pruning Docker system to remove dangling images, containers, and build cache... ---"
# The -a flag removes all unused images, not just dangling ones.
# The -f flag forces the removal without confirmation.
docker system prune -af

# --- Step 3: Build the project from a completely clean state ---
echo "--- Building fresh images without using cache... ---"
# --no-cache: ensures that Docker does not use any cache layers from previous builds
docker compose -f docker-compose.dev.yml build --no-cache

# --- Step 4: Start the new containers in detached mode ---
echo "--- Starting the new containers... ---"
# -d: runs the containers in detached (background) mode
docker compose -f docker-compose.dev.yml up -d

echo "--- Build complete. Access the app at http://localhost:3000 ---"

