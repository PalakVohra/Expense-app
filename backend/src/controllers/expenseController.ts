import { Request, Response } from "express";
import prisma from "../prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { calculateSplits, SplitInput } from "../services/expenseEngine";
import { convertToUSD, getExchangeRate } from "../services/currencyService";
import { calculateSettlements, MemberBalance } from "../services/settlementEngine";

export async function listExpenses(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId } = req.params;
    
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        splits: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { date: "desc" },
    });

    return res.json(expenses);
  } catch (err: any) {
    console.error("ListExpenses Error:", err);
    return res.status(500).json({ error: "Server error listing expenses." });
  }
}

export async function createExpense(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId } = req.params;
    const { description, amount, currency, paidById, date, splitType, participants } = req.body;

    if (!description || !amount || !currency || !paidById || !date || !splitType || !participants || participants.length === 0) {
      return res.status(400).json({ error: "All expense fields and splits are required." });
    }

    const expDate = new Date(date);

    // 1. Fetch group members with active periods
    const groupMembers = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
    });

    // 2. Validate payer active period
    const payerMember = groupMembers.find((m) => m.userId === paidById);
    if (!payerMember) {
      return res.status(400).json({ error: "Payer is not a member of this group." });
    }
    if (expDate < payerMember.joinedAt) {
      return res.status(400).json({
        error: `Payer '${payerMember.user.name}' joined group on ${payerMember.joinedAt.toISOString().split("T")[0]}, but expense date is ${date}.`,
      });
    }
    if (payerMember.leftAt && expDate > payerMember.leftAt) {
      return res.status(400).json({
        error: `Payer '${payerMember.user.name}' left group on ${payerMember.leftAt.toISOString().split("T")[0]}, but expense date is ${date}.`,
      });
    }

    // 3. Validate participants active periods
    for (const p of participants) {
      const pMember = groupMembers.find((m) => m.userId === p.userId);
      if (!pMember) {
        return res.status(400).json({ error: `Participant with ID ${p.userId} is not a member of this group.` });
      }
      if (expDate < pMember.joinedAt) {
        return res.status(400).json({
          error: `Participant '${pMember.user.name}' joined group on ${pMember.joinedAt.toISOString().split("T")[0]}, but expense date is ${date}.`,
        });
      }
      if (pMember.leftAt && expDate > pMember.leftAt) {
        return res.status(400).json({
          error: `Participant '${pMember.user.name}' left group on ${pMember.leftAt.toISOString().split("T")[0]}, but expense date is ${date}.`,
        });
      }
    }

    // 4. Calculate splits
    let calculatedSplits;
    try {
      calculatedSplits = calculateSplits(amount, splitType, participants);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || err });
    }

    // Calculate exchangeRate: base is USD.
    // We want: amountInUSD = amount * exchangeRate
    // currencyService has conversion. Rate = convertToUSD(1, currency)
    const rateToUSD = convertToUSD(1, currency);

    // 5. Save in database using transaction
    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          groupId,
          description,
          amount,
          currency: currency.toUpperCase(),
          exchangeRate: rateToUSD,
          paidById,
          date: expDate,
          splitType: splitType.toUpperCase(),
          isSettlement: false,
        },
      });

      for (const split of calculatedSplits) {
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

    return res.status(201).json(expense);
  } catch (err: any) {
    console.error("CreateExpense Error:", err);
    return res.status(500).json({ error: "Server error creating expense." });
  }
}

export async function getGroupBalances(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId } = req.params;

    // 1. Fetch all group members
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // 2. Fetch all expenses and payments with their splits
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        splits: true,
      },
    });

    // Initialize balance maps
    const balanceMap: Record<string, MemberBalance> = {};
    for (const m of members) {
      balanceMap[m.userId] = {
        userId: m.userId,
        userName: m.user.name,
        email: m.user.email,
        totalPaid: 0,
        totalOwed: 0,
        netBalance: 0,
      };
    }

    // Aggregate paid and owed amounts in USD
    for (const exp of expenses) {
      const rate = Number(exp.exchangeRate);
      const amountUSD = Number(exp.amount) * rate;

      // Add to payer
      if (balanceMap[exp.paidById]) {
        balanceMap[exp.paidById].totalPaid += amountUSD;
      }

      // Add to splits participants
      for (const split of exp.splits) {
        const splitUSD = Number(split.amount) * rate;
        if (balanceMap[split.userId]) {
          balanceMap[split.userId].totalOwed += splitUSD;
        }
      }
    }

    // Compute net balance and round
    const balances = Object.values(balanceMap).map((b) => {
      b.totalPaid = Math.round(b.totalPaid * 100) / 100;
      b.totalOwed = Math.round(b.totalOwed * 100) / 100;
      b.netBalance = Math.round((b.totalPaid - b.totalOwed) * 100) / 100;
      return b;
    });

    // Solve for minimum transaction settle-paths
    const settlements = calculateSettlements(balances);

    return res.json({
      balances,
      settlements,
    });
  } catch (err: any) {
    console.error("GetGroupBalances Error:", err);
    return res.status(500).json({ error: "Server error calculating balances." });
  }
}

export async function recordSettlement(req: AuthenticatedRequest, res: Response) {
  try {
    const { groupId } = req.params;
    const { senderId, receiverId, amount, currency, date } = req.body;

    if (!senderId || !receiverId || !amount || !currency || !date) {
      return res.status(400).json({ error: "Sender, receiver, amount, currency and date are required." });
    }

    const payDate = new Date(date);
    
    // Fetch sender and receiver names
    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });

    if (!sender || !receiver) {
      return res.status(400).json({ error: "Sender or receiver user not found." });
    }

    const rateToUSD = convertToUSD(1, currency);

    // Record payment as an Expense with isSettlement: true
    const settlement = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          groupId,
          description: `Settlement: ${sender.name} paid ${receiver.name}`,
          amount,
          currency: currency.toUpperCase(),
          exchangeRate: rateToUSD,
          paidById: senderId, // Paid by sender
          date: payDate,
          splitType: "EXACT",
          isSettlement: true,
        },
      });

      // Split goes entirely to the receiver
      await tx.expenseSplit.create({
        data: {
          expenseId: exp.id,
          userId: receiverId, // Receiver owes the negative equivalent (which credits them)
          amount,
        },
      });

      return exp;
    });

    return res.status(201).json(settlement);
  } catch (err: any) {
    console.error("RecordSettlement Error:", err);
    return res.status(500).json({ error: "Server error recording settlement." });
  }
}
