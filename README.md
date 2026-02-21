Pelada App Monorepo
===================

The Pelada App monorepo bundles the backend Clojure API and the React front-end that powers the product. Both applications live here as Git submodules so that each can evolve independently while still sharing common infrastructure (Docker, Nginx, deployment pipelines, etc.).

Technology Stack
---------------

- **Backend:** Clojure, Ring/Compojure, next.jdbc, SQLite, Buddy Auth (JWT), Stuart Sierra Component.
- **Frontend:** React 19, TypeScript, Vite, Material-UI (MUI), Vitest.
- **Infrastructure:** Docker, Docker Compose, Nginx.

Repository Layout
-----------------

- `api-peladaapp`: Clojure backend service (Leiningen project).
- `web-peladaapp`: React + Vite front-end.
- `docker-compose*.yml`: Docker Compose definitions for development and production-like workflows.
- `nginx/`: Reverse proxy configuration used by the Compose stacks.
- `seed_anime_users.sh`: Script to seed the database with test users.

Prerequisites
-------------

- Docker Engine 24.x or newer with the Compose plugin (`docker compose`).
- Git 2.34+ with SSH access to the submodule repositories.
- Optional: `direnv` or another env loader if you manage environment variables outside Compose.

Cloning the Repository
----------------------

Clone with submodules in a single step:

```bash
git clone --recurse-submodules git@github.com:marlonchalegre/app-pelada-orchestrator.git
```

If you already cloned the project without `--recurse-submodules`, initialize them afterwards:

```bash
git submodule update --init --recursive
```

Docker Workflows
----------------

### Local development stack

Runs the React front-end with hot reload (using specific volume mounts for better performance), the Clojure API with code reloading, and Nginx for unified access.

```bash
docker compose -f docker-compose.dev.yml up --build
```

Services exposed:

- **Unified Web UI (Nginx):** `http://localhost:8080`
- **Front-end dev server:** `http://localhost:8080` (Proxied)
- **Backend API:** `http://localhost:8000` (Direct) or `http://localhost:8080/api` (Proxied)

Restart or rebuild individual services as needed:

```bash
docker compose -f docker-compose.dev.yml up --build frontend
docker compose -f docker-compose.dev.yml restart backend
```

### Production build preview

Builds production images for both services and serves the pre-built front-end via Nginx.

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up
```

This stack builds and tags production images as `peladaapp-frontend:prod` and `peladaapp-backend:prod`. The Nginx container exposes the bundled site at `http://localhost`.

Testing
-------

### End-to-End (E2E) Tests

We use Playwright for end-to-end testing. The `e2e-test.sh` script orchestrates the environment setup (using Docker), runs the tests, and handles cleanup.

```bash
# Run all E2E tests
./e2e-test.sh

# Run a specific test file
./e2e-test.sh --test tests/leave_organization.spec.ts

# Record video of the test run
./e2e-test.sh --video
```

See `e2e-tests/README.md` for more details.

Development Tips
----------------

- **Database:** The backend uses an embedded SQLite database (`peladaapp.db`). In development, this file is persisted via Docker volumes if you mount the `api-peladaapp` directory.
- **Seeding:** Use `./seed_anime_users.sh` to populate the database with test data once the backend is running.
- **Submodules:** Remember that `api-peladaapp` and `web-peladaapp` are separate git repositories. Commits made inside them must be pushed to their respective remotes.

License
-------

This project is released under the MIT License. See [`LICENSE`](LICENSE) for details.
