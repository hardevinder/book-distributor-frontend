"use client";

import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  RefreshCcw,
  CalendarDays,
  IndianRupee,
  Wallet,
  CreditCard,
  Smartphone,
  BadgeIndianRupee,
  Receipt,
  AlertTriangle,
} from "lucide-react";

/* ================= Types ================= */

type SummaryBucket = { bills: number; sale: number; paid: number; balance: number };

type SummaryResponse = {
  date_from: string;
  date_to: string;
  totals: Record<string, SummaryBucket>;
  grand: SummaryBucket;
};

/* ================= Helpers ================= */

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v: any) => Math.round(num(v) * 100) / 100;
const money = (v: any) => round2(v).toFixed(2);

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/* ================= Component ================= */

export default function SalesSummaryPanel({
  className = "",
  title = "My Sales Summary",
}: {
  className?: string;
  title?: string;
}) {
  const { token } = useAuth() as any;

  const authHeaders = useMemo(() => {
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [token]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // preset: today / 7d / month / custom
  const [range, setRange] = useState<"TODAY" | "LAST7" | "MONTH" | "CUSTOM">("TODAY");
  const [dateFrom, setDateFrom] = useState<string>(yyyyMmDd(new Date()));
  const [dateTo, setDateTo] = useState<string>(yyyyMmDd(new Date()));

  const [data, setData] = useState<SummaryResponse | null>(null);

  // keep dates in sync with preset
  useEffect(() => {
    const today = new Date();
    if (range === "TODAY") {
      const d = yyyyMmDd(today);
      setDateFrom(d);
      setDateTo(d);
    } else if (range === "LAST7") {
      const to = yyyyMmDd(today);
      const fromDate = new Date(today);
      fromDate.setDate(fromDate.getDate() - 6);
      setDateFrom(yyyyMmDd(fromDate));
      setDateTo(to);
    } else if (range === "MONTH") {
      setDateFrom(yyyyMmDd(startOfMonth(today)));
      setDateTo(yyyyMmDd(today));
    }
  }, [range]);

  const fetchSummary = async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);

    try {
      const qs = `?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
      const res = await api.get(`/api/sales/my/summary${qs}`, { headers: authHeaders });
      setData(res.data as SummaryResponse);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Failed to load summary");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // auto load
  useEffect(() => {
    if (!token) return;
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, dateFrom, dateTo]);

  const buckets = useMemo(() => {
    const t = data?.totals || {};
    const get = (k: string): SummaryBucket => ({
      bills: num(t?.[k]?.bills),
      sale: round2(t?.[k]?.sale),
      paid: round2(t?.[k]?.paid),
      balance: round2(t?.[k]?.balance),
    });

    return {
      CASH: get("CASH"),
      UPI: get("UPI"),
      CARD: get("CARD"),
      CREDIT: get("CREDIT"),
      MIXED: get("MIXED"),
      GRAND: data?.grand
        ? {
            bills: num(data.grand.bills),
            sale: round2(data.grand.sale),
            paid: round2(data.grand.paid),
            balance: round2(data.grand.balance),
          }
        : { bills: 0, sale: 0, paid: 0, balance: 0 },
    };
  }, [data]);

  const RangeChip = ({
    value,
    label,
  }: {
    value: "TODAY" | "LAST7" | "MONTH" | "CUSTOM";
    label: string;
  }) => (
    <button
      type="button"
      onClick={() => setRange(value)}
      className={`rounded-xl border px-3 py-2 text-[12px] font-extrabold active:scale-[0.99] ${
        range === value ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700"
      }`}
    >
      {label}
    </button>
  );

  const StatCard = ({
    title,
    icon,
    b,
    accent = "bg-white",
    subtle = "bg-slate-50",
  }: {
    title: string;
    icon: React.ReactNode;
    b: SummaryBucket;
    accent?: string;
    subtle?: string;
  }) => (
    <div className={`rounded-2xl border ${accent} shadow-sm overflow-hidden`}>
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="rounded-xl border bg-white p-2">{icon}</div>
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold text-slate-900 truncate">{title}</div>
              <div className="text-[11px] text-slate-500">{b.bills} bills</div>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] text-slate-500">Sale</div>
          <div className="text-[14px] font-black text-slate-900">₹ {money(b.sale)}</div>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-2 px-3 pb-3`}>
        <div className={`rounded-xl border ${subtle} p-2`}>
          <div className="text-[10px] text-slate-500">Paid</div>
          <div className="mt-0.5 text-[12px] font-extrabold">₹ {money(b.paid)}</div>
        </div>
        <div className={`rounded-xl border ${subtle} p-2`}>
          <div className="text-[10px] text-slate-500">Balance</div>
          <div className={`mt-0.5 text-[12px] font-extrabold ${b.balance > 0 ? "text-rose-700" : ""}`}>
            ₹ {money(b.balance)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="border-b p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-extrabold truncate">{title}</div>
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span className="truncate">
              {data?.date_from || dateFrom} → {data?.date_to || dateTo}
            </span>
            {loading ? <span className="text-slate-400">• loading…</span> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={fetchSummary}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-[12px] font-extrabold active:scale-[0.99]"
          disabled={loading}
          title="Refresh"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Range selector */}
      <div className="p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <RangeChip value="TODAY" label="Today" />
          <RangeChip value="LAST7" label="Last 7 Days" />
          <RangeChip value="MONTH" label="This Month" />
          <RangeChip value="CUSTOM" label="Custom" />
        </div>

        {range === "CUSTOM" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-slate-600">
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-[12px] font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <label className="text-[11px] font-bold text-slate-600">
              To
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-[12px] font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>
        )}

        {/* Error */}
        {err && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div className="flex-1">{err}</div>
          </div>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <StatCard title="Cash" icon={<Wallet className="h-4 w-4" />} b={buckets.CASH} />
          <StatCard title="UPI" icon={<Smartphone className="h-4 w-4" />} b={buckets.UPI} />
          <StatCard title="Card" icon={<CreditCard className="h-4 w-4" />} b={buckets.CARD} />
          <StatCard title="Credit (Udhaar)" icon={<BadgeIndianRupee className="h-4 w-4" />} b={buckets.CREDIT} />
          <StatCard title="Mixed" icon={<Receipt className="h-4 w-4" />} b={buckets.MIXED} />
          <StatCard
            title="Grand Total"
            icon={<IndianRupee className="h-4 w-4" />}
            b={buckets.GRAND}
            accent="bg-slate-900 text-white"
            subtle="bg-white/10"
          />
        </div>

        <div className="text-[10px] text-slate-500">
          Note: MIXED is shown as one bucket. If you want MIXED split (cash/upi/card), we must store payment splits.
        </div>
      </div>
    </div>
  );
}
