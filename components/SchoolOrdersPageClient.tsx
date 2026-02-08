// components/SchoolOrdersPageClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  BookOpen,
  RefreshCcw,
  PlusCircle,
  Package,
  Send,
  Eye,
  ChevronLeft,
  FileText,  
  X,
  Trash2,
} from "lucide-react";

/* ---------- Types ---------- */

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

type TransportLite = {
  id: number;
  name: string;
  city?: string | null;
  phone?: string | null;
};

type School = { id: number; name: string; city?: string | null };

type SchoolOrderItem = {
  id: number;
  book_id: number;
  total_order_qty: number | string;
  received_qty: number | string;

  pending_qty?: number | string | null;
  reordered_qty?: number | string | null;

  book?: {
    id: number;
    title: string;
    class_name?: string | null;
    subject?: string | null;
    code?: string | null;
    isbn?: string | null;
    publisher_id?: number | null;
    publisher?: PublisherLite | null;
  };
};

type SchoolOrder = {
  id: number;
  school_id: number;
  supplier_id: number;

  school?: School;
  School?: School;

  supplier?: SupplierLite | null;

  order_no: string;
  academic_session?: string | null;
  order_date?: string | null;
  createdAt?: string;

  status: string;

  items?: SchoolOrderItem[];
  SchoolOrderItems?: SchoolOrderItem[];

  transport_id?: number | null;
  transport?: TransportLite | null;

  transport_id_2?: number | null;
  transport2?: TransportLite | null;

  // ✅ Notes (2 options)
  notes?: string | null;
  notes_2?: string | null; // preferred
  notes2?: string | null; // fallback
  // ✅ Internal remarks (Office only)
  remarks?: string | null;
  email_sent_count?: number;
  last_email_sent_at?: string | null;
  last_email_to?: string | null;
  last_email_cc?: string | null;
  last_email_subject?: string | null;
};

/* ---------- Session Options ---------- */

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

/* ---------- Helpers ---------- */

const deriveDisplayStatus = (order: SchoolOrder): string => {
  const items = getOrderItems(order);

  const ord = totalQtyFromItems(items);
  const rec = totalReceivedFromItems(items);
  const re = totalReorderedFromItems(items);

  // if order is closed, keep original status
  if (isClosedishStatus(order.status)) return order.status || "draft";

  // ✅ completed when received covers ordered (or ordered 0)
  if (ord > 0 && rec >= ord) return "completed";

  // ✅ partial received if some received but not all
  if (rec > 0 && rec < ord) return "partial_received";

  // otherwise use real status (sent/draft etc.)
  return order.status || "draft";
};

const displayStatusLabel = (order: SchoolOrder) => statusLabel(deriveDisplayStatus(order));
const displayStatusChipClass = (order: SchoolOrder) => statusChipClass(deriveDisplayStatus(order));


const normalizeSchools = (payload: any): School[] => {
  if (Array.isArray(payload)) return payload as School[];
  if (payload && Array.isArray(payload.data)) return payload.data as School[];
  return [];
};

const normalizeTransports = (payload: any): TransportLite[] => {
  if (Array.isArray(payload)) return payload as TransportLite[];
  if (payload && Array.isArray(payload.data)) return payload.data as TransportLite[];
  return [];
};

const normalizeSuppliers = (payload: any): SupplierLite[] => {
  if (Array.isArray(payload)) return payload as SupplierLite[];
  if (payload && Array.isArray(payload.data)) return payload.data as SupplierLite[];
  return [];
};



const getOrderSchool = (order: SchoolOrder | any): School | undefined =>
  (order && (order.school || order.School)) || undefined;

const getOrderItems = (order: SchoolOrder | any): SchoolOrderItem[] => {
  if (!order) return [];
  if (Array.isArray(order.items)) return order.items as SchoolOrderItem[];
  if (Array.isArray(order.SchoolOrderItems)) return order.SchoolOrderItems as SchoolOrderItem[];
  return [];
};

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

const totalQtyFromItems = (items: SchoolOrderItem[]) =>
  (items || []).reduce((sum, it) => sum + (Number(it.total_order_qty) || 0), 0);

const totalReceivedFromItems = (items: SchoolOrderItem[]) =>
  (items || []).reduce((sum, it) => sum + (Number(it.received_qty) || 0), 0);

const totalReorderedFromItems = (items: SchoolOrderItem[]) =>
  (items || []).reduce((sum, it) => sum + (Number(it.reordered_qty) || 0), 0);

const isClosedishStatus = (status?: string | null) => status === "cancelled" || status === "reordered";

const statusLabel = (status: string | undefined) => {
  switch (status) {
    case "completed":
      return "Collected";
    case "partial_received":
      return "Partial";
    case "cancelled":
      return "Cancelled";
    case "reordered":
      return "Reordered";
    case "sent":
      return "Sent";
    case "draft":
      return "Draft";
    default:
      return status || "-";
  }
};

const statusChipClass = (status: string | undefined) => {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "partial_received":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border border-red-200";
    case "reordered":
      return "bg-purple-50 text-purple-700 border border-purple-200";
    case "sent":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "draft":
    default:
      return "bg-slate-50 text-slate-600 border border-slate-200";
  }
};

const makeSupplierKey = (orderId: number, supplierId: number) => `${orderId}:${supplierId}`;

// ✅ very small HTML escape (safe)
const escapeHtml = (s: string) =>
  String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

/**
 * ✅ If backend creates 2 log rows (TO + CC), this merges them into 1 "send".
 * It also makes "count" = number of sends (not recipients).
 */
type MergedEmailLog = {
  key: string;
  when: string | null;
  to: string;
  cc: string;
  status: string;
  raw: any[];
};

const normalizeEmail = (v: any) => String(v || "").trim();

const splitEmails = (s: string) =>
  s
    .split(/[,\n;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);

const uniqJoinEmails = (emails: string[]) => {
  const map = new Map<string, string>();
  emails.forEach((e) => {
    const k = e.toLowerCase();
    if (!map.has(k)) map.set(k, e);
  });
  return Array.from(map.values()).join(", ");
};

const guessRecipientType = (row: any): "to" | "cc" | "unknown" => {
  const t = String(row?.recipient_type || row?.type || row?.kind || "").toLowerCase();
  if (t === "to") return "to";
  if (t === "cc") return "cc";
  if (row?.is_cc === true || row?.isCc === true) return "cc";
  return "unknown";
};

const buildEmailGroupKey = (row: any, fallbackIdx: number) => {
  const mid = normalizeEmail(row?.message_id || row?.messageId);
  if (mid) return `mid:${mid}`;

  const gid = normalizeEmail(row?.group_id || row?.groupId || row?.batch_id || row?.batchId);
  if (gid) return `gid:${gid}`;

  const when = normalizeEmail(row?.sent_at || row?.createdAt || row?.created_at);
  const subject = normalizeEmail(row?.subject);
  const oid = normalizeEmail(row?.order_id || row?.school_order_id);

  if (when || subject || oid) return `tso:${when}|${subject}|${oid}`;
  return `idx:${fallbackIdx}`;
};

const mergeEmailLogs = (rows: any[]): MergedEmailLog[] => {
  const groups = new Map<string, any[]>();

  rows.forEach((r, idx) => {
    const key = buildEmailGroupKey(r, idx);
    const arr = groups.get(key) || [];
    arr.push(r);
    groups.set(key, arr);
  });




  const merged: MergedEmailLog[] = Array.from(groups.entries()).map(([key, arr]) => {
    const primary = arr.find((x) => guessRecipientType(x) === "to") || arr[0];

    const when =
      normalizeEmail(primary?.sent_at || primary?.createdAt || primary?.created_at) ||
      normalizeEmail(arr[0]?.sent_at || arr[0]?.createdAt || arr[0]?.created_at) ||
      null;

    const toEmails: string[] = [];
    const ccEmails: string[] = [];

    arr.forEach((x) => {
      const t = guessRecipientType(x);
      const toVal = normalizeEmail(x?.to_email || x?.to || x?.toEmail);
      const ccVal = normalizeEmail(x?.cc || x?.cc_email || x?.ccEmail);

      if (t === "cc") {
        if (toVal) ccEmails.push(...splitEmails(toVal));
      } else {
        if (toVal) toEmails.push(...splitEmails(toVal));
      }

      if (ccVal) ccEmails.push(...splitEmails(ccVal));
    });

    const to = uniqJoinEmails(
      toEmails.length ? toEmails : splitEmails(normalizeEmail(primary?.to_email || primary?.to))
    );
    const cc = uniqJoinEmails(ccEmails);

    const status = normalizeEmail(primary?.status || arr[0]?.status) || "SENT";
    return { key, when, to: to || "-", cc: cc || "-", status, raw: arr };
  });

  merged.sort((a, b) => {
    const ta = a.when ? new Date(a.when).getTime() : 0;
    const tb = b.when ? new Date(b.when).getTime() : 0;
    return tb - ta;
  });

  return merged;
};

  const buildEmailOptionsFromMergedLogs = (merged: MergedEmailLog[]) => {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];

  merged.forEach((m) => {
    const list = [...splitEmails(m.to || ""), ...splitEmails(m.cc || "")];

    list.forEach((e) => {
      const v = String(e || "").trim();
      if (!v) return;
      const key = v.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ value: v, label: v });
    });
  });

  out.sort((a, b) => a.value.localeCompare(b.value));
  return out;
};

