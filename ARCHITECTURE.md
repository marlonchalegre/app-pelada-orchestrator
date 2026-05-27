# System Architecture: PeladaApp

This document provides a high-level overview of the PeladaApp architecture, its components, and design decisions.

## 🏗️ Overview

PeladaApp is a full-stack application for organizing and managing casual soccer matches ("peladas"). It consists of three primary components:
1.  **Backend (api-peladaapp)**: A Clojure-based REST API.
2.  **Frontend (web-peladaapp)**: A React-based web interface.
3.  **E2E Tests (e2e-tests)**: A Playwright-based testing suite.

All components are containerized using Docker and orchestrated via Docker Compose.

## 🧱 Backend Architecture (Clojure)

The backend follows a layered approach inspired by **Clean Architecture** and **SOLID** principles.

### Core Stack
- **Runtime**: JVM 23 (Temurin).
- **Framework**: Ring (middleware stack) and Compojure (routing).
- **Database**: PostgreSQL for persistence.
- **Authentication**: Cookie-based authentication using Buddy.

### Layered Structure
- **Components**: Manage the application lifecycle (Stuart Sierra Component).
- **Routes & Handlers**: Define HTTP endpoints and map them to logical operations.
- **Controllers**: Orchestrate business logic by calling logic functions and data access layers.
- **Logic**: Pure functional core where all business calculations happen (e.g., team balancing, scheduling).
- **DB (Persistence)**: Idiomatic data access using `next.jdbc` and `HoneySQL`.
- **Adapters**: Data transformations between database records, internal models, and API payloads.
- **Schemas**: Strict data validation using Prismatic Schema.

### 🧠 Key Algorithms

- **Team Randomization (Bucket Shuffle)**:
  To ensure both variety and technical balance, the system uses a **Bucket Shuffle** approach:
  1.  **Grouping**: Players are grouped by position (Goalkeeper, Defender, etc.) and sorted by their technical grade.
  2.  **Bucketing**: For each position, players are divided into "buckets" of size equal to the number of teams.
  3.  **Shuffling**: Each bucket is shuffled individually, ensuring that players of similar skill level are randomized against each other.
  4.  **Greedy Assignment**: Players are then assigned to teams using a greedy algorithm that prioritizes filling empty position slots first and then balancing the total team score.

- **Match Scheduling (ILS)**:
  Scheduling uses an **Iterated Local Search (ILS)** algorithm to generate optimized match sequences that minimize player wait times and ensure fair distribution of games.

## ⚛️ Frontend Architecture (React)

The frontend is built with a **feature-based architecture** to ensure scalability and maintainability.

### Core Stack
- **Framework**: React 19.
- **Language**: TypeScript.
- **UI Library**: Material-UI (MUI) 7.
- **Build Tool**: Vite 7.
- **State Management**: Context API and React hooks.

### Project Structure
- **app/**: Global providers (Auth, Theme, i18n) and routing configuration.
- **features/**: Self-contained modules (Auth, Organizations, Peladas, User, etc.) containing their own components, hooks, and logic.
- **shared/**: Reusable UI components, generic hooks, and API client utilities.
- **lib/**: Configuration for external libraries (MUI theme, i18n setup).

### 📊 Player Characteristics & Radar Graph

To help organization administrators visualize and manage player skills, the system supports a 6-axis **Radar Graph** representing player abilities:
- **Passing** (`passing`): Accuracy and vision for passes.
- **Ball Control** (`ball_control`): First touch and control.
- **Carrying** (`carrying`): Running with the ball and pace.
- **Shooting** (`shooting`): Finishing and shot power.
- **Dribbling** (`dribbling`): Tricks, agility, and 1v1 capability.
- **Defending** (`defending`): Positioning, tackling, and marking.

**Implementation Details**:
- **Database**: Stored in `"OrganizationPlayers"` table as integers from `0` to `5` with CHECK constraints.
- **Backend Validation**: Pure Clojure validator enforces the range `[0, 5]` at the API controller layer.
- **Frontend Visualization**: Rendered using a lightweight, responsive custom SVG component (without heavy charting libraries) inside `PlayerRadarDialog.tsx`.
- **Administrative Controls**: Sliders update the graph in real-time, sending updates to the standard player update API endpoint.

## 🐋 Infrastructure & Deployment

### Development Environment
The development environment is fully containerized using `docker-compose.yml`. It includes:
- **Frontend Container**: Runs the Vite dev server with Hot Module Replacement (HMR).
- **Backend Container**: Runs the Clojure API with code reloading.
- **Nginx Container**: Acts as a reverse proxy to provide a unified entry point at `http://localhost:8080`.

### Production Environment
The application supports two primary deployment strategies:
1. **Docker Compose**: A standard, lightweight deployment using `docker-compose.ghcr.yml` that pulls pre-built multi-architecture images from the GitHub Container Registry.
2. **Kubernetes (K3s)**: A robust, production-grade deployment managed via **Ansible** and **K3s**. It uses K8s manifests for deployments, Persistent Volumes (PVC) for storage, a Host-Native Postgres instance for performance, and **Cloudflare Tunnels** (`cloudflared`) to expose the application securely without opening inbound VPS firewall ports.

### Database
- **PostgreSQL**: The primary database is a PostgreSQL instance, running as a containerized service in development or as a host-native service in Kubernetes production.
- **Migrations**: Database schema is managed via Migratus (SQL-based migrations) with HoneySQL for dynamic queries.

## 🧪 Testing Strategy

We employ a comprehensive testing strategy across all layers:
1.  **Unit Tests**: Individual functions and components.
2.  **Integration Tests**: API endpoints and cross-component interactions in the backend.
3.  **End-to-End (E2E) Tests**: Full user flows using Playwright against a complete containerized stack.

## 🔄 Data Flows

1.  **Authentication**: Users authenticate and receive a JWT stored in an `authToken` cookie. This cookie is automatically sent by the browser for all protected API calls.
2.  **State Management**: Each feature manages its own data fetching and local state. Global state (like the current user) is handled via React Context.
3.  **API interaction**: Frontend makes RESTful calls to the backend. The backend handles complex operations (like team balancing) and returns formatted JSON responses.

---
*This document is maintained as a reference for developers. For detailed implementation details, refer to the code and individual README files.*
