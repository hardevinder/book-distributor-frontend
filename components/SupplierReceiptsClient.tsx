"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronLeft,
  FileText,
  PlusCircle,
  RefreshCcw,
  X,
  Trash2,
  CheckCircle2,
  XCircle,
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

type BookLite = {
  id: number;
  title: string;
  class_name?: string | null;
  subject?: string | null;
  code?: string | null;
  isbn?: string | null;
};

type SupplierReceiptItem = {
  id?: number;
  supplier_receipt_id?: number;
  book_id: number;

  // ✅ new
  ordered_qty?: number | string;
  received_qty?: number | string;

  unit_price?: number | string;
  discount_pct?: number | string | null;
  discount_amt?: number | string | null;
  net_unit_price?: number | string | null;
  line_amount?: number | string | null;

  // legacy fallback (old receipts)
  qty?: number | string;
  rate?: number | string;
  item_discount_type?: "NONE" | "PERCENT" | "AMOUNT";
  item_discount_value?: number | string | null;
  gross_amount?: number | string;
  discount_amount?: number | string;
  net_amount?: number | string;

  book?: BookLite | null;
};

type SupplierReceipt = {
  id: number;
  supplier_id: number;
  school_order_id?: number | null;

  receipt_no: string;
  invoice_no?: string | null;
  academic_session?: string | null;

  invoice_date?: string;
  received_date?: string;

  status: "draft" | "received" | "cancelled";
  remarks?: string | null;

  sub_total?: number | string;
  bill_discount_type?: "NONE" | "PERCENT" | "AMOUNT";
  bill_discount_value?: number | string | null;
  bill_discount_amount?: number | string;

  shipping_charge?: number | string;
  other_charge?: number | string;
  round_off?: number | string;

  grand_total?: number | string;

  supplier?: SupplierLite | null;
  items?: SupplierReceiptItem[];
};

type ListResponse = { receipts: SupplierReceipt[] };
type GetResponse = { receipt: SupplierReceipt };

