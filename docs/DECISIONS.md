# Sprint 1 Decisions

## D-001: Fresh MERN workspace

The inspected repository had no implementation. A single npm workspace with `client/` and `server/` preserves the target layout without introducing four applications.

## D-002: HTTP-only JWT cookie

Authentication uses a short-lived JWT in an HTTP-only, same-site cookie. The API also accepts a bearer token for scripted clients. The browser never stores or logs a token. Logout clears the cookie; a stolen bearer token remains valid only until its configured expiry, which is documented as the stateless JWT limitation.

## D-003: Server-owned cart pricing

Cart documents store book references and quantities only. Prices and totals are read from the current Book document on the server, so client-supplied prices and totals cannot affect the cart.

## D-004: Active catalogue visibility

Public catalogue responses include only books with `active: true`; stock-zero active books remain visible with an out-of-stock status so customers receive an accurate availability message. Inactive books are excluded.

## D-005: Test database

Integration tests use `mongodb-memory-server`, so tests are isolated from development data and do not require a running local MongoDB. Local application execution still requires the configured MongoDB URI.

## D-006: Sprint boundary

No checkout, payment, orders, wishlist, reviews, advanced filtering or extended administration was added. The admin module only supports the agreed book/category management and RBAC work.
