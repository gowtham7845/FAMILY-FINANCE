# Smart Family Finance Manager

*Track. Understand. Control Your Family's Money.*

A high-performance, colorful fintech web application built with HTML5, CSS3, and vanilla JavaScript (ES modules) — no heavy frameworks, no backend server required. Firebase Authentication and Cloud Firestore provide secure backend services, and the entire app is fully deployable to GitHub Pages.

---

## 1. Features & Capabilities

- **High Performance & Low Latency**:
  - Single Firebase SDK initialization via `js/firebase-config.js`.
  - Parallelized Firestore queries and centralized `appState` with session caching to minimize Firestore reads.
  - Dynamic on-demand lazy loading for Chart.js, jsPDF, and SheetJS (XLSX).
  - 25-record pagination across all financial tables, user lists, and audit logs.
  - 300ms debounced search to eliminate CPU stutters and redundant calculations.

- **Authentication & Role-Based Routing**:
  - Secure Firebase Authentication with email/password, password reset, and session management.
  - Double-click prevention with loading state spinners on all submission buttons.
  - **Secure Master Control Routing**: Authenticated UID is checked against Firestore `authorizedAdmins/{uid}` rules. Authorized admins are automatically routed to `master-control.html`, while standard users are routed to `dashboard.html`.
  - Normal registration automatically defaults to `role: "user"` (`accountType: "normal"`). Master Control accounts cannot be self-promoted during registration.

- **Financial Management**:
  - **Income Tracking**: Sources (Dad, Mom, User, Other), amounts, descriptions, dates, and times.
  - **Expense Tracking**: Categories (Food, Education, Transport, Shopping, Medical, Bills, Entertainment, Other), reasons, amounts, and notes.
  - **Borrowed Money & Loans**: Loan provider, initial amount, automatic remaining balance calculation, due dates, and status (`Pending`, `Partially Paid`, `Paid`).
  - **Repayment Tracking**: Repay against active borrowed loans with automatic recalculation and audit trail.
  - **Transaction History**: Cursor-based paginated feed of all financial events with filters.

- **Advanced Reporting Center (`reports.html`)**:
  - **Daily Reports**: Itemized daily inflow/outflow, daily income analysis (highest, average, total), and summary metrics.
  - **Weekly Reports**: 7-day breakdown (Monday to Sunday) with daily averages, highest spending days, and 7-day interactive trend charts.
  - **Monthly Reports**: Full monthly statements with daily breakdown, savings rate calculation, and category distribution.
  - **Yearly Reports**: 12-month summary (January through December) with annual totals and yearly cash flow trend charts.
  - **Custom Date Range Reports**: Flexible timeframe selection with filtered itemized logs.
  - **Previous Period Comparison**: Daily (Today vs Yesterday), Weekly (This Week vs Last Week), Monthly (This Month vs Last Month), and Yearly (This Year vs Previous Year) with safe percentage change calculation.
  - **Multi-Format Exports**: Client-side lazy-loaded PDF (jsPDF with executive summary & tables), Excel workbook (SheetJS with dedicated tabs), CSV download, and print styles.

- **Master Control Center (`master-control.html`)**:
  - **Overview**: Fast aggregated totals across all family members using Firestore server-side `sum()` aggregations.
  - **User Management**: Paginated directory of all registered family accounts with profile editing, enable/disable actions, and audit logging.
  - **Finance Management**: Complete family financial records with search, filters, record edit modal (with mandatory reason for change), and deletion.
  - **Master Reports**: Generate Daily, Weekly, Monthly, Yearly, and Custom reports across **All Family Members** or for an **Individual Member**.
  - **Audit Logs**: Immutable audit log of all administrative and financial actions.

---

## 2. Technology Stack

* **Core**: HTML5, Vanilla JavaScript (ES6 Modules)
* **Styling**: Vanilla CSS3 (Custom Design System with Glassmorphism, CSS Grid, Flexbox, Responsive Breakpoints)
* **Authentication**: Firebase Authentication CDN (Modular SDK v12.16.0)
* **Database**: Firebase Cloud Firestore CDN (Modular SDK v12.16.0)
* **Visualizations**: Chart.js v4.4.4 (Lazy loaded)
* **Exporting**: jsPDF v2.5.1, SheetJS/XLSX v0.18.5 (Lazy loaded on export)
* **Hosting**: GitHub Pages

