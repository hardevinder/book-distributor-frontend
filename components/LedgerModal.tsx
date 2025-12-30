"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/apiClient";
import { X } from "lucide-react";

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

type Props = {
  open: boolean;
  onClose: () => void;
  supplierId?: number;
  title?: string;
};

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (n: any) =>
  num(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export default function LedgerModal({
  open,
  onClose,
  supplierId,
  title = "Ledger",
}: Props) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !supplierId) return;

    const loadLedger = async () => {
      setLoading(true);
      setErr(null);
      try {
        // ✅ FIX: include /api
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
          description: x.description ?? x.narration ?? x.remarks ?? x.txn_type ?? null,
          debit: x.debit ?? 0,
          credit: x.credit ?? 0,
          balance:
            x.balance ??
            x.running_balance ??
            x.closing_balance ??
            x.after_balance ??
            null,
        }));

        setRows(mapped);
      } catch (e: any) {
        console.error("Ledger load failed", e);
        setErr(e?.response?.data?.error || "Failed to load ledger");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    loadLedger();
  }, [open, supplierId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
      <div className="bg-white w-[98%] max-w-5xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{title}</h2>
            <div className="text-[11px] text-slate-600 truncate">
              Supplier ID: {supplierId || "-"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 max-h-[70vh] overflow-auto">
          {err && (
            <div className="mb-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
              {err}
            </div>
          )}

          {loading ? (
            <div className="text-center py-10 text-sm text-slate-500">
              Loading ledger…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-500">
              No ledger entries.
            </div>
          ) : (
            <div className="overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Date</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Ref</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Description</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Debit</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Credit</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
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
                        {r.balance == null ? "-" : `₹${fmtMoney(r.balance)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-slate-50">
          <button
            onClick={onClose}
            className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
