"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronLeft,
  Layers,
  School as SchoolIcon,
  Users,
  PackagePlus,
  RefreshCcw,
  Sparkles,
  XCircle,
  Eye,
  Search,
  Truck,
  Receipt,
  ClipboardCheck,
  Info,
  NotebookPen,
  IndianRupee,
  Tag,
  ListOrdered,
} from "lucide-react";

/* ---------------- Types ---------------- */

type Distributor = {
  id: number;
  name: string;
  mobile?: string | null;
  city?: string | null;
};

type School = { id: number; name: string };

type BookMini = {
  id: number;
  title: string;
  class_name?: string | null;

  // pricing (backend may provide any one)
  rate?: number | string | null;
  selling_price?: number | string | null;
  mrp?: number | string | null;
};

type BundleItem = {
  id: number;
  bundle_id: number;
  book_id: number;

  reserved_qty: number;
  issued_qty: number;

  // optional but very helpful if you have it:
  required_qty?: number;

  book?: BookMini | null;
};

type Bundle = {
  id: number;
  school_id: number;
  academic_session: string;
  status: "RESERVED" | "ISSUED" | "CANCELLED" | string;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  school?: { id: number; name: string } | null;
  items?: BundleItem[];
};

type IssueToType = "DISTRIBUTOR" | "SCHOOL";

type BundleIssueRow = {
  id: number;
  issue_no?: string | null;
  academic_session: string;

  issued_to_type: "DISTRIBUTOR" | "SCHOOL";
  issued_to_id: number;

  bundle_id: number;

  status?: "ISSUED" | "CANCELLED" | string;

  notes?: string | null;
  remarks?: string | null;

  createdAt?: string;
  updatedAt?: string;

  bundle?: Bundle | null;

  issuedDistributor?: Distributor | null;
  issuedSchool?: School | null;
};

type ToastState = { message: string; type: "success" | "error" } | null;

const DEFAULT_SESSION = "2026-27";

const IssueBundlesPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  // master lists
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]); // RESERVED only

  // issued history
  const [issues, setIssues] = useState<BundleIssueRow[]>([]);
  const [issueSearch, setIssueSearch] = useState("");

  // hide cancelled by default
  const [showCancelled, setShowCancelled] = useState(false);

  const [selectedIssue, setSelectedIssue] = useState<BundleIssueRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // form
  const [issueToType, setIssueToType] = useState<IssueToType>("DISTRIBUTOR");
  const [issuedToId, setIssuedToId] = useState<number | "">("");
  const [bundleId, setBundleId] = useState<number | "">("");
  const [session, setSession] = useState<string>(DEFAULT_SESSION);
  const [notes, setNotes] = useState<string>("");

  // ui
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const notesRef = useRef<HTMLInputElement | null>(null);

  /* ---------------- Helpers ---------------- */

  const normalizeList = (raw: any) => {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.rows)) return raw.rows;
    return [];
  };

  const fmtDate = (iso?: string | null) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString();
    } catch {
      return iso || "";
    }
  };

  const toNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const money = (v: any) => {
    const n = toNum(v);
    return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };

  const bookRate = (b?: BookMini | null) => {
    // fallback order
    if (!b) return 0;
    const r = toNum(b.rate);
    if (r) return r;
    const s = toNum(b.selling_price);
    if (s) return s;
    const m = toNum(b.mrp);
    if (m) return m;
    return 0;
  };

  const displayNotes = (row?: { notes?: string | null; remarks?: string | null }) =>
    (row?.notes && String(row.notes).trim()) ||
    (row?.remarks && String(row.remarks).trim()) ||
    "";

  const bundleLabel = (b: Bundle) => {
    const schoolName = b.school?.name || `School #${b.school_id}`;
    const itemCount = b.items?.length ?? 0;
    const total = (b.items || []).reduce((s, it) => s + (toNum(it.reserved_qty) || 0), 0);
    return `Bundle #${b.id} — ${schoolName} — ${itemCount} titles • ${total} reserved`;
  };

  const selectedBundle = useMemo(() => {
    if (!bundleId) return null;
    return bundles.find((b) => b.id === bundleId) || null;
  }, [bundleId, bundles]);

  const selectedParty = useMemo(() => {
    if (!issuedToId) return null;
    if (issueToType === "DISTRIBUTOR") {
      return distributors.find((d) => d.id === issuedToId) || null;
    }
    return schools.find((s) => s.id === issuedToId) || null;
  }, [issuedToId, issueToType, distributors, schools]);

  const partyName = (row: BundleIssueRow) => {
    if (row.issued_to_type === "DISTRIBUTOR") {
      return row.issuedDistributor?.name || `Distributor #${row.issued_to_id}`;
    }
    return row.issuedSchool?.name || `School #${row.issued_to_id}`;
  };

  const partySub = (row: BundleIssueRow) => {
    if (row.issued_to_type === "DISTRIBUTOR") {
      const c = row.issuedDistributor?.city ? `City: ${row.issuedDistributor.city}` : "";
      const m = row.issuedDistributor?.mobile ? `Mobile: ${row.issuedDistributor.mobile}` : "";
      return [c, m].filter(Boolean).join(" • ");
    }
    return "";
  };

  const issueBadge = (st?: string) => {
    const s = (st || "").toUpperCase();
    if (s === "CANCELLED") return "bg-rose-100 text-rose-700 border-rose-200";
    if (s === "ISSUED") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  const totalsFromBundle = (b?: Bundle | null) => {
    const items = b?.items || [];

    const totalTitles = items.length;
    const totalIssued = items.reduce((s, it) => s + toNum(it.issued_qty), 0);
    const totalReserved = items.reduce((s, it) => s + toNum(it.reserved_qty), 0);

    const totalAmountIssued = items.reduce((s, it) => {
      const rate = bookRate(it.book);
      return s + rate * toNum(it.issued_qty);
    }, 0);

    const totalAmountReserved = items.reduce((s, it) => {
      const rate = bookRate(it.book);
      return s + rate * toNum(it.reserved_qty);
    }, 0);

    return {
      totalTitles,
      totalIssued,
      totalReserved,
      totalAmountIssued,
      totalAmountReserved,
      grandTotal: totalAmountIssued + totalAmountReserved,
    };
  };

  const groupedByClass = (b?: Bundle | null) => {
    const items = b?.items || [];
    const map = new Map<string, BundleItem[]>();

    for (const it of items) {
      const cn = (it.book?.class_name || "").trim();
      const key = cn ? cn : "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }

    // sort class keys nicely (Class 1, Class 2...)
    const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return keys.map((k) => ({
      class_name: k,
      items: (map.get(k) || []).slice().sort((x, y) =>
        (x.book?.title || "").localeCompare(y.book?.title || "")
      ),
    }));
  };

  // toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  /* ---------------- Data Fetch ---------------- */

  const fetchMastersAndReservedBundles = async (sessionForFilter: string) => {
    setPageLoading(true);
    setError(null);
    try {
      const [dRes, sRes, bRes] = await Promise.all([
        api.get("/api/distributors"),
        api.get("/api/schools"),
        api.get("/api/bundles"),
      ]);

      const dList: Distributor[] = normalizeList(dRes?.data);
      const sList: School[] = normalizeList(sRes?.data);
      const bList: Bundle[] = normalizeList(bRes?.data);

      setDistributors([...dList].sort((a, b) => (b.id || 0) - (a.id || 0)));
      setSchools([...sList].sort((a, b) => (b.id || 0) - (a.id || 0)));

      const filtered = [...bList]
        .filter(
          (b) =>
            (b.academic_session || "") === (sessionForFilter || "") &&
            String(b.status || "").toUpperCase() === "RESERVED"
        )
        .sort((a, b) => (b.id || 0) - (a.id || 0));

      setBundles(filtered);
    } catch (e: any) {
      console.error(e);
      setError("Failed to load distributors/schools/bundles.");
    } finally {
      setPageLoading(false);
    }
  };

  const fetchIssues = async (sessionForFilter: string) => {
    setHistoryLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/bundle-issues", {
        params: { academic_session: sessionForFilter || "" },
      });
      const list: BundleIssueRow[] = normalizeList(res?.data);
      setIssues([...list].sort((a, b) => (b.id || 0) - (a.id || 0)));
    } catch (e: any) {
      console.error(e);
      setIssues([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchAll = async (sessionForFilter: string) => {
    await Promise.all([fetchMastersAndReservedBundles(sessionForFilter), fetchIssues(sessionForFilter)]);
  };

  useEffect(() => {
    fetchAll(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIssuedToId("");
  }, [issueToType]);

  useEffect(() => {
    setBundleId("");
    fetchAll(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /* ---------------- Actions ---------------- */

  const submitIssue = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!issuedToId) throw new Error("Please select Distributor/School.");
      if (!bundleId) throw new Error("Please select Bundle.");
      if (!session.trim()) throw new Error("Academic session is required.");

      const payload = {
        academic_session: session.trim(),
        issued_to_type: issueToType,
        issued_to_id: issuedToId,
        bundle_id: bundleId,
        notes: notes.trim() || null,
      };

      await api.post(`/api/bundle-issues/bundles/${bundleId}/issue`, payload);

      setToast({ message: "Bundle issued successfully.", type: "success" });

      setIssueToType("DISTRIBUTOR");
      setIssuedToId("");
      setBundleId("");
      setNotes("");

      await fetchAll(session);
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Failed to issue bundle.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
      notesRef.current?.focus();
    }
  };

  const openIssueDetails = (row: BundleIssueRow) => {
    setSelectedIssue(row);
    setModalOpen(true);
  };

  const cancelIssue = async (row: BundleIssueRow) => {
    if (!row?.id) return;
    try {
      setLoading(true);
      setError(null);

      await api.post(`/api/bundle-issues/${row.id}/cancel`);

      setToast({ message: "Issue cancelled & stock reverted.", type: "success" });
      setModalOpen(false);
      setSelectedIssue(null);
      await fetchAll(session);
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Failed to cancel issue.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- Derived ---------------- */

  const filteredIssues = useMemo(() => {
    const q = issueSearch.trim().toLowerCase();

    let base = issues;
    if (!showCancelled) {
      base = base.filter((x) => (x.status || "").toUpperCase() !== "CANCELLED");
    }

    if (!q) return base;

    return base.filter((x) => {
      const bId = String(x.bundle_id || "");
      const iNo = String(x.issue_no || "");
      const pName = partyName(x);
      const st = String(x.status || "");
      const n = displayNotes(x);
      const bn = (x.bundle?.notes || "").toLowerCase();
      const schoolName = (x.bundle?.school?.name || "").toLowerCase();

      return (
        bId.includes(q) ||
        iNo.toLowerCase().includes(q) ||
        pName.toLowerCase().includes(q) ||
        st.toLowerCase().includes(q) ||
        n.toLowerCase().includes(q) ||
        bn.includes(q) ||
        schoolName.includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, issueSearch, showCancelled]);

  const kpi = useMemo(() => {
    const base = showCancelled
      ? issues
      : issues.filter((x) => (x.status || "").toUpperCase() !== "CANCELLED");
    const total = base.length;
    const issued = base.filter((x) => (x.status || "ISSUED").toUpperCase() === "ISSUED").length;
    const cancelled = base.filter((x) => (x.status || "").toUpperCase() === "CANCELLED").length;
    return { total, issued, cancelled };
  }, [issues, showCancelled]);

  // totals for selected issue modal
  const modalTotals = useMemo(() => totalsFromBundle(selectedIssue?.bundle || null), [selectedIssue]);
  const modalGroups = useMemo(() => groupedByClass(selectedIssue?.bundle || null), [selectedIssue]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000" />
        <div className="absolute top-40 left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-200/50 shadow-lg">
        <div className="font-bold flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back to Dashboard</span>
          </Link>
        </div>

        <div className="font-bold flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg animate-pulse">
            <PackagePlus className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg tracking-tight">Issue Bundles</span>
            <span className="text-xs text-slate-500 font-medium">
              Issue reserved bundles • Track prices & class-wise summary • Cancel with stock revert
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-slate-800">{user?.name || "User"}</span>
            {user?.role && (
              <span className="text-xs rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-2.5 py-1 border border-indigo-200 text-indigo-700 font-medium">
                {user.role}
              </span>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 transform"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 p-6 lg:p-8 space-y-6">
        {/* Title + refresh */}
        <section className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                Issue Bundles
              </h1>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Prices/classes will display if backend sends: <span className="font-semibold">book.class_name</span> and{" "}
                <span className="font-semibold">book.rate</span> (or selling_price/mrp).
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchAll(session)}
            disabled={pageLoading || historyLoading}
            className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-slate-200 text-slate-700 font-semibold shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            <RefreshCcw className={`w-4 h-4 ${pageLoading || historyLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </section>

        {error && (
          <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-red-700">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                !
              </div>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Form card */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
          {pageLoading ? (
            <div className="flex items-center justify-center py-10 text-xs sm:text-sm text-slate-600">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-2">
                <label className="text-xs font-semibold text-slate-700">Session</label>
                <input
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="2026-27"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="text-xs font-semibold text-slate-700">Issue To</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIssueToType("DISTRIBUTOR")}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                      issueToType === "DISTRIBUTOR"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Distributor
                  </button>

                  <button
                    type="button"
                    onClick={() => setIssueToType("SCHOOL")}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                      issueToType === "SCHOOL"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <SchoolIcon className="w-4 h-4" />
                    School
                  </button>
                </div>
              </div>

              <div className="lg:col-span-4">
                <label className="text-xs font-semibold text-slate-700">
                  {issueToType === "DISTRIBUTOR" ? "Distributor" : "School"}
                </label>
                <select
                  value={issuedToId === "" ? "" : String(issuedToId)}
                  onChange={(e) => setIssuedToId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                >
                  <option value="">
                    Select {issueToType === "DISTRIBUTOR" ? "Distributor" : "School"}
                  </option>

                  {(issueToType === "DISTRIBUTOR" ? distributors : schools).map((x: any) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>

                {selectedParty && issueToType === "DISTRIBUTOR" && (
                  <div className="mt-1 text-[11px] text-slate-500">
                    {(selectedParty as Distributor).city ? `City: ${(selectedParty as Distributor).city}` : ""}
                    {(selectedParty as Distributor).mobile
                      ? `  •  Mobile: ${(selectedParty as Distributor).mobile}`
                      : ""}
                  </div>
                )}
              </div>

              <div className="lg:col-span-3">
                <label className="text-xs font-semibold text-slate-700">Bundle (Reserved)</label>
                <select
                  value={bundleId === "" ? "" : String(bundleId)}
                  onChange={(e) => setBundleId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                >
                  <option value="">Select Bundle</option>

                  {bundles.map((b) => (
                    <option key={b.id} value={b.id}>
                      {bundleLabel(b)}
                    </option>
                  ))}
                </select>

                {selectedBundle && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start gap-2">
                      <Layers className="w-4 h-4 text-indigo-600 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">
                          Bundle #{selectedBundle.id} • {selectedBundle.school?.name || `School #${selectedBundle.school_id}`}
                        </div>
                        {!!selectedBundle.notes?.trim() && (
                          <div className="mt-2 text-xs text-slate-700 flex items-start gap-2">
                            <NotebookPen className="w-4 h-4 text-slate-500 mt-0.5" />
                            <span className="line-clamp-2">{selectedBundle.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-10">
                <label className="text-xs font-semibold text-slate-700">Issue Notes (optional)</label>
                <input
                  ref={notesRef}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Example: Deliver with next transport / urgent / received by ..."
                />
              </div>

              <div className="lg:col-span-2 flex items-end">
                <button
                  type="button"
                  disabled={loading}
                  onClick={submitIssue}
                  className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-60"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  {loading ? "Issuing..." : "Issue"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Issued History */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-slate-900">Issued History</div>
                <div className="text-xs text-slate-500">
                  Session: <span className="font-semibold">{session}</span> • Records:{" "}
                  <span className="font-semibold">{kpi.total}</span> • Issued:{" "}
                  <span className="font-semibold">{kpi.issued}</span> • Cancelled:{" "}
                  <span className="font-semibold">{kpi.cancelled}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setShowCancelled((v) => !v)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold shadow-sm transition-all text-sm ${
                  showCancelled
                    ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
                title={showCancelled ? "Hide cancelled issues" : "Show cancelled issues"}
              >
                <XCircle className="w-4 h-4" />
                {showCancelled ? "Hide Cancelled" : "Show Cancelled"}
              </button>

              <div className="relative w-full sm:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={issueSearch}
                  onChange={(e) => setIssueSearch(e.target.value)}
                  placeholder="Search bundle / issue / school / notes"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => fetchIssues(session)}
                disabled={historyLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-60 text-sm"
              >
                <RefreshCcw className={`w-4 h-4 ${historyLoading ? "animate-spin" : ""}`} />
                Reload
              </button>
            </div>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-10 text-xs sm:text-sm text-slate-600">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading issued history...
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
              No issued records found for this session.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-4">Issue</th>
                    <th className="py-2 pr-4">Bundle</th>
                    <th className="py-2 pr-4">School</th>
                    <th className="py-2 pr-4">Issued To</th>
                    <th className="py-2 pr-4">Notes</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((x) => (
                    <tr key={x.id} className="border-t border-slate-100">
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">{x.issue_no || `#${x.id}`}</div>
                        <div className="text-xs text-slate-500">{x.issued_to_type}</div>
                      </td>

                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">Bundle #{x.bundle_id}</div>
                        <div className="text-xs text-slate-500">Session: {x.academic_session}</div>
                      </td>

                      <td className="py-3 pr-4">
                        {x.bundle?.school?.name ? (
                          <div className="font-semibold text-slate-900">{x.bundle.school.name}</div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {x.bundle?.notes ? (
                          <div className="text-xs text-slate-500 line-clamp-1">
                            <span className="font-semibold">Bundle:</span> {x.bundle.notes}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">{partyName(x)}</div>
                        <div className="text-xs text-slate-500">{partySub(x)}</div>
                      </td>

                      <td className="py-3 pr-4">
                        {displayNotes(x) ? (
                          <div className="text-slate-800 line-clamp-2">{displayNotes(x)}</div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${issueBadge(x.status)}`}>
                          {(x.status || "ISSUED").toUpperCase()}
                        </span>
                      </td>

                      <td className="py-3 pr-4 text-slate-700">{fmtDate(x.createdAt)}</td>

                      <td className="py-3 pr-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openIssueDetails(x)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                          >
                            <Eye className="w-4 h-4" />
                            Details
                          </button>

                          {(x.status || "ISSUED").toUpperCase() === "ISSUED" && (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => cancelIssue(x)}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-semibold shadow hover:shadow-md disabled:opacity-60"
                            >
                              <XCircle className="w-4 h-4" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Details Modal */}
      {modalOpen && selectedIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setModalOpen(false);
              setSelectedIssue(null);
            }}
          />
          <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-indigo-600" />
                  Issue Details
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Issue: <span className="font-semibold">{selectedIssue.issue_no || `#${selectedIssue.id}`}</span> •
                  Bundle: <span className="font-semibold">#{selectedIssue.bundle_id}</span> •
                  Session: <span className="font-semibold">{selectedIssue.academic_session}</span>
                </div>
              </div>

              <button
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
                onClick={() => {
                  setModalOpen(false);
                  setSelectedIssue(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Issued To</div>
                  <div className="font-bold text-slate-900">{partyName(selectedIssue)}</div>
                  <div className="text-xs text-slate-500">Type: {selectedIssue.issued_to_type}</div>
                  {partySub(selectedIssue) ? <div className="text-xs text-slate-500 mt-1">{partySub(selectedIssue)}</div> : null}
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${issueBadge(selectedIssue.status)}`}>
                      {(selectedIssue.status || "ISSUED").toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Date: {fmtDate(selectedIssue.createdAt)}</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <ListOrdered className="w-3.5 h-3.5" /> Quantity Summary
                  </div>
                  <div className="mt-1 text-sm text-slate-800">
                    Titles: <span className="font-semibold">{modalTotals.totalTitles}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-800">
                    Issued: <span className="font-semibold">{modalTotals.totalIssued}</span> • Reserved:{" "}
                    <span className="font-semibold">{modalTotals.totalReserved}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <IndianRupee className="w-3.5 h-3.5" /> Amount Summary
                  </div>
                  <div className="mt-1 text-sm text-slate-800">
                    Issued Amount: <span className="font-semibold">₹ {money(modalTotals.totalAmountIssued)}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-800">
                    Reserved Amount: <span className="font-semibold">₹ {money(modalTotals.totalAmountReserved)}</span>
                  </div>
                  <div className="mt-2 text-base font-bold text-slate-900">
                    Total: ₹ {money(modalTotals.grandTotal)}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <NotebookPen className="w-4 h-4 text-slate-500" />
                    Bundle Notes
                  </div>
                  <div className="text-slate-900 mt-1">
                    {selectedIssue.bundle?.notes?.trim() ? (
                      <span className="whitespace-pre-wrap">{selectedIssue.bundle.notes}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-slate-500" />
                    Issue Notes
                  </div>
                  <div className="text-slate-900 mt-1">
                    {displayNotes(selectedIssue) ? (
                      <span className="whitespace-pre-wrap">{displayNotes(selectedIssue)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Class-wise items */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 font-bold text-slate-900">
                  Items (Class-wise) • Showing Issued & Reserved + Price + Total
                </div>

                <div className="p-4 space-y-4">
                  {!selectedIssue.bundle?.items?.length ? (
                    <div className="text-sm text-slate-600">Items not included in this response.</div>
                  ) : (
                    modalGroups.map((g) => {
                      const groupTotal = g.items.reduce((s, it) => {
                        const rate = bookRate(it.book);
                        return s + rate * (toNum(it.issued_qty) + toNum(it.reserved_qty));
                      }, 0);

                      return (
                        <div key={g.class_name} className="rounded-xl border border-slate-200 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2 bg-white">
                            <div className="font-semibold text-slate-900">{g.class_name}</div>
                            <div className="text-sm text-slate-700">
                              Class Total: <span className="font-bold">₹ {money(groupTotal)}</span>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="text-left text-slate-600 bg-slate-50">
                                  <th className="py-2 px-4">Book</th>
                                  <th className="py-2 px-4">Issued</th>
                                  <th className="py-2 px-4">Reserved</th>
                                  <th className="py-2 px-4">Unit Price</th>
                                  <th className="py-2 px-4">Line Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.items.map((it) => {
                                  const rate = bookRate(it.book);
                                  const lineQty = toNum(it.issued_qty) + toNum(it.reserved_qty);
                                  const lineTotal = rate * lineQty;

                                  return (
                                    <tr key={it.id} className="border-t border-slate-100">
                                      <td className="py-2 px-4 font-semibold text-slate-900">
                                        {it.book?.title || `Book #${it.book_id}`}
                                      </td>
                                      <td className="py-2 px-4">{toNum(it.issued_qty)}</td>
                                      <td className="py-2 px-4">{toNum(it.reserved_qty)}</td>
                                      <td className="py-2 px-4">₹ {money(rate)}</td>
                                      <td className="py-2 px-4 font-semibold">₹ {money(lineTotal)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50">
                            Note: If price shows ₹ 0, backend is not sending rate/selling_price/mrp.
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {(selectedIssue.status || "ISSUED").toUpperCase() === "ISSUED" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => cancelIssue(selectedIssue)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-semibold shadow hover:shadow-md disabled:opacity-60"
                  >
                    <XCircle className="w-4 h-4" />
                    Cancel Issue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm sm:text-base ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};

export default IssueBundlesPageClient;
