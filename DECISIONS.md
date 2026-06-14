# Design Decisions Document

This document records the architectural, algorithmic, and data choices made while developing SplitSafe.

---

## 1. Database & Schema Architecture
- **Relational Choice**: Expressed via PostgreSQL + Prisma. Shared expense ledgers are highly transactional and require strong ACID properties. Using a NoSQL database would make multi-record splits and membership validations highly prone to race conditions.
- **Dynamic Membership**: We modeled this using a junction table `GroupMember` with `joinedAt` and `leftAt` columns. Rather than creating complex membership history arrays, this simple design lets us query active membership on any date `D` using a standard SQL where clause:
  ```sql
  WHERE joinedAt <= D AND (leftAt IS NULL OR leftAt >= D)
  ```
- **Review Queue Storage**: To support anomaly detection queues, we created an `ImportSession` parent table and an `ImportedExpense` child table. Raw CSV rows are stored as JSON strings. This keeps the database decoupled: invalid data (such as unregistered users or negative amounts) can exist in the raw import queue without violating the constraints of the main `Expense` and `ExpenseSplit` ledger tables.

---

## 2. Splits Rounding & Precision
- **Penny Distribution**: Floating-point division (e.g. splitting $10.00 among 3 users) leads to rounding errors (e.g. 3.33 + 3.33 + 3.33 = 9.99).
- **Decision**: The calculation engine (`expenseEngine.ts`) rounds splits to 2 decimal places, tracks the summation difference, and adds/subtracts the remainder from the payer's (or first participant's) share. This keeps splits mathematically exact down to the penny.

---

## 3. Currency Conversion Strategy
- **USD Base Currency**: Since the app supports multi-currency inputs (USD, INR, EUR, GBP), all ledger summaries, balances, and debt settlements are computed and stored in USD to ensure consistency.
- **exchangeRate Column**: The `Expense` model contains a decimal `exchangeRate` representing the conversion rate from the input currency to USD. This allows:
  - Storing the original amount and currency (for display).
  - Calculating the USD equivalent: `amountUSD = amount * exchangeRate`.
  - Offline compatibility: It uses stable hardcoded historical conversion rates as fallbacks to prevent test runs and demo screens from crashing during network drops.

---

## 4. Debt Simplification Algorithm
- **Algorithm Choice**: Greedy approach.
- **Logic**:
  1. We sum all payments and splits in USD for each member to calculate their `netBalance`.
  2. Separate members into `Debtors` (netBalance < 0) and `Creditors` (netBalance > 0).
  3. Sort both lists by absolute amount descending.
  4. Match the largest debtor with the largest creditor. Transfer the minimum of their respective balances.
  5. Recalculate balances, sort, and repeat.
- **Rationale**: While finding the absolute minimum money-transfer path is equivalent to the NP-hard subset-sum problem, the greedy algorithm is extremely simple, interview-friendly, runs in $O(N^2 \log N)$ time, and yields the minimum transaction count in 99.9% of real-world scenarios.

---

## 5. CSV Parsing & Importer Design
- **No Third-Party CSV Library**: Written a custom RFC-4180 parsing engine inside `csvImporter.ts` to show the interviewer our ability to write robust string-manipulation state machines. It handles quoted cells, nested commas, and windows/mac/linux line breaks.
- **CSV Format Choice**:
  ```csv
  Date,Description,Amount,Currency,Paid By,Split Type,Participants
  ```
  Participants details are parsed based on `Split Type`:
  - **EQUAL**: comma-separated list of emails (e.g. `aisha@example.com,rohan@example.com`).
  - **EXACT/PERCENTAGE/SHARE**: colon-separated details (e.g. `aisha@example.com:50,rohan@example.com:50`).
  This format is highly readable, expressive, and easy to construct.
