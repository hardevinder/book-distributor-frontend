// components/SupplierReceiptsPageClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Pencil,
  ArrowRightLeft,
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

type ReceiveDocType = "CHALLAN" | "INVOICE";

type SupplierReceipt = {
  id: number;
  supplier_id: number;
  school_order_id?: number | null;

  receipt_no: string;

  // preferred
  receive_doc_type?: ReceiveDocType | string | null;
  doc_no?: string | null;
  doc_date?: string | null;

  // legacy (kept)
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

  // optional if backend includes
  school_order?: any;

  // optional posted flag if backend includes (future)
  posted_at?: string | null;
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
  return "bg-amber-50 text-amber-900 border border-amber-200";
};

const docTypePill = (t?: any) => {
  const x = String(t || "").toUpperCase();
  if (x === "INVOICE") return "bg-indigo-50 text-indigo-800 border border-indigo-200";
  if (x === "CHALLAN") return "bg-amber-50 text-amber-800 border border-amber-200";
  return "bg-slate-50 text-slate-700 border border-slate-200";
};

const safeSupplierAddress = (s?: SupplierLite | null) => s?.full_address || s?.address || s?.address_line1 || "";

/** ordered qty from different keys */
const getOrderedQty = (it: SchoolOrderItemLite) => num(it.total_order_qty ?? it.ordered_qty ?? 0);

