// components/SupplierReceiptsPageClient.tsx
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
  Building2,
  Phone,
  Mail,
  MapPin,
  Hash,
  CalendarDays,
  Eye,
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

type PublisherLite = { id: number; name: string };

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

type SchoolOrderItemLite = {
  id?: number;
  book_id: number;
  book?: BookLite | null;

  total_order_qty?: number | string;
  ordered_qty?: number | string;
  received_qty?: number | string;

  unit_price?: number | string | null;
  discount_pct?: number | string | null;
  discount_amt?: number | string | null;
};

type SchoolOrderLite = {
  id: number;
  order_no?: string | null;
  status?: string | null;

  school_id?: number | null;
  school?: SchoolLite | null;

  supplier_id?: number | null;
  supplier?: SupplierLite | null;

  publisher_id?: number | null;
  publisher?: PublisherLite | null;

  createdAt?: string;
  order_date?: string | null;

  items?: SchoolOrderItemLite[];
};

type SupplierReceiptItem = {
  id?: number;
  supplier_receipt_id?: number;
  book_id: number;

  ordered_qty?: number | string;
  received_qty?: number | string;

  unit_price?: number | string;
  discount_pct?: number | string | null;
  discount_amt?: number | string | null; // per unit
  net_unit_price?: number | string | null;
  line_amount?: number | string | null;

  // legacy fallback
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

  // optional (if backend includes)
  school_order?: any;
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

const safeSupplierAddress = (s?: SupplierLite | null) => s?.full_address || s?.address || s?.address_line1 || "";

/** ordered qty from different keys */
const getOrderedQty = (it: SchoolOrderItemLite) => num(it.total_order_qty ?? it.ordered_qty ?? 0);

const normalizeItemForView = (it: SupplierReceiptItem) => {
  const received_qty = it.received_qty ?? it.ordered_qty ?? it.qty ?? 0;
  const ordered_qty = it.ordered_qty ?? it.received_qty ?? it.qty ?? 0;
  const unit_price = it.unit_price ?? it.rate ?? 0;

  let discount_pct = it.discount_pct ?? 0;
  let discount_amt = it.discount_amt ?? 0;

  if ((discount_pct == null || discount_pct === "") && it.item_discount_type === "PERCENT") {
    discount_pct = it.item_discount_value ?? 0;
  }
  if ((discount_amt == null || discount_amt === "") && it.item_discount_type === "AMOUNT") {
    discount_amt = it.item_discount_value ?? 0;
  }

  const line_amount = it.line_amount ?? it.net_amount ?? 0;
  const net_unit_price =
    it.net_unit_price ?? (num(received_qty) > 0 ? num(line_amount) / num(received_qty) : num(unit_price));

  return {
    ...it,
    ordered_qty,
    received_qty,
    unit_price,
    discount_pct,
    discount_amt,
    net_unit_price,
    line_amount,
  };
};

type UiItem = {
  book_id: number;
  title: string;
  meta: string;

  ordered_qty: number;
  already_received_qty: number;
  pending_qty: number;

  rec_qty: string; // receive now
  unit_price: string;

  disc_pct: string; // per unit
  disc_amt: string; // per unit

  disc_mode: "PERCENT" | "AMOUNT" | "NONE";
};

const computeRow = (qty: number, unit: number, discAmtPerUnit: number) => {
  const q = clamp(num(qty), 0, 999999999);
  const up = clamp(num(unit), 0, 999999999);
  const da = clamp(num(discAmtPerUnit), 0, up);
  const netUp = Math.max(up - da, 0);
  const grossLine = up * q;
  const discLine = da * q;
  const netLine = netUp * q;
  return { q, up, da, netUp, grossLine, discLine, netLine };
};

const pickPublisherNameFromReceipt = (r: SupplierReceipt) => {
  const anyR: any = r as any;
  return anyR?.school_order?.publisher?.name || anyR?.publisher?.name || anyR?.publisher_name || "";
};

/* ---------------- Component ---------------- */

export default function SupplierReceiptsPageClient() {
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [receipts, setReceipts] = useState<SupplierReceipt[]>([]);

  // masters
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [publishers, setPublishers] = useState<PublisherLite[]>([]);
  const [schools, setSchools] = useState<SchoolLite[]>([]);

  // orders for selected school
  const [schoolOrders, setSchoolOrders] = useState<SchoolOrderLite[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // filters (top header)
  const [filterPublisherId, setFilterPublisherId] = useState("");
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterInvoiceNo, setFilterInvoiceNo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // preview before save
  const [previewOpen, setPreviewOpen] = useState(false);

  const [form, setForm] = useState({
    // selection
    school_id: "",
    school_order_id: "",
    supplier_id: "",

    // header fields
    invoice_no: "",
    invoice_date: "",
    received_date: "",
    // ✅ status is forced internally (no UI field)
    status: "received" as "draft" | "received",
    remarks: "",

    // charges (bottom)
    bill_discount_type: "NONE" as "NONE" | "PERCENT" | "AMOUNT",
    bill_discount_value: "",
    shipping_charge: "",
    other_charge: "",
    round_off: "",
  });

  const [items, setItems] = useState<UiItem[]>([]);

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

  const fetchPublishers = async () => {
    try {
      const res = await api.get("/api/publishers");
      const list: PublisherLite[] =
        (res.data as any)?.publishers || (res.data as any)?.data || (Array.isArray(res.data) ? res.data : []);
      setPublishers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("publishers load error:", e);
      setPublishers([]);
    }
  };

  const fetchSchools = async () => {
    try {
      const res = await api.get("/api/schools");
      const list: SchoolLite[] = (res.data as any)?.data || (res.data as any)?.schools || [];
      const activeOnly = (Array.isArray(list) ? list : []).filter((s) => s?.is_active !== false);
      setSchools(activeOnly);
    } catch (e) {
      console.error("schools load error:", e);
      setSchools([]);
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

      // NOTE: publisher + invoice filters are applied client-side (safe even if backend doesn't support)
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
    fetchPublishers();
    fetchSchools();
    fetchReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------ School -> Load Complete Orders ------------ */

  const fetchCompleteOrdersForSchool = async (schoolId: number) => {
    setOrdersLoading(true);
    setSchoolOrders([]);
    try {
      const tryStatuses = ["complete", "completed"];
      let got: any[] | null = null;

      for (const st of tryStatuses) {
        try {
          const res = await api.get("/api/school-orders", {
            params: { school_id: schoolId, status: st },
          });

          const list: any[] =
            (res.data as any)?.orders || (res.data as any)?.data || (Array.isArray(res.data) ? (res.data as any) : []);

          if (Array.isArray(list) && list.length) {
            got = list;
            break;
          }
        } catch {
          // keep trying
        }
      }

      if (!got) {
        const res2 = await api.get("/api/school-orders", { params: { school_id: schoolId } });
        const list2: any[] =
          (res2.data as any)?.orders || (res2.data as any)?.data || (Array.isArray(res2.data) ? (res2.data as any) : []);
        got = Array.isArray(list2) ? list2 : [];
      }

      setSchoolOrders(got as any);
    } catch (e: any) {
      console.error("load school orders error:", e);
      setError(e?.response?.data?.error || "Failed to load complete orders for selected school");
    } finally {
      setOrdersLoading(false);
    }
  };

  const hydrateFromSelectedOrder = async (orderId: number) => {
    setError(null);

    const found = schoolOrders.find((o) => o.id === orderId);

    const loadDetail = async (): Promise<SchoolOrderLite | null> => {
      if (found?.items?.length) return found;
      try {
        const res = await api.get(`/api/school-orders/${orderId}`);
        const row: SchoolOrderLite =
          (res.data as any)?.order || (res.data as any)?.schoolOrder || (res.data as any);
        return row || null;
      } catch (e) {
        console.error("order detail load failed:", e);
        return found || null;
      }
    };

    const row = await loadDetail();
    if (!row) return;

    const autoSupplierId = row.supplier_id || row.supplier?.id || null;

    const orderItems = row.items || [];
    const mapped: UiItem[] = orderItems
      .map((it) => {
        const ordered = Math.max(0, Math.floor(getOrderedQty(it)));
        const already = Math.max(0, Math.floor(num(it.received_qty)));
        const pending = Math.max(ordered - already, 0);

        const title = it.book?.title || `Book #${it.book_id}`;
        const metaParts = [it.book?.class_name ? `C:${it.book.class_name}` : null, it.book?.subject ? `S:${it.book.subject}` : null, it.book?.code ? `Code:${it.book.code}` : null].filter(Boolean);
        const meta = metaParts.join(" • ");

        const up = it.unit_price != null ? num(it.unit_price) : 0;
        const dp = it.discount_pct != null ? num(it.discount_pct) : 0;
        const da = it.discount_amt != null ? num(it.discount_amt) : 0;

        // keep row discount in AMOUNT internally (per unit)
        let discAmt = 0;
        let discPct = 0;
        let discMode: UiItem["disc_mode"] = "NONE";

        if (da > 0) {
          discAmt = da;
          discPct = up > 0 ? (discAmt / up) * 100 : 0;
          discMode = "AMOUNT";
        } else if (dp > 0) {
          discPct = dp;
          discAmt = (up * discPct) / 100;
          discMode = "PERCENT";
        }

        return {
          book_id: it.book_id,
          title,
          meta,

          ordered_qty: ordered,
          already_received_qty: already,
          pending_qty: pending,

          rec_qty: String(pending),
          unit_price: up ? String(up) : "",

          disc_pct: discPct ? String(Math.round(discPct * 100) / 100) : "",
          disc_amt: discAmt ? String(Math.round(discAmt * 100) / 100) : "",
          disc_mode: discMode,
        };
      })
      .filter((x) => x.book_id && x.ordered_qty > 0);

    setForm((p) => ({
      ...p,
      school_order_id: String(orderId),
      supplier_id: autoSupplierId ? String(autoSupplierId) : p.supplier_id,
      // ✅ force received
      status: "received",
    }));

    setItems(mapped);
  };

  /* ------------ Create modal ------------ */

  const openCreate = () => {
    setError(null);
    setInfo(null);
    setCreateOpen(true);
    setPreviewOpen(false);

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    setForm({
      school_id: "",
      school_order_id: "",
      supplier_id: "",

      invoice_no: "",
      invoice_date: "",
      received_date: todayStr,
      // ✅ force received
      status: "received",
      remarks: "",

      bill_discount_type: "NONE",
      bill_discount_value: "",
      shipping_charge: "",
      other_charge: "",
      round_off: "",
    });

    setSchoolOrders([]);
    setItems([]);
  };

  const orderLabel = (o: SchoolOrderLite) => {
    const pub = o.publisher?.name || (o.publisher_id ? `Publisher #${o.publisher_id}` : "Publisher");
    const ord = o.order_no || `#${o.id}`;
    const dt = formatDate(o.order_date || o.createdAt);
    return `${pub} • ${ord} • ${dt}`;
  };

  /* ------------ Row discount syncing (only one input) ------------ */

  const setRowRecQty = (idx: number, v: string) => {
    setItems((p) => p.map((r, i) => (i === idx ? { ...r, rec_qty: v } : r)));
  };

  const setRowUnit = (idx: number, v: string) => {
    // when unit price changes, re-sync pct/amt based on current mode
    setItems((p) =>
      p.map((r, i) => {
        if (i !== idx) return r;
        const up = num(v);
        if (r.disc_mode === "PERCENT") {
          const pct = clamp(num(r.disc_pct), 0, 100);
          const amt = (up * pct) / 100;
          return {
            ...r,
            unit_price: v,
            disc_amt: pct > 0 ? String(Math.round(amt * 100) / 100) : "",
            disc_mode: pct > 0 ? "PERCENT" : "NONE",
          };
        }
        if (r.disc_mode === "AMOUNT") {
          const amt = clamp(num(r.disc_amt), 0, up);
          const pct = up > 0 ? (amt / up) * 100 : 0;
          return {
            ...r,
            unit_price: v,
            disc_pct: amt > 0 ? String(Math.round(pct * 100) / 100) : "",
            disc_mode: amt > 0 ? "AMOUNT" : "NONE",
          };
        }
        return { ...r, unit_price: v };
      })
    );
  };

  const setRowDiscPct = (idx: number, v: string) => {
    setItems((p) =>
      p.map((r, i) => {
        if (i !== idx) return r;
        const up = num(r.unit_price);
        const pct = clamp(num(v), 0, 100);
        const amt = (up * pct) / 100;
        return {
          ...r,
          disc_pct: v,
          disc_amt: pct > 0 ? String(Math.round(amt * 100) / 100) : "",
          disc_mode: pct > 0 ? "PERCENT" : "NONE",
        };
      })
    );
  };

  const setRowDiscAmt = (idx: number, v: string) => {
    setItems((p) =>
      p.map((r, i) => {
        if (i !== idx) return r;
        const up = num(r.unit_price);
        const amt = clamp(num(v), 0, up);
        const pct = up > 0 ? (amt / up) * 100 : 0;
        return {
          ...r,
          disc_amt: v,
          disc_pct: amt > 0 ? String(Math.round(pct * 100) / 100) : "",
          disc_mode: amt > 0 ? "AMOUNT" : "NONE",
        };
      })
    );
  };

  /* ------------ Totals (show Gross + Net separately) ------------ */

  const totals = useMemo(() => {
    let gross = 0;
    let itemDisc = 0;
    let net = 0;

    items.forEach((it) => {
      const qty = Math.max(0, Math.floor(num(it.rec_qty)));
      const up = Math.max(0, num(it.unit_price));
      const discAmt = Math.max(0, num(it.disc_amt)); // per unit (synced)
      const row = computeRow(qty, up, discAmt);
      gross += row.grossLine;
      itemDisc += row.discLine;
      net += row.netLine;
    });

    const ship = Math.max(0, num(form.shipping_charge));
    const other = Math.max(0, num(form.other_charge));
    const ro = num(form.round_off);

    let billDisc = 0;
    const bdt = String(form.bill_discount_type || "NONE").toUpperCase();
    const bdv = Math.max(0, num(form.bill_discount_value));

    if (bdt === "PERCENT") billDisc = (net * bdv) / 100;
    else if (bdt === "AMOUNT") billDisc = bdv;

    if (billDisc > net) billDisc = net;

    const grand = net - billDisc + ship + other + ro;

    return {
      gross,
      itemDisc,
      net,
      billDisc,
      ship,
      other,
      ro,
      grand,
    };
  }, [items, form]);

  /* ------------ Submit (with Preview Confirm) ------------ */

  const buildPayload = () => {
    const supplier_id = Number(form.supplier_id);

    const cleanItems = items
      .map((it) => {
        const received_qty = Math.max(0, Math.floor(num(it.rec_qty)));
        const ordered_qty = Math.max(0, Math.floor(num(it.ordered_qty)));
        const unit_price = Math.max(0, num(it.unit_price));

        const discPct = Math.max(0, num(it.disc_pct));
        const discAmt = Math.max(0, num(it.disc_amt));

        let item_discount_type: "NONE" | "PERCENT" | "AMOUNT" = "NONE";
        let item_discount_value: number | null = null;

        if (it.disc_mode === "AMOUNT" && discAmt > 0) {
          item_discount_type = "AMOUNT";
          item_discount_value = discAmt;
        } else if (it.disc_mode === "PERCENT" && discPct > 0) {
          item_discount_type = "PERCENT";
          item_discount_value = discPct;
        } else {
          if (discAmt > 0) {
            item_discount_type = "AMOUNT";
            item_discount_value = discAmt;
          } else if (discPct > 0) {
            item_discount_type = "PERCENT";
            item_discount_value = discPct;
          }
        }

        return {
          book_id: it.book_id,

          ordered_qty,
          received_qty,

          qty: received_qty,
          rate: unit_price,

          item_discount_type,
          item_discount_value,
        };
      })
      .filter((x) => x.book_id && x.received_qty > 0);

    const payload: any = {
      supplier_id,
      school_order_id: Number(form.school_order_id),

      invoice_no: form.invoice_no?.trim() || null,

      invoice_date: form.invoice_date || undefined,
      received_date: form.received_date || undefined,

      // ✅ always received (no UI field)
      status: "received",
      remarks: form.remarks?.trim() || null,

      bill_discount_type: form.bill_discount_type,
      bill_discount_value: form.bill_discount_value ? num(form.bill_discount_value) : null,

      shipping_charge: form.shipping_charge ? num(form.shipping_charge) : 0,
      other_charge: form.other_charge ? num(form.other_charge) : 0,
      round_off: form.round_off ? num(form.round_off) : 0,

      items: cleanItems,
    };

    return { payload, cleanItems };
  };

  const validateBeforePreview = () => {
    const supplier_id = Number(form.supplier_id);
    if (!supplier_id) return "Supplier * required.";
    if (!form.school_id) return "School * required.";
    if (!form.school_order_id) return "Order * required.";

    const anyTooMuch = items.some((x) => Math.floor(num(x.rec_qty)) > x.pending_qty);
    if (anyTooMuch) return "Fix Rec. qty (cannot exceed pending).";

    const { cleanItems } = buildPayload();
    if (!cleanItems.length) return "Enter Rec. qty for at least 1 book.";

    return null;
  };

  const openPreview = () => {
    setError(null);
    const err = validateBeforePreview();
    if (err) {
      setError(err);
      return;
    }
    setPreviewOpen(true);
  };

  const submitCreate = async () => {
    setError(null);
    setInfo(null);

    const err = validateBeforePreview();
    if (err) {
      setError(err);
      return;
    }

    const { payload } = buildPayload();

    setCreating(true);
    try {
      const res = await api.post("/api/supplier-receipts", payload);
      setInfo(res?.data?.message || "Receipt created.");
      setPreviewOpen(false);
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
      const row = (res?.data as any)?.receipt as SupplierReceipt | undefined;
      if (row?.items?.length) row.items = row.items.map(normalizeItemForView);
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

  const handleViewPdf = async (id: number) => {
    setError(null);
    try {
      const res = await api.get(`/api/supplier-receipts/${id}/pdf`, { responseType: "blob" });

      const contentType = (res.headers as any)?.["content-type"] || "";
      if (!contentType.includes("application/pdf")) {
        const blob = res.data as Blob;
        const text = await blob.text().catch(() => "");
        throw new Error(text || "Not a PDF.");
      }

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      console.error("receipt pdf error:", e);
      setError(e?.response?.data?.error || e?.response?.data?.message || e?.message || "PDF failed (endpoint missing?)");
    }
  };

  /* ------------ Listing: client-side filters for Publisher + Invoice ------------ */

  const visible = useMemo(() => {
    let list = receipts || [];

    // Publisher filter (works only if backend returns publisher info with receipt; otherwise it won't filter)
    if (filterPublisherId) {
      const pub = publishers.find((p) => String(p.id) === String(filterPublisherId));
      const name = pub?.name || "";
      if (name) {
        list = list.filter((r) => (pickPublisherNameFromReceipt(r) || "").toLowerCase().includes(name.toLowerCase()));
      }
    }

    // Invoice filter (always works)
    if (filterInvoiceNo.trim()) {
      const q = filterInvoiceNo.trim().toLowerCase();
      list = list.filter((r) => String(r.invoice_no || "").toLowerCase().includes(q));
    }

    return list;
  }, [receipts, filterPublisherId, filterInvoiceNo, publishers]);

  const viewTotals = useMemo(() => {
    if (!viewRow) return null;

    const items2 = (viewRow.items || []).map(normalizeItemForView);
    const itemsNetComputed = items2.reduce((sum, it) => sum + num(it.line_amount), 0);

    const sub_total = viewRow.sub_total != null ? num(viewRow.sub_total) : itemsNetComputed;

    const ship = num(viewRow.shipping_charge);
    const other = num(viewRow.other_charge);
    const ro = num(viewRow.round_off);

    const bdt = String(viewRow.bill_discount_type || "NONE").toUpperCase();
    const bdv = num(viewRow.bill_discount_value);

    let discAmt =
      viewRow.bill_discount_amount != null
        ? num(viewRow.bill_discount_amount)
        : bdt === "PERCENT"
          ? (sub_total * Math.max(0, bdv)) / 100
          : bdt === "AMOUNT"
            ? Math.max(0, bdv)
            : 0;

    if (discAmt > sub_total) discAmt = sub_total;

    const grand = viewRow.grand_total != null ? num(viewRow.grand_total) : sub_total - discAmt + ship + other + ro;

    return {
      itemsNetComputed,
      sub_total,
      bill_discount_type: bdt as "NONE" | "PERCENT" | "AMOUNT",
      bill_discount_value: bdv,
      bill_discount_amount: discAmt,
      shipping_charge: ship,
      other_charge: other,
      round_off: ro,
      grand_total: grand,
      items: items2,
    };
  }, [viewRow]);

  const MiniLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[10px] text-slate-500 leading-none mb-1">{children}</div>
  );

  const TinyPill = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200">
      <div className="text-[10px] text-slate-600">{label}</div>
      <div className="text-[12px] font-bold text-slate-900">{value}</div>
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

        {/* Filters (Publisher -> Invoice first) */}
        <div className="px-3 pb-3 flex flex-wrap items-end gap-2">
          <div>
            <MiniLabel>Publisher</MiniLabel>
            <select
              value={filterPublisherId}
              onChange={(e) => setFilterPublisherId(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[220px]"
              title="Publisher"
            >
              <option value="">All</option>
              {publishers.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <MiniLabel>Invoice</MiniLabel>
            <input
              value={filterInvoiceNo}
              onChange={(e) => setFilterInvoiceNo(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[160px]"
              placeholder="Invoice no"
              title="Invoice No"
            />
          </div>

          <div>
            <MiniLabel>Supplier</MiniLabel>
            <select
              value={filterSupplierId}
              onChange={(e) => setFilterSupplierId(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[220px]"
              title="Supplier"
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
            <MiniLabel>Status</MiniLabel>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[140px]"
              title="Status"
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <MiniLabel>From</MiniLabel>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
              title="From"
            />
          </div>

          <div>
            <MiniLabel>To</MiniLabel>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
              title="To"
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
            title="Refresh"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={openCreate}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-white
                       bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:brightness-110"
            title="Create Receipt"
          >
            <PlusCircle className="w-4 h-4" />
            Create
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
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Receipt</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Supplier</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Invoice</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Rcv Date</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Grand</th>
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
                      <td className="border-b border-slate-200 px-3 py-2">{r.supplier?.name || `Supplier #${r.supplier_id}`}</td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">{r.invoice_no || "-"}</td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-700">{formatDate(r.received_date || r.invoice_date)}</td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">₹{fmtMoney(r.grand_total)}</td>
                      <td className="border-b border-slate-200 px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] ${statusChip(r.status)}`}>{r.status}</span>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openView(r.id)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-[12px]"
                            title="View"
                          >
                            <FileText className="w-4 h-4" />
                            View
                          </button>

                          <button
                            type="button"
                            onClick={() => handleViewPdf(r.id)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-[12px]"
                            title="PDF"
                          >
                            <FileText className="w-4 h-4" />
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="px-4 py-2 text-[10px] text-slate-500 border-t">
                Note: Publisher filter works if backend sends publisher details with receipts; invoice filter always works.
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ---------------- Create Modal ---------------- */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full p-2 sm:p-3">
            <div className="mx-auto w-full max-w-[1220px] h-full">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden h-[96vh] flex flex-col">
                {/* HEADER: super compact (more space to listing) */}
                <div className="border-b bg-slate-50">
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">Receipt</div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setItems((p) => p.map((x) => ({ ...x, rec_qty: String(x.pending_qty) })))}
                        className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-[12px]"
                        title="Fill Rec. = Pending"
                      >
                        <RefreshCcw className="w-4 h-4" />
                        Fill Pending
                      </button>

                      <button
                        onClick={() => {
                          setPreviewOpen(false);
                          setCreateOpen(false);
                        }}
                        className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                        title="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* ✅ top portion minimized: row-1 fields, row-2 remarks + totals (gross/net/grand) */}
                  <div className="px-3 pb-2">
                    <div className="grid grid-cols-12 gap-2">
                      {/* School */}
                      <div className="col-span-12 md:col-span-2">
                        <MiniLabel>School *</MiniLabel>
                        <select
                          value={form.school_id}
                          onChange={async (e) => {
                            const v = e.target.value;
                            setError(null);
                            setForm((p) => ({
                              ...p,
                              school_id: v,
                              school_order_id: "",
                              supplier_id: "",
                              status: "received",
                            }));
                            setItems([]);
                            setSchoolOrders([]);
                            if (v) await fetchCompleteOrdersForSchool(Number(v));
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px] bg-white"
                          title="School"
                        >
                          <option value="">Select</option>
                          {schools.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.name}
                              {s.city ? ` • ${s.city}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Order */}
                      <div className="col-span-12 md:col-span-4">
                        <MiniLabel>Order *</MiniLabel>
                        <select
                          value={form.school_order_id}
                          disabled={!form.school_id || ordersLoading}
                          onChange={async (e) => {
                            const v = e.target.value;
                            setForm((p) => ({ ...p, school_order_id: v, status: "received" }));
                            setItems([]);
                            if (v) await hydrateFromSelectedOrder(Number(v));
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px] bg-white disabled:opacity-60"
                          title="Order"
                        >
                          <option value="">
                            {ordersLoading ? "Loading..." : form.school_id ? "Select order" : "Select school first"}
                          </option>
                          {schoolOrders.map((o) => (
                            <option key={o.id} value={String(o.id)}>
                              {orderLabel(o)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Supplier */}
                      <div className="col-span-12 md:col-span-2">
                        <MiniLabel>Supplier *</MiniLabel>
                        <select
                          value={form.supplier_id}
                          onChange={(e) => setForm((p) => ({ ...p, supplier_id: e.target.value, status: "received" }))}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px] bg-white"
                          title="Supplier"
                        >
                          <option value="">Select</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Invoice no */}
                      <div className="col-span-12 md:col-span-2">
                        <MiniLabel>Invoice</MiniLabel>
                        <input
                          value={form.invoice_no}
                          onChange={(e) => setForm((p) => ({ ...p, invoice_no: e.target.value, status: "received" }))}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px]"
                          placeholder="No"
                          title="Invoice No"
                        />
                      </div>

                      {/* Bill Date */}
                      <div className="col-span-6 md:col-span-1">
                        <MiniLabel>Bill</MiniLabel>
                        <input
                          type="date"
                          value={form.invoice_date}
                          onChange={(e) => setForm((p) => ({ ...p, invoice_date: e.target.value, status: "received" }))}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px]"
                          title="Invoice Date"
                        />
                      </div>

                      {/* GRN Date */}
                      <div className="col-span-6 md:col-span-1">
                        <MiniLabel>GRN *</MiniLabel>
                        <input
                          type="date"
                          value={form.received_date}
                          onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value, status: "received" }))}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px]"
                          title="Received Date"
                        />
                      </div>
                    </div>

                    {/* ✅ Row-2: Remarks + Totals (Gross/Net/Grand) in same line */}
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[220px]">
                        <MiniLabel>Remarks</MiniLabel>
                        <input
                          value={form.remarks}
                          onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value, status: "received" }))}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px]"
                          placeholder="optional"
                          title="Remarks"
                        />
                      </div>

                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <TinyPill label="Gross" value={`₹${fmtMoney(totals.gross)}`} />
                        <TinyPill label="Net" value={`₹${fmtMoney(totals.net)}`} />
                        <div className="px-3 py-1.5 rounded-lg bg-slate-900 text-white">
                          <div className="text-[10px] opacity-80 leading-none">Grand</div>
                          <div className="text-[12px] font-extrabold">₹{fmtMoney(totals.grand)}</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setItems((p) => p.map((x) => ({ ...x, rec_qty: String(x.pending_qty) })))}
                          className="sm:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[12px]"
                          title="Fill Rec. = Pending"
                        >
                          <RefreshCcw className="w-4 h-4" />
                          Fill
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* LISTING (gets more height now) */}
                <div className="flex-1 min-h-0">
                  {items.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500">Select an order to load books.</div>
                  ) : (
                    <div className="h-full overflow-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-100 sticky top-0 z-10">
                          <tr>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-left">Book</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-14">Ord</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-14">Pend</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-24">Rec.</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-24">Unit</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-16">%Disc</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-24">Disc₹</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-24">Net</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-28">Line</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-10"> </th>
                          </tr>
                        </thead>

                        <tbody>
                          {items.map((it, idx) => {
                            const qty = Math.max(0, Math.floor(num(it.rec_qty)));
                            const up = Math.max(0, num(it.unit_price));
                            const discAmt = Math.max(0, num(it.disc_amt));
                            const row = computeRow(qty, up, discAmt);

                            const tooMuch = qty > it.pending_qty;

                            return (
                              <tr key={it.book_id} className="hover:bg-slate-50">
                                <td className="border-b border-slate-200 px-2 py-1.5">
                                  <div className="font-medium text-slate-900">{it.title}</div>
                                  <div className="text-[11px] text-slate-500 hidden md:block">{it.meta}</div>
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">{it.ordered_qty}</td>
                                <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">{it.pending_qty}</td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={it.rec_qty}
                                    onChange={(e) => setRowRecQty(idx, e.target.value)}
                                    className={`w-24 border rounded-xl px-2 py-1.5 text-[12px] text-right ${
                                      tooMuch ? "border-rose-400 bg-rose-50" : "border-slate-300"
                                    }`}
                                    title="Received now"
                                  />
                                  {tooMuch ? <div className="text-[10px] text-rose-700 mt-1">Max: {it.pending_qty}</div> : null}
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={it.unit_price}
                                    onChange={(e) => setRowUnit(idx, e.target.value)}
                                    className="w-24 border border-slate-300 rounded-xl px-2 py-1.5 text-[12px] text-right"
                                    title="Unit price"
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={it.disc_pct}
                                    onChange={(e) => setRowDiscPct(idx, e.target.value)}
                                    className={`w-16 border rounded-xl px-2 py-1.5 text-[12px] text-right ${
                                      it.disc_mode === "PERCENT" ? "border-indigo-300 bg-indigo-50" : "border-slate-300"
                                    }`}
                                    title="% discount (auto sync Disc₹)"
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={it.disc_amt}
                                    onChange={(e) => setRowDiscAmt(idx, e.target.value)}
                                    className={`w-24 border rounded-xl px-2 py-1.5 text-[12px] text-right ${
                                      it.disc_mode === "AMOUNT" ? "border-indigo-300 bg-indigo-50" : "border-slate-300"
                                    }`}
                                    title="Fixed discount per unit (auto sync %)"
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">₹{fmtMoney(row.netUp)}</td>
                                <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">₹{fmtMoney(row.netLine)}</td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setItems((p2) => p2.filter((_, i) => i !== idx))}
                                    className="inline-flex items-center justify-center p-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                                    title="Remove line (does not change order)"
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
                  )}
                </div>

                {/* BOTTOM BAR: Charges + Preview/Save */}
                <div className="border-t bg-white">
                  <div className="px-4 py-2 bg-slate-50 flex flex-wrap items-end gap-2">
                    <div>
                      <MiniLabel>Bill Disc</MiniLabel>
                      <select
                        value={form.bill_discount_type}
                        onChange={(e) => setForm((p) => ({ ...p, bill_discount_type: e.target.value as any }))}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] bg-white min-w-[110px]"
                        title="Bill discount type"
                      >
                        <option value="NONE">NONE</option>
                        <option value="PERCENT">%</option>
                        <option value="AMOUNT">₹</option>
                      </select>
                    </div>

                    <div>
                      <MiniLabel>Disc Val</MiniLabel>
                      <input
                        type="number"
                        min={0}
                        value={form.bill_discount_value}
                        onChange={(e) => setForm((p) => ({ ...p, bill_discount_value: e.target.value }))}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] text-right w-[105px]"
                        placeholder="0"
                        title="Bill discount value"
                      />
                    </div>

                    <div>
                      <MiniLabel>Ship</MiniLabel>
                      <input
                        type="number"
                        min={0}
                        value={form.shipping_charge}
                        onChange={(e) => setForm((p) => ({ ...p, shipping_charge: e.target.value }))}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] text-right w-[100px]"
                        placeholder="0"
                        title="Shipping charge"
                      />
                    </div>

                    <div>
                      <MiniLabel>Other</MiniLabel>
                      <input
                        type="number"
                        min={0}
                        value={form.other_charge}
                        onChange={(e) => setForm((p) => ({ ...p, other_charge: e.target.value }))}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] text-right w-[100px]"
                        placeholder="0"
                        title="Other charge"
                      />
                    </div>

                    <div>
                      <MiniLabel>Round</MiniLabel>
                      <input
                        type="number"
                        value={form.round_off}
                        onChange={(e) => setForm((p) => ({ ...p, round_off: e.target.value }))}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] text-right w-[100px]"
                        placeholder="0"
                        title="Round off"
                      />
                    </div>

                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <TinyPill label="Item Disc" value={`₹${fmtMoney(totals.itemDisc)}`} />
                      <TinyPill label="Bill Disc" value={`₹${fmtMoney(totals.billDisc)}`} />
                      <div className="px-3 py-2 rounded-xl bg-slate-900 text-white">
                        <div className="text-[10px] opacity-80 leading-none">Grand</div>
                        <div className="text-[12px] font-extrabold">₹{fmtMoney(totals.grand)}</div>
                      </div>

                      <button
                        onClick={() => {
                          setPreviewOpen(false);
                          setCreateOpen(false);
                        }}
                        className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                        title="Cancel"
                      >
                        Cancel
                      </button>

                      <button
                        onClick={openPreview}
                        disabled={items.some((x) => Math.floor(num(x.rec_qty)) > x.pending_qty)}
                        className="text-[12px] px-4 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 disabled:opacity-60 font-semibold inline-flex items-center gap-2"
                        title="Preview before saving"
                      >
                        <Eye className="w-4 h-4" />
                        Preview
                      </button>

                      <button
                        onClick={submitCreate}
                        disabled={creating || items.some((x) => Math.floor(num(x.rec_qty)) > x.pending_qty)}
                        className="text-[12px] px-5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 font-semibold"
                        title="Save (direct)"
                      >
                        {creating ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Preview Modal (inside create) */}
                {previewOpen && (
                  <div className="fixed inset-0 z-[60] bg-black/60">
                    <div className="h-full w-full p-3 sm:p-4 overflow-auto">
                      <div className="mx-auto w-full max-w-[980px]">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                          <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-center justify-between">
                            <div className="text-sm font-semibold">Preview Receipt</div>
                            <button
                              onClick={() => setPreviewOpen(false)}
                              className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                              title="Close preview"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="p-4">
                            <div className="grid grid-cols-12 gap-3">
                              <div className="col-span-12 border border-slate-200 rounded-2xl p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-[11px] text-slate-600">Supplier</div>
                                    <div className="mt-1 font-semibold text-slate-900">
                                      {suppliers.find((s) => String(s.id) === String(form.supplier_id))?.name || "-"}
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-500">
                                      Invoice: <b>{form.invoice_no || "-"}</b>
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-500">
                                      Bill Date: <b>{form.invoice_date || "-"}</b> • GRN Date: <b>{form.received_date || "-"}</b>
                                    </div>
                                    {form.remarks?.trim() ? (
                                      <div className="mt-1 text-[11px] text-slate-500">
                                        Remarks: <b>{form.remarks.trim()}</b>
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap gap-2 justify-end">
                                    <TinyPill label="Gross" value={`₹${fmtMoney(totals.gross)}`} />
                                    <TinyPill label="ItemDisc" value={`₹${fmtMoney(totals.itemDisc)}`} />
                                    <TinyPill label="Net" value={`₹${fmtMoney(totals.net)}`} />
                                    <TinyPill label="BillDisc" value={`₹${fmtMoney(totals.billDisc)}`} />
                                    <TinyPill label="Ship" value={`₹${fmtMoney(totals.ship)}`} />
                                    <TinyPill label="Other" value={`₹${fmtMoney(totals.other)}`} />
                                    <TinyPill label="Round" value={`₹${fmtMoney(totals.ro)}`} />
                                    <div className="px-3 py-2 rounded-xl bg-slate-900 text-white">
                                      <div className="text-[10px] opacity-80 leading-none">Grand</div>
                                      <div className="text-[12px] font-extrabold">₹{fmtMoney(totals.grand)}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden">
                              <div className="px-3 py-2 bg-slate-100 text-xs font-semibold">Lines</div>
                              <div className="overflow-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead className="bg-white">
                                    <tr>
                                      <th className="border-b border-slate-200 px-3 py-2 text-left">Book</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Rec</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Unit</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Disc</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Net Unit</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Line</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items
                                      .filter((x) => Math.floor(num(x.rec_qty)) > 0)
                                      .map((it) => {
                                        const qty = Math.max(0, Math.floor(num(it.rec_qty)));
                                        const up = Math.max(0, num(it.unit_price));
                                        const discAmt = Math.max(0, num(it.disc_amt));
                                        const row = computeRow(qty, up, discAmt);
                                        const discText =
                                          it.disc_mode === "PERCENT"
                                            ? `${fmtMoney(num(it.disc_pct))}%`
                                            : it.disc_mode === "AMOUNT"
                                              ? `₹${fmtMoney(num(it.disc_amt))}`
                                              : "-";

                                        return (
                                          <tr key={it.book_id} className="hover:bg-slate-50">
                                            <td className="border-b border-slate-200 px-3 py-2">
                                              <div className="font-medium">{it.title}</div>
                                              <div className="text-[11px] text-slate-500">{it.meta}</div>
                                            </td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right">{qty}</td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right">₹{fmtMoney(up)}</td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right">{discText}</td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right">₹{fmtMoney(row.netUp)}</td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">₹{fmtMoney(row.netLine)}</td>
                                          </tr>
                                        );
                                      })}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="mt-4 flex justify-end gap-2">
                              <button
                                onClick={() => setPreviewOpen(false)}
                                className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                              >
                                Back
                              </button>
                              <button
                                onClick={submitCreate}
                                disabled={creating}
                                className="text-[12px] px-5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 font-semibold"
                              >
                                {creating ? "Saving..." : "Confirm Save"}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="h-6" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- View Modal ---------------- */}
      {viewOpen && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full overflow-auto p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[1200px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      Receipt Details {viewRow?.receipt_no ? `• ${viewRow.receipt_no}` : viewId ? `• #${viewId}` : ""}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-700">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="font-semibold text-slate-900">
                          {viewRow?.supplier?.name || (viewRow?.supplier_id ? `Supplier #${viewRow.supplier_id}` : "-")}
                        </span>
                      </span>

                      {viewRow?.supplier?.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                          {viewRow.supplier.phone}
                        </span>
                      ) : null}

                      {viewRow?.supplier?.email ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          {viewRow.supplier.email}
                        </span>
                      ) : null}

                      {safeSupplierAddress(viewRow?.supplier) ? (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate max-w-[520px]">{safeSupplierAddress(viewRow?.supplier)}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {viewId ? (
                      <button
                        onClick={() => handleViewPdf(viewId)}
                        className="text-[12px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-2"
                        title="Open PDF (if endpoint exists)"
                      >
                        <FileText className="w-4 h-4" /> PDF
                      </button>
                    ) : null}

                    <button
                      onClick={() => setViewOpen(false)}
                      className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
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
                    <>
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600">Status</div>
                          <div className="mt-1">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${statusChip(viewRow.status)}`}>{viewRow.status}</span>
                          </div>
                        </div>

                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600 inline-flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5" /> Invoice No
                          </div>
                          <div className="mt-1 text-sm font-semibold">{viewRow.invoice_no || "-"}</div>
                        </div>

                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600 inline-flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5" /> Bill / GRN
                          </div>
                          <div className="mt-1 text-[12px] text-slate-800">
                            <div>
                              <span className="text-slate-500">Bill:</span>{" "}
                              <span className="font-semibold">{formatDate(viewRow.invoice_date)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">GRN:</span>{" "}
                              <span className="font-semibold">{formatDate(viewRow.received_date || viewRow.invoice_date)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3 bg-slate-50">
                          <div className="text-[11px] text-slate-600">Grand Total</div>
                          <div className="mt-1 text-sm font-extrabold">
                            ₹{fmtMoney(viewTotals?.grand_total ?? viewRow.grand_total)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
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
                    </>
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
