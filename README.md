Pelada App Monorepo
===================

The Pelada App monorepo bundles the backend Clojure API and the React front-end that powers the product. Both applications live here as Git submodules so that each can evolve independently while still sharing common infrastructure (Docker, Nginx, deployment pipelines, etc.).

Repository Layout
-----------------

- `api-peladaapp`: Clojure backend service (Leiningen project).
- `web-peladaapp`: React + Vite front-end.
- `docker-compose*.yml`: Docker Compose definitions for development and production-like workflows.
- `nginx/`: Reverse proxy configuration used by the Compose stacks.

Prerequisites
-------------

- Docker Engine 24.x or newer with the Compose plugin (`docker compose`).
- Git 2.34+ with SSH access to the submodule repositories.
- Optional: `direnv` or another env loader if you manage environment variables outside Compose.

Cloning the Repository
----------------------

Clone with submodules in a single step:

```bash
git clone --recurse-submodules git@github.com:marlonchalegre/app-100folego.git
```

If you already cloned the project without `--recurse-submodules`, initialize them afterwards:

```bash
git submodule update --init --recursive
```

Keeping Submodules in Sync
--------------------------

- Pull latest changes in every submodule:

  ```bash
  git submodule update --remote --merge
  ```

- Rebase/merge each submodule against its default branch:

  ```bash
  git submodule foreach 'git checkout main && git pull --ff-only'
  ```

- Inspect submodule state at any time:

  ```bash
  git submodule status
  ```

Working on Submodules
---------------------

1. Enter the submodule directory (`api-peladaapp` or `web-peladaapp`).
2. Create feature branches, edit files, and commit as usual.
3. Push your branch from inside the submodule:

   ```bash
   git push origin <branch-name>
   ```

4. Return to the monorepo root and commit the updated submodule pointer:

   ```bash
   cd ..
   git add <submodule-path>
   git commit -m "chore(submodule): bump <name>"
   ```

Docker Workflows
----------------

### Local development stack

Runs the React front-end with hot reload, the Clojure API with code reloading, and Nginx for unified access.

```bash
docker compose -f docker-compose.dev.yml up --build
```

Services exposed:

- Front-end dev server: `http://localhost:8080`
- Backend API: `http://localhost:8000`

Restart or rebuild individual services as needed:

```bash
docker compose -f docker-compose.dev.yml up --build frontend
docker compose -f docker-compose.dev.yml restart backend
```

### Default stack

The root `docker-compose.yml` mirrors the development stack but with fewer environment overrides. Use it when you want a minimal local run without the additional dev-only configuration.

```bash
docker compose up --build
```

Once the services are healthy, access the unified web interface via Nginx at `http://localhost:8080`.

### Production build preview

Builds production images for both services and serves the pre-built front-end via Nginx.

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up
```

This stack builds and tags production images as `peladaapp-frontend:prod` and `peladaapp-backend:prod`. The Nginx container exposes the bundled site at `http://localhost`.

Environment Variables
---------------------

- Front-end: `VITE_BACKEND_URL` (defaults to the internal Compose hostname `http://backend:8000` in dev).
- Backend: configure via environment variables or configuration files inside `api-peladaapp/resources`.
- Add private overrides in a `.env` file at the repository root; Compose automatically loads it.

Cleaning Up
-----------

- Stop all services:

  ```bash
  docker compose down
  ```

- Remove volumes and images created by the dev stack:

  ```bash
  docker compose -f docker-compose.dev.yml down --volumes --rmi local
  ```

License
-------

This project is released under the MIT License. See [`LICENSE`](LICENSE) for details.
