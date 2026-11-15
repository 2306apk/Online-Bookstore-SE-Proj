# Online Bookstore

A full-stack MERN web application for browsing, searching, and purchasing books online, developed for the Software Engineering project (Team 4).

## Tech Stack

- **Frontend:** React 18, Vite, React Router 7, Vitest, React Testing Library
- **Backend:** Node.js, Express 4, Mongoose 8, Zod, bcryptjs, jsonwebtoken
- **Database:** MongoDB
- **Testing:** Node.js built-in test runner (`node --test`), Supertest, Vitest, mongodb-memory-server

## Project Architecture

The application is organised as an npm workspace with separate `client` and `server` packages:

```
├── client/          # React frontend (Vite)
│   ├── src/
│   │   ├── api/     # Centralised API fetch client with error envelope handling
│   │   ├── app/     # App shell, routing, AuthContext, WishlistContext, CartContext
│   │   ├── components/ # Shared components (Header, ErrorBoundary, AdminHealthStatus)
│   │   └── features/   # Feature modules (book-catalogue, shopping-orders, administration-security)
├── server/          # Express backend REST API
│   ├── src/
│   │   ├── middleware/ # Authentication, RBAC, input validation (Zod), error handling
│   │   └── modules/    # Feature modules (authentication-security, book-catalogue, shopping-orders, administration-security)
│   └── test/        # Integration and unit tests
├── e2e/             # End-to-end smoke verification scripts
└── load/            # Performance and p90 response time testing scripts
```

## Prerequisites

- Node.js >= 20.x
- npm >= 10.x
- MongoDB >= 6.x (running locally or accessible via URI)

## Installation and Setup

1. **Clone the repository and install dependencies:**

   ```bash
   git clone https://github.com/2306apk/Online-Bookstore-SE-Proj.git
   cd Online-Bookstore-SE-Proj
   npm install
   ```

2. **Configure environment variables:**

   Copy `.env.example` to `.env` in the root directory:

   ```bash
   cp .env.example .env
   ```

   Key configuration variables:

   | Variable | Description | Default |
   |---|---|---|
   | `PORT` | Backend server port | `5000` |
   | `CLIENT_ORIGIN` | Allowed CORS origin for the frontend | `http://localhost:5173` |
   | `MONGODB_URI` | MongoDB connection connection string | `mongodb://127.0.0.1:27017/online_bookstore` |
   | `JWT_SECRET` | Secret key for signing session tokens | Development secret |
   | `JWT_EXPIRES_IN` | Session duration | `2h` |
   | `COOKIE_NAME` | Session cookie identifier | `online_bookstore_session` |
   | `VITE_API_URL` | Frontend API base URL | `http://localhost:5000/api` |

3. **Seed sample data:**

   Populate the database with initial categories, books, and test accounts (Admin and Customer):

   ```bash
   npm run seed
   ```

   Default seeded accounts:
   - **Admin:** `admin@bookstore.local` / `AdminPass123!`
   - **Customer:** `customer@bookstore.local` / `CustomerPass123!`

4. **Start the development servers:**

   To run both backend and frontend concurrently:

   ```bash
   npm run dev
   ```

   Or start them individually:

   ```bash
   npm run dev:server   # Starts Express API at http://localhost:5000
   npm run dev:client   # Starts Vite dev server at http://localhost:5173
   ```

## Running Tests

All test suites can be executed via root npm scripts:

- **Backend tests:** Runs all 36 server test files using the Node.js test runner:
  ```bash
  npm run test:server
  ```
- **Frontend tests:** Runs Vitest component and context tests:
  ```bash
  npm run test:client
  ```
- **Combined tests:** Runs backend tests followed by frontend tests:
  ```bash
  npm test
  ```
- **Production build:** Builds the client application for production:
  ```bash
  npm run build
  ```
- **Smoke test:** Runs end-to-end API smoke verification against a running server:
  ```bash
  npm run test:e2e
  ```
- **Performance test:** Measures catalogue p90 response time against the 3-second SLA (OBS-NF-001):
  ```bash
  npm run performance
  ```

## Key Features and Workflows

### Customer Workflows

1. **Authentication & Session Management:**
   - Account registration with password strength requirements (min 8 chars, mixed case, numbers, special characters).
   - Login issuing secure, HTTP-only session cookies.
   - Session restoration on page refresh and clean logout.

2. **Catalogue & Search:**
   - Real-time text search covering book titles, authors, and keywords with regex operator escaping.
   - Multi-criteria filtering: category selection, minimum and maximum price range, and in-stock toggle.
   - Dedicated book details page (`/books/:id`) showing author, description, category, price, current stock, and customer reviews.

