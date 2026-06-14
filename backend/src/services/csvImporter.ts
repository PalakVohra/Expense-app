import { PrismaClient } from "@prisma/client";
import { calculateSplits } from "./expenseEngine";

export interface CSVRow {
  date: string;
  description: string;
  amount: number;
  currency: string;
  paidByEmail: string;
  splitType: string;
  participants: string; // "email1:value,email2:value" or "email1,email2"
}

export interface Anomaly {
  code: "NEGATIVE_AMOUNT" | "DUPLICATE_EXPENSE" | "MISTAKEN_SETTLEMENT" | "INACTIVE_MEMBER" | "INVALID_SPLIT" | "UNKNOWN_USER";
  message: string;
  severity: "ERROR" | "WARNING";
}

/**
 * Custom robust RFC-4180 compliant CSV parser.
 * Handles quoted fields, commas inside quotes, and line breaks.
 */
export function parseCSVText(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // Skip the second quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      row.push(currentVal.trim());
      // Skip empty lines
      if (row.length > 0 && !(row.length === 1 && row[0] === "")) {
        result.push(row);
      }
      row = [];
      currentVal = "";
    } else {
      currentVal += char;
    }
  }
  
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    if (row.length > 0 && !(row.length === 1 && row[0] === "")) {
      result.push(row);
    }
  }
  
  return result;
}

/**
 * Parses raw CSV matrix into structured objects.
 */
export function mapCSVToRows(matrix: string[][]): CSVRow[] {
  if (matrix.length < 2) {
    throw new Error("CSV must contain a header row and at least one data row.");
  }

  const headers = matrix[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  
  // Find column indices
  const dateIdx = headers.findIndex((h) => h.includes("date"));
  const descIdx = headers.findIndex((h) => h.includes("desc"));
  const amountIdx = headers.findIndex((h) => h.includes("amt") || h.includes("amount"));
  const currencyIdx = headers.findIndex((h) => h.includes("curr"));
  const paidByIdx = headers.findIndex((h) => h.includes("paidby") || h.includes("payer") || h.includes("who"));
  const splitTypeIdx = headers.findIndex((h) => h.includes("splittype") || h.includes("splitmethod"));
  const partIdx = headers.findIndex((h) => h.includes("part") || h.includes("member") || h.includes("whoowes"));

  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1 || paidByIdx === -1 || splitTypeIdx === -1) {
    throw new Error("CSV headers must contain 'Date', 'Description', 'Amount', 'Paid By', and 'Split Type'.");
  }

  const rows: CSVRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (row.length < 5) continue; // Skip malformed rows
    console.log("CURRENT ROW =", row);
console.log("PARTICIPANTS CELL =", partIdx !== -1 ? row[partIdx] : "NOT FOUND");
    rows.push({
      date: row[dateIdx] || "",
      description: row[descIdx] || "",
      amount: parseFloat(row[amountIdx] || "0") || 0,
      currency: (currencyIdx !== -1 ? row[currencyIdx] : "USD") || "USD",
      paidByEmail: row[paidByIdx] || "",
      splitType: row[splitTypeIdx] || "EQUAL",
     participants:
  row[6] ||
  row[7] ||
  (partIdx !== -1 ? row[partIdx] : "") ||
  "", 
    });
    console.log({
  date: row[dateIdx],
  description: row[descIdx],
  amount: row[amountIdx],
  paidBy: row[paidByIdx],
  splitType: row[splitTypeIdx],
  participants: partIdx !== -1 ? row[partIdx] : "NOT_FOUND"
});
  }

  return rows;
}

/**
 * Analyzes a row for anomalies against the database and current session state.
 */
export async function detectAnomalies(
  row: CSVRow,
  groupId: string,
  prisma: PrismaClient,
  allRowsInSession: CSVRow[],
  currentIndex: number
): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];
  let expDate: Date;

const parts = row.date.split("-");

if (parts.length === 3) {
  const [dd, mm, yyyy] = parts;

  expDate = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd)
  );
} else {
  expDate = new Date(row.date);
}

