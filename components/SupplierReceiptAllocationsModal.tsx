"use client";

import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/apiClient";
import { X, RefreshCcw, Save, Trash2 } from "lucide-react";

/* ---------------- Types ---------------- */

type SchoolLite = {
  id: number;
  name: string;
  city?: string | null;
  is_active?: boolean;
};

type BookLite = {
  id: number;
  title: string;
  class_name?: string | null;
  subject?: string | null;
  code?: string | null;
  isbn?: string | null;
};

type ReceiptItemLite = {
  id?: number;
  book_id: number;
  received_qty?: number | string;
  qty?: number | string;

  is_specimen?: 0 | 1 | boolean;
  specimen_reason?: string | null;

  book?: BookLite | null;
};

type AllocationRow = {
  id: number;
  supplier_receipt_id: number;
  school_id: number;
  book_id: number;
  qty: number;
  is_specimen: boolean;
  specimen_reason?: string | null;
  remarks?: string | null;
  issued_date?: string | null;

  school?: { id: number; name: string; city?: string | null } | null;
  book?: { id: number; title: string } | null;
};

type Props = {
  open: boolean;
  onClose: () => void;

  receiptId: number;
  receiptNo?: string;

  receiptStatus?: string; // expects "received"
  postedAt?: string | null;

  schools: SchoolLite[];
  items: ReceiptItemLite[];

  onSaved?: () => void; // refresh parent view if you want
};

/* ---------------- Helpers ---------------- */

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const asBool = (v: any) => {
  if (v === true || v === 1 || v === "1") return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "yes";
};

const todayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const fmt = (n: any) => {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString("en-IN");
};

const bookMeta = (b?: BookLite | null) =>
  [b?.class_name ? `C:${b.class_name}` : null, b?.subject ? `S:${b.subject}` : null, b?.code ? `Code:${b.code}` : null]
    .filter(Boolean)
    .join(" • ");

/* ---------------- Component ---------------- */

