# SplitSafe - Relational Expense Sharing Ledger

SplitSafe is a production-ready, interview-grade full-stack shared expenses application built with **React, Node.js + Express, TypeScript, and Prisma ORM + PostgreSQL**.

It is designed to solve a complex roommates/group expense-sharing scenario under tight database integrity constraints, historical membership bounds, and multi-currency conversions. It includes a custom CSV importer with anomaly detection and a visual review queue.

---

## Technical Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Lucide icons, Vite.
- **Backend**: Node.js, Express, TypeScript, JWT-based Authentication.
- **Database**: PostgreSQL (Neon Server recommended), Prisma ORM.
- **Testing**: Native Node TypeScript Assertion runner.

---

## Key Features

1. **Authentication**: Email/Password secure login and registration using JWT and bcrypt.
2. **Dynamic Group Membership**: Members can join and leave groups with custom date boundaries.
   - *Business Rule*: AISHA, ROHAN, PRIYA, MEERA, DEV, SAM are supported.
   - *Dynamic Rule*: Meera leaves March 31, 2026. Sam joins April 15, 2026. Expenses outside a member's active period do not affect their balances.
3. **Advanced Math Engine**:
   - Equal splits, exact splits, percentage splits, and share-based splits.
   - Automated remainder distribution down to the penny to prevent floating-point discrepancies.
4. **Greedy Debt Simplification**:
   - Implements a min-transaction heap-based settlement algorithm to simplify debt pathways.
5. **CSV Ingest & Anomaly Review Queue**:
   - RFC-4180 custom CSV parser (no third-party dependencies).
   - Flagging engine: duplicates, negative amounts, disguised settlements, inactive members on date, and invalid splits.
   - A Review Queue to Approve, Reject, or Correct rows.
6. **Import Report Generation**:
   - Detailed breakdown of session statistics, approved/rejected counts, USD transaction volumes, and flagged anomalies.

---

## Folder Structure

```
shared-expenses-app/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Database models (User, Group, Member, Expense, Splits, Session, Queue)
│   │   └── seed.ts              # Pre-populates Aisha, Rohan, Priya, Meera, Dev, Sam & initial expenses
│   ├── src/
│   │   ├── controllers/         # Request handling logic (Auth, Groups, Expenses, CSV Imports)
│   │   ├── middleware/          # JWT auth verification
│   │   ├── services/
│   │   │   ├── currencyService.ts # Conversion engine (USD, INR, EUR, GBP, CAD, AUD)
│   │   │   ├── expenseEngine.ts   # Equal, exact, percentage, share math
│   │   │   ├── settlementEngine.ts# Greedy min-trans debt simplification
│   │   │   └── csvImporter.ts     # CSV parser and anomaly check rules
│   │   ├── tests/
│   │   │   └── engine.test.ts     # Standalone TypeScript unit test runner
│   │   ├── routes/              # Express API route mapping
│   │   └── index.ts             # Express startup
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx             # Vite mount entry
│   │   ├── App.tsx              # Main dashboard routing, components, review queue and styling
│   │   └── index.css            # Tailwind directives and custom glassmorphism styles
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── vite.config.ts
├── SCOPE.md                     # Completed feature list
├── DECISIONS.md                 # System design and architecture explanations
├── AI_USAGE.md                  # Development attribution notes
└── commit_history.txt           # Detailed sample Git commit logs
```

---

## Setup & Running Instructions

### Prerequisites

- Node.js (v18+)
- A live PostgreSQL database connection string (e.g. Neon PostgreSQL, local Postgres, or Docker container).

### 1. Database & Environment Configuration

Create a `.env` file in the `backend/` folder:

```env
PORT=5000
DATABASE_URL="postgresql://username:password@hostname:5432/dbname?sslmode=require"
JWT_SECRET="super_secret_internship_assignment_jwt_key_998877"
```

### 2. Backend Installation & Migration

In the `backend/` directory:

```bash
# Install dependencies
npm install

# Run database migrations using Prisma
npx prisma migrate dev --name init

# Seed the database (creates Aisha, Rohan, Priya, Meera, Dev, Sam and setup dates)
npm run prisma:seed
```

### 3. Run Backend Server & Tests

In the `backend/` directory:

```bash
# Run unit tests to verify splits, currency conversion, settlements, and CSV parsing
npm run test

# Start Express in dev mode (runs on http://localhost:5000)
npm run dev
```

### 4. Frontend Installation & Dev Server

In the `frontend/` directory:

```bash
# Install dev dependencies
npm install

# Start Vite dev server (runs on http://localhost:5173)
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Demonstration Credentials

You can sign in with any of the seeded member accounts using the shared password:

- **Aisha**: `aisha@example.com` / `password123`
- **Rohan**: `rohan@example.com` / `password123`
- **Meera**: `meera@example.com` / `password123`
- **Sam**: `sam@example.com` / `password123`
