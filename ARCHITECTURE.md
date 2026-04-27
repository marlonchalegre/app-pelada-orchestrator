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
- **Database**: SQLite for local persistence, with support for Turso (LibSQL).
- **Authentication**: JWT-based authentication using Buddy.

### Layered Structure
- **Components**: Manage the application lifecycle (Stuart Sierra Component).
- **Routes & Handlers**: Define HTTP endpoints and map them to logical operations.
- **Controllers**: Orchestrate business logic by calling logic functions and data access layers.
- **Logic**: Pure functional core where all business calculations happen (e.g., team balancing, scheduling).
- **DB (Persistence)**: Idiomatic data access using `next.jdbc`.
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

## 🐋 Infrastructure & Deployment

### Development Environment
The development environment is fully containerized using `docker-compose.dev.yml`. It includes:
- **Frontend Container**: Runs the Vite dev server with Hot Module Replacement (HMR).
- **Backend Container**: Runs the Clojure API with code reloading.
- **Nginx Container**: Acts as a reverse proxy to provide a unified entry point at `http://localhost:8080`.

### Database
- **SQLite**: The primary database is a local SQLite file (`peladaapp.db`), allowing for zero-configuration setup.
- **Migrations**: Database schema is managed via Migratus (SQL-based migrations).

## 🧪 Testing Strategy

We employ a comprehensive testing strategy across all layers:
1.  **Unit Tests**: Individual functions and components.
2.  **Integration Tests**: API endpoints and cross-component interactions in the backend.
3.  **End-to-End (E2E) Tests**: Full user flows using Playwright against a complete containerized stack.

## 🔄 Data Flows

1.  **Authentication**: Users authenticate via JWT. The token is stored in `localStorage` and sent in the `Authorization` header for all protected API calls.
2.  **State Management**: Each feature manages its own data fetching and local state. Global state (like the current user) is handled via React Context.
3.  **API interaction**: Frontend makes RESTful calls to the backend. The backend handles complex operations (like team balancing) and returns formatted JSON responses.

---
*This document is maintained as a reference for developers. For detailed implementation details, refer to the code and individual README files.*
