import React, { useState, useEffect } from "react";
import {
  Users,
  DollarSign,
  Plus,
  ArrowRight,
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit,
  User,
  LogOut,
  TrendingUp,
  FileText,
  Calendar,
  Layers,
  ChevronRight,
  Info,
  Check,
  X,
  AlertCircle
} from "lucide-react";

// Types
interface UserInfo {
  id: string;
  email: string;
  name: string;
}

interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  joinedAt: string;
  leftAt: string | null;
  role: string;
  user: UserInfo;
}

interface ExpenseSplit {
  id: string;
  expenseId: string;
  userId: string;
  amount: string;
  percentage: string | null;
  share: string | null;
  user: UserInfo;
}

interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: string;
  currency: string;
  exchangeRate: string;
  paidById: string;
  date: string;
  splitType: string;
  isSettlement: boolean;
  paidBy: UserInfo;
  splits: ExpenseSplit[];
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  members: GroupMember[];
  expenses: Expense[];
}

interface MemberBalance {
  userId: string;
  userName: string;
  email: string;
  totalPaid: number;
  totalOwed: number;
  netBalance: number;
}

interface SettlementTransaction {
  fromUserId: string;
  fromUserName: string;
  fromUserEmail: string;
  toUserId: string;
  toUserName: string;
  toUserEmail: string;
  amountUSD: number;
}

interface ImportedExpense {
  id: string;
  sessionId: string;
  rawRowData: string;
  description: string;
  amount: string;
  currency: string;
  paidByEmail: string;
  date: string;
  splitType: string;
  splitsData: string; // JSON array of {email, value}
  anomalies: string;  // JSON array of Anomaly
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "RESOLVED";
  correctedData: string | null;
}

interface Anomaly {
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

interface ImportSession {
  id: string;
  filename: string;
  status: string;
  createdAt: string;
  importedBy?: { name: string };
  _count?: { rows: number };
}

const API_BASE = "http://localhost:5000/api";

export default function App() {
  // Navigation & Auth State
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<UserInfo | null>(null);
  const [view, setView] = useState<"login" | "register" | "dashboard" | "group-detail" | "csv-review" | "import-report">("login");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Application Data States
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [settlements, setSettlements] = useState<SettlementTransaction[]>([]);
  
  // Modals & Popups
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberJoinDate, setNewMemberJoinDate] = useState("2026-01-01");
  const [newMemberLeaveDate, setNewMemberLeaveDate] = useState("");

