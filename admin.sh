#!/bin/sh

# Configuration
CONTAINER_NAME="${CONTAINER_NAME:-omsu_setka_backend}"
ENV_FILE=".env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect if running inside Docker
INSIDE_DOCKER=0
if [ -f /.dockerenv ]; then
    INSIDE_DOCKER=1
fi

# Load ADMIN_KEY
if [ "$INSIDE_DOCKER" -eq 1 ]; then
    # Inside container, use environment variables directly
    ADMIN_KEY="$ADMIN_KEY"
else
    # Outside container, try to find .env file
    if [ -f "$ENV_FILE" ]; then
        ADMIN_KEY=$(grep '^ADMIN_KEY=' "$ENV_FILE" | cut -d '=' -f2 | tr -d '\r' | tr -d '"' | tr -d "'")
    fi
fi

if [ -z "$ADMIN_KEY" ]; then
    echo -e "${YELLOW}Warning: ADMIN_KEY not found. Actions requiring auth may fail.${NC}"
fi

# Outside Docker: support both the current production container name and the
# legacy one used by older compose projects.
if [ "$INSIDE_DOCKER" -eq 0 ] && ! docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    if docker container inspect omsu_mirror_backend >/dev/null 2>&1; then
        CONTAINER_NAME="omsu_mirror_backend"
    fi
fi

# Helper: Curl
admin_curl() {
    local method=$1
    local path=$2
    
    if [ "$INSIDE_DOCKER" -eq 1 ]; then
        # Inside: talk to localhost
        curl -s -o - -X "$method" \
            -H "X-Admin-Key: $ADMIN_KEY" \
            "http://localhost:8080$path"
    else
        # Outside: use docker exec
        docker exec "$CONTAINER_NAME" curl -s -o - -X "$method" \
            -H "X-Admin-Key: $ADMIN_KEY" \
            "http://localhost:8080$path"
    fi
}

# Sub-commands
case "$1" in
    status)
        echo -e "${BLUE}=== Health Status ===${NC}"
        admin_curl GET /api/v1/health | sed 's/\\n/\n/g'
        echo -e "\n${BLUE}=== Sync Status ===${NC}"
        admin_curl GET /api/v1/sync/status | sed 's/\\n/\n/g'
        ;;
    sync)
        echo -e "${YELLOW}Triggering manual synchronization...${NC}"
        admin_curl POST /api/v1/sync/trigger | sed 's/\\n/\n/g'
        echo -e "\n${GREEN}Check logs to monitor progress.${NC}"
        ;;
    incidents)
        echo -e "${BLUE}=== Recent Upstream Incidents ===${NC}"
        admin_curl GET /api/v1/incidents | sed 's/\\n/\n/g'
        ;;
    logs)
        if [ "$INSIDE_DOCKER" -eq 1 ]; then
            echo -e "${RED}Error: 'logs' command cannot be run from inside the container.${NC}"
            echo "Please run: docker logs $HOSTNAME"
            exit 1
        fi
        docker logs -f "$CONTAINER_NAME"
        ;;
    restart)
        if [ "$INSIDE_DOCKER" -eq 1 ]; then
            echo -e "${RED}Error: 'restart' command cannot be run from inside the container.${NC}"
            exit 1
        fi
        echo -e "${YELLOW}Restarting all services...${NC}"
        project=$(docker container inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$CONTAINER_NAME" 2>/dev/null || true)
        if [ -f docker-compose.deploy.yml ] && [ "$project" = "setka" ]; then
            docker compose -f docker-compose.deploy.yml -p setka restart
        else
            docker compose restart
        fi
        ;;
    help|*)
        echo -e "${GREEN}omsu_setka Admin CLI${NC}"
        echo "Usage: admin {status|sync|incidents|logs|restart}"
        echo
        echo "Commands:"
        echo "  status    - Check health and synchronization status"
        echo "  sync      - Manual trigger for background synchronization"
        echo "  incidents - Show history of original server issues"
        echo "  logs      - View real-time logs (outside only)"
        echo "  restart   - Restart all project services (outside only)"
        ;;
esac
