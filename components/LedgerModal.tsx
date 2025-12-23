"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/apiClient";
import { X } from "lucide-react";

type LedgerRow = {
  date: string;
  ref_no: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  supplierId?: number;
  title?: string;
};

export default function LedgerModal({
  open,
  onClose,
  supplierId,
  title = "Ledger",
}: Props) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !supplierId) return;

    const loadLedger = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/suppliers/${supplierId}/ledger`);
        setRows(res.data.rows || []);
      } catch (err) {
        console.error("Ledger load failed", err);
      } finally {
        setLoading(false);
      }
    };

    loadLedger();
  }, [open, supplierId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white w-[95%] max-w-5xl rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 max-h-[70vh] overflow-auto">
          {loading ? (
            <div className="text-center py-10">Loading ledger…</div>
          ) : (
            <table className="w-full text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1">Date</th>
                  <th className="border px-2 py-1">Ref</th>
                  <th className="border px-2 py-1">Description</th>
                  <th className="border px-2 py-1 text-right">Debit</th>
                  <th className="border px-2 py-1 text-right">Credit</th>
                  <th className="border px-2 py-1 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1">{r.date}</td>
                    <td className="border px-2 py-1">{r.ref_no}</td>
                    <td className="border px-2 py-1">{r.description}</td>
                    <td className="border px-2 py-1 text-right">
                      {r.debit?.toFixed(2)}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {r.credit?.toFixed(2)}
                    </td>
                    <td className="border px-2 py-1 text-right font-semibold">
                      {r.balance?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-1.5 border rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
