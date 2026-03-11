# Contributing to PeladaApp

Thank you for your interest in contributing to PeladaApp! This document outlines the standards and workflows we use to maintain a high-quality codebase.

## 🚀 Getting Started

1.  **Clone the repository** (with submodules):
    ```bash
    git clone --recurse-submodules git@github.com:marlonchalegre/app-pelada-orchestrator.git
    ```
2.  **Start the development environment**:
    ```bash
    docker compose -f docker-compose.dev.yml up --build
    ```

## 🛠️ Development Workflow

We follow a strict **Research -> Strategy -> Execution** lifecycle for all changes.

### 1. Research & Strategy
Before writing code, ensure you understand the existing architecture and conventions. For complex features, we recommend drafting a small design plan.

### 2. Execution
- **Surgical Changes**: Keep your changes focused on the task at hand. Avoid unrelated refactoring.
- **Idiomatic Code**: Adhere to Clojure (backend) and TypeScript/React (frontend) best practices.
- **Type Safety**: Avoid using `any` in TypeScript. Leverage the type system.
- **Functional Paradigm**: In the backend, prioritize pure functions and immutable data.

### 3. Testing & Validation (Mandatory)
You **MUST** run tests and linting before submitting any changes.

#### Backend (Clojure)
Run commands inside the backend container:
```bash
docker compose exec backend lein test
docker compose exec backend lein clj-kondo --lint src
```

#### Frontend (React)
```bash
cd web-peladaapp
npm run lint
npm run build
npm test
```

#### End-to-End (E2E)
```bash
cd e2e-tests
npm run test:e2e
```

## 📝 Commit Guidelines

- **Atomic Commits**: Each commit should represent a single logical change.
- **Descriptive Messages**: Use clear and concise commit messages.
- **No Staging of Submodules**: Be careful not to accidentally commit submodule pointer changes unless intended.

## 🏛️ Architectural Principles

- **SOLID**: Apply SOLID principles in all design decisions.
- **Clean Architecture**: Maintain clear separation between domain logic and infrastructure.
- **Data-Oriented**: Leverage Clojure's power for data manipulation.
- **Minimal API Interaction**: The frontend should avoid calling multiple endpoints for a single task; the backend should handle complex orchestrations.

## 🎨 Style & Conventions

- **Naming**: 
  - Backend: `kebab-case` for logic, `snake_case` for API/DB payloads.
  - Frontend: `PascalCase` for components, `camelCase` for functions/variables.
- **Formatting**: Use the provided Prettier (frontend) and `lein clojure-lsp format` (backend) configurations.

## ⚖️ License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
