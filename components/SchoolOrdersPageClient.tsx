"use client";

import React, { useEffect, useState } from "react";
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
  Sparkles,
  FileText,
} from "lucide-react";

/* ---------- Types ---------- */

type PublisherLite = {
  id: number;
  name: string;
};

type TransportLite = {
  id: number;
  name: string;
  city?: string | null;
  phone?: string | null;
};

type School = {
  id: number;
  name: string;
  city?: string | null;
};

type SchoolOrderItem = {
  id: number;
  book_id: number;
  total_order_qty: number | string;
  received_qty: number | string;
  pending_qty?: number | string | null;
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
  school?: School;
  School?: School;
  order_no: string;
  academic_session?: string | null;
  order_date?: string | null;
  createdAt?: string;
  status: string;
  items?: SchoolOrderItem[];
  SchoolOrderItems?: SchoolOrderItem[];

  // 🔹 transport + extra fields
  transport_id?: number | null;
  transport_through?: string | null;
  notes?: string | null;
  transport?: TransportLite | null;
};

/* ---------- Session Options ---------- */

const SESSION_OPTIONS = (() => {
  const base = 2025; // 2025-26
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
  if (payload && Array.isArray(payload.data))
    return payload.data as TransportLite[];
  return [];
};

const getOrderSchool = (order: SchoolOrder | any): School | undefined => {
  return (order && (order.school || order.School)) || undefined;
};

const getOrderItems = (order: SchoolOrder | any): SchoolOrderItem[] => {
  if (!order) return [];
  if (Array.isArray(order.items)) return order.items as SchoolOrderItem[];
  if (Array.isArray(order.SchoolOrderItems))
    return order.SchoolOrderItems as SchoolOrderItem[];
  return [];
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const totalQtyFromItems = (items: SchoolOrderItem[]) => {
  if (!items || !items.length) return 0;
  return items.reduce(
    (sum, item) => sum + (Number(item.total_order_qty) || 0),
    0
  );
};

const totalReceivedFromItems = (items: SchoolOrderItem[]) => {
  if (!items || !items.length) return 0;
  return items.reduce(
    (sum, item) => sum + (Number(item.received_qty) || 0),
    0
  );
};

const statusLabel = (status: string | undefined) => {
  switch (status) {
    case "completed":
      return "Collected";
    case "partial_received":
      return "Partial Collected";
    case "cancelled":
      return "Cancelled";
    case "sent":
      return "Ordered / Sent";
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
    case "sent":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "draft":
    default:
      return "bg-slate-50 text-slate-600 border border-slate-200";
  }
};

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

  const [academicSession, setAcademicSession] = useState("2025-26");
  const [filterSession, setFilterSession] = useState("");
  const [filterSchoolId, setFilterSchoolId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [viewOrder, setViewOrder] = useState<SchoolOrder | null>(null);
  const [isReceiving, setIsReceiving] = useState(false);
  const [savingReceive, setSavingReceive] = useState(false);
  const [receiveForm, setReceiveForm] = useState<Record<number, string>>({});

  // 🔹 new meta-edit state
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaTransportId, setMetaTransportId] = useState<string>("");
  const [metaTransportThrough, setMetaTransportThrough] = useState<string>("");
  const [metaNotes, setMetaNotes] = useState<string>("");

  /* ---------- Data fetching ---------- */

  const fetchSchools = async () => {
    try {
      const res = await api.get("/api/schools");
      const list = normalizeSchools(res.data);
      setSchools(list);
    } catch (err) {
      console.error("Error loading schools:", err);
    }
  };

  const fetchTransports = async () => {
    try {
      const res = await api.get("/api/transports");
      const list = normalizeTransports(res.data);
      setTransports(list);
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
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Failed to load school orders. Please try again."
      );
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
      setError("Please select academic session.");
      return;
    }

    try {
      setGenerating(true);

      const res = await api.post("/api/school-orders/generate", {
        academic_session: academicSession.trim(),
      });

      setInfo(
        res?.data?.message ||
          "School orders generated successfully from requirements."
      );

      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message || "Failed to generate school orders."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleSendEmail = async (order: SchoolOrder) => {
    if (!order.id) {
      setError("Order ID is missing for this order.");
      return;
    }

    setError(null);
    setInfo(null);
    setSendingOrderId(order.id);

    try {
      const res = await api.post(`/api/school-orders/${order.id}/send-email`);

      setInfo(
        res?.data?.message ||
          `Email sent successfully to school (Order: ${order.order_no}).`
      );

      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Failed to send order email. Please check SMTP / school email."
      );
    } finally {
      setSendingOrderId(null);
    }
  };

  // ✅ View / Download PDF (full OR publisher-wise)
  const handleViewPdf = async (order: SchoolOrder, publisherId?: number) => {
    if (!order.id) return;
    setError(null);
    setInfo(null);

    try {
      const path = publisherId
        ? `/api/school-orders/${order.id}/pdf?publisher_id=${publisherId}`
        : `/api/school-orders/${order.id}/pdf`;

      const res = await api.get(path, {
        responseType: "blob",
      });

      const contentType = res.headers?.["content-type"] || "";
      if (!contentType.includes("application/pdf")) {
        try {
          const blob = res.data as Blob;
          const text = await blob.text();
          throw new Error(text || "Server did not return a PDF file.");
        } catch {
          throw new Error("Server did not return a PDF file.");
        }
      }

      const blob = new Blob([res.data], { type: "application/pdf" });
      const pdfUrl = window.URL.createObjectURL(blob);
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      console.error("Error downloading PDF:", err);

      let msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to generate / download order PDF.";

      try {
        if (err?.response?.data instanceof Blob) {
          const text = await (err.response.data as Blob).text();
          if (text && text.startsWith("{")) {
            const parsed = JSON.parse(text);
            msg = parsed.message || msg;
          } else if (text) {
            msg = text;
          }
        }
      } catch {
        // ignore
      }

      setError(msg);
    }
  };

  // 🔍 Open modal & prepare receive + meta form
  const handleOpenView = (order: SchoolOrder) => {
    setViewOrder(order);
    setIsReceiving(false);
    setSavingReceive(false);

    const items = getOrderItems(order);
    const initial: Record<number, string> = {};
    items.forEach((it) => {
      initial[it.id] = String(it.received_qty ?? 0);
    });
    setReceiveForm(initial);

    // pre-fill meta form
    setMetaTransportId(order.transport_id ? String(order.transport_id) : "");
    setMetaTransportThrough(order.transport_through || "");
    setMetaNotes(order.notes || "");
  };

  const startReceiving = () => {
    if (!viewOrder) return;
    const items = getOrderItems(viewOrder);
    const initial: Record<number, string> = {};
    items.forEach((it) => {
      initial[it.id] = String(it.received_qty ?? 0);
    });
    setReceiveForm(initial);
    setIsReceiving(true);
  };

  const handleReceiveChange = (itemId: number, value: string) => {
    setReceiveForm((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const handleReceiveSave = async () => {
    if (!viewOrder) return;
    setError(null);
    setInfo(null);
    setSavingReceive(true);

    try {
      const items = getOrderItems(viewOrder);
      const itemsPayload =
        items.map((it) => {
          const raw = receiveForm[it.id];
          let num = Number(raw ?? it.received_qty ?? 0);
          if (isNaN(num) || num < 0) num = 0;
          const ordered = Number(it.total_order_qty) || 0;
          if (num > ordered) num = ordered;
          return {
            item_id: it.id,
            received_qty: num,
          };
        }) || [];

      const res = await api.post(
        `/api/school-orders/${viewOrder.id}/receive`,
        {
          status: "auto",
          items: itemsPayload,
        }
      );

      setInfo(res.data?.message || "Order items updated successfully.");
      const updatedOrder: SchoolOrder = res.data.order;

      setViewOrder(updatedOrder);
      setIsReceiving(false);

      // also align meta form with updated order (if backend changed anything)
      setMetaTransportId(
        updatedOrder.transport_id ? String(updatedOrder.transport_id) : ""
      );
      setMetaTransportThrough(updatedOrder.transport_through || "");
      setMetaNotes(updatedOrder.notes || "");

      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Failed to update received quantities."
      );
    } finally {
      setSavingReceive(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!viewOrder) return;
    setError(null);
    setInfo(null);
    setSavingReceive(true);

    try {
      const items = getOrderItems(viewOrder);
      const itemsPayload =
        items.map((it) => ({
          item_id: it.id,
          received_qty: it.received_qty ?? 0,
        })) || [];

      const res = await api.post(
        `/api/school-orders/${viewOrder.id}/receive`,
        {
          status: "cancelled",
          items: itemsPayload,
        }
      );

      setInfo(res.data?.message || "Order marked as cancelled.");
      const updatedOrder: SchoolOrder = res.data.order;
      setViewOrder(updatedOrder);
      setIsReceiving(false);

      // keep meta fields in sync
      setMetaTransportId(
        updatedOrder.transport_id ? String(updatedOrder.transport_id) : ""
      );
      setMetaTransportThrough(updatedOrder.transport_through || "");
      setMetaNotes(updatedOrder.notes || "");

      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message || "Failed to cancel school order."
      );
    } finally {
      setSavingReceive(false);
    }
  };

  // 🔹 Save Transport + Notes
  const handleMetaSave = async () => {
    if (!viewOrder) return;
    setError(null);
    setInfo(null);
    setMetaSaving(true);

    try {
      const payload = {
        transport_id: metaTransportId ? Number(metaTransportId) : null,
        transport_through:
          metaTransportThrough.trim() !== ""
            ? metaTransportThrough.trim()
            : null,
        notes: metaNotes.trim() !== "" ? metaNotes.trim() : null,
      };

      const res = await api.patch(
        `/api/school-orders/${viewOrder.id}/meta`,
        payload
      );

      const updatedOrder: SchoolOrder = res.data.order;

      setViewOrder(updatedOrder);
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
      );

      setMetaTransportId(
        updatedOrder.transport_id ? String(updatedOrder.transport_id) : ""
      );
      setMetaTransportThrough(updatedOrder.transport_through || "");
      setMetaNotes(updatedOrder.notes || "");

      setInfo(
        res.data?.message || "Order transport & notes updated successfully."
      );
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Failed to update transport / notes for this order."
      );
    } finally {
      setMetaSaving(false);
    }
  };

  /* ---------- Filters ---------- */

  const visibleOrders: SchoolOrder[] = orders.filter((o) => {
    let ok = true;

    if (filterSession && o.academic_session) {
      ok = ok && o.academic_session === filterSession;
    } else if (filterSession && !o.academic_session) {
      ok = false;
    }

    if (filterSchoolId) {
      ok = ok && String(o.school_id) === filterSchoolId;
    }

    if (filterStatus) {
      const items = getOrderItems(o);
      if (filterStatus === "not_received") {
        const rec = totalReceivedFromItems(items);
        ok = ok && rec === 0 && o.status !== "cancelled";
      } else {
        ok = ok && o.status === filterStatus;
      }
    }

    return ok;
  });

  const aggregate = (() => {
    let orderedTotal = 0;
    let receivedTotal = 0;

    visibleOrders.forEach((o) => {
      const items = getOrderItems(o);
      orderedTotal += totalQtyFromItems(items);
      receivedTotal += totalReceivedFromItems(items);
    });

    const pendingTotal = Math.max(orderedTotal - receivedTotal, 0);

    return { orderedTotal, receivedTotal, pendingTotal };
  })();

  const { orderedTotal, receivedTotal, pendingTotal } = aggregate;

  /* ---------- UI ---------- */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-200/50 shadow-lg">
        <div className="font-bold flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back to Dashboard</span>
          </Link>
        </div>

        <div className="font-bold flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
            <Package className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg sm:text-xl tracking-tight flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span>School Orders</span>
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Generate, Email, Receive & Track – School-wise
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-slate-800">
              {user?.name || "User"}
            </span>
            {user?.role && (
              <span className="mt-0.5 text-xs rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-2.5 py-1 border border-indigo-200 text-indigo-700 font-medium">
                {user.role}
              </span>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 p-6 lg:p-8 space-y-6">
        {/* Generate Block */}
        <section className="flex justify-end">
          <form
            onSubmit={handleGenerate}
            className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg px-5 py-4 flex flex-col sm:flex-row sm:items-end gap-4 min-w-[260px]"
          >
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Academic Session
              </label>
              <select
                value={academicSession}
                onChange={(e) => setAcademicSession(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {SESSION_OPTIONS.map((session) => (
                  <option key={session} value={session}>
                    {session}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Generates school-wise orders from confirmed requirements.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                type="submit"
                disabled={generating}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" />
                    Generate Orders
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={fetchOrders}
                disabled={loading}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>
          </form>
        </section>

        {/* Alerts */}
        {(error || info) && (
          <div className="space-y-3">
            {error && (
              <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 shadow-sm text-xs text-red-700 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                  !
                </div>
                <span>{error}</span>
              </div>
            )}
            {info && (
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-3 shadow-sm text-xs text-emerald-700 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  ✓
                </div>
                <span>{info}</span>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <section className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg p-4 flex flex-wrap items-center gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Filter by Session
            </label>
            <select
              value={filterSession}
              onChange={(e) => setFilterSession(e.target.value)}
              className="border border-slate-300 rounded-full px-3 py-1.5 bg-white min-w-[140px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All sessions</option>
              {SESSION_OPTIONS.map((session) => (
                <option key={session} value={session}>
                  {session}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Filter by School
            </label>
            <select
              value={filterSchoolId}
              onChange={(e) => setFilterSchoolId(e.target.value)}
              className="border border-slate-300 rounded-full px-3 py-1.5 bg-white min-w-[200px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All schools</option>
              {Array.isArray(schools) &&
                schools.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                    {s.city ? ` (${s.city})` : ""}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Filter by Status / Receive
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 rounded-full px-3 py-1.5 bg-white min-w-[220px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All statuses</option>
              <option value="not_received">Not Received (0 received)</option>
              <option value="draft">Draft</option>
              <option value="sent">Ordered / Sent</option>
              <option value="partial_received">Partial Collected</option>
              <option value="completed">Collected (Fully)</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Small legend */}
          <div className="ml-auto flex flex-wrap gap-2 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-300" />
              Sent
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-300" />
              Partial
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
              Completed
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-300" />
              Cancelled
            </span>
          </div>
        </section>

        {/* Orders List */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200/60 p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-base font-semibold flex items-center gap-2 text-slate-800">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <span>Existing School Orders</span>
            </h2>
            <span className="text-xs text-slate-500">
              Total Orders: {visibleOrders.length}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading orders...
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="text-sm text-slate-500 py-10 text-center">
              No school orders found. Adjust filters or generate new orders.
            </div>
          ) : (
            <div className="overflow-auto max-h-[420px] rounded-xl border border-slate-200/80 shadow-inner">
              <table className="w-full text-xs border-collapse bg-white">
                <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-10">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Order No
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      School
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Session
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Order Date
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      No. of Books
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Total Qty
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Received
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Status
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((order) => {
                    const isSending = sendingOrderId === order.id;
                    const isSent = order.status === "sent";
                    const school = getOrderSchool(order);
                    const items = getOrderItems(order);

                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-800">
                          {order.order_no}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-700">
                          {school?.name || "-"}
                          {school?.city ? ` (${school.city})` : ""}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-600">
                          {order.academic_session || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-600">
                          {formatDate(order.order_date || order.createdAt)}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right text-slate-700">
                          {items.length}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right text-slate-700">
                          {totalQtyFromItems(items)}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right text-slate-700">
                          {totalReceivedFromItems(items)}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${statusChipClass(
                              order.status
                            )}`}
                          >
                            {statusLabel(order.status)}
                          </span>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenView(order)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
                            >
                              <Eye className="w-3 h-3" />
                              View / Receive
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSendEmail(order)}
                              disabled={isSending}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border ${
                                isSent
                                  ? "border-blue-300 text-blue-700 bg-blue-50"
                                  : "border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
                              } disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                              <Send className="w-3 h-3" />
                              {isSending
                                ? "Sending..."
                                : isSent
                                ? "Resend Email"
                                : "Send Email"}
                            </button>

                            {/* PDF Button per order (all publishers) */}
                            <button
                              type="button"
                              onClick={() => handleViewPdf(order)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border border-slate-300 text-slate-700 bg-white hover:bg-slate-100"
                            >
                              <FileText className="w-3 h-3" />
                              PDF (All)
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg px-4 py-4 flex flex-col">
            <span className="text-xs text-slate-500">
              Total Books Ordered (Qty)
            </span>
            <span className="mt-1 text-xl font-bold text-slate-900">
              {orderedTotal}
            </span>
            <span className="mt-1 text-xs text-slate-400">
              Across {visibleOrders.length} order(s)
            </span>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100 rounded-2xl shadow-lg px-4 py-4 flex flex-col">
            <span className="text-xs text-emerald-700">
              Total Books Received (Qty)
            </span>
            <span className="mt-1 text-xl font-bold text-emerald-800">
              {receivedTotal}
            </span>
            <span className="mt-1 text-xs text-emerald-600">
              Updated from receive entries
            </span>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl shadow-lg px-4 py-4 flex flex-col">
            <span className="text-xs text-amber-700">
              Pending to Receive (Qty)
            </span>
            <span className="mt-1 text-xl font-bold text-amber-800">
              {pendingTotal}
            </span>
            <span className="mt-1 text-xs text-amber-600">
              Ordered – Received (current filters)
            </span>
          </div>
        </section>
      </main>

      {/* View / Receive Modal */}
      {viewOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Modal header */}
            <div className="px-5 py-4 border-b flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 bg-gradient-to-r from-indigo-50 to-slate-50">
              {(() => {
                const school = getOrderSchool(viewOrder);
                const items = getOrderItems(viewOrder);

                // 🔹 Build unique publisher list for this order
                const publishersMap = new Map<number, PublisherLite>();
                items.forEach((it) => {
                  const p = it.book?.publisher;
                  const pid =
                    p?.id ??
                    (it.book?.publisher_id
                      ? Number(it.book.publisher_id)
                      : undefined);
                  if (!pid) return;
                  const name = p?.name || `Publisher #${pid}`;
                  if (!publishersMap.has(pid)) {
                    publishersMap.set(pid, { id: pid, name });
                  }
                });
                const publishers = Array.from(publishersMap.values());

                const transport = viewOrder.transport;

                return (
                  <>
                    {/* LEFT: Order + transport summary */}
                    <div className="space-y-1 flex-1">
                      <h3 className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-2">
                        <Package className="w-4 h-4 text-indigo-500" />
                        <span>Order Details – {viewOrder.order_no}</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        School:{" "}
                        <span className="font-medium">
                          {school?.name || "-"}
                          {school?.city ? ` (${school.city})` : ""}
                        </span>{" "}
                        · Session:{" "}
                        <span className="font-medium">
                          {viewOrder.academic_session || "-"}
                        </span>{" "}
                        · Date:{" "}
                        <span className="font-medium">
                          {formatDate(
                            viewOrder.order_date || viewOrder.createdAt
                          )}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Status:{" "}
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${statusChipClass(
                            viewOrder.status
                          )}`}
                        >
                          {statusLabel(viewOrder.status)}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Items:{" "}
                        <span className="font-semibold">
                          {items.length}
                        </span>
                      </p>
                      {publishers.length > 0 && (
                        <p className="text-[11px] text-slate-400">
                          Publishers in this order:{" "}
                          <span className="font-medium">
                            {publishers.map((p) => p.name).join(", ")}
                          </span>
                        </p>
                      )}

                      {/* 🔹 Current Transport & Notes summary */}
                      {(viewOrder.transport_through ||
                        viewOrder.notes ||
                        transport) && (
                        <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-500">
                          {(transport || viewOrder.transport_through) && (
                            <div>
                              <span className="font-medium text-slate-600">
                                Transport:
                              </span>
                              <div className="mt-0.5">
                                {transport?.name ? (
                                  <>
                                    <span className="font-semibold text-slate-800">
                                      {transport.name}
                                    </span>
                                    {transport.city && (
                                      <span className="text-slate-500">
                                        {" "}
                                        ({transport.city})
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="font-semibold text-slate-800">
                                    {viewOrder.transport_through || "-"}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {viewOrder.notes && (
                            <div>
                              <span className="font-medium text-slate-600">
                                Notes:
                              </span>
                              <div className="mt-0.5 text-slate-700 whitespace-pre-wrap">
                                {viewOrder.notes}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* RIGHT: PDF + meta form + actions */}
                    <div className="flex flex-col items-end gap-2 lg:w-[260px]">
                      {/* PDF buttons */}
                      <div className="flex flex-wrap gap-1 justify-end w-full">
                        <button
                          onClick={() => handleViewPdf(viewOrder)}
                          className="text-[11px] px-3 py-1 rounded-full border border-slate-300 bg-white hover:bg-slate-100 flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3" />
                          PDF (All)
                        </button>
                        {publishers.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handleViewPdf(viewOrder, p.id)}
                            className="text-[11px] px-3 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            {p.name}
                          </button>
                        ))}
                      </div>

                      {/* 🔹 NEW: Transport & Notes editor */}
                      <div className="w-full mt-1 p-2 border border-slate-200 rounded-xl bg-white/90 shadow-sm flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-700">
                            Transport & Notes
                          </span>
                          <button
                            type="button"
                            onClick={handleMetaSave}
                            disabled={metaSaving}
                            className="text-[10px] px-2 py-1 rounded-full bg-slate-900 text-white disabled:opacity-60"
                          >
                            {metaSaving ? "Saving..." : "Save"}
                          </button>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500">
                            Through (Transport)
                          </label>
                          <select
                            value={metaTransportId}
                            onChange={(e) =>
                              setMetaTransportId(e.target.value)
                            }
                            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="">-- Select Transport --</option>
                            {transports.map((t) => (
                              <option key={t.id} value={String(t.id)}>
                                {t.name}
                                {t.city ? ` (${t.city})` : ""}
                              </option>
                            ))}
                          </select>
                          <p className="text-[10px] text-slate-400">
                            Or enter manual text below.
                          </p>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500">
                            Through (Manual Text)
                          </label>
                          <input
                            type="text"
                            value={metaTransportThrough}
                            onChange={(e) =>
                              setMetaTransportThrough(e.target.value)
                            }
                            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., By Bus, By Hand, DTDC, etc."
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500">
                            Notes
                          </label>
                          <textarea
                            rows={2}
                            value={metaNotes}
                            onChange={(e) => setMetaNotes(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] resize-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Optional dispatch / packing notes..."
                          />
                        </div>
                      </div>

                      {/* Receive / Cancel buttons */}
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {viewOrder.status !== "cancelled" && (
                          <>
                            {!isReceiving && (
                              <button
                                onClick={startReceiving}
                                className="text-[11px] px-3 py-1 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              >
                                Receive Books
                              </button>
                            )}
                            {isReceiving && (
                              <>
                                <button
                                  onClick={handleReceiveSave}
                                  disabled={savingReceive}
                                  className="text-[11px] px-3 py-1 rounded-full border border-slate-900 bg-slate-900 text-white disabled:opacity-60"
                                >
                                  {savingReceive
                                    ? "Saving..."
                                    : "Save Receive"}
                                </button>
                                <button
                                  onClick={() => setIsReceiving(false)}
                                  disabled={savingReceive}
                                  className="text-[11px] px-3 py-1 rounded-full border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60"
                                >
                                  Cancel Edit
                                </button>
                              </>
                            )}
                            {!isReceiving && (
                              <button
                                onClick={handleCancelOrder}
                                disabled={savingReceive}
                                className="text-[11px] px-3 py-1 rounded-full border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                              >
                                Mark as Cancelled
                              </button>
                            )}
                          </>
                        )}

                        <button
                          onClick={() => {
                            setViewOrder(null);
                            setIsReceiving(false);
                          }}
                          className="text-[11px] px-3 py-1 rounded-full border border-slate-300 bg-white hover:bg-slate-100"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal body */}
            <div className="p-4 overflow-auto text-xs flex-1">
              {(() => {
                const items = getOrderItems(viewOrder);
                const school = getOrderSchool(viewOrder);

                if (!items || items.length === 0) {
                  return (
                    <div className="text-slate-500 py-6">
                      No items found for this order.
                    </div>
                  );
                }

                return (
                  <>
                    <div className="mb-3 text-xs text-slate-600 flex flex-wrap gap-3 justify-between">
                      <span>
                        Total Books:{" "}
                        <span className="font-semibold">{items.length}</span>
                      </span>
                      <span>
                        Total Quantity:{" "}
                        <span className="font-semibold">
                          {totalQtyFromItems(items)}
                        </span>
                      </span>
                      <span>
                        Total Received:{" "}
                        <span className="font-semibold">
                          {totalReceivedFromItems(items)}
                        </span>
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="border-b border-slate-200 px-2 py-1 text-left w-32">
                              School
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left w-32">
                              Publisher
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left">
                              Book
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left">
                              Class
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left">
                              Subject
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left">
                              Code / ISBN
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right">
                              Ordered
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right">
                              Received
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right">
                              Pending
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            type PublisherGroup = {
                              key: string;
                              publisherName: string;
                              items: SchoolOrderItem[];
                            };

                            const groupsMap = new Map<string, PublisherGroup>();

                            items.forEach((item) => {
                              const p = item.book?.publisher;
                              const pid =
                                p?.id ??
                                (item.book?.publisher_id
                                  ? Number(item.book.publisher_id)
                                  : 0);
                              const key = pid ? String(pid) : "no_publisher";
                              const publisherName =
                                p?.name ||
                                (pid
                                  ? `Publisher #${pid}`
                                  : "No Publisher / Misc");

                              if (!groupsMap.has(key)) {
                                groupsMap.set(key, {
                                  key,
                                  publisherName,
                                  items: [item],
                                });
                              } else {
                                groupsMap.get(key)!.items.push(item);
                              }
                            });

                            const groups = Array.from(groupsMap.values());

                            const totalRows = groups.reduce(
                              (sum, g) => sum + g.items.length,
                              0
                            );

                            let schoolCellRendered = false;

                            return groups.map((group) => (
                              <React.Fragment key={group.key}>
                                {group.items.map((item, idxInGroup) => {
                                  const ordered =
                                    Number(item.total_order_qty) || 0;
                                  const rawVal =
                                    receiveForm[item.id] ??
                                    String(item.received_qty ?? 0);
                                  const numericReceived =
                                    Number(rawVal) >= 0
                                      ? Number(rawVal)
                                      : 0;
                                  const effectiveReceived = isNaN(
                                    numericReceived
                                  )
                                    ? 0
                                    : Math.min(numericReceived, ordered);
                                  const backendReceived =
                                    Number(item.received_qty ?? 0) || 0;

                                  const displayReceived = isReceiving
                                    ? effectiveReceived
                                    : backendReceived;

                                  const pendingWhenNotEditing =
                                    item.pending_qty != null
                                      ? Math.max(
                                          Number(item.pending_qty) || 0,
                                          0
                                        )
                                      : Math.max(
                                          ordered - backendReceived,
                                          0
                                        );

                                  const pending = isReceiving
                                    ? Math.max(
                                        ordered - effectiveReceived,
                                        0
                                      )
                                    : pendingWhenNotEditing;

                                  const showSchoolCell = !schoolCellRendered;
                                  const showPublisherCell = idxInGroup === 0;

                                  if (showSchoolCell) {
                                    schoolCellRendered = true;
                                  }

                                  return (
                                    <tr
                                      key={item.id}
                                      className="hover:bg-slate-50 transition-colors"
                                    >
                                      {showSchoolCell && (
                                        <td
                                          rowSpan={totalRows}
                                          className="border-b border-slate-200 px-2 py-1 align-top text-[11px] font-semibold text-slate-800"
                                        >
                                          {school?.name || "-"}
                                          {school?.city && (
                                            <span className="block text-[10px] text-slate-500">
                                              {school.city}
                                            </span>
                                          )}
                                        </td>
                                      )}

                                      {showPublisherCell && (
                                        <td
                                          rowSpan={group.items.length}
                                          className="border-b border-slate-200 px-2 py-1 align-top text-[11px] font-medium text-indigo-700"
                                        >
                                          {group.publisherName}
                                        </td>
                                      )}

                                      <td className="border-b border-slate-200 px-2 py-1">
                                        {item.book?.title ||
                                          `Book #${item.book_id}`}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-1">
                                        {item.book?.class_name || "-"}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-1">
                                        {item.book?.subject || "-"}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-1">
                                        {item.book?.code ||
                                          item.book?.isbn ||
                                          "-"}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-1 text-right">
                                        {ordered}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-1 text-right">
                                        {isReceiving ? (
                                          <input
                                            type="number"
                                            min={0}
                                            max={ordered}
                                            value={rawVal}
                                            onChange={(e) =>
                                              handleReceiveChange(
                                                item.id,
                                                e.target.value
                                              )
                                            }
                                            className="w-20 border border-slate-300 rounded-lg px-1 py-0.5 text-right focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                          />
                                        ) : (
                                          displayReceived
                                        )}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-1 text-right">
                                        {pending}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};

export default SchoolOrdersPageClient;