const clampInt = (v: any, min = 0, max = 999999) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

// ✅ Notes helper (works with notes_2 or notes2)
const getNotes2 = (order: SchoolOrder | null) => (order?.notes_2 ?? order?.notes2 ?? "") || "";


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
    width: 520,
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

/* ---------- Component ---------- */

type BulkTargetMode = "visible" | "school";

const SchoolOrdersPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [orders, setOrders] = useState<SchoolOrder[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [transports, setTransports] = useState<TransportLite[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendingOrderId, setSendingOrderId] = useState<number | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);


  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [academicSession, setAcademicSession] = useState("2026-27");
  const [filterSession, setFilterSession] = useState("");
  const [filterSchoolId, setFilterSchoolId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // ✅ for yellow highlight of latest generated
  const [lastGeneratedAt, setLastGeneratedAt] = useState<number | null>(null);

  const [viewOrder, setViewOrder] = useState<SchoolOrder | null>(null);

  // Modal meta editing (order-only)
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaTransportId, setMetaTransportId] = useState<string>("");
  const [metaTransportId2, setMetaTransportId2] = useState<string>("");

  // ✅ Notes 1 + Notes 2
  const [metaNotes, setMetaNotes] = useState<string>("");
  const [metaNotes2, setMetaNotes2] = useState<string>("");
    // ✅ Internal Remarks (Office only)
  const [metaRemarks, setMetaRemarks] = useState<string>("");


  // Order No edit
  const [baseOrderNoDraft, setBaseOrderNoDraft] = useState<string>("");
  const [savingBaseOrderNo, setSavingBaseOrderNo] = useState(false);

  // Listing order no edit
  const [orderNoDrafts, setOrderNoDrafts] = useState<Record<number, string>>({});
  const [savingOrderNoId, setSavingOrderNoId] = useState<number | null>(null);


  
  // ✅ Reorder Copy (manual qty) modal
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyOrder, setCopyOrder] = useState<SchoolOrder | null>(null);
  const [copySaving, setCopySaving] = useState(false);
  const [copyQtyDrafts, setCopyQtyDrafts] = useState<Record<number, number>>({});
  const [copyDeletedIds, setCopyDeletedIds] = useState<Record<number, boolean>>({});

  // ✅ Email modal state
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailOrder, setEmailOrder] = useState<SchoolOrder | null>(null);

  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");

  // ✅ Non-technical email editor fields
  const [emailGreeting, setEmailGreeting] = useState("Dear Sir/Madam,");
  const [emailLine1, setEmailLine1] = useState("Please find the attached Purchase Order PDF.");
  const [emailExtraLines, setEmailExtraLines] = useState("Order No: {ORDER_NO}\nOrder Date: {ORDER_DATE}");
  const [emailSignature, setEmailSignature] = useState("Regards,\nSumeet Book Store");

  // ✅ Preview popup
  const [emailBodyPreviewOpen, setEmailBodyPreviewOpen] = useState(false);

  // raw rows from API
  const [emailLogsRaw, setEmailLogsRaw] = useState<any[]>([]);
  // merged rows (one per send)
  const mergedEmailLogs = useMemo(() => mergeEmailLogs(emailLogsRaw), [emailLogsRaw]);
  const emailHistoryOptions = useMemo(() => {
  return buildEmailOptionsFromMergedLogs(mergedEmailLogs);
}, [mergedEmailLogs]);

// ✅ GLOBAL email logs for dropdown (all orders)
const [globalEmailLogsRaw, setGlobalEmailLogsRaw] = useState<any[]>([]);
const mergedGlobalEmailLogs = useMemo(() => mergeEmailLogs(globalEmailLogsRaw), [globalEmailLogsRaw]);
const globalEmailHistoryOptions = useMemo(() => {
  return buildEmailOptionsFromMergedLogs(mergedGlobalEmailLogs);
}, [mergedGlobalEmailLogs]);



const supplierEmailOptions = useMemo(() => {
  // unique list: "Name <email>"
  const out: { label: string; value: string }[] = [];
  const seen = new Set<string>();

  (suppliers || []).forEach((s) => {
    const email = String(s.email || "").trim();
    if (!email) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: `${s.name} <${email}>`, value: email });
  });

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}, [suppliers]);

// ✅ ADD THIS EXACTLY HERE (after supplierEmailOptions)
const combinedEmailOptions = useMemo(() => {
  const map = new Map<string, { value: string; label: string }>();

  // 1) global history first
  (globalEmailHistoryOptions || []).forEach((o) => {
    const v = String(o.value || "").trim();
    if (!v) return;
    map.set(v.toLowerCase(), { value: v, label: o.label || v });
  });

  // 2) supplier emails
  (supplierEmailOptions || []).forEach((o) => {
    const v = String(o.value || "").trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (!map.has(key)) map.set(key, { value: v, label: o.label || v });
  });

  return Array.from(map.values()).sort((a, b) => a.value.localeCompare(b.value));
}, [globalEmailHistoryOptions, supplierEmailOptions]);

const emailCount = mergedEmailLogs.length;

