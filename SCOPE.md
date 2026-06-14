# Scope Document

This document defines the scope of features implemented for the Shared Expenses App (SplitSafe) software engineering internship assignment.

---

## Implemented Features

### 1. User Authentication & Authorization
- [x] JWT-based Authentication
- [x] Password hashing with bcrypt
- [x] Registration and login screens
- [x] Client session management via local storage

### 2. Group Management
- [x] Create and view expense-sharing groups
- [x] List group members with joined and left dates
- [x] Member roles (ADMIN, MEMBER)

### 3. Dynamic Membership Boundaries
- [x] Custom dates for user membership duration
- [x] AISHA, ROHAN, PRIYA, MEERA, DEV, SAM seed data
- [x] Meera leaves March 31, 2026; Sam joins April 15, 2026
- [x] API verification blocks expense splits for inactive members on expense date
- [x] Front-end date picker dynamically filters splits to active members

### 4. Advanced Splits Math Engine
- [x] **Equal splits** (remainder distributed to payer)
- [x] **Exact splits** (individual values, sum check)
- [x] **Percentage splits** (percentage values, 100% check, remainder correction)
- [x] **Share splits** (share weights, relative distribution)

### 5. Balances & Settlements Engine
- [x] Real-time net balance calculations (USD)
- [x] Conversion of non-USD entries to base (USD)
- [x] Direct payment logging (User-to-User settlement entries)
- [x] **Greedy Debt Simplification**: simplified settlement pathway visual display

### 6. CSV Importer & Anomaly Check Queue
- [x] Custom RFC-4180 CSV parser (handles commas inside quotes, line breaks)
- [x] Anomaly flags:
  - `NEGATIVE_AMOUNT`: Negative/zero amounts
  - `DUPLICATE_EXPENSE`: Database or session duplicate detection
  - `MISTAKEN_SETTLEMENT`: Settlement-like keywords or single-recipient splits
  - `INACTIVE_MEMBER`: Date boundary violations for members
  - `INVALID_SPLIT`: Split percentage/amount math errors
  - `UNKNOWN_USER`: Unregistered user checks
- [x] **Anomaly Review Queue**: UI pane to Approve, Reject, or Correct rows manually
- [x] **Import Report**: Aggregated metrics sheet for imported sessions

---

## Out of Scope / Future Improvements
- SMS/Email notifications when a user adds an expense.
- Automatic live currency rates via external API integrations (currently uses offline fallback cache for robustness and offline live coding demos).
- Recurring/Subscription expense scheduler.
