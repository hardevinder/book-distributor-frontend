// components/SupplierPaymentsPageClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronLeft,
  PlusCircle,
  RefreshCcw,
  X,
  Trash2,
  IndianRupee,
  FileText,
} from "lucide-react";

/* ---------------- Types ---------------- */

type SupplierLite = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  address_line1?: string | null;
  full_address?: string | null;
};

type SupplierPayment = {
  id: number;
  supplier_id: number;

  // backend may send pay_date / payment_date / txn_date
  payment_date?: string | null;
  pay_date?: string | null;
  txn_date?: string | null;

  amount: number | string;

  payment_mode?: string | null; // CASH/BANK/UPI/CHEQUE/NEFT/RTGS etc
  mode?: string | null;

  ref_no?: string | null; // cheque/utr/txn id
  txn_ref?: string | null;

  notes?: string | null;
  narration?: string | null;

  createdAt?: string;
  updatedAt?: string;

  supplier?: SupplierLite | null;
};

type BalanceResponse = {
  supplier: SupplierLite;
  debit_total: number;
  credit_total: number;
  balance: number;
};

// ✅ Ledger types (normalized for popup)
type LedgerRow = {
  date?: string | null;
  ref_no?: string | null;
  description?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
  balance?: number | string | null;

  // allow backend raw keys too
  txn_date?: string | null;
  narration?: string | null;
  running_balance?: number | string | null;
  createdAt?: string | null;
  txn_type?: string | null;
};

