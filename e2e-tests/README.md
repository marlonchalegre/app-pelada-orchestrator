# End-to-End Tests

This directory contains the Playwright test suite for the Pelada App. These tests verify critical user flows by running against a fully containerized environment (Backend + Frontend + Nginx).

## Running Tests

The recommended way to run tests is via the `e2e-test.sh` script in the project root, which handles:
1.  Backing up your local database.
2.  Spinning up the Docker environment (`docker-compose.dev.yml`).
3.  Running the tests.
4.  Cleaning up and restoring your database.

### Usage

```bash
# Run all tests
./e2e-test.sh

# Run a specific test file
./e2e-test.sh --test tests/leave_organization.spec.ts

# Record video of the test run (saved to e2e-tests/test-results/videos/)
./e2e-test.sh --video
```

## Directory Structure

*   `tests/`: Contains the spec files.
    *   `auth.spec.ts`: Login, registration, profile updates.
    *   `org_lifecycle.spec.ts`: Organization creation, invitations (personal & public link).
    *   `leave_organization.spec.ts`: User leaving an organization.
    *   `pelada_management.spec.ts`: Creating and managing games.
    *   `match_day.spec.ts`: Match events, scoring.
    *   `post_match.spec.ts`: Voting and closing games.
*   `playwright.config.ts`: Main Playwright configuration.
*   `test-results/`: Output directory for videos and artifacts (gitignored).

## Manual Execution (Advanced)

If you already have the stack running (`docker compose up`) and want to run tests locally for rapid iteration:

```bash
cd e2e-tests
npx playwright test
# Or specific file
npx playwright test tests/auth.spec.ts
```

*Note: Running against a persistent dev database might cause test flakiness if data isn't cleaned up.*