---

## 3. Directory Structure

```text
family/
├── index.html            Login entry page (fast load, no heavy libraries)
├── login.html            Login alias
├── register.html         Account registration
├── dashboard.html        Normal user dashboard + charts
├── income.html           Income tracking
├── expenses.html         Expense tracking
├── borrowed.html         Borrowed money tracking
├── repayments.html       Loan repayments
├── transactions.html     Transaction history feed
├── reports.html          Advanced multi-mode reporting suite
├── profile.html          User profile & password management
├── master-control.html   Master Control (requires admin role)
├── css/
│   ├── style.css         Design system, auth screens, badges, buttons, modals, toasts
│   ├── dashboard.css     App shell, sidebar, stat cards, chart containers
│   ├── forms.css         Form elements, chip selectors, filter bars, reason boxes
│   ├── tables.css        Responsive tables with card fallback on mobile
│   └── responsive.css   Breakpoints and print styles
├── js/
│   ├── firebase-config.js  Single shared Firebase initialization
│   ├── common.js         Central appState, debounce, math, dates, toast notifications
│   ├── guard.js          Central auth guard, session caching, role verification
│   ├── auth.js           Login & password reset logic
│   ├── register.js       User registration logic
│   ├── dashboard.js      Parallel data fetching, chart lifecycle management
│   ├── income.js         Income module with pagination & search
│   ├── expenses.js       Expense module with pagination & search
│   ├── borrowed.js       Borrowed money module with pagination & search
│   ├── repayments.js     Repayment module with loan reconciliation
│   ├── transactions.js   Transaction feed with cursor pagination
│   ├── reports.js        Multi-mode report engine, charts, PDF/Excel/CSV exports
│   ├── profile.js        Profile update & password reset
│   └── master-control.js Master Control dashboard, user management, audit logs
├── firestore.rules       Firestore security rules
└── README.md
```

---

## 4. Master Control Account Authorization Process

To authorize an account as Master Control:

1. Create an account via `register.html` (e.g. `admin@example.com`).
2. Go to the [Firebase Console](https://console.firebase.google.com) → **Firestore Database**.
3. Create a collection named **`authorizedAdmins`** if it doesn't already exist.
4. Add a document where the **Document ID** is the exact Firebase Authentication **UID** of the user.
5. In the document fields, you can add `{ "role": "master", "createdAt": timestamp }`.
6. When this user logs in at `index.html`, `guard.js` will verify the document's existence in `authorizedAdmins/{uid}`, set `isMaster: true`, and automatically route the user to `master-control.html`.
7. `firestore.rules` independently verifies `exists(/databases/$(database)/documents/authorizedAdmins/$(request.auth.uid))` for all database access.

---

## 5. Firestore Indexes Required

For optimal performance, ensure the following Firestore composite indexes are configured:

1. **Collection**: `users/{uid}/transactions`
   - Fields: `date` (DESCENDING), `__name__` (DESCENDING)
2. **Collection Group**: `income`
   - Aggregation: `amount` (for `sum()` queries)
3. **Collection Group**: `expenses`
   - Aggregation: `amount` (for `sum()` queries)
4. **Collection Group**: `borrowed`
   - Aggregation: `amount` (for `sum()` queries)
5. **Collection Group**: `repayments`
   - Aggregation: `repaymentAmount` (for `sum()` queries)
6. **Collection**: `auditLogs`
   - Fields: `timestamp` (DESCENDING), `__name__` (DESCENDING)

---

## 6. GitHub Pages Deployment

1. Commit and push all files to your GitHub repository.
2. In GitHub, go to **Settings → Pages**.
3. Under **Branch**, select `main` (or `master`) and `/ (root)`.
4. In the [Firebase Console](https://console.firebase.google.com), go to **Authentication → Settings → Authorized domains**.
5. Add your GitHub Pages domain (e.g. `username.github.io`).
6. Open `https://username.github.io/repository-name/` in any browser!