// ✅ Email count cache for listing (orderId -> count)
const [emailCounts, setEmailCounts] = useState<Record<number, number>>({});



  /* ---------- ✅ Bulk Meta (Transport-1 + Notes1+Notes2 ONLY) ---------- */

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkTransportId, setBulkTransportId] = useState<string>("");
  const [bulkNotes1, setBulkNotes1] = useState<string>("");
  const [bulkNotes2, setBulkNotes2] = useState<string>("");

  // ✅ Bulk modal preselect
  const [bulkInitialMode, setBulkInitialMode] = useState<BulkTargetMode>("visible");
  const [bulkInitialSchoolId, setBulkInitialSchoolId] = useState<string>("");
  const [bulkKey, setBulkKey] = useState(1);

  const openBulkModal = (preset?: { mode?: BulkTargetMode; schoolId?: number | string }) => {
    setBulkOpen(true);
    setBulkSaving(false);

    setBulkTransportId(metaTransportId || "");
    setBulkNotes1(metaNotes || "");
    setBulkNotes2(metaNotes2 || "");

    setBulkInitialMode(preset?.mode || "visible");
    setBulkInitialSchoolId(preset?.schoolId != null ? String(preset.schoolId) : "");
    setBulkKey((k) => k + 1);

    setError(null);
    setInfo(null);
  };

  const closeBulkModal = () => {
    setBulkOpen(false);
    setBulkSaving(false);
    setBulkTransportId("");
    setBulkNotes1("");
    setBulkNotes2("");
    setBulkInitialMode("visible");
    setBulkInitialSchoolId("");
  };

  /* ---------- Data fetching ---------- */

  const fetchSchools = async () => {
    try {
      const res = await api.get("/api/schools");
      setSchools(normalizeSchools(res.data));
    } catch (err) {
      console.error("Error loading schools:", err);
    }
  };

  const fetchTransports = async () => {
    try {
      const res = await api.get("/api/transports");
      setTransports(normalizeTransports(res.data));
    } catch (err) {
      console.error("Error loading transports:", err);
    }
  };
  const fetchSuppliers = async () => {
  try {
    const res = await api.get("/api/suppliers");
    setSuppliers(normalizeSuppliers(res.data));
  } catch (err) {
    console.error("Error loading suppliers:", err);
  }
};


  const fetchOrders = async (): Promise<SchoolOrder[]> => {
  setLoading(true);
  setError(null);
  try {
    const res = await api.get("/api/school-orders");
    const payload = res.data;

    const list: SchoolOrder[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.orders)
        ? payload.orders
        : [];

    setOrders(list || []);

    setOrderNoDrafts((prev) => {
      const next = { ...prev };
      (list || []).forEach((o) => {
        if (next[o.id] == null) next[o.id] = o.order_no || "";
      });
      return next;
    });

    return list || [];
  } catch (err: any) {
    console.error(err);
    setError(err?.response?.data?.message || "Failed to load school orders. Please try again.");
    return [];
  } finally {
    setLoading(false);
  }
};


  useEffect(() => {
    fetchSchools();
    fetchTransports();
    fetchSuppliers();
    fetchOrders();
    refreshGlobalEmailLogs(); // ✅ add this
  }, []);

  /* ---------- ✅ AUTH PDF FIX ---------- */

  const fetchPdfBlobUrl = async (orderId: number) => {
    const res = await api.get(`/api/school-orders/${orderId}/pdf`, { responseType: "blob" });

    const contentType = (res.headers as any)?.["content-type"] || "";
    if (!String(contentType).includes("application/pdf")) {
      const blob = res.data as Blob;
      const text = await blob.text().catch(() => "");
      throw new Error(text || "Not a PDF.");
    }

    const blob = new Blob([res.data], { type: "application/pdf" });
    return window.URL.createObjectURL(blob);
  };

  const openPdfWithAuth = async (orderId: number, targetWin?: Window | null) => {
    const url = await fetchPdfBlobUrl(orderId);
    if (targetWin && !targetWin.closed) targetWin.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  const openPdfDirect = (orderId: number) => {
    if (!orderId) return;

    const w = window.open("about:blank", "_blank", "noopener,noreferrer");
    openPdfWithAuth(orderId, w).catch((err: any) => {
      console.error(err);
      if (w && !w.closed) {
        w.document.title = "PDF Error";
        w.document.body.innerHTML =
          `<pre style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace; padding:12px; white-space:pre-wrap;">` +
          escapeHtml(err?.message || "PDF failed") +
          `</pre>`;
      } else {
        setError(err?.response?.data?.message || err?.message || "PDF failed.");
      }
    });
  };

  // ✅ Print ALL visible in ONE PDF
  const openAllPdf = async (visibleOrders: SchoolOrder[], filterSession: string, filterSchoolId: string, filterStatus: string) => {
    if (!visibleOrders.length) return;

    const ok = await sweetConfirm({
      title: "Print ALL visible in one PDF?",
      icon: "info",
      html: `<div style="text-align:left;font-size:13px;">
        <div><b>Orders:</b> ${visibleOrders.length}</div>
        <div style="margin-top:6px;color:#64748b;font-size:12px;">
          This will generate a single PDF (each order on new page).
        </div>
      </div>`,
      confirmText: "Print",
      cancelText: "Cancel",
    });
    if (!ok) return;

    const params: Record<string, string> = {};
    if (filterSession) params.academic_session = filterSession;
    if (filterSchoolId) params.school_id = filterSchoolId;
    if (filterStatus && filterStatus !== "not_received") params.status = filterStatus;

    const qs = new URLSearchParams(params).toString();
    const url = `/api/school-orders/pdf/all${qs ? `?${qs}` : ""}`;

    try {
      const res = await api.get(url, { responseType: "blob" });

      const contentType = (res.headers as any)?.["content-type"] || "";
      if (!String(contentType).includes("application/pdf")) {
        const blob = res.data as Blob;
        const text = await blob.text().catch(() => "");
        throw new Error(text || "Not a PDF.");
      }

      const blob = new Blob([res.data], { type: "application/pdf" });
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      console.error("print-all error:", err);
      setError(err?.response?.data?.message || err?.message || "Print all failed.");
      await sweetToast({ icon: "error", title: "Print all failed" });
    }
  };

  // ✅ NEW: Supplier + Order Index PDF (2 columns only)
  const openSupplierOrderIndexPdf = async () => {
    const params: Record<string, string> = {};
    if (filterSession) params.academic_session = filterSession;
    if (filterSchoolId) params.school_id = filterSchoolId;
    if (filterStatus && filterStatus !== "not_received") params.status = filterStatus;

    const qs = new URLSearchParams(params).toString();
    const url = `/api/school-orders/pdf/supplier-order-index${qs ? `?${qs}` : ""}`;

    try {
      const res = await api.get(url, { responseType: "blob" });

      const contentType = (res.headers as any)?.["content-type"] || "";
      if (!String(contentType).includes("application/pdf")) {
        const blob = res.data as Blob;
        const text = await blob.text().catch(() => "");
        throw new Error(text || "Not a PDF.");
      }

      const blob = new Blob([res.data], { type: "application/pdf" });
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      console.error("supplier-index error:", err);
      setError(err?.response?.data?.message || err?.message || "Supplier index PDF failed.");
      await sweetToast({ icon: "error", title: "Index PDF failed" });
    }
  };

  /* ---------- Actions ---------- */

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!academicSession.trim()) {
      setError("Select session.");
      return;
    }

    try {
      setGenerating(true);
      const res = await api.post("/api/school-orders/generate", {
        academic_session: academicSession.trim(),
      });

      setLastGeneratedAt(Date.now()); // ✅ highlight marker

      setInfo(res?.data?.message || "Generated.");
      await fetchOrders();
      await sweetToast({ icon: "success", title: "Generated" });
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Generate failed.");
      await sweetToast({ icon: "error", title: "Generate failed" });
    } finally {
      setGenerating(false);
    }
  };
  const handleDeleteOrder = async (order: SchoolOrder) => {
  if (!order?.id) return;

  const label = order.order_no ? `${order.order_no}` : `#${order.id}`;

  const ok = await sweetConfirm({
    title: "Delete this order?",
    icon: "warning",
    html: `<div style="text-align:left;font-size:13px;">
      <div><b>Order:</b> ${escapeHtml(label)}</div>
      <div style="margin-top:8px;color:#64748b;">
        This will permanently delete the order.
        <br/>If receipts exist, deletion will be blocked.
      </div>
    </div>`,
    confirmText: "Delete",
    cancelText: "Cancel",
  });

  if (!ok) return;

  setDeletingOrderId(order.id);
  setError(null);
  setInfo(null);

  try {
    const res = await api.delete(`/api/school-orders/${order.id}`);

    // remove from list immediately (fast UI)
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    setOrderNoDrafts((prev) => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
    setEmailCounts((prev) => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });

    // if currently opened in modal, close it
    setViewOrder((prev) => (prev?.id === order.id ? null : prev));

    await sweetToast({ icon: "success", title: res?.data?.message || "Order deleted" });
  } catch (err: any) {
    console.error(err);
    const msg =
      err?.response?.data?.message ||
      err?.message ||
      "Delete failed.";

    setError(msg);
    await sweetToast({ icon: "error", title: msg || "Delete failed" });
  } finally {
    setDeletingOrderId(null);
  }
};




  // ✅ Copy reorder (manual qty)
  const openCopyModal = (order: SchoolOrder) => {
    const items = getOrderItems(order);

    const drafts: Record<number, number> = {};
    items.forEach((it) => {
      const ordered = Number(it.total_order_qty) || 0;
      const received = Number(it.received_qty) || 0;
      const reordered = Number(it.reordered_qty) || 0;
      const pending = Math.max(ordered - received - reordered, 0);
      drafts[it.id] = pending;
    });

    setCopyOrder(order);
    setCopyQtyDrafts(drafts);
    setCopyDeletedIds({});
    setCopyOpen(true);
    setError(null);
    setInfo(null);
  };

  const closeCopyModal = () => {
    setCopyOpen(false);
    setCopyOrder(null);
    setCopyQtyDrafts({});
    setCopyDeletedIds({});
    setCopySaving(false);
  };

  const submitCopyReorder = async () => {
    if (!copyOrder?.id) return;

    const items = getOrderItems(copyOrder);

    const payloadItems = items
      .filter((it) => !copyDeletedIds[it.id])
      .map((it) => ({
        item_id: it.id,
        total_order_qty: clampInt(copyQtyDrafts[it.id] ?? 0, 0, 999999),
      }))
      .filter((x) => x.total_order_qty > 0);

    if (!payloadItems.length) {
      setError("Select at least 1 item (qty > 0).");
      return;
    }

    const ok = await sweetConfirm({
      title: "Create Copy Reorder?",
      icon: "question",
      html: `<div style="text-align:left;font-size:13px;">
        <div>This will create a <b>NEW</b> order.</div>
        <div style="margin-top:8px;color:#64748b;">Old order will remain unchanged.</div>
      </div>`,
      confirmText: "Create",
      cancelText: "Cancel",
    });
    if (!ok) return;

    setCopySaving(true);
    setError(null);
    setInfo(null);

    try {
      const res = await api.post(`/api/school-orders/${copyOrder.id}/reorder-copy`, {
        items: payloadItems,
      });

      setInfo(res?.data?.message || "Copy reorder created.");
      await sweetToast({ icon: "success", title: "Copy reorder created" });
      await fetchOrders();

      const newOrder = (res?.data?.new_order || res?.data?.order) as SchoolOrder | undefined;
      closeCopyModal();
      if (newOrder?.id) handleOpenView(newOrder);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Copy reorder failed.");
      await sweetToast({ icon: "error", title: "Copy reorder failed" });
    } finally {
      setCopySaving(false);
    }
  };

  const handleOpenView = (order: SchoolOrder) => {
    setViewOrder(order);

    setMetaTransportId(order.transport_id ? String(order.transport_id) : "");
    setMetaTransportId2(order.transport_id_2 ? String(order.transport_id_2) : "");

    setMetaNotes(order.notes || "");
    setMetaNotes2(getNotes2(order));
    setMetaRemarks(order.remarks || "");


    setBaseOrderNoDraft(order.order_no || "");
  };

  const handleMetaSave = async () => {
    if (!viewOrder) return;
    setError(null);
    setInfo(null);
    setMetaSaving(true);

    try {
    const payload: any = {
        transport_id: metaTransportId ? Number(metaTransportId) : null,
        transport_id_2: metaTransportId2 ? Number(metaTransportId2) : null,
        notes: metaNotes.trim() ? metaNotes.trim() : null,
        notes_2: metaNotes2.trim() ? metaNotes2.trim() : null,

        // ✅ Internal office remarks
        remarks: metaRemarks.trim() ? metaRemarks.trim() : null,
      };


      const res = await api.patch(`/api/school-orders/${viewOrder.id}/meta`, payload);
      const updatedOrder: SchoolOrder = res.data.order;

      setViewOrder(updatedOrder);
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

      setMetaTransportId(updatedOrder.transport_id ? String(updatedOrder.transport_id) : "");
      setMetaTransportId2(updatedOrder.transport_id_2 ? String(updatedOrder.transport_id_2) : "");

      setMetaNotes(updatedOrder.notes || "");
      setMetaNotes2(getNotes2(updatedOrder));
      setMetaRemarks(updatedOrder.remarks || "");


      setInfo(res.data?.message || "Meta saved.");
      await sweetToast({ icon: "success", title: "Saved" });
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Meta save failed.");
      await sweetToast({ icon: "error", title: "Save failed" });
    } finally {
      setMetaSaving(false);
    }
  };

  // ✅ Bulk save: Transport-1 + Notes1 + Notes2 ONLY
  const handleBulkMetaSave = async (targetOrders: SchoolOrder[]) => {
    if (!targetOrders.length) return;

    const payload: any = {
      transport_id: bulkTransportId ? Number(bulkTransportId) : null,
      notes: bulkNotes1.trim() ? bulkNotes1.trim() : null,
      notes_2: bulkNotes2.trim() ? bulkNotes2.trim() : null,
    };

    const ok = await sweetConfirm({
      title: "Bulk update meta?",
      icon: "warning",
      html: `<div style="text-align:left;font-size:13px;">
        <div><b>Orders:</b> ${targetOrders.length}</div>
        <div style="margin-top:8px;">
          Will update: <b>Transport 1</b>, <b>Notes 1</b>, <b>Notes 2</b>
        </div>
        <div style="margin-top:6px;color:#64748b;">
          Transport 2 will NOT be changed.
        </div>
      </div>`,
      confirmText: "Update",
      cancelText: "Cancel",
    });
    if (!ok) return;

    setBulkSaving(true);
    setError(null);
    setInfo(null);

    try {
      const chunk = async (arr: SchoolOrder[], size: number) => {
        for (let i = 0; i < arr.length; i += size) {
          const part = arr.slice(i, i + size);
          await Promise.all(part.map((o) => api.patch(`/api/school-orders/${o.id}/meta`, payload).catch(() => null)));
        }
      };

      await chunk(targetOrders, 6);

      setInfo(`Bulk updated ${targetOrders.length} order(s).`);
      await sweetToast({ icon: "success", title: "Bulk updated" });

      await fetchOrders();
      closeBulkModal();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Bulk update failed.");
      await sweetToast({ icon: "error", title: "Bulk update failed" });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleSaveBaseOrderNo = async () => {
    if (!viewOrder) return;

    const newNo = String(baseOrderNoDraft || "").trim();
    if (!newNo) {
      setError("Order no required.");
      return;
    }

    setError(null);
    setInfo(null);
    setSavingBaseOrderNo(true);

    try {
      await api.patch(`/api/school-orders/${viewOrder.id}/order-no`, { order_no: newNo });

      setViewOrder((prev) => (prev ? { ...prev, order_no: newNo } : prev));
      setOrders((prev) => prev.map((o) => (o.id === viewOrder.id ? { ...o, order_no: newNo } : o)));
      setOrderNoDrafts((prev) => ({ ...prev, [viewOrder.id]: newNo }));

      await sweetToast({ icon: "success", title: "Order No updated" });
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Order no update failed.");
      await sweetToast({ icon: "error", title: "Order No update failed" });
    } finally {
      setSavingBaseOrderNo(false);
    }
  };

  const handleSaveOrderNoFromListing = async (orderId: number) => {
    const newNo = String(orderNoDrafts[orderId] || "").trim();
    if (!newNo) {
      setError("Order no required.");
      return;
    }

    setError(null);
    setInfo(null);
    setSavingOrderNoId(orderId);

    try {
      await api.patch(`/api/school-orders/${orderId}/order-no`, { order_no: newNo });

      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, order_no: newNo } : o)));
      setViewOrder((prev) => (prev?.id === orderId ? { ...prev, order_no: newNo } : prev));
      if (viewOrder?.id === orderId) setBaseOrderNoDraft(newNo);

      await sweetToast({ icon: "success", title: "Saved" });
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Order no update failed.");
      await sweetToast({ icon: "error", title: "Save failed" });
    } finally {
      setSavingOrderNoId(null);
    }
  };

  /* ---------- ✅ Email modal actions ---------- */

  const fetchEmailCountForOrder = async (orderId: number) => {
    if (!orderId) return;
    if (emailCounts[orderId] != null) return;

    try {
      const r = await api.get(`/api/school-orders/${orderId}/email-logs?limit=30`);
      const payload = r?.data || {};
      const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.logs) ? payload.logs : [];
      const merged = mergeEmailLogs(rows);
      setEmailCounts((prev) => ({ ...prev, [orderId]: merged.length }));
    } catch {
      // ignore
    }
  };

  const refreshEmailLogs = async (orderId: number) => {
    try {
      const l = await api.get(`/api/school-orders/${orderId}/email-logs?limit=120`);
      const logsPayload = l?.data || {};
      const rows = Array.isArray(logsPayload.data)
        ? logsPayload.data
        : Array.isArray(logsPayload.logs)
          ? logsPayload.logs
          : [];

      setEmailLogsRaw(rows);

      const merged = mergeEmailLogs(rows);
      setEmailCounts((prev) => ({ ...prev, [orderId]: merged.length }));
    } catch {
      // ignore
    }
  };

  // ✅ GLOBAL: fetch logs for ALL orders (dropdown suggestions)
