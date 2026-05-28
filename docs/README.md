# ⚽ PeladaApp Monorepo: Documentation Portal & Knowledge Map

Welcome to the central knowledge base and home page for **PeladaApp**—a full-stack, modular platform designed to automate the organization of casual soccer matches ("peladas"). 

This document serves as the project's landing page, providing an exhaustive, high-fidelity reference of the domain concepts, technical architecture, database schemas, strict security constraints, and developer workflows. It is optimized to bring both developers and agentic AI assistants up to speed instantly.

---

## 🗺️ Documentation Directory

| Guide | Target Audience | Key Contents |
| :--- | :--- | :--- |
| **[⚽ User Features Guide](user-features.md)** | Product Managers, Admins, Users | Onboarding, RSVP waitlists, Bucket-shuffle team generation, Iterated Local Search (ILS) match scheduling, live match tracking, and peer voting. |
| **[🏛️ Technical Architecture](technical-architecture.md)** | Developers, Tech Leads | Clojure Clean Architecture layers, React feature-based directory structure, PostgreSQL ERD, mathematical models, and authentication sequences. |
| **[🛠️ Development & Testing Guide](development-testing.md)** | Developers, QA Engineers | Setup commands: Docker running, database seeding, linters, formatting, and unit/integration/Playwright E2E test suites. |
| **[🚢 Kubernetes Deployment Guide](kubernetes-deployment.md)** | DevOps, SysAdmins | VPS setup via K3s, Ansible deployment scripts, Cloudflare Tunnels (firewall-free ingress), and automated image updates using Keel. |

---

## 🧭 Monorepo Structure & Status

PeladaApp is organized as a monorepo containing three core packages:
1.  **`api-peladaapp` (Clojure REST API)**: Manages authentication, membership, RSVPs, team randomization, match scheduling, real-time logging, and post-match normalized scoring.
2.  **`web-peladaapp` (React SPA)**: Single-page application built on React 19, TypeScript, Vite, and Material-UI (MUI). Facilitates on-field administrative controls and player dashboard actions.
3.  **`e2e-tests` (Playwright)**: End-to-end regression test suite validating the entire proxy stack under real-world scenarios.

### 💾 Storage & Environment State
*   **Database**: Migrated to **PostgreSQL** (replacing legacy SQLite databases).
*   **Migrations**: Managed at runtime using `Migratus` in `api-peladaapp/resources/migrations-postgres`.
*   **Arch compatibility**: Standardized on multi-arch bases (Alpine-PostgreSQL) to support deployments on both standard x86 VPS and ARM architectures.

---

## 🧠 Core System Design & Business Rules

Here is a quick-reference guide to the system's core behaviors and mathematical logic:

### 1. Attendance & Sorting Rules
*   **RSVP Capacity**: When a pelada is scheduled, the RSVP window opens. 
    *   *Mensalistas* (monthly subscribers) are automatically confirmed.
    *   *Diaristas* (pay-per-play) and *Convidados* (guests) are confirmed up to the configured roster limit. If the capacity is exceeded, they are automatically placed on a **Waitlist**.
*   **Attendance & Waitlist Sorting**: Roster and waitlists **MUST** be sorted primarily by member type priority (**Mensalista > Diarista > Convidado**) and then by their update time (**FIFO** - First In, First Out). If update time is missing, it falls back to alphabetical sorting by name.
*   **Tactical Displays & Chat Alerts**: Displays for printing or chat notifications are also sorted by football position (**Goalkeeper > Defender > Midfielder > Striker**) and then alphabetically by name.

### 2. Team Generation (Bucket Shuffle)
*   **Grouping & Bucketing**: Gathers all confirmed players (excluding designated Fixed Goalkeepers). Groups them by position, sorts them by technical rating, and splits them into position-based buckets equal to the number of teams.
*   **Shuffling & Greedy Balancing**: Shuffles each bucket individually and distributes players sequentially to ensure skill variety. Evaluates cumulative team ratings and performs micro-swaps inside matching positions to minimize standard deviation.
*   **Fixed Goalkeepers**: Administrators can designate specific players as permanent goalkeepers (Home/Away). The system pins them to their respective teams and excludes them from the main randomization pool.