/* ---------------- Helpers ---------------- */

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const fmtMoney = (n: any) => {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const pickPaymentDate = (p?: SupplierPayment | null) =>
  p?.payment_date || p?.pay_date || p?.txn_date || p?.createdAt || null;

const pickPaymentMode = (p?: SupplierPayment | null) =>
  p?.payment_mode || p?.mode || "-";

/* ---------------- Component ---------------- */

export default function SupplierPaymentsPageClient() {
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // masters
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);

  // list
  const [payments, setPayments] = useState<SupplierPayment[]>([]);

  // filters
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // balance box
  const [balanceRow, setBalanceRow] = useState<BalanceResponse | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "",
    payment_date: "",
    amount: "",
    payment_mode: "BANK",
    ref_no: "",
    notes: "",
  });

  // view modal
  const [viewOpen, setViewOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [viewRow, setViewRow] = useState<SupplierPayment | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ✅ Ledger popup
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);

  /* ------------ ✅ FIX: Always get supplier name from masters ------------ */

  const selectedSupplier = useMemo(() => {
    const id = Number(filterSupplierId);
    if (!id) return null;
    return suppliers.find((s) => Number(s.id) === id) || null;
  }, [suppliers, filterSupplierId]);

  const getSupplierNameById = (supplierId?: number | string | null) => {
    const id = Number(supplierId);
    if (!id) return "-";
    return (
      suppliers.find((s) => Number(s.id) === id)?.name || `Supplier #${id}`
    );
  };

  const ledgerHeaderName =
    selectedSupplier?.name ||
    balanceRow?.supplier?.name ||
    getSupplierNameById(filterSupplierId);

  /* ------------ Fetch masters ------------ */

  const fetchSuppliers = async () => {
    try {
      const res = await api.get("/api/suppliers");
      const list: SupplierLite[] = Array.isArray(res.data)
        ? res.data
        : res.data?.suppliers || [];
      setSuppliers(list || []);
    } catch (e) {
      console.error("suppliers load error:", e);
      setSuppliers([]);
    }
  };

  /* ------------ Fetch payments ------------ */

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);

    try {
      const supplierId = Number(filterSupplierId);

      if (!supplierId) {
        setPayments([]);
        setInfo("Select a supplier to view payments.");
        return;
      } else {
        setInfo(null);
      }

      const params: any = {};
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;

      const res = await api.get(`/api/suppliers/${supplierId}/payments`, {
        params,
      });

      const list = Array.isArray(res.data)
        ? res.data
        : (res.data as any)?.payments;

      setPayments(Array.isArray(list) ? list : []);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to load supplier payments");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  /* ------------ Fetch supplier balance ------------ */

  const fetchBalance = async (supplierId: number) => {
    setBalanceLoading(true);
    try {
      const res = await api.get<BalanceResponse>(
        `/api/suppliers/${supplierId}/balance`
      );
      setBalanceRow((res?.data as any) || null);
    } catch (e) {
      console.error("balance load error:", e);
      setBalanceRow(null);
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (filterSupplierId) {
      fetchBalance(Number(filterSupplierId));
      fetchPayments();
    } else {
      setBalanceRow(null);
      setPayments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSupplierId]);

  /* ------------ Create ------------ */

  const openCreate = () => {
    setError(null);
    setInfo(null);
    setCreateOpen(true);

    setForm({
      supplier_id: filterSupplierId || "",
      payment_date: "",
      amount: "",
      payment_mode: "BANK",
      ref_no: "",
      notes: "",
    });
  };

  const submitCreate = async () => {
    setError(null);
    setInfo(null);

    const supplier_id = Number(form.supplier_id);
    const amount = clamp(num(form.amount), 0, 999999999);

    if (!supplier_id) return setError("Select supplier.");
    if (!amount || amount <= 0) return setError("Enter valid amount.");

    setCreating(true);
    try {
      // backend expects: pay_date (as per your controller)
      const payload: any = {
        amount,
        pay_date: form.payment_date || undefined,
        payment_mode: form.payment_mode?.trim() || null,
        ref_no: form.ref_no?.trim() || null,
        notes: form.notes?.trim() || null,
      };

      const res = await api.post(
        `/api/suppliers/${supplier_id}/payments`,
        payload
      );

      setInfo(res?.data?.message || "Payment saved.");
      setCreateOpen(false);

      await fetchPayments();
      await fetchBalance(supplier_id);
    } catch (e: any) {
      console.error(e);
      setError(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          "Create failed"
      );
    } finally {
      setCreating(false);
    }
  };

  /* ------------ View ------------ */

  const openView = async (row: SupplierPayment) => {
    const supplierId = Number(row.supplier_id);
    const id = Number(row.id);

    setViewOpen(true);
    setViewId(id);
    setViewRow(null);
    setViewLoading(true);
    setError(null);

    try {
      const res = await api.get(`/api/suppliers/${supplierId}/payments/${id}`);

      const payment = (res?.data as any)?.payment ?? res?.data;
      setViewRow(payment || null);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to load payment");
    } finally {
      setViewLoading(false);
    }
  };

  const deletePayment = async () => {
    if (!viewId || !viewRow) return;

    const supplierId = Number(viewRow.supplier_id);
    if (!supplierId) return setError("Missing supplier id for this payment.");

    if (
      !confirm(
        "Delete this payment? This will reduce CREDIT in supplier ledger."
      )
    )
      return;

    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/api/suppliers/${supplierId}/payments/${viewId}`);

      setInfo("Payment deleted.");
      setViewOpen(false);

      await fetchPayments();
      await fetchBalance(supplierId);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  /* ------------ ✅ Ledger Popup ------------ */

  const openLedger = async () => {
    const supplierId = Number(filterSupplierId);
    if (!supplierId) return;

    setLedgerOpen(true);
    setLedgerLoading(true);
    setLedgerError(null);
    setLedgerRows([]);

    try {
      // ✅ FIX: also refresh balance so header supplier is always available
      await Promise.all([
        fetchBalance(supplierId),
        (async () => {
          const res = await api.get(`/api/suppliers/${supplierId}/ledger`);

          const raw =
            (res.data as any)?.rows ??
            (res.data as any)?.ledger ??
            (res.data as any)?.txns ??
            (res.data as any)?.transactions ??
            (Array.isArray(res.data) ? res.data : []);

          const list = Array.isArray(raw) ? raw : [];

          const mapped: LedgerRow[] = list.map((x: any) => ({
            date: x.date ?? x.txn_date ?? x.transaction_date ?? x.createdAt ?? null,
            ref_no: x.ref_no ?? x.reference_no ?? x.refNo ?? null,
            description:
              x.description ?? x.narration ?? x.remarks ?? x.txn_type ?? null,
            debit: x.debit ?? 0,
            credit: x.credit ?? 0,
            balance:
              x.balance ??
              x.running_balance ??
              x.closing_balance ??
              x.after_balance ??
              null,
          }));

          setLedgerRows(mapped);
        })(),
      ]);
    } catch (e: any) {
      console.error(e);
      setLedgerError(e?.response?.data?.error || "Failed to load ledger");
      setLedgerRows([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  /* ------------ Derived ------------ */

  const visible = payments;

  const totals = useMemo(() => {
    const total = visible.reduce((s, r) => s + num(r.amount), 0);
    return { total };
  }, [visible]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-xs"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Link>

            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                Supplier Payments (Credit Entry)
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Payment = <b>Credit</b> in Supplier Ledger (reduces payable)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-600 hidden sm:inline">
              {user?.name || "User"}
            </span>
            <button
              onClick={logout}
              className="text-[11px] px-3 py-1 rounded-full bg-rose-600 text-white"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="px-3 pb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">
              Supplier
            </label>
            <select
              value={filterSupplierId}
              onChange={(e) => setFilterSupplierId(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[220px]"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
              disabled={!filterSupplierId}
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
              disabled={!filterSupplierId}
            />
          </div>

          <button
            type="button"
            onClick={fetchPayments}
            disabled={loading || !filterSupplierId}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold
                       text-emerald-800 border border-emerald-200
                       bg-gradient-to-r from-emerald-50 to-cyan-50 hover:from-emerald-100 hover:to-cyan-100
                       disabled:opacity-60"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={openCreate}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-white
                       bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:brightness-110"
          >
            <PlusCircle className="w-4 h-4" />
            Add Payment
          </button>
        </div>

        {(error || info) && (
          <div className="px-3 pb-3">
            {error && (
              <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                {error}
              </div>
            )}
            {info && (
              <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                {info}
              </div>
            )}
          </div>
        )}
      </header>

      <main className="p-3 space-y-3">
        {/* Balance Summary */}
        {filterSupplierId && (
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <IndianRupee className="w-4 h-4" />
                Supplier Balance
              </div>
              <div className="text-[11px] text-slate-500">
                {balanceLoading ? "Loading..." : ""}
              </div>
            </div>

            <div className="p-4 grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3 bg-slate-50">
                <div className="text-[11px] text-slate-600">Debit Total</div>
                <div className="mt-1 text-sm font-extrabold">
                  ₹{fmtMoney(balanceRow?.debit_total ?? 0)}
                </div>
              </div>
              <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3 bg-slate-50">
                <div className="text-[11px] text-slate-600">Credit Total</div>
                <div className="mt-1 text-sm font-extrabold">
                  ₹{fmtMoney(balanceRow?.credit_total ?? 0)}
                </div>
              </div>
              <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3 bg-white">
                <div className="text-[11px] text-slate-600">
                  Balance (Debit - Credit)
                </div>
                <div className="mt-1 text-sm font-extrabold">
                  ₹{fmtMoney(balanceRow?.balance ?? 0)}
                </div>
              </div>

              <div className="col-span-12 md:col-span-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={openLedger}
                  disabled={!filterSupplierId}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-[12px] disabled:opacity-60"
                >
                  <FileText className="w-4 h-4" />
                  View Ledger
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Payments Table */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Payments</div>
              <div className="text-[11px] text-slate-500">
                Total Credit: ₹{fmtMoney(totals.total)}
              </div>
            </div>
            <div className="text-[11px] text-slate-500">{visible.length} rows</div>
          </div>

          {!filterSupplierId ? (
            <div className="p-6 text-sm text-slate-500">
              Please select a supplier to view payments.
            </div>
          ) : loading ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : visible.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No payments.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">
                      Supplier
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">
                      Date
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">
                      Mode
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">
                      Ref
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">
                      Amount (Credit)
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="border-b border-slate-200 px-3 py-2">
                        {/* ✅ FIX: fall back to masters list if backend doesn't include p.supplier */}
                        {p.supplier?.name || getSupplierNameById(p.supplier_id)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                        {formatDate(pickPaymentDate(p))}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                        {pickPaymentMode(p)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                        {p.ref_no || p.txn_ref || "-"}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">
                        ₹{fmtMoney(p.amount)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openView(p)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-[12px]"
                        >
                          <FileText className="w-4 h-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* ---------------- Create Modal ---------------- */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full overflow-auto p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[900px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      Add Supplier Payment (Credit)
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      This will add <b>CREDIT</b> entry in Supplier Ledger.
                    </div>
                  </div>
                  <button
                    onClick={() => setCreateOpen(false)}
                    className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Supplier *
                      </label>
                      <select
                        value={form.supplier_id}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            supplier_id: e.target.value,
                          }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                      >
                        <option value="">-- Select --</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Payment Date
                      </label>
                      <input
                        type="date"
                        value={form.payment_date}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            payment_date: e.target.value,
                          }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                      />
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Amount *
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.amount}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, amount: e.target.value }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                        placeholder="0"
                      />
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Mode
                      </label>
                      <select
                        value={form.payment_mode}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            payment_mode: e.target.value,
                          }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                      >
                        <option value="BANK">BANK</option>
                        <option value="CASH">CASH</option>
                        <option value="UPI">UPI</option>
                        <option value="CHEQUE">CHEQUE</option>
                        <option value="NEFT">NEFT</option>
                        <option value="RTGS">RTGS</option>
                      </select>
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Ref No (UTR/Cheque/Txn)
                      </label>
                      <input
                        value={form.ref_no}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, ref_no: e.target.value }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                        placeholder="Optional..."
                      />
                    </div>

                    <div className="col-span-12">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Notes
                      </label>
                      <input
                        value={form.notes}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, notes: e.target.value }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                        placeholder="Optional..."
                      />
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 border-t bg-slate-50 flex justify-end gap-2">
                  <button
                    onClick={() => setCreateOpen(false)}
                    className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitCreate}
                    disabled={creating}
                    className="text-[12px] px-5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 font-semibold"
                  >
                    {creating ? "Saving..." : "Save Payment"}
                  </button>
                </div>
              </div>

              <div className="h-3" />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- View Modal ---------------- */}
      {viewOpen && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full overflow-auto p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[900px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      Payment Details {viewRow?.id ? `• #${viewRow.id}` : ""}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Supplier:{" "}
                      <span className="font-semibold text-slate-900">
                        {/* ✅ FIX: fallback to masters list */}
                        {viewRow?.supplier?.name ||
                          getSupplierNameById(viewRow?.supplier_id)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setViewOpen(false)}
                    className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4">
                  {viewLoading ? (
                    <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </div>
                  ) : !viewRow ? (
                    <div className="p-6 text-sm text-slate-500">Not found.</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12 md:col-span-4 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600">
                            Payment Date
                          </div>
                          <div className="mt-1 text-sm font-semibold">
                            {formatDate(pickPaymentDate(viewRow))}
                          </div>
                        </div>

                        <div className="col-span-12 md:col-span-4 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600">Mode</div>
                          <div className="mt-1 text-sm font-semibold">
                            {pickPaymentMode(viewRow)}
                          </div>
                        </div>

                        <div className="col-span-12 md:col-span-4 border border-slate-200 rounded-2xl p-3 bg-slate-50">
                          <div className="text-[11px] text-slate-600">
                            Amount (Credit)
                          </div>
                          <div className="mt-1 text-sm font-extrabold">
                            ₹{fmtMoney(viewRow.amount)}
                          </div>
                        </div>

                        <div className="col-span-12 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600">
                            Ref No
                          </div>
                          <div className="mt-1 text-sm font-semibold">
                            {viewRow.ref_no || viewRow.txn_ref || "-"}
                          </div>
                        </div>

                        <div className="col-span-12 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600">Notes</div>
                          <div className="mt-1 text-sm">
                            {viewRow.notes || viewRow.narration || "-"}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          disabled={deleting}
                          onClick={deletePayment}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100 disabled:opacity-60 text-[12px] font-semibold"
                        >
                          <Trash2 className="w-4 h-4" />
                          {deleting ? "Deleting..." : "Delete"}
                        </button>

                        <button
                          onClick={() => setViewOpen(false)}
                          className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-3" />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- ✅ Ledger Modal ---------------- */}
      {ledgerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full overflow-auto p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[1100px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      Supplier Ledger
                    </div>
                    {/* ✅ FIX: Always show proper name */}
                    <div className="text-[11px] text-slate-600 mt-1 truncate">
                      {ledgerHeaderName}
                    </div>
                  </div>

                  <button
                    onClick={() => setLedgerOpen(false)}
                    className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4">
                  {ledgerError && (
                    <div className="mb-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                      {ledgerError}
                    </div>
                  )}

                  {ledgerLoading ? (
                    <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Loading ledger...
                    </div>
                  ) : ledgerRows.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">
                      No ledger entries.
                    </div>
                  ) : (
                    <div className="overflow-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="border-b border-slate-200 px-3 py-2 text-left">
                              Date
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-left">
                              Ref
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-left">
                              Description
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right">
                              Debit
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right">
                              Credit
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right">
                              Balance
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledgerRows.map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="border-b border-slate-200 px-3 py-2">
                                {formatDate(r.date || null)}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2">
                                {r.ref_no || "-"}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2">
                                {r.description || "-"}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2 text-right">
                                ₹{fmtMoney(r.debit)}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2 text-right">
                                ₹{fmtMoney(r.credit)}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">
                                {r.balance == null
                                  ? "-"
                                  : `₹${fmtMoney(r.balance)}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => setLedgerOpen(false)}
                      className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-3" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
