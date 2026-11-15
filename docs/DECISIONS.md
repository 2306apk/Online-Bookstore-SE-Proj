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

# Sprint 2 Decisions

## D-007: Atomic MongoDB $inc for Inventory Restocking

Inventory replenishment uses MongoDB's atomic `$inc` update operator rather than in-memory read-modify-save patterns. This prevents lost updates and race conditions during concurrent administrative restock operations.

## D-008: Server-Calculated Checkout Summary Preview

The checkout summary endpoint (`POST /api/checkout/summary`) calculates subtotal, taxes, and shipping fees server-side based on database book pricing and configured tax/shipping rates. Client-supplied amounts are ignored, preventing tampering.

## D-009: Idempotent Payment Simulation and Order Creation

Payment processing is simulated without third-party financial services. Order creation uses idempotency keys and transactional inventory deduction, reserving stock only upon confirmed payment outcome and restoring stock if processing fails.

## D-010: Two-Step Order Fulfillment State Machine

Order status transitions strictly follow the forward lifecycle: `PLACED` -> `SHIPPED` -> `DELIVERED`. Backward state transitions or modifications to `CANCELLED` orders are blocked by the service layer with HTTP 409 conflict errors.

## D-011: Post-Moderation Architecture for Customer Reviews

Customer reviews default to `APPROVED` upon submission and appear immediately on book details pages. Administrators can moderate reviews (`FLAGGED`, `REJECTED`, `DELETED`) from the admin dashboard, dynamically updating book aggregate ratings without database re-indexing delays. Verified purchase flags are determined dynamically against customer order records.

## D-012: Centralized Error Sanitization & Information Masking

All unhandled exceptions and 500 errors are intercepted by centralized Express middleware. Internal database connection details and stack traces are suppressed in production responses, returning a clean `{ error: { code, message } }` envelope.