if (isNaN(expDate.getTime())) {
  anomalies.push({
    code: "INVALID_SPLIT",
    message: `Invalid date format: ${row.date}`,
    severity: "ERROR",
  });

  return anomalies;
}

  // 1. Detect negative or zero amount
  if (row.amount <= 0) {
    anomalies.push({
      code: "NEGATIVE_AMOUNT",
      message: `Expense amount must be greater than zero. Found: ${row.amount}`,
      severity: "ERROR",
    });
  }

  // 2. Fetch all registered users in group
  const groupMembers = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true },
  });

  const memberEmails = groupMembers.map((m) => m.user.email.toLowerCase());
  const payerEmail = row.paidByEmail.toLowerCase().trim();

  // Find payer member record
  const payerMember = groupMembers.find((m) => m.user.email.toLowerCase() === payerEmail);

  if (!payerMember) {
    anomalies.push({
      code: "UNKNOWN_USER",
      message: `Payer email '${row.paidByEmail}' is not a member of this group.`,
      severity: "ERROR",
    });
  } else {
    // Check dynamic membership bounds for payer
    if (expDate < payerMember.joinedAt) {
      anomalies.push({
        code: "INACTIVE_MEMBER",
        message: `Payer '${row.paidByEmail}' joined group on ${payerMember.joinedAt.toISOString().split("T")[0]}, but expense date is ${row.date}.`,
        severity: "ERROR",
      });
    }
    if (payerMember.leftAt && expDate > payerMember.leftAt) {
      anomalies.push({
        code: "INACTIVE_MEMBER",
        message: `Payer '${row.paidByEmail}' left group on ${payerMember.leftAt.toISOString().split("T")[0]}, but expense date is ${row.date}.`,
        severity: "ERROR",
      });
    }
  }

  // Parse participants and their splits
  // Expected formats: "email1:val,email2:val" or "email1,email2"
  const participantTokens = row.participants
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const splits: { email: string; value?: number }[] = [];
  const participantEmails: string[] = [];

  for (const token of participantTokens) {
    if (token.includes(":")) {
      const [email, valStr] = token.split(":");
      const val = parseFloat(valStr);
      splits.push({ email: email.trim().toLowerCase(), value: isNaN(val) ? undefined : val });
      participantEmails.push(email.trim().toLowerCase());
    } else {
      splits.push({ email: token.trim().toLowerCase() });
      participantEmails.push(token.trim().toLowerCase());
    }
  }

  // Verify all participants are group members and active on the transaction date
  for (const email of participantEmails) {
    const member = groupMembers.find((m) => m.user.email.toLowerCase() === email);
    if (!member) {
      anomalies.push({
        code: "UNKNOWN_USER",
        message: `Participant '${email}' is not a member of this group.`,
        severity: "ERROR",
      });
    } else {
      if (expDate < member.joinedAt) {
        anomalies.push({
          code: "INACTIVE_MEMBER",
          message: `Participant '${email}' joined group on ${member.joinedAt.toISOString().split("T")[0]}, but expense date is ${row.date}.`,
          severity: "ERROR",
        });
      }
      if (member.leftAt && expDate > member.leftAt) {
        anomalies.push({
          code: "INACTIVE_MEMBER",
          message: `Participant '${email}' left group on ${member.leftAt.toISOString().split("T")[0]}, but expense date is ${row.date}.`,
          severity: "ERROR",
        });
      }
    }
  }

  // 3. Detect split errors (validity of split inputs)
  if (participantTokens.length > 0 && anomalies.filter(a => a.code === "UNKNOWN_USER" || a.code === "INACTIVE_MEMBER").length === 0) {
    try {
      const mockInputs = splits.map((s, index) => ({
        userId: s.email, // Use email as mock userId for validation
        value: s.value,
      }));
      // Test the calculation logic
      calculateSplits(row.amount, row.splitType, mockInputs);
    } catch (err: any) {
      anomalies.push({
        code: "INVALID_SPLIT",
        message: `Split math error: ${err.message || err}`,
        severity: "ERROR",
      });
    }
  } else if (participantTokens.length === 0) {
    anomalies.push({
      code: "INVALID_SPLIT",
      message: "No split participants provided in CSV.",
      severity: "ERROR",
    });
  }

  // 4. Detect duplicate expenses
  // Check against database
  const dbDuplicate = await prisma.expense.findFirst({
  where: {
    groupId,
    description: { equals: row.description },
    amount: row.amount,
    date: expDate,
    paidBy: {
      email: {
        equals: row.paidByEmail
      }
    },
    isSettlement: false,
  },
});

  if (dbDuplicate) {
    anomalies.push({
      code: "DUPLICATE_EXPENSE",
      message: `An expense with description '${row.description}', amount ${row.amount}, date ${row.date}, and payer '${row.paidByEmail}' already exists in the database.`,
      severity: "WARNING",
    });
  }

  // Check against other rows in the CSV session
  const csvDuplicateIndex = allRowsInSession.findIndex(
    (r, idx) =>
      idx !== currentIndex &&
      r.description.toLowerCase().trim() === row.description.toLowerCase().trim() &&
      r.amount === row.amount &&
      r.date === row.date &&
      r.paidByEmail.toLowerCase().trim() === row.paidByEmail.toLowerCase().trim()
  );

  if (csvDuplicateIndex !== -1 && currentIndex > csvDuplicateIndex) {
    anomalies.push({
      code: "DUPLICATE_EXPENSE",
      message: `Row matches CSV row #${csvDuplicateIndex + 1} (duplicate inside the uploaded file).`,
      severity: "WARNING",
    });
  }

  // 5. Detect settlement entries logged as expenses
  const lowerDesc = row.description.toLowerCase();
  const settlementKeywords = ["settle", "payment", "repay", "repayment", "paid back", "settled", "transfer"];
  const isSettlementKeyword = settlementKeywords.some((word) => lowerDesc.includes(word));
  
  if (isSettlementKeyword) {
    anomalies.push({
      code: "MISTAKEN_SETTLEMENT",
      message: `Description contains settlement keyword. This entry might be a debt settlement instead of a standard expense.`,
      severity: "WARNING",
    });
  } else if (participantEmails.length === 1 && participantEmails[0] === payerEmail) {
    anomalies.push({
      code: "MISTAKEN_SETTLEMENT",
      message: `Expense is paid by '${row.paidByEmail}' and split only with themselves. This might be a mistake or settlement.`,
      severity: "WARNING",
    });
  }

  return anomalies;
}
