// components/SalesAnalyticsPageClient.tsx
"use client";

/**
 * ✅ Sales Analytics (Distributor → School)
 * Window for distributor/admin to see:
 * - Total sold (Cash / Online / Credit)
 * - School-wise summary
 * - Drilldown: invoices list
 * - Credit outstanding list (party / phone wise)
 *
 * ⚠️ Backend endpoints assumed:
 *   GET  /api/sales-analytics/distributor-school-summary
 *   GET  /api/sales-analytics/distributor-school-sales
 *   GET  /api/sales-analytics/distributor-school-items        (optional tab)
 *   GET  /api/sales-analytics/credit-outstanding
 *
 * Masters:
 *   GET  /api/distributors
 *   GET  /api/schools
 *
 * Notes:
 * - If user.role === "DISTRIBUTOR" and user.distributor_id exists, distributor is locked.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import SearchableSelect from "@/components/SearchableSelect";
import {
  ChevronLeft,
  RefreshCcw,
  Building2,
  Users,
  IndianRupee,
  FileText,
  X,
  Eye,
  Phone,
  BadgeInfo,
} from "lucide-react";

/* ---------------- Types ---------------- */

type DistributorLite = {
  id: number;
  name: string;
  mobile?: string | null;
  city?: string | null;
};

type SchoolLite = {
  id: number;
  name: string;
  city?: string | null;
  is_active?: boolean;
};

type PaymentMode = "" | "CASH" | "ONLINE" | "CREDIT" | "UPI" | "CARD" | "BANK";

/**
 * ✅ Your UI wants this shape
 */
type SummaryRow = {
  distributor_id?: number | null;
  distributor_name?: string | null;

  school_id?: number | null;
  school_name?: string | null;

  // totals (numbers may arrive as string)
  total_qty?: number | string | null;
  gross_amount?: number | string | null;
  discount_amount?: number | string | null;

  // we will map backend total_amount -> net_amount
  net_amount?: number | string | null;

  // we will map backend split -> cash_amount / online_amount / credit_amount
  cash_amount?: number | string | null;
  online_amount?: number | string | null;
  credit_amount?: number | string | null;

  // we will map backend sales_count -> sale_count
  sale_count?: number | string | null;
};

type SummaryResponse = {
  rows?: any[];
  totals?: any;
};

type SaleRow = {
  id: number;
  invoice_no?: string | null;
  invoice_date?: string | null;
  sale_date?: string | null;

  distributor_id?: number | null;
  school_id?: number | null;

  payment_mode?: string | null; // CASH/ONLINE/CREDIT/...
  paid_amount?: number | string | null;
  total_amount?: number | string | null;
  balance_amount?: number | string | null;

  customer_name?: string | null;
  customer_phone?: string | null;

  created_at?: string | null;
};

type SalesListResponse = {
  rows?: SaleRow[];
};

type CreditRow = {
  school_id?: number | null;
  school_name?: string | null;

  distributor_id?: number | null;
  distributor_name?: string | null;

  customer_name?: string | null;
  customer_phone?: string | null;

  total_sales?: number | string | null;
  total_paid?: number | string | null;
  total_balance?: number | string | null;

  last_sale_date?: string | null;
};

type CreditResponse = {
  rows?: CreditRow[];
};

type ItemAggRow = {
  book_id?: number | null;
  title?: string | null;
  qty?: number | string | null;
  amount?: number | string | null;
};

type ItemsResponse = { rows?: ItemAggRow[] };

