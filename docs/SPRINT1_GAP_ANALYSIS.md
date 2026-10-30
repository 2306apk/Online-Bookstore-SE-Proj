# Sprint 1 Gap Analysis

## Baseline

The repository was inspected on 2026-10-26. It contained the Sprint 1 build brief and the source SRS, SAD and STP PDFs only. There was no package manifest, source tree, database configuration, test suite, CI workflow or README. Therefore no existing application code was overwritten.

## Ten Agreed Work Items

| Jira item | Requirement | Baseline status | Evidence at baseline | Final status | Implemented evidence |
|---|---|---|---|---|
| OBS-F-001 | User registration | Missing | No application files | Implemented | `server/src/modules/authentication-security/routes.js`, `client/src/features/authentication-security/AuthPage.jsx` |
| OBS-F-002 / OBS-F-003 | Login and logout | Missing | No application files | Implemented | `server/src/modules/authentication-security/routes.js`, `client/src/features/authentication-security/AuthPage.jsx` |
| OBS-SR-001 | Secure password storage | Missing | No application files | Implemented | `server/src/modules/authentication-security/models/User.js`, `server/src/modules/authentication-security/password.js` |
| OBS-F-004 | Browse books | Missing | No application files | Implemented | `server/src/modules/book-catalogue/routes.js`, `client/src/features/book-catalogue/CataloguePage.jsx` |
| OBS-F-005 | Search books | Missing | No application files | Implemented | `server/src/modules/book-catalogue/routes.js`, `client/src/features/book-catalogue/CataloguePage.jsx` |
| OBS-NF-001 | Catalogue response time | Missing | No application files | Implemented and measured | `load/catalogue-p90.mjs`, `docs/SPRINT1_TEST_MATRIX.md` |
| OBS-F-008 | Add books to cart | Missing | No application files | Implemented | `server/src/modules/shopping-orders/routes.js`, `client/src/features/shopping-orders/CartPage.jsx` |
| OBS-F-009 | Update/remove cart items | Missing | No application files | Implemented | `server/src/modules/shopping-orders/routes.js`, `client/src/features/shopping-orders/CartPage.jsx` |
| OBS-F-016 | Manage books/categories | Missing | No application files | Implemented | `server/src/modules/administration-security/routes.js`, `client/src/features/administration-security/AdminPage.jsx` |
| OBS-SR-002 | Role-based access control | Missing | No application files | Implemented | `server/src/modules/authentication-security/middleware.js`, `server/src/modules/administration-security/routes.js` |

## Explicitly Unallocated

`OBS-F-006` advanced filtering is not one of the ten agreed Sprint 1 items and remains backlog. Book details (`OBS-F-007`), checkout/orders (`OBS-F-011` through `OBS-F-014`), wishlist (`OBS-F-010`), reviews (`OBS-F-015`) and extended administration (`OBS-F-017` and `OBS-F-018`) remain Sprint 2 or later scope.

## Supporting Integration Files

The shared Express app, MongoDB configuration, React shell, API client, seed script and CI workflow are integration files. Ownership is listed in `docs/SPRINT1_OWNERSHIP.md`; they are not attributed to an individual member.
