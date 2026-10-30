# Sprint 1 Manual PR Guide

No Git write operations or artificial authorship are performed by the implementation session.

1. Choose a shared base branch and have the integrator add only agreed scaffold and shared configuration first.
2. Each member checks out the base using their own GitHub identity, reviews the generated module, improves it, runs its tests and makes their own actual commit.
3. Open the following PRs with the real Jira IDs and observed test output:
   - `feature/sprint1-authentication-security`: Member 1, `OBS-F-001`, `OBS-F-002`, `OBS-F-003`, `OBS-SR-001`.
   - `feature/sprint1-book-catalogue`: Member 2, `OBS-F-004`, `OBS-F-005`, `OBS-NF-001`.
   - `feature/sprint1-shopping-cart`: Member 3, `OBS-F-008`, `OBS-F-009`.
   - `feature/sprint1-admin-rbac`: Member 4, `OBS-F-016`, `OBS-SR-002`.
4. Review shared-file conflicts before merging. The highest-risk shared files are `server/src/app.js`, `server/src/modules/authentication-security/middleware.js`, `client/src/app/*`, `client/src/components/Layout.jsx`, `package-lock.json` and the documentation matrix.
5. Run CI and review each PR as the repository owner. Merge only after the member has validated their own module.
6. Keep Jira statuses, points, PR authorship and test results truthful. Do not ask a teammate to re-commit unchanged generated files as if they authored them.

## Required human follow-up

- Upload the required one-minute Sprint 1 working-product demonstration video to the repository.
- Confirm the live Jira board and reconcile any differences from the ten-item list in the build brief.
- Obtain real remote GitHub Actions results and team-member PR history.