  const [showEditMember, setShowEditMember] = useState<GroupMember | null>(null);
  const [editMemberJoinDate, setEditMemberJoinDate] = useState("");
  const [editMemberLeaveDate, setEditMemberLeaveDate] = useState("");

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expCurrency, setExpCurrency] = useState("USD");
  const [expDate, setExpDate] = useState(new Date().toISOString().split("T")[0]);
  const [expPaidBy, setExpPaidBy] = useState("");
  const [expSplitType, setExpSplitType] = useState("EQUAL");
  const [expSplits, setExpSplits] = useState<{ userId: string; email: string; name: string; value: string }[]>([]);

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleSender, setSettleSender] = useState("");
  const [settleReceiver, setSettleReceiver] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleCurrency, setSettleCurrency] = useState("USD");
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split("T")[0]);

  // CSV Importer State
  const [csvText, setCsvText] = useState("");
  const [csvFilename, setCsvFilename] = useState("");
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ImportedExpense[]>([]);
  
  // Correction modal
  const [editQueueRow, setEditQueueRow] = useState<ImportedExpense | null>(null);
  const [corrDesc, setCorrDesc] = useState("");
  const [corrAmount, setCorrAmount] = useState("");
  const [corrCurrency, setCorrCurrency] = useState("USD");
  const [corrDate, setCorrDate] = useState("");
  const [corrPaidByEmail, setCorrPaidByEmail] = useState("");
  const [corrSplitType, setCorrSplitType] = useState("EQUAL");
  const [corrSplits, setCorrSplits] = useState<{ email: string; value: string }[]>([]);

  // Report statistics
  const [reportData, setReportData] = useState<any>(null);

  // Auth Inputs
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");

  // Auto-login or verify profile on load
  useEffect(() => {
    if (token) {
      fetchProfile();
    } else {
      setView("login");
    }
  }, [token]);

  // Fetch groups whenever user dashboard loaded
  useEffect(() => {
    if (user && view === "dashboard") {
      fetchGroups();
    }
  }, [user, view]);

  // Fetch group details whenever active group changes
  useEffect(() => {
    if (activeGroupId && view === "group-detail") {
      fetchGroupDetails(activeGroupId);
      fetchGroupBalances(activeGroupId);
      fetchImportSessions(activeGroupId);
    }
  }, [activeGroupId, view]);

  // Helpers
  const showToast = (msg: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 4000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 5000);
    }
  };

  const headers = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setView("dashboard");
      } else {
        logout();
      }
    } catch (err) {
      logout();
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setView("login");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("token", data.token);
        setToken(data.token);
        showToast("Logged in successfully!", "success");
      } else {
        showToast(data.error || "Failed to log in", "error");
      }
    } catch (err) {
      showToast("Network error. Is backend running?", "error");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: authName, email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("token", data.token);
        setToken(data.token);
        showToast("Registration completed!", "success");
      } else {
        showToast(data.error || "Failed to register", "error");
      }
    } catch (err) {
      showToast("Registration request failed.", "error");
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${API_BASE}/groups`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/groups`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ name: newGroupName, description: newGroupDesc }),
      });
      if (res.ok) {
        showToast("Group created successfully!", "success");
        setShowAddGroup(false);
        setNewGroupName("");
        setNewGroupDesc("");
        fetchGroups();
      } else {
        const data = await res.json();
        showToast(data.error || "Could not create group", "error");
      }
    } catch (err) {
      showToast("Group creation failed.", "error");
    }
  };

  const fetchGroupDetails = async (groupId: string) => {
    try {
      const res = await fetch(`${API_BASE}/groups/${groupId}`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setActiveGroup(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGroupBalances = async (groupId: string) => {
    try {
      const res = await fetch(`${API_BASE}/groups/${groupId}/balances`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setBalances(data.balances);
        setSettlements(data.settlements);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupId) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${activeGroupId}/members`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          email: newMemberEmail,
          name: newMemberName,
          joinedAt: newMemberJoinDate,
          leftAt: newMemberLeaveDate || null,
        }),
      });
      if (res.ok) {
        showToast("Member added successfully!", "success");
        setShowAddMember(false);
        setNewMemberEmail("");
        setNewMemberName("");
        fetchGroupDetails(activeGroupId);
        fetchGroupBalances(activeGroupId);
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to add member", "error");
      }
    } catch (err) {
      showToast("Request failed", "error");
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupId || !showEditMember) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${activeGroupId}/members/${showEditMember.id}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({
          joinedAt: editMemberJoinDate,
          leftAt: editMemberLeaveDate || null,
        }),
      });
      if (res.ok) {
        showToast("Member limits updated!", "success");
        setShowEditMember(null);
        fetchGroupDetails(activeGroupId);
        fetchGroupBalances(activeGroupId);
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to update member", "error");
      }
    } catch (err) {
      showToast("Update failed", "error");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!activeGroupId || !window.confirm("Are you sure you want to remove this member?")) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${activeGroupId}/members/${memberId}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (res.ok) {
        showToast("Member removed.", "success");
        fetchGroupDetails(activeGroupId);
        fetchGroupBalances(activeGroupId);
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to remove member", "error");
      }
    } catch (err) {
      showToast("Remove request failed", "error");
    }
  };

  // Prepare split inputs when opening Add Expense or changing split types
  useEffect(() => {
    if (activeGroup && showAddExpense) {
      // Filter members active on this date
      const selectedDate = new Date(expDate);
      const activeMembers = activeGroup.members.filter((m) => {
        const join = new Date(m.joinedAt);
        const leave = m.leftAt ? new Date(m.leftAt) : null;
        return selectedDate >= join && (leave === null || selectedDate <= leave);
      });

      // Map to default input fields
      const inputs = activeMembers.map((m) => {
        const existing = expSplits.find((s) => s.userId === m.userId);
        return {
          userId: m.userId,
          email: m.user.email,
          name: m.user.name,
          value: existing ? existing.value : "",
        };
      });
      setExpSplits(inputs);
    }
  }, [showAddExpense, expDate, activeGroup]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupId) return;

    // Build splits array
    const participants = expSplits
      .map((s) => ({
        userId: s.userId,
        value: s.value ? parseFloat(s.value) : undefined,
      }))
      .filter((p) => expSplitType === "EQUAL" || p.value !== undefined);

    try {
      const res = await fetch(`${API_BASE}/groups/${activeGroupId}/expenses`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          description: expDesc,
          amount: parseFloat(expAmount),
          currency: expCurrency,
          paidById: expPaidBy,
          date: expDate,
          splitType: expSplitType,
          participants,
        }),
      });

      if (res.ok) {
        showToast("Expense recorded successfully!", "success");
        setShowAddExpense(false);
        setExpDesc("");
        setExpAmount("");
        fetchGroupDetails(activeGroupId);
        fetchGroupBalances(activeGroupId);
      } else {
        const data = await res.json();
        showToast(data.error || "Could not save expense", "error");
      }
    } catch (err) {
      showToast("Record expense failed.", "error");
    }
  };

  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupId) return;

    try {
      const res = await fetch(`${API_BASE}/groups/${activeGroupId}/settle`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          senderId: settleSender,
          receiverId: settleReceiver,
          amount: parseFloat(settleAmount),
          currency: settleCurrency,
          date: settleDate,
        }),
      });

      if (res.ok) {
        showToast("Payment recorded successfully!", "success");
        setShowSettleModal(false);
        setSettleAmount("");
        fetchGroupDetails(activeGroupId);
        fetchGroupBalances(activeGroupId);
      } else {
        const data = await res.json();
        showToast(data.error || "Could not save payment", "error");
      }
    } catch (err) {
      showToast("Record payment failed.", "error");
    }
  };

  // CSV Importing Methods
  const fetchImportSessions = async (groupId: string) => {
    try {
      const res = await fetch(`${API_BASE}/groups/${groupId}/imports/sessions`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setImportSessions(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCSVUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupId || !csvText) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${activeGroupId}/imports/upload`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          csvText,
          filename: csvFilename || "paste_upload.csv",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("CSV parsed and queued for review!", "success");
        setCsvText("");
        setCsvFilename("");
        fetchImportSessions(activeGroupId);
        // Open the queue for the session
        openReviewQueue(data.sessionId);
      } else {
        showToast(data.error || "CSV upload failed", "error");
      }
    } catch (err) {
      showToast("CSV upload request failed", "error");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFilename(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCsvText(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  const openReviewQueue = async (sessionId: string) => {
    if (!activeGroupId) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${activeGroupId}/imports/sessions/${sessionId}/queue`, {
        headers: headers(),
      });
      if (res.ok) {
        const data = await res.json();
        setReviewQueue(data);
        setActiveSessionId(sessionId);
        setView("csv-review");
      }
    } catch (err) {
      showToast("Could not fetch session queue.", "error");
    }
  };

  const handleQueueResolve = async (rowId: string, action: "approve" | "reject", correction?: any) => {
    if (!activeGroupId || !activeSessionId) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${activeGroupId}/imports/queue/${rowId}/action`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          action,
          correctedData: correction || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Row resolved successfully!", "success");
        // Reload queue
        openReviewQueue(activeSessionId);
        fetchGroupBalances(activeGroupId);
      } else {
        showToast(data.error || "Failed to resolve row", "error");
      }
    } catch (err: any) {
      showToast("Error processing action", "error");
    }
  };

  // Correct imported row modal helpers
  const openCorrectionModal = (row: ImportedExpense) => {
    setEditQueueRow(row);
    setCorrDesc(row.description);
    setCorrAmount(row.amount);
    setCorrCurrency(row.currency);
    setCorrDate(row.date.split("T")[0]);
    setCorrPaidByEmail(row.paidByEmail);
    setCorrSplitType(row.splitType);
    
    const rawSplits: { email: string; value?: number }[] = JSON.parse(row.splitsData || "[]");
    const formatted = rawSplits.map((s) => ({
      email: s.email,
      value: s.value !== undefined ? String(s.value) : "",
    }));
    setCorrSplits(formatted);
  };

  const submitCorrection = () => {
    if (!editQueueRow) return;
    
    const finalCorrection = {
      description: corrDesc,
      amount: corrAmount,
      currency: corrCurrency,
      date: corrDate,
      splitType: corrSplitType,
      paidByEmail: corrPaidByEmail,
      splits: corrSplits.map((s) => ({
        email: s.email,
        value: corrSplitType === "EQUAL" ? undefined : parseFloat(s.value) || 0,
      })),
    };

    handleQueueResolve(editQueueRow.id, "approve", finalCorrection);
    setEditQueueRow(null);
  };

  const openSessionReport = async (sessionId: string) => {
    if (!activeGroupId) return;
    try {
      const res = await fetch(`${API_BASE}/groups/${activeGroupId}/imports/sessions/${sessionId}/report`, {
        headers: headers(),
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
        setView("import-report");
      }
    } catch (err) {
      showToast("Could not generate session report.", "error");
    }
  };

  // Sample CSV copy helper
  const loadSampleCSV = () => {
    const sample = 
`Date,Description,Amount,Currency,Paid By,Split Type,Participants
2026-03-10,"Dinner Outing",150,USD,aisha@example.com,EQUAL,"rohan@example.com,priya@example.com,meera@example.com,dev@example.com"
2026-03-20,"Weekly Groceries",80,USD,rohan@example.com,EQUAL,"aisha@example.com,priya@example.com,meera@example.com,dev@example.com"
2026-04-20,"Vercel Domain Hosting",30,USD,aisha@example.com,EQUAL,"rohan@example.com,priya@example.com,dev@example.com,sam@example.com"
2026-04-22,"Invalid Payer Date",100,USD,meera@example.com,EQUAL,"aisha@example.com,dev@example.com"
2026-04-25,"Internet",8300,INR,rohan@example.com,EQUAL,"aisha@example.com,priya@example.com,dev@example.com,sam@example.com"
2026-03-10,"Dinner Outing",150,USD,aisha@example.com,EQUAL,"rohan@example.com,priya@example.com,meera@example.com,dev@example.com"
2026-04-29,"Settlement payment",50,USD,dev@example.com,EQUAL,"aisha@example.com"
2026-04-28,"Electricity Bill",-120,USD,aisha@example.com,EQUAL,"rohan@example.com,dev@example.com"`;
    setCsvText(sample);
    setCsvFilename("internship_sample_anomalies.csv");
    showToast("Loaded sample CSV with diverse anomalies!", "success");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-purple-500 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => user && setView("dashboard")}>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <DollarSign className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">SplitSafe</h1>
            <p className="text-xs text-slate-400 font-medium">Relational Ledger Engine</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <User className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-semibold text-slate-200">{user.name}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-900/60 rounded-lg transition-colors border border-transparent hover:border-slate-800"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      {/* Messages */}
      {successMsg && (
        <div className="fixed top-20 right-6 z-50 bg-teal-500/90 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 backdrop-blur-md animate-fade-in border border-teal-400/20">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="fixed top-20 right-6 z-50 bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 backdrop-blur-md animate-fade-in border border-red-400/20">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
        {/* --- VIEW: LOGIN --- */}
        {view === "login" && (
          <div className="max-w-md mx-auto my-12 animate-fade-in">
            <div className="glass-premium p-8 rounded-2xl glow-purple relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-violet-600 to-indigo-500"></div>
              <h2 className="text-2xl font-bold text-center mb-1 text-white">Welcome Back</h2>
              <p className="text-slate-400 text-center text-sm mb-6">Access your relational shared ledger</p>
              
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    className="input-field"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    className="input-field"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <button type="submit" className="w-full btn-primary mt-2">
                  Sign In
                </button>
              </form>
              
              <div className="mt-6 text-center text-sm text-slate-400">
                Don't have an account?{" "}
                <button onClick={() => setView("register")} className="text-purple-400 hover:text-purple-300 font-medium underline">
                  Create one
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- VIEW: REGISTER --- */}
        {view === "register" && (
          <div className="max-w-md mx-auto my-12 animate-fade-in">
            <div className="glass-premium p-8 rounded-2xl glow-purple relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-violet-600 to-indigo-500"></div>
              <h2 className="text-2xl font-bold text-center mb-1 text-white">Create Account</h2>
              <p className="text-slate-400 text-center text-sm mb-6">Start managing group expenses safely</p>
              
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Aisha"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    className="input-field"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="aisha@example.com"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    className="input-field"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <button type="submit" className="w-full btn-primary mt-2">
                  Create Ledger Account
                </button>
              </form>
              
              <div className="mt-6 text-center text-sm text-slate-400">
                Already have an account?{" "}
                <button onClick={() => setView("login")} className="text-purple-400 hover:text-purple-300 font-medium underline">
                  Sign In
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- VIEW: DASHBOARD --- */}
        {view === "dashboard" && (
          <div className="space-y-8 animate-fade-in">
            {/* Upper banner */}
            <div className="glass p-8 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden glow-purple">
              <div className="absolute -right-24 -bottom-24 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl"></div>
              <div>
                <h2 className="text-3xl font-extrabold text-white">Expense Ledgers Dashboard</h2>
                <p className="text-slate-400 mt-1 max-w-xl">
                  Simplified multi-currency accounting powered by Relational Constraints. Log, split, and settle debts in real-time.
                </p>
              </div>
              <button onClick={() => setShowAddGroup(true)} className="btn-primary flex items-center space-x-2 shrink-0">
                <Plus className="h-4 w-4" />
                <span>Create Group</span>
              </button>
            </div>

            {/* Groups Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => {
                    setActiveGroupId(group.id);
                    setView("group-detail");
                  }}
                  className="glass-card p-6 rounded-xl hover:border-purple-500/50 hover:bg-slate-900/60 transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden"
                >
                  <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 border border-purple-500/20">
                      <Users className="h-6 w-6 text-purple-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">{group.name}</h3>
                    <p className="text-slate-400 text-sm mt-1 line-clamp-2">{group.description || "No description provided."}</p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold">{group.members?.length || 0} Members</span>
                    <span className="bg-slate-900 px-2 py-1 rounded border border-slate-800 text-slate-400">Active Ledger</span>
                  </div>
                </div>
              ))}

              {groups.length === 0 && (
                <div className="col-span-full py-16 text-center glass rounded-xl">
                  <Users className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white">No Groups Found</h3>
                  <p className="text-slate-400 text-sm mt-1 mb-6">Create a group or ask someone to add you to begin splitting.</p>
                  <button onClick={() => setShowAddGroup(true)} className="btn-secondary">Create First Group</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- VIEW: GROUP DETAILS --- */}
        {view === "group-detail" && activeGroup && (
          <div className="space-y-8 animate-fade-in">
            {/* Header info */}
            <div className="glass px-8 py-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-slate-800">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setView("dashboard")}
                  className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowRight className="h-5 w-5 rotate-180" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-white">{activeGroup.name}</h2>
                  <p className="text-sm text-slate-400 mt-0.5">{activeGroup.description || "Group ledger"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={() => setShowSettleModal(true)} className="btn-secondary flex items-center space-x-2 text-teal-400 border-teal-500/20 hover:border-teal-500/40">
                  <DollarSign className="h-4 w-4" />
                  <span>Record Payment</span>
                </button>
                <button onClick={() => setShowAddExpense(true)} className="btn-primary flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>Add Expense</span>
                </button>
              </div>
            </div>

            {/* Quick Summary Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Balances panel */}
              <div className="glass-card p-6 rounded-2xl flex flex-col h-full glow-teal border border-slate-800/80">
                <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
                  <h3 className="font-bold text-white flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5 text-teal-400" />
                    <span>Member Net Balances</span>
                  </h3>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-[280px]">
                  {balances.map((b) => (
                    <div key={b.userId} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/60">
                      <div>
                        <p className="text-sm font-bold text-slate-200">{b.userName}</p>
                        <p className="text-xs text-slate-500">{b.email}</p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-sm font-semibold ${
                            b.netBalance > 0
                              ? "text-teal-400"
                              : b.netBalance < 0
                              ? "text-red-400"
                              : "text-slate-400"
                          }`}
                        >
                          {b.netBalance > 0 ? "+" : ""}
                          {b.netBalance.toFixed(2)} USD
                        </span>
                        <p className="text-[10px] text-slate-500">
                          Paid: {b.totalPaid.toFixed(1)} | Owed: {b.totalOwed.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Debt Settlement optimization pathways */}
              <div className="glass-card p-6 rounded-2xl flex flex-col h-full glow-purple border border-slate-800/80">
                <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
                  <h3 className="font-bold text-white flex items-center space-x-2">
                    <Layers className="h-5 w-5 text-purple-400" />
                    <span>Simplified Settle Pathways</span>
                  </h3>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-[280px]">
                  {settlements.map((s, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/50 flex items-center justify-between gap-2">
                      <div className="shrink-0 text-left">
                        <p className="text-xs font-bold text-slate-300">{s.fromUserName}</p>
                        <span className="text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">Owes</span>
                      </div>
                      
                      <div className="flex-1 flex flex-col items-center">
                        <span className="text-sm font-bold text-purple-400 font-mono">${s.amountUSD.toFixed(2)}</span>
                        <div className="w-full flex items-center justify-center">
                          <div className="h-[1px] bg-slate-800 flex-1"></div>
                          <ChevronRight className="h-3.5 w-3.5 text-purple-500/80" />
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-xs font-bold text-slate-300">{s.toUserName}</p>
                        <span className="text-[9px] bg-teal-500/10 text-teal-400 px-1.5 py-0.5 rounded">Credited</span>
                      </div>
                    </div>
                  ))}

                  {settlements.length === 0 && (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      <Check className="h-8 w-8 text-teal-500 mx-auto mb-2" />
                      All debts fully settled!
                    </div>
                  )}
                </div>
              </div>

              {/* CSV Import pane */}
              <div className="glass-card p-6 rounded-2xl flex flex-col h-full border border-slate-800/80">
                <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
                  <h3 className="font-bold text-white flex items-center space-x-2">
                    <UploadCloud className="h-5 w-5 text-slate-400" />
                    <span>CSV Importer</span>
                  </h3>
                </div>

                <form onSubmit={handleCSVUpload} className="space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span className="font-semibold">Paste raw CSV or upload file</span>
                      <button type="button" onClick={loadSampleCSV} className="text-purple-400 hover:underline">
                        Load sample with anomalies
                      </button>
                    </div>

                    <textarea
                      className="w-full h-24 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-purple-500"
                      placeholder="Date,Description,Amount,Currency,Paid By,Split Type,Participants&#10;2026-03-10,Dinner,150,USD,aisha@example.com,EQUAL,rohan@example.com"
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                    ></textarea>

                    <div className="flex items-center justify-between gap-4">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-purple-400 hover:file:bg-slate-800 file:cursor-pointer"
                      />
                    </div>
                  </div>

                  <button type="submit" disabled={!csvText} className="w-full btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 py-2">
                    <UploadCloud className="h-4 w-4" />
                    <span>Run Parser & Import</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Bottom Panels Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Ledger Log */}
              <div className="lg:col-span-2 glass-card p-6 rounded-2xl space-y-4 border border-slate-800/80">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800/60">
                  <h3 className="font-bold text-white text-lg flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-purple-400" />
                    <span>Group Ledger Log</span>
                  </h3>
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {activeGroup.expenses.map((exp) => (
                    <div
                      key={exp.id}
                      className={`p-4 rounded-xl border relative ${
                        exp.isSettlement
                          ? "bg-teal-950/20 border-teal-500/20"
                          : "bg-slate-900/30 border-slate-800"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                            {new Date(exp.date).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <h4 className="font-bold text-slate-200 text-sm mt-0.5">{exp.description}</h4>
                          <p className="text-xs text-slate-400 mt-1">
                            Paid by <span className="text-slate-200 font-semibold">{exp.paidBy.name}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-bold text-slate-100">
                            {Number(exp.amount).toFixed(2)} {exp.currency}
                          </span>
                          {exp.currency !== "USD" && (
                            <p className="text-[10px] text-slate-500">
                              ≈ ${(Number(exp.amount) * Number(exp.exchangeRate)).toFixed(2)} USD
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Participant Splits */}
                      {!exp.isSettlement && (
                        <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-wrap gap-2">
                          {exp.splits.map((split) => (
                            <span key={split.id} className="text-[11px] bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-300">
                              {split.user.name}: {Number(split.amount).toFixed(2)} {exp.currency}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {activeGroup.expenses.length === 0 && (
                    <div className="py-24 text-center text-slate-500">
                      No expenses logged in this group yet. Click Add Expense to start!
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Members & Import History */}
              <div className="space-y-8">
                {/* Members list */}
                <div className="glass-card p-6 rounded-2xl border border-slate-800/80">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-800/60 mb-4">
                    <h3 className="font-bold text-white flex items-center space-x-2">
                      <Users className="h-5 w-5 text-purple-400" />
                      <span>Group Members</span>
                    </h3>
                    <button onClick={() => setShowAddMember(true)} className="p-1 hover:bg-slate-900 rounded text-purple-400 hover:text-purple-300">
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {activeGroup.members.map((m) => {
                      const joinStr = new Date(m.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
                      const leaveStr = m.leftAt
                        ? new Date(m.leftAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
                        : "Active";

                      return (
                        <div key={m.id} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <p className="text-xs font-bold text-slate-200">{m.user.name}</p>
                              {m.role === "ADMIN" && <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1 py-0.2 rounded font-bold">ADMIN</span>}
                            </div>
                            <p className="text-[10px] text-slate-500">{m.user.email}</p>
                            <p className="text-[9px] text-slate-400 mt-1 font-mono">
                              Range: {joinStr} - {leaveStr}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => {
                                setShowEditMember(m);
                                setEditMemberJoinDate(m.joinedAt.split("T")[0]);
                                setEditMemberLeaveDate(m.leftAt ? m.leftAt.split("T")[0] : "");
                              }}
                              className="p-1 text-slate-500 hover:text-purple-400 hover:bg-slate-800/60 rounded transition-colors"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleRemoveMember(m.id)}
                              className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800/60 rounded transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Import Sessions History */}
                <div className="glass-card p-6 rounded-2xl border border-slate-800/80">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-800/60 mb-4">
                    <h3 className="font-bold text-white flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-slate-400" />
                      <span>CSV Import Sessions</span>
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {importSessions.map((sess) => (
                      <div key={sess.id} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-200 truncate">{sess.filename}</p>
                          <p className="text-[9px] text-slate-500">
                            {new Date(sess.createdAt).toLocaleDateString()} by {sess.importedBy?.name || "System"}
                          </p>
                          <span
                            className={`inline-block text-[8px] px-1.5 py-0.2 rounded font-semibold mt-1.5 ${
                              sess.status === "COMPLETED"
                                ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                                : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                            }`}
                          >
                            {sess.status}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button
                            onClick={() => openReviewQueue(sess.id)}
                            className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 bg-slate-800 px-2.5 py-1 rounded transition-colors border border-slate-700/60 text-center"
                          >
                            Queue
                          </button>
                          <button
                            onClick={() => openSessionReport(sess.id)}
                            className="text-[10px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 px-2.5 py-1 rounded transition-colors border border-slate-700/60 text-center"
                          >
                            Report
                          </button>
                        </div>
                      </div>
                    ))}

                    {importSessions.length === 0 && (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        No import sessions logged.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- VIEW: CSV ANOMALY REVIEW QUEUE --- */}
        {view === "csv-review" && activeSessionId && (
          <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="glass px-8 py-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-slate-800">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => activeGroupId && setView("group-detail")}
                  className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowRight className="h-5 w-5 rotate-180" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-white">Anomaly Review Queue</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Approve, reject, or correct flagged imports</p>
                </div>
              </div>

              <button
                onClick={() => openSessionReport(activeSessionId)}
                className="btn-secondary flex items-center space-x-2 text-purple-400 border-purple-500/20 hover:border-purple-500/40"
              >
                <FileText className="h-4 w-4" />
                <span>View Import Report</span>
              </button>
            </div>

            {/* Queue rows */}
            <div className="space-y-6">
              {reviewQueue.map((row, idx) => {
                const anomaliesList: Anomaly[] = JSON.parse(row.anomalies || "[]");
                const splitsList: any[] = JSON.parse(row.splitsData || "[]");
                const hasErrors = anomaliesList.some((a) => a.severity === "ERROR");
                const hasWarnings = anomaliesList.some((a) => a.severity === "WARNING");

                return (
                  <div
                    key={row.id}
                    className={`glass-card p-6 rounded-2xl border relative overflow-hidden ${
                      row.status !== "PENDING_REVIEW"
                        ? "opacity-50 border-slate-800 bg-slate-900/20"
                        : hasErrors
                        ? "border-red-500/30 bg-red-950/5 glow-purple"
                        : hasWarnings
                        ? "border-yellow-500/30 bg-yellow-950/5"
                        : "border-slate-800 bg-slate-900/30"
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      {/* Left: Row Metadata */}
                      <div className="space-y-3 min-w-0 flex-1">
                        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                          <span className="text-xs font-bold bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-0.5 rounded">
                            Row #{idx + 1}
                          </span>
                          <span className="text-xs text-slate-400 font-mono flex items-center">
                            <Calendar className="h-3.5 w-3.5 text-slate-500 mr-1.5" />
                            {row.date.split("T")[0]}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            Paid by: <span className="text-slate-200 font-semibold">{row.paidByEmail}</span>
                          </span>
                          <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.2 rounded font-semibold">
                            Split: {row.splitType}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.2 rounded font-bold ${
                              row.status === "PENDING_REVIEW"
                                ? "bg-yellow-500/10 text-yellow-400"
                                : row.status === "APPROVED" || row.status === "RESOLVED"
                                ? "bg-teal-500/10 text-teal-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {row.status}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-bold text-white text-base">{row.description}</h3>
                          <p className="text-lg font-extrabold text-slate-100 mt-1">
                            {Number(row.amount).toFixed(2)} {row.currency}
                          </p>
                        </div>

                        {/* Splits */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {splitsList.map((s, sidx) => (
                            <span key={sidx} className="text-[10px] bg-slate-900/80 border border-slate-850 px-2 py-0.5 rounded text-slate-400">
                              {s.email}
                              {s.value !== undefined ? `: ${s.value}` : ""}
                            </span>
                          ))}
                        </div>

                        {/* Anomalies Box */}
                        {anomaliesList.length > 0 && (
                          <div className="mt-3 p-3 rounded-lg bg-slate-950/80 border border-slate-850 space-y-2">
                            {anomaliesList.map((a, aidx) => (
                              <div key={aidx} className="flex items-start space-x-2 text-xs">
                                <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${a.severity === "ERROR" ? "text-red-400" : "text-yellow-400"}`} />
                                <span className={a.severity === "ERROR" ? "text-red-200" : "text-yellow-200"}>
                                  <strong>[{a.code}]</strong> {a.message}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      {row.status === "PENDING_REVIEW" && (
                        <div className="flex flex-row lg:flex-col gap-2 shrink-0 self-start lg:self-center">
                          <button
                            onClick={() => handleQueueResolve(row.id, "approve")}
                            disabled={hasErrors}
                            className="btn-primary py-2 px-4 flex items-center justify-center space-x-2 bg-gradient-to-tr from-teal-600 to-emerald-500 hover:from-teal-500 hover:to-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed shadow-none"
                            title={hasErrors ? "Resolve errors before approving" : "Approve Row"}
                          >
                            <Check className="h-4 w-4" />
                            <span className="text-xs">Approve</span>
                          </button>
                          
                          <button
                            onClick={() => openCorrectionModal(row)}
                            className="btn-secondary py-2 px-4 flex items-center justify-center space-x-2 text-purple-400 border-purple-500/20 hover:border-purple-500/40"
                          >
                            <Edit className="h-4 w-4" />
                            <span className="text-xs">Correct</span>
                          </button>

                          <button
                            onClick={() => handleQueueResolve(row.id, "reject")}
                            className="btn-secondary py-2 px-4 flex items-center justify-center space-x-2 text-red-400 border-red-500/10 hover:border-red-500/30"
                          >
                            <X className="h-4 w-4" />
                            <span className="text-xs">Reject</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {reviewQueue.length === 0 && (
                <div className="py-24 text-center glass rounded-xl text-slate-500">
                  Review queue is empty.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- VIEW: IMPORT SESSIONS REPORT --- */}
        {view === "import-report" && reportData && (
          <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
            {/* Header */}
            <div className="glass px-8 py-6 rounded-2xl flex items-center space-x-4 border border-slate-800">
              <button
                onClick={() => activeGroupId && setView("group-detail")}
                className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <ArrowRight className="h-5 w-5 rotate-180" />
              </button>
              <div>
                <h2 className="text-2xl font-bold text-white">Import Session Report</h2>
                <p className="text-sm text-slate-400 mt-0.5">Summary and metrics of CSV ingest</p>
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass p-4 rounded-xl text-center">
                <span className="text-xs text-slate-400 block font-semibold">Total Rows</span>
                <span className="text-2xl font-bold text-white mt-1 block">{reportData.stats.totalRows}</span>
              </div>
              <div className="glass p-4 rounded-xl text-center border-l-2 border-teal-500">
                <span className="text-xs text-slate-400 block font-semibold">Approved</span>
                <span className="text-2xl font-bold text-teal-400 mt-1 block">{reportData.stats.approvedRows}</span>
              </div>
              <div className="glass p-4 rounded-xl text-center border-l-2 border-red-500">
                <span className="text-xs text-slate-400 block font-semibold">Rejected</span>
                <span className="text-2xl font-bold text-red-400 mt-1 block">{reportData.stats.rejectedRows}</span>
              </div>
              <div className="glass p-4 rounded-xl text-center border-l-2 border-purple-500">
                <span className="text-xs text-slate-400 block font-semibold">Total Value</span>
                <span className="text-xl font-bold text-purple-400 mt-1.5 block">${reportData.stats.totalImportedUSD.toFixed(2)} USD</span>
              </div>
            </div>

            {/* Session Metadata */}
            <div className="glass p-6 rounded-2xl space-y-3">
              <h3 className="font-bold text-white text-md border-b border-slate-800 pb-2">Session Info</h3>
              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-500">Filename:</span>{" "}
                  <span className="text-slate-200">{reportData.session.filename}</span>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>{" "}
                  <span className="text-slate-200">{reportData.session.status}</span>
                </div>
                <div>
                  <span className="text-slate-500">Created At:</span>{" "}
                  <span className="text-slate-200">{new Date(reportData.session.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500">ID:</span>{" "}
                  <span className="text-slate-200">{reportData.session.id}</span>
                </div>
              </div>
            </div>

            {/* Flagged Anomalies summary */}
            <div className="glass p-6 rounded-2xl space-y-4">
              <h3 className="font-bold text-white text-md border-b border-slate-800 pb-2">Flagged Anomalies Summary</h3>
              <div className="space-y-2">
                {Object.entries(reportData.anomaliesCount).map(([code, count]) => (
                  <div key={code} className="flex justify-between items-center p-2 rounded bg-slate-900 text-xs">
                    <span className="font-semibold text-slate-300">{code}</span>
                    <span className="bg-slate-850 px-2 py-0.5 rounded text-yellow-400 font-bold border border-yellow-500/10">
                      {count as number} occurrences
                    </span>
                  </div>
                ))}

                {Object.keys(reportData.anomaliesCount).length === 0 && (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    Clean session! No anomalies flagged.
                  </div>
                )}
              </div>
            </div>

            <button onClick={() => activeGroupId && setView("group-detail")} className="w-full btn-primary py-2.5">
              Return to Group Ledger
            </button>
          </div>
        )}
      </main>

      {/* --- POPUPS & MODALS --- */}

      {/* Modal: Create Group */}
      {showAddGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-premium p-6 rounded-2xl max-w-md w-full animate-fade-in space-y-4 border border-slate-800">
            <h3 className="text-lg font-bold text-white">Create Expense Group</h3>
            
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-400 mb-1.5">Group Name</label>
                <input
                  type="text"
                  required
                  className="input-field"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Intern Roommates"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-400 mb-1.5">Description (Optional)</label>
                <input
                  type="text"
                  className="input-field"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="e.g. Shared expenses for summer house rental"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowAddGroup(false)} className="btn-secondary py-2">
                  Cancel
                </button>
                <button type="submit" className="btn-primary py-2">
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Member */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-premium p-6 rounded-2xl max-w-md w-full animate-fade-in space-y-4 border border-slate-800">
            <h3 className="text-lg font-bold text-white">Add Group Member</h3>
            
            <form onSubmit={handleAddMember} className="space-y-4">
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-400 mb-1.5">User Email</label>
                <input
                  type="email"
                  required
                  className="input-field"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="e.g. sam@example.com"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-400 mb-1.5">User Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="e.g. Sam (falls back to email name)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Joined Group At</label>
                  <input
                    type="date"
                    required
                    className="input-field text-xs font-mono"
                    value={newMemberJoinDate}
                    onChange={(e) => setNewMemberJoinDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Left Group At</label>
                  <input
                    type="date"
                    className="input-field text-xs font-mono"
                    value={newMemberLeaveDate}
                    onChange={(e) => setNewMemberLeaveDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowAddMember(false)} className="btn-secondary py-2">
                  Cancel
                </button>
                <button type="submit" className="btn-primary py-2">
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Member active range */}
      {showEditMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-premium p-6 rounded-2xl max-w-md w-full animate-fade-in space-y-4 border border-slate-800">
            <h3 className="text-lg font-bold text-white">Edit Member Date Boundaries</h3>
            <p className="text-xs text-slate-400">Manage joined and left limits for {showEditMember.user.name}</p>
            
            <form onSubmit={handleUpdateMember} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Joined Group At</label>
                  <input
                    type="date"
                    required
                    className="input-field text-xs font-mono"
                    value={editMemberJoinDate}
                    onChange={(e) => setEditMemberJoinDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Left Group At</label>
                  <input
                    type="date"
                    className="input-field text-xs font-mono"
                    value={editMemberLeaveDate}
                    onChange={(e) => setEditMemberLeaveDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowEditMember(null)} className="btn-secondary py-2">
                  Cancel
                </button>
                <button type="submit" className="btn-primary py-2">
                  Update Bounds
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Expense */}
      {showAddExpense && activeGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
          <div className="glass-premium p-6 rounded-2xl max-w-lg w-full animate-fade-in my-8 space-y-4 border border-slate-800">
            <h3 className="text-lg font-bold text-white">Add Group Expense</h3>
            
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Description</label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    placeholder="Supermarket lunch"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Date</label>
                  <input
                    type="date"
                    required
                    className="input-field text-xs font-mono"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col col-span-2">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="input-field"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="120.00"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Currency</label>
                  <select
                    className="input-field text-xs"
                    value={expCurrency}
                    onChange={(e) => setExpCurrency(e.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Paid By</label>
                  <select
                    required
                    className="input-field text-xs"
                    value={expPaidBy}
                    onChange={(e) => setExpPaidBy(e.target.value)}
                  >
                    <option value="">Select Member</option>
                    {expSplits.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Split Method</label>
                  <select
                    className="input-field text-xs"
                    value={expSplitType}
                    onChange={(e) => setExpSplitType(e.target.value)}
                  >
                    <option value="EQUAL">Split Equally</option>
                    <option value="EXACT">Exact Amounts</option>
                    <option value="PERCENTAGE">Percentages (%)</option>
                    <option value="SHARE">Share Counts</option>
                  </select>
                </div>
              </div>

              {/* Dynamic split input fields */}
              <div className="space-y-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800 max-h-[180px] overflow-y-auto">
                <span className="text-xs font-bold text-slate-400 block mb-1">
                  Configure Split details ({expSplitType}):
                </span>
                
                {expSplits.map((split, index) => (
                  <div key={split.userId} className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-800 last:border-b-0">
                    <span className="text-xs text-slate-300 font-semibold">{split.name}</span>
                    
                    {expSplitType !== "EQUAL" && (
                      <div className="flex items-center space-x-2 shrink-0">
                        <input
                          type="number"
                          step="any"
                          required
                          className="input-field py-1 px-2 text-xs w-24 text-right"
                          value={split.value}
                          onChange={(e) => {
                            const val = e.target.value;
                            const copy = [...expSplits];
                            copy[index].value = val;
                            setExpSplits(copy);
                          }}
                          placeholder={
                            expSplitType === "EXACT"
                              ? "Amt"
                              : expSplitType === "PERCENTAGE"
                              ? "%"
                              : "Shares"
                          }
                        />
                        <span className="text-[11px] text-slate-500">
                          {expSplitType === "EXACT"
                            ? expCurrency
                            : expSplitType === "PERCENTAGE"
                            ? "%"
                            : "shares"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {expSplits.length === 0 && (
                  <div className="text-center py-4 text-xs text-red-400 flex items-center justify-center space-x-1.5">
                    <Info className="h-4 w-4" />
                    <span>No members active on selected date!</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowAddExpense(false)} className="btn-secondary py-2">
                  Cancel
                </button>
                <button type="submit" disabled={expSplits.length === 0 || !expPaidBy} className="btn-primary py-2 disabled:opacity-50">
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Settlement Payment */}
      {showSettleModal && activeGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-premium p-6 rounded-2xl max-w-md w-full animate-fade-in space-y-4 border border-slate-800">
            <h3 className="text-lg font-bold text-white">Record Settlement Payment</h3>
            <p className="text-xs text-slate-400">Direct user-to-user transfers logged as payments</p>
            
            <form onSubmit={handleRecordSettlement} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Sender (Pays)</label>
                  <select
                    required
                    className="input-field text-xs"
                    value={settleSender}
                    onChange={(e) => setSettleSender(e.target.value)}
                  >
                    <option value="">Select User</option>
                    {activeGroup.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Receiver (Gets)</label>
                  <select
                    required
                    className="input-field text-xs"
                    value={settleReceiver}
                    onChange={(e) => setSettleReceiver(e.target.value)}
                  >
                    <option value="">Select User</option>
                    {activeGroup.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col col-span-2">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Payment Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="input-field"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="40.00"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Currency</label>
                  <select
                    className="input-field text-xs"
                    value={settleCurrency}
                    onChange={(e) => setSettleCurrency(e.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-400 mb-1.5">Date</label>
                <input
                  type="date"
                  required
                  className="input-field text-xs font-mono"
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowSettleModal(false)} className="btn-secondary py-2">
                  Cancel
                </button>
                <button type="submit" disabled={!settleSender || !settleReceiver || !settleAmount} className="btn-primary py-2 disabled:opacity-50">
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit queue item correction */}
      {editQueueRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="glass-premium p-6 rounded-2xl max-w-lg w-full animate-fade-in my-8 space-y-4 border border-slate-800">
            <h3 className="text-lg font-bold text-white">Correct Imported CSV Row</h3>
            <p className="text-xs text-slate-400">Resolve anomalies by manually adjusting values before saving.</p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Description</label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    value={corrDesc}
                    onChange={(e) => setCorrDesc(e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Date (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    required
                    className="input-field text-xs font-mono"
                    value={corrDate}
                    onChange={(e) => setCorrDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col col-span-2">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="input-field"
                    value={corrAmount}
                    onChange={(e) => setCorrAmount(e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Currency</label>
                  <select
                    className="input-field text-xs"
                    value={corrCurrency}
                    onChange={(e) => setCorrCurrency(e.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Payer Email</label>
                  <input
                    type="email"
                    required
                    className="input-field"
                    value={corrPaidByEmail}
                    onChange={(e) => setCorrPaidByEmail(e.target.value)}
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-400 mb-1.5">Split Method</label>
                  <select
                    className="input-field text-xs"
                    value={corrSplitType}
                    onChange={(e) => setCorrSplitType(e.target.value)}
                  >
                    <option value="EQUAL">Split Equally</option>
                    <option value="EXACT">Exact Amounts</option>
                    <option value="PERCENTAGE">Percentages (%)</option>
                    <option value="SHARE">Share Counts</option>
                  </select>
                </div>
              </div>

              {/* Splits inputs */}
              <div className="space-y-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800 max-h-[160px] overflow-y-auto">
                <span className="text-xs font-bold text-slate-400 block mb-1">Participants Splits:</span>
                
                {corrSplits.map((split, index) => (
                  <div key={split.email} className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-800 last:border-b-0">
                    <span className="text-xs text-slate-300 font-semibold truncate max-w-[180px]">{split.email}</span>
                    
                    {corrSplitType !== "EQUAL" && (
                      <div className="flex items-center space-x-2 shrink-0">
                        <input
                          type="number"
                          step="any"
                          required
                          className="input-field py-1 px-2 text-xs w-24 text-right"
                          value={split.value}
                          onChange={(e) => {
                            const val = e.target.value;
                            const copy = [...corrSplits];
                            copy[index].value = val;
                            setCorrSplits(copy);
                          }}
                        />
                        <span className="text-[10px] text-slate-500">
                          {corrSplitType === "EXACT" ? corrCurrency : corrSplitType === "PERCENTAGE" ? "%" : "shares"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setEditQueueRow(null)} className="btn-secondary py-2">
                  Cancel
                </button>
                <button type="button" onClick={submitCorrection} className="btn-primary py-2">
                  Save & Apply Corrected Row
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
