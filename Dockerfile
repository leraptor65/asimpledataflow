# Stage 1: Build the Go Backend
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app/backend
# Install git and gcc for building go-git bindings if necessary
RUN apk add --no-cache git build-base

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o simple-data-flow ./main.go

# Stage 2: Build the Next.js Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm install -g npm@latest && npm install

COPY frontend/ ./
# We need to build the standalone Next.js server
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Unified Production Runtime Container
FROM alpine:3.19 AS runner
WORKDIR /app

# Install Node.js, git (for the backend), gh CLI (for auth), and libc for Go/CGO
RUN apk add --no-cache nodejs git libc6-compat github-cli

# Create data directory for notes
RUN mkdir -p /app/data
ENV DATA_DIR="/app/data"

# Copy the Backend Binary
COPY --from=backend-builder /app/backend/simple-data-flow /app/backend-server

# Copy the Next.js standalone frontend
COPY --from=frontend-builder /app/frontend/.next/standalone ./
COPY --from=frontend-builder /app/frontend/.next/static ./.next/static
# COPY --from=frontend-builder /app/frontend/public ./public

# Setup the orchestrator script
COPY VERSION /app/VERSION
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose ONLY the Next.js frontend port (3000) externally
EXPOSE 3000

# Start both services
CMD ["/app/start.sh"]
