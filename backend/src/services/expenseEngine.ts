/**
 * Expense Calculation Engine
 * Calculates individual split shares for different split types:
 * - EQUAL: Splits total amount equally among participants.
 * - EXACT: Takes exact amounts for each participant. Sum must equal total.
 * - PERCENTAGE: Takes percentage shares. Sum must equal 100%.
 * - SHARE: Takes share ratios.
 * Also handles rounding adjustments to avoid losing pennies.
 */

export interface SplitInput {
  userId: string;
  value?: number; // Used for EXACT, PERCENTAGE, SHARE. Not needed for EQUAL.
}

export interface CalculatedSplit {
  userId: string;
  amount: number;      // Original currency amount
  percentage?: number;
  share?: number;
}

/**
 * Calculates individual split amounts from a total amount.
 * @param totalAmount Total expense amount.
 * @param splitType Split type (EQUAL, EXACT, PERCENTAGE, SHARE).
 * @param inputs Participant list and values.
 * @returns Array of calculated splits.
 */
export function calculateSplits(
  totalAmount: number,
  splitType: string,
  inputs: SplitInput[]
): CalculatedSplit[] {
  if (totalAmount <= 0) {
    throw new Error("Expense amount must be greater than zero.");
  }
  if (!inputs || inputs.length === 0) {
    throw new Error("At least one participant is required for splitting.");
  }

  const type = splitType.toUpperCase();
  const roundedTotal = Math.round(totalAmount * 100) / 100;

  switch (type) {
    case "EQUAL": {
      const count = inputs.length;
      const baseShare = Math.floor((roundedTotal / count) * 100) / 100;
      let sum = baseShare * count;
      let diff = Math.round((roundedTotal - sum) * 100) / 100;

      return inputs.map((input, index) => {
        // Distribute remainder (e.g. 0.01) to the first few participants
        let adjustment = 0;
        if (diff > 0) {
          adjustment = 0.01;
          diff = Math.round((diff - 0.01) * 100) / 100;
        }
        return {
          userId: input.userId,
          amount: Math.round((baseShare + adjustment) * 100) / 100,
        };
      });
    }

    case "EXACT": {
      let sum = 0;
      const splits = inputs.map((input) => {
        const amt = Math.round((input.value || 0) * 100) / 100;
        sum += amt;
        return {
          userId: input.userId,
          amount: amt,
        };
      });

      const roundedSum = Math.round(sum * 100) / 100;
      if (Math.abs(roundedSum - roundedTotal) > 0.001) {
        throw new Error(`Sum of exact splits (${roundedSum}) does not equal total amount (${roundedTotal}).`);
      }

      return splits;
    }

    case "PERCENTAGE": {
      let percentSum = 0;
      inputs.forEach((input) => {
        percentSum += input.value || 0;
      });

      if (Math.abs(percentSum - 100) > 0.01) {
        throw new Error(`Sum of percentages (${percentSum}%) must equal exactly 100%.`);
      }

      let distributedAmount = 0;
      const splits = inputs.map((input) => {
        const pct = input.value || 0;
        const amt = Math.floor(((roundedTotal * pct) / 100) * 100) / 100;
        distributedAmount += amt;
        return {
          userId: input.userId,
          amount: amt,
          percentage: pct,
        };
      });

      // Distribute rounding difference
      let diff = Math.round((roundedTotal - distributedAmount) * 100) / 100;
      if (diff !== 0 && splits.length > 0) {
        // Add rounding difference to the participant with the largest percentage to minimize impact
        const sortedIndex = inputs
          .map((inp, idx) => ({ val: inp.value || 0, idx }))
          .sort((a, b) => b.val - a.val)[0].idx;
        splits[sortedIndex].amount = Math.round((splits[sortedIndex].amount + diff) * 100) / 100;
      }

      return splits;
    }

    case "SHARE": {
      let totalShares = 0;
      inputs.forEach((input) => {
        totalShares += input.value || 0;
      });

      if (totalShares <= 0) {
        throw new Error("Total share count must be greater than zero.");
      }

      let distributedAmount = 0;
      const splits = inputs.map((input) => {
        const share = input.value || 0;
        const amt = Math.floor(((roundedTotal * share) / totalShares) * 100) / 100;
        distributedAmount += amt;
        return {
          userId: input.userId,
          amount: amt,
          share: share,
        };
      });

      // Distribute rounding difference
      let diff = Math.round((roundedTotal - distributedAmount) * 100) / 100;
      if (diff !== 0 && splits.length > 0) {
        // Add rounding difference to the participant with the largest share count
        const sortedIndex = inputs
          .map((inp, idx) => ({ val: inp.value || 0, idx }))
          .sort((a, b) => b.val - a.val)[0].idx;
        splits[sortedIndex].amount = Math.round((splits[sortedIndex].amount + diff) * 100) / 100;
      }

      return splits;
    }

    default:
      throw new Error(`Unsupported split type: ${splitType}`);
  }
}
