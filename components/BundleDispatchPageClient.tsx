"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronLeft,
  Truck,
  Plus,
  RefreshCcw,
  Search,
  FileText,
  Pencil,
  X,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Calendar,
  Hash,
  Phone,
  User,
  Info,
  Sparkles,
  ClipboardCheck,
} from "lucide-react";

/* ---------------- Types ---------------- */

type Transport = { id: number; name: string };

type BundleMini = {
  id: number;
  academic_session?: string | null;
  status?: string;
  school?: { id: number; name: string } | null;
};

type BundleIssueMini = {
  id: number;
  issue_no?: string | null;
  issued_to_type?: "SCHOOL" | "DISTRIBUTOR" | string;
  issued_to_id?: number | null;
};

type DispatchRow = {
  id: number;

  // ✅ NEW
  challan_no?: string | null;

  bundle_id: number;
  bundle_issue_id?: number | null;

  transport_id?: number | null;
  vehicle_no?: string | null;
  driver_name?: string | null;
  driver_mobile?: string | null;

  dispatch_date: string;
  expected_delivery_date?: string | null;
  delivered_date?: string | null;

  status: "DISPATCHED" | "PARTIALLY_DELIVERED" | "DELIVERED" | string;
  remarks?: string | null;

  createdAt?: string;
  updatedAt?: string;

  bundle?: BundleMini | null;
  transport?: Transport | null;
  issue?: BundleIssueMini | null;
};

type ToastState = { message: string; type: "success" | "error" } | null;

const DEFAULT_SESSION = "2026-27";

/* ---------------- Small helpers ---------------- */

const cx = (...s: (string | false | null | undefined)[]) => s.filter(Boolean).join(" ");

const toDateInput = (d?: string | null) => (d && String(d).slice(0, 10)) || "";
const todayStr = () => new Date().toISOString().slice(0, 10);

const badgeClass = (status: string) => {
  const s = String(status || "").toUpperCase();
  if (s === "DELIVERED") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "PARTIALLY_DELIVERED") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-sky-100 text-sky-800 border-sky-200";
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso || "";
  }
};

const normalizeList = (raw: any) => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.rows)) return raw.rows;
  return [];
};