export default function SupplierReceiptAllocationsModal({
  open,
  onClose,
  receiptId,
  receiptNo,
  receiptStatus,
  postedAt,
  schools,
  items,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [mode, setMode] = useState<"APPEND" | "REPLACE">("APPEND");
  const [schoolId, setSchoolId] = useState<string>("");
  const [issuedDate, setIssuedDate] = useState<string>(() => todayISO());
  const [remarks, setRemarks] = useState<string>("");

  const [existing, setExisting] = useState<AllocationRow[]>([]);

  // user inputs per (book_id + is_specimen)
  type DraftLine = {
    key: string;
    book_id: number;
    title: string;
    meta: string;
    is_specimen: boolean;
    received_qty: number;
    already_allocated: number;
    remaining: number;

    qty: string;
    specimen_reason: string;
  };

  const canAllocate = useMemo(() => {
    const st = String(receiptStatus || "").toLowerCase();
    if (st !== "received") return false;
    // your controller requires posted_at if column exists; we respect it (soft check)
    // if backend doesn't have posted_at, postedAt will be undefined anyway
    if (postedAt === null) return false;
    return true;
  }, [receiptStatus, postedAt]);

  const receiptLines = useMemo(() => {
    // group by book_id + is_specimen (same as controller validation key)
    const map = new Map<string, { book_id: number; is_specimen: boolean; received_qty: number; title: string; meta: string; specimen_reason?: string }>();

    (items || []).forEach((it) => {
      const book_id = num(it.book_id);
      if (!book_id) return;

      const is_specimen = asBool((it as any).is_specimen);
      const key = `${book_id}|${is_specimen ? 1 : 0}`;
      const rq = num((it as any).received_qty);
        const qq = num((it as any).qty);

        // ✅ If received_qty is 0 but qty exists, treat qty as received_qty
        const received_qty = Math.max(0, Math.floor(rq > 0 ? rq : qq));


      const title = it.book?.title || `Book #${book_id}`;
      const meta = bookMeta(it.book);

      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          book_id,
          is_specimen,
          received_qty,
          title,
          meta,
          specimen_reason: (it as any).specimen_reason || "",
        });
      } else {
        prev.received_qty += received_qty;
      }
    });

    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [items]);

  const allocatedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of existing || []) {
      const key = `${num(a.book_id)}|${asBool(a.is_specimen) ? 1 : 0}`;
      m.set(key, (m.get(key) || 0) + Math.max(0, Math.floor(num(a.qty))));
    }
    return m;
  }, [existing]);

  const [draft, setDraft] = useState<DraftLine[]>([]);

  const rebuildDraft = () => {
    const lines: DraftLine[] = receiptLines.map((r) => {
      const already_allocated = allocatedMap.get(r.key) || 0;
      const remaining = Math.max(0, r.received_qty - already_allocated);

      return {
        key: r.key,
        book_id: r.book_id,
        title: r.title,
        meta: r.meta,
        is_specimen: r.is_specimen,
        received_qty: r.received_qty,
        already_allocated,
        remaining,
        qty: "",
        specimen_reason: r.is_specimen ? String(r.specimen_reason || "") : "",
      };
    });

    setDraft(lines);
  };

  const fetchExisting = async () => {
    if (!receiptId) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.get(`/api/supplier-receipts/${receiptId}/allocations`);
      const rows = (res.data as any)?.allocations || [];
      setExisting(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to load allocations");
      setExisting([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receiptId]);

  // rebuild draft when existing changes
  useEffect(() => {
    if (!open) return;
    rebuildDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receiptLines, existing]);

  const setQty = (key: string, v: string) => {
    setDraft((p) => p.map((x) => (x.key === key ? { ...x, qty: v } : x)));
  };

  const setSpecReason = (key: string, v: string) => {
    setDraft((p) => p.map((x) => (x.key === key ? { ...x, specimen_reason: v } : x)));
  };

  const clearAll = () => {
    setDraft((p) => p.map((x) => ({ ...x, qty: "" })));
  };

  const fillMaxAll = () => {
    setDraft((p) =>
      p.map((x) => ({
        ...x,
        qty: x.remaining > 0 ? String(x.remaining) : "",
      }))
    );
  };

  const validateBeforeSave = () => {
    if (!canAllocate) return "Receipt must be RECEIVED (and posted) before allocation.";
    if (!schoolId) return "Select school.";
    const sid = num(schoolId);
    if (!sid) return "Invalid school.";

    const picked = draft
      .map((x) => ({ ...x, q: Math.max(0, Math.floor(num(x.qty))) }))
      .filter((x) => x.q > 0);

    if (!picked.length) return "Enter qty for at least one book.";

    for (const l of picked) {
      if (l.q > l.remaining) {
        return `Qty exceeds remaining for ${l.title} (${l.is_specimen ? "Specimen" : "Paid"}). Remaining=${l.remaining}`;
      }
      if (l.is_specimen && l.q > 0 && l.specimen_reason.trim().length === 0) {
        // not mandatory in DB, but useful
        // keep as warning -> we allow it
      }
    }

    return null;
  };

  const save = async () => {
    setError(null);
    setInfo(null);

    const err = validateBeforeSave();
    if (err) {
      setError(err);
      return;
    }

    const sid = num(schoolId);

    const allocations = draft
      .map((x) => ({
        school_id: sid,
        book_id: x.book_id,
        qty: Math.max(0, Math.floor(num(x.qty))),
        is_specimen: x.is_specimen,
        specimen_reason: x.is_specimen ? (x.specimen_reason || "").trim() || null : null,
        remarks: remarks.trim() || null,
        issued_date: issuedDate || null,
      }))
      .filter((x) => x.book_id && x.qty > 0);

    setSaving(true);
    try {
      await api.post(`/api/supplier-receipts/${receiptId}/allocations`, {
        mode,
        allocations,
      });

      setInfo("Allocation saved.");
      setRemarks("");
      setSchoolId("");
      clearAll();

      await fetchExisting();
      onSaved?.();
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || e?.response?.data?.details || "Failed to save allocation");
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    const picked = draft.map((x) => Math.max(0, Math.floor(num(x.qty)))).reduce((a, b) => a + b, 0);
    const remainingTotal = draft.map((x) => x.remaining).reduce((a, b) => a + b, 0);
    const receivedTotal = draft.map((x) => x.received_qty).reduce((a, b) => a + b, 0);
    const allocatedTotal = draft.map((x) => x.already_allocated).reduce((a, b) => a + b, 0);
    return { picked, remainingTotal, receivedTotal, allocatedTotal };
  }, [draft]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60">
      <div className="h-full w-full p-2 sm:p-4 flex items-center justify-center">
        <div className="w-full max-w-[1200px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-emerald-50 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                Allocate to Schools {receiptNo ? `• ${receiptNo}` : receiptId ? `• #${receiptId}` : ""}
              </div>
              <div className="mt-1 text-[11px] text-slate-600">
                Mode: <b>{mode}</b> • Key is <b>book + specimen</b> (same as backend validation)
              </div>

              {!canAllocate ? (
                <div className="mt-2 text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  Allocation allowed only when receipt status is <b>RECEIVED</b> (and posted). Please mark received first.
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={fetchExisting}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-[12px] disabled:opacity-60"
                title="Refresh"
              >
                <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>

              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Alerts */}
          {(error || info) && (
            <div className="px-4 pt-3">
              {error ? (
                <div className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>
              ) : null}
              {info ? (
                <div className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  {info}
                </div>
              ) : null}
            </div>
          )}

          <div className="p-4 grid grid-cols-12 gap-4">
            {/* Left: Create allocation */}
            <div className="col-span-12 lg:col-span-7">
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-100 flex flex-wrap items-center gap-2 justify-between">
                  <div className="text-xs font-semibold">Create Allocation</div>
                  <div className="text-[11px] text-slate-700 flex flex-wrap items-center gap-2">
                    <span className="px-2 py-1 rounded-xl border bg-white">
                      Received: <b>{fmt(summary.receivedTotal)}</b>
                    </span>
                    <span className="px-2 py-1 rounded-xl border bg-white">
                      Already Alloc: <b>{fmt(summary.allocatedTotal)}</b>
                    </span>
                    <span className="px-2 py-1 rounded-xl border bg-white">
                      Remaining: <b>{fmt(summary.remainingTotal)}</b>
                    </span>
                    <span className="px-2 py-1 rounded-xl border bg-slate-900 text-white">
                      Selected: <b>{fmt(summary.picked)}</b>
                    </span>
                  </div>
                </div>

                {/* Top inputs */}
                <div className="p-3 grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-4">
                    <div className="text-[10px] text-slate-500 mb-1">Mode</div>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as any)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                      disabled={!canAllocate}
                    >
                      <option value="APPEND">APPEND (add new)</option>
                      <option value="REPLACE">REPLACE (delete old + re-issue)</option>
                    </select>
                  </div>

                  <div className="col-span-12 md:col-span-8">
                    <div className="text-[10px] text-slate-500 mb-1">School *</div>
                    <select
                      value={schoolId}
                      onChange={(e) => setSchoolId(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                      disabled={!canAllocate}
                    >
                      <option value="">Select school</option>
                      {schools
                        .filter((s) => s?.is_active !== false)
                        .map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                            {s.city ? ` • ${s.city}` : ""}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="col-span-12 md:col-span-4">
                    <div className="text-[10px] text-slate-500 mb-1">Issued Date</div>
                    <input
                      type="date"
                      value={issuedDate}
                      onChange={(e) => setIssuedDate(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                      disabled={!canAllocate}
                    />
                  </div>

                  <div className="col-span-12 md:col-span-8">
                    <div className="text-[10px] text-slate-500 mb-1">Remarks (optional)</div>
                    <input
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                      placeholder="e.g. Issued for new session"
                      disabled={!canAllocate}
                    />
                  </div>
                </div>

                {/* Lines */}
                <div className="max-h-[48vh] overflow-auto border-t">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-white sticky top-0 z-10">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 text-left">Book</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-left w-[90px]">Type</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right w-[90px]">Received</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right w-[90px]">Allocated</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right w-[90px]">Remain</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right w-[110px]">Qty</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-left w-[220px]">Spec Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.map((l) => {
                        const remain = l.remaining;
                        const q = Math.max(0, Math.floor(num(l.qty)));
                        const over = q > remain;

                        return (
                          <tr key={l.key} className="hover:bg-slate-50">
                            <td className="border-b border-slate-200 px-3 py-2">
                              <div className="font-medium text-slate-900">{l.title}</div>
                              {l.meta ? <div className="text-[11px] text-slate-500">{l.meta}</div> : null}
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] border ${
                                  l.is_specimen
                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                    : "bg-indigo-50 text-indigo-800 border-indigo-200"
                                }`}
                              >
                                {l.is_specimen ? "SPEC" : "PAID"}
                              </span>
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">{fmt(l.received_qty)}</td>
                            <td className="border-b border-slate-200 px-3 py-2 text-right">{fmt(l.already_allocated)}</td>
                            <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">{fmt(remain)}</td>
                            <td className="border-b border-slate-200 px-3 py-2 text-right">
                              <input
                                type="number"
                                min={0}
                                value={l.qty}
                                onChange={(e) => setQty(l.key, e.target.value)}
                                className={`w-[100px] border rounded-xl px-2 py-1.5 text-[12px] text-right bg-white ${
                                  over ? "border-rose-400 bg-rose-50" : "border-slate-300"
                                }`}
                                disabled={!canAllocate || remain <= 0}
                                placeholder={remain > 0 ? "0" : "—"}
                              />
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2">
                              {l.is_specimen ? (
                                <input
                                  value={l.specimen_reason}
                                  onChange={(e) => setSpecReason(l.key, e.target.value)}
                                  className="w-full border border-slate-300 rounded-xl px-2 py-1.5 text-[12px] bg-white"
                                  placeholder="optional (e.g. Specimen)"
                                  disabled={!canAllocate}
                                />
                              ) : (
                                <span className="text-[11px] text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {!draft.length ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                            No receipt items found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                {/* Footer actions */}
                <div className="p-3 border-t bg-slate-50 flex flex-wrap items-center gap-2 justify-end">
                  <button
                    onClick={clearAll}
                    disabled={!canAllocate}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-[12px] disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </button>

                  <button
                    onClick={fillMaxAll}
                    disabled={!canAllocate}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 text-[12px] disabled:opacity-60"
                  >
                    Fill Max
                  </button>

                  <button
                    onClick={save}
                    disabled={!canAllocate || saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-[12px] font-semibold disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? "Saving..." : "Save Allocation"}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: existing allocations */}
            <div className="col-span-12 lg:col-span-5">
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-100 flex items-center justify-between">
                  <div className="text-xs font-semibold">Existing Allocations</div>
                  <div className="text-[11px] text-slate-500">{existing.length} rows</div>
                </div>

                {loading ? (
                  <div className="p-4 text-sm text-slate-500 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                ) : existing.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">No allocations yet.</div>
                ) : (
                  <div className="max-h-[62vh] overflow-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-white sticky top-0 z-10">
                        <tr>
                          <th className="border-b border-slate-200 px-3 py-2 text-left">School</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-left">Book</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-left w-[70px]">Type</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-right w-[70px]">Qty</th>
                          <th className="border-b border-slate-200 px-3 py-2 text-left w-[95px]">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {existing.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="border-b border-slate-200 px-3 py-2">
                              <div className="font-medium">{a.school?.name || `School #${a.school_id}`}</div>
                              {a.school?.city ? <div className="text-[11px] text-slate-500">{a.school.city}</div> : null}
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2">
                              <div className="font-medium">{a.book?.title || `Book #${a.book_id}`}</div>
                              {a.is_specimen && a.specimen_reason ? (
                                <div className="text-[11px] text-amber-700">Spec • {a.specimen_reason}</div>
                              ) : null}
                              {a.remarks ? <div className="text-[11px] text-slate-500">Rmk: {a.remarks}</div> : null}
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] border ${
                                  a.is_specimen
                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                    : "bg-indigo-50 text-indigo-800 border-indigo-200"
                                }`}
                              >
                                {a.is_specimen ? "SPEC" : "PAID"}
                              </span>
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">{fmt(a.qty)}</td>
                            <td className="border-b border-slate-200 px-3 py-2">{a.issued_date ? String(a.issued_date).slice(0, 10) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="px-3 py-2 border-t text-[11px] text-slate-500">
                  Tip: If you want to re-distribute from scratch, set Mode = <b>REPLACE</b> and re-enter quantities.
                </div>
              </div>
            </div>
          </div>

          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}
