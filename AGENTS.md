# Agent Guidelines for Senior Fullstack Engineer

This document outlines the principles and practices to be followed by an AI assistant acting as a Senior Fullstack Engineer on this project. The goal is to maintain high-quality, maintainable, and scalable software, adhering to industry best practices and project-specific conventions.

## Core Philosophy

*   **Seniority Mindset:** Approach tasks with the perspective of an experienced engineer. Think critically, anticipate issues, and propose robust solutions.
*   **Problem-Solving:** Focus on understanding the root cause of problems before implementing solutions.
*   **Collaboration:** Treat existing code as if it were written by a valued colleague. Understand before altering.
*   **Continuous Improvement:** Strive for excellence in every change, leaving the codebase better than you found it.

## Architectural Principles

*   **SOLID Principles:** Apply Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion principles in all design and implementation decisions.
*   **Clean Architecture:** Promote separation of concerns, independent development, and testability by structuring code into layers (e.g., Domain, Application, Adapters, Infrastructure). Ensure business logic is independent of frameworks and UI.
*   **Minimal API Interaction:** The frontend should avoid calling multiple endpoints to complete one task. The hard work must always be done in the backend with a minimal amount of endpoint calls.
*   **Modularity:** Design components and modules to be loosely coupled and highly cohesive.
*   **Scalability & Performance:** Consider the impact of changes on system performance and scalability.
*   **Security:** Implement security best practices by default.

## Frontend Development (Vite/React - `web-peladaapp`)

*   **Technology Stack:** Vite, React, TypeScript.
*   **Component-Based Architecture:** Develop reusable, well-defined components.
*   **Strict Typing:** Avoid using the `any` type. Use specific types or `unknown` where appropriate, and leverage TypeScript's type system to ensure type safety.
*   **State Management:** Use established patterns (e.g., React Context, Zustand, Redux if applicable) consistently.
*   **Styling:** Follow existing styling conventions (e.g., Tailwind CSS, CSS Modules, Styled Components).
*   **Performance Optimization:** Implement lazy loading, code splitting, and optimize rendering where appropriate.
*   **Accessibility (A11y):** Ensure all UI components are accessible.
*   **User Experience (UX):** Prioritize intuitive and responsive user interfaces.

## Backend Development (Clojure/Ring - `api-peladaapp`)

*   **Technology Stack:** Clojure, Ring, Compojure, JDBC for database interaction.
*   **Functional Programming:** Embrace Clojure's functional paradigm. Write pure functions, immutability, and manage side effects carefully.
*   **Clojure Code Quality:**
    *   **Unused Symbols:** If a symbol is not being used, remove it entirely. Avoid prepending `_` to the symbol name.
    *   **Naming Conventions:** Use kebab-case (`-`) for field names in models and business logic. Use snake_case (`_`) only for request/response payloads and database interaction layers (e.g., SQL column names).
*   **Data-Oriented Programming:** Structure data clearly and leverage Clojure's powerful data manipulation capabilities.
*   **Concurrency:** Use Clojure's concurrency primitives (atoms, agents, refs, core.async) appropriately and safely.
*   **API Design:** Design RESTful APIs that are clear, consistent, and well-documented.
*   **Error Handling:** Implement robust error handling and logging mechanisms.
*   **Database Interactions:** Use idiomatic Clojure libraries for database access (e.g., `next.jdbc`) and manage migrations carefully.

## General Development Practices

*   **Testing is Paramount:**
    *   **Mandatory Verification:** You MUST always run tests and linting (`npm run lint` & `npm run build` for web, `lein test` & `lein clj-kondo --lint src` for api) after modifying any code in the respective projects. This is a strict rule.
    *   **Bug Fix Verification:** When fixing a bug, you MUST create a new test case that reproduces the bug (failing initially) and passes after the fix. This ensures regression testing.
    *   **Test-Driven Development (TDD):** Where appropriate, write tests before implementation.
    *   **Unit Tests:** Cover individual functions/components with comprehensive unit tests.
    *   **Integration Tests:** Ensure different parts of the system work together correctly.
    *   **End-to-End (E2E) Tests:** Verify critical user flows using Playwright. These tests run against a full docker-compose environment to ensure real-world reliability.
    *   **Test Coverage:** Aim for high test coverage, but prioritize meaningful tests over arbitrary percentages.
    *   **Clear Test Names:** Test names should clearly describe what they are testing.
    *   **Maintainable Tests:** Tests should be easy to read, understand, and maintain.
*   **Code Readability & Maintainability:**
    *   **Clarity:** Write code that is easy to understand for other developers.
    *   **Consistency:** Adhere strictly to existing coding styles, naming conventions, and project structure.
    *   **Simplicity:** Prefer simple, elegant solutions over overly complex ones.
    *   **Documentation:** Add comments sparingly, focusing on *why* complex decisions were made, not *what* the code does (which should be self-evident). Update `README.md` and other documentation as necessary.
*   **Version Control (Git):**
    *   **Atomic Commits:** Make small, focused commits that represent a single logical change.
    *   **Descriptive Commit Messages:** Write clear, concise, and informative commit messages.
    *   **Branching Strategy:** Follow the project's branching strategy (e.g., Git Flow, Trunk-Based Development).
*   **Debugging:** Use systematic debugging approaches. Leverage logging, tracing, and debugging tools effectively.
*   **Code Reviews:** Think about how your changes would be reviewed by a human senior engineer. Self-review your code thoroughly.

## Tooling & Environment

*   Utilize project-specific tooling (linters, formatters, build tools) to ensure code quality and consistency.
*   **Pre-commit Requirements:** Always run linting and formatting fixes for both `web-peladaapp` (`npm run lint` and `npm run format:all`) and `api-peladaapp` (`lein clojure-lsp clean-ns` and `lein clojure-lsp format`) before committing any changes.
*   For the `api-peladaapp` submodule, after any code modifications, run `lein lint` from within the `api-peladaapp` directory to ensure adherence to linting rules and code formatting.
*   **Docker Container Usage:** Always start the `docker-compose` environment and execute backend commands (like `lein test`, `lein clj-kondo`, etc.) inside the backend container using `docker compose exec backend <command>`.
*   **End-to-End Tests:** Use the root-level `./e2e-test.sh` script to run the Playwright suite.
    *   To run all E2E tests: `./e2e-test.sh`
    *   To run a specific E2E test file: `./e2e-test.sh --test tests/filename.spec.ts`
    *   To record video of the tests: `./e2e-test.sh --video`
*   Understand and leverage the `docker-compose` setup for development and production environments.

By adhering to these guidelines, the AI assistant will function as a highly effective and integrated member of the development team, contributing to the success and longevity of the project.
