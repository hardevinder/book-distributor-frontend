// components/SchoolSalesPageClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  RefreshCcw,
  PlusCircle,
  Package,
  Eye,
  ChevronLeft,
  X,
  FileText,
  Ban,
  Mail,
  Send,
  RotateCcw,
  Save,
  Layers,
  Pencil,
  Check,
} from "lucide-react";

/* ============================================================
   Types (Aligned with your NEW controller)
   ============================================================ */

type School = {
  id: number;
  name: string;
  city?: string | null;
  email?: string | null;
  office_email?: string | null;
};

type SchoolSaleItem = {
  id: number;
  requirement_item_id?: number | null;
  product_id?: number | null;
  book_id?: number | null;

  title_snapshot?: string | null;
  class_name_snapshot?: string | null;
  publisher_snapshot?: string | null;

  // sometimes backend returns these directly
  class_name?: string | null;
  publisher?: string | null;
  title?: string | null;

  requested_qty?: number | string | null; // snapshot
  requested_unit_price?: number | string | null;
  amount?: number | string | null;

  issued_qty?: number | string | null;
  short_qty?: number | string | null;

  // optional nested shapes (in case backend returns joins)
  book?: any;
  product?: any;
};

type SchoolSale = {
  id: number;
  sale_no?: string | null;
  sale_date?: string | null;
  academic_session?: string | null;
  school_id: number;
  class_id?: number | null;

  invoice_group_by?: "NONE" | "CLASS" | "PUBLISHER" | null;
  status?: string | null;

  subtotal?: number | string | null;
  discount?: number | string | null;
  tax?: number | string | null;
  total_amount?: number | string | null;

  payment_mode?: string | null;
  paid_amount?: number | string | null;
  balance_amount?: number | string | null;

  po_no?: string | null;
  challan_no?: string | null;
  due_date?: string | null;
  notes?: string | null;

  createdAt?: string | null;
  updatedAt?: string | null;

  items?: SchoolSaleItem[];
};

type GetOneResponse = {
  sale: SchoolSale;
  school?: School | null;
  sold_by?: any;
};

type GroupingMode = "NONE" | "CLASS" | "PUBLISHER";

/* Preview payload (from previewFromRequirements controller) */
type PreviewItem = {
  requirement_item_id: number;
  book_id: number;

  // backend may send one of these
  title?: string;
  class_name?: string;
  publisher?: string;

  // backend may also send nested book / publisher
  book?: any;
  product?: any;
  publisher_name?: string;

  requested_qty: number;
  default_unit_price: number;
  unit_price: number;
  is_overridden: boolean;
  amount: number;

  // sometimes different keys
  sale_price?: number;
  requested_unit_price?: number;
  rate?: number;

  stock_available?: number;
  can_fulfill?: boolean;
  short_qty?: number;
};

type PreviewGroup = {
  group_key: string;
  invoice_group_by: GroupingMode;
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  items_count: number;
  items: PreviewItem[];
};

type PreviewResponse = {
  success: boolean;
  school?: { id: number; name: string };
  filters?: any;
  grand?: { subtotal: number; discount: number; tax: number; total_amount: number };
  previews: PreviewGroup[];
};

/* ============================================================
   Session Options
   ============================================================ */

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

/* ============================================================
   Helpers
   ============================================================ */

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

const openBlobInNewTab = (blob: Blob) => {
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
};

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v: any) => Math.round(num(v) * 100) / 100;

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusLabel = (s?: string | null) => {
  const v = String(s || "").toLowerCase();
  if (!v) return "-";
  if (v === "cancelled" || v === "canceled") return "Cancelled";
  if (v === "draft") return "Draft";
  if (v === "sent") return "Sent";
  if (v === "paid") return "Paid";
  if (v === "completed") return "Completed";
  return s || "-";
};

const statusChipClass = (s?: string | null) => {
  const v = String(s || "").toLowerCase();
  switch (v) {
    case "paid":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "sent":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "completed":
      return "bg-indigo-50 text-indigo-700 border border-indigo-200";
    case "cancelled":
    case "canceled":
      return "bg-red-50 text-red-700 border border-red-200";
    case "draft":
    default:
      return "bg-slate-50 text-slate-600 border border-slate-200";
  }
};

const normalizeSchools = (payload: any): School[] => {
  if (Array.isArray(payload)) return payload as School[];
  if (payload && Array.isArray(payload.data)) return payload.data as School[];
  return [];
};

// ✅ very small HTML escape (safe)
const escapeHtml = (s: string) =>
  String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

/* ---------- Robust pickers (FIX publisher/class/title not showing) ---------- */

const pickClassName = (it: any) =>
  String(
    it?.class_name ??
      it?.class ??
      it?.class_name_snapshot ??
      it?.book?.class_name ??
      it?.book?.class ??
      it?.book?.class_name_snapshot ??
      ""
  ).trim() || "-";

const pickPublisherName = (it: any) =>
  String(
    it?.publisher ??
      it?.publisher_name ??
      it?.publisher_snapshot ??
      it?.book?.publisher?.name ??
      it?.book?.publisher_name ??
      it?.book?.publisher_snapshot ??
      it?.publisherName ??
      ""
  ).trim() || "-";

const pickTitle = (it: any) =>
  String(it?.title ?? it?.title_snapshot ?? it?.book?.title ?? it?.product?.name ?? "").trim() ||
  `Book #${it?.book_id ?? "-"}`;

const pickUnitPrice = (it: any) => {
  const candidates = [
    it?.unit_price,
    it?.sale_price,
    it?.requested_unit_price,
    it?.rate,
    it?.requested_unit_price_snapshot,
    it?.default_unit_price,
  ];
  for (const c of candidates) {
    const n = num(c);
    if (n > 0) return n;
  }
  return 0;
};

/* ---------- SweetAlert helper (dynamic import) ---------- */

type SwalLike = any;

const getSwal = async (): Promise<SwalLike | null> => {
  try {
    const mod: any = await import("sweetalert2");
    return mod?.default || mod;
  } catch {
    return null;
  }
};

const sweetConfirm = async (opts: {
  title: string;
  html?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: "warning" | "question" | "info" | "success" | "error";
}) => {
  const Swal = await getSwal();
  if (!Swal) {
    const ok = window.confirm(`${opts.title}\n\n${String(opts.html || "").replace(/<[^>]+>/g, "")}`);
    return ok;
  }

  const res = await Swal.fire({
    title: opts.title,
    html: opts.html || "",
    icon: opts.icon || "question",
    showCancelButton: true,
    confirmButtonText: opts.confirmText || "Yes",
    cancelButtonText: opts.cancelText || "Cancel",
    reverseButtons: true,
    focusCancel: true,
    width: 560,
  });

  return !!res.isConfirmed;
};

const sweetToast = async (opts: { icon: "success" | "error" | "info" | "warning"; title: string }) => {
  const Swal = await getSwal();
  if (!Swal) return;
  Swal.fire({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 1800,
    timerProgressBar: true,
    icon: opts.icon,
    title: opts.title,
  });
};

