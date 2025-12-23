"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  Pencil,
  Trash2,
  Download,
  Upload,
  BookOpen,
  ChevronLeft,
  Sparkles,
  ScrollText, // ✅ Ledger
  IndianRupee, // ✅ Payment
  X,
} from "lucide-react";

/* ---------------- Types ---------------- */

type Supplier = {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
};

type BalanceResponse = {
  supplier: {
    id: number;
    name: string;
  };
  debit_total: number;
  credit_total: number;
  balance: number;
};

type LedgerRow = {
  date?: string | null;
  ref_no?: string | null;
  description?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
  balance?: number | string | null;

  txn_date?: string | null;
  narration?: string | null;
  running_balance?: number | string | null;
  createdAt?: string | null;
  txn_type?: string | null;
};

/* ---------------- Helpers ---------------- */

const emptyForm: Omit<Supplier, "id"> = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
};

type ToastState =
  | {
      message: string;
      type: "success" | "error";
    }
  | null;

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const fmtMoney = (n: any) => {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/* ---------------- Component ---------------- */

const SuppliersPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ✅ refs to always have latest values (fix "saving previous")
  const formRef = useRef(emptyForm);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // (Optional) import/export
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Excel-style refs
  const addRowRefs = useRef<(HTMLInputElement | HTMLTextAreaElement | null)[]>(
    []
  );
  const editRowRefs = useRef<(HTMLInputElement | HTMLTextAreaElement | null)[]>(
    []
  );

  // ✅ order: name, contact_person, phone, email, address => 0..4
  const LAST_INDEX = 4;

  const [toast, setToast] = useState<ToastState>(null);

  /* ---------------- ✅ Payment Popup State ---------------- */

  const [payOpen, setPayOpen] = useState(false);
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);
  const [paySaving, setPaySaving] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  const [payForm, setPayForm] = useState({
    payment_date: "",
    amount: "",
    payment_mode: "BANK",
    ref_no: "",
    notes: "",
  });

  /* ---------------- ✅ Ledger Popup State ---------------- */

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceRow, setBalanceRow] = useState<BalanceResponse | null>(null);

  /* ---------------- Helpers: set form + ref ---------------- */

  const setFormBoth = (
    updater:
      | typeof emptyForm
      | ((prev: typeof emptyForm) => typeof emptyForm)
  ) => {
    setForm((prev) => {
      const next =
        typeof updater === "function"
          ? (updater as (p: typeof emptyForm) => typeof emptyForm)(prev)
          : updater;
      formRef.current = next;
      return next;
    });
  };

  /* ---------------- Fetch Suppliers ---------------- */

  const fetchSuppliers = async () => {
    setListLoading(true);
    try {
      const res = await api.get<Supplier[]>("/api/suppliers");

      // ✅ latest on top (id DESC)
      const sorted = [...(res.data || [])].sort(
        (a, b) => (b.id || 0) - (a.id || 0)
      );
      setSuppliers(sorted);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load suppliers.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Auto hide toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  /* ---------------- Supplier CRUD ---------------- */

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormBoth((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormBoth(emptyForm);
    setEditingId(null);
    editRowRefs.current = [];
  };

  const saveSupplier = async () => {
    setError(null);
    setImportSummary(null);
    setLoading(true);

    try {
      const latest = formRef.current;

      const cleanName = (latest.name ?? "").trim();
      if (!cleanName) {
        throw new Error("Supplier name is required.");
      }

      const payload = {
        ...latest,
        name: cleanName,
      };

      if (editingId) {
        await api.put(`/api/suppliers/${editingId}`, payload);
        setToast({ message: "Supplier updated successfully.", type: "success" });
      } else {
        await api.post("/api/suppliers", payload);
        setToast({ message: "Supplier added successfully.", type: "success" });
      }

      resetForm();
      await fetchSuppliers();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.message ||
        err?.response?.data?.error ||
        (editingId
          ? "Failed to update supplier."
          : "Failed to create supplier.");
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (s: Supplier) => {
    setError(null);
    setImportSummary(null);
    setEditingId(s.id);

    const nextForm = {
      name: s.name || "",
      contact_person: s.contact_person || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
    };

    setFormBoth(nextForm);
    editRowRefs.current = [];
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this supplier? (Soft delete)"
    );
    if (!confirmDelete) return;

    setError(null);
    setImportSummary(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/suppliers/${id}`);
      await fetchSuppliers();
      if (editingId === id) resetForm();
      setToast({ message: "Supplier deleted successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to delete supplier.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------------- Optional: Export/Import ---------------- */

  const handleExport = async () => {
    setError(null);
    setImportSummary(null);
    setExporting(true);
    try {
      const res = await api.get("/api/suppliers/export", {
        responseType: "blob",
      });

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "suppliers.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setToast({ message: "Suppliers exported successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to export suppliers.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setImportSummary(null);
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/api/suppliers/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const { created, updated, errors: importErrors } = res.data || {};
      let summary = `Import completed. Created: ${created ?? 0}, Updated: ${
        updated ?? 0
      }`;
      if (importErrors && importErrors.length > 0) {
        summary += `, Errors: ${importErrors.length}`;
      }
      setImportSummary(summary);

      setToast({ message: "Suppliers imported successfully.", type: "success" });

      await fetchSuppliers();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error || "Failed to import suppliers from Excel.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ---------------- Excel-like key handlers ---------------- */

  const makeAddRowKeyDown =
    (index: number) =>
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (index < LAST_INDEX) {
        const next = addRowRefs.current[index + 1];
        if (next) next.focus();
      } else {
        if (!loading) saveSupplier();
      }
    };

  const makeEditRowKeyDown =
    (index: number) =>
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (index < LAST_INDEX) {
        const next = editRowRefs.current[index + 1];
        if (next) next.focus();
      } else {
        if (!loading) saveSupplier();
      }
    };

  /* ---------------- ✅ Payment Popup handlers ---------------- */

  const openPaymentPopup = (s: Supplier) => {
    setPaySupplier(s);
    setPayErr(null);
    setPayOpen(true);
    setPayForm({
      payment_date: "",
      amount: "",
      payment_mode: "BANK",
      ref_no: "",
      notes: "",
    });
  };

  const submitPaymentPopup = async () => {
    if (!paySupplier?.id) return;

    const amount = clamp(num(payForm.amount), 0, 999999999);
    if (!amount || amount <= 0) {
      setPayErr("Enter valid amount.");
      return;
    }

    setPaySaving(true);
    setPayErr(null);

    try {
      const payload: any = {
        amount,
        pay_date: payForm.payment_date || undefined, // ✅ backend expects pay_date
        payment_mode: payForm.payment_mode?.trim() || null,
        ref_no: payForm.ref_no?.trim() || null,
        notes: payForm.notes?.trim() || null,
      };

      await api.post(`/api/suppliers/${paySupplier.id}/payments`, payload);

      setToast({ message: "Payment saved successfully.", type: "success" });
      setPayOpen(false);

      // if ledger popup is open for same supplier, refresh ledger & balance
      if (ledgerOpen && ledgerSupplier?.id === paySupplier.id) {
        await openLedgerPopup(paySupplier);
      }
    } catch (e: any) {
      console.error(e);
      setPayErr(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          "Payment create failed."
      );
    } finally {
      setPaySaving(false);
    }
  };

  /* ---------------- ✅ Ledger Popup handlers ---------------- */

  const fetchBalance = async (supplierId: number) => {
    setBalanceLoading(true);
    try {
      const res = await api.get<BalanceResponse>(
        `/api/suppliers/${supplierId}/balance`
      );
      setBalanceRow((res?.data as any) || null);
    } catch (e) {
      console.error("balance load error:", e);
      setBalanceRow(null);
    } finally {
      setBalanceLoading(false);
    }
  };

  const openLedgerPopup = async (s: Supplier) => {
    if (!s?.id) return;

    setLedgerSupplier(s);
    setLedgerOpen(true);
    setLedgerLoading(true);
    setLedgerError(null);
    setLedgerRows([]);
    setBalanceRow(null);

    try {
      // run in parallel
      await Promise.all([
        (async () => {
          const res = await api.get(`/api/suppliers/${s.id}/ledger`);

          const raw =
            (res.data as any)?.rows ??
            (res.data as any)?.ledger ??
            (res.data as any)?.txns ??
            (res.data as any)?.transactions ??
            (Array.isArray(res.data) ? res.data : []);

          const list = Array.isArray(raw) ? raw : [];

          const mapped: LedgerRow[] = list.map((x: any) => ({
            date:
              x.date ?? x.txn_date ?? x.transaction_date ?? x.createdAt ?? null,
            ref_no: x.ref_no ?? x.reference_no ?? x.refNo ?? null,
            description:
              x.description ?? x.narration ?? x.remarks ?? x.txn_type ?? null,
            debit: x.debit ?? 0,
            credit: x.credit ?? 0,
            balance:
              x.balance ??
              x.running_balance ??
              x.closing_balance ??
              x.after_balance ??
              null,
          }));

          setLedgerRows(mapped);
        })(),
        fetchBalance(s.id),
      ]);
    } catch (e: any) {
      console.error(e);
      setLedgerError(e?.response?.data?.error || "Failed to load ledger");
      setLedgerRows([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  /* ---------------- UI ---------------- */

  const visibleSuppliers = useMemo(() => suppliers, [suppliers]);

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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg animate-pulse">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg tracking-tight">
              Supplier Management
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Onboard • Payments • Ledger
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-slate-800">
              {user?.name || "User"}
            </span>
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
        {/* Header with Actions */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
              Supplier Directory
            </h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || listLoading || suppliers.length === 0}
              className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm"
            >
              <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
              {exporting ? "Exporting..." : "Export Excel"}
            </button>

            <label className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 cursor-pointer text-xs sm:text-sm">
              <Upload className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
              <span>{importing ? "Importing..." : "Import Excel"}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportChange}
                disabled={importing}
              />
            </label>

            <span className="text-[11px] sm:text-xs text-slate-500 hidden sm:block">
              Use export as template for bulk updates.
            </span>
          </div>
        </section>

        {/* Alerts */}
        {(error || importSummary) && (
          <div className="space-y-3">
            {error && (
              <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-2 text-xs sm:text-sm text-red-700">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                    !
                  </div>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {importSummary && !error && (
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-2 text-xs sm:text-sm text-emerald-700">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <span>{importSummary}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              Suppliers ({visibleSuppliers.length})
            </h2>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[11px] sm:text-xs px-3 py-1.5 border border-slate-200 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {listLoading ? (
            <div className="flex items-center justify-center py-10 text-xs sm:text-sm text-slate-600">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading suppliers...
            </div>
          ) : visibleSuppliers.length === 0 && !editingId ? (
            <div className="text-xs sm:text-sm text-slate-500 py-4 mb-3">
              Start typing in the row below headers to add your first supplier.
            </div>
          ) : null}

          <div className="overflow-auto max-h-[520px] rounded-xl border border-slate-200/80 shadow-inner">
            <table className="w-full text-[11px] sm:text-sm border-collapse bg-white">
              <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-20">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Supplier
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Contact Person
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Phone
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Address
                  </th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700 border-b border-slate-200">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* ADD ROW */}
                <tr className="bg-slate-50/80">
                  <td className="px-3 py-1.5 border-b border-slate-200">
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[0] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(0)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Supplier name"
                    />
                  </td>

                  <td className="px-3 py-1.5 border-b border-slate-200">
                    <input
                      name="contact_person"
                      value={form.contact_person}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[1] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(1)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Contact person"
                    />
                  </td>

                  <td className="px-3 py-1.5 border-b border-slate-200">
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[2] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(2)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Phone"
                    />
                  </td>

                  <td className="px-3 py-1.5 border-b border-slate-200">
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[3] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(3)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Email"
                    />
                  </td>

                  <td className="px-3 py-1.5 border-b border-slate-200">
                    <textarea
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[4] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(4)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                      rows={1}
                      placeholder="Address"
                    />
                  </td>

                  <td className="px-3 py-1.5 border-b border-slate-200 text-center">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={saveSupplier}
                      className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] sm:text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                    >
                      {loading ? "Saving..." : "Add"}
                    </button>
                  </td>
                </tr>

                {/* DATA ROWS */}
                {visibleSuppliers.map((s) =>
                  editingId === s.id ? (
                    <tr key={s.id} className="bg-yellow-50/70">
                      <td className="px-3 py-1.5 border-b border-slate-200">
                        <input
                          name="name"
                          value={form.name}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[0] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(0)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="px-3 py-1.5 border-b border-slate-200">
                        <input
                          name="contact_person"
                          value={form.contact_person}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[1] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(1)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="px-3 py-1.5 border-b border-slate-200">
                        <input
                          name="phone"
                          value={form.phone}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[2] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(2)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="px-3 py-1.5 border-b border-slate-200">
                        <input
                          name="email"
                          type="email"
                          value={form.email}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[3] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(3)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="px-3 py-1.5 border-b border-slate-200">
                        <textarea
                          name="address"
                          value={form.address}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[4] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(4)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                          rows={1}
                        />
                      </td>

                      <td className="px-3 py-1.5 border-b border-slate-200 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={saveSupplier}
                            className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[11px] sm:text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                          >
                            {loading ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={resetForm}
                            className="inline-flex items-center justify-center h-8 px-3 rounded-full border border-slate-300 bg-white text-[11px] sm:text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      <td className="px-3 py-2 border-b border-slate-200 font-medium text-slate-800">
                        {s.name || "-"}
                      </td>

                      <td className="px-3 py-2 border-b border-slate-200 text-slate-600">
                        {s.contact_person || "-"}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-600">
                        {s.phone || "-"}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-600">
                        {s.email || "-"}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-600">
                        <span className="line-clamp-2">{s.address || "-"}</span>
                      </td>

                      <td className="px-3 py-2 border-b border-slate-200">
                        <div className="flex items-center justify-center gap-2">
                          {/* ✅ Ledger popup */}
                          <button
                            type="button"
                            onClick={() => openLedgerPopup(s)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-slate-700 to-slate-900 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all opacity-90"
                            title="View Ledger"
                            aria-label="View Ledger"
                          >
                            <ScrollText className="w-3.5 h-3.5" />
                          </button>

                          {/* ✅ Payment popup */}
                          <button
                            type="button"
                            onClick={() => openPaymentPopup(s)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all opacity-90"
                            title="Add Payment"
                            aria-label="Add Payment"
                          >
                            <IndianRupee className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => handleEdit(s)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all opacity-80"
                            aria-label="Edit supplier"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDelete(s.id)}
                            disabled={deletingId === s.id}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Delete supplier"
                            title="Delete"
                          >
                            {deletingId === s.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* ---------------- Toast ---------------- */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm sm:text-base ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ---------------- ✅ Payment Modal ---------------- */}
      {payOpen && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full overflow-auto p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[900px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-emerald-50 flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      Add Supplier Payment (Credit)
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 truncate">
                      Supplier:{" "}
                      <span className="font-semibold text-slate-900">
                        {paySupplier?.name || "-"}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setPayOpen(false)}
                    className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  {payErr && (
                    <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                      {payErr}
                    </div>
                  )}

                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Payment Date
                      </label>
                      <input
                        type="date"
                        value={payForm.payment_date}
                        onChange={(e) =>
                          setPayForm((p) => ({
                            ...p,
                            payment_date: e.target.value,
                          }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                      />
                    </div>

                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Amount *
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={payForm.amount}
                        onChange={(e) =>
                          setPayForm((p) => ({ ...p, amount: e.target.value }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                        placeholder="0"
                      />
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Mode
                      </label>
                      <select
                        value={payForm.payment_mode}
                        onChange={(e) =>
                          setPayForm((p) => ({
                            ...p,
                            payment_mode: e.target.value,
                          }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] bg-white"
                      >
                        <option value="BANK">BANK</option>
                        <option value="CASH">CASH</option>
                        <option value="UPI">UPI</option>
                        <option value="CHEQUE">CHEQUE</option>
                        <option value="NEFT">NEFT</option>
                        <option value="RTGS">RTGS</option>
                      </select>
                    </div>

                    <div className="col-span-12 md:col-span-8">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Ref No (UTR/Cheque/Txn)
                      </label>
                      <input
                        value={payForm.ref_no}
                        onChange={(e) =>
                          setPayForm((p) => ({ ...p, ref_no: e.target.value }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                        placeholder="Optional..."
                      />
                    </div>

                    <div className="col-span-12">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Notes
                      </label>
                      <input
                        value={payForm.notes}
                        onChange={(e) =>
                          setPayForm((p) => ({ ...p, notes: e.target.value }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px]"
                        placeholder="Optional..."
                      />
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 border-t bg-slate-50 flex justify-end gap-2">
                  <button
                    onClick={() => setPayOpen(false)}
                    className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitPaymentPopup}
                    disabled={paySaving}
                    className="text-[12px] px-5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 font-semibold"
                  >
                    {paySaving ? "Saving..." : "Save Payment"}
                  </button>
                </div>
              </div>

              <div className="h-3" />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- ✅ Ledger Modal ---------------- */}
      {ledgerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="h-full w-full overflow-auto p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[1100px]">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50 flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      Supplier Ledger
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 truncate">
                      {ledgerSupplier?.name || "-"}
                    </div>
                  </div>

                  <button
                    onClick={() => setLedgerOpen(false)}
                    className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4">
                  {/* Balance row */}
                  <div className="mb-4 grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-4 border border-slate-200 rounded-2xl p-3 bg-slate-50">
                      <div className="text-[11px] text-slate-600">
                        Debit Total
                      </div>
                      <div className="mt-1 text-sm font-extrabold">
                        ₹{fmtMoney(balanceRow?.debit_total ?? 0)}
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-4 border border-slate-200 rounded-2xl p-3 bg-slate-50">
                      <div className="text-[11px] text-slate-600">
                        Credit Total
                      </div>
                      <div className="mt-1 text-sm font-extrabold">
                        ₹{fmtMoney(balanceRow?.credit_total ?? 0)}
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-4 border border-slate-200 rounded-2xl p-3 bg-white">
                      <div className="text-[11px] text-slate-600">
                        Balance (Debit - Credit)
                      </div>
                      <div className="mt-1 text-sm font-extrabold">
                        ₹{fmtMoney(balanceRow?.balance ?? 0)}
                      </div>
                      {balanceLoading && (
                        <div className="text-[11px] text-slate-500 mt-1">
                          Loading balance...
                        </div>
                      )}
                    </div>
                  </div>

                  {ledgerError && (
                    <div className="mb-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                      {ledgerError}
                    </div>
                  )}

                  {ledgerLoading ? (
                    <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Loading ledger...
                    </div>
                  ) : ledgerRows.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">
                      No ledger entries.
                    </div>
                  ) : (
                    <div className="overflow-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="border-b border-slate-200 px-3 py-2 text-left">
                              Date
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-left">
                              Ref
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-left">
                              Description
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right">
                              Debit
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right">
                              Credit
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-right">
                              Balance
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledgerRows.map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="border-b border-slate-200 px-3 py-2">
                                {formatDate(r.date || null)}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2">
                                {r.ref_no || "-"}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2">
                                {r.description || "-"}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2 text-right">
                                ₹{fmtMoney(r.debit)}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2 text-right">
                                ₹{fmtMoney(r.credit)}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">
                                {r.balance == null
                                  ? "-"
                                  : `₹${fmtMoney(r.balance)}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => setLedgerOpen(false)}
                      className="text-[12px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-3" />
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

export default SuppliersPageClient;
