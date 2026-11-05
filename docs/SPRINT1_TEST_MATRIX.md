# Sprint 1 Test Traceability Matrix

Results are updated only after commands are run in this workspace. The application does not claim a remote CI result.

| Jira/SRS item | Test case | Evidence | Execution status |
|---|---|---|---|
| `OBS-F-001` | `TC-AUTH-01` valid registration, duplicate email, weak password | `server/test/sprint1.integration.test.js` | Pass (aggregate run) |
| `OBS-F-002` | `TC-AUTH-02` valid and invalid login | `server/test/sprint1.integration.test.js` | Pass (aggregate run) |
| `OBS-F-003` | `TC-AUTH-03` logout removes browser session and protected access fails | `server/test/sprint1.integration.test.js` | Pass (aggregate run) |
| `OBS-SR-001` | `TC-SEC-01` bcrypt hash is persisted and not returned | `server/test/sprint1.integration.test.js` | Pass (aggregate run) |
| `OBS-F-004` | `TC-CAT-01` active catalogue and inactive exclusion | `server/test/sprint1.integration.test.js` | Pass (aggregate run) |
| `OBS-F-005` | `TC-SRCH-01` title, author, keyword, no result and regex-safe search | `server/test/sprint1.integration.test.js`, `server/test/unit.test.js` | Pass (aggregate run) |
| `OBS-NF-001` | `TC-PERF-01` reproducible p90 measurement against 3 seconds | `load/catalogue-p90.mjs` | Pass: p90 94.99 ms, 100 requests/concurrency 10 |
| `OBS-F-008` | `TC-CART-01` add, duplicate merge, availability and stock limits | `server/test/sprint1.integration.test.js` | Pass (aggregate run) |
| `OBS-F-009` | `TC-CART-02` update, remove, invalid quantity and isolation | `server/test/sprint1.integration.test.js` | Pass (aggregate run) |
| `OBS-F-016` | `TC-ADM-01` admin category/book create/update and public reflection | `server/test/sprint1.integration.test.js` | Pass (aggregate run) |
| `OBS-SR-002` | `TC-SEC-02` guest/customer direct API denial | `server/test/sprint1.integration.test.js`, `e2e/smoke.mjs` | Pass (aggregate run and E2E) |

## Additional checks

- Frontend unit tests cover registration/login validation and cart summary calculations in `client/src/features/**`. 
- `e2e/smoke.mjs` is a real end-to-end smoke flow covering guest catalogue/search, customer auth/cart/logout, customer RBAC denial and admin catalogue management. It passed against the seeded local API.
- The CI workflow runs server tests, client tests and the client production build on push and pull request. The workflow file has not been run remotely from this workspace.
