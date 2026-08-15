# Smart Family Finance Manager

*Track. Understand. Control Your Money.*

A premium, colorful fintech-style family finance manager built with plain HTML5, CSS3, and vanilla JavaScript — no framework, no backend server. Firebase Authentication and Firestore provide the entire backend, and the app is fully deployable to GitHub Pages.

---

## 1. Project Overview

Family members create an account, sign in, and track income, expenses, borrowed money, and repayments. Every user sees their own dashboard, charts, transaction history, and monthly reports (CSV / PDF / Excel).

A separate, securely-authorized **Master Control** account can oversee the whole family: manage members, view and edit authorized financial records with a mandatory reason-for-change, enable/disable accounts, and review a full audit trail.

## 2. Features

- Modern glassmorphism login, registration, and forgot-password flow (Firebase Authentication)
- Normal user dashboard with live Chart.js visualizations (Income vs Expenses, Borrowed vs Repayment, Monthly Spending, Expense Categories)
- Income, Expenses, Borrowed Money, and Repayments modules — full add / edit / delete / search / filter / sort
- Automatic remaining-balance and status recalculation on every repayment
- Complete transaction history feed
- Monthly reports with CSV, PDF (jsPDF), and Excel (SheetJS) export — all generated client-side
- Master Control: family overview stats, user management (view / edit / disable / enable), family-wide finance management with a mandatory "reason for change" and full audit trail, and an audit log viewer
- Firestore Security Rules that independently enforce every permission — the UI is not the security boundary
- Fully responsive (desktop, tablet, mobile) with a collapsible sidebar
- Toasts, loading states, empty states, and confirmation modals throughout

## 3. Technology Stack

HTML5 · CSS3 · Vanilla JavaScript (ES modules) · Firebase Authentication · Firebase Firestore · Chart.js · jsPDF · SheetJS (XLSX). No React/Vue/Angular, no Node backend, no npm runtime dependency — everything runs from static files plus CDN scripts.

## 4. Folder Structure

```
smart-family-finance/
├── index.html            Login (opens directly, no landing page)
├── register.html         Create Account
├── dashboard.html         Normal user dashboard + charts
├── income.html
├── expenses.html
├── borrowed.html
├── repayments.html
├── transactions.html
├── reports.html
├── profile.html
├── master-control.html    Master Control (requires authorization)
├── css/
│   ├── style.css          Design system, auth pages, buttons, modals, toasts
│   ├── dashboard.css       App shell, sidebar, stat/chart cards
│   ├── forms.css           Form fields, filter bars, reason boxes
│   ├── tables.css          Responsive data tables
│   └── responsive.css      Global breakpoints
├── js/
│   ├── firebase-config.js  Single shared Firebase init (app, auth, db)
│   ├── common.js            Toasts, formatting, validation, audit logging
│   ├── guard.js              Auth guard + Master Control authorization check
│   ├── auth.js                Login page logic
│   ├── register.js
│   ├── dashboard.js
│   ├── income.js / expenses.js / borrowed.js / repayments.js
│   ├── transactions.js
│   ├── reports.js
│   ├── profile.js
│   └── master-control.js
├── firestore.rules
└── README.md
```

## 5. Firebase Project Setup

This app is wired to the existing Firebase project **`smart-family-finance-a0443`**, configured in `js/firebase-config.js`. Firebase initialization happens **only** in that one file — every other module imports `{ app, auth, db }` from it.