/* ---------------- Helpers ---------------- */

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const fmtMoney = (n: any) => {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const statusChip = (s: SupplierReceipt["status"]) => {
  if (s === "received") return "bg-emerald-50 text-emerald-800 border border-emerald-200";
  if (s === "cancelled") return "bg-rose-50 text-rose-800 border border-rose-200";
  return "bg-slate-50 text-slate-700 border border-slate-200";
};

/** Compute pricing like backend: net_unit = unit_price - discount_amt (or pct) */
const computeLinePricing = (qty: number, unit_price: number, discount_pct: number, discount_amt: number) => {
  const up = clamp(num(unit_price), 0, 999999999);
  const q = clamp(num(qty), 0, 999999999);
  const dp = clamp(num(discount_pct), 0, 100);

  let da = num(discount_amt);
  if (!Number.isFinite(da) || da < 0) da = 0;

  // if discount_amt is empty and pct exists -> compute per-unit discount
  if (!da && dp > 0) da = (up * dp) / 100;

  const net = Math.max(up - da, 0);
  const line = net * q;

  return {
    unit_price: up,
    discount_pct: dp,
    discount_amt: da,
    net_unit_price: net,
    line_amount: line,
  };
};

/** Normalize older API receipts that may still return qty/rate/net_amount */
const normalizeItemForView = (it: SupplierReceiptItem) => {
  const received_qty =
    it.received_qty ?? it.ordered_qty ?? it.qty ?? 0;

  const unit_price =
    it.unit_price ?? it.rate ?? 0;

  // if new fields exist, prefer them
  const line_amount =
    it.line_amount ?? it.net_amount ?? 0;

  const net_unit_price =
    it.net_unit_price ??
    (num(received_qty) > 0 ? num(line_amount) / num(received_qty) : unit_price);

  return {
    ...it,
    received_qty,
    unit_price,
    net_unit_price,
    line_amount,
  };
};

/* ---------------- Component ---------------- */

export default function SupplierReceiptsPage() {
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [receipts, setReceipts] = useState<SupplierReceipt[]>([]);

  // masters
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [books, setBooks] = useState<BookLite[]>([]);

  // filters
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    supplier_id: "",
    school_order_id: "",
    invoice_no: "",
    academic_session: "2025-26",
    invoice_date: "",
    received_date: "",
    status: "received" as "draft" | "received",
    remarks: "",

    bill_discount_type: "NONE" as "NONE" | "PERCENT" | "AMOUNT",
    bill_discount_value: "",
    shipping_charge: "",
    other_charge: "",
    round_off: "",
  });

  const [items, setItems] = useState<
    Array<{
      book_id: string;
      received_qty: string;
      unit_price: string;
      discount_pct: string;
      discount_amt: string;
    }>
  >([
    { book_id: "", received_qty: "1", unit_price: "", discount_pct: "", discount_amt: "" },
  ]);

  // view modal
  const [viewOpen, setViewOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [viewRow, setViewRow] = useState<SupplierReceipt | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  /* ------------ Fetch masters ------------ */

  const fetchSuppliers = async () => {
    try {
      const res = await api.get("/api/suppliers");
      const list: SupplierLite[] = Array.isArray(res.data) ? res.data : res.data?.suppliers || [];
      setSuppliers(list || []);
    } catch (e) {
      console.error("suppliers load error:", e);
      setSuppliers([]);
    }
  };

  const fetchBooks = async () => {
    try {
      const res = await api.get("/api/books");
      const list: BookLite[] = Array.isArray(res.data) ? res.data : res.data?.books || [];
      setBooks(list || []);
    } catch (e) {
      console.error("books load error:", e);
      setBooks([]);
    }
  };

  /* ------------ Fetch receipts ------------ */

  const fetchReceipts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (filterSupplierId) params.supplier_id = Number(filterSupplierId);
      if (filterStatus) params.status = filterStatus;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;

      const res = await api.get<ListResponse>("/api/supplier-receipts", { params });
      const list = (res?.data as any)?.receipts;
      setReceipts(Array.isArray(list) ? list : []);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to load supplier receipts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    fetchBooks();
    fetchReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------ Create helpers ------------ */

  const addItemRow = () => {
    setItems((p) => [...p, { book_id: "", received_qty: "1", unit_price: "", discount_pct: "", discount_amt: "" }]);
  };

  const removeItemRow = (idx: number) => {
    setItems((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== idx)));
  };

  const calcPreview = useMemo(() => {
    let itemsNet = 0;

    items.forEach((it) => {
      const qty = Math.max(0, Math.floor(num(it.received_qty)));
      const up = Math.max(0, num(it.unit_price));
      const dp = Math.max(0, num(it.discount_pct));
      const da = Math.max(0, num(it.discount_amt));

      const p = computeLinePricing(qty, up, dp, da);
      itemsNet += p.line_amount;
    });

    const ship = Math.max(0, num(form.shipping_charge));
    const other = Math.max(0, num(form.other_charge));
    const ro = num(form.round_off); // can be +/-

    let billDisc = 0;
    const bdt = String(form.bill_discount_type || "NONE").toUpperCase();
    const bdv = Math.max(0, num(form.bill_discount_value));

    if (bdt === "PERCENT") billDisc = (itemsNet * bdv) / 100;
    else if (bdt === "AMOUNT") billDisc = bdv;

    if (billDisc > itemsNet) billDisc = itemsNet;

    const grand = itemsNet - billDisc + ship + other + ro;

    return {
      itemsNet,
      billDisc,
      ship,
      other,
      ro,
      grand,
    };
  }, [items, form]);

  const openCreate = () => {
    setError(null);
    setInfo(null);
    setCreateOpen(true);

    setForm((p) => ({
      ...p,
      supplier_id: "",
      school_order_id: "",
      invoice_no: "",
      remarks: "",
      invoice_date: "",
      received_date: "",
      status: "received",
      bill_discount_type: "NONE",
      bill_discount_value: "",
      shipping_charge: "",
      other_charge: "",
      round_off: "",
    }));

    setItems([{ book_id: "", received_qty: "1", unit_price: "", discount_pct: "", discount_amt: "" }]);
  };

  const submitCreate = async () => {
    setError(null);
    setInfo(null);

    const supplier_id = Number(form.supplier_id);
    if (!supplier_id) {
      setError("Select supplier.");
      return;
    }

    const cleanItems = items
      .map((it) => {
        const received_qty = Math.max(0, Math.floor(num(it.received_qty)));
        const unit_price = Math.max(0, num(it.unit_price));
        const discount_pct = Math.max(0, num(it.discount_pct));
        const discount_amt = Math.max(0, num(it.discount_amt));

        return {
          book_id: Number(it.book_id),
          ordered_qty: received_qty, // for manual create, ordered = received
          received_qty,
          unit_price,
          discount_pct: discount_pct || 0,
          discount_amt: discount_amt || 0,
        };
      })
      .filter((x) => x.book_id && x.received_qty > 0);

    if (!cleanItems.length) {
      setError("Add at least one valid item (book + received qty + unit price).");
      return;
    }

    setCreating(true);
    try {
      const payload: any = {
        supplier_id,
        school_order_id: form.school_order_id ? Number(form.school_order_id) : null,
        invoice_no: form.invoice_no?.trim() || null,
        academic_session: form.academic_session?.trim() || null,
        invoice_date: form.invoice_date || undefined,
        received_date: form.received_date || undefined,
        status: form.status || "received",
        remarks: form.remarks?.trim() || null,

        bill_discount_type: form.bill_discount_type,
        bill_discount_value: form.bill_discount_value ? num(form.bill_discount_value) : null,

        shipping_charge: form.shipping_charge ? num(form.shipping_charge) : 0,
        other_charge: form.other_charge ? num(form.other_charge) : 0,
        round_off: form.round_off ? num(form.round_off) : 0,

        items: cleanItems,
      };

      const res = await api.post("/api/supplier-receipts", payload);
      setInfo(res?.data?.message || "Receipt created.");
      setCreateOpen(false);
      await fetchReceipts();
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || e?.response?.data?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  };

  /* ------------ View receipt ------------ */

  const openView = async (id: number) => {
    setViewOpen(true);
    setViewId(id);
    setViewRow(null);
    setViewLoading(true);
    setError(null);

    try {
      const res = await api.get<GetResponse>(`/api/supplier-receipts/${id}`);
      const row = (res?.data as any)?.receipt;
      if (row?.items?.length) {
        row.items = row.items.map(normalizeItemForView);
      }
      setViewRow(row || null);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to load receipt");
    } finally {
      setViewLoading(false);
    }
  };

  const updateStatus = async (next: "draft" | "received" | "cancelled") => {
    if (!viewId) return;
    setStatusSaving(true);
    setError(null);
    try {
      await api.patch(`/api/supplier-receipts/${viewId}/status`, { status: next });
      setInfo("Status updated.");
      setViewRow((p) => (p ? { ...p, status: next } : p));
      await fetchReceipts();
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || "Failed to update status");
    } finally {
      setStatusSaving(false);
    }
  };

  /* ------------ Filtered receipts ------------ */

  const visible = receipts;

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
              <div className="text-sm font-semibold truncate">Supplier Receipts (GRN / Invoice)</div>
              <div className="text-[11px] text-slate-500 truncate">
                Inventory IN + Supplier Ledger posting happens on <b>status = received</b>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-600 hidden sm:inline">{user?.name || "User"}</span>
            <button onClick={logout} className="text-[11px] px-3 py-1 rounded-full bg-rose-600 text-white">
              Logout
            </button>
          </div>
        </div>

        <div className="px-3 pb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Supplier</label>
            <select
              value={filterSupplierId}
              onChange={(e) => setFilterSupplierId(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[220px]"
            >
              <option value="">All</option>
              {suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[140px]"
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
            />
          </div>

          <button
            type="button"
            onClick={fetchReceipts}
            disabled={loading}
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
            Create Receipt
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

      <main className="p-3">
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-sm font-semibold">Receipts</div>
            <div className="text-[11px] text-slate-500">{visible.length} rows</div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : visible.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No receipts.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Receipt No</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Supplier</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Invoice No</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Received Date</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Grand Total</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Status</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-900">
                        {r.receipt_no || `#${r.id}`}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2">
                        {r.supplier?.name || `Supplier #${r.supplier_id}`}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                        {r.invoice_no || "-"}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                        {formatDate(r.received_date || r.invoice_date)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">
                        ₹{fmtMoney(r.grand_total)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] ${statusChip(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openView(r.id)}
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
            <div className="mx-auto w-full max-w-[1100px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold">Create Supplier Receipt</div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      This will create receipt + items. If status is <b>received</b>, it will also post Inventory IN + Supplier Ledger.
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
                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-slate-600 mb-1">Supplier *</label>
                      <select
                        value={form.supplier_id}
                        onChange={(e) => setForm((p) => ({ ...p, supplier_id: e.target.value }))}
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

                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-slate-600 mb-1">Invoice No</label>
                      <input
                        value={form.invoice_no}
                        onChange={(e) => setForm((p) => ({ ...p, invoice_no: e.target.value }))}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                        placeholder="INV-..."
                      />
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-slate-600 mb-1">Academic Session</label>
                      <input
                        value={form.academic_session}
                        onChange={(e) => setForm((p) => ({ ...p, academic_session: e.target.value }))}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                        placeholder="2025-26"
                      />
                    </div>

                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-[11px] text-slate-600 mb-1">Invoice Date</label>
                      <input
                        type="date"
                        value={form.invoice_date}
                        onChange={(e) => setForm((p) => ({ ...p, invoice_date: e.target.value }))}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                      />
                    </div>

                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-[11px] text-slate-600 mb-1">Received Date</label>
                      <input
                        type="date"
                        value={form.received_date}
                        onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                      />
                    </div>

                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-[11px] text-slate-600 mb-1">Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                      >
                        <option value="received">received</option>
                        <option value="draft">draft</option>
                      </select>
                    </div>

                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-[11px] text-slate-600 mb-1">School Order ID (optional)</label>
                      <input
                        value={form.school_order_id}
                        onChange={(e) => setForm((p) => ({ ...p, school_order_id: e.target.value }))}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                        placeholder="Order id..."
                      />
                    </div>

                    <div className="col-span-12">
                      <label className="block text-[11px] text-slate-600 mb-1">Remarks</label>
                      <input
                        value={form.remarks}
                        onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                        placeholder="Notes / remarks..."
                      />
                    </div>
                  </div>

                  {/* Items */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                      <div className="text-sm font-semibold">Items</div>
                      <button
                        type="button"
                        onClick={addItemRow}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-[12px] hover:bg-slate-800"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Add row
                      </button>
                    </div>

                    <div className="overflow-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="border-b border-slate-200 px-3 py-2 text-left">Book</th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right w-28">Received Qty</th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right w-28">Unit Price</th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right w-24">Disc %</th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right w-28">Disc ₹/Unit</th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right w-32">Line Amount</th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right w-12"> </th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => {
                            const qty = Math.max(0, Math.floor(num(it.received_qty)));
                            const up = Math.max(0, num(it.unit_price));
                            const dp = Math.max(0, num(it.discount_pct));
                            const da = Math.max(0, num(it.discount_amt));
                            const p = computeLinePricing(qty, up, dp, da);

                            return (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="border-b border-slate-200 px-3 py-2">
                                  <select
                                    value={it.book_id}
                                    onChange={(e) =>
                                      setItems((p2) =>
                                        p2.map((r, i) => (i === idx ? { ...r, book_id: e.target.value } : r))
                                      )
                                    }
                                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                                  >
                                    <option value="">-- Select book --</option>
                                    {books.map((b) => (
                                      <option key={b.id} value={String(b.id)}>
                                        {b.title}
                                        {b.class_name ? ` • ${b.class_name}` : ""}
                                        {b.subject ? ` • ${b.subject}` : ""}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                <td className="border-b border-slate-200 px-3 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={it.received_qty}
                                    onChange={(e) =>
                                      setItems((p2) =>
                                        p2.map((r, i) => (i === idx ? { ...r, received_qty: e.target.value } : r))
                                      )
                                    }
                                    className="w-28 border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-3 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={it.unit_price}
                                    onChange={(e) =>
                                      setItems((p2) =>
                                        p2.map((r, i) => (i === idx ? { ...r, unit_price: e.target.value } : r))
                                      )
                                    }
                                    className="w-28 border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-3 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={it.discount_pct}
                                    onChange={(e) =>
                                      setItems((p2) =>
                                        p2.map((r, i) => (i === idx ? { ...r, discount_pct: e.target.value } : r))
                                      )
                                    }
                                    className="w-24 border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-3 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={it.discount_amt}
                                    onChange={(e) =>
                                      setItems((p2) =>
                                        p2.map((r, i) => (i === idx ? { ...r, discount_amt: e.target.value } : r))
                                      )
                                    }
                                    className="w-28 border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">
                                  ₹{fmtMoney(p.line_amount)}
                                </td>

                                <td className="border-b border-slate-200 px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeItemRow(idx)}
                                    className="inline-flex items-center justify-center p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                                    title="Remove"
                                  >
                                    <Trash2 className="w-4 h-4 text-rose-600" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Charges + Preview */}
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 lg:col-span-7 border border-slate-200 rounded-2xl p-4">
                      <div className="text-sm font-semibold mb-2">Charges / Discounts</div>
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-12 md:col-span-4">
                          <label className="block text-[11px] text-slate-600 mb-1">Bill Discount Type</label>
                          <select
                            value={form.bill_discount_type}
                            onChange={(e) => setForm((p) => ({ ...p, bill_discount_type: e.target.value as any }))}
                            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                          >
                            <option value="NONE">NONE</option>
                            <option value="PERCENT">PERCENT</option>
                            <option value="AMOUNT">AMOUNT</option>
                          </select>
                        </div>

                        <div className="col-span-12 md:col-span-4">
                          <label className="block text-[11px] text-slate-600 mb-1">Bill Discount Value</label>
                          <input
                            type="number"
                            min={0}
                            value={form.bill_discount_value}
                            onChange={(e) => setForm((p) => ({ ...p, bill_discount_value: e.target.value }))}
                            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                          />
                        </div>

                        <div className="col-span-12 md:col-span-4" />

                        <div className="col-span-12 md:col-span-4">
                          <label className="block text-[11px] text-slate-600 mb-1">Shipping</label>
                          <input
                            type="number"
                            min={0}
                            value={form.shipping_charge}
                            onChange={(e) => setForm((p) => ({ ...p, shipping_charge: e.target.value }))}
                            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                          />
                        </div>

                        <div className="col-span-12 md:col-span-4">
                          <label className="block text-[11px] text-slate-600 mb-1">Other</label>
                          <input
                            type="number"
                            min={0}
                            value={form.other_charge}
                            onChange={(e) => setForm((p) => ({ ...p, other_charge: e.target.value }))}
                            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                          />
                        </div>

                        <div className="col-span-12 md:col-span-4">
                          <label className="block text-[11px] text-slate-600 mb-1">Round Off</label>
                          <input
                            type="number"
                            value={form.round_off}
                            onChange={(e) => setForm((p) => ({ ...p, round_off: e.target.value }))}
                            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 lg:col-span-5 border border-slate-200 rounded-2xl p-4 bg-slate-50">
                      <div className="text-sm font-semibold mb-2">Preview</div>
                      <div className="space-y-1 text-[12px]">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Items Net</span>
                          <span className="font-semibold">₹{fmtMoney(calcPreview.itemsNet)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Bill Discount</span>
                          <span className="font-semibold">- ₹{fmtMoney(calcPreview.billDisc)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Shipping</span>
                          <span className="font-semibold">₹{fmtMoney(calcPreview.ship)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Other</span>
                          <span className="font-semibold">₹{fmtMoney(calcPreview.other)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Round Off</span>
                          <span className="font-semibold">
                            {calcPreview.ro >= 0 ? "+" : "-"} ₹{fmtMoney(Math.abs(calcPreview.ro))}
                          </span>
                        </div>

                        <div className="h-px bg-slate-200 my-2" />

                        <div className="flex justify-between text-[13px]">
                          <span className="font-extrabold">Grand Total</span>
                          <span className="font-extrabold">₹{fmtMoney(calcPreview.grand)}</span>
                        </div>
                      </div>
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
                    {creating ? "Saving..." : "Save Receipt"}
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
            <div className="mx-auto w-full max-w-[1100px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      Receipt Details {viewRow?.receipt_no ? `• ${viewRow.receipt_no}` : ""}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Supplier:{" "}
                      <span className="font-semibold text-slate-900">
                        {viewRow?.supplier?.name ||
                          (viewRow?.supplier_id ? `Supplier #${viewRow.supplier_id}` : "-")}
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
                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600">Status</div>
                          <div className="mt-1">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${statusChip(viewRow.status)}`}>
                              {viewRow.status}
                            </span>
                          </div>
                        </div>

                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600">Invoice No</div>
                          <div className="mt-1 text-sm font-semibold">{viewRow.invoice_no || "-"}</div>
                        </div>

                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600">Received Date</div>
                          <div className="mt-1 text-sm font-semibold">
                            {formatDate(viewRow.received_date || viewRow.invoice_date)}
                          </div>
                        </div>

                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3 bg-slate-50">
                          <div className="text-[11px] text-slate-600">Grand Total</div>
                          <div className="mt-1 text-sm font-extrabold">₹{fmtMoney(viewRow.grand_total)}</div>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                          <div className="text-sm font-semibold">Items</div>
                          <div className="text-[11px] text-slate-500">{(viewRow.items || []).length} lines</div>
                        </div>

                        <div className="overflow-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="border-b border-slate-200 px-3 py-2 text-left">Book</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-right w-28">Qty</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-right w-28">Unit</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-right w-28">Disc/Unit</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-right w-32">Line</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(viewRow.items || []).map((raw, idx) => {
                                const it = normalizeItemForView(raw);
                                const qty = Math.max(0, Math.floor(num(it.received_qty)));
                                const up = Math.max(0, num(it.unit_price));
                                const dp = Math.max(0, num(it.discount_pct));
                                const da = Math.max(0, num(it.discount_amt));
                                const p = computeLinePricing(qty, up, dp, da);

                                // prefer server line_amount if present; else computed
                                const line = it.line_amount != null ? num(it.line_amount) : p.line_amount;
                                const discPerUnit = p.discount_amt;

                                return (
                                  <tr key={it.id ?? idx} className="hover:bg-slate-50">
                                    <td className="border-b border-slate-200 px-3 py-2">
                                      {it.book?.title || `Book #${it.book_id}`}
                                    </td>
                                    <td className="border-b border-slate-200 px-3 py-2 text-right">{qty}</td>
                                    <td className="border-b border-slate-200 px-3 py-2 text-right">₹{fmtMoney(up)}</td>
                                    <td className="border-b border-slate-200 px-3 py-2 text-right">
                                      ₹{fmtMoney(discPerUnit)}
                                    </td>
                                    <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">
                                      ₹{fmtMoney(line)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          disabled={statusSaving || viewRow.status === "draft"}
                          onClick={() => updateStatus("draft")}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60 text-[12px]"
                        >
                          <XCircle className="w-4 h-4" />
                          Mark Draft
                        </button>

                        <button
                          disabled={statusSaving || viewRow.status === "received"}
                          onClick={() => updateStatus("received")}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 disabled:opacity-60 text-[12px] font-semibold"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Mark Received
                        </button>

                        <button
                          disabled={statusSaving || viewRow.status === "cancelled"}
                          onClick={() => updateStatus("cancelled")}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100 disabled:opacity-60 text-[12px] font-semibold"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancel
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
    </div>
  );
}
