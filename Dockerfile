# Stage 1: Build the React frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
# Copy package.json and install dependencies
COPY frontend/package*.json ./
RUN npm install
# Copy the rest of the frontend code and build
COPY frontend .
RUN npm run build

# Stage 2: Build the Go backend
FROM golang:1.20-alpine AS backend-builder
WORKDIR /app/backend
# Copy go.mod and go.sum and download dependencies
COPY backend/go.mod backend/go.sum ./
RUN go mod download
# Copy the rest of the backend code and build
COPY backend .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Stage 3: Create the final production image
FROM alpine:latest
WORKDIR /app

# Copy the build artifacts from the previous stages
COPY --from=backend-builder /app/backend/main ./
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Expose the application port
EXPOSE 8000

# Set the default data directory
ENV DATA_DIR=/app/data

# The command to run the application
CMD ["./main"]
