"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  RefreshCcw,
  Search,
  ChevronDown,
  ChevronLeft,
  School as SchoolIcon,
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  X,
  Filter,
  Download,
  Sparkles,
} from "lucide-react";

/* ---------- Types ---------- */

type School = {
  id: number;
  name: string;
};

type PartyMini = {
  id: number;
  name: string;
};

type BookRow = {
  book_id: number;
  title: string;
  subject?: string | null;
  code?: string | null;

  // ✅ from backend
  publisher?: PartyMini | null;
  supplier?: PartyMini | null;

  required_qty: number;
  available_qty: number;
  reserved_qty: number;
  issued_qty: number;

  // optional
  free_qty?: number;

  // optional (if you later send it)
  source?: "REQ" | "DIRECT" | "BOTH";
};

type ClassBlock = {
  class_name: string;
  books: BookRow[];
};

type AvailabilityResponse = {
  mode: string;
  school: School;
  academic_session: string | null;
  classes: ClassBlock[];
};

type BookStatus = {
  type: "ok" | "short" | "noreq";
  shortBy: number;
  freeQty: number;
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

const safeStr = (v: any) => String(v ?? "").trim();

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const freeOf = (b: BookRow) => {
  const backendFree = b.free_qty;
  if (backendFree !== undefined && backendFree !== null) return Math.max(0, num(backendFree));
  return Math.max(0, num(b.available_qty) - num(b.reserved_qty));
};

const statusOf = (b: BookRow): BookStatus => {
  const req = num(b.required_qty);
  const freeQty = freeOf(b);

  if (req <= 0) return { type: "noreq", shortBy: 0, freeQty };
  if (freeQty >= req) return { type: "ok", shortBy: 0, freeQty };
  return { type: "short", shortBy: req - freeQty, freeQty };
};

const fmtInt = (v: any) => {
  const n = Math.floor(num(v));
  return Number.isFinite(n) ? String(n) : "0";
};

const AvailabilityClient: React.FC = () => {
  const { user } = useAuth();

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<number | "">("");

  // ✅ Default session selected (first option) by default
  const [session, setSession] = useState<string>(() => SESSION_OPTIONS[0] || "");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UX
  const [q, setQ] = useState("");
  const [openClasses, setOpenClasses] = useState<Record<string, boolean>>({});

  // ✅ NEW UX filters
  const [show, setShow] = useState<"ALL" | "SHORT" | "OK" | "NOREQ">("ALL");
  const [onlyShortClasses, setOnlyShortClasses] = useState(false);

  /* ---------- Load Schools ---------- */
  useEffect(() => {
    const loadSchools = async () => {
      try {
        const res = await api.get("/api/schools");
        setSchools(normalizeSchools(res?.data));
      } catch (err) {
        console.error("Failed to load schools", err);
        setSchools([]);
      }
    };
    loadSchools();
  }, []);

  /* ---------- Load Availability ---------- */
  const loadAvailability = async () => {
    if (!schoolId) return;
    setError(null);

    try {
      setLoading(true);
      const res = await api.get("/api/school-orders/availability", {
        params: {
          school_id: schoolId,              // ✅ was schoolId
          academic_session: session || undefined,
        },
      });

      const payload: AvailabilityResponse = res.data;
      setData(payload);

      // ✅ Auto-open all classes on first load (or when switching school)
      const nextOpen: Record<string, boolean> = {};
      (payload?.classes || []).forEach((c) => (nextOpen[c.class_name] = true));
      setOpenClasses(nextOpen);
    } catch (err: any) {
      console.error("Failed to load availability", err);
      setData(null);
      setError(err?.response?.data?.message || "Failed to load availability.");
    } finally {
      setLoading(false);
    }
  };

  const selectedSchool = useMemo(() => {
    const idNum = Number(schoolId);
    return schools.find((s) => s.id === idNum);
  }, [schools, schoolId]);

  const summary = useMemo(() => {
    let totalBooks = 0;
    let okCount = 0;
    let shortCount = 0;
    let noReqCount = 0;

    let totalShortQty = 0;
    let reqTotal = 0;

    let avlTotal = 0;
    let reservedTotal = 0;
    let freeTotal = 0;
    let issuedTotal = 0;

    (data?.classes || []).forEach((cls) => {
      (cls.books || []).forEach((b) => {
        totalBooks += 1;
        const st = statusOf(b);

        if (st.type === "noreq") {
          noReqCount += 1;
        } else if (st.type === "short") {
          shortCount += 1;
          totalShortQty += st.shortBy;
        } else if (st.type === "ok") {
          okCount += 1;
        }

        reqTotal += num(b.required_qty);
        avlTotal += num(b.available_qty);
        reservedTotal += num(b.reserved_qty);
        freeTotal += st.freeQty;
        issuedTotal += num(b.issued_qty);
      });
    });

    return {
      totalBooks,
      okCount,
      shortCount,
      noReqCount,
      totalShortQty,
      reqTotal,
      avlTotal,
      reservedTotal,
      freeTotal,
      issuedTotal,
    };
  }, [data]);

  const filteredAndSortedClasses = useMemo(() => {
    const query = safeStr(q).toLowerCase();
    const classes = data?.classes || [];

    const wanted = (b: BookRow) => {
      const st = statusOf(b);
      if (show === "ALL") return true;
      if (show === "SHORT") return st.type === "short";
      if (show === "OK") return st.type === "ok";
      if (show === "NOREQ") return st.type === "noreq";
      return true;
    };

    let filtered = classes
      .map((cls) => {
        const books = (cls.books || [])
          .filter((b) => {
            const pub = b.publisher?.name || "";
            const sup = b.supplier?.name || "";
            const hay = `${b.title || ""} ${b.subject || ""} ${b.code || ""} ${pub} ${sup}`.toLowerCase();
            if (query && !hay.includes(query)) return false;
            return wanted(b);
          })
          .sort((x, y) => {
            // ✅ Within class: Short first, then by title
            const ax = statusOf(x).type === "short" ? 0 : 1;
            const ay = statusOf(y).type === "short" ? 0 : 1;
            if (ax !== ay) return ax - ay;
            return (x.title || "").localeCompare(y.title || "");
          });

        return { ...cls, books };
      })
      .filter((cls) => cls.books.length > 0);

    if (onlyShortClasses) {
      filtered = filtered.filter((cls) => cls.books.some((b) => statusOf(b).type === "short"));
    }

    // ✅ Sort: classes with shorts first, then by class name (numeric-aware)
    filtered.sort((a, b) => {
      const shortA = a.books.filter((book) => statusOf(book).type === "short").length;
      const shortB = b.books.filter((book) => statusOf(book).type === "short").length;
      if (shortA !== shortB) return shortB - shortA;
      return a.class_name.localeCompare(b.class_name, undefined, { numeric: true });
    });

    return filtered;
  }, [data, q, show, onlyShortClasses]);

  const toggleAll = (open: boolean) => {
    const next: Record<string, boolean> = {};
    (data?.classes || []).forEach((c) => (next[c.class_name] = open));
    setOpenClasses(next);
  };

  // ✅ NEW: Export current view to CSV (for quick director sharing)
  const exportCsv = () => {
    if (!data) return;

    const rows: string[][] = [];
    rows.push([
      "School",
      "Session",
      "Class",
      "Book",
      "Subject",
      "Code",
      "Publisher",
      "Supplier",
      "Required",
      "Available",
      "Reserved",
      "Free",
      "Issued",
      "Status",
    ]);

    (filteredAndSortedClasses || []).forEach((cls) => {
      (cls.books || []).forEach((b) => {
        const st = statusOf(b);
        const pubName = b.publisher?.name ? safeStr(b.publisher.name) : "";
        const supName = b.supplier?.name ? safeStr(b.supplier.name) : "";
        const statusText =
          st.type === "ok" ? "OK" : st.type === "short" ? `Short by ${st.shortBy}` : "No requirement";

        rows.push([
          data.school?.name || "",
          data.academic_session || "",
          cls.class_name || "",
          safeStr(b.title),
          safeStr(b.subject),
          safeStr(b.code),
          pubName,
          supName,
          fmtInt(b.required_qty),
          fmtInt(b.available_qty),
          fmtInt(b.reserved_qty),
          fmtInt(st.freeQty),
          fmtInt(b.issued_qty),
          statusText,
        ]);
      });
    });

    const esc = (s: string) => `"${String(s ?? "").replaceAll('"', '""')}"`;
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `school-stock-${data.school?.name || "school"}-${data.academic_session || "session"}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {/* Sticky Top Bar */}
      <header className="sticky top-0 z-20 bg-white/92 backdrop-blur-md border-b border-slate-200 shadow-sm">
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

              <div className="h-10 w-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Layers className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <div className="text-base font-extrabold tracking-tight truncate flex items-center gap-2">
                  School Stock Status
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Sparkles className="w-3 h-3" />
                    improved
                  </span>
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {selectedSchool?.name ? (
                    <>
                      <SchoolIcon className="inline w-4 h-4 mr-1" />
                      {selectedSchool.name}
                      {data?.academic_session ? ` • ${data.academic_session}` : ""}
                    </>
                  ) : (
                    <>Select a school to check stock availability</>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-600 shrink-0 hidden sm:block">{user?.name || "User"}</div>
        </div>

        {/* Filters */}
        <div className="px-4 pb-4">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-12 md:col-span-5">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">School</label>
              <select
                className="w-full border border-slate-300 rounded-2xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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

            <div className="col-span-12 sm:col-span-6 md:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Session</label>
              <select
                className="w-full border border-slate-300 rounded-2xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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

            <div className="col-span-12 sm:col-span-6 md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Search book</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  className={`w-full border border-slate-300 rounded-2xl pl-10 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                    q ? "pr-10" : "pr-4"
                  }`}
                  placeholder="Title / subject / code / publisher / supplier…"
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

            <div className="col-span-12 md:col-span-2">
              <button
                onClick={loadAvailability}
                disabled={!schoolId || loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
              >
                <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Loading…" : "Check"}
              </button>
            </div>
          </div>

          {/* ✅ NEW: Quick filters row */}
          {data && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                <Filter className="w-4 h-4" />
                Filters
              </span>

              <button
                type="button"
                onClick={() => setShow("ALL")}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${
                  show === "ALL" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300 hover:bg-slate-100"
                }`}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => setShow("SHORT")}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${
                  show === "SHORT" ? "bg-rose-600 text-white border-rose-600" : "bg-white border-slate-300 hover:bg-slate-100"
                }`}
              >
                Short only
              </button>

              <button
                type="button"
                onClick={() => setShow("OK")}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${
                  show === "OK" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-300 hover:bg-slate-100"
                }`}
              >
                OK only
              </button>

              <button
                type="button"
                onClick={() => setShow("NOREQ")}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${
                  show === "NOREQ" ? "bg-slate-600 text-white border-slate-600" : "bg-white border-slate-300 hover:bg-slate-100"
                }`}
              >
                No-Req only
              </button>

              <label className="ml-2 inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={onlyShortClasses}
                  onChange={(e) => setOnlyShortClasses(e.target.checked)}
                />
                Show only classes with Short
              </label>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleAll(true)}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={() => toggleAll(false)}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
                >
                  Collapse all
                </button>

                <button
                  type="button"
                  onClick={exportCsv}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition inline-flex items-center gap-2"
                  title="Export current view as CSV"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>
          )}

          {/* Summary chips */}
          {data && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[11px] text-slate-500">Books</div>
                <div className="text-lg font-extrabold">{summary.totalBooks}</div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                <div className="text-[11px] text-emerald-700">OK</div>
                <div className="text-lg font-extrabold text-emerald-900">{summary.okCount}</div>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 shadow-sm">
                <div className="text-[11px] text-rose-700">Short</div>
                <div className="text-lg font-extrabold text-rose-900">{summary.shortCount}</div>
                {summary.totalShortQty > 0 && (
                  <div className="text-[11px] text-rose-700 mt-0.5">Qty short: {summary.totalShortQty}</div>
                )}
              </div>

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 shadow-sm">
                <div className="text-[11px] text-indigo-700">Required (Total)</div>
                <div className="text-lg font-extrabold text-indigo-900">{summary.reqTotal}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[11px] text-slate-500">Free (Total)</div>
                <div className="text-lg font-extrabold">{summary.freeTotal}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Avl {summary.avlTotal} • Res {summary.reservedTotal}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[11px] text-slate-500">Issued</div>
                <div className="text-lg font-extrabold">{summary.issuedTotal}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">No-Req {summary.noReqCount}</div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="p-4 max-w-7xl mx-auto">
        {/* Empty / hint */}
        {!loading && !data && (
          <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center text-slate-600 shadow-sm">
            <div className="text-lg font-extrabold mb-2 text-slate-800">Ready to check availability?</div>
            <div className="text-sm">
              Select a school and click <b>Check</b> to view book-wise stock status.
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="h-5 w-48 bg-slate-100 rounded mb-4 animate-pulse" />
                <div className="space-y-3">
                  <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-11/12 bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-10/12 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && data && (
          <>
            {filteredAndSortedClasses.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center text-slate-600 shadow-sm">
                {q || show !== "ALL" || onlyShortClasses ? (
                  <>
                    <div className="text-lg font-extrabold mb-1 text-slate-800">No matching books</div>
                    <div className="text-sm">
                      Try different search keywords or switch filters.
                    </div>
                    <div className="mt-4 flex justify-center gap-2">
                      <button
                        className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
                        onClick={() => {
                          setQ("");
                          setShow("ALL");
                          setOnlyShortClasses(false);
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-extrabold mb-1 text-slate-800">No requirements found</div>
                    <div className="text-sm">This school has no book requirements for the selected session.</div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAndSortedClasses.map((cls) => {
                  const isOpen = openClasses[cls.class_name] ?? true;

                  const clsOk = cls.books.filter((b) => statusOf(b).type === "ok").length;
                  const clsShort = cls.books.filter((b) => statusOf(b).type === "short").length;
                  const clsNoReq = cls.books.filter((b) => statusOf(b).type === "noreq").length;

                  return (
                    <section
                      key={cls.class_name}
                      className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenClasses((prev) => ({
                            ...prev,
                            [cls.class_name]: !(prev[cls.class_name] ?? true),
                          }))
                        }
                        className={`w-full px-5 py-4 flex items-center justify-between transition ${
                          clsShort > 0 ? "bg-rose-50/70 hover:bg-rose-100" : "bg-slate-50 hover:bg-slate-100"
                        } border-b border-slate-200`}
                      >
                        <div className="min-w-0 text-left">
                          <div className={`text-base font-extrabold truncate ${clsShort > 0 ? "text-rose-900" : ""}`}>
                            Class: {cls.class_name}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Books: {cls.books.length} • OK: {clsOk} • Short: {clsShort}
                            {clsNoReq > 0 ? ` • No-Req: ${clsNoReq}` : ""}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                            OK {clsOk}
                          </span>
                          {clsShort > 0 && (
                            <span className="text-[11px] px-3 py-1.5 rounded-full bg-rose-200 text-rose-900 border border-rose-300 font-extrabold">
                              Short {clsShort}
                            </span>
                          )}
                          {clsNoReq > 0 && (
                            <span className="text-[11px] px-3 py-1.5 rounded-full bg-slate-200/70 text-slate-800 border border-slate-300 font-semibold">
                              No-Req {clsNoReq}
                            </span>
                          )}
                          <ChevronDown
                            className={`w-5 h-5 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>

                      {isOpen && (
                        <div className="p-4 overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead className="bg-slate-100 sticky top-0">
                              <tr>
                                <th className="border-b-2 border-slate-300 px-4 py-3 text-left font-extrabold text-slate-800 min-w-[380px]">
                                  Book (Publisher / Supplier)
                                </th>
                                <th className="border-b-2 border-slate-300 px-4 py-3 text-center font-extrabold text-slate-800 w-28">
                                  Required
                                </th>
                                <th className="border-b-2 border-slate-300 px-4 py-3 text-center font-extrabold text-slate-800 w-28">
                                  Available
                                </th>
                                <th className="border-b-2 border-slate-300 px-4 py-3 text-center font-extrabold text-slate-800 w-28">
                                  Reserved
                                </th>
                                <th className="border-b-2 border-slate-300 px-4 py-3 text-center font-extrabold text-slate-800 w-24">
                                  Free
                                </th>
                                <th className="border-b-2 border-slate-300 px-4 py-3 text-center font-extrabold text-slate-800 w-28">
                                  Issued
                                </th>
                                <th className="border-b-2 border-slate-300 px-4 py-3 text-left font-extrabold text-slate-800 w-44">
                                  Status
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {cls.books.map((b) => {
                                const st = statusOf(b);

                                let badgeClass = "bg-slate-50 text-slate-700 border-slate-200";
                                let IconComponent: any = MinusCircle;
                                let statusText = "No requirement";

                                if (st.type === "ok") {
                                  badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
                                  IconComponent = CheckCircle2;
                                  statusText = "OK";
                                } else if (st.type === "short") {
                                  badgeClass = "bg-rose-100 text-rose-800 border-rose-200";
                                  IconComponent = XCircle;
                                  statusText = `Short by ${st.shortBy}`;
                                }

                                const pubName = b.publisher?.name ? safeStr(b.publisher.name) : "";
                                const supName = b.supplier?.name ? safeStr(b.supplier.name) : "";

                                return (
                                  <tr
                                    key={b.book_id}
                                    className={`border-b border-slate-100 transition hover:bg-slate-50 ${
                                      st.type === "short"
                                        ? "bg-rose-50/40"
                                        : st.type === "noreq"
                                        ? "bg-slate-50/30"
                                        : ""
                                    }`}
                                  >
                                    <td className="px-4 py-3">
                                      <div className="font-semibold text-slate-900">{b.title}</div>

                                      <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                                        <div>
                                          {b.subject && <span>{b.subject}</span>}
                                          {b.code && (
                                            <span>
                                              {b.subject ? " • " : ""}
                                              {b.code}
                                            </span>
                                          )}
                                        </div>

                                        {(pubName || supName) && (
                                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                                            {pubName && (
                                              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-700">
                                                <span className="text-slate-500 mr-1">Pub:</span>
                                                <span className="font-medium">{pubName}</span>
                                              </span>
                                            )}
                                            {supName && (
                                              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-700">
                                                <span className="text-slate-500 mr-1">Sup:</span>
                                                <span className="font-medium">{supName}</span>
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </td>

                                    <td className="px-4 py-3 text-center font-semibold">{fmtInt(b.required_qty)}</td>
                                    <td className="px-4 py-3 text-center font-semibold">{fmtInt(b.available_qty)}</td>
                                    <td className="px-4 py-3 text-center font-semibold">{fmtInt(b.reserved_qty)}</td>
                                    <td className="px-4 py-3 text-center font-extrabold">{fmtInt(st.freeQty)}</td>
                                    <td className="px-4 py-3 text-center font-semibold">{fmtInt(b.issued_qty)}</td>

                                    <td className="px-4 py-3">
                                      <span
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${badgeClass}`}
                                      >
                                        {IconComponent && <IconComponent className="w-4 h-4" />}
                                        {statusText}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
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

export default AvailabilityClient;
