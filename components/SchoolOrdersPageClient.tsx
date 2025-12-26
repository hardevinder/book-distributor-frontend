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
  Repeat,
  X,
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

  // backend may send these (after reorder / receive)
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

  // transport/meta (order-only)
  transport_id?: number | null;
  transport_through?: string | null;
  transport?: TransportLite | null;

  transport_id_2?: number | null;
  transport_through_2?: string | null;
  transport2?: TransportLite | null;

  notes?: string | null;
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

/* ---------- Component ---------- */

const SchoolOrdersPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [orders, setOrders] = useState<SchoolOrder[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [transports, setTransports] = useState<TransportLite[]>([]);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendingOrderId, setSendingOrderId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [academicSession, setAcademicSession] = useState("2026-27");
  const [filterSession, setFilterSession] = useState("");
  const [filterSchoolId, setFilterSchoolId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [viewOrder, setViewOrder] = useState<SchoolOrder | null>(null);

  // Modal meta editing (order-only)
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaTransportId, setMetaTransportId] = useState<string>("");
  const [metaTransportThrough, setMetaTransportThrough] = useState<string>("");
  const [metaTransportId2, setMetaTransportId2] = useState<string>("");
  const [metaTransportThrough2, setMetaTransportThrough2] = useState<string>("");
  const [metaNotes, setMetaNotes] = useState<string>("");

  // Order No edit
  const [baseOrderNoDraft, setBaseOrderNoDraft] = useState<string>("");
  const [savingBaseOrderNo, setSavingBaseOrderNo] = useState(false);

  // Listing order no edit
  const [orderNoDrafts, setOrderNoDrafts] = useState<Record<number, string>>({});
  const [savingOrderNoId, setSavingOrderNoId] = useState<number | null>(null);

  // Reorder loading
  const [reorderingId, setReorderingId] = useState<number | null>(null);

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

  const fetchOrders = async () => {
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
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load school orders. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
    fetchTransports();
    fetchOrders();
  }, []);

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
      setInfo(res?.data?.message || "Generated.");
      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Generate failed.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSendEmail = async (order: SchoolOrder) => {
    if (!order.id) return;

    setError(null);
    setInfo(null);
    setSendingOrderId(order.id);

    try {
      const res = await api.post(`/api/school-orders/${order.id}/send-email`);
      setInfo(res?.data?.message || "Email sent.");
      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Email failed.");
    } finally {
      setSendingOrderId(null);
    }
  };

  const handleViewPdf = async (order: SchoolOrder) => {
    if (!order.id) return;
    setError(null);
    setInfo(null);

    try {
      const res = await api.get(`/api/school-orders/${order.id}/pdf`, { responseType: "blob" });

      const contentType = (res.headers as any)?.["content-type"] || "";
      if (!contentType.includes("application/pdf")) {
        const blob = res.data as Blob;
        const text = await blob.text().catch(() => "");
        throw new Error(text || "Not a PDF.");
      }

      const blob = new Blob([res.data], { type: "application/pdf" });
      const pdfUrl = window.URL.createObjectURL(blob);
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      console.error("PDF error:", err);
      setError(err?.response?.data?.message || err?.message || "PDF failed.");
    }
  };

  // Reorder (kept as “order-only” action)
  const handleReorder = async (order: SchoolOrder) => {
    if (!order?.id) return;
    setError(null);
    setInfo(null);
    setReorderingId(order.id);

    try {
      let res: any;
      try {
        res = await api.post(`/api/school-orders/${order.id}/reorder`);
      } catch (e: any) {
        if (e?.response?.status === 404) res = await api.post(`/api/school-orders/${order.id}/duplicate`);
        else throw e;
      }

      const msg =
        res?.data?.message ||
        (res?.data?.order?.id ? `Reordered. New Order #${res.data.order.id}` : "Reordered.");
      setInfo(msg);

      await fetchOrders();

      const newOrder = res?.data?.order as SchoolOrder | undefined;
      if (newOrder?.id) handleOpenView(newOrder);
    } catch (err: any) {
      console.error("reorder error:", err);
      setError(err?.response?.data?.message || "Reorder failed.");
    } finally {
      setReorderingId(null);
    }
  };

  const handleOpenView = (order: SchoolOrder) => {
    setViewOrder(order);

    setMetaTransportId(order.transport_id ? String(order.transport_id) : "");
    setMetaTransportThrough(order.transport_through || "");

    setMetaTransportId2(order.transport_id_2 ? String(order.transport_id_2) : "");
    setMetaTransportThrough2(order.transport_through_2 || "");

    setMetaNotes(order.notes || "");
    setBaseOrderNoDraft(order.order_no || "");
  };

  const handleMetaSave = async () => {
    if (!viewOrder) return;
    setError(null);
    setInfo(null);
    setMetaSaving(true);

    try {
      const payload = {
        transport_id: metaTransportId ? Number(metaTransportId) : null,
        transport_through: metaTransportThrough.trim() ? metaTransportThrough.trim() : null,

        transport_id_2: metaTransportId2 ? Number(metaTransportId2) : null,
        transport_through_2: metaTransportThrough2.trim() ? metaTransportThrough2.trim() : null,

        notes: metaNotes.trim() ? metaNotes.trim() : null,
      };

      const res = await api.patch(`/api/school-orders/${viewOrder.id}/meta`, payload);
      const updatedOrder: SchoolOrder = res.data.order;

      setViewOrder(updatedOrder);
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

      setMetaTransportId(updatedOrder.transport_id ? String(updatedOrder.transport_id) : "");
      setMetaTransportThrough(updatedOrder.transport_through || "");

      setMetaTransportId2(updatedOrder.transport_id_2 ? String(updatedOrder.transport_id_2) : "");
      setMetaTransportThrough2(updatedOrder.transport_through_2 || "");

      setMetaNotes(updatedOrder.notes || "");

      setInfo(res.data?.message || "Meta saved.");
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Meta save failed.");
    } finally {
      setMetaSaving(false);
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
      const res = await api.patch(`/api/school-orders/${viewOrder.id}/order-no`, { order_no: newNo });
      setInfo(res?.data?.message || "Order no updated.");

      setViewOrder((prev) => (prev ? { ...prev, order_no: newNo } : prev));
      setOrders((prev) => prev.map((o) => (o.id === viewOrder.id ? { ...o, order_no: newNo } : o)));
      setOrderNoDrafts((prev) => ({ ...prev, [viewOrder.id]: newNo }));
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Order no update failed.");
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

      setInfo("Order no updated.");

      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, order_no: newNo } : o)));
      setViewOrder((prev) => (prev?.id === orderId ? { ...prev, order_no: newNo } : prev));
      if (viewOrder?.id === orderId) setBaseOrderNoDraft(newNo);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Order no update failed.");
    } finally {
      setSavingOrderNoId(null);
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

  const aggregate = useMemo(() => {
    let orderedTotal = 0;
    let receivedTotal = 0;
    let pendingTotalLocal = 0;

    visibleOrders.forEach((o) => {
      const items = getOrderItems(o);
      const ord = totalQtyFromItems(items);
      const rec = totalReceivedFromItems(items);
      const re = totalReorderedFromItems(items);

      orderedTotal += ord;
      receivedTotal += rec;

      pendingTotalLocal += isClosedishStatus(o.status) ? 0 : Math.max(ord - rec - re, 0);
    });

    return { orderedTotal, receivedTotal, pendingTotal: Math.max(pendingTotalLocal, 0) };
  }, [visibleOrders]);

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
  };

  const schoolGroups: { schoolId: number; school: School | undefined; rows: SupplierRow[] }[] = useMemo(() => {
    const map = new Map<number, { school: School | undefined; rows: SupplierRow[] }>();

    visibleOrders.forEach((order) => {
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
      };

      const existing = map.get(schoolId);
      if (!existing) map.set(schoolId, { school, rows: [row] });
      else existing.rows.push(row);
    });

    return Array.from(map.entries()).map(([schoolId, value]) => ({
      schoolId,
      school: value.school,
      rows: value.rows.sort((a, b) => a.supplierName.localeCompare(b.supplierName)),
    }));
  }, [visibleOrders]);

  /* ---------- UI ---------- */

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-xs">
              <ChevronLeft className="w-4 h-4" />
              Back
            </Link>

            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">School → Supplier Orders</div>
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
        <div className="px-3 pb-2">
          <form onSubmit={handleGenerate} className="flex flex-wrap items-center gap-2 text-[11px]">
            <select
              value={filterSession}
              onChange={(e) => setFilterSession(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[120px]"
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
              className="border border-slate-300 rounded-xl px-2 py-1 bg-white min-w-[180px]"
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
              className="border border-slate-300 rounded-lg px-2 py-1 bg-white"
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

            <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

            <select
              value={academicSession}
              onChange={(e) => setAcademicSession(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white text-[12px] min-w-[120px]"
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-white
                         bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600
                         hover:brightness-110 active:brightness-95
                         shadow-sm hover:shadow
                         focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2
                         disabled:opacity-60 disabled:shadow-none"
              title="Generate"
            >
              {generating ? (
                <>
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>

            <button
              type="button"
              onClick={fetchOrders}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold
                         text-emerald-800 border border-emerald-200
                         bg-gradient-to-r from-emerald-50 to-cyan-50
                         hover:from-emerald-100 hover:to-cyan-100
                         shadow-sm hover:shadow
                         focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2
                         disabled:opacity-60 disabled:shadow-none"
              title="Refresh"
            >
              <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-600">
              <span title="Orders">{visibleOrders.length} orders</span>
              <span title="Ordered">O:{orderedTotal}</span>
              <span title="Received">R:{receivedTotal}</span>
              <span title="Pending">P:{pendingTotal}</span>
            </div>
          </form>

          {(error || info) && (
            <div className="mt-2">
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
          <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold">Orders</span>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          ) : schoolGroups.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No orders.</div>
          ) : (
            <div className="space-y-2 p-2 max-h-[68vh] overflow-auto">
              {schoolGroups.map((group) => (
                <div key={group.schoolId} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      {group.school?.name || "Unknown"}
                      {group.school?.city ? (
                        <span className="text-xs text-slate-500 font-normal"> ({group.school.city})</span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-slate-500">{group.rows.length} orders</div>
                  </div>

                  <div className="overflow-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">
                            Supplier
                          </th>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">
                            Order No (Edit)
                          </th>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">
                            Date
                          </th>
                          <th className="border-b border-slate-200 px-2 py-2 text-right font-semibold text-slate-700">
                            O
                          </th>
                          <th className="border-b border-slate-200 px-2 py-2 text-right font-semibold text-slate-700">
                            R
                          </th>
                          <th className="border-b border-slate-200 px-2 py-2 text-right font-semibold text-slate-700">
                            P
                          </th>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">
                            Status
                          </th>
                          <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">
                            Actions
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {group.rows.map((row) => {
                          const { order } = row;
                          const isSending = sendingOrderId === order.id;
                          const isReordering = reorderingId === order.id;

                          const statusClass = statusChipClass(order.status);

                          const draft = orderNoDrafts[order.id] ?? order.order_no ?? "";
                          const savingThis = savingOrderNoId === order.id;

                          return (
                            <tr key={row.key} className="hover:bg-slate-50">
                              <td className="border-b border-slate-200 px-2 py-2 font-medium">{row.supplierName}</td>

                              <td className="border-b border-slate-200 px-2 py-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={draft}
                                    onChange={(e) =>
                                      setOrderNoDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                                    }
                                    className="w-40 border border-slate-300 rounded-lg px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    placeholder={`#${order.id}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveOrderNoFromListing(order.id)}
                                    disabled={savingThis}
                                    className="text-[12px] px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                                  >
                                    {savingThis ? "Saving..." : "Save"}
                                  </button>
                                </div>
                              </td>

                              <td className="border-b border-slate-200 px-2 py-2 text-slate-600">
                                {formatDate(order.order_date || order.createdAt)}
                              </td>

                              <td className="border-b border-slate-200 px-2 py-2 text-right">{row.orderedTotal}</td>
                              <td className="border-b border-slate-200 px-2 py-2 text-right">{row.receivedTotal}</td>
                              <td className="border-b border-slate-200 px-2 py-2 text-right">{row.pendingTotal}</td>

                              <td className="border-b border-slate-200 px-2 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[11px] ${statusClass}`}>
                                  {statusLabel(order.status)}
                                </span>
                              </td>

                              <td className="border-b border-slate-200 px-2 py-2">
                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenView(order)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                                  >
                                    <Eye className="w-3 h-3" />
                                    View
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleReorder(order)}
                                    disabled={isReordering}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-60 text-[11px]"
                                    title="Create a fresh order copied from this one"
                                  >
                                    <Repeat className={`w-3 h-3 ${isReordering ? "animate-spin" : ""}`} />
                                    {isReordering ? "..." : "Reorder"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleSendEmail(order)}
                                    disabled={isSending}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 text-[11px]"
                                  >
                                    <Send className="w-3 h-3" />
                                    {isSending ? "..." : "Email"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleViewPdf(order)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px]"
                                  >
                                    <FileText className="w-3 h-3" />
                                    PDF
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
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modal (Order-only view + meta edit) */}
      {viewOrder && (
        <div className="fixed inset-0 z-40 bg-black/50">
          <div className="h-full w-full overflow-auto p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[1200px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                <div className="px-3 py-2 border-b bg-gradient-to-r from-slate-50 to-indigo-50">
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
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                              <Package className="w-5 h-5" />
                            </div>

                            <div className="min-w-0">
                              <div className="text-[15px] font-semibold truncate">
                                {school?.name || "School"}{" "}
                                <span className="text-xs text-slate-500 font-normal">
                                  ({viewOrder.academic_session || "-"})
                                </span>
                              </div>

                              <div className="text-xs text-slate-700 truncate mt-0.5">
                                Supplier: <span className="font-semibold text-slate-900">{supplierName}</span>
                              </div>

                              <div className="mt-1 text-[12px] text-slate-700 flex flex-wrap items-center gap-2">
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
                                  className={`px-2 py-0.5 rounded-full text-[11px] ${statusChipClass(viewOrder.status)}`}
                                >
                                  {statusLabel(viewOrder.status)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleReorder(viewOrder)}
                              disabled={reorderingId === viewOrder.id}
                              className="text-[12px] px-3 py-2 rounded-xl border border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100 flex items-center gap-2 disabled:opacity-60"
                            >
                              <Repeat className={`w-4 h-4 ${reorderingId === viewOrder.id ? "animate-spin" : ""}`} />
                              {reorderingId === viewOrder.id ? "Reordering..." : "Reorder"}
                            </button>

                            <button
                              onClick={() => handleViewPdf(viewOrder)}
                              className="text-[12px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-2"
                            >
                              <FileText className="w-4 h-4" /> PDF
                            </button>

                            <button
                              onClick={() => handleSendEmail(viewOrder)}
                              disabled={sendingOrderId === viewOrder.id}
                              className="text-[12px] px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 flex items-center gap-2 disabled:opacity-60"
                            >
                              <Send className="w-4 h-4" />{" "}
                              {sendingOrderId === viewOrder.id ? "Sending..." : "Email"}
                            </button>

                            <button
                              onClick={() => setViewOrder(null)}
                              className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                              title="Close"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-12 lg:col-span-4">
                            <label className="block text-[11px] text-slate-600 mb-1">Order No</label>
                            <div className="flex items-center gap-2">
                              <input
                                value={baseOrderNoDraft}
                                onChange={(e) => setBaseOrderNoDraft(e.target.value)}
                                className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              />
                              <button
                                type="button"
                                onClick={handleSaveBaseOrderNo}
                                disabled={savingBaseOrderNo}
                                className="text-[12px] px-4 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                              >
                                {savingBaseOrderNo ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>

                          <div className="col-span-12 md:col-span-6 lg:col-span-4">
                            <label className="block text-[11px] text-slate-600 mb-1">Transport (Option 1)</label>
                            <select
                              value={metaTransportId}
                              onChange={(e) => setMetaTransportId(e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                              <option value="">-- Select --</option>
                              {transports.map((t) => (
                                <option key={t.id} value={String(t.id)}>
                                  {t.name}
                                  {t.city ? ` (${t.city})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-span-12 md:col-span-6 lg:col-span-4">
                            <label className="block text-[11px] text-slate-600 mb-1">Through (Option 1)</label>
                            <input
                              value={metaTransportThrough}
                              onChange={(e) => setMetaTransportThrough(e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="DTDC / By Bus..."
                            />
                          </div>

                          <div className="col-span-12 md:col-span-6 lg:col-span-4">
                            <label className="block text-[11px] text-slate-600 mb-1">Transport (Option 2)</label>
                            <select
                              value={metaTransportId2}
                              onChange={(e) => setMetaTransportId2(e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                              <option value="">-- Select --</option>
                              {transports.map((t) => (
                                <option key={t.id} value={String(t.id)}>
                                  {t.name}
                                  {t.city ? ` (${t.city})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-span-12 md:col-span-6 lg:col-span-4">
                            <label className="block text-[11px] text-slate-600 mb-1">Through (Option 2)</label>
                            <input
                              value={metaTransportThrough2}
                              onChange={(e) => setMetaTransportThrough2(e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="Optional..."
                            />
                          </div>

                          <div className="col-span-12 lg:col-span-4">
                            <label className="block text-[11px] text-slate-600 mb-1">Notes (prints in PDF footer)</label>
                            <div className="flex items-center gap-2">
                              <input
                                value={metaNotes}
                                onChange={(e) => setMetaNotes(e.target.value)}
                                className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                placeholder="Notes..."
                              />
                              <button
                                type="button"
                                onClick={handleMetaSave}
                                disabled={metaSaving}
                                className="text-[12px] px-4 py-1.5 rounded-xl text-white font-semibold
                                           bg-gradient-to-r from-indigo-600 to-blue-600
                                           hover:brightness-110 active:brightness-95
                                           disabled:opacity-60"
                              >
                                {metaSaving ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="p-2 overflow-auto text-xs flex-1 bg-white">
                  {(() => {
                    const items = getOrderItems(viewOrder);
                    if (!items?.length) return <div className="p-4 text-slate-500">No items.</div>;

                    const closedish = isClosedishStatus(viewOrder.status);

                    return (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-xs border-collapse">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="border-b border-slate-200 px-2 py-1.5 text-left">Book</th>
                              <th className="border-b border-slate-200 px-2 py-1.5 text-right w-16">O</th>
                              <th className="border-b border-slate-200 px-2 py-1.5 text-right w-16">R</th>
                              <th className="border-b border-slate-200 px-2 py-1.5 text-right w-16">P</th>
                              <th className="border-b border-slate-200 px-2 py-1.5 text-left w-40">Class / Subject</th>
                              <th className="border-b border-slate-200 px-2 py-1.5 text-left w-32">Code</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it) => {
                              const ordered = Number(it.total_order_qty) || 0;
                              const received = Number(it.received_qty) || 0;
                              const reordered = Number(it.reordered_qty) || 0;

                              const pending =
                                closedish
                                  ? 0
                                  : it.pending_qty != null
                                  ? Math.max(Number(it.pending_qty) || 0, 0)
                                  : Math.max(ordered - received - reordered, 0);

                              return (
                                <tr key={it.id} className="hover:bg-slate-50">
                                  <td className="border-b border-slate-200 px-2 py-1.5">
                                    <div className="font-medium text-slate-900">
                                      {it.book?.title || `Book #${it.book_id}`}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {it.book?.publisher?.name ? `Publisher: ${it.book.publisher.name}` : ""}
                                    </div>
                                  </td>
                                  <td className="border-b border-slate-200 px-2 py-1.5 text-right">{ordered}</td>
                                  <td className="border-b border-slate-200 px-2 py-1.5 text-right">{received}</td>
                                  <td className="border-b border-slate-200 px-2 py-1.5 text-right">{pending}</td>
                                  <td className="border-b border-slate-200 px-2 py-1.5">
                                    {(it.book?.class_name || "-") + " / " + (it.book?.subject || "-")}
                                  </td>
                                  <td className="border-b border-slate-200 px-2 py-1.5">{it.book?.code || "-"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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
    </div>
  );
};

export default SchoolOrdersPageClient;
