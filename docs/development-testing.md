# 🛠️ PeladaApp: Development & Testing Guide

This guide describes how to configure your local development environment, run database seeds, format code, and execute unit, integration, and E2E tests.

---

## 💻 Prerequisites

To run the application locally, ensure you have the following installed:
*   **Docker Engine 24.x+** and **Docker Compose**.
*   **Node.js v18+** (for running E2E and frontend tests locally).
*   **Git 2.34+**.

---

## 🚀 Setting Up Local Development

The entire stack runs containerized via Docker Compose. This mounts local source files into the container to enable hot-reloading.

### 1. Start the Stack
Spin up all services in the foreground:
```bash
docker compose up --build
```

### 2. Available Services & Port Mappings
*   **Unified Application Portal (Nginx Reverse Proxy)**: [http://localhost:8080](http://localhost:8080)
    *   Requests to `/api/*` are proxied to the backend.
    *   Requests to `/waha/*` are proxied to the WAHA Whatsapp container.
    *   All other routes serve the frontend.
*   **Frontend Dev Server (Vite)**: [http://localhost:5173](http://localhost:5173) (Direct access)
*   **Backend REST API (Clojure)**: [http://localhost:8000](http://localhost:8000) (Direct access)
*   **PostgreSQL Database**: `localhost:5432`
    *   User: `pelada`
    *   Password: `pelada_pass`
    *   Database: `peladaapp`

---

## 🗄️ Database Seeding

To populate the local PostgreSQL instance with mock data:
1.  Connect to your local Postgres database.
2.  Execute the seed scripts located inside the backend repository (`api-peladaapp/scripts/`):
    *   `api-peladaapp/scripts/create_anime_users.sql`: Creates anime-themed users and players.
    *   `api-peladaapp/scripts/create_scifi_users.sql`: Creates science-fiction-themed players.

Example command using `psql` or Docker exec:
```bash
docker compose exec -T postgres psql -U pelada -d peladaapp < api-peladaapp/scripts/create_anime_users.sql
```

---

## 🎨 Code Style, Linting & Formatting

Maintaining a clean codebase is enforced via automated pre-commit checks:

### 1. Clojure (Backend)
Format and fix namespaces before committing:
```bash
# Run static code analysis
docker compose exec backend lein clj-kondo --lint src

# Apply automated formatting and namespace cleanup
docker compose exec backend lein lint-fix
```

### 2. TypeScript / React (Frontend)
Format and lint features:
```bash
cd web-peladaapp

# Run TypeScript linter
npm run lint

# Run prettier formatter on all files
npm run format:all

# Validate production build (ensures zero build/type warnings)
npm run build
```

---

## 🧪 Testing Strategy

PeladaApp employs a three-tiered testing structure: Unit, Integration, and End-to-End.

### ⚠️ Mandatory Verification Rule
> [!IMPORTANT]
> You **MUST** run all tests and linters after modifying any code in the codebase before committing.
> *   **Frontend**: `npm run lint`, `npm run format:all`, and `npm run build` inside `web-peladaapp`.
> *   **Backend**: `lein lint-fix` (or `lein test` & `lein clj-kondo --lint src`) inside `api-peladaapp`.
> *   **E2E Suite**: `npm run test:e2e` inside `e2e-tests`.

### 🐞 Bug Fix Verification (TDD Rule)
> [!IMPORTANT]
> When resolving a bug, you **MUST** create a new test case that reproduces the bug (which fails prior to your changes) and passes once the fix is applied.
> This test case must remain in the codebase permanently to protect against regressions.

---

### 1. End-to-End (E2E) Tests (Playwright)
E2E tests verify complete user interactions (registering, creating an organization, closing attendance, randomizing teams, and playing matches) against a live Docker stack.

Located under the `e2e-tests/` directory:
```bash
cd e2e-tests

# Run all E2E tests (automatically sets up test db, spins up containers, runs tests, and cleans up)
npm run test:e2e

# Run a specific test suite (requires the docker environment to be running already)
npm run test -- tests/auth.spec.ts
```

---

### 2. Backend Integration & Unit Tests (Clojure)
Backend tests execute against an ephemeral database schema (`e2e` schema) inside the Docker container.

```bash
# Execute the entire backend test suite
docker compose exec backend lein test
```
*   **Unit Tests** (`test/unit/`): Verify pure logic operations (scheduler permutations, score recalculations, and JSON/adapter transformations).
*   **Integration Tests** (`test/integration/`): Validate API controllers, Buddy authorization access controls, and database transactions by simulating HTTP requests.

---

### 3. Frontend Unit Tests (Vitest)
Unit tests in the frontend test page routing, state hooks, and component renders using Vitest and React Testing Library.

Located under the `web-peladaapp/` directory:
```bash
cd web-peladaapp

# Run frontend tests
npm test

# Run tests with a visual UI
npm run test:ui

# Generate test coverage report
npm run test:coverage
```
