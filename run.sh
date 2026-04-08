#!/bin/bash
set -e

# Colored output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Building omsu_mirror Project...${NC}"

# 1. Build Frontend
echo -e "${BLUE}Building Frontend...${NC}"
cd web
npm install --legacy-peer-deps
npm run build
cd ..

# 2. Build Backend
echo -e "${BLUE}Building Backend...${NC}"
cd core
GOTOOLCHAIN=local go mod download
GOTOOLCHAIN=local go build -o ../omsu_mirror ./cmd/server/main.go
cd ..

echo -e "${GREEN}Build Complete!${NC}"
echo -e "${BLUE}Starting Server...${NC}"

# 3. Run Server
./omsu_mirror