/* ---------------- Helpers ---------------- */

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (n: any) => {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtInt = (n: any) => {
  const v = Math.floor(num(n));
  return v.toLocaleString("en-IN");
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const todayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const chip = (mode?: string | null) => {
  const x = String(mode || "").toUpperCase();
  if (x === "CASH") return "bg-emerald-50 text-emerald-800 border border-emerald-200";
  if (x === "ONLINE" || x === "UPI" || x === "CARD" || x === "BANK")
    return "bg-indigo-50 text-indigo-800 border border-indigo-200";
  if (x === "CREDIT") return "bg-amber-50 text-amber-900 border border-amber-200";
  return "bg-slate-50 text-slate-700 border border-slate-200";
};

/**
 * ✅ IMPORTANT: Normalize backend summary row to UI SummaryRow
 * Backend example:
 * {
 *   distributor_id,
 *   distributor: { id, name, ... },
 *   school: { id, name, ... },
 *   sales_count,
 *   total_amount,
 *   paid_amount,
 *   balance_amount,
 *   split: { CASH, UPI, CARD, CREDIT, MIXED }
 * }
 */
const normalizeSummaryRows = (rawRows: any[]): SummaryRow[] => {
  if (!Array.isArray(rawRows)) return [];

  return rawRows.map((r) => {
    const schoolId = r?.school_id ?? r?.school?.id ?? null;
    const schoolName = r?.school_name ?? r?.school?.name ?? null;

    const distributorId = r?.distributor_id ?? r?.distributor?.id ?? null;
    const distributorName = r?.distributor_name ?? r?.distributor?.name ?? null;

    const salesCount = r?.sale_count ?? r?.sales_count ?? 0;

    // total amount - we treat as net
    const netAmount = r?.net_amount ?? r?.total_amount ?? 0;

    const split = r?.split || {};
    const cash = split?.CASH ?? r?.cash_amount ?? 0;

    // online = UPI + CARD + BANK + MIXED (if backend uses MIXED)
    const online =
      (split?.ONLINE ?? 0) +
      (split?.UPI ?? 0) +
      (split?.CARD ?? 0) +
      (split?.BANK ?? 0) +
      (split?.MIXED ?? 0);

    const credit = split?.CREDIT ?? r?.credit_amount ?? 0;

    return {
      distributor_id: distributorId,
      distributor_name: distributorName,

      school_id: schoolId,
      school_name: schoolName,

      net_amount: netAmount,
      cash_amount: cash,
      online_amount: online,
      credit_amount: credit,

      sale_count: salesCount,
    };
  });
};

/* ---------------- Component ---------------- */

const API_BASE = "/api/sales-analytics";

export default function SalesAnalyticsPageClient() {
  const { user, logout } = useAuth();

  // masters
  const [distributors, setDistributors] = useState<DistributorLite[]>([]);
  const [schools, setSchools] = useState<SchoolLite[]>([]);

  // filters
  const [from, setFrom] = useState(() => todayISO());
  const [to, setTo] = useState(() => todayISO());

  const [distributorId, setDistributorId] = useState<string>("");
  const [schoolId, setSchoolId] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("");

  const isDistributorUser = String((user as any)?.role || "").toUpperCase() === "DISTRIBUTOR";
  const lockedDistributorId = isDistributorUser ? String((user as any)?.distributor_id || "") : "";

  // states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [creditRows, setCreditRows] = useState<CreditRow[]>([]);

  // drilldown modal
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTab, setDrillTab] = useState<"SALES" | "ITEMS" | "CREDIT">("SALES");
  const [drillTitle, setDrillTitle] = useState<string>("");

  const [drillSchoolId, setDrillSchoolId] = useState<number | null>(null);
  const [drillDistributorId, setDrillDistributorId] = useState<number | null>(null);

  const [salesList, setSalesList] = useState<SaleRow[]>([]);
  const [itemsAgg, setItemsAgg] = useState<ItemAggRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  /* ------------ Masters ------------ */

  const fetchDistributors = async () => {
    try {
      const res = await api.get("/api/distributors");
      const list: DistributorLite[] =
        Array.isArray(res.data) ? res.data : res.data?.distributors || res.data?.data || [];
      setDistributors(Array.isArray(list) ? list : []);
    } catch {
      setDistributors([]);
    }
  };

  const fetchSchools = async () => {
    try {
      const res = await api.get("/api/schools");
      const list: SchoolLite[] = (res.data as any)?.data || (res.data as any)?.schools || [];
      const activeOnly = (Array.isArray(list) ? list : []).filter((s) => s?.is_active !== false);
      setSchools(activeOnly);
    } catch {
      setSchools([]);
    }
  };

  /* ------------ Data ------------ */

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { from, to };

      const did = lockedDistributorId || distributorId;
      if (did) params.distributor_id = Number(did);
      if (schoolId) params.school_id = Number(schoolId);
      if (paymentMode) params.payment_mode = paymentMode;

      const res = await api.get<SummaryResponse>(`${API_BASE}/distributor-school-summary`, { params });

      // ✅ normalize rows so UI fields exist
      const rawRows = (res.data as any)?.rows || (res.data as any)?.data || [];
      const rows = normalizeSummaryRows(Array.isArray(rawRows) ? rawRows : []);
      setSummary(rows);
    } catch (e: any) {
      setSummary([]);
      setError(e?.response?.data?.error || e?.response?.data?.message || "Failed to load summary");
    } finally {
      setLoading(false);
    }
  };

  const fetchCredit = async () => {
    try {
      const params: any = { from, to };

      const did = lockedDistributorId || distributorId;
      if (did) params.distributor_id = Number(did);
      if (schoolId) params.school_id = Number(schoolId);

      // credit list usually not filtered by payment_mode
      const res = await api.get<CreditResponse>(`${API_BASE}/credit-outstanding`, { params });
      const rows = (res.data as any)?.rows || (res.data as any)?.data || [];
      setCreditRows(Array.isArray(rows) ? rows : []);
    } catch {
      setCreditRows([]);
    }
  };

  useEffect(() => {
    fetchDistributors();
    fetchSchools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // if distributor user, lock automatically
    if (lockedDistributorId) setDistributorId(lockedDistributorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedDistributorId]);

  useEffect(() => {
    fetchSummary();
    fetchCredit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, distributorId, schoolId, paymentMode, lockedDistributorId]);

  /* ------------ Derived totals (frontend) ------------ */

  const totals = useMemo(() => {
    let net = 0;
    let cash = 0;
    let online = 0;
    let credit = 0;
    let invoices = 0;

    summary.forEach((r) => {
      net += num(r.net_amount);
      cash += num(r.cash_amount);
      online += num(r.online_amount);
      credit += num(r.credit_amount);
      invoices += Math.floor(num(r.sale_count));
    });

    const outstanding = creditRows.reduce((s, r) => s + num(r.total_balance), 0);

    return { net, cash, online, credit, invoices, outstanding };
  }, [summary, creditRows]);

  /* ------------ Drilldown ------------ */

  const openDrill = async (row: SummaryRow, tab: "SALES" | "ITEMS" = "SALES") => {
    const sid = row.school_id ? Number(row.school_id) : null;
    const did = row.distributor_id ? Number(row.distributor_id) : null;

    setDrillSchoolId(sid);
    setDrillDistributorId(did);
    setDrillTab(tab);
    setDrillOpen(true);

    const title = `${row.school_name || "School"}${row.distributor_name ? ` • ${row.distributor_name}` : ""}`;
    setDrillTitle(title);

    await fetchDrillData(sid, did, tab);
  };

  const fetchDrillData = async (sid: number | null, did: number | null, tab: "SALES" | "ITEMS" | "CREDIT") => {
    setDrillLoading(true);
    setError(null);
    try {
      const baseParams: any = { from, to };

      const did2 = did || Number(lockedDistributorId || distributorId || 0) || null;
      if (did2) baseParams.distributor_id = did2;
      if (sid) baseParams.school_id = sid;
      if (paymentMode && tab === "SALES") baseParams.payment_mode = paymentMode;

      if (tab === "SALES") {
        const res = await api.get<SalesListResponse>(`${API_BASE}/distributor-school-sales`, {
          params: { ...baseParams, limit: 500 },
        });
        const rows = (res.data as any)?.rows || (res.data as any)?.data || [];
        setSalesList(Array.isArray(rows) ? rows : []);
        setItemsAgg([]);
      } else if (tab === "ITEMS") {
        const res = await api.get<ItemsResponse>(`${API_BASE}/distributor-school-items`, {
          params: { ...baseParams, kind: "BOOK" },
        });
        const rows = (res.data as any)?.rows || (res.data as any)?.data || [];
        setItemsAgg(Array.isArray(rows) ? rows : []);
        setSalesList([]);
      } else {
        // CREDIT tab: filter from already fetched creditRows
        setSalesList([]);
        setItemsAgg([]);
      }
    } catch (e: any) {
      setSalesList([]);
      setItemsAgg([]);
      setError(e?.response?.data?.error || e?.response?.data?.message || "Failed to load drilldown");
    } finally {
      setDrillLoading(false);
    }
  };

  const distributorOptions = useMemo(
    () =>
      (distributors || []).map((d) => ({
        value: String(d.id),
        label: d.name,
      })),
    [distributors]
  );

  const schoolOptions = useMemo(
    () =>
      (schools || []).map((s) => ({
        value: String(s.id),
        label: s.name,
      })),
    [schools]
  );

  const modeOptions: Array<{ value: PaymentMode; label: string }> = [
    { value: "", label: "All" },
    { value: "CASH", label: "Cash" },
    { value: "ONLINE", label: "Online" },
    { value: "UPI", label: "UPI" },
    { value: "CARD", label: "Card" },
    { value: "BANK", label: "Bank" },
    { value: "CREDIT", label: "Credit" },
  ];

  const Pill = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white border border-slate-200 shadow-sm">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-[14px] font-extrabold text-slate-900 tabular-nums">{value}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-xs">
              <ChevronLeft className="w-4 h-4" />
              Back
            </Link>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Sales Analytics</div>
              <div className="text-[11px] text-slate-500 truncate">
                Distributor → School • Cash / Online / Credit • {from} to {to}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-600 hidden sm:inline">{(user as any)?.name || "User"}</span>
            <button onClick={logout} className="text-[11px] px-3 py-1 rounded-full bg-rose-600 text-white">
              Logout
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-3 pb-3 flex flex-wrap items-end gap-2">
          <div>
            <div className="text-[10px] text-slate-500 mb-1">From</div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
            />
          </div>

          <div>
            <div className="text-[10px] text-slate-500 mb-1">To</div>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
            />
          </div>

          <div className="min-w-[240px]">
            <div className="text-[10px] text-slate-500 mb-1">Distributor</div>
            <SearchableSelect
              value={lockedDistributorId || distributorId}
              onChange={(val) => setDistributorId(val)}
              placeholder={isDistributorUser ? "Locked (Distributor)" : "All distributors"}
              options={[{ value: "", label: "All" }, ...distributorOptions]}
              disabled={!!lockedDistributorId}
            />
          </div>

          <div className="min-w-[240px]">
            <div className="text-[10px] text-slate-500 mb-1">School</div>
            <SearchableSelect
              value={schoolId}
              onChange={(val) => setSchoolId(val)}
              placeholder="All schools"
              options={[{ value: "", label: "All" }, ...schoolOptions]}
            />
          </div>

          <div>
            <div className="text-[10px] text-slate-500 mb-1">Payment</div>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white min-w-[150px]"
            >
              {modeOptions.map((m) => (
                <option key={m.value || "ALL"} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              fetchSummary();
              fetchCredit();
            }}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold border border-slate-300 bg-white hover:bg-slate-100"
            title="Refresh"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* KPIs */}
        <div className="px-3 pb-3 flex flex-wrap gap-2">
          <Pill label="Net Sales" value={`₹${fmtMoney(totals.net)}`} />
          <Pill label="Cash" value={`₹${fmtMoney(totals.cash)}`} />
          <Pill label="Online" value={`₹${fmtMoney(totals.online)}`} />
          <Pill label="Credit" value={`₹${fmtMoney(totals.credit)}`} />
          <Pill label="Invoices" value={fmtInt(totals.invoices)} />
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-amber-50 border border-amber-200">
            <div className="text-[10px] text-amber-900 flex items-center gap-1">
              <BadgeInfo className="w-3.5 h-3.5" />
              Outstanding
            </div>
            <div className="text-[14px] font-extrabold text-amber-950 tabular-nums">₹{fmtMoney(totals.outstanding)}</div>
          </div>
        </div>

        {error ? (
          <div className="px-3 pb-3">
            <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">{error}</div>
          </div>
        ) : null}
      </header>

      <main className="p-3">
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              School-wise Summary
            </div>
            <div className="text-[11px] text-slate-500">{summary.length} rows</div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : summary.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No data.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">School</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Distributor</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Invoices</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Net</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Cash</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Online</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Credit</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r, idx) => (
                    <tr key={`${r.school_id || "S"}-${r.distributor_id || "D"}-${idx}`} className="hover:bg-slate-50">
                      <td className="border-b border-slate-200 px-3 py-2">
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          {r.school_name || (r.school_id ? `School #${r.school_id}` : "—")}
                        </div>
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2">
                        {r.distributor_name || (r.distributor_id ? `Distributor #${r.distributor_id}` : "—")}
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold tabular-nums">
                        {fmtInt(r.sale_count)}
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2 text-right font-extrabold tabular-nums">
                        ₹{fmtMoney(r.net_amount)}
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">
                        ₹{fmtMoney(r.cash_amount)}
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">
                        ₹{fmtMoney(r.online_amount)}
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">
                        ₹{fmtMoney(r.credit_amount)}
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openDrill(r, "SALES")}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-[12px]"
                            title="View invoices"
                          >
                            <Eye className="w-4 h-4" />
                            Sales
                          </button>

                          <button
                            type="button"
                            onClick={() => openDrill(r, "ITEMS")}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 text-[12px]"
                            title="View items summary"
                          >
                            <IndianRupee className="w-4 h-4" />
                            Items
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="px-4 py-2 text-[10px] text-slate-500 border-t">
                Tip: Click <b>Sales</b> for invoice list. Click <b>Items</b> for book-wise totals.
              </div>
            </div>
          )}
        </section>

        {/* Credit Outstanding */}
        <section className="mt-3 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              Credit Outstanding
            </div>
            <div className="text-[11px] text-slate-500">{creditRows.length} rows</div>
          </div>

          {creditRows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No credit outstanding.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">School</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Party</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Phone</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Sales</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Paid</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Balance</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Last Sale</th>
                  </tr>
                </thead>
                <tbody>
                  {creditRows.map((r, idx) => (
                    <tr key={`${r.school_id || "S"}-${r.customer_phone || "P"}-${idx}`} className="hover:bg-slate-50">
                      <td className="border-b border-slate-200 px-3 py-2">
                        {r.school_name || (r.school_id ? `School #${r.school_id}` : "—")}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-900">
                        {r.customer_name || "—"}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2">
                        {r.customer_phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {r.customer_phone}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">
                        ₹{fmtMoney(r.total_sales)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">
                        ₹{fmtMoney(r.total_paid)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right font-extrabold tabular-nums text-amber-900">
                        ₹{fmtMoney(r.total_balance)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2">{formatDate(r.last_sale_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-[10px] text-slate-500 border-t">
                Outstanding is calculated from credit invoices with remaining balance.
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Drilldown Modal */}
      {drillOpen && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full p-2 sm:p-4 flex items-center justify-center">
            <div className="w-full max-w-[1100px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">Drilldown • {drillTitle}</div>
                  <div className="text-[11px] text-slate-600 mt-1 truncate">
                    {from} → {to}
                    {paymentMode ? ` • ${paymentMode}` : ""}{" "}
                  </div>
                </div>

                <button
                  onClick={() => setDrillOpen(false)}
                  className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-4 py-3 border-b flex flex-wrap gap-2 items-center">
                <button
                  onClick={async () => {
                    setDrillTab("SALES");
                    await fetchDrillData(drillSchoolId, drillDistributorId, "SALES");
                  }}
                  className={`text-[12px] px-4 py-2 rounded-xl border ${
                    drillTab === "SALES" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
                  }`}
                >
                  Sales
                </button>

                <button
                  onClick={async () => {
                    setDrillTab("ITEMS");
                    await fetchDrillData(drillSchoolId, drillDistributorId, "ITEMS");
                  }}
                  className={`text-[12px] px-4 py-2 rounded-xl border ${
                    drillTab === "ITEMS" ? "border-indigo-700 bg-indigo-50 text-indigo-900" : "border-slate-300 bg-white"
                  }`}
                >
                  Items
                </button>

                <div className="ml-auto text-[11px] text-slate-500">
                  {drillLoading ? "Loading..." : drillTab === "SALES" ? `${salesList.length} invoices` : `${itemsAgg.length} items`}
                </div>
              </div>

              <div className="max-h-[70vh] overflow-auto">
                {drillLoading ? (
                  <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                ) : drillTab === "SALES" ? (
                  salesList.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">No invoices.</div>
                  ) : (
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-100 sticky top-0 z-10">
                        <tr>
                          <th className="border-b border-slate-200 px-3 py-2 text-left">Invoice</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-left">Date</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-left">Mode</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-left">Party</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-right">Total</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-right">Paid</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesList.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-900">
                              {s.invoice_no || `#${s.id}`}
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2">
                              {formatDate(s.sale_date || s.invoice_date || s.created_at)}
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] ${chip(s.payment_mode)}`}>
                                {String(s.payment_mode || "—").toUpperCase()}
                              </span>
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2">
                              <div className="font-semibold">{s.customer_name || "—"}</div>
                              {s.customer_phone ? <div className="text-[11px] text-slate-500">{s.customer_phone}</div> : null}
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">₹{fmtMoney(s.total_amount)}</td>
                            <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">₹{fmtMoney(s.paid_amount)}</td>
                            <td className="border-b border-slate-200 px-3 py-2 text-right font-extrabold tabular-nums">₹{fmtMoney(s.balance_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : itemsAgg.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500">No items.</div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-slate-100 sticky top-0 z-10">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 text-left">Book</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right">Qty</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsAgg.map((it, i) => (
                        <tr key={`${it.book_id || "B"}-${i}`} className="hover:bg-slate-50">
                          <td className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-900">
                            {it.title || (it.book_id ? `Book #${it.book_id}` : "—")}
                          </td>
                          <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">{fmtInt(it.qty)}</td>
                          <td className="border-b border-slate-200 px-3 py-2 text-right font-extrabold tabular-nums">₹{fmtMoney(it.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="px-4 py-3 border-t text-[10px] text-slate-500">
                If you want “School-wise Cash/Online/Credit” card for distributor dashboard, we can reuse this summary API directly.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
