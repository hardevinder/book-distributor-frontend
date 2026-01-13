"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronLeft,
  RefreshCcw,
  Search,
  X,
  AlertTriangle,
  ChevronDown,
  Layers,
  School as SchoolIcon,
  Building2,
  FileText,
  PackageOpen,
  Lock,
} from "lucide-react";

/* ---------- Types (UPDATED to match new API) ---------- */

type School = { id: number; name: string };
type SupplierMini = { id: number; name: string };

type ReportBookRow = {
  order_id: number;
  order_no: string;
  order_date: string;
  academic_session: string | null;
  status: string;
  bill_no: string | null;

  supplier: SupplierMini | null;

  book_id: number;
  title: string;
  class_name: string;
  subject?: string | null;
  code?: string | null;

  ordered_qty: number;
  received_qty: number;
  pending_qty: number;

  rate: number;
  gross_amount: number;
  discount_pct: number | null;
  discount_amt: number | null;

  net_unit_price: number;

  ordered_net_amount: number;
  received_net_amount: number;
  pending_net_amount: number;
};

type ReportClassBlock = {
  class_name: string;
  totals: {
    orderedQty: number;
    receivedQty: number;
    pendingQty: number;
    gross: number;
    orderedNet: number;
    receivedNet: number;
    pendingNet: number;
  };
  books: ReportBookRow[];
};

type SupplierBlock = {
  supplier: SupplierMini | null;
  totals: {
    orderedQty: number;
    receivedQty: number;
    pendingQty: number;
    gross: number;
    orderedNet: number;
    receivedNet: number;
    pendingNet: number;
  };
  classes: ReportClassBlock[];
};

type ReportResponse = {
  mode: string;
  school: School;
  academic_session: string | null;
  filters: {
    supplierId: number | null;
    from: string | null;
    to: string | null;
    includeDraft: boolean;
    view: "ALL" | "RECEIVED" | "PENDING" | string;
  };
  totals: {
    orderedQty: number;
    receivedQty: number;
    pendingQty: number;
    gross: number;
    orderedNet: number;
    receivedNet: number;
    pendingNet: number;
  };
  suppliers: SupplierBlock[];
};

const SESSION_OPTIONS = (() => {
  const base = 2026;
  const arr: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const y1 = base + i;
    const y2Short = String((y1 + 1) % 100).padStart(2, "0");
    arr.push(`${y1}-${y2Short}`);
  }
  return arr;
})();

const normalizeSchools = (payload: any): School[] => {
  if (Array.isArray(payload)) return payload as School[];
  if (payload && Array.isArray(payload.data)) return payload.data as School[];
  if (payload && Array.isArray(payload.rows)) return payload.rows as School[];
  if (payload && Array.isArray(payload.schools)) return payload.schools as School[];
  return [];
};

const normalizeSuppliers = (payload: any): SupplierMini[] => {
  if (Array.isArray(payload)) return payload as SupplierMini[];
  if (payload && Array.isArray(payload.data)) return payload.data as SupplierMini[];
  if (payload && Array.isArray(payload.rows)) return payload.rows as SupplierMini[];
  if (payload && Array.isArray(payload.suppliers)) return payload.suppliers as SupplierMini[];
  return [];
};

const safeStr = (v: any) => String(v ?? "").trim();

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtINR = (v: any) => {
  const n = num(v);
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
};

const dateLabel = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = safeStr(status).toLowerCase();
  let cls = "bg-slate-100 text-slate-700 border-slate-200";
  if (s === "completed") cls = "bg-emerald-100 text-emerald-800 border-emerald-200";
  else if (s === "partial_received") cls = "bg-amber-100 text-amber-900 border-amber-200";
  else if (s === "sent") cls = "bg-indigo-100 text-indigo-800 border-indigo-200";
  else if (s === "cancelled") cls = "bg-rose-100 text-rose-800 border-rose-200";
  else if (s === "draft") cls = "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
};

