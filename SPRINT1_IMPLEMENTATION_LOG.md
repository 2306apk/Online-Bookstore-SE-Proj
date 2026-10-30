# Sprint 1 Implementation Log

This log records actual work performed in the shared working tree. It does not represent Git commits or individual member authorship.

## Phase 1/8: Inspection and gap analysis

- Date: 2026-10-26.
- Read `SPRINT1_FULL_PIPELINE_TEAM_MODULES.md`, `SRS_Online_Bookstore_Team4.pdf`, `SAD_Team4_OnlineBookstore.pdf` and `Test_Plan_Online_Bookstore_Team4.pdf`.
- Inspected the project directory with file listing and glob search.
- Result: source documents only; all ten agreed work items were missing.
- Created `docs/SPRINT1_GAP_ANALYSIS.md` and `docs/DECISIONS.md`.
- No Git history or branch-changing command was run.

## Phase 2/8: Shared infrastructure

Status: complete.

- Installed Node.js 22.14.0 locally under `/tmp/opencode` because a Linux Node runtime was not available system-wide.
- Ran `npm install`; the workspace installed successfully and generated `package-lock.json`.
- Started a local MongoDB 7.0.24 process on port 27018 using the downloaded development binary because Docker Desktop's Linux daemon was unavailable.
- Ran `MONGODB_URI=mongodb://127.0.0.1:27018/online_bookstore_local npm run seed`: passed, creating 3 categories, 4 books and 2 development accounts.
- Ran the API and verified `GET /api/health` returned `{"status":"ok","database":"connected"}`.

## Phase 3/8: Authentication and security

Status: complete.

- Implemented registration, login, logout, session restoration, bcrypt password hashing and server-side authentication/role middleware.
- Backend integration cases passed for registration, duplicate/weak input, valid/invalid login, logout, protected access and hash inspection.

## Phase 4/8: Catalogue and search

Status: complete.

- Implemented MongoDB-backed active catalogue queries, pagination, title/author/keyword search, safe regex handling, indexes and responsive catalogue UI.
- Backend catalogue/search tests passed. The final p90 measurement was 94.99 ms for 100 requests at concurrency 10.

## Phase 5/8: Cart

Status: complete.

- Implemented authenticated customer cart persistence, duplicate quantity merging, quantity/removal actions, stock limits and server-owned totals.
- Backend cart isolation and invalid/boundary quantity tests passed. React cart unit tests passed.

## Phase 6/8: Administration and RBAC

Status: complete.

- Implemented admin-only book/category create/update/soft-deactivate endpoints and integrated admin UI.
- Guest/customer direct API denial, invalid admin data and public catalogue reflection tests passed.

## Phase 7/8: Integration, tests and CI

Status: complete.

- Added `e2e/smoke.mjs`, `.github/workflows/ci.yml`, ownership map, test matrix, PR guide and README.
- Ran `npm run test:e2e`: passed the guest search, registration, cart, logout, RBAC and admin management flow.
- Ran `npm run lint --if-present`: exited successfully; no workspace lint scripts are currently defined.
- Ran `npm audit --omit=dev --audit-level=high`: zero production dependency vulnerabilities after upgrading React Router and Zod.

## Phase 8/8: Final verification

Status: complete.

- Ran `npm test`: 7 backend tests passed and 4 frontend tests passed; 0 failures.
- Ran `npm run build`: Vite production build passed.
- Started the React dev server and fetched its root HTML successfully at `http://127.0.0.1:5173/`.
- Ran `npm run performance` with 100 requests and concurrency 10: p50 52.36 ms, p90 94.99 ms, max 160.52 ms; target met.

## Limitations to track

- Docker Desktop was installed but its Linux daemon was not running during initial inspection.
- A Linux Node runtime was not installed system-wide; a local runtime under `/tmp/opencode` is being used for verification.
- Remote GitHub Actions status and the required one-minute demo video cannot be created or claimed by this implementation session.
- Full `npm audit` still reports vulnerabilities in development/test tooling; the production dependency audit is clean. Review those dev-only advisories before a production release.