const refreshGlobalEmailLogs = async () => {
  try {
    // ⚠️ Use your global endpoint here
    const r = await api.get(`/api/school-orders/email-logs?limit=1000`);

    const payload = r?.data || {};
    const rows = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.logs)
      ? payload.logs
      : [];

    setGlobalEmailLogsRaw(rows);
  } catch {
    // ignore
  }
};


  const openEmailModal = async (order: SchoolOrder) => {
    if (!order?.id) return;

    setError(null);
    setInfo(null);

    setEmailOpen(true);
    setEmailOrder(order);
    setSendingOrderId(order.id);

    setEmailBodyPreviewOpen(false);

    setEmailLoading(true);
    try {
      const p = await api.get(`/api/school-orders/${order.id}/email-preview`);
      const preview = p?.data || {};

      const supplierName = order?.supplier?.name || "Sir/Madam";
      const orderNo = order.order_no || String(order.id);

      setEmailTo(preview.to || order.supplier?.email || "");
      setEmailCc(preview.cc || "");
      setEmailSubject(preview.subject || `Purchase Order – Order No ${orderNo} – ${order.supplier?.name || ""}`);

      setEmailGreeting(`Dear ${supplierName},`);
      setEmailLine1("Please find the attached Purchase Order PDF.");
      setEmailExtraLines(`Order No: {ORDER_NO}\nOrder Date: {ORDER_DATE}`);
      setEmailSignature("Regards,\nSumeet Book Store");

      await refreshEmailLogs(order.id);
      setEmailCounts((prev) => ({ ...prev, [order.id]: prev[order.id] ?? 0 }));
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load email preview.");
    } finally {
      setEmailLoading(false);
      setSendingOrderId(null);
    }
  };

  const closeEmailModal = () => {
    setEmailOpen(false);
    setEmailLoading(false);
    setEmailSending(false);
    setEmailOrder(null);

    setEmailBodyPreviewOpen(false);

    setEmailTo("");
    setEmailCc("");
    setEmailSubject("");

    setEmailGreeting("Dear Sir/Madam,");
    setEmailLine1("Please find the attached Purchase Order PDF.");
    setEmailExtraLines("Order No: {ORDER_NO}\nOrder Date: {ORDER_DATE}");
    setEmailSignature("Regards,\nSumeet Book Store");

    setEmailLogsRaw([]);
  };

  const buildEmailHtml = (order: SchoolOrder | null) => {
    const orderNo = order?.order_no || String(order?.id || "");
    const orderDate = formatDate(order?.order_date || order?.createdAt);

    const replaceTokens = (s: string) =>
      String(s || "")
        .replaceAll("{ORDER_NO}", orderNo)
        .replaceAll("{ORDER_DATE}", orderDate);

    const greeting = escapeHtml(replaceTokens(emailGreeting)).replaceAll("\n", "<br/>");
    const line1 = escapeHtml(replaceTokens(emailLine1)).replaceAll("\n", "<br/>");

    const extrasRaw = replaceTokens(emailExtraLines || "");
    const extras = extrasRaw
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => `<div>${escapeHtml(x)}</div>`)
      .join("");

    const signature = escapeHtml(replaceTokens(emailSignature)).replaceAll("\n", "<br/>");

    return `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">
        <p style="margin:0 0 10px;">${greeting}</p>
        <p style="margin:0 0 12px;">${line1}</p>
        ${extras ? `<div style="margin:0 0 14px;">${extras}</div>` : ""}
        <p style="margin:0;">${signature}</p>
      </div>
    `.trim();
  };

  const sendEmailFromModal = async () => {
    if (!emailOrder?.id) return;

    const to = emailTo.trim();
    if (!to) {
      setError("To email is required.");
      return;
    }

    setError(null);
    setInfo(null);
    setEmailSending(true);

    try {
      const html = buildEmailHtml(emailOrder);

      const res = await api.post(`/api/school-orders/${emailOrder.id}/send-email`, {
        to,
        cc: emailCc.trim() || null,
        subject: emailSubject.trim() || null,
        html,
      });

      setInfo(res?.data?.message || "Email sent.");
      await fetchOrders();
      await refreshEmailLogs(emailOrder.id);
      await refreshGlobalEmailLogs(); // ✅ add this


      // setEmailCounts((prev) => ({
      //   ...prev,
      //   [emailOrder.id]: Number(prev[emailOrder.id] ?? 0) + 1,
      // }));

      await sweetToast({ icon: "success", title: "Email sent" });
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Email failed.");
      await sweetToast({ icon: "error", title: "Email failed" });
    } finally {
      setEmailSending(false);
    }
  };

  /* ---------- Filters + Groups ---------- */

  const visibleOrders: SchoolOrder[] = orders.filter((o) => {
    let ok = true;

    if (filterSession) ok = ok && (o.academic_session || "") === filterSession;
    if (filterSchoolId) ok = ok && String(o.school_id) === filterSchoolId;

    if (filterStatus) {
      const items = getOrderItems(o);

      if (filterStatus === "not_received") {
        const rec = totalReceivedFromItems(items);
        ok = ok && rec === 0 && !isClosedishStatus(o.status);
      } else {
        ok = ok && o.status === filterStatus;
      }
    }

    return ok;
  });

  // ✅ sort: latest generated (highest createdAt / order_date) on top
  const visibleOrdersSorted = useMemo(() => {
    const toTime = (o: SchoolOrder) => {
      const s = o.order_date || o.createdAt || "";
      const t = s ? new Date(s).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    return [...visibleOrders].sort((a, b) => toTime(b) - toTime(a));
  }, [visibleOrders]);

  // ✅ highlight threshold: 3 minutes after generate
  const isRecentlyGenerated = (o: SchoolOrder) => {
    if (!lastGeneratedAt) return false;
    const t = new Date(o.order_date || o.createdAt || "").getTime();
    if (!Number.isFinite(t) || !t) return false;
    return t >= lastGeneratedAt - 60_000 && t <= lastGeneratedAt + 3 * 60_000;
  };

  useEffect(() => {
    visibleOrdersSorted.slice(0, 50).forEach((o) => {
      if (o?.id) fetchEmailCountForOrder(o.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleOrdersSorted]);

  const aggregate = useMemo(() => {
    let orderedTotal = 0;
    let receivedTotal = 0;
    let pendingTotalLocal = 0;

    visibleOrdersSorted.forEach((o) => {
      const items = getOrderItems(o);
      const ord = totalQtyFromItems(items);
      const rec = totalReceivedFromItems(items);
      const re = totalReorderedFromItems(items);

      orderedTotal += ord;
      receivedTotal += rec;
      pendingTotalLocal += isClosedishStatus(o.status) ? 0 : Math.max(ord - rec - re, 0);
    });

    return { orderedTotal, receivedTotal, pendingTotal: Math.max(pendingTotalLocal, 0) };
  }, [visibleOrdersSorted]);

  const { orderedTotal, receivedTotal, pendingTotal } = aggregate;

  type SupplierRow = {
    key: string;
    order: SchoolOrder;
    school: School | undefined;
    supplierId: number;
    supplierName: string;
    orderedTotal: number;
    receivedTotal: number;
    reorderedTotal: number;
    pendingTotal: number;
    time: number;
  };

  // ✅ group rows (sorted: latest first per school)
  const schoolGroups: { schoolId: number; school: School | undefined; rows: SupplierRow[] }[] = useMemo(() => {
    const map = new Map<number, { school: School | undefined; rows: SupplierRow[] }>();

    const toTime = (o: SchoolOrder) => {
      const s = o.order_date || o.createdAt || "";
      const t = s ? new Date(s).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };

    visibleOrdersSorted.forEach((order) => {
      const school = getOrderSchool(order);
      const schoolId = order.school_id;
      const items = getOrderItems(order);

      const supplierId = Number(order.supplier_id);
      const supplierName = order.supplier?.name || (supplierId ? `Supplier #${supplierId}` : "Supplier");

      const ordTotal = totalQtyFromItems(items);
      const recTotal = totalReceivedFromItems(items);
      const reTotal = totalReorderedFromItems(items);

      const pending = isClosedishStatus(order.status) ? 0 : Math.max(ordTotal - recTotal - reTotal, 0);

      const row: SupplierRow = {
        key: makeSupplierKey(order.id, supplierId || 0),
        order,
        school,
        supplierId,
        supplierName,
        orderedTotal: ordTotal,
        receivedTotal: recTotal,
        reorderedTotal: reTotal,
        pendingTotal: pending,
        time: toTime(order),
      };

      const existing = map.get(schoolId);
      if (!existing) map.set(schoolId, { school, rows: [row] });
      else existing.rows.push(row);
    });

    return Array.from(map.entries())
      .map(([schoolId, value]) => ({
        schoolId,
        school: value.school,
        rows: value.rows
          .sort((a, b) => b.time - a.time), // ✅ latest first
      }))
      .sort((a, b) => {
        const ta = a.rows[0]?.time || 0;
        const tb = b.rows[0]?.time || 0;
        return tb - ta;
      });
  }, [visibleOrdersSorted]);

  /* ---------- UI ---------- */

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 scrollbar-sleek">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-2 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-[11px]"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Link>

            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate">School → Supplier Orders</div>
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
          <form onSubmit={handleGenerate} className="flex flex-wrap items-center gap-1.5 text-[11px]">
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
              className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[220px]"
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
              className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[130px]"
              title="Status"
            >
              <option value="">Status</option>
              <option value="not_received">Not Received</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="partial_received">Partial</option>
              <option value="completed">Completed</option>
              <option value="reordered">Reordered</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <div className="hidden md:block w-px h-5 bg-slate-200 mx-1" />

            <select
              value={academicSession}
              onChange={(e) => setAcademicSession(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px] w-[120px]"
              title="Generate Session"
            >
              {SESSION_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold text-white
                         bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600
                         hover:brightness-110 active:brightness-95
                         shadow-sm hover:shadow
                         focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2
                         disabled:opacity-60 disabled:shadow-none"
              title="Generate"
            >
              {generating ? (
                <>
                  <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                  ...
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  Generate
                </>
              )}
            </button>

            <button
              type="button"
              onClick={fetchOrders}
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

            {/* ✅ Bulk meta */}
            <button
              type="button"
              onClick={() => openBulkModal({ mode: "visible" })}
              disabled={!visibleOrdersSorted.length}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold
                         text-slate-800 border border-slate-200
                         bg-gradient-to-r from-slate-50 to-indigo-50
                         hover:from-slate-100 hover:to-indigo-100
                         shadow-sm hover:shadow
                         focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2
                         disabled:opacity-50 disabled:shadow-none"
              title="Bulk update Transport-1 + Notes (2) for visible orders"
            >
              <Package className="w-3.5 h-3.5" />
              Bulk Meta
            </button>

            {/* ✅ Print ALL visible in ONE PDF */}
            <button
              type="button"
              onClick={() => openAllPdf(visibleOrdersSorted, filterSession, filterSchoolId, filterStatus)}
              disabled={!visibleOrdersSorted.length}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold
                         text-blue-800 border border-blue-200
                         bg-gradient-to-r from-blue-50 to-sky-50
                         hover:from-blue-100 hover:to-sky-100
                         shadow-sm hover:shadow
                         focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-2
                         disabled:opacity-50 disabled:shadow-none"
              title="Generate ONE PDF for all visible orders"
            >
              <FileText className="w-3.5 h-3.5" />
              Print All (1 PDF)
            </button>

            {/* ✅ NEW BUTTON: Supplier-Order Index PDF */}
            <button
              type="button"
              onClick={openSupplierOrderIndexPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold
                         text-slate-900 border border-slate-200
                         bg-gradient-to-r from-amber-50 to-yellow-50
                         hover:from-amber-100 hover:to-yellow-100
                         shadow-sm hover:shadow
                         focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2"
              title="Supplier + Order No Index PDF (2 columns)"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Supplier Index PDF
            </button>

            <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-600">
              <span title="Orders">{visibleOrdersSorted.length}</span>
              <span title="Ordered">O:{orderedTotal}</span>
              <span title="Received">R:{receivedTotal}</span>
              <span title="Pending">P:{pendingTotal}</span>
            </div>
          </form>

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
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span className="text-[13px] font-semibold">Orders</span>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : schoolGroups.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No orders.</div>
          ) : (
            <div className="space-y-2 p-2 max-h-[72vh] overflow-auto">
              {schoolGroups.map((group) => (
                <div key={group.schoolId} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="text-[13px] font-semibold truncate">
                      {group.school?.name || "Unknown"}
                      {group.school?.city ? (
                        <span className="text-[11px] text-slate-500 font-normal"> ({group.school.city})</span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-[11px] text-slate-500">{group.rows.length}</div>

                      {/* ✅ bulk meta for this school */}
                      <button
                        type="button"
                        onClick={() => openBulkModal({ mode: "school", schoolId: group.schoolId })}
                        className="text-[10.5px] px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100"
                        title="Bulk meta for this school only"
                      >
                        Bulk School
                      </button>
                   
                    </div>
                  </div>

                  <div className="overflow-x-auto overflow-y-hidden">
                    <div className="min-w-[1080px]">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                              Supplier
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                              Order No
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                              Date
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-700 whitespace-nowrap">
                              O
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-700 whitespace-nowrap">
                              R
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-700 whitespace-nowrap">
                              P
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                              Status
                            </th>
                            {/* ✅ removed column E */}
                            <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                              Actions
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {group.rows.map((row) => {
                            const { order } = row;
                            const isSending = sendingOrderId === order.id;                            
                            const statusClass = displayStatusChipClass(order);

                            const draft = orderNoDrafts[order.id] ?? order.order_no ?? "";
                            const savingThis = savingOrderNoId === order.id;

                            const highlight = isRecentlyGenerated(order);

                            return (
                              <tr
                                key={row.key}
                                className={`hover:bg-slate-50 ${highlight ? "bg-yellow-100" : ""}`}
                                title={highlight ? "Latest generated" : ""}
                              >
                                <td className="border-b border-slate-200 px-2 py-1.5 font-medium whitespace-nowrap">
                                  {row.supplierName}
                                </td>

                               <td className="border-b border-slate-200 px-2 py-1.5">
  <div className="flex flex-col gap-0.5">
    {/* Order No Row */}
    <div className="flex items-center gap-1.5">
      <input
        value={draft}
        onChange={(e) =>
          setOrderNoDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
        }
        className="w-36 border border-slate-300 rounded-md px-2 py-1 text-[11px]
                   focus:outline-none focus:ring-2 focus:ring-indigo-200"
        placeholder={`#${order.id}`}
      />
      <button
        type="button"
        onClick={() => handleSaveOrderNoFromListing(order.id)}
        disabled={savingThis}
        className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 text-white
                   hover:bg-slate-800 disabled:opacity-60"
      >
        {savingThis ? "..." : "Save"}
      </button>
    </div>

    {/* ✅ Small Remarks Preview */}
    {order.remarks ? (
      <div
        className="text-[10px] text-slate-500 truncate max-w-[200px]"
        title={order.remarks}
      >
        📝 {order.remarks}
      </div>
    ) : null}
  </div>
</td>


                                <td className="border-b border-slate-200 px-2 py-1.5 text-slate-600 whitespace-nowrap">
                                  {formatDate(order.order_date || order.createdAt)}
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 text-right whitespace-nowrap">
                                  {row.orderedTotal}
                                </td>
                                <td className="border-b border-slate-200 px-2 py-1.5 text-right whitespace-nowrap">
                                  {row.receivedTotal}
                                </td>
                                <td className="border-b border-slate-200 px-2 py-1.5 text-right whitespace-nowrap">
                                  {row.pendingTotal}
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5 whitespace-nowrap">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${statusClass}`}
                                  >
                                    {displayStatusLabel(order)}
                                  </span>
                                </td>

                                <td className="border-b border-slate-200 px-2 py-1.5">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenView(order)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                                    >
                                      <Eye className="w-3 h-3" />
                                      View
                                    </button>


                                    <button
                                      type="button"
                                      onClick={() => openCopyModal(order)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                                      title="Copy reorder with manual qty (does not change old order)"
                                    >
                                      <Package className="w-3 h-3" />
                                      Copy
                                    </button>

                                    {/* ✅ Email button includes counter, so removed E column */}
                                    <button
                                      type="button"
                                      onClick={() => openEmailModal(order)}
                                      disabled={isSending}
                                      className="relative inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-300
                                                 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 text-[11px]"
                                    >
                                      <Send className="w-3 h-3" />
                                      Email
                                      <span
                                        className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full
                                                   bg-white border border-emerald-200 text-[10px] text-emerald-800"
                                        title="Emails sent"
                                      >
                                        {emailCounts[order.id] ?? 0}
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => openPdfDirect(order.id)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                                    >
                                      <FileText className="w-3 h-3" />
                                      PDF
                                    </button>

                                        {/* 🔴 DELETE (ADD EXACTLY HERE) */}
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteOrder(order)}
                                          disabled={deletingOrderId === order.id}
                                          className="inline-flex items-center justify-center p-2 rounded-md
                                                    border border-red-200 bg-red-50 text-red-700 hover:bg-red-100
                                                    disabled:opacity-60"
                                          title="Delete order"
                                        >
                                          <Trash2
                                            className={`w-3.5 h-3.5 ${
                                              deletingOrderId === order.id ? "animate-pulse" : ""
                                            }`}
                                          />
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
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ---------- Bulk Modal ---------- */}
      {bulkOpen && (
        <div className="fixed inset-0 z-[45] bg-black/50">
          <div className="h-full w-full overflow-auto p-2 sm:p-3">
            <div className="mx-auto w-full max-w-[900px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">Bulk Update Meta</div>
                    <div className="text-[11px] text-slate-600">
                      Updates only: <span className="font-semibold">Transport 1</span>,{" "}
                      <span className="font-semibold">Notes 1</span>, <span className="font-semibold">Notes 2</span>
                      <span className="text-slate-400"> • </span>
                      <span className="text-slate-500">Transport 2 untouched</span>
                    </div>
                  </div>
                  <button
                    onClick={closeBulkModal}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <BulkTargetBlock
                  key={bulkKey}
                  visibleOrders={visibleOrdersSorted}
                  schoolGroups={schoolGroups}
                  onApply={(targetOrders) => handleBulkMetaSave(targetOrders)}
                  transports={transports}
                  bulkTransportId={bulkTransportId}
                  setBulkTransportId={setBulkTransportId}
                  bulkNotes1={bulkNotes1}
                  setBulkNotes1={setBulkNotes1}
                  bulkNotes2={bulkNotes2}
                  setBulkNotes2={setBulkNotes2}
                  bulkSaving={bulkSaving}
                  closeBulkModal={closeBulkModal}
                  initialMode={bulkInitialMode}
                  initialSchoolId={bulkInitialSchoolId}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal (Order-only view + meta edit) */}
      {viewOrder && (
        <div className="fixed inset-0 z-40 bg-black/50">
          <div className="h-full w-full overflow-auto p-2 sm:p-3">
            <div className="mx-auto w-full max-w-[1200px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                {/* Header + Meta */}
                <div className="px-2 py-2 border-b bg-gradient-to-r from-slate-50 to-indigo-50">
                  {(() => {
                    const school = getOrderSchool(viewOrder);
                    const items = getOrderItems(viewOrder);

                    const supplierName =
                      viewOrder.supplier?.name ||
                      (viewOrder.supplier_id ? `Supplier #${viewOrder.supplier_id}` : "Supplier");

                    const totalOrdered = totalQtyFromItems(items);
                    const totalReceived = totalReceivedFromItems(items);
                    const totalReordered = totalReorderedFromItems(items);

                    const totalPending = isClosedishStatus(viewOrder.status)
                      ? 0
                      : Math.max(totalOrdered - totalReceived - totalReordered, 0);

                    return (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4" />
                            </div>

                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold truncate">
                                {school?.name || "School"}{" "}
                                <span className="text-[11px] text-slate-500 font-normal">
                                  ({viewOrder.academic_session || "-"})
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-700 truncate mt-0.5">
                                Supplier: <span className="font-semibold text-slate-900">{supplierName}</span>
                              </div>

                              <div className="mt-1 text-[11px] text-slate-700 flex flex-wrap items-center gap-2">
                                <span>
                                  <span className="font-semibold">O:</span> {totalOrdered}
                                </span>
                                <span className="text-slate-400">•</span>
                                <span>
                                  <span className="font-semibold">R:</span> {totalReceived}
                                </span>
                                <span className="text-slate-400">•</span>
                                <span>
                                  <span className="font-semibold">P:</span> {totalPending}
                                </span>
                                <span className="text-slate-400">•</span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${statusChipClass(
                                    viewOrder.status
                                  )}`}
                                >
                                  {statusLabel(deriveDisplayStatus(viewOrder))}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">                          
                    

                            <button
                              onClick={() => openCopyModal(viewOrder)}
                              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-1.5"
                              title="Copy reorder with manual qty (does not change old order)"
                            >
                              <Package className="w-3.5 h-3.5" /> Copy
                            </button>

                            <button
                              onClick={() => openPdfDirect(viewOrder.id)}
                              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5" /> PDF
                            </button>

                            <button
                              onClick={() => openEmailModal(viewOrder)}
                              disabled={sendingOrderId === viewOrder.id}
                              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 flex items-center gap-1.5 disabled:opacity-60"
                            >
                              <Send className="w-3.5 h-3.5" /> Email{" "}
                              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full bg-white border border-emerald-200 text-[10px] text-emerald-800">
                                {emailCounts[viewOrder.id] ?? 0}
                              </span>
                            </button>

                            <button
                              onClick={() => setViewOrder(null)}
                              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                              title="Close"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <div className="flex items-end gap-1.5">
                            <div className="w-[220px]">
                              <label className="block text-[10.5px] text-slate-600 mb-0.5">Order No</label>
                              <input
                                value={baseOrderNoDraft}
                                onChange={(e) => setBaseOrderNoDraft(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleSaveBaseOrderNo}
                              disabled={savingBaseOrderNo}
                              className="h-[30px] text-[11px] px-3 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                            >
                              {savingBaseOrderNo ? "..." : "Save"}
                            </button>
                          </div>

                          <div className="w-[240px]">
                            <label className="block text-[10.5px] text-slate-600 mb-0.5">Transport 1</label>
                            <select
                              value={metaTransportId}
                              onChange={(e) => setMetaTransportId(e.target.value)}
                              className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                              <option value="">--</option>
                              {transports.map((t) => (
                                <option key={t.id} value={String(t.id)}>
                                  {t.name}
                                  {t.city ? ` (${t.city})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="w-[240px]">
                            <label className="block text-[10.5px] text-slate-600 mb-0.5">Transport 2</label>
                            <select
                              value={metaTransportId2}
                              onChange={(e) => setMetaTransportId2(e.target.value)}
                              className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                              <option value="">--</option>
                              {transports.map((t) => (
                                <option key={t.id} value={String(t.id)}>
                                  {t.name}
                                  {t.city ? ` (${t.city})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* ✅ Notes 1 + Notes 2 */}
                          <div className="flex items-end gap-1.5 flex-wrap">
                            <div className="w-[320px]">
                              <label className="block text-[10.5px] text-slate-600 mb-0.5">
                                Notes 1 (PDF footer)
                              </label>
                              <input
                                value={metaNotes}
                                onChange={(e) => setMetaNotes(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                placeholder="Notes 1..."
                              />
                            </div>

                            <div className="w-[320px]">
                              <label className="block text-[10.5px] text-slate-600 mb-0.5">
                                Notes 2 (PDF footer)
                              </label>
                              <input
                                value={metaNotes2}
                                onChange={(e) => setMetaNotes2(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                placeholder="Notes 2..."
                              />
                            </div>

                              <div className="w-[360px]">
                                <label className="block text-[10.5px] text-slate-600 mb-0.5">
                                  Internal Remarks (Office Only)
                                </label>
                                <input
                                  value={metaRemarks}
                                  onChange={(e) => setMetaRemarks(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                  placeholder="Internal remarks… (not printed / not emailed)"
                                />
                              </div>


                            <button
                              type="button"
                              onClick={handleMetaSave}
                              disabled={metaSaving}
                              className="h-[30px] text-[11px] px-3 rounded-lg text-white font-semibold
                                         bg-gradient-to-r from-indigo-600 to-blue-600
                                         hover:brightness-110 active:brightness-95
                                         disabled:opacity-60"
                            >
                              {metaSaving ? "..." : "Save"}
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* ✅ Items */}
                <div className="p-2 overflow-auto text-[11px] flex-1 bg-white">
                  {(() => {
                    const items = getOrderItems(viewOrder);
                    if (!items?.length) return <div className="p-4 text-slate-500">No items.</div>;

                    const closedish = isClosedishStatus(viewOrder.status);

                    return (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto overflow-y-hidden">
                          <div className="min-w-[760px]">
                            <table className="w-full text-[11px] border-collapse">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-left w-[60%]">Book</th>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[13%]">O</th>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[13%]">R</th>
                                  <th className="border-b border-slate-200 px-2 py-1.5 text-right w-[14%]">P</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((it) => {
                                  const ordered = Number(it.total_order_qty) || 0;
                                  const received = Number(it.received_qty) || 0;
                                  const reordered = Number(it.reordered_qty) || 0;

                                  const pending = closedish
                                    ? 0
                                    : it.pending_qty != null
                                      ? Math.max(Number(it.pending_qty) || 0, 0)
                                      : Math.max(ordered - received - reordered, 0);

                                  return (
                                    <tr key={it.id} className="hover:bg-slate-50">
                                      <td className="border-b border-slate-200 px-2 py-1.5">
                                        <div className="font-medium text-slate-900 truncate max-w-[520px]">
                                          {it.book?.title || `Book #${it.book_id}`}
                                        </div>
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">
                                        {ordered}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">
                                        {received}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold">
                                        {pending}
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
              </div>

              <div className="h-2" />
            </div>
          </div>
        </div>
      )}

      {/* ✅ Copy Reorder Modal */}
      {copyOpen && copyOrder && (
        <div className="fixed inset-0 z-[55] bg-black/50">
          <div className="h-full w-full overflow-auto p-2 sm:p-3">
            <div className="mx-auto w-full max-w-[980px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
                <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">
                      Copy Reorder {copyOrder.order_no ? `- ${copyOrder.order_no}` : ""}
                    </div>
                    <div className="text-[11px] text-slate-600 truncate">
                      Creates a NEW order (old order remains unchanged).
                    </div>
                  </div>
                  <button
                    onClick={closeCopyModal}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 overflow-auto">
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto overflow-y-hidden">
                      <div className="min-w-[780px]">
                        <table className="w-full text-[11px]">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="px-2 py-1.5 text-left border-b w-[55%]">Book</th>
                              <th className="px-2 py-1.5 text-right border-b w-[15%]">Pending</th>
                              <th className="px-2 py-1.5 text-right border-b w-[20%]">New Qty</th>
                              <th className="px-2 py-1.5 text-center border-b w-[10%]">Del</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getOrderItems(copyOrder)
                              .filter((it) => !copyDeletedIds[it.id])
                              .map((it) => {
                                const ordered = Number(it.total_order_qty) || 0;
                                const received = Number(it.received_qty) || 0;
                                const reordered = Number(it.reordered_qty) || 0;
                                const pending = Math.max(ordered - received - reordered, 0);

                                const v = copyQtyDrafts[it.id] ?? pending;

                                return (
                                  <tr key={it.id} className="border-t hover:bg-slate-50">
                                    <td className="px-2 py-1.5">
                                      <div className="font-medium text-slate-900 truncate max-w-[420px]">
                                        {it.book?.title || `Book #${it.book_id}`}
                                      </div>
                                    </td>

                                    <td className="px-2 py-1.5 text-right whitespace-nowrap font-semibold">
                                      {pending}
                                    </td>

                                    <td className="px-2 py-1.5 text-right">
                                      <input
                                        value={String(v)}
                                        onChange={(e) =>
                                          setCopyQtyDrafts((prev) => ({
                                            ...prev,
                                            [it.id]: clampInt(e.target.value, 0, 999999),
                                          }))
                                        }
                                        className="w-28 text-right border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                        inputMode="numeric"
                                      />
                                    </td>

                                    <td className="px-2 py-1.5 text-center">
                                      <button
                                        type="button"
                                        onClick={() => setCopyDeletedIds((prev) => ({ ...prev, [it.id]: true }))}
                                        className="inline-flex items-center justify-center p-1.5 rounded-md
                                                   border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                        title="Remove from copy"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] text-slate-500">
                    Tip: Trash removes item from this copy. Qty=0 also skips item.
                  </div>
                </div>

                <div className="px-3 py-2 border-t bg-slate-50 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCopyModal}
                    className="text-[11px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitCopyReorder}
                    disabled={copySaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold text-white
                               bg-gradient-to-r from-indigo-600 to-blue-600 hover:brightness-110 disabled:opacity-60"
                  >
                    <Package className="w-3.5 h-3.5" />
                    {copySaving ? "Creating..." : "Create Copy"}
                  </button>
                </div>
              </div>

              <div className="h-2" />
            </div>
          </div>
        </div>
      )}

      {/* ✅ Email Modal + Preview Popup */}
      {emailOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50">
          <div className="h-full w-full overflow-auto p-2 sm:p-3">
            <div className="mx-auto w-full max-w-[1100px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
                <div className="px-2 py-2 border-b bg-slate-50 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">
                      Email Purchase Order{emailOrder?.order_no ? ` - ${emailOrder.order_no}` : ""}
                    </div>
                    <div className="text-[11px] text-slate-600 truncate">
                      Sent Count: <span className="font-semibold">{emailCount}</span>
                      {emailOrder?.supplier?.name ? ` • Supplier: ${emailOrder.supplier.name}` : ""}
                    </div>
                  </div>

                  <button
                    onClick={closeEmailModal}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {emailLoading ? (
                  <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <>
                    <div className="p-2 border-b">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-[11px]">
                        <div className="md:col-span-5">
                          <label className="block text-[10.5px] text-slate-600 mb-0.5">To</label>
                        <input
                          value={emailTo}
                          onChange={(e) => setEmailTo(e.target.value)}
                          list="emailsList"
                          className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="type to search supplier email…"
                        />


                          <datalist id="emailsList">
                          {combinedEmailOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </datalist>




                        </div>

                        <div className="md:col-span-3">
                          <label className="block text-[10.5px] text-slate-600 mb-0.5">CC</label>
                          <input
                                value={emailCc}
                                onChange={(e) => setEmailCc(e.target.value)}
                                list="emailsList"
                                className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                placeholder="type to search, you can add multiple using comma…"
                              />

                        </div>

                        <div className="md:col-span-4">
                          <label className="block text-[10.5px] text-slate-600 mb-0.5">Subject</label>
                          <input
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            placeholder="Subject"
                          />
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => emailOrder && openPdfDirect(emailOrder.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                        >
                          <FileText className="w-3.5 h-3.5" /> Preview PDF
                        </button>

                        <button
                          type="button"
                          onClick={() => setEmailBodyPreviewOpen(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                          title="Preview email body"
                        >
                          Show Preview
                        </button>

                        <div className="ml-auto flex items-center gap-2">
                          <span className="text-[10.5px] text-slate-500 hidden sm:inline">
                            Tokens: {`{ORDER_NO}`} {`{ORDER_DATE}`}
                          </span>
                          <button
                            type="button"
                            onClick={sendEmailFromModal}
                            disabled={emailSending}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold text-white
                                       bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 disabled:opacity-60"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {emailSending ? "Sending..." : "Send Email"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-auto p-2 grid grid-cols-1 lg:grid-cols-12 gap-2">
                      <div className="lg:col-span-4">
                        <div className="text-[11px] font-semibold text-slate-800 mb-1">Message</div>

                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <label className="block text-[10.5px] text-slate-600 mb-0.5">Greeting</label>
                            <input
                              value={emailGreeting}
                              onChange={(e) => setEmailGreeting(e.target.value)}
                              className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="Dear Sir/Madam,"
                            />
                          </div>

                          <div>
                            <label className="block text-[10.5px] text-slate-600 mb-0.5">Main Line</label>
                            <input
                              value={emailLine1}
                              onChange={(e) => setEmailLine1(e.target.value)}
                              className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="Please find the attached Purchase Order PDF."
                            />
                          </div>

                          <div>
                            <label className="block text-[10.5px] text-slate-600 mb-0.5">
                              Extra Lines (one per line)
                            </label>
                            <textarea
                              value={emailExtraLines}
                              onChange={(e) => setEmailExtraLines(e.target.value)}
                              className="w-full min-h-[85px] border border-slate-300 rounded-xl px-2 py-2 text-[11px]
                                         focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder={"Order No: {ORDER_NO}\nOrder Date: {ORDER_DATE}"}
                            />
                          </div>

                          <div>
                            <label className="block text-[10.5px] text-slate-600 mb-0.5">Signature</label>
                            <textarea
                              value={emailSignature}
                              onChange={(e) => setEmailSignature(e.target.value)}
                              className="w-full min-h-[55px] border border-slate-300 rounded-xl px-2 py-2 text-[11px]
                                         focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder={"Regards,\nSummet Book Store"}
                            />
                          </div>

                          <div className="text-[10px] text-slate-500">PDF will be attached automatically.</div>
                        </div>
                      </div>

                      <div className="lg:col-span-8">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[11px] font-semibold text-slate-800">Send History</div>
                          {emailOrder?.id ? (
                            <button
                              type="button"
                              onClick={() => refreshEmailLogs(emailOrder.id)}
                              className="text-[11px] px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                            >
                              Refresh
                            </button>
                          ) : null}
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="max-h-[650px] overflow-auto">
                            {mergedEmailLogs.length === 0 ? (
                              <div className="p-3 text-[11px] text-slate-500">No logs yet.</div>
                            ) : (
                              <table className="w-full text-[11px]">
                                <thead className="bg-slate-100 sticky top-0 z-10">
                                  <tr>
                                    <th className="px-2 py-1 text-left whitespace-nowrap w-[160px]">When</th>
                                    <th className="px-2 py-1 text-left">To</th>
                                    <th className="px-2 py-1 text-left">CC</th>
                                    <th className="px-2 py-1 text-left whitespace-nowrap w-[90px]">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {mergedEmailLogs.map((r) => (
                                    <tr key={r.key} className="border-t hover:bg-slate-50">
                                      <td className="px-2 py-1 whitespace-nowrap">{formatDateTime(r.when)}</td>
                                      <td className="px-2 py-1 truncate max-w-[360px]">{r.to}</td>
                                      <td className="px-2 py-1 truncate max-w-[360px]">{r.cc}</td>
                                      <td className="px-2 py-1 whitespace-nowrap">{r.status || "SENT"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>

                        <div className="mt-1 text-[10px] text-slate-500">
                          Count is per “Send” (TO+CC is counted as 1).
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="h-2" />
            </div>
          </div>
        </div>
      )}

      {/* ✅ Email Body Preview Popup */}
      {emailBodyPreviewOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50">
          <div className="h-full w-full overflow-auto p-2 sm:p-3">
            <div className="mx-auto w-full max-w-[780px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">Email Preview</div>
                    <div className="text-[11px] text-slate-600 truncate">
                      {emailOrder?.order_no ? `Order No: ${emailOrder.order_no}` : ""}
                      {emailOrder?.supplier?.name ? ` • Supplier: ${emailOrder.supplier.name}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {emailOrder ? (
                      <button
                        type="button"
                        onClick={() => openPdfDirect(emailOrder.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                      >
                        <FileText className="w-3.5 h-3.5" /> Open PDF
                      </button>
                    ) : null}

                    <button
                      onClick={() => setEmailBodyPreviewOpen(false)}
                      className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-3 overflow-auto bg-white">
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-slate-100 text-[11px] font-semibold text-slate-800">
                      Preview (Email Body)
                    </div>
                    <div
                      className="p-4 text-[13px] text-slate-900 bg-white max-h-[70vh] overflow-auto"
                      dangerouslySetInnerHTML={{ __html: buildEmailHtml(emailOrder) }}
                    />
                  </div>

                  <div className="mt-2 text-[10px] text-slate-500">
                    Tip: Update Greeting / Extra Lines then open preview again.
                  </div>
                </div>

                <div className="px-3 py-2 border-t bg-slate-50 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEmailBodyPreviewOpen(false)}
                    className="text-[11px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Close
                  </button>
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

/* --------------------------------------------
 * ✅ Bulk target selector block (inside same file)
 * -------------------------------------------- */


const BulkTargetBlock: React.FC<{
  visibleOrders: SchoolOrder[];
  schoolGroups: { schoolId: number; school: School | undefined; rows: any[] }[];
  transports: TransportLite[];

  bulkTransportId: string;
  setBulkTransportId: (v: string) => void;

  bulkNotes1: string;
  setBulkNotes1: (v: string) => void;

  bulkNotes2: string;
  setBulkNotes2: (v: string) => void;

  bulkSaving: boolean;
  closeBulkModal: () => void;

  onApply: (orders: SchoolOrder[]) => void;

  initialMode?: BulkTargetMode;
  initialSchoolId?: string;
}> = ({
  visibleOrders,
  schoolGroups,
  transports,
  bulkTransportId,
  setBulkTransportId,
  bulkNotes1,
  setBulkNotes1,
  bulkNotes2,
  setBulkNotes2,
  bulkSaving,
  closeBulkModal,
  onApply,
  initialMode,
  initialSchoolId,
}) => {
  const [mode, setMode] = useState<BulkTargetMode>(initialMode || "visible");
  const [schoolId, setSchoolId] = useState<string>(initialSchoolId || "");

  const schoolOptions = useMemo(() => {
    return schoolGroups
      .map((g) => ({ id: g.schoolId, name: g.school?.name || `School #${g.schoolId}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [schoolGroups]);


  const targetOrders = useMemo(() => {
    if (mode === "school" && schoolId) {
      const sid = Number(schoolId);
      return visibleOrders.filter((o) => Number(o.school_id) === sid);
    }
    return visibleOrders;
  }, [mode, schoolId, visibleOrders]);

  

  return (
    <>
      <div className="p-3 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-[11px]">
          <div className="md:col-span-4">
            <label className="block text-[10.5px] text-slate-600 mb-0.5">Target</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as BulkTargetMode)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="visible">All Visible Orders</option>
              <option value="school">Only One School</option>
            </select>
          </div>

          <div className="md:col-span-8">
            <label className="block text-[10.5px] text-slate-600 mb-0.5">School (if target = Only One)</label>
            <select
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              disabled={mode !== "school"}
              className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
            >
              <option value="">-- Select School --</option>
              {schoolOptions.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-[10.5px] text-slate-600 mb-0.5">Transport 1</label>
            <select
              value={bulkTransportId}
              onChange={(e) => setBulkTransportId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">--</option>
              {transports.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                  {t.city ? ` (${t.city})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-[10.5px] text-slate-600 mb-0.5">Notes 1</label>
            <input
              value={bulkNotes1}
              onChange={(e) => setBulkNotes1(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Notes 1..."
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-[10.5px] text-slate-600 mb-0.5">Notes 2</label>
            <input
              value={bulkNotes2}
              onChange={(e) => setBulkNotes2(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Notes 2..."
            />
          </div>
        </div>

        <div className="mt-2 text-[10.5px] text-slate-500">
          Target Orders: <span className="font-semibold">{targetOrders.length}</span>
        </div>
      </div>

      <div className="px-3 py-2 border-t bg-slate-50 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={closeBulkModal}
          className="text-[11px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
          disabled={bulkSaving}
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() => onApply(targetOrders)}
          disabled={bulkSaving || !targetOrders.length}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold text-white
                     bg-gradient-to-r from-indigo-600 to-blue-600 hover:brightness-110 disabled:opacity-60"
        >
          <Package className="w-3.5 h-3.5" />
          {bulkSaving ? "Updating..." : "Apply Bulk Update"}
        </button>
      </div>
    </>
  );
};

export default SchoolOrdersPageClient;