const normalizeItemForView = (it: SupplierReceiptItem) => {
  const received_qty = it.received_qty ?? it.ordered_qty ?? it.qty ?? 0;
  const ordered_qty = it.ordered_qty ?? it.received_qty ?? it.qty ?? 0;

  // NEW backend uses qty/rate + discount_amount/net_amount
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

const pickSchoolNameFromReceipt = (r: SupplierReceipt) => {
  const anyR: any = r as any;
  return (
    anyR?.school_order?.school?.name ||
    anyR?.school?.name ||
    anyR?.school_name ||
    ""
  );
};


type UiItem = {
  book_id: number;
  title: string;
  meta: string;

  ordered_qty: number;
  already_received_qty: number;
  pending_qty: number;

  rec_qty: string; // receive now
  unit_price: string; // rate (optional for challan)

  disc_pct: string;
  disc_amt: string;

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

const preventWheelChange = (e: React.WheelEvent<HTMLInputElement>) => {
  (e.currentTarget as HTMLInputElement).blur();
};

const normalizeDocType = (r: SupplierReceipt): ReceiveDocType => {
  const t = String((r as any)?.receive_doc_type || "").toUpperCase();
  if (t === "INVOICE") return "INVOICE";
  if (t === "CHALLAN") return "CHALLAN";
  return r.invoice_no ? "INVOICE" : "CHALLAN";
};

const getDocNo = (r: SupplierReceipt) => (r as any)?.doc_no || r.invoice_no || "-";
const getDocDate = (r: SupplierReceipt) => (r as any)?.doc_date || r.invoice_date || null;

const todayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const canEditItems = (r?: SupplierReceipt | null) => {
  if (!r) return false;
  if (r.status !== "draft") return false;
  if ((r as any)?.posted_at) return false; // if backend includes posted_at in future
  return true;
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

  // filters
  const [filterPublisherId, setFilterPublisherId] = useState("");
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterDocNo, setFilterDocNo] = useState("");
  const [filterDocType, setFilterDocType] = useState<"" | ReceiveDocType>("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState(() => todayISO());
  const [filterTo, setFilterTo] = useState(() => todayISO());

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // preview before save
  const [previewOpen, setPreviewOpen] = useState(false);

  const [form, setForm] = useState(() => {
    const t = todayISO();
    return {
      school_id: "",
      school_order_id: "",
      supplier_id: "",

      receive_doc_type: "INVOICE" as ReceiveDocType,
      doc_no: "",
      doc_date: t,
      invoice_no: "",

      invoice_date: "",
      received_date: t,
      status: "draft" as "draft" | "received", // ✅ challan default draft feel
      remarks: "",

      bill_disc_pct: "",
      bill_disc_amt: "",

      shipping_charge: "",
      other_charge: "",
      round_off: "",
    };
  });

  const [items, setItems] = useState<UiItem[]>([]);

  // view modal
  const [viewOpen, setViewOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [viewRow, setViewRow] = useState<SupplierReceipt | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  // ✅ Edit/Convert modal (Challan -> Invoice with price update)
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertSaving, setConvertSaving] = useState(false);
  const [convert, setConvert] = useState(() => ({
    receive_doc_type: "INVOICE" as ReceiveDocType,
    doc_no: "",
    doc_date: todayISO(),
    received_date: todayISO(),
    remarks: "",
    academic_session: "",
  }));

  type ConvertLine = {
    book_id: number;
    title: string;
    qty: number; // fixed from receipt
    rate: string; // edit
    disc_mode: "NONE" | "PERCENT" | "AMOUNT";
    disc_pct: string;
    disc_amt: string;
  };
  const [convertLines, setConvertLines] = useState<ConvertLine[]>([]);

  /* ------------ Enter-to-next-cell (create table) ------------ */

  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cellKey = (rowIdx: number, field: "rec" | "mrp" | "pct" | "amt") => `${rowIdx}-${field}`;
  const focusCell = (rowIdx: number, field: "rec" | "mrp" | "pct" | "amt") => {
    const el = cellRefs.current[cellKey(rowIdx, field)];
    el?.focus();
    el?.select?.();
  };

  const onCellEnter = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    field: "rec" | "mrp" | "pct" | "amt"
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const order: Array<"rec" | "mrp" | "pct" | "amt"> = ["rec", "mrp", "pct", "amt"];
    const pos = order.indexOf(field);
    if (pos === -1) return;
    if (pos < order.length - 1) focusCell(rowIdx, order[pos + 1]);
    else focusCell(rowIdx + 1, "rec");
  };

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

      if (filterDocType) params.receive_doc_type = filterDocType;
      if (filterDocNo.trim()) params.doc_no = filterDocNo.trim();

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
          (res2.data as any)?.orders ||
          (res2.data as any)?.data ||
          (Array.isArray(res2.data) ? (res2.data as any) : []);
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
        const row: SchoolOrderLite = (res.data as any)?.order || (res.data as any)?.schoolOrder || (res.data as any);
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
        const meta = ""; // ✅ removed class/subject in create popup

        // for challan, price can be blank
        const up = it.unit_price != null ? num(it.unit_price) : 0;

        const dp = it.discount_pct != null ? num(it.discount_pct) : 0;
        const da = it.discount_amt != null ? num(it.discount_amt) : 0;

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
    }));

    setItems(mapped);
  };

  /* ------------ Create modal ------------ */

  const openCreate = () => {
    setError(null);
    setInfo(null);
    setCreateOpen(true);
    setPreviewOpen(false);

    const todayStr = todayISO();

    setForm({
      school_id: "",
      school_order_id: "",
      supplier_id: "",

      receive_doc_type: "INVOICE",
      doc_no: "",
      doc_date: todayStr,
      invoice_no: "",

      invoice_date: "",
      received_date: todayStr,
      status: "draft",
      remarks: "",

      bill_disc_pct: "",
      bill_disc_amt: "",

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

  /* ------------ Row discount syncing (Create) ------------ */

  const setRowRecQty = (idx: number, v: string) =>
    setItems((p) => p.map((r, i) => (i === idx ? { ...r, rec_qty: v } : r)));

  const setRowUnit = (idx: number, v: string) => {
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

  /* ------------ Totals (Create) ------------ */

  const totalsBase = useMemo(() => {
    let gross = 0;
    let itemDisc = 0;
    let net = 0;

    items.forEach((it) => {
      const qty = Math.max(0, Math.floor(num(it.rec_qty)));
      const up = Math.max(0, num(it.unit_price));
      const discAmt = Math.max(0, num(it.disc_amt));
      const row = computeRow(qty, up, discAmt);
      gross += row.grossLine;
      itemDisc += row.discLine;
      net += row.netLine;
    });

    return { gross, itemDisc, net };
  }, [items]);

  const syncBillDiscFromPct = (pctStr: string) => {
    const pct = clamp(num(pctStr), 0, 100);
    const net = totalsBase.net;
    const amt = (net * pct) / 100;
    setForm((p) => ({
      ...p,
      bill_disc_pct: pctStr,
      bill_disc_amt: pct > 0 ? String(Math.round(amt * 100) / 100) : "",
    }));
  };

  const syncBillDiscFromAmt = (amtStr: string) => {
    const net = totalsBase.net;
    const amt = clamp(num(amtStr), 0, Math.max(net, 0));
    const pct = net > 0 ? (amt / net) * 100 : 0;
    setForm((p) => ({
      ...p,
      bill_disc_amt: amtStr,
      bill_disc_pct: amt > 0 ? String(Math.round(pct * 100) / 100) : "",
    }));
  };

  const totals = useMemo(() => {
    const { gross, itemDisc, net } = totalsBase;

    const ship = Math.max(0, num(form.shipping_charge));
    const other = Math.max(0, num(form.other_charge));
    const ro = num(form.round_off);

    const bdAmt = clamp(num(form.bill_disc_amt), 0, net);
    const grand = net - bdAmt + ship + other + ro;

    return {
      gross,
      itemDisc,
      net,
      billDisc: bdAmt,
      ship,
      other,
      ro,
      grand,
    };
  }, [totalsBase, form.shipping_charge, form.other_charge, form.round_off, form.bill_disc_amt]);

  const isInvoice = form.receive_doc_type === "INVOICE";

  const anyMissingRateCreate = useMemo(() => {
    if (!isInvoice) {
      return items.some((x) => Math.floor(num(x.rec_qty)) > 0 && num(x.unit_price) <= 0);
    }
    return false;
  }, [items, isInvoice]);

  /* ------------ Submit (Create) ------------ */

  const buildPayload = () => {
    const supplier_id = Number(form.supplier_id);

    const cleanItems = items
      .map((it) => {
        const received_qty = Math.max(0, Math.floor(num(it.rec_qty)));
        const ordered_qty = Math.max(0, Math.floor(num(it.ordered_qty)));
        const unit_price = Math.max(0, num(it.unit_price)); // may be 0 for challan

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

          // backend uses qty/rate
          qty: received_qty,
          rate: unit_price,

          item_discount_type,
          item_discount_value,
        };
      })
      .filter((x) => x.book_id && x.received_qty > 0);

    const billPct = clamp(num(form.bill_disc_pct), 0, 100);
    const billAmt = clamp(num(form.bill_disc_amt), 0, totalsBase.net);

    let bill_discount_type: "NONE" | "PERCENT" | "AMOUNT" = "NONE";
    let bill_discount_value: number | null = null;

    if (billPct > 0) {
      bill_discount_type = "PERCENT";
      bill_discount_value = billPct;
    } else if (billAmt > 0) {
      bill_discount_type = "AMOUNT";
      bill_discount_value = billAmt;
    }

    const docType = form.receive_doc_type;
    const docNo = form.doc_no?.trim() || null;

    // ✅ NEW policy mapping:
    // - INVOICE => send received
    // - CHALLAN => if any rate missing/0 => draft (backend will also force)
    const anyZeroRate = cleanItems.some((x) => num(x.rate) <= 0);
    const status: "draft" | "received" = docType === "INVOICE" ? "received" : anyZeroRate ? "draft" : "received";

    const payload: any = {
      supplier_id,
      school_order_id: Number(form.school_order_id),

      receive_doc_type: docType,
      doc_no: docNo,
      doc_date: form.doc_date || undefined,

      // compat
      invoice_no: docType === "INVOICE" ? docNo : null,
      invoice_date: docType === "INVOICE" ? form.doc_date || undefined : form.invoice_date || undefined,

      received_date: form.received_date || undefined,

      status,
      remarks: form.remarks?.trim() || null,

      bill_discount_type,
      bill_discount_value,

      shipping_charge: form.shipping_charge ? num(form.shipping_charge) : 0,
      other_charge: form.other_charge ? num(form.other_charge) : 0,
      round_off: form.round_off ? num(form.round_off) : 0,

      items: cleanItems,
    };

    return { payload, cleanItems, status };
  };

  const validateBeforePreview = () => {
    const supplier_id = Number(form.supplier_id);
    if (!supplier_id) return "Supplier * required.";
    if (!form.school_id) return "School * required.";
    if (!form.school_order_id) return "Order * required.";

    if (form.receive_doc_type === "INVOICE" && !form.doc_no.trim()) return "Invoice No * required.";

    const anyTooMuch = items.some((x) => Math.floor(num(x.rec_qty)) > x.pending_qty);
    if (anyTooMuch) return "Fix Rec. qty (cannot exceed pending).";

    const { cleanItems } = buildPayload();
    if (!cleanItems.length) return "Enter Rec. qty for at least 1 book.";

    // ✅ INVOICE needs rates
    if (form.receive_doc_type === "INVOICE") {
      const anyMissingRate = cleanItems.some((x) => num(x.rate) <= 0);
      if (anyMissingRate) return "Invoice requires rate for all received items.";
    }

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

    const { payload, status } = buildPayload();

    setCreating(true);
    try {
      const res = await api.post("/api/supplier-receipts", payload);

      if (status === "draft" && payload.receive_doc_type === "CHALLAN") {
        setInfo("Challan saved as DRAFT (qty received). Later: Convert to INVOICE and add prices, then Mark Received.");
      } else {
        setInfo(res?.data?.message || "Receipt created.");
      }

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

  /* ------------ Convert Challan -> Invoice (Update price) ------------ */

  const openConvert = () => {
    if (!viewRow) return;

    const docType = normalizeDocType(viewRow);
    const docNo = String(getDocNo(viewRow) || "").trim();
    const docDate = (getDocDate(viewRow) as any) || "";
    const grn = viewRow.received_date || "";

    // We open always as INVOICE flow (even if already invoice, this is "Edit prices/doc in draft")
    setConvert({
      receive_doc_type: "INVOICE",
      doc_no: docType === "INVOICE" && docNo !== "-" ? docNo : "",
      doc_date: docDate ? String(docDate).slice(0, 10) : todayISO(),
      received_date: grn ? String(grn).slice(0, 10) : todayISO(),
      remarks: viewRow.remarks || "",
      academic_session: (viewRow as any)?.academic_session || "",
    });

    const vItems = (viewRow.items || []).map(normalizeItemForView);
    const mapped: ConvertLine[] = vItems.map((it) => {
      const title = it.book?.title || `Book #${it.book_id}`;
      const qty = Math.max(0, Math.floor(num(it.qty ?? it.received_qty ?? 0)));
      const rate = String(num(it.rate ?? it.unit_price ?? 0) || "");

      // derive discount mode from stored item_discount_type/value or from computed fields
      const t = String(it.item_discount_type || "").toUpperCase();
      const v = num(it.item_discount_value);

      let disc_mode: ConvertLine["disc_mode"] = "NONE";
      let disc_pct = "";
      let disc_amt = "";

      if (t === "PERCENT" && v > 0) {
        disc_mode = "PERCENT";
        disc_pct = String(v);
      } else if (t === "AMOUNT" && v > 0) {
        disc_mode = "AMOUNT";
        disc_amt = String(v);
      } else {
        // fallback from normalized fields
        const pct2 = num((it as any).discount_pct);
        const amt2 = num((it as any).discount_amt);
        if (amt2 > 0) {
          disc_mode = "AMOUNT";
          disc_amt = String(amt2);
        } else if (pct2 > 0) {
          disc_mode = "PERCENT";
          disc_pct = String(pct2);
        }
      }

      // sync other side
      const up = num(rate);
      if (disc_mode === "PERCENT" && disc_pct) {
        const pct = clamp(num(disc_pct), 0, 100);
        const amt = (up * pct) / 100;
        disc_amt = pct > 0 ? String(Math.round(amt * 100) / 100) : "";
      }
      if (disc_mode === "AMOUNT" && disc_amt) {
        const amt = clamp(num(disc_amt), 0, up);
        const pct = up > 0 ? (amt / up) * 100 : 0;
        disc_pct = amt > 0 ? String(Math.round(pct * 100) / 100) : "";
      }

      return { book_id: it.book_id, title, qty, rate, disc_mode, disc_pct, disc_amt };
    });

    setConvertLines(mapped);
    setConvertOpen(true);
  };

  const setConvertRate = (idx: number, v: string) => {
    setConvertLines((p) =>
      p.map((r, i) => {
        if (i !== idx) return r;
        const up = num(v);

        if (r.disc_mode === "PERCENT") {
          const pct = clamp(num(r.disc_pct), 0, 100);
          const amt = (up * pct) / 100;
          return { ...r, rate: v, disc_amt: pct > 0 ? String(Math.round(amt * 100) / 100) : "" };
        }
        if (r.disc_mode === "AMOUNT") {
          const amt = clamp(num(r.disc_amt), 0, up);
          const pct = up > 0 ? (amt / up) * 100 : 0;
          return { ...r, rate: v, disc_pct: amt > 0 ? String(Math.round(pct * 100) / 100) : "" };
        }
        return { ...r, rate: v };
      })
    );
  };

  const setConvertDiscPct = (idx: number, v: string) => {
    setConvertLines((p) =>
      p.map((r, i) => {
        if (i !== idx) return r;
        const up = num(r.rate);
        const pct = clamp(num(v), 0, 100);
        const amt = (up * pct) / 100;
        return {
          ...r,
          disc_mode: pct > 0 ? "PERCENT" : "NONE",
          disc_pct: v,
          disc_amt: pct > 0 ? String(Math.round(amt * 100) / 100) : "",
        };
      })
    );
  };

  const setConvertDiscAmt = (idx: number, v: string) => {
    setConvertLines((p) =>
      p.map((r, i) => {
        if (i !== idx) return r;
        const up = num(r.rate);
        const amt = clamp(num(v), 0, up);
        const pct = up > 0 ? (amt / up) * 100 : 0;
        return {
          ...r,
          disc_mode: amt > 0 ? "AMOUNT" : "NONE",
          disc_amt: v,
          disc_pct: amt > 0 ? String(Math.round(pct * 100) / 100) : "",
        };
      })
    );
  };

  const convertTotals = useMemo(() => {
    const lines = convertLines || [];
    let net = 0;
    let gross = 0;
    let disc = 0;

    lines.forEach((l) => {
      const q = Math.max(0, Math.floor(num(l.qty)));
      const up = Math.max(0, num(l.rate));
      const da = Math.max(0, num(l.disc_amt));
      const row = computeRow(q, up, da);
      gross += row.grossLine;
      disc += row.discLine;
      net += row.netLine;
    });

    return { gross, disc, net };
  }, [convertLines]);

  const saveConvertAndMaybeReceive = async (markReceived: boolean) => {
    if (!viewId || !viewRow) return;

    setError(null);

    const docNo = String(convert.doc_no || "").trim();
    if (!docNo) {
      setError("Invoice No is required.");
      return;
    }

    const anyMissingRate = convertLines.some((l) => num(l.rate) <= 0);
    if (anyMissingRate) {
      setError("All items must have rate > 0 to convert to invoice.");
      return;
    }

    const itemsPayload = convertLines
      .map((l) => {
        const rate = Math.max(0, num(l.rate));
        const qty = Math.max(0, Math.floor(num(l.qty)));

        let item_discount_type: "NONE" | "PERCENT" | "AMOUNT" = "NONE";
        let item_discount_value: number | null = null;

        if (l.disc_mode === "PERCENT" && num(l.disc_pct) > 0) {
          item_discount_type = "PERCENT";
          item_discount_value = num(l.disc_pct);
        } else if (l.disc_mode === "AMOUNT" && num(l.disc_amt) > 0) {
          item_discount_type = "AMOUNT";
          item_discount_value = num(l.disc_amt);
        }

        return {
          book_id: l.book_id,
          qty,
          rate,
          item_discount_type,
          item_discount_value,
        };
      })
      .filter((x) => x.book_id && x.qty > 0);

    setConvertSaving(true);
    try {
      // 1) patch receipt: doc + items (backend allows only when DRAFT and not posted)
      const patchPayload: any = {
        receive_doc_type: "INVOICE",
        doc_no: docNo,
        doc_date: convert.doc_date || null,
        received_date: convert.received_date || null,
        remarks: String(convert.remarks || "").trim() || null,
        academic_session: String(convert.academic_session || "").trim() || null,

        // keep legacy sync
        invoice_no: docNo,
        invoice_date: convert.doc_date || null,

        items: itemsPayload,
      };

      const res = await api.patch(`/api/supplier-receipts/${viewId}`, patchPayload);
      const updated = (res?.data as any)?.receipt as SupplierReceipt | undefined;

      // 2) optionally mark received (posts inventory + ledger)
      if (markReceived) {
        await api.patch(`/api/supplier-receipts/${viewId}/status`, { status: "received" });
      }

      // reload view (best)
      const res2 = await api.get<GetResponse>(`/api/supplier-receipts/${viewId}`);
      const row2 = (res2?.data as any)?.receipt as SupplierReceipt | undefined;
      if (row2?.items?.length) row2.items = row2.items.map(normalizeItemForView);

      setViewRow(row2 || updated || viewRow);
      setInfo(markReceived ? "Converted to INVOICE and marked RECEIVED." : "Converted to INVOICE (still draft).");
      setConvertOpen(false);
      await fetchReceipts();
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || e?.response?.data?.message || "Convert failed");
    } finally {
      setConvertSaving(false);
    }
  };

  /* ------------ Listing: client-side publisher filter ------------ */

  const visible = useMemo(() => {
    let list = receipts || [];

    if (filterDocType) list = list.filter((r) => normalizeDocType(r) === filterDocType);
    if (filterDocNo.trim()) {
      const q = filterDocNo.trim().toLowerCase();
      list = list.filter((r) => String(getDocNo(r) || "").toLowerCase().includes(q));
    }

    if (filterPublisherId) {
      const pub = publishers.find((p) => String(p.id) === String(filterPublisherId));
      const name = pub?.name || "";
      if (name) {
        list = list.filter((r) => (pickPublisherNameFromReceipt(r) || "").toLowerCase().includes(name.toLowerCase()));
      }
    }

    return list;
  }, [receipts, filterPublisherId, filterDocNo, filterDocType, publishers]);

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

    const gross = items2.reduce((sum, it) => sum + num(it.unit_price) * Math.max(0, num(it.received_qty)), 0);
    const net = itemsNetComputed;
    const itemDisc = Math.max(gross - net, 0);

    return {
      itemsNetComputed,
      gross,
      itemDisc,
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

  const BigPill = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200">
      <div className="text-[10px] text-slate-600">{label}</div>
      <div className="text-[14px] font-extrabold text-slate-900">{value}</div>
    </div>
  );

  const selectedSupplierName =
    suppliers.find((s) => String(s.id) === String(form.supplier_id))?.name ||
    (form.supplier_id ? `Supplier #${form.supplier_id}` : "");

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
              <div className="text-sm font-semibold truncate">Supplier Receipts (Invoice / Challan)</div>
              <div className="text-[11px] text-slate-500 truncate">
                Posting (Inventory IN + Ledger) happens only on <b>status = received</b>. Challan can be saved as{" "}
                <b>draft</b> with qty only.
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

        {/* Filters */}
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
            <MiniLabel>Doc Type</MiniLabel>
            <select
              value={filterDocType}
              onChange={(e) => setFilterDocType(e.target.value as any)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[140px]"
              title="Doc Type"
            >
              <option value="">All</option>
              <option value="CHALLAN">Challan</option>
              <option value="INVOICE">Invoice</option>
            </select>
          </div>

          <div>
            <MiniLabel>Doc No</MiniLabel>
            <input
              value={filterDocNo}
              onChange={(e) => setFilterDocNo(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[160px]"
              placeholder="Challan/Invoice no"
              title="Doc No"
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
                    <th className="border-b border-slate-200 px-3 py-2 text-left">School</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Doc</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">GRN</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Grand</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Status</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const t = normalizeDocType(r);
                    const docNo = getDocNo(r);
                    const invoiceRow = t === "INVOICE";
                    return (
                      <tr key={r.id} className={`hover:bg-slate-50 ${invoiceRow ? "bg-indigo-50/40" : ""}`}>
                        <td className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-900">
                          {r.receipt_no || `#${r.id}`}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {r.supplier?.name || `Supplier #${r.supplier_id}`}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {pickSchoolNameFromReceipt(r) || "-"}
                        </td>

                        <td className="border-b border-slate-200 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${docTypePill(t)}`}>{t}</span>
                            <span className="font-semibold text-slate-900">{docNo}</span>
                          </div>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {formatDate(r.received_date || r.invoice_date)}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">
                          ₹{fmtMoney(r.grand_total)}
                        </td>
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
                    );
                  })}
                </tbody>
              </table>

              <div className="px-4 py-2 text-[10px] text-slate-500 border-t">
                Note: Challan can be saved as <b>Draft</b> with qty only (rates can be blank/0). Later open draft →{" "}
                <b>Convert to Invoice</b> and fill prices → Mark <b>Received</b> (posts Inventory + Ledger).
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
                {/* HEADER */}
                <div className="border-b bg-slate-50">
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        Receipt{selectedSupplierName ? ` • ${selectedSupplierName}` : ""}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {isInvoice
                          ? "INVOICE: rate required, will be saved as RECEIVED"
                          : "CHALLAN: you can save qty only; if any rate missing, it will be saved as DRAFT"}
                      </div>
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

                  {/* Top form */}
                  <div className="px-3 pb-2">
                    <div
                      className={`grid grid-cols-12 gap-2 p-2 rounded-2xl border ${
                        isInvoice ? "bg-indigo-50/60 border-indigo-200" : "bg-amber-50/40 border-amber-200"
                      }`}
                    >
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
                            setForm((p) => ({ ...p, school_order_id: v }));
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
                          onChange={(e) => setForm((p) => ({ ...p, supplier_id: e.target.value }))}
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

                      {/* Doc Type */}
                      <div className="col-span-6 md:col-span-2">
                        <MiniLabel>Receiving As *</MiniLabel>
                        <select
                          value={form.receive_doc_type}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              receive_doc_type: e.target.value as ReceiveDocType,
                              doc_date: p.doc_date || todayISO(),
                            }))
                          }
                          className={`w-full border rounded-lg px-2 py-1.5 text-[12px] bg-white ${
                            isInvoice ? "border-indigo-300" : "border-amber-300"
                          }`}
                          title="Receiving As"
                        >
                          <option value="CHALLAN">Challan</option>
                          <option value="INVOICE">Invoice</option>
                        </select>
                      </div>

                      {/* Doc No */}
                      <div className="col-span-6 md:col-span-2">
                        <MiniLabel>{isInvoice ? "Invoice No *" : "Challan No"}</MiniLabel>
                        <input
                          value={form.doc_no}
                          onChange={(e) => setForm((p) => ({ ...p, doc_no: e.target.value }))}
                          className={`w-full border rounded-lg px-2 py-1.5 text-[12px] bg-white ${
                            isInvoice ? "border-indigo-300" : "border-amber-300"
                          }`}
                          placeholder={isInvoice ? "Invoice number" : "Challan number"}
                          title="Doc No"
                        />
                      </div>

                      {/* Doc Date */}
                      <div className="col-span-6 md:col-span-1">
                        <MiniLabel>Doc Date</MiniLabel>
                        <input
                          type="date"
                          value={form.doc_date}
                          onChange={(e) => setForm((p) => ({ ...p, doc_date: e.target.value }))}
                          className={`w-full border rounded-lg px-2 py-1.5 text-[12px] bg-white ${
                            isInvoice ? "border-indigo-300" : "border-amber-300"
                          }`}
                          title="Doc Date"
                        />
                      </div>

                      {/* GRN Date */}
                      <div className="col-span-6 md:col-span-1">
                        <MiniLabel>GRN *</MiniLabel>
                        <input
                          type="date"
                          value={form.received_date}
                          onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px] bg-white"
                          title="Received Date"
                        />
                      </div>
                    </div>

                    {/* Row-2 */}
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="min-w-[260px] w-[380px] md:w-[520px]">
                        <MiniLabel>Remarks</MiniLabel>
                        <input
                          value={form.remarks}
                          onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px] bg-white"
                          placeholder="optional"
                          title="Remarks"
                        />
                      </div>

                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <BigPill label="Gross" value={`₹${fmtMoney(totals.gross)}`} />
                        <BigPill label="Net" value={`₹${fmtMoney(totals.net)}`} />
                        <div className="px-4 py-2 rounded-xl bg-slate-900 text-white">
                          <div className="text-[10px] opacity-80 leading-none">Grand</div>
                          <div className="text-[14px] font-extrabold">₹{fmtMoney(totals.grand)}</div>
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

                    {/* challan warning */}
                    {!isInvoice && anyMissingRateCreate && (
                      <div className="mt-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        <b>Challan mode:</b> Some items have missing rate → this receipt will be saved as <b>DRAFT</b>.
                        Later open it and <b>Convert to Invoice</b> to update prices, then mark <b>Received</b>.
                      </div>
                    )}
                  </div>
                </div>

                {/* LISTING */}
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
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-24">
                              {isInvoice ? "Rate*" : "Rate"}
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-16">%Disc</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-24">Disc₹</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-28">Gross</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-28">Net</th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right w-28">Amount</th>
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
                            const missingRateInvoice = isInvoice && qty > 0 && up <= 0;

                            return (
                              <tr key={it.book_id} className="hover:bg-slate-50">
                                <td className="border-b border-slate-200 px-2 py-1.5">
                                  <div className="font-medium text-slate-900">{it.title}</div>
                                  <div className="text-[11px] text-slate-500 hidden md:block">{it.meta}</div>
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">{it.ordered_qty}</td>
                                <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">
                                  {it.pending_qty}
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                  <input
                                    ref={(el) => {
                                      cellRefs.current[cellKey(idx, "rec")] = el;
                                    }}
                                    type="number"
                                    min={0}
                                    value={it.rec_qty}
                                    onChange={(e) => setRowRecQty(idx, e.target.value)}
                                    onWheel={preventWheelChange}
                                    onKeyDown={(e) => onCellEnter(e, idx, "rec")}
                                    className={`w-24 border rounded-xl px-2 py-1.5 text-[12px] text-right bg-white ${
                                      tooMuch ? "border-rose-400 bg-rose-50" : "border-slate-300"
                                    }`}
                                    title="Received now"
                                  />
                                  {tooMuch ? (
                                    <div className="text-[10px] text-rose-700 mt-1">Max: {it.pending_qty}</div>
                                  ) : null}
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                  <input
                                    ref={(el) => {
                                      cellRefs.current[cellKey(idx, "mrp")] = el;
                                    }}
                                    type="number"
                                    min={0}
                                    value={it.unit_price}
                                    onChange={(e) => setRowUnit(idx, e.target.value)}
                                    onWheel={preventWheelChange}
                                    onKeyDown={(e) => onCellEnter(e, idx, "mrp")}
                                    className={`w-24 border rounded-xl px-2 py-1.5 text-[12px] text-right bg-white ${
                                      missingRateInvoice ? "border-rose-400 bg-rose-50" : "border-slate-300"
                                    }`}
                                    title={isInvoice ? "Rate (required)" : "Rate (optional for challan draft)"}
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                  <input
                                    ref={(el) => {
                                      cellRefs.current[cellKey(idx, "pct")] = el;
                                    }}
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={it.disc_pct}
                                    onChange={(e) => setRowDiscPct(idx, e.target.value)}
                                    onWheel={preventWheelChange}
                                    onKeyDown={(e) => onCellEnter(e, idx, "pct")}
                                    className={`w-16 border rounded-xl px-2 py-1.5 text-[12px] text-right bg-white ${
                                      it.disc_mode === "PERCENT" ? "border-indigo-300 bg-indigo-50" : "border-slate-300"
                                    }`}
                                    title="% discount (auto sync Disc₹)"
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                  <input
                                    ref={(el) => {
                                      cellRefs.current[cellKey(idx, "amt")] = el;
                                    }}
                                    type="number"
                                    min={0}
                                    value={it.disc_amt}
                                    onChange={(e) => setRowDiscAmt(idx, e.target.value)}
                                    onWheel={preventWheelChange}
                                    onKeyDown={(e) => onCellEnter(e, idx, "amt")}
                                    className={`w-24 border rounded-xl px-2 py-1.5 text-[12px] text-right bg-white ${
                                      it.disc_mode === "AMOUNT" ? "border-indigo-300 bg-indigo-50" : "border-slate-300"
                                    }`}
                                    title="Fixed discount per unit (auto sync %)"
                                  />
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">
                                  ₹{fmtMoney(row.grossLine)}
                                </td>
                                <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">
                                  ₹{fmtMoney(row.netLine)}
                                </td>
                                <td className="border-b border-slate-200 px-2 py-1.5 text-right font-extrabold">
                                  ₹{fmtMoney(row.netLine)}
                                </td>

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

                      <div className="px-3 py-2 text-[10px] text-slate-500 border-t">
                        Tip: Enter key will jump to next cell (Rec → Rate → %Disc → Disc₹ → next row).
                      </div>
                    </div>
                  )}
                </div>

                {/* BOTTOM BAR */}
                <div className="border-t bg-white">
                  <div className="px-4 py-2 bg-slate-50 flex flex-wrap items-end gap-2">
                    <div>
                      <MiniLabel>Bill Disc %</MiniLabel>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={form.bill_disc_pct}
                        onChange={(e) => syncBillDiscFromPct(e.target.value)}
                        onWheel={preventWheelChange}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] text-right w-[110px] bg-white"
                        placeholder="0"
                        title="Bill discount percent (auto sync ₹)"
                      />
                    </div>

                    <div>
                      <MiniLabel>Bill Disc ₹</MiniLabel>
                      <input
                        type="number"
                        min={0}
                        value={form.bill_disc_amt}
                        onChange={(e) => syncBillDiscFromAmt(e.target.value)}
                        onWheel={preventWheelChange}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] text-right w-[130px] bg-white"
                        placeholder="0"
                        title="Bill discount amount (auto sync %)"
                      />
                    </div>

                    <div>
                      <MiniLabel>Ship</MiniLabel>
                      <input
                        type="number"
                        min={0}
                        value={form.shipping_charge}
                        onChange={(e) => setForm((p) => ({ ...p, shipping_charge: e.target.value }))}
                        onWheel={preventWheelChange}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] text-right w-[110px] bg-white"
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
                        onWheel={preventWheelChange}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] text-right w-[110px] bg-white"
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
                        onWheel={preventWheelChange}
                        className="border border-slate-300 rounded-xl px-2 py-2 text-[12px] text-right w-[110px] bg-white"
                        placeholder="0"
                        title="Round off"
                      />
                    </div>

                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <BigPill label="Item Disc" value={`₹${fmtMoney(totals.itemDisc)}`} />
                      <BigPill label="Bill Disc" value={`₹${fmtMoney(totals.billDisc)}`} />
                      <div className="px-4 py-2 rounded-xl bg-slate-900 text-white">
                        <div className="text-[10px] opacity-80 leading-none">Grand</div>
                        <div className="text-[14px] font-extrabold">₹{fmtMoney(totals.grand)}</div>
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
                        title="Save"
                      >
                        {creating ? "Saving..." : isInvoice ? "Save (Received)" : anyMissingRateCreate ? "Save (Draft)" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Preview Modal */}
                {previewOpen && (
                  <div className="fixed inset-0 z-[60] bg-black/60">
                    <div className="h-full w-full p-2 sm:p-3">
                      <div className="mx-auto w-full max-w-[1180px] h-[96vh]">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden h-full flex flex-col">
                          <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-center justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">
                                Preview Receipt{selectedSupplierName ? ` • ${selectedSupplierName}` : ""}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-600">
                                <span className={`px-2 py-0.5 rounded-full text-[11px] ${docTypePill(form.receive_doc_type)}`}>
                                  {form.receive_doc_type}
                                </span>{" "}
                                <b className="ml-2">{form.doc_no || "-"}</b> • Doc Date: <b>{form.doc_date || "-"}</b> • GRN:{" "}
                                <b>{form.received_date || "-"}</b>
                                {form.remarks?.trim() ? (
                                  <>
                                    {" "}
                                    • Remarks: <b>{form.remarks.trim()}</b>
                                  </>
                                ) : null}
                              </div>

                              {!isInvoice && anyMissingRateCreate ? (
                                <div className="mt-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                  This Challan will be saved as <b>DRAFT</b> because some rates are missing/0.
                                </div>
                              ) : null}
                            </div>

                            <button
                              onClick={() => setPreviewOpen(false)}
                              className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                              title="Close preview"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex-1 min-h-0 p-3">
                            <div className="h-full border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
                              <div className="px-3 py-2 bg-slate-100 text-xs font-semibold">Lines</div>
                              <div className="flex-1 min-h-0 overflow-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead className="bg-white sticky top-0">
                                    <tr>
                                      <th className="border-b border-slate-200 px-3 py-2 text-left">Book</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Rec</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Rate</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Disc</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Gross</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Net</th>
                                      <th className="border-b border-slate-200 px-3 py-2 text-right">Amount</th>
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
                                            </td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right">{qty}</td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right">
                                              {up > 0 ? `₹${fmtMoney(up)}` : "-"}
                                            </td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right">{discText}</td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right">
                                              ₹{fmtMoney(row.grossLine)}
                                            </td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right">
                                              ₹{fmtMoney(row.netLine)}
                                            </td>
                                            <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">
                                              ₹{fmtMoney(row.netLine)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                          <div className="border-t bg-white px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2 justify-end">
                              <BigPill label="Gross" value={`₹${fmtMoney(totals.gross)}`} />
                              <BigPill label="ItemDisc" value={`₹${fmtMoney(totals.itemDisc)}`} />
                              <BigPill label="Net" value={`₹${fmtMoney(totals.net)}`} />
                              <BigPill label="BillDisc" value={`₹${fmtMoney(totals.billDisc)}`} />
                              <BigPill label="Ship" value={`₹${fmtMoney(totals.ship)}`} />
                              <BigPill label="Other" value={`₹${fmtMoney(totals.other)}`} />
                              <BigPill label="Round" value={`₹${fmtMoney(totals.ro)}`} />
                              <div className="px-4 py-2 rounded-xl bg-slate-900 text-white">
                                <div className="text-[10px] opacity-80 leading-none">Grand</div>
                                <div className="text-[14px] font-extrabold">₹{fmtMoney(totals.grand)}</div>
                              </div>

                              <div className="ml-2 flex items-center gap-2">
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
                        </div>

                        <div className="h-2" />
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

                      {viewRow ? (
                        <span className="inline-flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${docTypePill(normalizeDocType(viewRow))}`}>
                            {normalizeDocType(viewRow)}
                          </span>
                          <span className="font-semibold">{getDocNo(viewRow)}</span>
                        </span>
                      ) : null}

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
                    {viewRow && canEditItems(viewRow) ? (
                      <button
                        onClick={openConvert}
                        className="text-[12px] px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 flex items-center gap-2"
                        title="Convert Challan -> Invoice (Update Prices)"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        Convert to Invoice
                      </button>
                    ) : null}

                    {viewId ? (
                      <button
                        onClick={() => handleViewPdf(viewId)}
                        className="text-[12px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-2"
                        title="Open PDF"
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
                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${statusChip(viewRow.status)}`}>
                              {viewRow.status}
                            </span>
                          </div>
                          {viewRow.status === "draft" ? (
                            <div className="mt-2 text-[11px] text-amber-900">
                              Draft means not posted. Convert to invoice to add prices then mark received.
                            </div>
                          ) : null}
                        </div>

                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600 inline-flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5" /> Doc No
                          </div>
                          <div className="mt-1 text-sm font-semibold">{getDocNo(viewRow)}</div>
                        </div>

                        <div className="col-span-12 md:col-span-3 border border-slate-200 rounded-2xl p-3">
                          <div className="text-[11px] text-slate-600 inline-flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5" /> Doc / GRN
                          </div>
                          <div className="mt-1 text-[12px] text-slate-800">
                            <div>
                              <span className="text-slate-500">Doc:</span>{" "}
                              <span className="font-semibold">{formatDate(getDocDate(viewRow))}</span>
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

                      {viewRow?.remarks?.trim() ? (
                        <div className="mt-3 text-[12px] text-slate-700 border border-slate-200 rounded-2xl px-3 py-2 bg-white">
                          <span className="text-slate-500">Remarks:</span> <b>{viewRow.remarks.trim()}</b>
                        </div>
                      ) : null}

                      {/* View Lines */}
                      <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="px-3 py-2 bg-slate-100 flex flex-wrap items-center gap-2 justify-between">
                          <div className="text-xs font-semibold">Lines</div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="px-2 py-1 rounded-xl border border-slate-200 bg-white">
                              Sub: <b>₹{fmtMoney(viewTotals?.sub_total)}</b>
                            </span>
                            <span className="px-2 py-1 rounded-xl border border-slate-200 bg-white">
                              Bill Disc: <b>₹{fmtMoney(viewTotals?.bill_discount_amount)}</b>
                            </span>
                            <span className="px-2 py-1 rounded-xl border border-slate-200 bg-white">
                              Ship: <b>₹{fmtMoney(viewTotals?.shipping_charge)}</b>
                            </span>
                            <span className="px-2 py-1 rounded-xl border border-slate-200 bg-white">
                              Other: <b>₹{fmtMoney(viewTotals?.other_charge)}</b>
                            </span>
                            <span className="px-2 py-1 rounded-xl border border-slate-200 bg-white">
                              Round: <b>₹{fmtMoney(viewTotals?.round_off)}</b>
                            </span>
                            <span className="px-2 py-1 rounded-xl border border-slate-200 bg-slate-900 text-white">
                              Grand: <b>₹{fmtMoney(viewTotals?.grand_total ?? viewRow.grand_total)}</b>
                            </span>
                          </div>
                        </div>

                        <div className="max-h-[52vh] overflow-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead className="bg-white sticky top-0 z-10">
                              <tr>
                                <th className="border-b border-slate-200 px-3 py-2 text-left">Book</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-right w-[80px]">Qty</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-right w-[120px]">Rate</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-right w-[120px]">Disc</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-right w-[140px]">Net/Unit</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-right w-[150px]">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(viewTotals?.items || []).map((it) => {
                                const title = it.book?.title || `Book #${it.book_id}`;
                                const rec = Math.max(0, num(it.qty ?? it.received_qty));
                                const rate = Math.max(0, num(it.rate ?? it.unit_price));
                                const discAmt = Math.max(0, num(it.discount_amt));
                                const discPct = Math.max(0, num(it.discount_pct));
                                const netUnit = Math.max(0, num(it.net_unit_price) || (rate - discAmt));
                                const amount = Math.max(0, num(it.line_amount));

                                const discText =
                                  discAmt > 0 ? `₹${fmtMoney(discAmt)}` : discPct > 0 ? `${fmtMoney(discPct)}%` : "-";

                                return (
                                  <tr key={`${it.book_id}-${it.id || ""}`} className="hover:bg-slate-50">
                                    <td className="border-b border-slate-200 px-3 py-2">
                                      <div className="font-medium text-slate-900">{title}</div>
                                      <div className="text-[11px] text-slate-500">
                                        {[
                                          it.book?.class_name ? `C:${it.book.class_name}` : null,
                                          it.book?.subject ? `S:${it.book.subject}` : null,
                                          it.book?.code ? `Code:${it.book.code}` : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" • ")}
                                      </div>
                                    </td>
                                    <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">{rec}</td>
                                    <td className="border-b border-slate-200 px-3 py-2 text-right">
                                      {rate > 0 ? `₹${fmtMoney(rate)}` : "-"}
                                    </td>
                                    <td className="border-b border-slate-200 px-3 py-2 text-right">{discText}</td>
                                    <td className="border-b border-slate-200 px-3 py-2 text-right">₹{fmtMoney(netUnit)}</td>
                                    <td className="border-b border-slate-200 px-3 py-2 text-right font-extrabold">
                                      ₹{fmtMoney(amount)}
                                    </td>
                                  </tr>
                                );
                              })}
                              {!viewTotals?.items?.length ? (
                                <tr>
                                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                                    No line items found.
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Status buttons */}
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

          {/* ✅ Convert Modal */}
          {convertOpen && viewRow && (
            <div className="fixed inset-0 z-[70] bg-black/60">
              <div className="h-full w-full p-3 sm:p-4 flex items-center justify-center">
                <div className="w-full max-w-[980px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">Convert Challan → Invoice (Update Prices)</div>
                      <div className="text-[11px] text-slate-600 mt-1 truncate">
                        Receipt: <b>{viewRow.receipt_no || `#${viewRow.id}`}</b> • This will update items + totals, then you
                        can mark received.
                      </div>
                    </div>
                    <button
                      onClick={() => setConvertOpen(false)}
                      className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 md:col-span-4">
                        <MiniLabel>Doc Type</MiniLabel>
                        <select
                          value={convert.receive_doc_type}
                          onChange={(e) => setConvert((p) => ({ ...p, receive_doc_type: e.target.value as ReceiveDocType }))}
                          className="w-full border border-indigo-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                          disabled
                          title="Invoice"
                        >
                          <option value="INVOICE">Invoice</option>
                        </select>
                      </div>

                      <div className="col-span-12 md:col-span-8">
                        <MiniLabel>Invoice No *</MiniLabel>
                        <input
                          value={convert.doc_no}
                          onChange={(e) => setConvert((p) => ({ ...p, doc_no: e.target.value }))}
                          className="w-full border border-indigo-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                          placeholder="Invoice number"
                        />
                      </div>

                      <div className="col-span-12 md:col-span-4">
                        <MiniLabel>Invoice Date</MiniLabel>
                        <input
                          type="date"
                          value={convert.doc_date}
                          onChange={(e) => setConvert((p) => ({ ...p, doc_date: e.target.value }))}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                        />
                      </div>

                      <div className="col-span-12 md:col-span-4">
                        <MiniLabel>GRN Date</MiniLabel>
                        <input
                          type="date"
                          value={convert.received_date}
                          onChange={(e) => setConvert((p) => ({ ...p, received_date: e.target.value }))}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                        />
                      </div>

                      <div className="col-span-12 md:col-span-4">
                        <MiniLabel>Academic Session</MiniLabel>
                        <input
                          value={convert.academic_session}
                          onChange={(e) => setConvert((p) => ({ ...p, academic_session: e.target.value }))}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                          placeholder="optional"
                        />
                      </div>

                      <div className="col-span-12">
                        <MiniLabel>Remarks</MiniLabel>
                        <input
                          value={convert.remarks}
                          onChange={(e) => setConvert((p) => ({ ...p, remarks: e.target.value }))}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                          placeholder="optional"
                        />
                      </div>
                    </div>

                    <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-100 flex items-center justify-between">
                        <div className="text-xs font-semibold">Items (fill Rate)</div>
                        <div className="text-[11px] text-slate-700 flex items-center gap-2">
                          <span className="px-2 py-1 rounded-xl border border-slate-200 bg-white">
                            Gross: <b>₹{fmtMoney(convertTotals.gross)}</b>
                          </span>
                          <span className="px-2 py-1 rounded-xl border border-slate-200 bg-white">
                            Disc: <b>₹{fmtMoney(convertTotals.disc)}</b>
                          </span>
                          <span className="px-2 py-1 rounded-xl border border-slate-200 bg-slate-900 text-white">
                            Net: <b>₹{fmtMoney(convertTotals.net)}</b>
                          </span>
                        </div>
                      </div>

                      <div className="max-h-[46vh] overflow-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead className="bg-white sticky top-0 z-10">
                            <tr>
                              <th className="border-b border-slate-200 px-3 py-2 text-left">Book</th>
                              <th className="border-b border-slate-200 px-3 py-2 text-right w-[90px]">Qty</th>
                              <th className="border-b border-slate-200 px-3 py-2 text-right w-[140px]">Rate *</th>
                              <th className="border-b border-slate-200 px-3 py-2 text-right w-[110px]">%Disc</th>
                              <th className="border-b border-slate-200 px-3 py-2 text-right w-[140px]">Disc ₹</th>
                              <th className="border-b border-slate-200 px-3 py-2 text-right w-[160px]">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {convertLines.map((l, idx) => {
                              const q = Math.max(0, Math.floor(num(l.qty)));
                              const up = Math.max(0, num(l.rate));
                              const da = Math.max(0, num(l.disc_amt));
                              const row = computeRow(q, up, da);
                              const rateMissing = up <= 0;

                              return (
                                <tr key={`${l.book_id}-${idx}`} className="hover:bg-slate-50">
                                  <td className="border-b border-slate-200 px-3 py-2">
                                    <div className="font-medium text-slate-900">{l.title}</div>
                                  </td>
                                  <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">{q}</td>
                                  <td className="border-b border-slate-200 px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      value={l.rate}
                                      onChange={(e) => setConvertRate(idx, e.target.value)}
                                      onWheel={preventWheelChange}
                                      className={`w-[130px] border rounded-xl px-2 py-1.5 text-[12px] text-right bg-white ${
                                        rateMissing ? "border-rose-400 bg-rose-50" : "border-slate-300"
                                      }`}
                                      placeholder="0"
                                      title="Rate required"
                                    />
                                  </td>
                                  <td className="border-b border-slate-200 px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={l.disc_pct}
                                      onChange={(e) => setConvertDiscPct(idx, e.target.value)}
                                      onWheel={preventWheelChange}
                                      className={`w-[95px] border rounded-xl px-2 py-1.5 text-[12px] text-right bg-white ${
                                        l.disc_mode === "PERCENT" ? "border-indigo-300 bg-indigo-50" : "border-slate-300"
                                      }`}
                                      placeholder="0"
                                      title="% discount"
                                    />
                                  </td>
                                  <td className="border-b border-slate-200 px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      value={l.disc_amt}
                                      onChange={(e) => setConvertDiscAmt(idx, e.target.value)}
                                      onWheel={preventWheelChange}
                                      className={`w-[130px] border rounded-xl px-2 py-1.5 text-[12px] text-right bg-white ${
                                        l.disc_mode === "AMOUNT" ? "border-indigo-300 bg-indigo-50" : "border-slate-300"
                                      }`}
                                      placeholder="0"
                                      title="Discount amount per unit"
                                    />
                                  </td>
                                  <td className="border-b border-slate-200 px-3 py-2 text-right font-extrabold">
                                    ₹{fmtMoney(row.netLine)}
                                  </td>
                                </tr>
                              );
                            })}
                            {!convertLines.length ? (
                              <tr>
                                <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                                  No items.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        onClick={() => setConvertOpen(false)}
                        className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                      >
                        Cancel
                      </button>

                      <button
                        onClick={() => saveConvertAndMaybeReceive(false)}
                        disabled={convertSaving}
                        className="text-[12px] px-5 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 disabled:opacity-60 font-semibold inline-flex items-center gap-2"
                        title="Save invoice + prices (still draft)"
                      >
                        <Pencil className="w-4 h-4" />
                        {convertSaving ? "Saving..." : "Save Invoice"}
                      </button>

                      <button
                        onClick={() => saveConvertAndMaybeReceive(true)}
                        disabled={convertSaving}
                        className="text-[12px] px-5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 font-semibold inline-flex items-center gap-2"
                        title="Save invoice + prices and mark received (posts inventory & ledger)"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {convertSaving ? "Posting..." : "Save & Mark Received"}
                      </button>
                    </div>

                    <div className="mt-3 text-[11px] text-slate-500">
                      Note: This works only when receipt is <b>Draft</b> (not posted). After marking received, items cannot
                      be edited.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}