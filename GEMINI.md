# Project Overview: omsu_setka

`omsu_setka` is a high-performance **BFF (Backend-for-Frontend)** designed to mirror and cache the Omsu University schedule. It prioritizes minimal resource usage (RAM < 50MB, CPU ~0%), sub-millisecond response times for cached data, and background synchronization to reduce load on the original server.

## Architecture

The project follows a tiered architecture:
-   **Frontend:** React (TypeScript, Vite) with PWA support and Vanilla CSS styling (Glassmorphism).
-   **Backend:** Go (Fiber v2) providing a REST API.
-   **Storage:** 3-level caching system:
    1.  **L1 (Memory):** `sync.Map` + pre-rendered JSON blobs for instant delivery.
    2.  **L2 (Persistent):** SQLite (WAL mode, pure Go) for durability across restarts.
    3.  **L3 (Upstream):** The original Omsu API, accessed via background sync.
-   **Search:** In-memory prefix tree (Trie) for extremely fast autocomplete of groups, tutors, and auditories.

## Building and Running

### Prerequisites
-   Go 1.22+
-   Node.js 24+ & npm
-   Docker & Docker Compose (optional)

### One-Step Build & Run
```bash
./run.sh
```
This script builds the frontend, compiles the Go backend, and starts the server.

### Manual Development
-   **Backend (Go):**
    ```bash
    cd core
    go run ./cmd/server/main.go
    ```
-   **Frontend (React):**
    ```bash
    cd web
    npm install
    npm run dev
    ```
-   **Docker:**
    ```bash
    docker-compose up --build
    ```

### Testing
-   Automated unit tests are implemented for the backend (Search Trie, Parsers).
-   Manual verification is used for the frontend.
-   Run tests using `go test ./...` in the `core` directory.

## UI & UX Features (Recent Updates)
-   **Desktop Optimization:** Content width is limited to 1100px for better readability.
-   **Activity Type Coloring:** Session types have distinct colors for their labels (Indigo for Lectures, Red for Practice, Green for Labs).
-   **Smart Day Switching:** Automatically switches to "Tomorrow" after 18:00 or to "Monday" on Sundays.
-   **Schedule Change Tracking:** Detects added, removed, or modified lessons by comparing history.
-   **Push Notifications:** Integration with Firebase Cloud Messaging (FCM) for real-time alerts.
-   **Search Consistency:** Both Home and Tutors pages feature a centered search bar (600px max-width) and share a unified "Recent" search history limited to 5 items.

## Development Conventions

### Backend (Go)
-   **Zero-Allocation:** Prefer pre-rendered JSON blobs (`[]byte`) stored in memory to avoid repeated serialization.
-   **Schedule Diff Engine:** Tracks history in `schedule_changes` table and logs incidents.
-   **FCM Integration:** Supports token-based subscriptions for groups and tutors.
-   **GZIP Caching:** Store and serve gzipped content directly when supported by the client.

### Frontend (React)
-   **Firebase PWA:** Uses Service Worker (`firebase-messaging-sw.js`) for background notifications.
-   **Secure Build:** Secrets are injected into the Service Worker during Docker build via `sed` to prevent leaks in Git.
-   **Styling:** Use **Vanilla CSS** with variables for themes. Avoid utility-first CSS frameworks like Tailwind.
-   **Logging:** Use `zerolog` for structured, high-performance logging.
-   **Configuration:** All configuration is managed via Environment Variables (see `.env.example`).

### Frontend (React)
-   **Styling:** Use **Vanilla CSS** with variables for themes. Avoid utility-first CSS frameworks like Tailwind.
-   **State Management:** `Zustand` for simple, lightweight state (e.g., Favorites).
-   **Data Fetching:** `@tanstack/react-query` for efficient API interaction and caching.
-   **Icons:** `Lucide-React` for UI icons.
-   **UI Patterns:** Modern Glassmorphism aesthetic with `framer-motion` for interactions.

## Key Files
-   `dev/SPEC.md`: Detailed technical specification and architecture.
-   `dev/TASKS.md`: Current implementation status and checklist.
-   `dev/BACKEND_PLAN.md`: Backend development plan and roadmap.
-   `dev/FRONTEND_PLAN.md`: Frontend development plan and roadmap.
-   `dev/API_DATA.md`: Documentation for the upstream API.
-   `core/`: Backend source code.
-   `web/`: Frontend source code.
-   `docker-compose.dev.yml` & `docker-compose.prod.yml`: Orchestration for backend and frontend.
