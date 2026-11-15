# Sprint 2 Two-Minute Project Demonstration Script

**Project:** Online Bookstore (Team 4)  
**Presenter:** Apoorva Kogta (Lead & Owner) / Team 4  
**Target Duration:** ~2 Minutes (120 Seconds)  
**Audience:** Evaluators, Project Mentor, Course Coordinator  

---

## 1. Pre-Demo Setup & Environment Checklist

Before beginning the presentation, ensure the environment is pre-configured:
1. **Start MongoDB:** Ensure local MongoDB daemon is running on port 27017.
2. **Seed the Database:** Run `npm run seed` to ensure fresh, consistent catalogue books, categories, and test accounts.
3. **Start the Application:** Run `npm run dev` in the terminal.
4. **Prepare Browser Tabs:**
   - **Tab 1:** `http://localhost:5173/` (Customer session, logged out or logged in as `customer@bookstore.local`).
   - **Tab 2:** `http://localhost:5173/admin` (Incognito or secondary window logged in as `admin@bookstore.local`).
   - **Tab 3:** `http://localhost:5000/api/health` (Health verification endpoint).

---

## 2. Timed Demonstration Flow

### 0:00 – 0:20 | Introduction & Architectural Foundation
- **Screen:** Homepage (`http://localhost:5173/`)
- **Actions:** Show the clean storefront header, navigation bar, and book grid.
- **Speaking Notes:**
  > "Hello everyone. We are Team 4, presenting the final integrated release of our Online Bookstore. Our application is built on the MERN stack—React with Vite on the frontend, an Express REST API backend, and MongoDB for persistent storage. Today we will demonstrate the core end-to-end customer journey, order lifecycle, and administrative management implemented across Sprint 1 and Sprint 2."

---

### 0:20 – 0:50 | Customer Discovery: Search, Filters, Details & Wishlist
- **Screen:** Catalogue (`http://localhost:5173/`) $\rightarrow$ Book Details (`/books/:id`)
- **Actions:**
  1. In the search bar, type `Clean` to instantly filter the list.
  2. Select the "Technology" category checkbox and adjust the max price slider.
  3. Click on the book card **"Clean Code"** to open its dedicated details page.
  4. Point out the author, category, price, stock count, and aggregate star rating.
  5. Click the **"Add to Wishlist"** heart icon $\rightarrow$ navigate to `/wishlist` to show it saved.
  6. Click **"Move to Cart"** $\rightarrow$ item transfers to cart while disappearing from the wishlist.
- **Speaking Notes:**
  > "A customer can browse our active catalogue using real-time search and multi-criteria filters for category, price range, and stock availability. Clicking any title opens its dedicated details page, complete with live inventory levels and customer ratings. From here, customers can bookmark titles to their persistent wishlist, and seamlessly move them into their shopping cart without risk of duplicate quantities."

---

### 0:50 – 1:20 | Checkout, Payment Simulation & Order Lifecycle
- **Screen:** Cart (`/cart`) $\rightarrow$ Checkout (`/checkout`) $\rightarrow$ Orders (`/orders`)
- **Actions:**
  1. Click **"Proceed to Checkout"**.
  2. Show pre-filled delivery address (or enter address quickly: `12 MG Road, Bengaluru, Karnataka, 560001`).
  3. Highlight the server-calculated order breakdown showing subtotal, tax, shipping, and total.
  4. Click **"Place Order"** with payment scenario set to `SUCCESS`.
  5. Order receipt displays with confirmed Order ID.
  6. Navigate to **"My Orders"** (`/orders`) to show the new order in `PLACED` status.
  7. *(Optional quick check)* Show a second placed order and click **"Cancel Order"** to show instant status transition to `CANCELLED` and stock restoration.
- **Speaking Notes:**
  > "During checkout, all prices, taxes, and shipping fees are calculated server-side to guarantee integrity. Our simulated payment processor validates card credentials and atomically decrements inventory upon successful payment confirmation. Customers can immediately review their order history, track status progression, or perform self-service cancellation within the allowed window."

---

### 1:20 – 1:50 | Administrator Operations: Restocking, Fulfillment & Review Moderation
- **Screen:** Admin Dashboard (`http://localhost:5173/admin`)
- **Actions:**
  1. Switch to the Admin window and point out the **System Health Status** widget showing database connectivity (`UP`).
  2. In the **Catalogue & Inventory** tab, locate a low-stock title, enter `20` in the `+Qty` field, and click **Restock** $\rightarrow$ stock updates immediately via atomic `$inc`.
  3. Switch to the **Order Fulfillment** tab: highlight total orders and revenue KPIs, then click **"Mark as Shipped"** on the customer's placed order.
  4. Switch to the **Review Moderation** tab: show submitted reviews with verified purchase flags, and demonstrate clicking **"Reject"** or **"Approve"** to moderate public review visibility.
- **Speaking Notes:**
  > "Switching to the administrator dashboard, access is enforced through strict server-side RBAC. Administrators can monitor real-time database health, replenish inventory using atomic increments to prevent race conditions, and advance customer orders through their fulfillment stages. The moderation dashboard also gives admins direct control over customer reviews, ensuring inappropriate submissions are hidden from the store."

---

### 1:50 – 2:00 | Security Highlights & Conclusion
- **Screen:** Browser Developer Tools / Console or `/api/health`
- **Actions:** Trigger an invalid path (e.g. `http://localhost:5000/api/nonexistent`) to show the clean error JSON envelope without stack traces.
- **Speaking Notes:**
  > "Across both sprints, security and reliability have been our top priorities: passwords are salted with bcrypt, sessions use HTTP-only cookies, admin actions are recorded in security audit logs, and all server faults are sanitized to prevent information leakage. That concludes our Sprint 2 demonstration. Thank you!"

---

## 3. Fallback Plans During Live Presentation

| Potential Failure Point | Root Cause | Instant Fallback Action |
|---|---|---|
| Port 5000 / 5173 unavailable | Previous process still bound | Run `kill -9 $(lsof -ti:5000,5173)` and restart `npm run dev`. |
| Seed data missing or altered | Dirty database from previous tests | In a separate terminal run `npm run seed` (takes < 2 seconds). |
| Network disconnect or delay | Local machine resource throttle | Open pre-loaded browser tabs containing seeded data. All core features run completely locally without internet access. |
| Checkout payment fails unexpectedly | Sandbox scenario set to `DECLINED` | Ensure payment scenario dropdown is set to `SUCCESS`, or retry with reference `SIM-OK`. |
