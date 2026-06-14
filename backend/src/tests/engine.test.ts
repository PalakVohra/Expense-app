import { getExchangeRate, convertToUSD } from "../services/currencyService";
import { calculateSplits } from "../services/expenseEngine";
import { calculateSettlements, MemberBalance } from "../services/settlementEngine";
import { parseCSVText, mapCSVToRows } from "../services/csvImporter";

let totalTests = 0;
let passedTests = 0;

function describe(name: string, fn: () => void) {
  console.log(`\n=== Running: ${name} ===`);
  fn();
}

function it(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASSED: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ FAILED: ${name}`);
    console.error(`    Error: ${err.message || err}`);
  }
}

function assertEquals(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(
      `${message ? message + " - " : ""}Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`
    );
  }
}

function assertNear(actual: number, expected: number, tolerance = 0.005, message?: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${message ? message + " - " : ""}Expected: ~${expected}, Got: ${actual} (outside tolerance ${tolerance})`
    );
  }
}

// ==========================================
// 1. Currency Service Tests
// ==========================================
describe("Currency Service Tests", () => {
  it("converts USD to INR correctly (base conversion)", () => {
    // 1 USD = 83 INR
    const rate = getExchangeRate("USD", "INR");
    assertEquals(rate, 83.0);
  });

  it("converts INR to USD correctly", () => {
    const usd = convertToUSD(8300, "INR");
    assertEquals(usd, 100.0);
  });
});

// ==========================================
// 2. Expense Splits Engine Tests
// ==========================================
describe("Expense Splits Engine Tests", () => {
  it("splits equally among 3 members and handles rounding remainder", () => {
    const splits = calculateSplits(10, "EQUAL", [
      { userId: "user-1" },
      { userId: "user-2" },
      { userId: "user-3" },
    ]);
    
    assertEquals(splits.length, 3);
    // 10 / 3 = 3.33 + 3.33 + 3.34
    // Payer/first person gets 3.34
    assertEquals(splits[0].amount, 3.34);
    assertEquals(splits[1].amount, 3.33);
    assertEquals(splits[2].amount, 3.33);
    
    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    assertEquals(sum, 10.0);
  });

  it("validates exact splits equal total amount", () => {
    const splits = calculateSplits(100, "EXACT", [
      { userId: "user-1", value: 30 },
      { userId: "user-2", value: 70 },
    ]);
    assertEquals(splits[0].amount, 30);
    assertEquals(splits[1].amount, 70);
  });

  it("throws error if exact split sums do not equal total", () => {
    try {
      calculateSplits(100, "EXACT", [
        { userId: "user-1", value: 30 },
        { userId: "user-2", value: 50 },
      ]);
      throw new Error("Should have thrown error");
    } catch (err: any) {
      assertEquals(err.message.includes("Sum of exact splits"), true);
    }
  });

  it("calculates percentage splits and handles remainder", () => {
    const splits = calculateSplits(100, "PERCENTAGE", [
      { userId: "user-1", value: 33.33 },
      { userId: "user-2", value: 33.33 },
      { userId: "user-3", value: 33.34 },
    ]);
    
    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    assertEquals(sum, 100);
    assertEquals(splits[2].amount, 33.34);
  });
});

// ==========================================
// 3. Settlement Engine Tests
// ==========================================
describe("Settlement Optimization Tests", () => {
  it("simplifies debt transfers using minimum transactions (3 users)", () => {
    // Aisha paid 100 USD
    // Rohan owes 50 USD, Priya owes 50 USD
    const balances: MemberBalance[] = [
      {
        userId: "aisha-id",
        userName: "Aisha",
        email: "aisha@example.com",
        totalPaid: 100,
        totalOwed: 0,
        netBalance: 100, // Creditor
      },
      {
        userId: "rohan-id",
        userName: "Rohan",
        email: "rohan@example.com",
        totalPaid: 0,
        totalOwed: 50,
        netBalance: -50, // Debtor
      },
      {
        userId: "priya-id",
        userName: "Priya",
        email: "priya@example.com",
        totalPaid: 0,
        totalOwed: 50,
        netBalance: -50, // Debtor
      },
    ];

    const settlements = calculateSettlements(balances);
    assertEquals(settlements.length, 2);
    
    // Rohan pays 50 to Aisha
    // Priya pays 50 to Aisha
    const tx1 = settlements.find((s) => s.fromUserId === "rohan-id");
    const tx2 = settlements.find((s) => s.fromUserId === "priya-id");
    
    assertEquals(tx1?.toUserId, "aisha-id");
    assertEquals(tx1?.amountUSD, 50);
    assertEquals(tx2?.toUserId, "aisha-id");
    assertEquals(tx2?.amountUSD, 50);
  });

  it("handles complex circular debt optimization", () => {
    // A owes B 10, B owes C 10, C owes A 10
    // Net balances are all 0 -> should return 0 transactions
    const balances: MemberBalance[] = [
      { userId: "A", userName: "A", email: "a@ex.com", totalPaid: 10, totalOwed: 10, netBalance: 0 },
      { userId: "B", userName: "B", email: "b@ex.com", totalPaid: 10, totalOwed: 10, netBalance: 0 },
      { userId: "C", userName: "C", email: "c@ex.com", totalPaid: 10, totalOwed: 10, netBalance: 0 },
    ];
    const settlements = calculateSettlements(balances);
    assertEquals(settlements.length, 0);
  });
});

// ==========================================
// 4. CSV Importer Tests
// ==========================================
describe("CSV Importer Parser Tests", () => {
  it("parses standard RFC-4180 csv data, including quoted cells and commas", () => {
    const csvContent = 
      `Date,Description,Amount,Currency,Paid By,Split Type,Participants\n` +
      `2026-03-10,"Dinner, sushi",120.00,USD,aisha@example.com,EQUAL,"rohan@example.com,priya@example.com"\n`;
      
    const parsed = parseCSVText(csvContent);
    assertEquals(parsed.length, 2);
    
    const rows = mapCSVToRows(parsed);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].description, "Dinner, sushi");
    assertEquals(rows[0].amount, 120.00);
    assertEquals(rows[0].participants, "rohan@example.com,priya@example.com");
  });
});

// Print test report
console.log(`\n==========================================`);
console.log(`Test Execution Finished!`);
console.log(`Passed: ${passedTests} / ${totalTests}`);
console.log(`==========================================`);
if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
