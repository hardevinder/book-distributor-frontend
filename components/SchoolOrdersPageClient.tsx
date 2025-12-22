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

  // ✅ commercial fields (optional from backend)
  unit_price?: number | string | null;
  discount_pct?: number | string | null;
  discount_amt?: number | string | null;
  net_unit_price?: number | string | null;
  line_amount?: number | string | null;

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

  // Option 1
  transport_id?: number | null;
  transport_through?: string | null;
  transport?: TransportLite | null;

  // Option 2
  transport_id_2?: number | null;
  transport_through_2?: string | null;
  transport2?: TransportLite | null;

  // Notes (highlighted in PDF footer)
  notes?: string | null;

  // ✅ order-level commercial fields
  freight_charges?: number | string | null;
  packing_charges?: number | string | null;
  other_charges?: number | string | null;
  overall_discount?: number | string | null;
  round_off?: number | string | null;
};

/* ---------- ✅ Supplier Ledger Types (UPDATED) ---------- */

type SupplierBalanceResponse = {
  supplier: SupplierLite;
  debit_total: number;
  credit_total: number;
  balance: number;
};

type SupplierLedgerTxn = {
  id: number;
  txn_date: string;
  txn_type: string;
  ref_table?: string | null;
  ref_id?: number | null;
  ref_no?: string | null;
  narration?: string | null;
  debit: number;
  credit: number;
  running_balance?: number;
};

