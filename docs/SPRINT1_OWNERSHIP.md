# Sprint 1 Ownership Map

This is a review and contribution boundary, not fabricated Git attribution. OpenCode created the initial integrated working tree. Each member must personally inspect, test, improve and commit their assigned changes under their own account before opening the corresponding PR.

## Member 1: Authentication & Security, 11 points

Jira IDs: `OBS-F-001`, `OBS-F-002`, `OBS-F-003`, `OBS-SR-001`.

Files to review and own:

- `server/src/modules/authentication-security/models/User.js`
- `server/src/modules/authentication-security/password.js`
- `server/src/modules/authentication-security/schemas.js`
- `server/src/modules/authentication-security/service.js`
- `server/src/modules/authentication-security/middleware.js`
- `server/src/modules/authentication-security/routes.js`
- `client/src/features/authentication-security/AuthPage.jsx`
- `client/src/features/authentication-security/validation.js`
- `client/src/features/authentication-security/validation.test.js`
- Authentication cases in `server/test/sprint1.integration.test.js`

## Member 2: Book Catalogue, 11 points

Jira IDs: `OBS-F-004`, `OBS-F-005`, `OBS-NF-001`.

Files to review and own:

- `server/src/modules/book-catalogue/models/Book.js`
- `server/src/modules/book-catalogue/models/Category.js`
- `server/src/modules/book-catalogue/search.js`
- `server/src/modules/book-catalogue/schemas.js`
- `server/src/modules/book-catalogue/service.js`
- `server/src/modules/book-catalogue/routes.js`
- `client/src/features/book-catalogue/BookCard.jsx`
- `client/src/features/book-catalogue/CataloguePage.jsx`
- `load/catalogue-p90.mjs`
- `load/README.md`
- Catalogue/search cases in `server/test/sprint1.integration.test.js`

## Member 3: Shopping & Orders, cart only, 8 points

Jira IDs: `OBS-F-008`, `OBS-F-009`.

Files to review and own:

- `server/src/modules/shopping-orders/models/Cart.js`
- `server/src/modules/shopping-orders/schemas.js`
- `server/src/modules/shopping-orders/service.js`
- `server/src/modules/shopping-orders/routes.js`
- `client/src/features/shopping-orders/CartPage.jsx`
- `client/src/features/shopping-orders/cart-utils.js`
- `client/src/features/shopping-orders/cart-utils.test.js`
- Cart cases in `server/test/sprint1.integration.test.js`

Checkout, payments, orders, wishlist and reviews are explicitly not owned in Sprint 1.

## Member 4: Administration & Security, 10 points

Jira IDs: `OBS-F-016`, `OBS-SR-002`.

Files to review and own:

- `server/src/modules/administration-security/schemas.js`
- `server/src/modules/administration-security/service.js`
- `server/src/modules/administration-security/routes.js`
- `server/src/modules/authentication-security/middleware.js` for the shared role check
- `client/src/features/administration-security/AdminPage.jsx`
- Administration/RBAC cases in `server/test/sprint1.integration.test.js`

## Shared integration files

- `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `docker-compose.yml`
- `server/package.json`, `server/src/app.js`, `server/src/server.js`, `server/src/config/*`, `server/src/middleware/*`, `server/src/seed.js`
- `client/package.json`, `client/index.html`, `client/vite.config.js`, `client/src/main.jsx`, `client/src/app/*`, `client/src/api/client.js`, `client/src/components/Layout.jsx`, `client/src/styles.css`
- `e2e/smoke.mjs`, `.github/workflows/ci.yml`
- `README.md`, `SPRINT1_IMPLEMENTATION_LOG.md` and all `docs/` records

Shared files should be changed through coordination or a dedicated integration PR to avoid overwriting another member's module.