### 3. Match Scheduling (ILS)
*   Uses an **Iterated Local Search (ILS)** optimization algorithm. Starts with a standard round-robin schedule and perturbs rounds/matchups to find the sequence that minimizes back-to-back matches for any team and limits consecutive standby rounds.

### 4. Normalized Post-Match Voting
*   Players rate peers on a 1-5 scale. Raw votes are adjusted using Z-Score calculations comparing the votes against the session mean and standard deviation.
*   The normalized score maps onto a **1.0 to 10.0 scale**, updating player profile cards (radar graphs) and adjusting their rating weight for future team randomizations.

### 5. WAHA WhatsApp Notifications
*   The backend connects to a local/remote **WhatsApp HTTP API (WAHA)** container to push automated messages to the organization's WhatsApp group:
    *   *Convocação (RSVP invitation)*: Lists current confirmations.
    *   *Roster & Lineups*: Sent after randomization, grouped by teams and sorted by position.
    *   *Final standings & stats summary*: Sent when the pelada status transitions to `closed`.

---

## 🔐 Strict Technical Constraints (Rules of Engagement)

When writing code or performing refactoring on PeladaApp, you **MUST** adhere to these architectural rules:

### 🔑 Cookie-Only Authentication
> [!IMPORTANT]
> Authentication is strictly session-based and uses a signed JWT token stored in the `authToken` cookie.
> *   **Never** send or expect authorization tokens in the `Authorization: Bearer <token>` HTTP header.
> *   The client depends on the browser transmitting the `authToken` cookie automatically with every API call.
> *   Local storage (`localStorage`) is used for caching user metadata (`authUser`) and local logs, but **never** for authorization tokens.

### 🧱 Clean Architecture Namespace Isolation
> [!TIP]
> Maintain strict separation of concerns within the `api-peladaapp` codebase:
> *   **`logic/` namespace**: **Pure Functional Core**. Contains math, shuffling, scheduling, and normalization logic. Must contain zero side-effects, database transactions, HTTP requests, or external library mocks.
> *   **`db/` namespace**: Data interaction layer. All HoneySQL query definitions and connection interactions must reside here. Higher layers (controllers) invoke functions from this namespace to fetch/persist data.

### 🧪 Test-Driven Development (TDD) and Bug Regression
> [!IMPORTANT]
> When fixing a bug, you **MUST** write a reproduction test case (either unit or integration) that fails before the fix and passes once the code is corrected.
> *   **Never delete reproduction tests**. They must be integrated into the test suite as permanent safeguards against regression.

---

## ⚡ Quick Start Command Sheet

Keep these commands at hand when validating changes locally:

```bash
# 1. Start the local development environment (Proxy at http://localhost:8080)
docker compose up --build

# 2. Run backend Clojure tests (executes inside the Docker backend container)
docker compose exec backend lein test

# 3. Format and lint Clojure namespaces
docker compose exec backend lein lint-fix

# 4. Run frontend unit tests
cd web-peladaapp && npm test

# 5. Compile and lint frontend (run this before every commit to catch build regressions)
cd web-peladaapp && npm run lint && npm run build

# 6. Execute full Playwright E2E suites
cd e2e-tests && npm run test:e2e
```

---

## 🤖 AI Assistant & Agent Guidelines

If you are an AI agent working on PeladaApp, follow these operational guidelines:
*   **Analyze Submodules Separately**: Remember that `api-peladaapp` and `web-peladaapp` are separate git submodules. If you modify files inside them, do not commit or push to remote repos without explicit developer authorization.
*   **Follow Clean Clojure Standards**: Remove unused symbols entirely rather than prepending `_`. Use kebab-case for models and business logic, and snake_case only for request/response payloads and database columns.
*   **Do Not Use Mock Mappings for Cookies**: In Playwright E2E tests, do not manually append auth headers. Use the `request` object from hooks or `page.request` to perform API calls; these inherit the session context cookies automatically.
*   **Aesthetics Priority**: When modifying the frontend UI, prioritize premium aesthetics. Avoid default browser elements, leverage Material-UI components with customized themes, and implement subtle hover states and micro-animations.
