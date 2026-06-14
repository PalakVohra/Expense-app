import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Create default users with hashed passwords
  const passwordHash = await bcrypt.hash("password123", 10);

  const usersData = [
    { name: "Aisha", email: "aisha@example.com" },
    { name: "Rohan", email: "rohan@example.com" },
    { name: "Priya", email: "priya@example.com" },
    { name: "Meera", email: "meera@example.com" },
    { name: "Dev", email: "dev@example.com" },
    { name: "Sam", email: "sam@example.com" },
  ];

  const users: Record<string, any> = {};

  for (const userData of usersData) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        name: userData.name,
        passwordHash,
      },
    });
    users[userData.name.toLowerCase()] = user;
    console.log(`Created/Ensured User: ${user.name} (${user.email})`);
  }

  // 2. Create the main internship project group
  const group = await prisma.group.create({
    data: {
      name: "Shared Roommates Expenses",
      description: "Group for tracking expenses between Aisha, Rohan, Priya, Meera, Dev, and Sam.",
    },
  });
  console.log(`Created Group: ${group.name} (${group.id})`);

  // 3. Create memberships with dynamic dates
  // Meera leaves at end of March 2026 (2026-03-31)
  // Sam joins mid-April 2026 (2026-04-15)
  // Others join early Jan 2026 (2026-01-01)
  const memberships = [
    {
      userId: users.aisha.id,
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      leftAt: null,
      role: "ADMIN",
    },
    {
      userId: users.rohan.id,
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      leftAt: null,
      role: "MEMBER",
    },
    {
      userId: users.priya.id,
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      leftAt: null,
      role: "MEMBER",
    },
    {
      userId: users.meera.id,
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      leftAt: new Date("2026-03-31T23:59:59.000Z"),
      role: "MEMBER",
    },
    {
      userId: users.dev.id,
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      leftAt: null,
      role: "MEMBER",
    },
    {
      userId: users.sam.id,
      joinedAt: new Date("2026-04-15T00:00:00.000Z"),
      leftAt: null,
      role: "MEMBER",
    },
  ];

  for (const m of memberships) {
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: m.userId,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        role: m.role,
      },
    });
  }
  console.log("Seeded group memberships with dynamic active date bounds.");

  // 4. Create some default historical expenses to make dashboard lively
  // Expense 1: Feb 15 (Active: Aisha, Rohan, Priya, Meera, Dev)
  // USD 100 paid by Aisha split equally
  const exp1 = await prisma.expense.create({
    data: {
      groupId: group.id,
      description: "Supermarket groceries",
      amount: 100,
      currency: "USD",
      exchangeRate: 1.0,
      paidById: users.aisha.id,
      date: new Date("2026-02-15T12:00:00.000Z"),
      splitType: "EQUAL",
      isSettlement: false,
    },
  });

  const activeFebUsers = [users.aisha, users.rohan, users.priya, users.meera, users.dev];
  for (const u of activeFebUsers) {
    await prisma.expenseSplit.create({
      data: {
        expenseId: exp1.id,
        userId: u.id,
        amount: 20, // 100 / 5
      },
    });
  }

  // Expense 2: April 25 (Active: Aisha, Rohan, Priya, Dev, Sam. Meera is gone!)
  // INR 8300 (USD 100) paid by Rohan split equally
  const exp2 = await prisma.expense.create({
    data: {
      groupId: group.id,
      description: "Fiber Internet bill",
      amount: 8300,
      currency: "INR",
      exchangeRate: 83.0,
      paidById: users.rohan.id,
      date: new Date("2026-04-25T15:00:00.000Z"),
      splitType: "EQUAL",
      isSettlement: false,
    },
  });

  const activeAprilUsers = [users.aisha, users.rohan, users.priya, users.dev, users.sam];
  for (const u of activeAprilUsers) {
    await prisma.expenseSplit.create({
      data: {
        expenseId: exp2.id,
        userId: u.id,
        amount: 1660, // 8300 / 5
      },
    });
  }

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
