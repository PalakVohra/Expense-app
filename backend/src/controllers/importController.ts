import { Response } from "express";
import prisma from "../prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { parseCSVText, mapCSVToRows, detectAnomalies, CSVRow, Anomaly } from "../services/csvImporter";
import { calculateSplits } from "../services/expenseEngine";
import { convertToUSD } from "../services/currencyService";

export async function uploadCSV(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId } = req.params;
    const { csvText, filename } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized." });
    if (!csvText) return res.status(400).json({ error: "CSV text content is required." });

    const fileTitle = filename || `import_${new Date().toISOString().split("T")[0]}.csv`;

    // 1. Parse CSV
    let matrix: string[][];
    try {
      matrix = parseCSVText(csvText);
    } catch (err: any) {
      return res.status(400).json({ error: `CSV Parsing failed: ${err.message || err}` });
    }

    // 2. Map rows
    let rows: CSVRow[];
    try {
      rows = mapCSVToRows(matrix);
    } catch (err: any) {
      return res.status(400).json({ error: `CSV Layout invalid: ${err.message || err}` });
    }

    // 3. Create import session
    const session = await prisma.importSession.create({
      data: {
        groupId,
        importedById: userId,
        filename: fileTitle,
        status: "PENDING",
      },
    });

    let totalAnomalies = 0;

    // 4. Process each row, run anomalies, and save
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const anomalies = await detectAnomalies(row, groupId, prisma, rows, i);
      
      if (anomalies.length > 0) {
        totalAnomalies += anomalies.length;
      }

      // Parse splits information to structured JSON
      const participantTokens = row.participants.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
      const parsedSplits = participantTokens.map((token) => {
        if (token.includes(":")) {
          const [email, valStr] = token.split(":");
          return { email: email.trim().toLowerCase(), value: parseFloat(valStr) || 0 };
        }
        return { email: token.trim().toLowerCase() };
      });

      await prisma.importedExpense.create({
        data: {
          sessionId: session.id,
          rawRowData: JSON.stringify(row),
          description: row.description,
          amount: row.amount,
          currency: row.currency.toUpperCase(),
          paidByEmail: row.paidByEmail.trim().toLowerCase(),
          date: (() => {
  const parts = row.date.split("-");

  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;

    return new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd)
    );
  }

  return new Date(row.date);
})(),
          splitType: row.splitType.toUpperCase(),
          splitsData: JSON.stringify(parsedSplits),
          anomalies: JSON.stringify(anomalies),
          status: "PENDING_REVIEW",
        },
      });
    }

    return res.status(201).json({
      message: "CSV imported and queued for review.",
      sessionId: session.id,
      totalRows: rows.length,
      anomaliesCount: totalAnomalies,
    });
  } catch (err: any) {
    console.error("UploadCSV Error:", err);
    return res.status(500).json({ error: "Server error processing CSV upload." });
  }
}

