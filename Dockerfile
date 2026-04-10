# Stage 1: Build
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Copy go.mod and go.sum from core folder
COPY core/go.mod core/go.sum ./
RUN go mod download

# Copy backend source from core folder
COPY core/ ./

# Build the application
RUN go test ./...
RUN CGO_ENABLED=0 GOOS=linux go build -o omsu_mirror ./cmd/server/main.go

# Stage 2: Final image
FROM alpine:3.19

WORKDIR /app

# Install curl for healthchecks and admin CLI
RUN apk add --no-cache curl

# 19.4 Create non-root user
RUN adduser -D -g '' appuser

# Copy the binary from builder
COPY --from=builder /app/omsu_mirror .

# Copy admin script and make it a global command
COPY admin.sh /usr/local/bin/admin
RUN chmod +x /usr/local/bin/admin && sed -i 's/\r$//' /usr/local/bin/admin

# Ensure appuser owns the app directory (especially important for SQLite data folder)
RUN mkdir -p /app/data && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

EXPOSE 8080

ENTRYPOINT ["/app/omsu_mirror"]
