/**
 * Balance Settlement Engine
 * Calculates net balances for group members and resolves debts using the
 * minimum transaction settlement algorithm (Greedy approach).
 */

export interface MemberBalance {
  userId: string;
  userName: string;
  email: string;
  totalPaid: number;  // In USD
  totalOwed: number;  // In USD
  netBalance: number; // netBalance = totalPaid - totalOwed
}

export interface SettlementTransaction {
  fromUserId: string;
  fromUserName: string;
  fromUserEmail: string;
  toUserId: string;
  toUserName: string;
  toUserEmail: string;
  amountUSD: number;
}

/**
 * Computes the minimum number of transactions needed to settle all debts.
 * @param balances Array of member balances (with netBalance populated)
 * @returns Array of transactions required to settle the group
 */
export function calculateSettlements(balances: MemberBalance[]): SettlementTransaction[] {
  // Separate into debtors (netBalance < 0) and creditors (netBalance > 0)
  const debtors = balances
    .filter((b) => b.netBalance < -0.009)
    .map((b) => ({ ...b, balance: Math.abs(b.netBalance) }))
    .sort((a, b) => b.balance - a.balance); // Sort descending

  const creditors = balances
    .filter((b) => b.netBalance > 0.009)
    .map((b) => ({ ...b, balance: b.netBalance }))
    .sort((a, b) => b.balance - a.balance); // Sort descending

  const transactions: SettlementTransaction[] = [];

  let i = 0; // Debtor index
  let j = 0; // Creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    // Settle the minimum of what debtor owes vs what creditor is owed
    const amountToSettle = Math.min(debtor.balance, creditor.balance);
    const roundedAmount = Math.round(amountToSettle * 100) / 100;

    if (roundedAmount > 0) {
      transactions.push({
        fromUserId: debtor.userId,
        fromUserName: debtor.userName,
        fromUserEmail: debtor.email,
        toUserId: creditor.userId,
        toUserName: creditor.userName,
        toUserEmail: creditor.email,
        amountUSD: roundedAmount,
      });
    }

    // Update balances
    debtor.balance = Math.round((debtor.balance - roundedAmount) * 100) / 100;
    creditor.balance = Math.round((creditor.balance - roundedAmount) * 100) / 100;

    // Move pointers if fully settled
    if (debtor.balance <= 0.009) {
      i++;
    }
    if (creditor.balance <= 0.009) {
      j++;
    }

    // Sort again if needed to ensure we always settle largest values (greedy strategy)
    // For smaller arrays, simple sorting at each step is extremely clean and reliable
    if (i < debtors.length) {
      debtors.slice(i).sort((a, b) => b.balance - a.balance);
    }
    if (j < creditors.length) {
      creditors.slice(j).sort((a, b) => b.balance - a.balance);
    }
  }

  return transactions;
}