export async function listImportSessions(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId } = req.params;
    const sessions = await prisma.importSession.findMany({
      where: { groupId },
      include: {
        importedBy: { select: { id: true, name: true } },
        _count: { select: { rows: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(sessions);
  } catch (err: any) {
    console.error("ListImportSessions Error:", err);
    return res.status(500).json({ error: "Server error fetching sessions." });
  }
}

export async function getSessionQueue(req: AuthenticatedRequest, res: Response) {
  try {
    const { sessionId } = req.params;
    const rows = await prisma.importedExpense.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    return res.json(rows);
  } catch (err: any) {
    console.error("GetSessionQueue Error:", err);
    return res.status(500).json({ error: "Server error fetching review queue." });
  }
}

export async function handleQueueAction(req: AuthenticatedRequest, res: Response) {
  try {
    const { rowId } = req.params;
    const { action, correctedData } = req.body; // action: 'approve' | 'reject' | 'correct'

    if (!action || !["approve", "reject", "correct"].includes(action)) {
      return res.status(400).json({ error: "Action must be 'approve', 'reject', or 'correct'." });
    }

    const importedRow = await prisma.importedExpense.findUnique({
      where: { id: rowId },
      include: { session: true },
    });

    if (!importedRow) {
      return res.status(404).json({ error: "Imported row not found." });
    }

    if (importedRow.status !== "PENDING_REVIEW") {
      return res.status(400).json({ error: `This row has already been resolved as ${importedRow.status}.` });
    }

    const groupId = importedRow.session.groupId;

    // 1. If reject, just update status
    if (action === "reject") {
      const updated = await prisma.importedExpense.update({
        where: { id: rowId },
        data: { status: "REJECTED" },
      });
      await checkAndCloseSession(importedRow.sessionId);
      return res.json(updated);
    }

    // 2. If approve or correct, compile final data and write to main Expense tables
    let finalDescription = importedRow.description;
    let finalAmount = Number(importedRow.amount);
    let finalCurrency = importedRow.currency;
    let finalDate = new Date(importedRow.date);
    let finalSplitType = importedRow.splitType;
    let finalSplits: { email: string; value?: number }[] = JSON.parse(importedRow.splitsData);

    if (action === "correct" && correctedData) {
      if (correctedData.description) finalDescription = correctedData.description;
      if (correctedData.amount) finalAmount = parseFloat(correctedData.amount);
      if (correctedData.currency) finalCurrency = correctedData.currency.toUpperCase();
      if (correctedData.date) finalDate = new Date(correctedData.date);
      if (correctedData.splitType) finalSplitType = correctedData.splitType.toUpperCase();
      if (correctedData.splits) finalSplits = correctedData.splits; // Array of { email, value }
    }

    // Verify all emails are members of the group and fetch user IDs
    const groupMembers = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
    });

    // Payer email
    let payerEmail = importedRow.paidByEmail;
    if (action === "correct" && correctedData?.paidByEmail) {
      payerEmail = correctedData.paidByEmail.trim().toLowerCase();
    }

    const payer = groupMembers.find((m) => m.user.email.toLowerCase() === payerEmail.toLowerCase());
    if (!payer) {
      return res.status(400).json({ error: `Payer with email '${payerEmail}' is not a active member of this group.` });
    }

    // Check dynamic bounds for payer
    if (finalDate < payer.joinedAt || (payer.leftAt && finalDate > payer.leftAt)) {
      return res.status(400).json({ error: `Payer was not an active member on ${finalDate.toISOString().split("T")[0]}.` });
    }

    // Participants
    const participantSplitsInput: { userId: string; value?: number }[] = [];
    for (const s of finalSplits) {
      const member = groupMembers.find((m) => m.user.email.toLowerCase() === s.email.toLowerCase());
      if (!member) {
        return res.status(400).json({ error: `Participant email '${s.email}' is not a member of this group.` });
      }
      
      // Check active dates for each participant
      if (finalDate < member.joinedAt || (member.leftAt && finalDate > member.leftAt)) {
        return res.status(400).json({
          error: `Participant '${member.user.name}' was not an active member on ${finalDate.toISOString().split("T")[0]}.`,
        });
      }

      participantSplitsInput.push({
        userId: member.userId,
        value: s.value,
      });
    }

    // Calculate splits math
    let finalCalculatedSplits;
    try {
      finalCalculatedSplits = calculateSplits(finalAmount, finalSplitType, participantSplitsInput);
    } catch (err: any) {
      return res.status(400).json({ error: `Split math error: ${err.message || err}` });
    }

    const rateToUSD = convertToUSD(1, finalCurrency);

    // Save actual expense inside a transaction
    const finalExpense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          groupId,
          description: finalDescription,
          amount: finalAmount,
          currency: finalCurrency,
          exchangeRate: rateToUSD,
          paidById: payer.userId,
          date: finalDate,
          splitType: finalSplitType,
          isSettlement: false,
        },
      });

      for (const split of finalCalculatedSplits) {
        await tx.expenseSplit.create({
          data: {
            expenseId: exp.id,
            userId: split.userId,
            amount: split.amount,
            percentage: split.percentage,
            share: split.share,
          },
        });
      }

      return exp;
    });

    // Mark imported row as approved/resolved
    const updated = await prisma.importedExpense.update({
      where: { id: rowId },
      data: {
        status: action === "correct" ? "RESOLVED" : "APPROVED",
        resolvedExpenseId: finalExpense.id,
        correctedData: action === "correct" ? JSON.stringify({
          description: finalDescription,
          amount: finalAmount,
          currency: finalCurrency,
          date: finalDate,
          splitType: finalSplitType,
          paidByEmail: payerEmail,
          splits: finalSplits,
        }) : null,
      },
    });

    await checkAndCloseSession(importedRow.sessionId);

    return res.json({
      message: "Expense successfully approved and imported into group ledger.",
      row: updated,
      expenseId: finalExpense.id,
    });
  } catch (err: any) {
    console.error("HandleQueueAction Error:", err);
    return res.status(500).json({ error: `Server error resolving imported row: ${err.message || err}` });
  }
}

export async function getSessionReport(req: AuthenticatedRequest, res: Response) {
  try {
    const { sessionId } = req.params;

    const session = await prisma.importSession.findUnique({
      where: { id: sessionId },
      include: {
        rows: {
          include: { resolvedExpense: true },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: "Import session not found." });
    }

    const totalRows = session.rows.length;
    const approvedRows = session.rows.filter((r) => r.status === "APPROVED" || r.status === "RESOLVED").length;
    const rejectedRows = session.rows.filter((r) => r.status === "REJECTED").length;
    const pendingRows = session.rows.filter((r) => r.status === "PENDING_REVIEW").length;

    let totalImportedUSD = 0;
    const anomalySummary: Record<string, number> = {};

    session.rows.forEach((r) => {
      // Calculate imported USD value
      if ((r.status === "APPROVED" || r.status === "RESOLVED") && r.resolvedExpense) {
        const rate = Number(r.resolvedExpense.exchangeRate);
        totalImportedUSD += Number(r.resolvedExpense.amount) * rate;
      }

      // Collect anomaly counts
      const anomaliesList: Anomaly[] = JSON.parse(r.anomalies || "[]");
      anomaliesList.forEach((a) => {
        anomalySummary[a.code] = (anomalySummary[a.code] || 0) + 1;
      });
    });

    return res.json({
      session: {
        id: session.id,
        filename: session.filename,
        status: session.status,
        createdAt: session.createdAt,
      },
      stats: {
        totalRows,
        approvedRows,
        rejectedRows,
        pendingRows,
        totalImportedUSD: Math.round(totalImportedUSD * 100) / 100,
      },
      anomaliesCount: anomalySummary,
    });
  } catch (err: any) {
    console.error("GetSessionReport Error:", err);
    return res.status(500).json({ error: "Server error generating session report." });
  }
}

/**
 * Helper: checks if all queue items in a session are completed/rejected,
 * and updates the session status to COMPLETED if so.
 */
async function checkAndCloseSession(sessionId: string) {
  const pendingCount = await prisma.importedExpense.count({
    where: {
      sessionId,
      status: "PENDING_REVIEW",
    },
  });

  if (pendingCount === 0) {
    await prisma.importSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED" },
    });
  }
}