const ViewPill: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({
  active,
  onClick,
  label,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
      active
        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
    }`}
  >
    {label}
  </button>
);

/* ---------- Auth header helper ---------- */
/**
 * ✅ Fixes 401: adds Authorization header explicitly.
 * - tries user.token / user.accessToken / localStorage
 */
function getAuthHeaders(user: any) {
  let token =
    user?.token ||
    user?.accessToken ||
    user?.jwt ||
    "";

  if (!token && typeof window !== "undefined") {
    token =
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("jwt") ||
      "";
  }

  token = safeStr(token);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const SchoolPublisherBillingPageClient: React.FC = () => {
  const { user } = useAuth();

  const [schools, setSchools] = useState<School[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierMini[]>([]);

  const [schoolId, setSchoolId] = useState<number | "">("");
  const [supplierId, setSupplierId] = useState<number | "">("");

  const [session, setSession] = useState<string>(() => SESSION_OPTIONS[0] || "");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [view, setView] = useState<"ALL" | "RECEIVED" | "PENDING">("ALL");
  const [includeDraft, setIncludeDraft] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ masters loading state
  const [mastersErr, setMastersErr] = useState<string | null>(null);
  const [mastersLoading, setMastersLoading] = useState(false);

  // UX
  const [q, setQ] = useState("");
  const [openSuppliers, setOpenSuppliers] = useState<Record<string, boolean>>({});
  const [openClasses, setOpenClasses] = useState<Record<string, boolean>>({});

  /* ---------- Load Schools + Suppliers (AUTH FIX) ---------- */
  useEffect(() => {
    const run = async () => {
      setMastersErr(null);
      setMastersLoading(true);
      try {
        const headers = getAuthHeaders(user);

        const [sRes, supRes] = await Promise.all([
          api.get("/api/schools", { headers }),
          api.get("/api/suppliers", { headers }),
        ]);

        setSchools(normalizeSchools(sRes?.data));
        setSuppliers(normalizeSuppliers(supRes?.data));
      } catch (err: any) {
        console.error("Failed to load masters", err);

        const status = err?.response?.status;
        if (status === 401) {
          setMastersErr("Unauthorized (401). Token missing/invalid. Please login again, then refresh this page.");
        } else {
          setMastersErr(err?.response?.data?.error || err?.message || "Failed to load schools/suppliers.");
        }
      } finally {
        setMastersLoading(false);
      }
    };

    // ✅ run when user changes (token becomes available)
    run();
  }, [user]);

  const selectedSchool = useMemo(() => {
    const idNum = Number(schoolId);
    return schools.find((s) => s.id === idNum);
  }, [schools, schoolId]);

  const selectedSupplier = useMemo(() => {
    const idNum = Number(supplierId);
    return suppliers.find((s) => s.id === idNum);
  }, [suppliers, supplierId]);

  /* ---------- Load Report ---------- */
  const loadReport = async () => {
    if (!schoolId) return;

    setError(null);
    try {
      setLoading(true);

      const headers = getAuthHeaders(user);

      const res = await api.get("/api/reports/school-supplier-billing", {
        headers,
        params: {
          schoolId,
          academic_session: session || undefined,
          supplierId: supplierId || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          includeDraft: includeDraft ? "true" : undefined,
          view: view || undefined,
        },
      });

      const payload: ReportResponse = res.data;
      setData(payload);

      // Auto-open supplier + all classes on first load
      const sOpen: Record<string, boolean> = {};
      const cOpen: Record<string, boolean> = {};

      (payload.suppliers || []).forEach((sb) => {
        const key = sb.supplier?.id ? String(sb.supplier.id) : "0";
        sOpen[key] = true;
        (sb.classes || []).forEach((c) => {
          cOpen[`${key}__${c.class_name}`] = true;
        });
      });

      setOpenSuppliers((prev) => (Object.keys(prev).length ? prev : sOpen));
      setOpenClasses((prev) => (Object.keys(prev).length ? prev : cOpen));
    } catch (err: any) {
      console.error("Failed to load report", err);
      setData(null);

      const status = err?.response?.status;
      if (status === 401) {
        setError("Unauthorized (401). Please login again, then try Load.");
      } else {
        setError(err?.response?.data?.message || err?.response?.data?.error || "Failed to load report.");
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    const query = safeStr(q).toLowerCase();
    const blocks = data?.suppliers || [];
    if (!query) return blocks;

    return blocks
      .map((sb) => {
        const classes = (sb.classes || [])
          .map((cls) => {
            const books = (cls.books || []).filter((b) => {
              const sup = sb.supplier?.name || "";
              const hay = `${b.title || ""} ${b.subject || ""} ${b.code || ""} ${sup} ${b.order_no || ""} ${
                b.bill_no || ""
              } ${b.class_name || ""}`.toLowerCase();
              return hay.includes(query);
            });
            return { ...cls, books };
          })
          .filter((c) => c.books.length > 0);

        return { ...sb, classes };
      })
      .filter((sb) => sb.classes.length > 0);
  }, [data, q]);

  const summary = useMemo(() => {
    if (data?.totals) {
      return {
        orderedQty: num(data.totals.orderedQty),
        receivedQty: num(data.totals.receivedQty),
        pendingQty: num(data.totals.pendingQty),
        gross: num(data.totals.gross),
        orderedNet: num(data.totals.orderedNet),
        receivedNet: num(data.totals.receivedNet),
        pendingNet: num(data.totals.pendingNet),
      };
    }

    let orderedQty = 0,
      receivedQty = 0,
      pendingQty = 0,
      gross = 0,
      orderedNet = 0,
      receivedNet = 0,
      pendingNet = 0;

    (data?.suppliers || []).forEach((sb) => {
      orderedQty += num(sb.totals?.orderedQty);
      receivedQty += num(sb.totals?.receivedQty);
      pendingQty += num(sb.totals?.pendingQty);
      gross += num(sb.totals?.gross);
      orderedNet += num(sb.totals?.orderedNet);
      receivedNet += num(sb.totals?.receivedNet);
      pendingNet += num(sb.totals?.pendingNet);
    });

    return { orderedQty, receivedQty, pendingQty, gross, orderedNet, receivedNet, pendingNet };
  }, [data]);

  const toggleAll = (open: boolean) => {
    const sOpen: Record<string, boolean> = {};
    const cOpen: Record<string, boolean> = {};
    (data?.suppliers || []).forEach((sb) => {
      const key = sb.supplier?.id ? String(sb.supplier.id) : "0";
      sOpen[key] = open;
      (sb.classes || []).forEach((c) => (cOpen[`${key}__${c.class_name}`] = open));
    });
    setOpenSuppliers(sOpen);
    setOpenClasses(cOpen);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Sticky Top Bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                Desktop
              </Link>

              <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Layers className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <div className="text-base font-bold truncate">School • Supplier Billing</div>
                <div className="text-xs text-slate-500 truncate">
                  {selectedSchool?.name ? (
                    <>
                      <SchoolIcon className="inline w-4 h-4 mr-1" />
                      {selectedSchool.name}
                      {session ? ` • ${session}` : data?.academic_session ? ` • ${data.academic_session}` : ""}
                      {selectedSupplier?.name ? (
                        <>
                          {" "}
                          • <Building2 className="inline w-4 h-4 mx-1" />
                          {selectedSupplier.name}
                        </>
                      ) : (
                        ""
                      )}
                      {data?.filters?.view ? ` • ${data.filters.view}` : ""}
                    </>
                  ) : (
                    <>Select school and load supplier-wise billing</>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-600 shrink-0 hidden sm:block">{user?.name || "User"}</div>
        </div>

        {/* Masters (optional info banner) */}
        {(mastersLoading || mastersErr) && (
          <div className="px-4 pb-3">
            {mastersLoading && (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                Loading schools & suppliers…
              </div>
            )}
            {mastersErr && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                {mastersErr}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="px-4 pb-4">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-12 md:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">School</label>
              <select
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                value={schoolId}
                onChange={(e) => setSchoolId(Number(e.target.value) || "")}
              >
                <option value="">Select School</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-12 md:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Supplier (optional)</label>
              <select
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                value={supplierId}
                onChange={(e) => setSupplierId(Number(e.target.value) || "")}
              >
                <option value="">All Suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-12 sm:col-span-6 md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Session</label>
              <select
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                value={session}
                onChange={(e) => setSession(e.target.value)}
              >
                <option value="">Auto</option>
                {SESSION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-6 md:col-span-1">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">From</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div className="col-span-6 md:col-span-1">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">To</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            <div className="col-span-12 md:col-span-2">
              <button
                onClick={loadReport}
                disabled={!schoolId || loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
              >
                <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Loading…" : "Load"}
              </button>
            </div>
          </div>

          {/* View & Search Row */}
          <div className="grid grid-cols-12 gap-3 mt-3 items-end">
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">View</label>
              <div className="flex gap-2 flex-wrap">
                <ViewPill active={view === "ALL"} onClick={() => setView("ALL")} label="All" />
                <ViewPill active={view === "RECEIVED"} onClick={() => setView("RECEIVED")} label="Only Received" />
                <ViewPill active={view === "PENDING"} onClick={() => setView("PENDING")} label="Only Pending" />
                <button
                  type="button"
                  onClick={() => setIncludeDraft((p) => !p)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                    includeDraft
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                  title="Include draft orders"
                >
                  Draft: {includeDraft ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            <div className="col-span-12 md:col-span-6">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  className={`w-full border border-slate-300 rounded-xl pl-10 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                    q ? "pr-10" : "pr-4"
                  }`}
                  placeholder="Book / code / subject / supplier / order no / bill no…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="col-span-12 md:col-span-2 flex gap-2">
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
              >
                Expand
              </button>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
              >
                Collapse
              </button>
            </div>
          </div>

          {/* Summary chips */}
          {data && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                Ordered Qty: <b>{summary.orderedQty}</b>
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-medium">
                Received Qty: <b>{summary.receivedQty}</b>
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-bold">
                Pending Qty: <b>{summary.pendingQty}</b>
              </span>

              <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-medium">
                Gross: <b>₹{fmtINR(summary.gross)}</b>
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold">
                Ordered Net: <b>₹{fmtINR(summary.orderedNet)}</b>
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold">
                Received Net: <b>₹{fmtINR(summary.receivedNet)}</b>
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-bold">
                Pending Net: <b>₹{fmtINR(summary.pendingNet)}</b>
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="p-4 max-w-7xl mx-auto">
        {!loading && !data && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-600 shadow-sm">
            <div className="text-base font-medium mb-2">Ready?</div>
            <div className="text-sm">
              Select a school and click <b>Load</b> to view Ordered/Received/Pending and billing amounts supplier-wise.
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="h-5 w-52 bg-slate-100 rounded mb-4 animate-pulse" />
                <div className="space-y-3">
                  <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-11/12 bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-10/12 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && data && (
          <>
            {filteredSuppliers.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-600 shadow-sm">
                {q ? (
                  <>
                    <div className="text-base font-medium mb-1">No matching results</div>
                    <div className="text-sm">
                      No results for "<b>{q}</b>".
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-base font-medium mb-1">No data</div>
                    <div className="text-sm">No orders found for selected filters.</div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredSuppliers.map((sb) => {
                  const sKey = sb.supplier?.id ? String(sb.supplier.id) : "0";
                  const sOpen = openSuppliers[sKey] ?? true;
                  const sName = sb.supplier?.name ? sb.supplier.name : "Unknown Supplier";

                  return (
                    <section key={sKey} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md">
                      {/* Supplier Header */}
                      <button
                        type="button"
                        onClick={() =>
                          setOpenSuppliers((prev) => ({
                            ...prev,
                            [sKey]: !(prev[sKey] ?? true),
                          }))
                        }
                        className="w-full px-5 py-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition border-b border-slate-200"
                      >
                        <div className="min-w-0 text-left">
                          <div className="text-base font-bold truncate flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-slate-600" />
                            {sName}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Ordered: <b>{num(sb.totals.orderedQty)}</b> • Received: <b>{num(sb.totals.receivedQty)}</b>{" "}
                            • Pending: <b>{num(sb.totals.pendingQty)}</b> • Ordered Net:{" "}
                            <b>₹{fmtINR(sb.totals.orderedNet)}</b>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold">
                            Rec Net ₹{fmtINR(sb.totals.receivedNet)}
                          </span>
                          <span className="text-xs px-3 py-1.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-bold">
                            Pend Net ₹{fmtINR(sb.totals.pendingNet)}
                          </span>
                          <ChevronDown
                            className={`w-5 h-5 text-slate-500 transition-transform ${sOpen ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>

                      {sOpen && (
                        <div className="p-4 space-y-4">
                          {sb.classes.map((cls) => {
                            const cKey = `${sKey}__${cls.class_name}`;
                            const cOpen = openClasses[cKey] ?? true;

                            const clsOrdered = num(cls.totals?.orderedQty);
                            const clsReceived = num(cls.totals?.receivedQty);
                            const clsPending = num(cls.totals?.pendingQty);

                            const clsOrderedNet = num(cls.totals?.orderedNet);
                            const clsReceivedNet = num(cls.totals?.receivedNet);
                            const clsPendingNet = num(cls.totals?.pendingNet);

                            return (
                              <div key={cKey} className="border border-slate-200 rounded-2xl overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenClasses((prev) => ({
                                      ...prev,
                                      [cKey]: !(prev[cKey] ?? true),
                                    }))
                                  }
                                  className={`w-full px-4 py-3 flex items-center justify-between transition border-b border-slate-200 ${
                                    clsPending > 0 ? "bg-rose-50 hover:bg-rose-100" : "bg-white hover:bg-slate-50"
                                  }`}
                                >
                                  <div className="min-w-0 text-left">
                                    <div className={`text-sm font-bold truncate ${clsPending > 0 ? "text-rose-900" : ""}`}>
                                      Class: {cls.class_name}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                      Ordered: <b>{clsOrdered}</b> • Received: <b>{clsReceived}</b> • Pending:{" "}
                                      <b>{clsPending}</b> • Ordered Net: <b>₹{fmtINR(clsOrderedNet)}</b> • Rec Net:{" "}
                                      <b>₹{fmtINR(clsReceivedNet)}</b> • Pend Net: <b>₹{fmtINR(clsPendingNet)}</b>
                                    </div>
                                  </div>

                                  <ChevronDown
                                    className={`w-5 h-5 text-slate-500 transition-transform ${cOpen ? "rotate-180" : ""}`}
                                  />
                                </button>

                                {cOpen && (
                                  <div className="p-3 overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                      <thead className="bg-slate-100 sticky top-0">
                                        <tr>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-left font-bold text-slate-800 min-w-[360px]">
                                            Book
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-center font-bold text-slate-800 w-24">
                                            Ordered
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-center font-bold text-slate-800 w-24">
                                            Rec.
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-center font-bold text-slate-800 w-24">
                                            Pending
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-right font-bold text-slate-800 w-28">
                                            Rate
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-right font-bold text-slate-800 w-32">
                                            Gross
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-right font-bold text-slate-800 w-28">
                                            Disc.
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-right font-bold text-slate-800 w-28">
                                            Net/Unit
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-right font-bold text-slate-800 w-32">
                                            Ordered Net
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-right font-bold text-slate-800 w-32">
                                            Rec Net
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-right font-bold text-slate-800 w-32">
                                            Pend Net
                                          </th>
                                          <th className="border-b-2 border-slate-300 px-3 py-3 text-left font-bold text-slate-800 w-56">
                                            Order / Bill
                                          </th>
                                        </tr>
                                      </thead>

                                      <tbody>
                                        {cls.books.map((b) => {
                                          const isPending = num(b.pending_qty) > 0;

                                          const discLabel =
                                            b.discount_amt != null && num(b.discount_amt) > 0
                                              ? `₹${fmtINR(b.discount_amt)}`
                                              : b.discount_pct != null && num(b.discount_pct) > 0
                                              ? `${fmtINR(b.discount_pct)}%`
                                              : "-";

                                          return (
                                            <tr
                                              key={`${b.order_id}-${b.book_id}`}
                                              className={`border-b border-slate-100 transition hover:bg-slate-50 ${
                                                isPending ? "bg-rose-50/40" : ""
                                              }`}
                                            >
                                              <td className="px-3 py-3">
                                                <div className="font-semibold text-slate-900">{b.title}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">
                                                  {b.subject ? b.subject : ""}
                                                  {b.code ? ` • ${b.code}` : ""}
                                                </div>
                                              </td>

                                              <td className="px-3 py-3 text-center font-medium">{num(b.ordered_qty)}</td>
                                              <td className="px-3 py-3 text-center font-medium">{num(b.received_qty)}</td>

                                              <td className="px-3 py-3 text-center">
                                                {isPending ? (
                                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border bg-rose-100 text-rose-800 border-rose-200">
                                                    {num(b.pending_qty)}
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-800 border-emerald-200">
                                                    0
                                                  </span>
                                                )}
                                              </td>

                                              <td className="px-3 py-3 text-right font-medium">₹{fmtINR(b.rate)}</td>
                                              <td className="px-3 py-3 text-right font-medium">₹{fmtINR(b.gross_amount)}</td>
                                              <td className="px-3 py-3 text-right font-medium">{discLabel}</td>

                                              <td className="px-3 py-3 text-right font-semibold">
                                                ₹{fmtINR(b.net_unit_price)}
                                              </td>

                                              <td className="px-3 py-3 text-right font-bold">
                                                ₹{fmtINR(b.ordered_net_amount)}
                                              </td>

                                              <td className="px-3 py-3 text-right font-bold text-indigo-900">
                                                ₹{fmtINR(b.received_net_amount)}
                                              </td>

                                              <td className="px-3 py-3 text-right font-bold text-rose-900">
                                                ₹{fmtINR(b.pending_net_amount)}
                                              </td>

                                              <td className="px-3 py-3">
                                                <div className="flex items-start justify-between gap-2">
                                                  <div className="min-w-0">
                                                    <div className="text-xs text-slate-600 flex items-center gap-1">
                                                      <FileText className="w-4 h-4" />
                                                      <span className="font-semibold">{b.order_no}</span>
                                                      <span className="text-slate-400">•</span>
                                                      <span>{dateLabel(b.order_date)}</span>
                                                    </div>
                                                    {b.bill_no ? (
                                                      <div className="text-xs text-slate-600 mt-1">
                                                        Bill: <span className="font-semibold">{b.bill_no}</span>
                                                      </div>
                                                    ) : (
                                                      <div className="text-xs text-slate-400 mt-1">Bill: -</div>
                                                    )}
                                                  </div>
                                                  <StatusBadge status={b.status} />
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>

                                    {cls.books.length === 0 && (
                                      <div className="p-6 text-center text-sm text-slate-500">
                                        <PackageOpen className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                                        No items in this class for current filters.
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default SchoolPublisherBillingPageClient;