3. **Wishlist & Cart Management:**
   - Add and remove books to a customer-specific wishlist with persistent storage across sessions.
   - One-click "Move to Cart" transferring items with idempotency and stock availability checks.
   - Shopping cart supporting quantity increments, decrements, item removals, and stock-limit enforcement.

4. **Checkout & Order Creation:**
   - Pre-checkout validation and order summary preview (`POST /api/checkout/summary`) calculating server-verified subtotal, estimated tax, and shipping.
   - Delivery address validation.
   - Payment simulation supporting standard card validation and sandbox scenarios (`SUCCESS`, `DECLINED`, `ERROR`).
   - Atomic order record creation with automated inventory decrementing upon successful payment.

5. **Order History & Cancellation:**
   - Customer order dashboard (`/orders`) showing order history, itemized breakdowns, total cost, and delivery status badges.
   - Self-service order cancellation for eligible orders (`PLACED` or `PENDING`) with automatic inventory restocking.

6. **Customer Reviews:**
   - Star rating (1–5) and written feedback submission.
   - Automatic detection of confirmed purchase history (`PLACED`, `SHIPPED`, `DELIVERED`), displaying a "✓ Verified Purchase" badge on eligible reviews.
   - Customer review ownership allowing customers to delete their own reviews.

### Administrator Workflows

1. **Role-Based Access Control (RBAC):**
   - Protected `/admin` routes restricted strictly to users with the `ADMIN` role.
   - Server-side middleware rejecting unauthorized access with HTTP 403.

2. **Catalogue & Category Management:**
   - Create, edit, and deactivate book entries.
   - Create and update book categories.

3. **Atomic Inventory Restocking:**
   - Inline restocking controls updating book inventory using atomic MongoDB `$inc` operations to prevent race conditions during concurrent updates.

4. **Order Fulfillment Management:**
   - Order dashboard showing sales overview metrics (total orders, total revenue, counts by status).
   - Order listing with fulfillment status filters (`ALL`, `PLACED`, `SHIPPED`, `DELIVERED`, `CANCELLED`).
   - Order status progression advancing orders strictly along valid lifecycle stages (`PLACED` -> `SHIPPED` -> `DELIVERED`).

5. **Review Moderation:**
   - Dedicated moderation queue to inspect customer reviews.
   - Ability to approve, flag, reject, or permanently delete inappropriate reviews.
   - Real-time recalculation of book aggregate star ratings based solely on approved reviews.

6. **Health & Availability Monitoring:**
   - System health check endpoint (`GET /api/health`) reporting database connectivity status without exposing internal connection strings or secrets.
   - Integrated status widget in the administration dashboard.

## Security & Reliability Design

- **Password Hashing:** Passwords are salted and hashed using bcrypt before database persistence.
- **Session Security:** Session tokens are transmitted via HTTP-only cookies to prevent client-side script access.
- **Input Sanitization:** Server-side validation using Zod schemas for all request payloads and regex escaping for search inputs.
- **Centralized Error Handling:** Express error handling middleware sanitizes all 500 server responses, suppressing stack traces and internal database errors to prevent information disclosure.
- **React Error Boundary:** Catches frontend rendering exceptions and renders a safe fallback view with recovery options without crashing the whole application.
- **Security Audit Logging:** Records security-sensitive operations (authentication failures, administrative restocking, order status updates, and review moderation actions) with timestamps, user IDs, and client IP addresses while omitting credentials.

## Sprint 2 Status & Development Freeze

All Sprint 2 requirements across all four modules have been fully implemented, integrated, and verified:
- **Member 1 (Anvii S Rai):** OBS-24 (Health Monitoring), OBS-SR-03 (Input Sanitization), OBS-SR-05 (Security Audit Logging).
- **Member 2 (Arayana Jain):** OBS-20 (Catalogue Multi-Filters), OBS-21 (Book Details Page).
- **Member 3 (Anwitha Potluri):** OBS-22 (Customer Wishlist), OBS-25 (Checkout Summary), OBS-26 (Payment Simulation & Order Creation), OBS-27 (Order History & Tracking), OBS-28 (Self-Service Cancellation).
- **Member 4 (Apoorva Kogta - Lead & Owner):** OBS-29 (Customer Reviews & Moderation), OBS-30 (Admin Fulfillment & Atomic Restocking), OBS-31 (Centralized Error Handling & Error Boundary).

As of completion of Sprint 2 Stage 8, **the development freeze is in effect**. No further functional additions or major refactorings are permitted for this release cycle.
