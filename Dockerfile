# Stage 1: Build
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy dependency files
COPY core/go.mod core/go.sum* ./core/
RUN cd core && go mod download

# Copy source code
COPY core/ ./core/

# Run tests
RUN cd core && go test ./...

# Build the application
RUN cd core && CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o ../omsu_mirror ./cmd/server

# Stage 2: Final image
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

# Import CA certificates for HTTPS requests to upstream
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the binary
COPY --from=builder /app/omsu_mirror /app/omsu_mirror

# Runtime configuration
EXPOSE 8080

ENTRYPOINT ["/app/omsu_mirror"]
