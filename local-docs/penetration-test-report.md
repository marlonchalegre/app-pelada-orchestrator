# Penetration Test Report: app-pelada-orchestrator

**Target:** `app-pelada-orchestrator` (API + Web)  
**Date:** April 24, 2026  
**Status:** Authorized White-Box Assessment  
**Analyst:** Senior Offensive Security Engineer

---

## Executive Summary

The security posture of the `app-pelada-orchestrator` project is currently **Poor**. While business logic for voting and finance implements basic authorization checks, several critical architectural flaws in authentication and integration layers expose the system to complete account takeover and sensitive data leakage.

### Top Risks
1.  **Unauthenticated Account Takeover:** Any invited user's account can be claimed by an attacker knowing only their email address.
2.  **Global API Key Leakage:** Organization admins can steal the global `WAHA_API_KEY` via SSRF.
3.  **PII Leakage:** All user details (emails, names) are exposed to any authenticated user.
4.  **Guest Invitation Bypass:** Any authenticated user can claim an invitation intended for a "guest".
5.  **Internal Endpoint Exposure:** Management and profiling endpoints bypass security middleware via exposed ports.

### Immediate Action Items
1.  **Fix Authentication:** Implement token verification in the `/auth/first-access` flow immediately.
2.  **Protect Secrets:** Restrict `waha_api_url` to a whitelist and prevent the forwarding of global keys to user-defined endpoints.
3.  **Enforce Authorization:** Apply membership filters to the `/api/users` and `/api/invitations` endpoints.

---

## Detailed Findings

### 1. [Critical] Broken Authentication: Unauthenticated Account Takeover
- **Severity:** Critical (9.8) - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **Category:** OWASP API2:2023 Broken Authentication
- **Location:** `/auth/first-access` endpoint in `api-peladaapp.handlers.auth/first-access-handler`
- **Description:** The "first access" flow allows invited users to set their initial password. However, the implementation only checks if the user exists and lacks a password. It does **not** verify a secret token, allowing anyone who knows an invited user's email to claim the account.
- **Reproduction:**
  ```bash
  curl -X POST http://localhost:8080/auth/first-access \
       -H "Content-Type: application/json" \
       -d '{"email": "invited_user@example.com", "password": "new-attacker-password", "username": "attacker"}'
  ```
- **Impact:** Complete takeover of newly invited accounts, including potential administrative accounts if the invitee was intended to be an admin.
- **Remediation:** Modify the `first-access` flow to require the `token` generated during invitation. Validate this token against the database before allowing password updates.

### 2. [High] SSRF and Global API Key Leakage via WAHA Configuration
- **Severity:** High (8.5) - `CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:N/A:N`
- **Category:** OWASP API7:2023 Server Side Request Forgery
- **Location:** `api-peladaapp.logic.waha/send-message`
- **Description:** The application allows Organization Admins to define a custom `waha_api_url`. When triggering a test message, the backend performs a POST request to this URL, including the global `WAHA_API_KEY` in the `X-Api-Key` header.
- **Impact:** Theft of global infrastructure secrets and internal network scanning (SSRF).
- **Remediation:** Remove the ability for users to define arbitrary API URLs, or use a proxy that strips sensitive headers before forwarding requests.

### 3. [High] Excessive Data Exposure (PII Leakage)
- **Severity:** High (7.5) - `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`
- **Category:** OWASP API3:2023 Broken Object Property Level Authorization
- **Location:** `GET /api/users` and `GET /api/users/search`
- **Description:** These endpoints return the full list of users in the system, including emails and positions, to any authenticated user. There is no tenant isolation or privilege check.
- **Impact:** Exposure of Personally Identifiable Information (PII) for the entire user base.
- **Remediation:** Restrict user listing to admins or filter results to only show users belonging to the same organization as the requester.

### 4. [Medium] IDOR: Unauthorized Acceptance of Guest Invitations
- **Severity:** Medium (6.5) - `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N`
- **Category:** OWASP API1:2023 Broken Object Level Authorization
- **Location:** `api-peladaapp.controllers.organization/accept-invitation`
- **Description:** The invitation acceptance logic explicitly skips identity verification for "guest" invitations (those created without an email). Any authenticated user with the token can join the organization.
- **Impact:** Unauthorized access to organization data by non-intended users.
- **Remediation:** Tie guest invitations to a specific use-case or implement a secondary verification step (e.g., a one-time code).

### 5. [Medium] Potential BOLA in Match/Team Management
- **Severity:** Medium (6.3) - `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N`
- **Category:** OWASP API1:2023 Broken Object Level Authorization
- **Location:** Multiple endpoints in `handler.match` and `handler.team`
- **Description:** Several endpoints (e.g., score updates, event creation) rely solely on object IDs without verifying if the authenticated user has administrative rights over the organization owning that object.
- **Impact:** Data integrity compromise; users may be able to modify resources belonging to other organizations.
- **Remediation:** Implement cross-tenant authorization checks in all handlers that modify match or team data.

### 6. [Medium] Exposure of Internal Management Endpoints
- **Severity:** Medium (6.5) - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L`
- **Category:** OWASP API8:2023 Security Misconfiguration
- **Location:** `docker-compose.yml` (Ports 8000, 8081)
- **Description:** Internal management routes (`/internal/*`) use IP-based filtering that allows `127.0.0.1`. Since the backend port is exposed to the host, the filter can be bypassed.
- **Remediation:** Do not expose backend ports (8000, 8081) in the `docker-compose.yml` for production environments.

### 7. [Low] Lack of Rate Limiting on Password Reset
- **Severity:** Low (3.3) - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`
- **Category:** OWASP API4:2023 Unrestricted Resource Consumption
- **Location:** `/auth/forgot-password`
- **Description:** The endpoint lacks rate limiting, allowing for potential automated spamming of the email notification system.
- **Impact:** Operational disruption and potential exhaustion of email quotas.
- **Remediation:** Implement rate limiting (e.g., via `buddy-auth` or a dedicated middleware) on all public authentication endpoints.

### 8. [Low] Hardcoded Default JWT Secret
- **Severity:** Low (3.7) - `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N`
- **Category:** OWASP A07:2021 Identification and Authentication Failures
- **Location:** `docker-compose.yml` / `api-peladaapp.config/get-key`
- **Description:** The system uses a weak default secret if the environment variable is missing.
- **Remediation:** Ensure the application fails to start if a strong secret is not provided.
