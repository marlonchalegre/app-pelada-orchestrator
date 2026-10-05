# End-to-End Tests

This directory contains the Playwright test suite for the Pelada App. These tests verify critical user flows by running against a fully containerized environment (Backend + Frontend + Nginx).

## Running Tests

The recommended way to run tests is via the `test:e2e` script, which handles:
1.  Backing up your local database.
2.  Spinning up the Docker environment.
3.  Running all tests.
4.  Cleaning up and restoring your database.

### Usage

```bash
# Run all E2E tests (handles environment setup and cleanup automatically)
npm run test:e2e

# Run a specific test file (requires environment to be already up)
npm run test -- tests/filename.spec.ts
```

If you need to manually manage the environment:

```bash
# Start the environment
npm run env:up

# Run tests
npm run test

# Tear down the environment
npm run env:down
```

## Directory Structure