/* ============================================================
   Component
   ============================================================ */

const SchoolSalesPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [schools, setSchools] = useState<School[]>([]);
  const [groupingOptions, setGroupingOptions] = useState<{ value: GroupingMode; label: string }[]>([
    { value: "NONE", label: "Single Invoice" },
    { value: "CLASS", label: "Class-wise Invoices" },
    { value: "PUBLISHER", label: "Publisher-wise Invoices" },
  ]);

  // listing
  const [rows, setRows] = useState<SchoolSale[]>([]);
  const [loading, setLoading] = useState(false);

  // messages
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // filters
  const [filterSession, setFilterSession] = useState("");
  const [filterSchoolId, setFilterSchoolId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // create form
  const [academicSession, setAcademicSession] = useState("2026-27");
  const [createSchoolId, setCreateSchoolId] = useState("");
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("NONE");

  // ✅ create-time invoice no (best for grouping NONE)
  const [createSaleNo, setCreateSaleNo] = useState<string>("");

  // header fields
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "CARD" | "CREDIT" | "MIXED">("CASH");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [tax, setTax] = useState<string>("");
  const [saleDate, setSaleDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [poNo, setPoNo] = useState<string>("");
  const [challanNo, setChallanNo] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // preview/edit modal state
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);

  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);

  /**
   * Overrides:
   *  - price_overrides: { "req_123": 49.5, "book_10": 55 }
   *  - qty_overrides:   { "req_123": 30 }
   */
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [defaultUnitPrice, setDefaultUnitPrice] = useState<string>("");

  // view sale modal
  const [viewOpen, setViewOpen] = useState(false);
  const [viewSale, setViewSale] = useState<SchoolSale | null>(null);
  const [viewSchool, setViewSchool] = useState<School | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // ✅ edit mode in view modal
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // editable draft
  const [editSaleNo, setEditSaleNo] = useState<string>("");
  const [editSaleDate, setEditSaleDate] = useState<string>("");
  const [editPaymentMode, setEditPaymentMode] = useState<string>("CASH");
  const [editPaidAmount, setEditPaidAmount] = useState<string>("");
  const [editDiscount, setEditDiscount] = useState<string>("");
  const [editTax, setEditTax] = useState<string>("");
  const [editPoNo, setEditPoNo] = useState<string>("");
  const [editChallanNo, setEditChallanNo] = useState<string>("");
  const [editDueDate, setEditDueDate] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");

  // items override on edit (by item id)
  const [editItemQty, setEditItemQty] = useState<Record<string, number>>({});
  const [editItemRate, setEditItemRate] = useState<Record<string, number>>({});

  // email modal
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSaleId, setEmailSaleId] = useState<number | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtml, setEmailHtml] = useState("");

  /* ============================================================
     Fetching
     ============================================================ */

  const fetchSchools = async () => {
    try {
      const res = await api.get("/api/schools");
      setSchools(normalizeSchools(res.data));
    } catch (e) {
      console.error("schools:", e);
    }
  };

  const fetchGroupingOptions = async () => {
    try {
      const res = await api.get("/api/school-sales/grouping-options");
      const arr = Array.isArray(res?.data?.options) ? res.data.options : Array.isArray(res?.data) ? res.data : null;

      if (arr && arr.length) {
        const normalized = arr
          .map((x: any) => ({
            value: String(x.value || x.mode || x).toUpperCase() as GroupingMode,
            label: String(x.label || x.name || x.value || x.mode || x),
          }))
          .filter((x: any) => x.value === "NONE" || x.value === "CLASS" || x.value === "PUBLISHER");
        if (normalized.length) setGroupingOptions(normalized);
      }
    } catch {
      // ignore
    }
  };

  const fetchSales = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/school-sales");
      const payload = res.data;
      const list: SchoolSale[] = Array.isArray(payload?.rows)
        ? payload.rows
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];
      setRows(list || []);
      return list || [];
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load sales.");
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
    fetchGroupingOptions();
    fetchSales();
  }, []);

  /* ============================================================
     Derived
     ============================================================ */

  const schoolNameById = (id: any) => {
    const s = schools.find((x) => String(x.id) === String(id));
    return s?.name || `School #${id}`;
  };

  const visibleRows = useMemo(() => {
    return (rows || []).filter((r) => {
      let ok = true;
      if (filterSession) ok = ok && (r.academic_session || "") === filterSession;
      if (filterSchoolId) ok = ok && String(r.school_id) === filterSchoolId;
      if (filterStatus) ok = ok && String(r.status || "").toLowerCase() === String(filterStatus || "").toLowerCase();
      return ok;
    });
  }, [rows, filterSession, filterSchoolId, filterStatus]);

  const visibleSorted = useMemo(() => {
    const toTime = (i: SchoolSale) => {
      const s = i.sale_date || i.createdAt || "";
      const t = s ? new Date(s).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    return [...visibleRows].sort((a, b) => toTime(b) - toTime(a));
  }, [visibleRows]);

  const totals = useMemo(() => {
    let amt = 0;
    visibleSorted.forEach((r) => {
      amt += num(r.total_amount);
    });
    return { amt };
  }, [visibleSorted]);

  // preview computed totals with overrides (client-side) ✅ (don’t trust backend totals)
  const previewComputed = useMemo(() => {
    if (!previewData?.previews?.length) return null;

    const calcGroup = (g: PreviewGroup) => {
      let subtotal = 0;
      let itemsCount = 0;

      for (const it of g.items || []) {
        const reqKey = `req_${(it as any).requirement_item_id}`;
        const bookKey = `book_${(it as any).book_id}`;

        const qty = qtyOverrides[reqKey] != null ? num(qtyOverrides[reqKey]) : num((it as any).requested_qty);
        const rate =
          priceOverrides[reqKey] != null
            ? num(priceOverrides[reqKey])
            : priceOverrides[bookKey] != null
              ? num(priceOverrides[bookKey])
              : num(defaultUnitPrice) > 0
                ? num(defaultUnitPrice)
                : pickUnitPrice(it);

        if (qty > 0) itemsCount++;
        subtotal += qty * rate;
      }

      subtotal = round2(subtotal);
      const discountN = round2(g.discount);
      const taxN = round2(g.tax);
      const total = round2(Math.max(0, subtotal - discountN + taxN));

      return { subtotal, total, itemsCount };
    };

    const groups = previewData.previews.map((g) => ({ g, ...calcGroup(g) }));
    const grandSubtotal = round2(groups.reduce((s, x) => s + x.subtotal, 0));
    const grandDiscount = round2(
      previewData.grand?.discount ?? previewData.previews.reduce((s, g) => s + num(g.discount), 0)
    );
    const grandTax = round2(previewData.grand?.tax ?? previewData.previews.reduce((s, g) => s + num(g.tax), 0));
    const grandTotal = round2(groups.reduce((s, x) => s + x.total, 0));

    return { groups, grandSubtotal, grandDiscount, grandTax, grandTotal };
  }, [previewData, priceOverrides, qtyOverrides, defaultUnitPrice]);

  // ✅ compute view edit totals (client side)
  const viewComputed = useMemo(() => {
    if (!viewSale) return null;
    const items = Array.isArray(viewSale.items) ? viewSale.items : [];
    let subtotal = 0;
    for (const it of items) {
      const idKey = String(it.id);
      const qty = editItemQty[idKey] != null ? num(editItemQty[idKey]) : num(it.requested_qty);
      const rate = editItemRate[idKey] != null ? num(editItemRate[idKey]) : num(it.requested_unit_price);
      subtotal += qty * rate;
    }
    subtotal = round2(subtotal);
    const disc = round2(editMode ? editDiscount : viewSale.discount);
    const tx = round2(editMode ? editTax : viewSale.tax);
    const total = round2(Math.max(0, subtotal - disc + tx));
    return { subtotal, disc, tx, total };
  }, [viewSale, editItemQty, editItemRate, editMode, editDiscount, editTax]);

  /* ============================================================
     Actions
     ============================================================ */

  const openView = async (row: SchoolSale) => {
    setError(null);
    setInfo(null);
    setEditMode(false);
    setEditItemQty({});
    setEditItemRate({});
    try {
      const r = await api.get(`/api/school-sales/${row.id}`);
      const data: GetOneResponse = r?.data;
      const sale = data?.sale || (r?.data?.sale ?? r?.data ?? row);
      setViewSale(sale);
      setViewSchool((data?.school as any) || null);

      // seed editable fields
      setEditSaleNo(String(sale?.sale_no || ""));
      setEditSaleDate(String((sale?.sale_date || sale?.createdAt || "")).slice(0, 10));
      setEditPaymentMode(String(sale?.payment_mode || "CASH"));
      setEditPaidAmount(String(sale?.paid_amount ?? ""));
      setEditDiscount(String(sale?.discount ?? ""));
      setEditTax(String(sale?.tax ?? ""));
      setEditPoNo(String(sale?.po_no ?? ""));
      setEditChallanNo(String(sale?.challan_no ?? ""));
      setEditDueDate(String((sale?.due_date || "")).slice(0, 10));
      setEditNotes(String(sale?.notes ?? ""));
    } catch (e) {
      console.error(e);
      setViewSale(row);
      setViewSchool(null);
    } finally {
      setViewOpen(true);
    }
  };

  const cancelSale = async (row: SchoolSale) => {
    if (!row?.id) return;

    const label = row.sale_no ? row.sale_no : `#${row.id}`;

    const ok = await sweetConfirm({
      title: "Cancel this sale invoice?",
      icon: "warning",
      html: `<div style="text-align:left;font-size:13px;">
        <div><b>Invoice:</b> ${escapeHtml(label)}</div>
        <div style="margin-top:8px;color:#64748b;">This will cancel and (if deducted) revert stock.</div>
      </div>`,
      confirmText: "Cancel",
      cancelText: "Close",
    });
    if (!ok) return;

    setCancellingId(row.id);
    setError(null);
    setInfo(null);

    try {
      const res = await api.post(`/api/school-sales/${row.id}/cancel`);
      setInfo(res?.data?.message || "Cancelled.");
      await sweetToast({ icon: "success", title: "Cancelled" });
      await fetchSales();

      setViewSale((prev) => (prev?.id === row.id ? { ...prev, status: "CANCELLED" } : prev));
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message || "Cancel failed.";
      setError(msg);
      await sweetToast({ icon: "error", title: msg });
    } finally {
      setCancellingId(null);
    }
  };

  const resetAllOverrides = async () => {
    const ok = await sweetConfirm({
      title: "Reset all edits?",
      icon: "warning",
      html: `<div style="text-align:left;font-size:13px;color:#64748b;">
        This will reset edited <b>Sale Price</b> and <b>Qty</b> back to defaults.
      </div>`,
      confirmText: "Reset",
      cancelText: "Keep",
    });
    if (!ok) return;
    setPriceOverrides({});
    setQtyOverrides({});
    setDefaultUnitPrice("");
    await sweetToast({ icon: "success", title: "Reset done" });
  };

  const previewCreate = async () => {
    setError(null);
    setInfo(null);

    const sess = academicSession.trim();
    const sid = String(createSchoolId || "").trim();

    if (!sess) return setError("Select session.");
    if (!sid) return setError("Select school.");

    const ok = await sweetConfirm({
      title: "Preview & Edit (Sale Price/Qty) before creating?",
      icon: "info",
      html: `<div style="text-align:left;font-size:13px;">
        <div><b>Session:</b> ${escapeHtml(sess)}</div>
        <div><b>School:</b> ${escapeHtml(schoolNameById(sid))}</div>
        <div><b>Grouping:</b> ${escapeHtml(groupingMode)}</div>
        <div style="margin-top:8px;color:#64748b;font-size:12px;">
          This will NOT create invoices. You can edit Sale Price/Qty and then click Create.
        </div>
      </div>`,
      confirmText: "Preview",
      cancelText: "Cancel",
    });
    if (!ok) return;

    setPreviewing(true);
    try {
      const res = await api.post("/api/school-sales/from-requirements/preview", {
        academic_session: sess,
        school_id: Number(sid),
        invoice_group_by: groupingMode,
        discount: round2(discount),
        tax: round2(tax),
        default_unit_price: round2(defaultUnitPrice),
        price_overrides: priceOverrides,
        qty_overrides: qtyOverrides,
      });

      const data: PreviewResponse = res?.data || null;
      if (!data?.previews?.length) {
        const msg = (res?.data?.message as any) || "No preview groups returned.";
        setError(msg);
        await sweetToast({ icon: "error", title: msg });
        return;
      }

      setPreviewData(data);
      setActiveGroupIdx(0);
      setPreviewOpen(true);

      setInfo("Preview ready. Edit Sale Price/Qty then Create.");
      await sweetToast({ icon: "success", title: "Preview ready" });
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message || "Preview failed.";
      setError(msg);
      await sweetToast({ icon: "error", title: msg });
    } finally {
      setPreviewing(false);
    }
  };

  const createFromRequirements = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setError(null);
    setInfo(null);

    const sess = academicSession.trim();
    const sid = String(createSchoolId || "").trim();

    if (!sess) return setError("Select session.");
    if (!sid) return setError("Select school.");

    const ok = await sweetConfirm({
      title: "Create invoice(s) now?",
      icon: "question",
      html: `<div style="text-align:left;font-size:13px;">
        <div><b>Session:</b> ${escapeHtml(sess)}</div>
        <div><b>School:</b> ${escapeHtml(schoolNameById(sid))}</div>
        <div><b>Grouping:</b> ${escapeHtml(groupingMode)}</div>
        <div style="margin-top:10px;color:#64748b;font-size:12px;">
          Sale Price edits will be applied via <b>price_overrides</b>.
          <br/>
          Qty edits are sent via <b>qty_overrides</b>.
        </div>
      </div>`,
      confirmText: "Create",
      cancelText: "Cancel",
    });
    if (!ok) return;

    setCreating(true);
    try {
      const res = await api.post("/api/school-sales/from-requirements", {
        academic_session: sess,
        school_id: Number(sid),
        invoice_group_by: groupingMode,

        // ✅ create-time invoice no (best for NONE)
        sale_no: groupingMode === "NONE" ? (createSaleNo || null) : null,

        // header fields
        payment_mode: paymentMode,
        paid_amount: round2(paidAmount),
        discount: round2(discount),
        tax: round2(tax),
        sale_date: saleDate,
        po_no: poNo || null,
        challan_no: challanNo || null,
        due_date: dueDate || null,
        notes: notes || null,

        default_unit_price: round2(defaultUnitPrice),
        price_overrides: priceOverrides,
        qty_overrides: qtyOverrides,
      });

      setInfo(res?.data?.message || "Created.");
      await sweetToast({ icon: "success", title: "Invoice(s) created" });

      setPreviewOpen(false);
      setPreviewData(null);

      // reset small fields
      setCreateSaleNo("");

      await fetchSales();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message || "Create failed.";
      setError(msg);
      await sweetToast({ icon: "error", title: msg });
    } finally {
      setCreating(false);
    }
  };

  // ✅ PDF via blob (no unauthorized)
  const openPdf = async (saleId: number) => {
    if (!saleId) return;

    try {
      const res = await api.get(`/api/school-sales/${saleId}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      openBlobInNewTab(blob);
      // downloadBlob(blob, `sale-invoice-${saleId}.pdf`);
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.message || "Failed to open PDF (Unauthorized?)";
      setError(msg);
      await sweetToast({ icon: "error", title: msg });
    }
  };

  const openEmail = async (saleId: number) => {
    setEmailSaleId(saleId);
    setEmailBusy(true);
    setEmailOpen(true);
    setEmailTo("");
    setEmailCc("");
    setEmailSubject("");
    setEmailHtml("");

    try {
      const res = await api.get(`/api/school-sales/${saleId}/email-preview`);
      const data = res?.data || {};
      setEmailTo(String(data?.to || ""));
      setEmailCc(String(data?.cc || ""));
      setEmailSubject(String(data?.subject || ""));
      setEmailHtml(String(data?.html || ""));
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.message || "Failed to load email preview.";
      setError(msg);
      await sweetToast({ icon: "error", title: msg });
    } finally {
      setEmailBusy(false);
    }
  };

  const sendEmail = async () => {
    if (!emailSaleId) return;
    setEmailBusy(true);
    try {
      const res = await api.post(`/api/school-sales/${emailSaleId}/send-email`, {
        to: emailTo,
        cc: emailCc,
        subject: emailSubject,
        html: emailHtml,
      });
      await sweetToast({ icon: "success", title: res?.data?.message || "Email sent" });
      setEmailOpen(false);
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.message || "Failed to send email.";
      setError(msg);
      await sweetToast({ icon: "error", title: msg });
    } finally {
      setEmailBusy(false);
    }
  };

  /* ============================================================
     Preview Editing Helpers
     ============================================================ */

  const setRateForItem = (it: PreviewItem, rate: number) => {
    const key = `req_${it.requirement_item_id}`;
    const cleaned = round2(rate);
    setPriceOverrides((p) => {
      const next = { ...p };
      if (cleaned <= 0) delete next[key];
      else next[key] = cleaned;
      return next;
    });
  };

  const resetRateForItem = (it: PreviewItem) => {
    const key = `req_${it.requirement_item_id}`;
    setPriceOverrides((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  };

  const setQtyForItem = (it: PreviewItem, qty: number) => {
    const key = `req_${it.requirement_item_id}`;
    const cleaned = Math.max(0, Math.floor(num(qty)));
    setQtyOverrides((q) => {
      const next = { ...q };
      if (cleaned <= 0) delete next[key];
      else next[key] = cleaned;
      return next;
    });
  };

  const resetQtyForItem = (it: PreviewItem) => {
    const key = `req_${it.requirement_item_id}`;
    setQtyOverrides((q) => {
      const next = { ...q };
      delete next[key];
      return next;
    });
  };

  const getEffectiveQty = (it: PreviewItem) => {
    const key = `req_${it.requirement_item_id}`;
    return qtyOverrides[key] != null ? num(qtyOverrides[key]) : num(it.requested_qty);
  };

  // ✅ FIX: always fall back to available unit price keys
  const getEffectiveRate = (it: PreviewItem | any) => {
    const reqKey = `req_${it.requirement_item_id}`;
    const bookKey = `book_${it.book_id}`;

    if (priceOverrides[reqKey] != null) return num(priceOverrides[reqKey]);
    if (priceOverrides[bookKey] != null) return num(priceOverrides[bookKey]);
    if (num(defaultUnitPrice) > 0) return num(defaultUnitPrice);

    return pickUnitPrice(it);
  };

  const getIsRateEdited = (it: PreviewItem | any) => {
    const reqKey = `req_${it.requirement_item_id}`;
    if (priceOverrides[reqKey] == null) return false;
    return num(priceOverrides[reqKey]) !== pickUnitPrice(it);
  };

  const getIsQtyEdited = (it: PreviewItem) => {
    const reqKey = `req_${it.requirement_item_id}`;
    return qtyOverrides[reqKey] != null && num(qtyOverrides[reqKey]) !== num(it.requested_qty);
  };

  /* ============================================================
     View Edit Helpers
     ============================================================ */

  const startEdit = () => {
    if (!viewSale) return;
    setEditMode(true);

    setEditSaleNo(String(viewSale.sale_no || ""));
    setEditSaleDate(String((viewSale.sale_date || viewSale.createdAt || "")).slice(0, 10));
    setEditPaymentMode(String(viewSale.payment_mode || "CASH"));
    setEditPaidAmount(String(viewSale.paid_amount ?? ""));
    setEditDiscount(String(viewSale.discount ?? ""));
    setEditTax(String(viewSale.tax ?? ""));
    setEditPoNo(String(viewSale.po_no ?? ""));
    setEditChallanNo(String(viewSale.challan_no ?? ""));
    setEditDueDate(String((viewSale.due_date || "")).slice(0, 10));
    setEditNotes(String(viewSale.notes ?? ""));

    // seed item overrides with current values (optional)
    const items = Array.isArray(viewSale.items) ? viewSale.items : [];
    const q: Record<string, number> = {};
    const r: Record<string, number> = {};
    items.forEach((it) => {
      q[String(it.id)] = num(it.requested_qty);
      r[String(it.id)] = num(it.requested_unit_price);
    });
    setEditItemQty(q);
    setEditItemRate(r);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditItemQty({});
    setEditItemRate({});
  };

  // ✅ Save edits (needs backend PUT endpoint)
  const saveEdit = async () => {
    if (!viewSale?.id) return;
    const ok = await sweetConfirm({
      title: "Save changes to this invoice?",
      icon: "question",
      html: `<div style="text-align:left;font-size:13px;color:#64748b;">
        Invoice <b>${escapeHtml(viewSale.sale_no || `#${viewSale.id}`)}</b> will be updated (sale no, prices, qty, totals).
      </div>`,
      confirmText: "Save",
      cancelText: "Cancel",
    });
    if (!ok) return;

    setSavingEdit(true);
    setError(null);

    try {
      const items = Array.isArray(viewSale.items) ? viewSale.items : [];
      const payload = {
        sale_no: editSaleNo?.trim() ? editSaleNo.trim() : null,
        sale_date: editSaleDate || null,
        payment_mode: editPaymentMode || null,
        paid_amount: round2(editPaidAmount),
        discount: round2(editDiscount),
        tax: round2(editTax),
        po_no: editPoNo || null,
        challan_no: editChallanNo || null,
        due_date: editDueDate || null,
        notes: editNotes || null,
        items: items.map((it) => {
          const idKey = String(it.id);
          return {
            id: it.id,
            requested_qty: Math.max(0, Math.floor(num(editItemQty[idKey]))),
            requested_unit_price: round2(editItemRate[idKey]),
          };
        }),
      };

      const res = await api.put(`/api/school-sales/${viewSale.id}`, payload);

      // backend should return updated sale
      const updated: SchoolSale = res?.data?.sale || res?.data || null;

      if (updated?.id) {
        setViewSale(updated);
      } else {
        // fallback: re-fetch
        const rr = await api.get(`/api/school-sales/${viewSale.id}`);
        const data: GetOneResponse = rr?.data;
        setViewSale(data?.sale || (rr?.data?.sale ?? rr?.data ?? viewSale));
      }

      await sweetToast({ icon: "success", title: res?.data?.message || "Updated" });
      setEditMode(false);
      await fetchSales();
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.message || "Failed to update invoice. (Need PUT /api/school-sales/:id)";
      setError(msg);
      await sweetToast({ icon: "error", title: msg });
    } finally {
      setSavingEdit(false);
    }
  };

  /* ============================================================
     UI
     ============================================================ */

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 scrollbar-sleek">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-2 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-[11px]">
              <ChevronLeft className="w-4 h-4" />
              Back
            </Link>

            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate">School Sales → Sale Invoices</div>
                <div className="text-[10.5px] text-slate-500 -mt-0.5 truncate">
                  Defaults from Requirements + Editable Sale Price/Qty + Editable Invoice No
                </div>
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

        {/* Toolbar */}
        <div className="px-2 pb-2">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <select
              value={filterSession}
              onChange={(e) => setFilterSession(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[120px]"
              title="Session"
            >
              <option value="">Session</option>
              {SESSION_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={filterSchoolId}
              onChange={(e) => setFilterSchoolId(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[260px]"
              title="School"
            >
              <option value="">School</option>
              {schools.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                  {s.city ? ` (${s.city})` : ""}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[140px]"
              title="Status"
            >
              <option value="">Status</option>
              <option value="completed">Completed</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <button
              type="button"
              onClick={fetchSales}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold
                         text-emerald-800 border border-emerald-200
                         bg-gradient-to-r from-emerald-50 to-cyan-50
                         hover:from-emerald-100 hover:to-cyan-100
                         shadow-sm hover:shadow
                         focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2
                         disabled:opacity-60 disabled:shadow-none"
              title="Refresh"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-600">
              <span title="Invoices">{visibleSorted.length}</span>
              <span title="Amount">₹:{Math.round(totals.amt)}</span>
            </div>
          </div>

          {/* Create + Header fields */}
          <div className="mt-2 grid grid-cols-1 lg:grid-cols-12 gap-2">
            <form onSubmit={(e) => e.preventDefault()} className="lg:col-span-12 flex flex-wrap items-center gap-1.5 text-[11px]">
              <select
                value={academicSession}
                onChange={(e) => setAcademicSession(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[120px]"
                title="Session"
              >
                {SESSION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                value={createSchoolId}
                onChange={(e) => setCreateSchoolId(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[300px]"
                title="School"
              >
                <option value="">Select School (Create)</option>
                {schools.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                    {s.city ? ` (${s.city})` : ""}
                  </option>
                ))}
              </select>

              <select
                value={groupingMode}
                onChange={(e) => setGroupingMode(e.target.value as GroupingMode)}
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[210px]"
                title="Grouping"
              >
                {groupingOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              {/* ✅ Create-time Invoice No (works best for Single Invoice) */}
              <input
                value={createSaleNo}
                onChange={(e) => setCreateSaleNo(e.target.value)}
                placeholder={groupingMode === "NONE" ? "Invoice No (optional)" : "Invoice No (auto for grouped)"}
                disabled={groupingMode !== "NONE"}
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[190px] disabled:bg-slate-100 disabled:text-slate-500"
                title="Invoice Number"
              />

              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[120px]"
                title="Payment Mode"
              >
                <option value="CASH">CASH</option>
                <option value="UPI">UPI</option>
                <option value="CARD">CARD</option>
                <option value="CREDIT">CREDIT</option>
                <option value="MIXED">MIXED</option>
              </select>

              <input
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                type="date"
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[140px]"
                title="Sale Date"
              />

              <input
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="Paid"
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[90px]"
                title="Paid Amount"
              />

              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="Discount"
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[90px]"
                title="Discount"
              />

              <input
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                placeholder="Tax"
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[90px]"
                title="Tax"
              />

              <input
                value={defaultUnitPrice}
                onChange={(e) => setDefaultUnitPrice(e.target.value)}
                placeholder="Default Sale Price"
                className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[130px]"
                title="Optional Global Default Sale Price"
              />

              <button
                type="button"
                onClick={previewCreate}
                disabled={previewing}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold
                         text-slate-900 border border-slate-200 bg-white hover:bg-slate-100
                         focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2
                         disabled:opacity-60"
                title="Preview & Edit"
              >
                <Eye className={`w-3.5 h-3.5 ${previewing ? "animate-pulse" : ""}`} />
                {previewing ? "..." : "Preview & Edit"}
              </button>

              <button
                type="button"
                onClick={() => createFromRequirements()}
                disabled={creating}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold text-white
                         bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600
                         hover:brightness-110 active:brightness-95
                         shadow-sm hover:shadow
                         focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2
                         disabled:opacity-60 disabled:shadow-none"
                title="Create"
              >
                {creating ? (
                  <>
                    <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" />
                    Create
                  </>
                )}
              </button>
            </form>

            <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-2">
              <div className="md:col-span-3">
                <input
                  value={poNo}
                  onChange={(e) => setPoNo(e.target.value)}
                  placeholder="PO No"
                  className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                />
              </div>
              <div className="md:col-span-3">
                <input
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.target.value)}
                  placeholder="Challan No"
                  className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                />
              </div>
              <div className="md:col-span-3">
                <input
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  type="date"
                  className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                  title="Due Date"
                />
              </div>
              <div className="md:col-span-3">
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes"
                  className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                />
              </div>
            </div>
          </div>

          {(error || info) && (
            <div className="mt-1.5">
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
        </div>
      </header>

      {/* Listing */}
      <main className="p-2">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-2 py-1.5 border-b border-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span className="text-[13px] font-semibold">Sale Invoices</span>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : visibleSorted.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No sale invoices.</div>
          ) : (
            <div className="p-2 overflow-auto max-h-[72vh]">
              <div className="min-w-[1040px]">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">School</th>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">Invoice No</th>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">Date</th>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">Session</th>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">Grouping</th>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-700 whitespace-nowrap">Total</th>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">Status</th>
                      <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleSorted.map((r) => {
                      const label = r.sale_no || `#${r.id}`;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="border-b border-slate-200 px-2 py-1.5 font-medium whitespace-nowrap">
                            {schoolNameById(r.school_id)}
                          </td>

                          <td className="border-b border-slate-200 px-2 py-1.5 whitespace-nowrap">
                            <span className="font-semibold text-slate-900">{label}</span>
                          </td>

                          <td className="border-b border-slate-200 px-2 py-1.5 text-slate-600 whitespace-nowrap">
                            {formatDate(r.sale_date || r.createdAt)}
                          </td>

                          <td className="border-b border-slate-200 px-2 py-1.5 whitespace-nowrap">
                            {r.academic_session || "-"}
                          </td>

                          <td className="border-b border-slate-200 px-2 py-1.5 whitespace-nowrap">
                            <span className="text-slate-700">{r.invoice_group_by || "NONE"}</span>
                          </td>

                          <td className="border-b border-slate-200 px-2 py-1.5 text-right whitespace-nowrap">
                            ₹{Math.round(num(r.total_amount))}
                          </td>

                          <td className="border-b border-slate-200 px-2 py-1.5 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${statusChipClass(r.status)}`}>
                              {statusLabel(r.status)}
                            </span>
                          </td>

                          <td className="border-b border-slate-200 px-2 py-1.5">
                            <div className="flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openView(r)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                              >
                                <Eye className="w-3 h-3" />
                                View/Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => openPdf(r.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                              >
                                <FileText className="w-3 h-3" />
                                PDF
                              </button>

                              <button
                                type="button"
                                onClick={() => openEmail(r.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[11px]"
                              >
                                <Mail className="w-3 h-3" />
                                Email
                              </button>

                              <button
                                type="button"
                                onClick={() => cancelSale(r)}
                                disabled={cancellingId === r.id || String(r.status || "").toLowerCase() === "cancelled"}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-[11px] disabled:opacity-60"
                              >
                                <Ban className="w-3 h-3" />
                                {cancellingId === r.id ? "..." : "Cancel"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ============================================================
         Preview & Edit Modal (Sale Price + Qty)
         ============================================================ */}
      {previewOpen && previewData && (
        <div className="fixed inset-0 z-40 bg-black/50">
          <div className="h-full w-full overflow-auto p-2 sm:p-3">
            <div className="mx-auto w-full max-w-[1280px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                <div className="px-2 py-2 border-b bg-gradient-to-r from-slate-50 to-indigo-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold truncate">
                          Preview & Edit — {previewData?.school?.name || schoolNameById(createSchoolId)}{" "}
                          <span className="text-[11px] text-slate-500 font-normal">
                            ({academicSession} • {groupingMode})
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-700 flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200">
                            Discount: <b>{round2(discount).toFixed(2)}</b>
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200">
                            Tax: <b>{round2(tax).toFixed(2)}</b>
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200">
                            Default Sale Price:{" "}
                            <b>{num(defaultUnitPrice) > 0 ? round2(defaultUnitPrice).toFixed(2) : "—"}</b>
                          </span>
                          {previewComputed ? (
                            <>
                              <span className="text-slate-400">•</span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                                Grand Total: <b>₹{Math.round(previewComputed.grandTotal)}</b>
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={resetAllOverrides}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-1.5"
                        title="Reset edits"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reset
                      </button>

                      <button
                        onClick={() => createFromRequirements()}
                        disabled={creating}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg text-white
                                   bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600
                                   hover:brightness-110 active:brightness-95
                                   shadow-sm hover:shadow
                                   disabled:opacity-60 flex items-center gap-1.5"
                        title="Create now"
                      >
                        {creating ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        {creating ? "Creating..." : "Create Invoice(s)"}
                      </button>

                      <button
                        onClick={() => setPreviewOpen(false)}
                        className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                        title="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Group Tabs */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(previewData.previews || []).map((g, idx) => {
                      const active = idx === activeGroupIdx;
                      const comp = previewComputed?.groups?.[idx];
                      const tabTotal = comp?.total ?? num(g.total_amount);
                      return (
                        <button
                          key={`${g.group_key}-${idx}`}
                          onClick={() => setActiveGroupIdx(idx)}
                          className={`px-2.5 py-1 rounded-full text-[11px] border transition
                            ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}
                          `}
                          title={g.group_key}
                        >
                          {g.group_key === "ALL" ? "ALL" : g.group_key}
                          <span className={`ml-2 ${active ? "text-white/90" : "text-slate-500"}`}>
                            ₹{Math.round(tabTotal)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Group Body */}
                <div className="p-2 overflow-auto text-[11px] flex-1 bg-white">
                  {(() => {
                    const g = previewData.previews[activeGroupIdx];
                    if (!g) return <div className="p-4 text-slate-500">No group.</div>;

                    const comp = previewComputed?.groups?.[activeGroupIdx];

                    // ✅ If backend returned summary only (no items), show clear message
                    if (!Array.isArray((g as any).items) || (g as any).items.length === 0) {
                      return (
                        <div className="p-4 text-slate-600 text-[12px]">
                          No item details received for this group (<b>{g.group_key}</b>).
                          <div className="mt-2 text-[11px] text-slate-500">
                            Backend preview should return <code>items</code> inside each group for Publisher/Class mode.
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
                        {/* Items Table */}
                        <div className="lg:col-span-12">
                          <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="px-2 py-1.5 border-b bg-slate-50 flex items-center justify-between">
                              <div className="text-[12px] font-semibold">
                                Items • {comp?.itemsCount ?? g.items_count}{" "}
                                <span className="text-[11px] text-slate-500 font-normal">(editable Sale Price & Qty)</span>
                              </div>
                              <div className="text-[11px] text-slate-600">
                                Subtotal: <b>{(comp?.subtotal ?? num(g.subtotal)).toFixed(2)}</b> • Total:{" "}
                                <b>{(comp?.total ?? num(g.total_amount)).toFixed(2)}</b>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <div className="min-w-[980px]">
                                <table className="w-full text-[11px] border-collapse">
                                  <thead className="bg-slate-100">
                                    <tr>
                                      <th className="border-b border-slate-200 px-2 py-1.5 text-left w-[40%]">Book</th>
                                      <th className="border-b border-slate-200 px-2 py-1.5 text-left w-[12%]">Class</th>
                                      <th className="border-b border-slate-200 px-2 py-1.5 text-left w-[14%]">Publisher</th>
                                      <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[10%]">Req Qty</th>
                                      <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[10%]">Edit Qty</th>
                                      <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[10%]">Sale Price</th>
                                      <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[10%]">Amount</th>
                                      <th className="border-b border-slate-200 px-2 py-1.5 text-center w-[4%]">↺</th>
                                    </tr>
                                  </thead>

                                  <tbody>
                                    {(g.items || []).map((it: any) => {
                                      const effQty = getEffectiveQty(it);
                                      const effRate = getEffectiveRate(it);
                                      const amt = round2(effQty * effRate);
                                      const rateEdited = getIsRateEdited(it);
                                      const qtyEdited = getIsQtyEdited(it);

                                      return (
                                        <tr key={it.requirement_item_id} className="hover:bg-slate-50">
                                          <td className="border-b border-slate-200 px-2 py-1.5">
                                            <div className="font-medium text-slate-900 truncate max-w-[520px]">
                                              {pickTitle(it)}
                                            </div>
                                            <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                              <span>BookID: {it.book_id}</span>
                                              {it.stock_available != null ? (
                                                <>
                                                  <span className="text-slate-400">•</span>
                                                  <span className={it.can_fulfill ? "text-emerald-700" : "text-rose-700"}>
                                                    Stock: {it.stock_available}
                                                    {it.short_qty ? ` (Short ${it.short_qty})` : ""}
                                                  </span>
                                                </>
                                              ) : null}
                                            </div>
                                          </td>

                                          <td className="border-b border-slate-200 px-2 py-1.5 text-slate-700">
                                            {pickClassName(it)}
                                          </td>

                                          <td className="border-b border-slate-200 px-2 py-1.5 text-slate-700">
                                            {pickPublisherName(it)}
                                          </td>

                                          <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                            {num(it.requested_qty)}
                                          </td>

                                          <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                            <input
                                              value={effQty}
                                              onChange={(e) => setQtyForItem(it, num(e.target.value))}
                                              className={`w-[80px] text-right border rounded-lg px-2 py-1 bg-white text-[11px] ${
                                                qtyEdited ? "border-amber-300 bg-amber-50" : "border-slate-300"
                                              }`}
                                              title="Edit Qty"
                                            />
                                          </td>

                                          <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                            <input
                                              value={effRate}
                                              onChange={(e) => setRateForItem(it, num(e.target.value))}
                                              className={`w-[92px] text-right border rounded-lg px-2 py-1 bg-white text-[11px] ${
                                                rateEdited ? "border-amber-300 bg-amber-50" : "border-slate-300"
                                              }`}
                                              title={`Default: ${pickUnitPrice(it).toFixed(2)} | Base: ${num(it.default_unit_price).toFixed(2)}`}
                                            />
                                            <div className="text-[10px] text-slate-500 mt-0.5">def {pickUnitPrice(it).toFixed(2)}</div>
                                          </td>

                                          <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">
                                            {amt.toFixed(2)}
                                          </td>

                                          <td className="border-b border-slate-200 px-2 py-1.5 text-center">
                                            <button
                                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                                              title="Reset this row"
                                              onClick={() => {
                                                resetQtyForItem(it);
                                                resetRateForItem(it);
                                              }}
                                            >
                                              <RotateCcw className="w-3.5 h-3.5" />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="px-3 py-2 border-t bg-slate-50 text-[10.5px] text-slate-500 flex items-center justify-between">
                              <span>Preview: {formatDateTime(new Date().toISOString())}</span>
                              <span className="text-slate-600">
                                Groups: <b>{previewData.previews.length}</b>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="h-2" />
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
         View/Edit Modal (Sale + Items)
         ============================================================ */}
      {viewOpen && viewSale && (
        <div className="fixed inset-0 z-40 bg-black/50">
          <div className="h-full w-full overflow-auto p-2 sm:p-3">
            <div className="mx-auto w-full max-w-[1200px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                <div className="px-2 py-2 border-b bg-gradient-to-r from-slate-50 to-indigo-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold truncate">
                          {viewSchool?.name || schoolNameById(viewSale.school_id)}{" "}
                          <span className="text-[11px] text-slate-500 font-normal">({viewSale.academic_session || "-"})</span>
                        </div>

                        <div className="text-[11px] text-slate-700 truncate mt-0.5">
                          Invoice:{" "}
                          <span className="font-semibold text-slate-900">{viewSale.sale_no || `#${viewSale.id}`}</span>
                          {editMode ? <span className="ml-2 text-amber-700 font-semibold">• Editing</span> : null}
                        </div>

                        <div className="mt-1 text-[11px] text-slate-700 flex flex-wrap items-center gap-2">
                          <span>
                            <span className="font-semibold">Date:</span>{" "}
                            {editMode ? formatDate(editSaleDate || null) : formatDate(viewSale.sale_date || viewSale.createdAt)}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span>
                            <span className="font-semibold">Total:</span> ₹{Math.round(viewComputed?.total ?? num(viewSale.total_amount))}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${statusChipClass(viewSale.status)}`}>
                            {statusLabel(viewSale.status)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!editMode ? (
                        <button
                          onClick={startEdit}
                          className="text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 flex items-center gap-1.5"
                          title="Edit Invoice"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={saveEdit}
                            disabled={savingEdit}
                            className="text-[11px] px-2.5 py-1.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-60"
                            title="Save"
                          >
                            {savingEdit ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            {savingEdit ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={savingEdit}
                            className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-1.5 disabled:opacity-60"
                            title="Cancel Edit"
                          >
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => openPdf(viewSale.id)}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-1.5"
                        title="PDF"
                      >
                        <FileText className="w-3.5 h-3.5" /> PDF
                      </button>

                      <button
                        onClick={() => openEmail(viewSale.id)}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1.5"
                        title="Email"
                      >
                        <Mail className="w-3.5 h-3.5" /> Email
                      </button>

                      <button
                        onClick={() => cancelSale(viewSale)}
                        disabled={cancellingId === viewSale.id || String(viewSale.status || "").toLowerCase() === "cancelled"}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 flex items-center gap-1.5 disabled:opacity-60"
                        title="Cancel"
                      >
                        <Ban className="w-3.5 h-3.5" /> {cancellingId === viewSale.id ? "..." : "Cancel"}
                      </button>

                      <button
                        onClick={() => {
                          setViewOpen(false);
                          setEditMode(false);
                        }}
                        className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                        title="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* ✅ Editable header fields */}
                  {editMode ? (
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-12 gap-2 text-[11px]">
                      <div className="md:col-span-3">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">Invoice No</label>
                        <input
                          value={editSaleNo}
                          onChange={(e) => setEditSaleNo(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                          placeholder="Invoice No"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">Sale Date</label>
                        <input
                          value={editSaleDate}
                          onChange={(e) => setEditSaleDate(e.target.value)}
                          type="date"
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">Payment</label>
                        <select
                          value={editPaymentMode}
                          onChange={(e) => setEditPaymentMode(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                        >
                          <option value="CASH">CASH</option>
                          <option value="UPI">UPI</option>
                          <option value="CARD">CARD</option>
                          <option value="CREDIT">CREDIT</option>
                          <option value="MIXED">MIXED</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">Paid</label>
                        <input
                          value={editPaidAmount}
                          onChange={(e) => setEditPaidAmount(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                          placeholder="Paid"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">Discount</label>
                        <input
                          value={editDiscount}
                          onChange={(e) => setEditDiscount(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                          placeholder="Discount"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">Tax</label>
                        <input
                          value={editTax}
                          onChange={(e) => setEditTax(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                          placeholder="Tax"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">PO No</label>
                        <input
                          value={editPoNo}
                          onChange={(e) => setEditPoNo(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                          placeholder="PO No"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">Challan No</label>
                        <input
                          value={editChallanNo}
                          onChange={(e) => setEditChallanNo(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                          placeholder="Challan No"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">Due Date</label>
                        <input
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                          type="date"
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-[10.5px] font-semibold text-slate-700 mb-1">Notes</label>
                        <input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                          placeholder="Notes"
                        />
                      </div>

                      <div className="md:col-span-12">
                        <div className="mt-1 text-[10.5px] text-slate-600">
                          Totals Preview → Subtotal: <b>{(viewComputed?.subtotal ?? 0).toFixed(2)}</b> • Total:{" "}
                          <b>{(viewComputed?.total ?? 0).toFixed(2)}</b>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Items */}
                <div className="p-2 overflow-auto text-[11px] flex-1 bg-white">
                  {(() => {
                    const items = Array.isArray(viewSale.items) ? viewSale.items : [];
                    if (!items?.length) return <div className="p-4 text-slate-500">No items.</div>;

                    return (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto overflow-y-hidden">
                          <div className="min-w-[980px]">
                            <table className="w-full text-[11px] border-collapse">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-left w-[44%]">Item</th>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-left w-[12%]">Class</th>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-left w-[12%]">Publisher</th>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[8%]">Qty</th>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[10%]">Sale Price</th>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[10%]">Amount</th>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[4%]">↺</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((it) => {
                                  const idKey = String(it.id);
                                  const qty = editMode ? num(editItemQty[idKey]) : num(it.requested_qty);
                                  const rate = editMode ? num(editItemRate[idKey]) : num(it.requested_unit_price);
                                  const amt = round2(qty * rate);

                                  return (
                                    <tr key={it.id} className="hover:bg-slate-50">
                                      <td className="border-b border-slate-200 px-2 py-1.5">
                                        <div className="font-medium text-slate-900 truncate max-w-[560px]">
                                          {pickTitle(it)}
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-0.5">
                                          ReqItemID: {it.requirement_item_id ?? "-"} • BookID: {it.book_id ?? "-"}
                                        </div>
                                      </td>

                                      <td className="border-b border-slate-200 px-2 py-1.5 text-slate-700">
                                        {pickClassName(it)}
                                      </td>

                                      <td className="border-b border-slate-200 px-2 py-1.5 text-slate-700">
                                        {pickPublisherName(it)}
                                      </td>

                                      <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">
                                        {editMode ? (
                                          <input
                                            value={qty}
                                            onChange={(e) =>
                                              setEditItemQty((p) => ({
                                                ...p,
                                                [idKey]: Math.max(0, Math.floor(num(e.target.value))),
                                              }))
                                            }
                                            className="w-[80px] text-right border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                                          />
                                        ) : (
                                          qty
                                        )}
                                      </td>

                                      <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                        {editMode ? (
                                          <input
                                            value={rate}
                                            onChange={(e) =>
                                              setEditItemRate((p) => ({
                                                ...p,
                                                [idKey]: round2(num(e.target.value)),
                                              }))
                                            }
                                            className="w-[92px] text-right border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                                          />
                                        ) : (
                                          round2(rate).toFixed(2)
                                        )}
                                      </td>

                                      <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">
                                        {amt.toFixed(2)}
                                      </td>

                                      <td className="border-b border-slate-200 px-2 py-1.5 text-right">
                                        {editMode ? (
                                          <button
                                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                                            title="Reset row"
                                            onClick={() => {
                                              setEditItemQty((p) => ({ ...p, [idKey]: num(it.requested_qty) }));
                                              setEditItemRate((p) => ({ ...p, [idKey]: num(it.requested_unit_price) }));
                                            }}
                                          >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                          </button>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="px-3 py-2 border-t bg-slate-50 text-[10.5px] text-slate-500 flex items-center justify-between">
                  <span>Created: {formatDateTime(viewSale.createdAt || null)}</span>
                  <span>
                    Grouping: <span className="font-semibold text-slate-700">{viewSale.invoice_group_by || "NONE"}</span>
                  </span>
                </div>
              </div>

              <div className="h-2" />
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
         Email Modal
         ============================================================ */}
      {emailOpen && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full overflow-auto p-2 sm:p-3">
            <div className="mx-auto w-full max-w-[900px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                <div className="px-2 py-2 border-b bg-gradient-to-r from-slate-50 to-indigo-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold truncate">Send Sale Invoice Email</div>
                        <div className="text-[11px] text-slate-600 truncate">
                          Invoice ID: <b>{emailSaleId ?? "-"}</b> (PDF will be attached)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={sendEmail}
                        disabled={emailBusy}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {emailBusy ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {emailBusy ? "..." : "Send"}
                      </button>

                      <button
                        onClick={() => setEmailOpen(false)}
                        className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                        title="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-3 overflow-auto text-[11px] flex-1 bg-white">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">To</label>
                      <input
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                        placeholder="to@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">CC</label>
                      <input
                        value={emailCc}
                        onChange={(e) => setEmailCc(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                        placeholder="cc1@example.com, cc2@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Subject</label>
                      <input
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]"
                        placeholder="Subject"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">HTML</label>
                      <textarea
                        value={emailHtml}
                        onChange={(e) => setEmailHtml(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2 py-2 bg-white text-[11px] min-h-[220px] font-mono"
                        placeholder="<p>...</p>"
                      />
                    </div>
                    <div className="text-[10.5px] text-slate-500">Tip: Keep it simple. PDF is attached automatically by backend.</div>
                  </div>
                </div>

                <div className="px-3 py-2 border-t bg-slate-50 text-[10.5px] text-slate-500 flex items-center justify-between">
                  <span>
                    Loaded via: <b>/api/school-sales/:id/email-preview</b>
                  </span>
                  <span>
                    Send via: <b>/api/school-sales/:id/send-email</b>
                  </span>
                </div>
              </div>

              <div className="h-2" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolSalesPageClient;