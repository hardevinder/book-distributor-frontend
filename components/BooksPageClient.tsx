"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  Pencil,
  Trash2,
  BookOpen,
  Upload,
  Download,
  ChevronLeft,
  Sparkles,
} from "lucide-react";

/* ---------------- Types ---------------- */

type Publisher = { id: number; name: string };
type Supplier = { id: number; name: string };

type ClassItem = {
  id: number;
  class_name: string;
  sort_order: number;
  is_active: boolean;
};

type Book = {
  id: number;
  title: string;
  class_name?: string | null;
  subject?: string | null;
  medium?: string | null;

  mrp?: number | string | null;

  // ✅ NEW
  discount_percent?: number | string | null;
  rate?: number | string | null;
  supplier_id?: number | null;
  supplier?: Supplier | null;

  // keep old field if still used in your system
  selling_price?: number | string | null;

  is_active: boolean;

  publisher_id: number;
  publisher?: Publisher | null;
};

type BookFormState = {
  title: string;
  class_name: string;
  subject: string;
  medium: string;
  mrp: string;

  // ✅ NEW
  discount_percent: string;
  rate: string;

  // keep old
  selling_price: string;

  is_active: boolean;
};

const emptyBookForm: BookFormState = {
  title: "",
  class_name: "",
  subject: "",
  medium: "",
  mrp: "",
  discount_percent: "",
  rate: "",
  selling_price: "",
  is_active: true,
};

type BooksListResponse = Book[] | { data: Book[]; meta?: any };
type ClassesListResponse = ClassItem[] | { data: ClassItem[]; meta?: any };
type SuppliersListResponse = Supplier[] | { data: Supplier[]; meta?: any };

const normalizeBooks = (payload: BooksListResponse): Book[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

const normalizeClasses = (payload: ClassesListResponse): ClassItem[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

const normalizeSuppliers = (payload: SuppliersListResponse): Supplier[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

const formatAmount = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "-";
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;
  if (Number.isNaN(num)) return String(value);
  return num.toFixed(2);
};

const toNumOrNull = (v: string): number | null => {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// client-side auto calc rate
const calcRate = (mrpStr: string, discountStr: string): string => {
  const mrp = toNumOrNull(mrpStr);
  const disc = toNumOrNull(discountStr);
  if (mrp === null || disc === null) return "";
  const r = mrp - (mrp * disc) / 100;
  if (!Number.isFinite(r)) return "";
  return (Math.round(r * 100) / 100).toFixed(2);
};

type ToastState = { message: string; type: "success" | "error" } | null;

const BooksPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [books, setBooks] = useState<Book[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [form, setForm] = useState<BookFormState>(emptyBookForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterPublisherId, setFilterPublisherId] = useState<string>("");
  const [filterSupplierId, setFilterSupplierId] = useState<string>("");
  const [filterClassName, setFilterClassName] = useState<string>("");

  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [toast, setToast] = useState<ToastState>(null);

  // Publisher combo text (for add + edit)
  const [publisherInput, setPublisherInput] = useState<string>("");

  // ✅ Supplier combo text (for add + edit)
  const [supplierInput, setSupplierInput] = useState<string>("");

  // Excel-style navigation refs
  const addRowRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>([]);
  const editRowRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>(
    []
  );

  // ✅ Updated indices:
  // 0 title, 1 class, 2 subject, 3 publisher, 4 supplier, 5 mrp, 6 discount, 7 rate, 8 active
  const LAST_INDEX = 8;

  // ✅ FIX: callback refs must return void (and we keep it consistent)
  const setAddRef =
    (i: number) =>
    (el: HTMLInputElement | HTMLSelectElement | null) => {
      addRowRefs.current[i] = el;
    };

  const setEditRef =
    (i: number) =>
    (el: HTMLInputElement | HTMLSelectElement | null) => {
      editRowRefs.current[i] = el;
    };

  /* -------------------- FETCH HELPERS -------------------- */

  const fetchPublishers = async () => {
    try {
      const res = await api.get<Publisher[]>("/api/publishers");
      const sorted = [...(res.data || [])].sort(
        (a, b) => (b.id || 0) - (a.id || 0)
      );
      setPublishers(sorted);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await api.get<SuppliersListResponse>("/api/suppliers", {
        params: { is_active: "true", limit: 500 },
      });
      const rows = normalizeSuppliers(res.data);
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setSuppliers(rows);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await api.get<ClassesListResponse>("/api/classes", {
        params: { is_active: "true", limit: 200 },
      });
      const rows = normalizeClasses(res.data);
      rows.sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.class_name.localeCompare(b.class_name)
      );
      setClasses(rows);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBooks = async (
    query?: string,
    publisherId?: string,
    supplierId?: string,
    className?: string
  ) => {
    setListLoading(true);
    try {
      const params: any = {};
      if (query && query.trim()) params.q = query.trim();
      if (publisherId) params.publisherId = publisherId;
      if (supplierId) params.supplierId = supplierId;
      if (className) params.className = className;

      const res = await api.get<BooksListResponse>("/api/books", { params });
      setBooks(normalizeBooks(res.data));
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load books.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchPublishers();
    fetchSuppliers();
    fetchClasses();
    fetchBooks();
  }, []);

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  /* -------------------- FORM HANDLERS -------------------- */

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;

    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: checked }));
      return;
    }

    // ✅ Auto-calc rate when MRP or Discount changes (only if rate is empty OR looks auto)
    if (name === "mrp" || name === "discount_percent") {
      setForm((prev) => {
        const next = { ...prev, [name]: value };
        const autoRate = calcRate(next.mrp, next.discount_percent);
        const prevAuto = calcRate(prev.mrp, prev.discount_percent);
        const rateWasAutoOrEmpty = !prev.rate || prev.rate === prevAuto;
        if (rateWasAutoOrEmpty) next.rate = autoRate;
        return next;
      });
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm(emptyBookForm);
    setPublisherInput("");
    setSupplierInput("");
    setEditingId(null);
    editRowRefs.current = [];
  };

  const buildPayload = (publisherId: number, supplierId: number | null) => {
    if (!form.title.trim()) throw new Error("Title is required.");

    const mrpNum = form.mrp ? Number(form.mrp) : 0;
    const discountNum =
      form.discount_percent.trim() === "" ? null : Number(form.discount_percent);
    const rateNum = form.rate.trim() === "" ? null : Number(form.rate);

    return {
      title: form.title.trim(),
      publisher_id: publisherId,
      supplier_id: supplierId,
      class_name: form.class_name.trim() || null,
      subject: form.subject.trim() || null,
      medium: form.medium.trim() || null,
      mrp: Number.isFinite(mrpNum) ? mrpNum : 0,

      discount_percent:
        discountNum === null || Number.isNaN(discountNum) ? null : discountNum,
      rate: rateNum === null || Number.isNaN(rateNum) ? null : rateNum,

      selling_price: form.selling_price ? Number(form.selling_price) : null,

      is_active: form.is_active,
    };
  };

  const resolvePublisherId = async (): Promise<number> => {
    const pubName = publisherInput.trim();
    if (!pubName) throw new Error("Publisher is required.");

    const existing = publishers.find(
      (p) => p.name.toLowerCase() === pubName.toLowerCase()
    );

    if (existing) return existing.id;

    const res = await api.post("/api/publishers", { name: pubName });
    const newPublisher: Publisher = res.data;
    setPublishers((prev) => [newPublisher, ...prev]);
    return newPublisher.id;
  };

  const resolveSupplierId = (): number | null => {
    const sName = supplierInput.trim();
    if (!sName) return null;

    const existing = suppliers.find(
      (s) => s.name.toLowerCase() === sName.toLowerCase()
    );
    if (!existing) {
      throw new Error(
        `Supplier "${sName}" not found. Please create it in Supplier Master first.`
      );
    }
    return existing.id;
  };

  const saveBook = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!form.title.trim()) throw new Error("Title is required.");

      const publisherId = await resolvePublisherId();
      const supplierId = resolveSupplierId();

      // auto-create class if typed & missing
      const className = form.class_name.trim();
      if (className) {
        const existingClass = classes.find(
          (c) => c.class_name.toLowerCase() === className.toLowerCase()
        );
        if (!existingClass) {
          try {
            const resClass = await api.post("/api/classes", {
              class_name: className,
              sort_order: 0,
              is_active: true,
            });
            const newClass: ClassItem = resClass.data;
            setClasses((prev) => [...prev, newClass]);
          } catch (err) {
            console.error("Failed to auto-create class:", err);
          }
        }
      }

      const payload = buildPayload(publisherId, supplierId);

      if (editingId) {
        await api.put(`/api/books/${editingId}`, payload);
        setToast({ message: "Book updated successfully.", type: "success" });
      } else {
        await api.post("/api/books", payload);
        setToast({ message: "Book added successfully.", type: "success" });
      }

      resetForm();
      await fetchBooks(search, filterPublisherId, filterSupplierId, filterClassName);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        (editingId ? "Failed to update book." : "Failed to create book.");
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (book: Book) => {
    setError(null);
    setEditingId(book.id);

    setForm({
      title: book.title || "",
      class_name: book.class_name || "",
      subject: book.subject || "",
      medium: book.medium || "",
      mrp: book.mrp !== null && book.mrp !== undefined ? String(book.mrp) : "",

      discount_percent:
        book.discount_percent !== null && book.discount_percent !== undefined
          ? String(book.discount_percent)
          : "",
      rate: book.rate !== null && book.rate !== undefined ? String(book.rate) : "",

      selling_price:
        book.selling_price !== null && book.selling_price !== undefined
          ? String(book.selling_price)
          : "",

      is_active: book.is_active,
    });

    const pubNameFromBook =
      book.publisher?.name ||
      publishers.find((p) => p.id === book.publisher_id)?.name ||
      "";
    setPublisherInput(pubNameFromBook);

    const supNameFromBook =
      book.supplier?.name ||
      (book.supplier_id
        ? suppliers.find((s) => s.id === book.supplier_id)?.name || ""
        : "");
    setSupplierInput(supNameFromBook);

    editRowRefs.current = [];
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this book record?"
    );
    if (!confirmDelete) return;

    setError(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/books/${id}`);
      if (editingId === id) resetForm();
      await fetchBooks(search, filterPublisherId, filterSupplierId, filterClassName);
      setToast({ message: "Book deleted successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      setError("Failed to delete book.");
      setToast({ message: "Failed to delete book.", type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  /* -------------------- SEARCH & FILTERS -------------------- */

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      fetchBooks(value, filterPublisherId, filterSupplierId, filterClassName);
    }, 400);
  };

  const handlePublisherFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value;
    setFilterPublisherId(value);
    fetchBooks(search, value, filterSupplierId, filterClassName);
  };

  const handleSupplierFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value;
    setFilterSupplierId(value);
    fetchBooks(search, filterPublisherId, value, filterClassName);
  };

  const handleClassFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilterClassName(value);
    fetchBooks(search, filterPublisherId, filterSupplierId, value);
  };

  /* ----------------- IMPORT / EXPORT ----------------- */

  const triggerImport = () => {
    setError(null);
    if (importInputRef.current) {
      importInputRef.current.value = "";
      importInputRef.current.click();
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/api/books/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const { created, updated, errors } = res.data || {};
      const errorCount = Array.isArray(errors) ? errors.length : 0;

      setToast({
        message: `Import: ${created ?? 0} new, ${updated ?? 0} updated, ${errorCount} error(s).`,
        type: "success",
      });

      await fetchBooks(search, filterPublisherId, filterSupplierId, filterClassName);
      await fetchPublishers();
      await fetchSuppliers();
      await fetchClasses();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error ||
        "Failed to import books. Please check the file format.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setImportLoading(false);
    }
  };

  const handleExport = async () => {
    setError(null);
    setExportLoading(true);

    try {
      const res = await api.get("/api/books/export", { responseType: "blob" });

      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/octet-stream",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "books.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setToast({ message: "Books exported successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      setError("Failed to export books.");
      setToast({ message: "Failed to export books.", type: "error" });
    } finally {
      setExportLoading(false);
    }
  };

  /* ----------------- EXCEL-LIKE KEY NAV ----------------- */

  const makeAddRowKeyDown =
    (index: number) =>
    (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>): void => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (index < LAST_INDEX) {
        const next = addRowRefs.current[index + 1];
        if (next) next.focus();
      } else {
        if (!loading) saveBook();
      }
    };

  const makeEditRowKeyDown =
    (index: number) =>
    (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>): void => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (index < LAST_INDEX) {
        const next = editRowRefs.current[index + 1];
        if (next) next.focus();
      } else {
        if (!loading) saveBook();
      }
    };

  /* -------------------- UI -------------------- */

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
            <span className="text-base sm:text-lg tracking-tight">Book Master</span>
            <span className="text-xs text-slate-500 font-medium">
              Class-wise • Publisher-wise • Supplier-wise catalogue
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
        <section className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md">
                <Sparkles className="w-4 h-4" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                Books Catalogue
              </h1>
            </div>
            <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
              Excel-like <span className="font-semibold">inline entry & editing</span>{" "}
              for class-wise books with supplier pricing (MRP, discount & rate).
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {/* Search + Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                className="px-3 py-2 border border-slate-300 rounded-full text-xs sm:text-sm min-w-[220px] bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                placeholder="Search by title / subject / isbn..."
              />

              <select
                value={filterClassName}
                onChange={handleClassFilterChange}
                className="px-3 py-2 border border-slate-300 rounded-full text-xs sm:text-sm bg-white min-w-[150px] shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="">All classes</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.class_name}>
                    {cls.class_name}
                  </option>
                ))}
              </select>

              <select
                value={filterPublisherId}
                onChange={handlePublisherFilterChange}
                className="px-3 py-2 border border-slate-300 rounded-full text-xs sm:text-sm bg-white min-w-[180px] shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="">All publishers</option>
                {publishers.map((pub) => (
                  <option key={pub.id} value={pub.id.toString()}>
                    {pub.name}
                  </option>
                ))}
              </select>

              <select
                value={filterSupplierId}
                onChange={handleSupplierFilterChange}
                className="px-3 py-2 border border-slate-300 rounded-full text-xs sm:text-sm bg-white min-w-[180px] shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                <option value="">All suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id.toString()}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Import / Export */}
            <input
              type="file"
              accept=".xlsx,.xls"
              ref={importInputRef}
              onChange={handleImportFileChange}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={exportLoading || listLoading || books.length === 0}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm"
              >
                <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                {exportLoading ? "Exporting..." : "Export Excel"}
              </button>

              <button
                type="button"
                onClick={triggerImport}
                disabled={importLoading}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm"
              >
                <Upload className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                {importLoading ? "Importing..." : "Import Excel"}
              </button>

              <span className="text-[11px] sm:text-xs text-slate-500 hidden sm:block">
                Use export as template for bulk updates.
              </span>
            </div>
          </div>
        </section>

        {/* Error alert */}
        {error && (
          <section>
            <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 shadow-sm text-xs sm:text-sm text-red-700 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                !
              </div>
              <span>{error}</span>
            </div>
          </section>
        )}

        {/* Table */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              Books ({books.length})
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
              Loading books...
            </div>
          ) : books.length === 0 && !editingId ? (
            <div className="text-xs sm:text-sm text-slate-500 py-4 mb-3">
              Start typing in the row below headers to add your first book.
            </div>
          ) : null}

          <div className="overflow-auto max-h-[520px] rounded-xl border border-slate-200/80 shadow-inner">
            <table className="w-full text-xs sm:text-sm border-collapse bg-white table-fixed">
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "4%" }} />
                <col style={{ width: "2%" }} />
              </colgroup>

              <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-20">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    Title
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    Class
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    Subject
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    Publisher
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    Supplier
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    MRP
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    Disc %
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    Rate
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                    Active
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                    •
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* ADD ROW */}
                <tr className="bg-slate-50/80">
                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      name="title"
                      value={form.title}
                      onChange={handleChange}
                      ref={setAddRef(0)}
                      onKeyDown={makeAddRowKeyDown(0)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Book title"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      list="classOptions"
                      name="class_name"
                      value={form.class_name}
                      onChange={handleChange}
                      ref={setAddRef(1)}
                      onKeyDown={makeAddRowKeyDown(1)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Class"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      name="subject"
                      value={form.subject}
                      onChange={handleChange}
                      ref={setAddRef(2)}
                      onKeyDown={makeAddRowKeyDown(2)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Subject"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      list="publisherOptions"
                      value={publisherInput}
                      onChange={(e) => setPublisherInput(e.target.value)}
                      ref={setAddRef(3)}
                      onKeyDown={makeAddRowKeyDown(3)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Publisher"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      list="supplierOptions"
                      value={supplierInput}
                      onChange={(e) => setSupplierInput(e.target.value)}
                      ref={setAddRef(4)}
                      onKeyDown={makeAddRowKeyDown(4)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Supplier"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      name="mrp"
                      type="number"
                      step="0.01"
                      value={form.mrp}
                      onChange={handleChange}
                      ref={setAddRef(5)}
                      onKeyDown={makeAddRowKeyDown(5)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="0.00"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      name="discount_percent"
                      type="number"
                      step="0.01"
                      value={form.discount_percent}
                      onChange={handleChange}
                      ref={setAddRef(6)}
                      onKeyDown={makeAddRowKeyDown(6)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="0"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      name="rate"
                      type="number"
                      step="0.01"
                      value={form.rate}
                      onChange={handleChange}
                      ref={setAddRef(7)}
                      onKeyDown={makeAddRowKeyDown(7)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="0.00"
                      title="Unit Price (Per Book)"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={form.is_active}
                      onChange={handleChange}
                      ref={setAddRef(8)}
                      onKeyDown={makeAddRowKeyDown(8)}
                      className="h-4 w-4"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={saveBook}
                      className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                    >
                      {loading ? "Saving..." : "Add"}
                    </button>
                  </td>
                </tr>

                {/* DATA ROWS */}
                {books.map((b) =>
                  editingId === b.id ? (
                    <tr key={b.id} className="bg-yellow-50/70">
                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          name="title"
                          value={form.title}
                          onChange={handleChange}
                          ref={setEditRef(0)}
                          onKeyDown={makeEditRowKeyDown(0)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          list="classOptions"
                          name="class_name"
                          value={form.class_name}
                          onChange={handleChange}
                          ref={setEditRef(1)}
                          onKeyDown={makeEditRowKeyDown(1)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          name="subject"
                          value={form.subject}
                          onChange={handleChange}
                          ref={setEditRef(2)} 
                          onKeyDown={makeEditRowKeyDown(2)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          list="publisherOptions"
                          value={publisherInput}
                          onChange={(e) => setPublisherInput(e.target.value)}
                          ref={setEditRef(3)}
                          onKeyDown={makeEditRowKeyDown(3)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          list="supplierOptions"
                          value={supplierInput}
                          onChange={(e) => setSupplierInput(e.target.value)}
                          ref={setEditRef(4)}
                          onKeyDown={makeEditRowKeyDown(4)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          name="mrp"
                          type="number"
                          step="0.01"
                          value={form.mrp}
                          onChange={handleChange}
                          ref={setEditRef(5)}
                          onKeyDown={makeEditRowKeyDown(5)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white text-right focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          name="discount_percent"
                          type="number"
                          step="0.01"
                          value={form.discount_percent}
                          onChange={handleChange}
                          ref={setEditRef(6)}
                          onKeyDown={makeEditRowKeyDown(6)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white text-right focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          name="rate"
                          type="number"
                          step="0.01"
                          value={form.rate}
                          onChange={handleChange}
                          ref={setEditRef(7)}
                          onKeyDown={makeEditRowKeyDown(7)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white text-right focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                        <input
                          type="checkbox"
                          name="is_active"
                          checked={form.is_active}
                          onChange={handleChange}
                          ref={setEditRef(8)}
                          onKeyDown={makeEditRowKeyDown(8)}
                          className="h-4 w-4"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={saveBook}
                            className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                          >
                            {loading ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={resetForm}
                            className="inline-flex items-center justify-center h-8 px-3 rounded-full border border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="border-b border-slate-200 px-3 py-2">
                        <div className="font-semibold text-slate-800 truncate">
                          {b.title}
                        </div>
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2">
                        <span className="truncate block">{b.class_name || "-"}</span>
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2">
                        <span className="truncate block">{b.subject || "-"}</span>
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2">
                        <span className="truncate block">{b.publisher?.name || "-"}</span>
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2">
                        <span className="truncate block">{b.supplier?.name || "-"}</span>
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">
                        {formatAmount(b.mrp)}
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums">
                        {formatAmount(b.discount_percent)}
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums font-semibold">
                        {formatAmount(b.rate)}
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${
                            b.is_active
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-50 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {b.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="border-b border-slate-200 px-3 py-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(b)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all group-hover:opacity-100 opacity-80"
                            aria-label="Edit book"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(b.id)}
                            disabled={deletingId === b.id}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all group-hover:opacity-100 opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Delete book"
                          >
                            {deletingId === b.id ? (
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

          {/* Combos */}
          <datalist id="publisherOptions">
            {publishers.map((pub) => (
              <option key={pub.id} value={pub.name} />
            ))}
          </datalist>

          <datalist id="supplierOptions">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>

          <datalist id="classOptions">
            {classes.map((cls) => (
              <option key={cls.id} value={cls.class_name} />
            ))}
          </datalist>
        </section>
      </main>

      {/* Toast */}
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

export default BooksPageClient;
