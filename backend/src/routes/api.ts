import { Router } from "express";
import { register, login, getProfile } from "../controllers/authController";
import { authenticateToken } from "../middleware/auth";
import {
  listGroups,
  createGroup,
  getGroupDetails,
  addGroupMember,
  updateGroupMember,
  deleteGroupMember,
} from "../controllers/groupController";
import {
  listExpenses,
  createExpense,
  getGroupBalances,
  recordSettlement,
} from "../controllers/expenseController";
import {
  uploadCSV,
  listImportSessions,
  getSessionQueue,
  handleQueueAction,
  getSessionReport,
} from "../controllers/importController";

const router = Router();

// --- Auth Routes ---
router.post("/auth/register", register);
router.post("/auth/login", login);
router.get("/auth/me", authenticateToken, getProfile);

// --- Group Routes ---
router.get("/groups", authenticateToken, listGroups);
router.post("/groups", authenticateToken, createGroup);
router.get("/groups/:groupId", authenticateToken, getGroupDetails);
router.post("/groups/:groupId/members", authenticateToken, addGroupMember);
router.put("/groups/:groupId/members/:memberId", authenticateToken, updateGroupMember);
router.delete("/groups/:groupId/members/:memberId", authenticateToken, deleteGroupMember);

// --- Expense & Balance Routes ---
router.get("/groups/:groupId/expenses", authenticateToken, listExpenses);
router.post("/groups/:groupId/expenses", authenticateToken, createExpense);
router.get("/groups/:groupId/balances", authenticateToken, getGroupBalances);
router.post("/groups/:groupId/settle", authenticateToken, recordSettlement);

// --- CSV Import Routes ---
router.post("/groups/:groupId/imports/upload", authenticateToken, uploadCSV);
router.get("/groups/:groupId/imports/sessions", authenticateToken, listImportSessions);
router.get("/groups/:groupId/imports/sessions/:sessionId/queue", authenticateToken, getSessionQueue);
router.post("/groups/:groupId/imports/queue/:rowId/action", authenticateToken, handleQueueAction);
router.get("/groups/:groupId/imports/sessions/:sessionId/report", authenticateToken, getSessionReport);

export default router;
