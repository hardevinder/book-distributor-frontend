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
  ScrollText,
  IndianRupee,
  X,
  Search,
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
  supplier: { id: number; name: string };
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

const round2 = (v: any) => Math.round(num(v) * 100) / 100;

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

  /* ---------------- ✅ Search State ---------------- */

  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const combo = isMac
        ? e.metaKey && e.key.toLowerCase() === "k"
        : e.ctrlKey && e.key.toLowerCase() === "k";
      if (combo) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const normalize = (v: any) => String(v ?? "").toLowerCase().trim();

  /* ---------------- ✅ Payment Popup State ---------------- */

  const [payOpen, setPayOpen] = useState(false);
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);
  const [paySaving, setPaySaving] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  const [payForm, setPayForm] = useState({
    payment_date: "",
    amount: "",
    discount_percent: "", // ✅ NEW
    discount_amount: "", // ✅ NEW
    payment_mode: "BANK",
    ref_no: "",
    notes: "",
  });

  /* ---------------- ✅ Discount Helpers ---------------- */

  const setDiscountPercent = (pct: string) => {
    setPayForm((p) => {
      const amount = num(p.amount);
      const percent = pct === "" ? "" : String(clamp(num(pct), 0, 100));

      const discAmt =
        percent === "" || amount <= 0
          ? ""
          : String(round2((amount * num(percent)) / 100));

      return { ...p, discount_percent: percent, discount_amount: discAmt };
    });
  };

  const setDiscountAmount = (amt: string) => {
    setPayForm((p) => {
      const amount = num(p.amount);
      const disc = amt === "" ? "" : String(clamp(num(amt), 0, 999999999));

      const pct =
        disc === "" || amount <= 0
          ? ""
          : String(round2((num(disc) * 100) / amount));

      return { ...p, discount_amount: disc, discount_percent: pct };
    });
  };

  const setPaymentAmount = (val: string) => {
    setPayForm((p) => {
      const next = { ...p, amount: val };
      const amount = num(val);

      if (p.discount_percent?.trim()) {
        const pct = clamp(num(p.discount_percent), 0, 100);
        next.discount_amount =
          amount > 0 ? String(round2((amount * pct) / 100)) : "";
      } else if (p.discount_amount?.trim()) {
        const disc = clamp(num(p.discount_amount), 0, 999999999);
        next.discount_percent =
          amount > 0 ? String(round2((disc * 100) / amount)) : "";
      }

      return next;
    });
  };

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
      if (!cleanName) throw new Error("Supplier name is required.");

      const payload = { ...latest, name: cleanName };

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

    setFormBoth({
      name: s.name || "",
      contact_person: s.contact_person || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
    });

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
        addRowRefs.current[index + 1]?.focus();
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
        editRowRefs.current[index + 1]?.focus();
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
      discount_percent: "",
      discount_amount: "",
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

    const pct = payForm.discount_percent?.trim();
    const fix = payForm.discount_amount?.trim();
    if (pct && fix) {
      setPayErr("Enter either Discount % OR Discount Amount (not both).");
      return;
    }

    setPaySaving(true);
    setPayErr(null);

    try {
      const payload: any = {
        amount,
        pay_date: payForm.payment_date || undefined,
        payment_mode: payForm.payment_mode?.trim() || null,
        ref_no: payForm.ref_no?.trim() || null,
        notes: payForm.notes?.trim() || null,
      };

      if (pct) payload.discount_percent = clamp(num(pct), 0, 100);
      if (fix) payload.discount_amount = clamp(num(fix), 0, amount);

      await api.post(`/api/suppliers/${paySupplier.id}/payments`, payload);

      setToast({ message: "Payment saved successfully.", type: "success" });
      setPayOpen(false);

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

  /* ---------------- ✅ Search Filter ---------------- */

  const visibleSuppliers = useMemo(() => {
    const q = normalize(search);
    if (!q) return suppliers;

    return suppliers.filter((s) => {
      const hay = [
        s.name,
        s.contact_person,
        s.phone,
        s.email,
        s.address,
        s.id,
      ]
        .map((x) => normalize(x))
        .join(" ");
      return hay.includes(q);
    });
  }, [suppliers, search]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden relative">
      {/* background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000" />
        <div className="absolute top-40 left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000" />
      </div>

      {/* ✅ ULTRA COMPACT TOP BAR */}
      <header className="relative z-10 bg-white/95 backdrop-blur-md border-b border-slate-200/50 shadow">
        <div className="px-2 sm:px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Left: Back */}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700"
              title="Back"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-[12px] font-semibold hidden sm:inline">
                Back
              </span>
            </Link>

            {/* Title */}
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow">
                <BookOpen className="w-4 h-4" />
              </span>
              <span className="text-sm sm:text-base font-extrabold tracking-tight">
                Supplier Manage
              </span>
              <span className="text-[11px] text-slate-500 font-semibold">
                ({visibleSuppliers.length}
                {search.trim() ? `/${suppliers.length}` : ""})
              </span>
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-[180px] sm:min-w-[260px] max-w-[520px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search… (Ctrl+K)"
                className="w-full pl-9 pr-8 py-2 rounded-full border border-slate-200 bg-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {search.trim() && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100"
                  title="Clear"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              )}
            </div>

            {/* Actions */}
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || listLoading || suppliers.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold shadow hover:shadow-md disabled:opacity-60"
              title="Export Excel"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">
                {exporting ? "..." : "Export"}
              </span>
            </button>

            <label
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-semibold shadow hover:shadow-md cursor-pointer"
              title="Import Excel"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">
                {importing ? "..." : "Import"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportChange}
                disabled={importing}
              />
            </label>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title="Cancel Edit"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Cancel</span>
              </button>
            )}

            {/* Right: user + logout */}
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden md:inline text-xs text-slate-600 font-semibold">
                {user?.name || "User"}
              </span>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-gradient-to-r from-rose-500 to-red-600 text-white text-xs font-semibold shadow hover:shadow-md"
                title="Logout"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 p-2 sm:p-3 lg:p-4 space-y-2">
        {/* Alerts */}
        {(error || importSummary) && (
          <div className="space-y-2">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            {importSummary && !error && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-700">
                {importSummary}
              </div>
            )}
          </div>
        )}

        {/* Table container */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl p-2 sm:p-3 shadow border border-slate-200/60">
          {listLoading ? (
            <div className="flex items-center justify-center py-6 text-xs text-slate-600">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading...
            </div>
          ) : visibleSuppliers.length === 0 && !editingId ? (
            <div className="text-xs text-slate-500 py-2">
              {search.trim()
                ? "No suppliers match your search."
                : "Add your first supplier in the top row."}
            </div>
          ) : null}

          <div className="overflow-auto max-h-[78vh] rounded-xl border border-slate-200/80">
            <table className="w-full text-[11px] sm:text-xs border-collapse bg-white">
              <thead className="bg-slate-100 sticky top-0 z-20">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Supplier
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Contact
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Phone
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Email
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Address
                  </th>
                  <th className="px-2 py-2 text-center font-semibold text-slate-700 border-b border-slate-200">
                    Act
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* ADD ROW */}
                <tr className="bg-slate-50/80">
                  <td className="px-2 py-1 border-b border-slate-200">
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[0] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(0)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Supplier"
                    />
                  </td>

                  <td className="px-2 py-1 border-b border-slate-200">
                    <input
                      name="contact_person"
                      value={form.contact_person}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[1] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(1)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Contact"
                    />
                  </td>

                  <td className="px-2 py-1 border-b border-slate-200">
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[2] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(2)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Phone"
                    />
                  </td>

                  <td className="px-2 py-1 border-b border-slate-200">
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[3] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(3)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Email"
                    />
                  </td>

                  <td className="px-2 py-1 border-b border-slate-200">
                    <textarea
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[4] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(4)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                      rows={1}
                      placeholder="Address"
                    />
                  </td>

                  <td className="px-2 py-1 border-b border-slate-200 text-center">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={saveSupplier}
                      className="inline-flex items-center justify-center h-7 px-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] font-bold shadow disabled:opacity-60"
                    >
                      {loading ? "..." : "Add"}
                    </button>
                  </td>
                </tr>

                {/* DATA ROWS */}
                {visibleSuppliers.map((s) =>
                  editingId === s.id ? (
                    <tr key={s.id} className="bg-yellow-50/70">
                      <td className="px-2 py-1 border-b border-slate-200">
                        <input
                          name="name"
                          value={form.name}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[0] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(0)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="px-2 py-1 border-b border-slate-200">
                        <input
                          name="contact_person"
                          value={form.contact_person}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[1] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(1)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="px-2 py-1 border-b border-slate-200">
                        <input
                          name="phone"
                          value={form.phone}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[2] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(2)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="px-2 py-1 border-b border-slate-200">
                        <input
                          name="email"
                          type="email"
                          value={form.email}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[3] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(3)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="px-2 py-1 border-b border-slate-200">
                        <textarea
                          name="address"
                          value={form.address}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[4] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(4)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                          rows={1}
                        />
                      </td>

                      <td className="px-2 py-1 border-b border-slate-200 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={saveSupplier}
                            className="inline-flex items-center justify-center h-7 px-3 rounded-full bg-slate-900 text-white text-[11px] font-bold disabled:opacity-60"
                          >
                            {loading ? "..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={resetForm}
                            className="inline-flex items-center justify-center h-7 px-3 rounded-full border border-slate-300 bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-2 py-2 border-b border-slate-200 font-semibold text-slate-800">
                        {s.name || "-"}
                      </td>
                      <td className="px-2 py-2 border-b border-slate-200 text-slate-600">
                        {s.contact_person || "-"}
                      </td>
                      <td className="px-2 py-2 border-b border-slate-200 text-slate-600">
                        {s.phone || "-"}
                      </td>
                      <td className="px-2 py-2 border-b border-slate-200 text-slate-600">
                        {s.email || "-"}
                      </td>
                      <td className="px-2 py-2 border-b border-slate-200 text-slate-600">
                        <span className="line-clamp-2">{s.address || "-"}</span>
                      </td>
                      <td className="px-2 py-2 border-b border-slate-200">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openLedgerPopup(s)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-slate-900 text-white shadow"
                            title="Ledger"
                          >
                            <ScrollText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openPaymentPopup(s)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-600 text-white shadow"
                            title="Payment"
                          >
                            <IndianRupee className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(s)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-indigo-600 text-white shadow"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s.id)}
                            disabled={deletingId === s.id}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-rose-600 text-white shadow disabled:opacity-40"
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

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-3 right-3 z-50 px-3 py-2 rounded-xl shadow text-xs sm:text-sm ${
            toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          } text-white`}
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
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right"
                        placeholder="0"
                      />
                    </div>

                    {/* ✅ Discount % */}
                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Discount %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={payForm.discount_percent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                        disabled={!!payForm.discount_amount?.trim()}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right disabled:bg-slate-100"
                        placeholder="0"
                      />
                      <div className="text-[10px] text-slate-500 mt-1">
                        Enter % OR fixed amount (one only)
                      </div>
                    </div>

                    {/* ✅ Discount Amount */}
                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Discount Amount
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={payForm.discount_amount}
                        onChange={(e) => setDiscountAmount(e.target.value)}
                        disabled={!!payForm.discount_percent?.trim()}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-[12px] text-right disabled:bg-slate-100"
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

                    {/* ✅ Summary line */}
                    <div className="col-span-12">
                      <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Cash Paid: <b>₹{fmtMoney(num(payForm.amount))}</b>
                        </span>
                        <span>
                          Discount:{" "}
                          <b>
                            ₹{fmtMoney(num(payForm.discount_amount || 0))}
                          </b>
                        </span>
                        <span>
                          Total Settled:{" "}
                          <b>
                            ₹
                            {fmtMoney(
                              num(payForm.amount) +
                                num(payForm.discount_amount || 0)
                            )}
                          </b>
                        </span>
                      </div>
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
                                {r.balance == null ? "-" : `₹${fmtMoney(r.balance)}`}
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