1. Open the [Firebase Console](https://console.firebase.google.com) and select `smart-family-finance-a0443`.
2. **Authentication → Sign-in method** → enable **Email/Password**.
3. **Firestore Database** → create a database (production mode).
4. **Firestore → Rules** → paste the contents of `firestore.rules` (see §7) and publish.
5. **Authentication → Settings → Authorized domains** → add your GitHub Pages domain (e.g. `USERNAME.github.io`) once deployed (see §10). `localhost` is authorized by default for Live Server testing.

## 6. Firestore Data Structure

```
users/{uid}
  uid, fullName, email, phone, accountType ("normal"), status ("active"|"disabled"), createdAt, updatedAt

users/{uid}/income/{id}          source, amount, description, date, time, createdAt, updatedAt, createdBy
users/{uid}/expenses/{id}        amount, category, reason, date, time, createdAt, updatedAt, createdBy
users/{uid}/borrowed/{id}        borrowedFrom, amount, reason, borrowDate, dueDate, notes, totalRepaid, remainingAmount, status
users/{uid}/repayments/{id}      borrowedId, repaymentAmount, repaymentDate, repaymentTime, notes
users/{uid}/transactions/{id}    type, amount, category, reason, date, time, sourceCollection, sourceId

authorizedAdmins/{uid}           The ONLY source of truth for Master Control access (see §8)
auditLogs/{id}                   action, targetUser, targetRecord, recordType, oldValue, newValue, reason, performedBy, timestamp
```

## 7. Firestore Security Rules

The full ruleset lives in [`firestore.rules`](./firestore.rules) and is enforced server-side — the frontend UI is never the actual security boundary. Summary:

- **Unauthenticated:** no access to anything.
- **Normal users:** full read/write on their own `users/{uid}` profile (but can never change `accountType` or `status` on themselves) and their own financial subcollections only.
- **Master Control:** read/write access to every user's profile and financial records, gated by `exists(/authorizedAdmins/{request.auth.uid})`.
- **`authorizedAdmins`:** readable only by the signed-in UID checking its own entry; **never writable from any client**, by anyone, under any condition.
- **`auditLogs`:** immutable once written (no client can update or delete an entry). A normal user may create an entry only for their own actions on their own data; Master Control may create entries for any target. Only Master Control can read the log.

No rule ever trusts `allow read, write: if true;` and no rule ever trusts a client-editable field (like `users/{uid}.accountType`) to decide Master Control access.

Deploy the rules either by pasting `firestore.rules` into the Firebase Console → Firestore → Rules tab, or via the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

## 8. Master Control Authorization (Critical — read this)

**There is no "Master Control" option anywhere in the registration form.** Every new account is created with `accountType: "normal"` and `status: "active"` in both the UI and the Firestore rules that validate account creation — a user cannot make themselves Master Control by editing anything in the browser.

Master Control status is determined **only** by the existence of a document at:

```
authorizedAdmins/{uid}
```

That collection has `allow write: if false;` in the rules, so it can never be created, edited, or deleted from any client. To authorize the first (or any) Master Control account:

1. Register a normal account through `register.html` as usual, or find the target user's UID in **Firebase Console → Authentication → Users**.
2. Go to **Firebase Console → Firestore Database**.
3. Create a new document manually:
   - Collection: `authorizedAdmins`
   - Document ID: the user's UID (exactly as shown in Authentication → Users)
   - Fields: e.g. `{ authorizedAt: <timestamp>, authorizedBy: "console-admin" }` (the field contents don't matter — only the document's existence at that UID matters)
4. Save. The next time that user logs in (or refreshes), `js/guard.js` will detect the `authorizedAdmins/{uid}` document and route them to `master-control.html` instead of `dashboard.html`.

To **revoke** Master Control, simply delete that document from the Firebase Console.

> For larger deployments you may prefer to manage this collection with the Firebase Admin SDK in a trusted server environment (e.g. a one-off script or Cloud Function) instead of the Console UI — but never from `js/` in this repository, and never with a service-account key committed to the project.

## 9. Running in VS Code

1. Install the **Live Server** extension (Ritwick Dey) in VS Code.
2. Open the `smart-family-finance` folder in VS Code.
3. Right-click `index.html` → **Open with Live Server**.
4. The app opens directly on the login page at `http://127.0.0.1:5500/index.html` (or similar).

No build step, no `npm install` — it's static files served as-is.

## 10. GitHub Pages Deployment

1. Push this folder to a GitHub repository.
2. **Repository → Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder: `/ (root)`.
3. Save. Your app will be live at `https://USERNAME.github.io/REPOSITORY-NAME/`.
4. Add that exact domain (`USERNAME.github.io`) to **Firebase Console → Authentication → Settings → Authorized domains**, or sign-in will fail with `auth/unauthorized-domain`.

All local asset paths in this project already use relative `./` references, so no path changes are needed for GitHub Pages.

## 11. Testing

### Normal account flow
1. Open `index.html` → **Create Account** → fill the form → account is created as `normal` / `active`.
2. Sign in → redirected to `dashboard.html`.
3. Add income (try all four sources), add an expense (try submitting without a reason — it should be blocked), add borrowed money, then add a partial repayment and confirm the remaining amount and status update correctly.
4. Check Transactions, Reports (generate + download CSV/PDF/Excel), and Profile (update name/phone, request a password reset email).
5. Sign out, then try opening `dashboard.html` directly while signed out — you should be redirected to `index.html`.

### Master Control flow
1. Authorize a UID as described in §8.
2. Sign in with that account → redirected straight to `master-control.html`.
3. Confirm the Overview stats match your test data.
4. In User Management: view a member's details, edit their name/phone, then disable and re-enable their account (each action should appear in Audit Logs).
5. In Finance Management: filter by type, search by member/category/date, edit a record (a reason is required) and delete a record — confirm the change appears in Audit Logs with old/new values.
6. Confirm a **normal** account cannot open `master-control.html` directly (it should redirect to `dashboard.html`), and cannot see or edit another member's data even by guessing a URL — this is enforced by `firestore.rules`, not just the UI.

### Security checks
- Try signing in with a wrong password / non-existent email / after too many attempts — each should show a specific, friendly message (not "Something went wrong").
- With browser dev tools, try editing a normal user's own `users/{uid}` document to set `accountType: "master"` directly via the Firestore console rules simulator — the rule should reject it, since normal-user updates are only allowed when `accountType` and `status` stay unchanged.

## 12. Known Limitations / Manual Setup Required

- Master Control authorization is a manual, one-time step performed in the Firebase Console (§8) — this is intentional, per the security requirement that no frontend code can grant admin access.
- Email/Password sign-in must be enabled in the Firebase Console before any authentication will work (§5, step 2).
- Firestore Rules must be deployed (§7) before the app is secure — until then, Firestore's default rules apply.
- This project was built and reviewed for correctness (rules logic, ID wiring between HTML/JS, ES module syntax) but has not been exercised against a live Firebase project in this environment — please run through §11 against your own `smart-family-finance-a0443` project after deployment.
