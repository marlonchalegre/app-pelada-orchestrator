# End-to-End Tests

This directory contains the Playwright test suite for the Pelada App. These tests verify critical user flows by running against a fully containerized environment (Backend + Frontend + Nginx).

## Running Tests

The recommended way to run tests is via the `e2e-test.sh` script in the project root, which handles:
1.  Backing up your local database (SQLite and PostgreSQL).
2.  Spinning up the Docker environment (`docker-compose.yml`).
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
    *   `utils.ts`: Shared helpers (`registerUser`, `createOrganization`, `createPeladaFromAgenda`, `closeAttendanceList`, `drawAndStartPelada`, `endCurrentMatch`, `closePelada`, `scoreGoalWithoutAssist`, `acceptPendingInvitation`, `visible`, `saveVideo`).
    *   `auth.spec.ts`: Registration, profile update, logout/login, account deletion, home stats.
    *   `org_lifecycle.spec.ts`: Organization creation, desktop group tabs, default location settings, invitations (personal & public link).
    *   `leave_organization.spec.ts`: User leaving an organization.
    *   `pelada_management.spec.ts`: Creating a pelada from the desktop agenda (with location), attendance counts, draw & start flow.
    *   `match_day.spec.ts`: Goal sheet scoring, match end confirmation, support lineup tab, share summary dropdown, closing the pelada.
    *   `edit_match.spec.ts`: Editing a finished match through the history drawer and score re-recording.
    *   `post_match.spec.ts`: Closing the pelada and casting votes.
    *   `vote_retention.spec.ts`: Vote retention and voter isolation.
    *   `share_summary.spec.ts`: Share summary behind the export dropdown.
    *   `admin_and_edge_cases.spec.ts`: Attendance decline counts, admin promotion, invitation revocation.
    *   `fixed_goalkeepers.spec.ts`: Fixed goalkeepers toggle (mobile draw panel) and starting the match.
    *   `copy_utilities.spec.ts`: Copy public link / invitation link buttons.
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