export default function BundleDispatchPageClient() {
  const { user, logout } = useAuth();

  /* ---------------- State ---------------- */

  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [session, setSession] = useState<string>(DEFAULT_SESSION);

  const [transports, setTransports] = useState<Transport[]>([]);
  const [bundles, setBundles] = useState<BundleMini[]>([]);
  const [issues, setIssues] = useState<BundleIssueMini[]>([]);

  // create modal
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    challan_no: "",
    bundle_id: "",
    bundle_issue_id: "",
    transport_id: "",
    vehicle_no: "",
    driver_name: "",
    driver_mobile: "",
    dispatch_date: todayStr(),
    expected_delivery_date: "",
    remarks: "",
  });
  const createFirstRef = useRef<HTMLSelectElement | null>(null);

  // edit modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState({
    challan_no: "",
    status: "DISPATCHED",
    delivered_date: "",
    transport_id: "",
    vehicle_no: "",
    driver_name: "",
    driver_mobile: "",
    expected_delivery_date: "",
    remarks: "",
  });

  // details modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<DispatchRow | null>(null);

  /* ---------------- Derived ---------------- */

  const queryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (q.trim()) p.q = q.trim();
    if (status) p.status = status;
    return p;
  }, [q, status]);

  const kpi = useMemo(() => {
    const total = rows.length;
    const dispatched = rows.filter((r) => (r.status || "").toUpperCase() === "DISPATCHED").length;
    const partial = rows.filter((r) => (r.status || "").toUpperCase() === "PARTIALLY_DELIVERED").length;
    const delivered = rows.filter((r) => (r.status || "").toUpperCase() === "DELIVERED").length;
    return { total, dispatched, partial, delivered };
  }, [rows]);

  const challanUrl = (id: number) => `/api/bundle-dispatches/${id}/challan`;

  /* ---------------- Toast auto-hide ---------------- */

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  /* ---------------- Fetch ---------------- */

  const fetchLookups = async () => {
    try {
      const [tRes, bRes, iRes] = await Promise.allSettled([
        api.get("/api/transports"),
        api.get("/api/bundles", { params: { status: "ISSUED" } }),
        api.get("/api/bundle-issues", { params: { academic_session: session } }),
      ]);

      if (tRes.status === "fulfilled") setTransports(normalizeList(tRes.value.data));
      if (bRes.status === "fulfilled") setBundles(normalizeList(bRes.value.data));
      if (iRes.status === "fulfilled") setIssues(normalizeList(iRes.value.data));
    } catch {
      // ignore lookup errors
    }
  };

  const fetchAll = async () => {
    setPageLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/bundle-dispatches", { params: queryParams });
      const list: DispatchRow[] = normalizeList(res?.data);
      setRows([...list].sort((a, b) => (b.id || 0) - (a.id || 0)));
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to load dispatches";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await Promise.all([fetchAll(), fetchLookups()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /* ---------------- Challan Open (AUTH SAFE) ---------------- */

  const openChallanPdf = async (dispatchId: number) => {
    try {
      // ✅ JWT header goes automatically via apiClient interceptors
      const res = await api.get(challanUrl(dispatchId), { responseType: "blob" });

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to open challan PDF";
      setToast({ message: msg, type: "error" });
    }
  };

  /* ---------------- Actions ---------------- */

  const onCreate = async () => {
    setError(null);

    const payload: any = {
      challan_no: form.challan_no?.trim() || null,

      bundle_id: Number(form.bundle_id),
      bundle_issue_id: form.bundle_issue_id ? Number(form.bundle_issue_id) : null,
      transport_id: form.transport_id ? Number(form.transport_id) : null,
      vehicle_no: form.vehicle_no?.trim() || null,
      driver_name: form.driver_name?.trim() || null,
      driver_mobile: form.driver_mobile?.trim() || null,
      dispatch_date: form.dispatch_date,
      expected_delivery_date: form.expected_delivery_date || null,
      remarks: form.remarks?.trim() || null,
    };

    if (!payload.bundle_id) {
      setError("Please select Bundle");
      setToast({ message: "Please select Bundle", type: "error" });
      return;
    }
    if (!payload.dispatch_date) {
      setError("Dispatch date is required");
      setToast({ message: "Dispatch date is required", type: "error" });
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/bundle-dispatches", payload);

      setToast({ message: "Dispatch created successfully.", type: "success" });
      setOpenCreate(false);

      setForm({
        challan_no: "",
        bundle_id: "",
        bundle_issue_id: "",
        transport_id: "",
        vehicle_no: "",
        driver_name: "",
        driver_mobile: "",
        dispatch_date: todayStr(),
        expected_delivery_date: "",
        remarks: "",
      });

      await fetchAll();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to create dispatch";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const openEditFor = (r: DispatchRow) => {
    setError(null);
    setEditId(r.id);
    setEdit({
      challan_no: r.challan_no || "",
      status: String(r.status || "DISPATCHED").toUpperCase(),
      delivered_date: toDateInput(r.delivered_date),
      transport_id: r.transport_id ? String(r.transport_id) : "",
      vehicle_no: r.vehicle_no || "",
      driver_name: r.driver_name || "",
      driver_mobile: r.driver_mobile || "",
      expected_delivery_date: toDateInput(r.expected_delivery_date),
      remarks: r.remarks || "",
    });
    setOpenEdit(true);
  };

  const onUpdate = async () => {
    if (!editId) return;
    setError(null);

    const payload: any = {
      challan_no: edit.challan_no?.trim() || null,

      status: edit.status,
      delivered_date: edit.delivered_date || null,
      expected_delivery_date: edit.expected_delivery_date || null,
      remarks: edit.remarks?.trim() || null,
      transport_id: edit.transport_id ? Number(edit.transport_id) : null,
      vehicle_no: edit.vehicle_no?.trim() || null,
      driver_name: edit.driver_name?.trim() || null,
      driver_mobile: edit.driver_mobile?.trim() || null,
    };

    setLoading(true);
    try {
      await api.patch(`/api/bundle-dispatches/${editId}/status`, payload);
      setToast({ message: "Dispatch updated successfully.", type: "success" });
      setOpenEdit(false);
      setEditId(null);
      await fetchAll();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Failed to update dispatch";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const openDetails = (r: DispatchRow) => {
    setSelectedRow(r);
    setModalOpen(true);
  };

  /* ---------------- Render ---------------- */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000" />
        <div className="absolute top-40 left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-200/50 shadow-lg">
        <div className="font-bold flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back to Dashboard</span>
          </Link>
        </div>

        <div className="font-bold flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg animate-pulse">
            <Truck className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg tracking-tight">Bundle Dispatch</span>
            <span className="text-xs text-slate-500 font-medium">
              Create dispatch • Update delivery status • Download challan PDF
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-slate-800">{user?.name || "User"}</span>
            {user?.role && (
              <span className="text-xs rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-2.5 py-1 border border-indigo-200 text-indigo-700 font-medium">
                {user.role}
              </span>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 transform"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 p-6 lg:p-8 space-y-6">
        {/* Title + refresh */}
        <section className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                Bundle Dispatch
              </h1>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Track dispatches & delivery • Challan opens with auth (no Unauthorized)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpenCreate(true)}
              className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200 disabled:opacity-60 text-xs sm:text-sm"
            >
              <Plus className="w-4 h-4" />
              New Dispatch
            </button>

            <button
              type="button"
              onClick={() => fetchAll()}
              disabled={pageLoading}
              className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-slate-200 text-slate-700 font-semibold shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200 disabled:opacity-60 text-xs sm:text-sm"
            >
              <RefreshCcw className={`w-4 h-4 ${pageLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </section>

        {error && (
          <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-red-700">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Filters + KPI */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-bold text-slate-900">Dispatch Records</div>
              <div className="text-xs text-slate-500 mt-1">
                Total: <span className="font-semibold">{kpi.total}</span> • Dispatched:{" "}
                <span className="font-semibold">{kpi.dispatched}</span> • Partial:{" "}
                <span className="font-semibold">{kpi.partial}</span> • Delivered:{" "}
                <span className="font-semibold">{kpi.delivered}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search challan / vehicle / driver / mobile"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="">All Status</option>
                <option value="DISPATCHED">DISPATCHED</option>
                <option value="PARTIALLY_DELIVERED">PARTIALLY_DELIVERED</option>
                <option value="DELIVERED">DELIVERED</option>
              </select>

              <button
                type="button"
                onClick={fetchAll}
                disabled={pageLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-60 text-sm"
              >
                <RefreshCcw className={`w-4 h-4 ${pageLoading ? "animate-spin" : ""}`} />
                Apply
              </button>
            </div>
          </div>

          {pageLoading ? (
            <div className="flex items-center justify-center py-10 text-xs sm:text-sm text-slate-600">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading dispatch records...
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
              No dispatch records found. Create a dispatch to start tracking.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-4">Dispatch</th>
                    <th className="py-2 pr-4">Challan</th>
                    <th className="py-2 pr-4">Bundle</th>
                    <th className="py-2 pr-4">Vehicle / Driver</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Dates</th>
                    <th className="py-2 pr-2 text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">Dispatch #{r.id}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Hash className="w-3.5 h-3.5" /> Bundle #{r.bundle_id}
                        </div>
                      </td>

                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">{r.challan_no || "—"}</div>
                        <div className="text-xs text-slate-500">Delivery Challan No</div>
                      </td>

                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">Bundle #{r.bundle_id}</div>
                        <div className="text-xs text-slate-500">
                          {r.bundle?.school?.name ? `School: ${r.bundle.school.name}` : "School: —"}
                        </div>
                      </td>

                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">{r.vehicle_no || "—"}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3.5 h-3.5" /> {r.driver_name || "—"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" /> {r.driver_mobile || "—"}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 pr-4">
                        <span
                          className={cx(
                            "inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold",
                            badgeClass(r.status)
                          )}
                        >
                          {String(r.status || "").toUpperCase()}
                        </span>
                        {r.remarks ? (
                          <div className="text-xs text-slate-500 mt-1 line-clamp-1">{r.remarks}</div>
                        ) : null}
                      </td>

                      <td className="py-3 pr-4 text-slate-700">
                        <div className="text-xs flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          Dispatch: {toDateInput(r.dispatch_date) || "—"}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          ETA: {toDateInput(r.expected_delivery_date) || "—"}
                        </div>
                        <div className="text-xs text-slate-500">
                          Delivered: {toDateInput(r.delivered_date) || "—"}
                        </div>
                      </td>

                      <td className="py-3 pr-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openDetails(r)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                          >
                            <Layers className="w-4 h-4" />
                            Details
                          </button>

                          {/* ✅ FIXED: Open challan with JWT (no Unauthorized) */}
                          <button
                            type="button"
                            onClick={() => openChallanPdf(r.id)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                            title="Open Challan PDF"
                          >
                            <FileText className="w-4 h-4" />
                            Challan
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditFor(r)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow hover:shadow-md"
                          >
                            <Pencil className="w-4 h-4" />
                            Update
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Tip: Old records with blank challan_no can be backfilled via SQL.
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ---------------- Create Modal ---------------- */}
      {openCreate && (
        <Modal
          title="Create Dispatch"
          onClose={() => {
            setOpenCreate(false);
            setError(null);
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* ✅ NEW Challan No */}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Challan No (optional)</label>
              <input
                value={form.challan_no}
                onChange={(e) => setForm((p) => ({ ...p, challan_no: e.target.value }))}
                placeholder="Leave blank for auto (e.g., DC-2025-12-000123)"
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                If empty, system auto-generates unique challan number.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Bundle *</label>
              <select
                ref={createFirstRef as any}
                value={form.bundle_id}
                onChange={(e) => setForm((p) => ({ ...p, bundle_id: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="">Select Bundle</option>
                {bundles.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id} {b.school?.name ? `• ${b.school.name}` : ""}{" "}
                    {b.academic_session ? `• ${b.academic_session}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">Tip: ISSUED bundles should appear here.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Bundle Issue (optional)</label>
              <select
                value={form.bundle_issue_id}
                onChange={(e) => setForm((p) => ({ ...p, bundle_issue_id: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="">Select Issue</option>
                {issues.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.issue_no ? i.issue_no : `Issue #${i.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Transport (optional)</label>
              <select
                value={form.transport_id}
                onChange={(e) => setForm((p) => ({ ...p, transport_id: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="">Select Transport</option>
                {transports.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Dispatch Date *</label>
              <input
                type="date"
                value={form.dispatch_date}
                onChange={(e) => setForm((p) => ({ ...p, dispatch_date: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Vehicle No</label>
              <input
                value={form.vehicle_no}
                onChange={(e) => setForm((p) => ({ ...p, vehicle_no: e.target.value }))}
                placeholder="PB10AB1234"
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Expected Delivery</label>
              <input
                type="date"
                value={form.expected_delivery_date}
                onChange={(e) => setForm((p) => ({ ...p, expected_delivery_date: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Driver Name</label>
              <input
                value={form.driver_name}
                onChange={(e) => setForm((p) => ({ ...p, driver_name: e.target.value }))}
                placeholder="Driver name"
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Driver Mobile</label>
              <input
                value={form.driver_mobile}
                onChange={(e) => setForm((p) => ({ ...p, driver_mobile: e.target.value }))}
                placeholder="98xxxxxx00"
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Remarks</label>
              <textarea
                value={form.remarks}
                onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
                placeholder="Any notes (boxes count, delay reason, etc.)"
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[90px]"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenCreate(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={onCreate}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold shadow hover:shadow-md disabled:opacity-60"
            >
              <ClipboardCheck className="w-4 h-4" />
              {loading ? "Creating..." : "Create Dispatch"}
            </button>
          </div>
        </Modal>
      )}

      {/* ---------------- Edit Modal ---------------- */}
      {openEdit && (
        <Modal title={`Update Dispatch #${editId || ""}`} onClose={() => setOpenEdit(false)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Challan No</label>
              <input
                value={edit.challan_no}
                onChange={(e) => setEdit((p) => ({ ...p, challan_no: e.target.value }))}
                placeholder="Challan No (unique)"
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Keep unique. Leave empty only if backend allows it.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Status *</label>
              <select
                value={edit.status}
                onChange={(e) => setEdit((p) => ({ ...p, status: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="DISPATCHED">DISPATCHED</option>
                <option value="PARTIALLY_DELIVERED">PARTIALLY_DELIVERED</option>
                <option value="DELIVERED">DELIVERED</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                If status is DELIVERED, delivered_date will be set (auto if empty).
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Delivered Date</label>
              <input
                type="date"
                value={edit.delivered_date}
                onChange={(e) => setEdit((p) => ({ ...p, delivered_date: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Transport</label>
              <select
                value={edit.transport_id}
                onChange={(e) => setEdit((p) => ({ ...p, transport_id: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="">Select Transport</option>
                {transports.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Expected Delivery</label>
              <input
                type="date"
                value={edit.expected_delivery_date}
                onChange={(e) => setEdit((p) => ({ ...p, expected_delivery_date: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Vehicle No</label>
              <input
                value={edit.vehicle_no}
                onChange={(e) => setEdit((p) => ({ ...p, vehicle_no: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Driver Name</label>
              <input
                value={edit.driver_name}
                onChange={(e) => setEdit((p) => ({ ...p, driver_name: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Driver Mobile</label>
              <input
                value={edit.driver_mobile}
                onChange={(e) => setEdit((p) => ({ ...p, driver_mobile: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Remarks</label>
              <textarea
                value={edit.remarks}
                onChange={(e) => setEdit((p) => ({ ...p, remarks: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[90px]"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenEdit(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={onUpdate}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow hover:shadow-md disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? "Saving..." : "Save Update"}
            </button>
          </div>
        </Modal>
      )}

      {/* ---------------- Details Modal ---------------- */}
      {modalOpen && selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setModalOpen(false);
              setSelectedRow(null);
            }}
          />
          <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Dispatch Details
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Dispatch: <span className="font-semibold">#{selectedRow.id}</span> • Bundle:{" "}
                  <span className="font-semibold">#{selectedRow.bundle_id}</span>
                </div>
              </div>

              <button
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
                onClick={() => {
                  setModalOpen(false);
                  setSelectedRow(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Challan No</div>
                  <div className="mt-1 font-bold text-slate-900">{selectedRow.challan_no || "—"}</div>
                  <div className="text-xs text-slate-500 mt-2">Created: {fmtDate(selectedRow.createdAt)}</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="mt-1">
                    <span
                      className={cx(
                        "inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold",
                        badgeClass(selectedRow.status)
                      )}
                    >
                      {String(selectedRow.status || "").toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-2">Updated: {fmtDate(selectedRow.updatedAt)}</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Vehicle / Driver</div>
                  <div className="mt-1 font-bold text-slate-900">{selectedRow.vehicle_no || "—"}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Driver: {selectedRow.driver_name || "—"} • {selectedRow.driver_mobile || "—"}
                  </div>
                </div>
              </div>

              {selectedRow.remarks ? (
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                  <div className="text-xs text-slate-500">Remarks</div>
                  <div className="text-slate-900 mt-1 whitespace-pre-wrap">{selectedRow.remarks}</div>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                {/* ✅ FIXED: Open challan with JWT (no Unauthorized) */}
                <button
                  type="button"
                  onClick={() => openChallanPdf(selectedRow.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                >
                  <FileText className="w-4 h-4" />
                  Open Challan
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    openEditFor(selectedRow);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow hover:shadow-md"
                >
                  <Pencil className="w-4 h-4" />
                  Update
                </button>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Bulk Dispatch (multiple bundles in one vehicle) can be added later with multi-select.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={cx(
            "fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm sm:text-base",
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          )}
        >
          {toast.message}
        </div>
      )}

      {/* Blob animation CSS */}
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
}

/* ---------------- Modal ---------------- */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="text-lg font-bold text-slate-900">{title}</div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