type SupplierLedgerResponse = {
  supplier: SupplierLite;
  txns: SupplierLedgerTxn[];
  debit_total: number;
  credit_total: number;
  balance: number;
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
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const totalQtyFromItems = (items: SchoolOrderItem[]) =>
  (items || []).reduce((sum, it) => sum + (Number(it.total_order_qty) || 0), 0);

const totalReceivedFromItems = (items: SchoolOrderItem[]) =>
  (items || []).reduce((sum, it) => sum + (Number(it.received_qty) || 0), 0);

const statusLabel = (status: string | undefined) => {
  switch (status) {
    case "completed":
      return "Collected";
    case "partial_received":
      return "Partial";
    case "cancelled":
      return "Cancelled";
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
  const [isReceiving, setIsReceiving] = useState(false);
  const [savingReceive, setSavingReceive] = useState(false);

  // qty inputs
  const [receiveForm, setReceiveForm] = useState<Record<number, string>>({});

  // price/discount inputs per item
  type PriceDraft = { unit_price: string; discount_pct: string; discount_amt: string };
  const [priceForm, setPriceForm] = useState<Record<number, PriceDraft>>({});

  // order-level charges drafts
  const [chargesForm, setChargesForm] = useState<{
    freight_charges: string;
    packing_charges: string;
    other_charges: string;
    overall_discount: string;
    round_off: string;
  }>({
    freight_charges: "",
    packing_charges: "",
    other_charges: "",
    overall_discount: "",
    round_off: "",
  });

  const [metaSaving, setMetaSaving] = useState(false);

  // Option 1
  const [metaTransportId, setMetaTransportId] = useState<string>("");
  const [metaTransportThrough, setMetaTransportThrough] = useState<string>("");

  // Option 2
  const [metaTransportId2, setMetaTransportId2] = useState<string>("");
  const [metaTransportThrough2, setMetaTransportThrough2] = useState<string>("");

  // Notes
  const [metaNotes, setMetaNotes] = useState<string>("");

  // Modal base order no edit
  const [baseOrderNoDraft, setBaseOrderNoDraft] = useState<string>("");
  const [savingBaseOrderNo, setSavingBaseOrderNo] = useState(false);

  // Listing base order no edit
  const [orderNoDrafts, setOrderNoDrafts] = useState<Record<number, string>>({});
  const [savingOrderNoId, setSavingOrderNoId] = useState<number | null>(null);

  /* ---------- ✅ Supplier Balance & Ledger State (UPDATED) ---------- */

  const [supplierBalances, setSupplierBalances] = useState<
    Record<number, SupplierBalanceResponse | null>
  >({});
  const [supplierBalLoading, setSupplierBalLoading] = useState<Record<number, boolean>>({});

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const [ledgerSupplier, setLedgerSupplier] = useState<SupplierLite | null>(null);
  const [ledgerRows, setLedgerRows] = useState<SupplierLedgerTxn[]>([]);
  const [ledgerTotals, setLedgerTotals] = useState<{ debit: number; credit: number; balance: number } | null>(
    null
  );

  const [ledgerFrom, setLedgerFrom] = useState<string>("");
  const [ledgerTo, setLedgerTo] = useState<string>("");

  const num = (v: any) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };

  const clampNonNeg = (v: any) => Math.max(num(v), 0);

  const fmtMoney = (n: any) => {
    const v = Number.isFinite(Number(n)) ? Number(n) : 0;
    return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const balChip = (bal: number) => {
    if (bal > 0) return "bg-amber-50 text-amber-800 border border-amber-200";
    if (bal < 0) return "bg-emerald-50 text-emerald-800 border border-emerald-200";
    return "bg-slate-50 text-slate-700 border border-slate-200";
  };

  const fetchSupplierBalance = async (supplierId: number) => {
    if (!supplierId) return;
    if (supplierBalances[supplierId] !== undefined) return;

    setSupplierBalLoading((p) => ({ ...p, [supplierId]: true }));
    try {
      const res = await api.get(`/api/suppliers/${supplierId}/balance`);
      const data = res?.data as SupplierBalanceResponse;
      setSupplierBalances((p) => ({ ...p, [supplierId]: data }));
    } catch (e) {
      console.error("supplier balance fetch error:", e);
      setSupplierBalances((p) => ({ ...p, [supplierId]: null }));
    } finally {
      setSupplierBalLoading((p) => ({ ...p, [supplierId]: false }));
    }
  };

  const openLedger = async (supplier: SupplierLite) => {
    setLedgerOpen(true);
    setLedgerSupplier(supplier);
    setLedgerRows([]);
    setLedgerTotals(null);
    setLedgerError(null);

    setLedgerLoading(true);
    try {
      const params: any = {};
      if (ledgerFrom) params.from = ledgerFrom;
      if (ledgerTo) params.to = ledgerTo;
      params.limit = 300;

      const res = await api.get(`/api/suppliers/${supplier.id}/ledger`, { params });
      const data = res?.data as SupplierLedgerResponse;

      setLedgerRows(Array.isArray(data?.txns) ? data.txns : []);
      setLedgerTotals({
        debit: Number(data?.debit_total) || 0,
        credit: Number(data?.credit_total) || 0,
        balance: Number(data?.balance) || 0,
      });
    } catch (e: any) {
      console.error("supplier ledger fetch error:", e);
      setLedgerError(e?.response?.data?.error || "Failed to load ledger");
    } finally {
      setLedgerLoading(false);
    }
  };

  /* ---------- Commercial calc helpers ---------- */

  const computeItemNetRate = (unitPrice: number, discPct: number, discAmt: number) => {
    const up = clampNonNeg(unitPrice);
    const pct = clampNonNeg(discPct);
    const da = clampNonNeg(discAmt);

    const pctOff = (up * pct) / 100;
    const net = Math.max(up - pctOff - da, 0);
    return net;
  };

  const computeTotalsForModal = useMemo(() => {
    if (!viewOrder) return null;

    const items = getOrderItems(viewOrder);

    let qtyReceivedTotal = 0;
    let itemsGross = 0;
    let itemsDiscount = 0;
    let itemsNet = 0;

    items.forEach((it) => {
      const ordered = num(it.total_order_qty);
      const rawQty = receiveForm[it.id] ?? String(it.received_qty ?? 0);
      const qty = Math.min(Math.max(num(rawQty), 0), ordered);

      const draft = priceForm[it.id];
      const unitPrice = num(draft?.unit_price ?? it.unit_price ?? 0);
      const discPct = num(draft?.discount_pct ?? it.discount_pct ?? 0);
      const discAmt = num(draft?.discount_amt ?? it.discount_amt ?? 0);

      const gross = unitPrice * qty;
      const netRate = computeItemNetRate(unitPrice, discPct, discAmt);
      const net = netRate * qty;

      const disc = Math.max(gross - net, 0);

      qtyReceivedTotal += qty;
      itemsGross += gross;
      itemsDiscount += disc;
      itemsNet += net;
    });

    const freight = num(chargesForm.freight_charges ?? viewOrder.freight_charges ?? 0);
    const packing = num(chargesForm.packing_charges ?? viewOrder.packing_charges ?? 0);
    const other = num(chargesForm.other_charges ?? viewOrder.other_charges ?? 0);
    const overallDisc = num(chargesForm.overall_discount ?? viewOrder.overall_discount ?? 0);
    const roundOff = num(chargesForm.round_off ?? viewOrder.round_off ?? 0);

    const chargesTotal = clampNonNeg(freight) + clampNonNeg(packing) + clampNonNeg(other);
    const subTotal = itemsNet + chargesTotal;
    const grand = subTotal - clampNonNeg(overallDisc) + (Number.isFinite(roundOff) ? roundOff : 0);

    return {
      qtyReceivedTotal,
      itemsGross,
      itemsDiscount,
      itemsNet,
      chargesTotal,
      subTotal,
      overallDisc,
      roundOff,
      grand,
      freight,
      packing,
      other,
    };
  }, [viewOrder, receiveForm, priceForm, chargesForm]);

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
    if (!order.id) {
      setError("Order ID missing.");
      return;
    }

    setError(null);
    setInfo(null);
    setSendingOrderId(order.id);

    try {
      const path = `/api/school-orders/${order.id}/send-email`;
      const res = await api.post(path);
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
      const path = `/api/school-orders/${order.id}/pdf`;
      const res = await api.get(path, { responseType: "blob" });

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

  const handleOpenView = (order: SchoolOrder) => {
    setViewOrder(order);
    setIsReceiving(false);
    setSavingReceive(false);

    const items = getOrderItems(order);

    // qty init
    const initialQty: Record<number, string> = {};
    items.forEach((it) => (initialQty[it.id] = String(it.received_qty ?? 0)));
    setReceiveForm(initialQty);

    // price init
    const initialPrice: Record<number, PriceDraft> = {};
    items.forEach((it) => {
      initialPrice[it.id] = {
        unit_price: String(it.unit_price ?? ""),
        discount_pct: String(it.discount_pct ?? ""),
        discount_amt: String(it.discount_amt ?? ""),
      };
    });
    setPriceForm(initialPrice);

    // charges init
    setChargesForm({
      freight_charges: String(order.freight_charges ?? ""),
      packing_charges: String(order.packing_charges ?? ""),
      other_charges: String(order.other_charges ?? ""),
      overall_discount: String(order.overall_discount ?? ""),
      round_off: String(order.round_off ?? ""),
    });

    setMetaTransportId(order.transport_id ? String(order.transport_id) : "");
    setMetaTransportThrough(order.transport_through || "");

    setMetaTransportId2(order.transport_id_2 ? String(order.transport_id_2) : "");
    setMetaTransportThrough2(order.transport_through_2 || "");

    setMetaNotes(order.notes || "");
    setBaseOrderNoDraft(order.order_no || "");

    // ✅ supplier ledger (single supplier)
    if (order.supplier_id) fetchSupplierBalance(Number(order.supplier_id));
  };

  const startReceiving = () => {
    if (!viewOrder) return;
    const items = getOrderItems(viewOrder);

    const initialQty: Record<number, string> = {};
    items.forEach((it) => (initialQty[it.id] = String(it.received_qty ?? 0)));
    setReceiveForm(initialQty);

    const initialPrice: Record<number, PriceDraft> = {};
    items.forEach((it) => {
      initialPrice[it.id] = {
        unit_price: String(it.unit_price ?? ""),
        discount_pct: String(it.discount_pct ?? ""),
        discount_amt: String(it.discount_amt ?? ""),
      };
    });
    setPriceForm(initialPrice);

    setIsReceiving(true);
  };

  const handleReceiveChange = (itemId: number, value: string) => {
    setReceiveForm((prev) => ({ ...prev, [itemId]: value }));
  };

  // ✅ FIXED: no duplicate keys (unit_price etc)
  const handlePriceChange = (itemId: number, field: keyof PriceDraft, value: string) => {
    setPriceForm((prev) => {
      const cur = prev[itemId] ?? { unit_price: "", discount_pct: "", discount_amt: "" };

      return {
        ...prev,
        [itemId]: {
          ...cur,
          unit_price: cur.unit_price ?? "",
          discount_pct: cur.discount_pct ?? "",
          discount_amt: cur.discount_amt ?? "",
          [field]: value,
        },
      };
    });
  };

  const handleChargesChange = (field: keyof typeof chargesForm, value: string) => {
    setChargesForm((p) => ({ ...p, [field]: value }));
  };

  const handleReceiveSave = async () => {
    if (!viewOrder) return;
    setError(null);
    setInfo(null);
    setSavingReceive(true);

    try {
      const items = getOrderItems(viewOrder);

      const itemsPayload = items.map((it) => {
        const raw = receiveForm[it.id];
        let rcv = Number(raw ?? it.received_qty ?? 0);
        if (isNaN(rcv) || rcv < 0) rcv = 0;

        const ordered = Number(it.total_order_qty) || 0;
        if (rcv > ordered) rcv = ordered;

        const draft = priceForm[it.id] || { unit_price: "", discount_pct: "", discount_amt: "" };
        const unit_price = num(draft.unit_price ?? it.unit_price ?? 0);
        const discount_pct = num(draft.discount_pct ?? it.discount_pct ?? 0);
        const discount_amt = num(draft.discount_amt ?? it.discount_amt ?? 0);

        const net_unit_price = computeItemNetRate(unit_price, discount_pct, discount_amt);
        const line_amount = net_unit_price * rcv;

        return {
          item_id: it.id,
          received_qty: rcv,
          unit_price,
          discount_pct,
          discount_amt,
          net_unit_price,
          line_amount,
        };
      });

      const chargesPayload = {
        freight_charges: num(chargesForm.freight_charges ?? viewOrder.freight_charges ?? 0),
        packing_charges: num(chargesForm.packing_charges ?? viewOrder.packing_charges ?? 0),
        other_charges: num(chargesForm.other_charges ?? viewOrder.other_charges ?? 0),
        overall_discount: num(chargesForm.overall_discount ?? viewOrder.overall_discount ?? 0),
        round_off: num(chargesForm.round_off ?? viewOrder.round_off ?? 0),
      };

      const res = await api.post(`/api/school-orders/${viewOrder.id}/receive`, {
        status: "auto",
        items: itemsPayload,
        charges: chargesPayload,
      });

      setInfo(res.data?.message || "Saved.");
      const updatedOrder: SchoolOrder = res.data.order;

      setViewOrder(updatedOrder);
      setIsReceiving(false);

      setMetaTransportId(updatedOrder.transport_id ? String(updatedOrder.transport_id) : "");
      setMetaTransportThrough(updatedOrder.transport_through || "");

      setMetaTransportId2(updatedOrder.transport_id_2 ? String(updatedOrder.transport_id_2) : "");
      setMetaTransportThrough2(updatedOrder.transport_through_2 || "");

      setMetaNotes(updatedOrder.notes || "");
      setBaseOrderNoDraft(updatedOrder.order_no || baseOrderNoDraft);

      setOrderNoDrafts((prev) => ({
        ...prev,
        [updatedOrder.id]: updatedOrder.order_no || prev[updatedOrder.id] || "",
      }));

      // ✅ refresh supplier balance after receiving
      if (updatedOrder.supplier_id) {
        setSupplierBalances((p) => ({ ...p, [Number(updatedOrder.supplier_id)]: undefined as any }));
        fetchSupplierBalance(Number(updatedOrder.supplier_id));
      }

      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Receive save failed.");
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
      const itemsPayload = items.map((it) => ({
        item_id: it.id,
        received_qty: it.received_qty ?? 0,
      }));

      const res = await api.post(`/api/school-orders/${viewOrder.id}/receive`, {
        status: "cancelled",
        items: itemsPayload,
      });

      setInfo(res.data?.message || "Cancelled.");
      const updatedOrder: SchoolOrder = res.data.order;

      setViewOrder(updatedOrder);
      setIsReceiving(false);

      setMetaTransportId(updatedOrder.transport_id ? String(updatedOrder.transport_id) : "");
      setMetaTransportThrough(updatedOrder.transport_through || "");

      setMetaTransportId2(updatedOrder.transport_id_2 ? String(updatedOrder.transport_id_2) : "");
      setMetaTransportThrough2(updatedOrder.transport_through_2 || "");

      setMetaNotes(updatedOrder.notes || "");
      setBaseOrderNoDraft(updatedOrder.order_no || baseOrderNoDraft);

      setOrderNoDrafts((prev) => ({
        ...prev,
        [updatedOrder.id]: updatedOrder.order_no || prev[updatedOrder.id] || "",
      }));

      await fetchOrders();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Cancel failed.");
    } finally {
      setSavingReceive(false);
    }
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
      const res = await api.patch(`/api/school-orders/${viewOrder.id}/order-no`, {
        order_no: newNo,
      });

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
      const res = await api.patch(`/api/school-orders/${orderId}/order-no`, {
        order_no: newNo,
      });

      setInfo(res?.data?.message || "Order no updated.");

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
        ok = ok && rec === 0 && o.status !== "cancelled";
      } else {
        ok = ok && o.status === filterStatus;
      }
    }

    return ok;
  });

  const aggregate = useMemo(() => {
    let orderedTotal = 0;
    let receivedTotal = 0;
    visibleOrders.forEach((o) => {
      const items = getOrderItems(o);
      orderedTotal += totalQtyFromItems(items);
      receivedTotal += totalReceivedFromItems(items);
    });
    return {
      orderedTotal,
      receivedTotal,
      pendingTotal: Math.max(orderedTotal - receivedTotal, 0),
    };
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
    pendingTotal: number;
  };

  const schoolGroups: {
    schoolId: number;
    school: School | undefined;
    rows: SupplierRow[];
  }[] = useMemo(() => {
    const map = new Map<number, { school: School | undefined; rows: SupplierRow[] }>();

    visibleOrders.forEach((order) => {
      const school = getOrderSchool(order);
      const schoolId = order.school_id;
      const items = getOrderItems(order);

      const supplierId = Number(order.supplier_id);
      const supplierName =
        order.supplier?.name || (supplierId ? `Supplier #${supplierId}` : "Supplier");

      const ordTotal = totalQtyFromItems(items);
      const recTotal = totalReceivedFromItems(items);

      const row: SupplierRow = {
        key: makeSupplierKey(order.id, supplierId || 0),
        order,
        school,
        supplierId,
        supplierName,
        orderedTotal: ordTotal,
        receivedTotal: recTotal,
        pendingTotal: Math.max(ordTotal - recTotal, 0),
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
      {/* Compact Header */}
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
            <span className="text-[11px] text-slate-600 hidden sm:inline">
              {user?.name || "User"}
            </span>
            <button
              onClick={logout}
              className="text-[11px] px-3 py-1 rounded-full bg-rose-600 text-white"
            >
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
            <span className="text-sm font-semibold">School → Supplier</span>
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
                <div
                  key={group.schoolId}
                  className="border border-slate-200 rounded-lg overflow-hidden"
                >
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      {group.school?.name || "Unknown"}
                      {group.school?.city ? (
                        <span className="text-xs text-slate-500 font-normal">
                          {" "}
                          ({group.school.city})
                        </span>
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
                          const statusClass = statusChipClass(order.status);

                          const draft = orderNoDrafts[order.id] ?? order.order_no ?? "";
                          const savingThis = savingOrderNoId === order.id;

                          return (
                            <tr key={row.key} className="hover:bg-slate-50">
                              <td className="border-b border-slate-200 px-2 py-2 font-medium">
                                {row.supplierName}
                              </td>

                              <td className="border-b border-slate-200 px-2 py-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={draft}
                                    onChange={(e) =>
                                      setOrderNoDrafts((prev) => ({
                                        ...prev,
                                        [order.id]: e.target.value,
                                      }))
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

                              <td className="border-b border-slate-200 px-2 py-2 text-right">
                                {row.orderedTotal}
                              </td>
                              <td className="border-b border-slate-200 px-2 py-2 text-right">
                                {row.receivedTotal}
                              </td>
                              <td className="border-b border-slate-200 px-2 py-2 text-right">
                                {row.pendingTotal}
                              </td>

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

      {/* ✅ Modal */}
      {viewOrder && (
        <div className="fixed inset-0 z-40 bg-black/50">
          <div className="h-full w-full overflow-auto p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[1200px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50">
                  {(() => {
                    const school = getOrderSchool(viewOrder);
                    const items = getOrderItems(viewOrder);

                    const supplierName =
                      viewOrder.supplier?.name ||
                      (viewOrder.supplier_id ? `Supplier #${viewOrder.supplier_id}` : "Supplier");

                    const supplierPhone = viewOrder.supplier?.phone || "";
                    const supplierEmail = viewOrder.supplier?.email || "";
                    const supplierAddress =
                      viewOrder.supplier?.address ||
                      viewOrder.supplier?.address_line1 ||
                      viewOrder.supplier?.full_address ||
                      "";

                    const totalOrdered = totalQtyFromItems(items);
                    const totalReceived = totalReceivedFromItems(items);
                    const totalPending = Math.max(totalOrdered - totalReceived, 0);

                    const supBal = viewOrder.supplier_id
                      ? supplierBalances[Number(viewOrder.supplier_id)]
                      : null;
                    const supBalLoading = viewOrder.supplier_id
                      ? !!supplierBalLoading[Number(viewOrder.supplier_id)]
                      : false;

                    return (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                              <Package className="w-5 h-5" />
                            </div>

                            <div className="min-w-0">
                              <div className="text-base font-semibold truncate">
                                {school?.name || "School"}{" "}
                                <span className="text-xs text-slate-500 font-normal">
                                  ({viewOrder.academic_session || "-"})
                                </span>
                              </div>

                              <div className="text-xs text-slate-700 truncate mt-0.5">
                                Supplier:{" "}
                                <span className="font-semibold text-slate-900">{supplierName}</span>
                                {supplierPhone ? ` • ${supplierPhone}` : ""}
                                {supplierEmail ? ` • ${supplierEmail}` : ""}
                              </div>

                              {supplierAddress ? (
                                <div className="text-[11px] text-slate-500 truncate">
                                  {supplierAddress}
                                </div>
                              ) : null}

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

                                {viewOrder.supplier_id ? (
                                  <>
                                    <span className="text-slate-400">•</span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[11px] ${
                                        supBalLoading
                                          ? "bg-slate-50 text-slate-600 border border-slate-200"
                                          : supBal
                                          ? balChip(Number(supBal.balance) || 0)
                                          : "bg-slate-50 text-slate-600 border border-slate-200"
                                      }`}
                                    >
                                      {supBalLoading
                                        ? "Balance: loading..."
                                        : supBal
                                        ? `Bal: ₹${fmtMoney(supBal.balance)}`
                                        : "Bal: -"}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        openLedger({
                                          id: Number(viewOrder.supplier_id),
                                          name: supplierName,
                                          phone: viewOrder.supplier?.phone || null,
                                          email: viewOrder.supplier?.email || null,
                                          address: viewOrder.supplier?.address || null,
                                          address_line1: viewOrder.supplier?.address_line1 || null,
                                          full_address: viewOrder.supplier?.full_address || null,
                                        })
                                      }
                                      className="text-[11px] px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                                    >
                                      Ledger
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => fetchSupplierBalance(Number(viewOrder.supplier_id))}
                                      className="text-[11px] px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                                      title="Refresh balance"
                                    >
                                      <RefreshCcw className="w-3 h-3" />
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
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
                              onClick={() => {
                                setViewOrder(null);
                                setIsReceiving(false);
                              }}
                              className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                              title="Close"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Meta grid */}
                        <div className="mt-3 grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-12 lg:col-span-3">
                            <label className="block text-[11px] text-slate-600 mb-1">Order No</label>
                            <div className="flex items-center gap-2">
                              <input
                                value={baseOrderNoDraft}
                                onChange={(e) => setBaseOrderNoDraft(e.target.value)}
                                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              />
                              <button
                                type="button"
                                onClick={handleSaveBaseOrderNo}
                                disabled={savingBaseOrderNo}
                                className="text-[12px] px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                              >
                                {savingBaseOrderNo ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>

                          <div className="col-span-12 md:col-span-6 lg:col-span-3">
                            <label className="block text-[11px] text-slate-600 mb-1">
                              Transport (Option 1)
                            </label>
                            <select
                              value={metaTransportId}
                              onChange={(e) => setMetaTransportId(e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
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

                          <div className="col-span-12 md:col-span-6 lg:col-span-3">
                            <label className="block text-[11px] text-slate-600 mb-1">
                              Through (Option 1)
                            </label>
                            <input
                              value={metaTransportThrough}
                              onChange={(e) => setMetaTransportThrough(e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="DTDC / By Bus..."
                            />
                          </div>

                          <div className="col-span-12 lg:col-span-3">
                            <label className="block text-[11px] text-slate-600 mb-1">Notes</label>
                            <div className="flex items-center gap-2">
                              <input
                                value={metaNotes}
                                onChange={(e) => setMetaNotes(e.target.value)}
                                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                placeholder="This will print in footer (highlighted)..."
                              />
                              <button
                                type="button"
                                onClick={handleMetaSave}
                                disabled={metaSaving}
                                className="text-[12px] px-4 py-2 rounded-xl text-white font-semibold
                                           bg-gradient-to-r from-indigo-600 to-blue-600
                                           hover:brightness-110 active:brightness-95
                                           disabled:opacity-60"
                              >
                                {metaSaving ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>

                          <div className="col-span-12 md:col-span-6 lg:col-span-3">
                            <label className="block text-[11px] text-slate-600 mb-1">
                              Transport (Option 2)
                            </label>
                            <select
                              value={metaTransportId2}
                              onChange={(e) => setMetaTransportId2(e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
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

                          <div className="col-span-12 md:col-span-6 lg:col-span-3">
                            <label className="block text-[11px] text-slate-600 mb-1">
                              Through (Option 2)
                            </label>
                            <input
                              value={metaTransportThrough2}
                              onChange={(e) => setMetaTransportThrough2(e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="Optional..."
                            />
                          </div>

                          {/* Receive controls */}
                          <div className="col-span-12 lg:col-span-6">
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {viewOrder.status !== "cancelled" && (
                                <>
                                  {!isReceiving ? (
                                    <button
                                      onClick={startReceiving}
                                      className="text-[12px] px-4 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-semibold"
                                    >
                                      Receive + Prices
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        onClick={handleReceiveSave}
                                        disabled={savingReceive}
                                        className="text-[12px] px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 font-semibold"
                                      >
                                        {savingReceive ? "Saving..." : "Save Receive"}
                                      </button>
                                      <button
                                        onClick={() => setIsReceiving(false)}
                                        disabled={savingReceive}
                                        className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  )}

                                  {!isReceiving && (
                                    <button
                                      onClick={handleCancelOrder}
                                      disabled={savingReceive}
                                      className="text-[12px] px-4 py-2 rounded-xl border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60 font-semibold"
                                    >
                                      Cancel Order
                                    </button>
                                  )}
                                </>
                              )}

                              <button
                                onClick={() => {
                                  setViewOrder(null);
                                  setIsReceiving(false);
                                }}
                                className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Body */}
                <div className="p-3 overflow-auto text-xs flex-1 bg-white">
                  {(() => {
                    const items = getOrderItems(viewOrder);
                    const school = getOrderSchool(viewOrder);
                    if (!items?.length) return <div className="p-4 text-slate-500">No items.</div>;

                    return (
                      <div className="space-y-3">
                        {/* Items table */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-xs border-collapse">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="border-b border-slate-200 px-2 py-2 text-left w-36">School</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-left w-52">Supplier</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-left">Book</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-left w-20">Class</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-left w-24">Subject</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-left w-24">Code/ISBN</th>

                                <th className="border-b border-slate-200 px-2 py-2 text-right w-14">O</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-right w-18">R</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-right w-14">P</th>

                                <th className="border-b border-slate-200 px-2 py-2 text-right w-24">Rate</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-right w-20">Disc%</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-right w-20">Disc₹</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-right w-24">Net Rate</th>
                                <th className="border-b border-slate-200 px-2 py-2 text-right w-28">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const totalRows = items.length;
                                let schoolCellRendered = false;
                                let supplierCellRendered = false;

                                const supplierId = Number(viewOrder.supplier_id || 0);
                                const supplierName =
                                  viewOrder.supplier?.name ||
                                  (supplierId ? `Supplier #${supplierId}` : "Supplier");

                                const supBal = supplierId ? supplierBalances[supplierId] : null;
                                const isBalLoading = supplierId ? !!supplierBalLoading[supplierId] : false;

                                return items.map((item) => {
                                  const ordered = Number(item.total_order_qty) || 0;

                                  const rawQty = receiveForm[item.id] ?? String(item.received_qty ?? 0);
                                  const qtyNum = Math.min(Math.max(num(rawQty), 0), ordered);

                                  const backendReceived = Number(item.received_qty ?? 0) || 0;
                                  const displayReceived = isReceiving ? qtyNum : backendReceived;

                                  const pendingWhenNotEditing =
                                    item.pending_qty != null
                                      ? Math.max(Number(item.pending_qty) || 0, 0)
                                      : Math.max(ordered - backendReceived, 0);

                                  const pending = isReceiving
                                    ? Math.max(ordered - qtyNum, 0)
                                    : pendingWhenNotEditing;

                                  const showSchoolCell = !schoolCellRendered;
                                  const showSupplierCell = !supplierCellRendered;

                                  if (showSchoolCell) schoolCellRendered = true;
                                  if (showSupplierCell) supplierCellRendered = true;

                                  const draft = priceForm[item.id] || {
                                    unit_price: String(item.unit_price ?? ""),
                                    discount_pct: String(item.discount_pct ?? ""),
                                    discount_amt: String(item.discount_amt ?? ""),
                                  };

                                  const unitPrice = num(draft.unit_price ?? 0);
                                  const discPct = num(draft.discount_pct ?? 0);
                                  const discAmt = num(draft.discount_amt ?? 0);
                                  const netRate = computeItemNetRate(unitPrice, discPct, discAmt);
                                  const amount = netRate * (isReceiving ? qtyNum : backendReceived);

                                  return (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                      {showSchoolCell && (
                                        <td
                                          rowSpan={totalRows}
                                          className="border-b border-slate-200 px-2 py-2 align-top text-[12px] font-semibold"
                                        >
                                          {school?.name || "-"}
                                          {school?.city ? (
                                            <span className="block text-[11px] text-slate-500 font-normal">
                                              {school.city}
                                            </span>
                                          ) : null}
                                        </td>
                                      )}

                                      {showSupplierCell && (
                                        <td
                                          rowSpan={totalRows}
                                          className="border-b border-slate-200 px-2 py-2 align-top"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="text-[12px] font-medium text-indigo-700 truncate">
                                                {supplierName}
                                              </div>

                                              {supplierId ? (
                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                  <span
                                                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                                                      isBalLoading
                                                        ? "bg-slate-50 text-slate-600 border border-slate-200"
                                                        : supBal
                                                        ? balChip(Number(supBal.balance) || 0)
                                                        : "bg-slate-50 text-slate-600 border border-slate-200"
                                                    }`}
                                                  >
                                                    {isBalLoading
                                                      ? "Balance: loading..."
                                                      : supBal
                                                      ? `Bal: ₹${fmtMoney(supBal.balance)}`
                                                      : "Bal: -"}
                                                  </span>

                                                  <button
                                                    type="button"
                                                    disabled={!supplierId}
                                                    onClick={() =>
                                                      openLedger({
                                                        id: supplierId,
                                                        name: supplierName,
                                                        phone: viewOrder.supplier?.phone || null,
                                                        email: viewOrder.supplier?.email || null,
                                                        address: viewOrder.supplier?.address || null,
                                                        address_line1: viewOrder.supplier?.address_line1 || null,
                                                        full_address: viewOrder.supplier?.full_address || null,
                                                      })
                                                    }
                                                    className="text-[11px] px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                                                  >
                                                    Ledger
                                                  </button>
                                                </div>
                                              ) : (
                                                <div className="text-[11px] text-slate-500 mt-1">
                                                  No supplier linked
                                                </div>
                                              )}
                                            </div>

                                            {supplierId ? (
                                              <button
                                                type="button"
                                                onClick={() => fetchSupplierBalance(supplierId)}
                                                className="text-[11px] px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 shrink-0"
                                                title="Refresh balance"
                                              >
                                                <RefreshCcw className="w-3 h-3" />
                                              </button>
                                            ) : null}
                                          </div>
                                        </td>
                                      )}

                                      <td className="border-b border-slate-200 px-2 py-2">
                                        {item.book?.title || `Book #${item.book_id}`}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-2">
                                        {item.book?.class_name || "-"}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-2">
                                        {item.book?.subject || "-"}
                                      </td>
                                      <td className="border-b border-slate-200 px-2 py-2">
                                        {item.book?.code || item.book?.isbn || "-"}
                                      </td>

                                      <td className="border-b border-slate-200 px-2 py-2 text-right">
                                        {ordered}
                                      </td>

                                      <td className="border-b border-slate-200 px-2 py-2 text-right">
                                        {isReceiving ? (
                                          <input
                                            type="number"
                                            min={0}
                                            max={ordered}
                                            value={rawQty}
                                            onChange={(e) => handleReceiveChange(item.id, e.target.value)}
                                            className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-right text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                          />
                                        ) : (
                                          displayReceived
                                        )}
                                      </td>

                                      <td className="border-b border-slate-200 px-2 py-2 text-right">
                                        {pending}
                                      </td>

                                      {/* Rate */}
                                      <td className="border-b border-slate-200 px-2 py-2 text-right">
                                        {isReceiving ? (
                                          <input
                                            type="number"
                                            min={0}
                                            value={draft.unit_price}
                                            onChange={(e) =>
                                              handlePriceChange(item.id, "unit_price", e.target.value)
                                            }
                                            className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-right text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                            placeholder="0"
                                          />
                                        ) : (
                                          <span className="text-slate-700">
                                            {fmtMoney(num(item.unit_price))}
                                          </span>
                                        )}
                                      </td>

                                      {/* Disc% */}
                                      <td className="border-b border-slate-200 px-2 py-2 text-right">
                                        {isReceiving ? (
                                          <input
                                            type="number"
                                            min={0}
                                            value={draft.discount_pct}
                                            onChange={(e) =>
                                              handlePriceChange(item.id, "discount_pct", e.target.value)
                                            }
                                            className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-right text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                            placeholder="0"
                                          />
                                        ) : (
                                          <span className="text-slate-700">
                                            {fmtMoney(num(item.discount_pct))}
                                          </span>
                                        )}
                                      </td>

                                      {/* Disc₹ */}
                                      <td className="border-b border-slate-200 px-2 py-2 text-right">
                                        {isReceiving ? (
                                          <input
                                            type="number"
                                            min={0}
                                            value={draft.discount_amt}
                                            onChange={(e) =>
                                              handlePriceChange(item.id, "discount_amt", e.target.value)
                                            }
                                            className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-right text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                            placeholder="0"
                                          />
                                        ) : (
                                          <span className="text-slate-700">
                                            {fmtMoney(num(item.discount_amt))}
                                          </span>
                                        )}
                                      </td>

                                      {/* Net Rate */}
                                      <td className="border-b border-slate-200 px-2 py-2 text-right font-medium">
                                        {fmtMoney(netRate)}
                                      </td>

                                      {/* Amount */}
                                      <td className="border-b border-slate-200 px-2 py-2 text-right font-semibold">
                                        ₹{fmtMoney(amount)}
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>

                        {/* Charges + Summary */}
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-12 lg:col-span-7 border border-slate-200 rounded-xl p-3">
                            <div className="text-sm font-semibold text-slate-800 mb-2">
                              Charges / Discounts
                            </div>

                            <div className="grid grid-cols-12 gap-2">
                              <div className="col-span-12 md:col-span-4">
                                <label className="block text-[11px] text-slate-600 mb-1">
                                  Freight / Transport
                                </label>
                                <input
                                  disabled={!isReceiving}
                                  type="number"
                                  value={chargesForm.freight_charges}
                                  onChange={(e) => handleChargesChange("freight_charges", e.target.value)}
                                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right disabled:bg-slate-50"
                                  placeholder="0"
                                />
                              </div>

                              <div className="col-span-12 md:col-span-4">
                                <label className="block text-[11px] text-slate-600 mb-1">Packing</label>
                                <input
                                  disabled={!isReceiving}
                                  type="number"
                                  value={chargesForm.packing_charges}
                                  onChange={(e) => handleChargesChange("packing_charges", e.target.value)}
                                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right disabled:bg-slate-50"
                                  placeholder="0"
                                />
                              </div>

                              <div className="col-span-12 md:col-span-4">
                                <label className="block text-[11px] text-slate-600 mb-1">
                                  Other Charges
                                </label>
                                <input
                                  disabled={!isReceiving}
                                  type="number"
                                  value={chargesForm.other_charges}
                                  onChange={(e) => handleChargesChange("other_charges", e.target.value)}
                                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right disabled:bg-slate-50"
                                  placeholder="0"
                                />
                              </div>

                              <div className="col-span-12 md:col-span-4">
                                <label className="block text-[11px] text-slate-600 mb-1">
                                  Overall Discount (₹)
                                </label>
                                <input
                                  disabled={!isReceiving}
                                  type="number"
                                  value={chargesForm.overall_discount}
                                  onChange={(e) =>
                                    handleChargesChange("overall_discount", e.target.value)
                                  }
                                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right disabled:bg-slate-50"
                                  placeholder="0"
                                />
                              </div>

                              <div className="col-span-12 md:col-span-4">
                                <label className="block text-[11px] text-slate-600 mb-1">
                                  Round Off (₹)
                                </label>
                                <input
                                  disabled={!isReceiving}
                                  type="number"
                                  value={chargesForm.round_off}
                                  onChange={(e) => handleChargesChange("round_off", e.target.value)}
                                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right disabled:bg-slate-50"
                                  placeholder="0"
                                />
                              </div>

                              <div className="col-span-12 md:col-span-4 flex items-end">
                                <div className="text-[11px] text-slate-500">
                                  * Charges fields edit only in Receiving mode.
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="col-span-12 lg:col-span-5 border border-slate-200 rounded-xl p-3 bg-slate-50">
                            <div className="text-sm font-semibold text-slate-800 mb-2">Summary</div>

                            {computeTotalsForModal ? (
                              <div className="space-y-1 text-[12px]">
                                <div className="flex justify-between">
                                  <span className="text-slate-600">Items Gross</span>
                                  <span className="font-medium">
                                    ₹{fmtMoney(computeTotalsForModal.itemsGross)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-600">Items Discount</span>
                                  <span className="font-medium">
                                    ₹{fmtMoney(computeTotalsForModal.itemsDiscount)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-700 font-semibold">Items Net</span>
                                  <span className="font-semibold">
                                    ₹{fmtMoney(computeTotalsForModal.itemsNet)}
                                  </span>
                                </div>

                                <div className="h-px bg-slate-200 my-2" />

                                <div className="flex justify-between">
                                  <span className="text-slate-600">Charges Total</span>
                                  <span className="font-medium">
                                    ₹{fmtMoney(computeTotalsForModal.chargesTotal)}
                                  </span>
                                </div>

                                <div className="flex justify-between">
                                  <span className="text-slate-600">Sub Total</span>
                                  <span className="font-medium">
                                    ₹{fmtMoney(computeTotalsForModal.subTotal)}
                                  </span>
                                </div>

                                <div className="flex justify-between">
                                  <span className="text-slate-600">Overall Discount</span>
                                  <span className="font-medium">
                                    - ₹{fmtMoney(computeTotalsForModal.overallDisc)}
                                  </span>
                                </div>

                                <div className="flex justify-between">
                                  <span className="text-slate-600">Round Off</span>
                                  <span className="font-medium">
                                    {computeTotalsForModal.roundOff >= 0 ? "+" : "-"} ₹
                                    {fmtMoney(Math.abs(computeTotalsForModal.roundOff))}
                                  </span>
                                </div>

                                <div className="h-px bg-slate-200 my-2" />

                                <div className="flex justify-between text-[13px]">
                                  <span className="font-semibold text-slate-900">Grand Total</span>
                                  <span className="font-extrabold text-slate-900">
                                    ₹{fmtMoney(computeTotalsForModal.grand)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-slate-500 text-sm">—</div>
                            )}
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

      {/* ---------- ✅ Ledger Modal (UPDATED to Supplier) ---------- */}
      {ledgerOpen && ledgerSupplier && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full overflow-auto p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[980px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      Supplier Ledger:{" "}
                      <span className="text-indigo-700">{ledgerSupplier.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Use dates if you want to filter.
                    </div>
                  </div>

                  <button
                    onClick={() => setLedgerOpen(false)}
                    className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="px-4 py-3 border-b flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">From</label>
                    <input
                      type="date"
                      value={ledgerFrom}
                      onChange={(e) => setLedgerFrom(e.target.value)}
                      className="border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">To</label>
                    <input
                      type="date"
                      value={ledgerTo}
                      onChange={(e) => setLedgerTo(e.target.value)}
                      className="border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => openLedger(ledgerSupplier)}
                    disabled={ledgerLoading}
                    className="text-[12px] px-4 py-2 rounded-xl text-white font-semibold
                               bg-gradient-to-r from-indigo-600 to-blue-600
                               hover:brightness-110 active:brightness-95
                               disabled:opacity-60"
                  >
                    {ledgerLoading ? "Loading..." : "Apply"}
                  </button>

                  <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                    {ledgerTotals ? (
                      <>
                        <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-700">
                          DR: ₹{fmtMoney(ledgerTotals.debit)}
                        </span>
                        <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-700">
                          CR: ₹{fmtMoney(ledgerTotals.credit)}
                        </span>
                        <span className={`px-2 py-1 rounded-full ${balChip(ledgerTotals.balance)}`}>
                          Bal: ₹{fmtMoney(ledgerTotals.balance)}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </div>
                </div>

                <div className="p-3">
                  {ledgerError ? (
                    <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      {ledgerError}
                    </div>
                  ) : null}

                  {ledgerLoading ? (
                    <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Loading ledger...
                    </div>
                  ) : ledgerRows.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">No transactions.</div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="border-b border-slate-200 px-2 py-2 text-left w-28">Date</th>
                            <th className="border-b border-slate-200 px-2 py-2 text-left w-28">Type</th>
                            <th className="border-b border-slate-200 px-2 py-2 text-left">Narration</th>
                            <th className="border-b border-slate-200 px-2 py-2 text-right w-24">Debit</th>
                            <th className="border-b border-slate-200 px-2 py-2 text-right w-24">Credit</th>
                            <th className="border-b border-slate-200 px-2 py-2 text-right w-28">Running</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledgerRows.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50">
                              <td className="border-b border-slate-200 px-2 py-2 text-slate-700">
                                {formatDate(r.txn_date)}
                              </td>
                              <td className="border-b border-slate-200 px-2 py-2 text-slate-700">
                                {r.txn_type || "-"}
                              </td>
                              <td className="border-b border-slate-200 px-2 py-2">
                                <div className="text-slate-800">{r.narration || r.ref_no || "-"}</div>
                                {r.ref_no ? (
                                  <div className="text-[11px] text-slate-500">Ref: {r.ref_no}</div>
                                ) : null}
                              </td>
                              <td className="border-b border-slate-200 px-2 py-2 text-right">
                                {Number(r.debit) ? fmtMoney(r.debit) : "-"}
                              </td>
                              <td className="border-b border-slate-200 px-2 py-2 text-right">
                                {Number(r.credit) ? fmtMoney(r.credit) : "-"}
                              </td>
                              <td className="border-b border-slate-200 px-2 py-2 text-right font-medium">
                                {r.running_balance != null ? fmtMoney(r.running_balance) : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3 border-t bg-slate-50 flex justify-end">
                  <button
                    onClick={() => setLedgerOpen(false)}
                    className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="h-3" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolOrdersPageClient;
