"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import { Pencil, Trash2, BookOpen, Upload, Download, ChevronLeft, Sparkles } from "lucide-react";

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

  discount_percent?: number | string | null;
  rate?: number | string | null;
  supplier_id?: number | null;
  supplier?: Supplier | null;

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

  discount_percent: string;
  rate: string;

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

type Meta = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

type BooksListResponse =
  | Book[]
  | {
      data: Book[];
      meta?: Meta;
    };

type ClassesListResponse = ClassItem[] | { data: ClassItem[]; meta?: any };
type SuppliersListResponse = Supplier[] | { data: Supplier[]; meta?: any };

const normalizeBooks = (payload: BooksListResponse): { rows: Book[]; meta?: Meta } => {
  if (Array.isArray(payload)) return { rows: payload };
  return { rows: payload?.data ?? [], meta: payload?.meta };
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

  const [publisherInput, setPublisherInput] = useState<string>("");
  const [supplierInput, setSupplierInput] = useState<string>("");

  // ✅ Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState<Meta | null>(null);

  // Excel-style navigation refs
  const addRowRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>([]);
  const editRowRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>([]);
  const LAST_INDEX = 8;

  const setAddRef =
    (i: number) => (el: HTMLInputElement | HTMLSelectElement | null) => {
      addRowRefs.current[i] = el;
    };

  const setEditRef =
    (i: number) => (el: HTMLInputElement | HTMLSelectElement | null) => {
      editRowRefs.current[i] = el;
    };

  /* -------------------- FETCH HELPERS -------------------- */

  const fetchPublishers = async () => {
    try {
      const res = await api.get<Publisher[]>("/api/publishers");
      const sorted = [...(res.data || [])].sort((a, b) => (b.id || 0) - (a.id || 0));
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
          (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.class_name.localeCompare(b.class_name)
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
    className?: string,
    nextPage?: number,
    nextLimit?: number
  ) => {
    setListLoading(true);
    try {
      const params: any = {};
      if (query && query.trim()) params.q = query.trim();
      if (publisherId) params.publisherId = publisherId;
      if (supplierId) params.supplierId = supplierId;
      if (className) params.className = className;

      // ✅ pagination params
      params.page = nextPage ?? page;
      params.limit = nextLimit ?? limit;

      const res = await api.get<BooksListResponse>("/api/books", { params });
      const { rows, meta } = normalizeBooks(res.data);

      setBooks(rows);
      setMeta(meta ?? null);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load books.");
      setBooks([]);
      setMeta(null);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchPublishers();
    fetchSuppliers();
    fetchClasses();
    fetchBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  /* -------------------- FORM HANDLERS -------------------- */

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;

    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: checked }));
      return;
    }

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
      discount_percent: discountNum === null || Number.isNaN(discountNum) ? null : discountNum,
      rate: rateNum === null || Number.isNaN(rateNum) ? null : rateNum,
      selling_price: form.selling_price ? Number(form.selling_price) : null,
      is_active: form.is_active,
    };
  };

  const resolvePublisherId = async (): Promise<number> => {
    const pubName = publisherInput.trim();
    if (!pubName) throw new Error("Publisher is required.");

    const existing = publishers.find((p) => p.name.toLowerCase() === pubName.toLowerCase());
    if (existing) return existing.id;

    const res = await api.post("/api/publishers", { name: pubName });
    const newPublisher: Publisher = res.data;
    setPublishers((prev) => [newPublisher, ...prev]);
    return newPublisher.id;
  };

  const resolveSupplierId = (): number | null => {
    const sName = supplierInput.trim();
    if (!sName) return null;

    const existing = suppliers.find((s) => s.name.toLowerCase() === sName.toLowerCase());
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
      // ✅ refresh same page
      await fetchBooks(search, filterPublisherId, filterSupplierId, filterClassName, page, limit);
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
      book.publisher?.name || publishers.find((p) => p.id === book.publisher_id)?.name || "";
    setPublisherInput(pubNameFromBook);

    const supNameFromBook =
      book.supplier?.name ||
      (book.supplier_id ? suppliers.find((s) => s.id === book.supplier_id)?.name || "" : "");
    setSupplierInput(supNameFromBook);

    editRowRefs.current = [];
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this book record?");
    if (!confirmDelete) return;

    setError(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/books/${id}`);
      if (editingId === id) resetForm();

      // ✅ after delete, if page becomes empty, go prev page
      const willBeEmpty = books.length === 1 && page > 1;
      const nextPage = willBeEmpty ? page - 1 : page;
      if (willBeEmpty) setPage(nextPage);

      await fetchBooks(
        search,
        filterPublisherId,
        filterSupplierId,
        filterClassName,
        nextPage,
        limit
      );
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

  const resetToFirstPageAndFetch = (nextSearch: string, pubId: string, supId: string, cls: string) => {
    setPage(1);
    fetchBooks(nextSearch, pubId, supId, cls, 1, limit);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      resetToFirstPageAndFetch(value, filterPublisherId, filterSupplierId, filterClassName);
    }, 400);
  };

  const handlePublisherFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilterPublisherId(value);
    resetToFirstPageAndFetch(search, value, filterSupplierId, filterClassName);
  };

  const handleSupplierFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilterSupplierId(value);
    resetToFirstPageAndFetch(search, filterPublisherId, value, filterClassName);
  };

  const handleClassFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilterClassName(value);
    resetToFirstPageAndFetch(search, filterPublisherId, filterSupplierId, value);
  };

  const clearFilters = () => {
    setSearch("");
    setFilterClassName("");
    setFilterPublisherId("");
    setFilterSupplierId("");
    setPage(1);
    fetchBooks("", "", "", "", 1, limit);
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

      // go first page after import
      setPage(1);
      await fetchBooks(search, filterPublisherId, filterSupplierId, filterClassName, 1, limit);

      await fetchPublishers();
      await fetchSuppliers();
      await fetchClasses();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error || "Failed to import books. Please check the file format.";
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
    (index: number) => (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>): void => {
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
    (index: number) => (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>): void => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (index < LAST_INDEX) {
        const next = editRowRefs.current[index + 1];
        if (next) next.focus();
      } else {
        if (!loading) saveBook();
      }
    };

  /* ---------------- Pagination helpers ---------------- */

  const totalPages = meta?.totalPages;
  const total = meta?.total;

  const canPrev = page > 1;

  // if backend gives totalPages → trust it; else if no meta → assume hasNext when rows == limit
  const canNext =
    typeof totalPages === "number"
      ? page < totalPages
      : books.length === limit; // fallback

  const goPrev = () => {
    if (!canPrev || listLoading) return;
    const nextPage = page - 1;
    setPage(nextPage);
    fetchBooks(search, filterPublisherId, filterSupplierId, filterClassName, nextPage, limit);
  };

  const goNext = () => {
    if (!canNext || listLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchBooks(search, filterPublisherId, filterSupplierId, filterClassName, nextPage, limit);
  };

  const changeLimit = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLimit = Number(e.target.value);
    setLimit(nextLimit);
    setPage(1);
    fetchBooks(search, filterPublisherId, filterSupplierId, filterClassName, 1, nextLimit);
  };

  /* -------------------- UI -------------------- */

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 overflow-hidden relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200/30 rounded-full blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors"
              title="Back"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs sm:text-sm hidden sm:inline">Back</span>
            </Link>

            <div className="hidden md:flex items-center gap-2 ml-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight truncate">Book Master</div>
                <div className="text-[11px] text-slate-500 truncate">
                  Class • Publisher • Supplier catalogue
                </div>
              </div>
            </div>
          </div>

          {/* Right: inline actions + user */}
          <div className="flex items-center gap-2">
            {/* Inline filters + import/export (wraps on 13") */}
            <div className="hidden md:flex items-center gap-2 flex-wrap justify-end">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                className="h-9 px-3 border border-slate-300 rounded-full text-xs bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none w-[220px]"
                placeholder="Search..."
              />

              <select
                value={filterClassName}
                onChange={handleClassFilterChange}
                className="h-9 px-3 border border-slate-300 rounded-full text-xs bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none w-[140px]"
                title="Class"
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
                className="h-9 px-3 border border-slate-300 rounded-full text-xs bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none w-[170px]"
                title="Publisher"
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
                className="h-9 px-3 border border-slate-300 rounded-full text-xs bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none w-[170px]"
                title="Supplier"
              >
                <option value="">All suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id.toString()}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleExport}
                disabled={exportLoading || listLoading || books.length === 0}
                className="h-9 px-3 rounded-full bg-indigo-600 text-white text-xs font-semibold shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                title="Export Excel"
              >
                <Download className="w-4 h-4" />
                Export
              </button>

              <button
                type="button"
                onClick={triggerImport}
                disabled={importLoading}
                className="h-9 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                title="Import Excel"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>

              <button
                type="button"
                onClick={clearFilters}
                className="h-9 px-3 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold"
                title="Clear all filters"
              >
                Clear
              </button>
            </div>

            {/* Small width: keep only search */}
            <div className="flex md:hidden items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                className="h-9 px-3 border border-slate-300 rounded-full text-xs bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none w-[180px]"
                placeholder="Search..."
              />
            </div>

            {/* User */}
            <div className="hidden sm:flex flex-col items-end leading-tight ml-1">
              <span className="text-xs font-semibold text-slate-800 truncate max-w-[160px]">
                {user?.name || "User"}
              </span>
              {user?.role && (
                <span className="text-[10px] rounded-full bg-indigo-50 px-2 py-0.5 border border-indigo-100 text-indigo-700 font-medium">
                  {user.role}
                </span>
              )}
            </div>

            <button
              onClick={logout}
              className="inline-flex items-center justify-center h-9 px-3 rounded-full bg-rose-600 text-white text-xs font-semibold shadow hover:shadow-md"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="px-3 sm:px-4 pb-2 hidden md:block">
          <div className="flex items-center gap-2 text-[12px] text-slate-600">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            Excel-like inline entry & editing with supplier pricing (MRP, discount & rate).
          </div>
        </div>
      </header>

      <main className="relative z-10 px-3 sm:px-4 py-3">
        {/* Error alert */}
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
              !
            </div>
            <span className="truncate">{error}</span>
          </div>
        )}

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 border-b border-slate-200">
            <h2 className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Books
              {typeof total === "number" ? (
                <span className="text-slate-500 font-medium">({total})</span>
              ) : (
                <span className="text-slate-500 font-medium">({books.length})</span>
              )}
            </h2>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] px-3 h-8 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium"
                >
                  Cancel Edit
                </button>
              )}

              {/* ✅ Pagination controls */}
              <div className="flex items-center gap-2">
                <select
                  value={limit}
                  onChange={changeLimit}
                  className="h-8 px-2 border border-slate-300 rounded-full text-[11px] bg-white"
                  title="Rows per page"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>

                <button
                  type="button"
                  onClick={goPrev}
                  disabled={!canPrev || listLoading}
                  className="h-8 px-3 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>

                <div className="text-[11px] text-slate-600 px-2">
                  Page <span className="font-semibold">{page}</span>
                  {typeof totalPages === "number" ? (
                    <>
                      {" "}
                      / <span className="font-semibold">{totalPages}</span>
                    </>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canNext || listLoading}
                  className="h-8 px-3 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {listLoading ? (
            <div className="flex items-center justify-center py-10 text-xs text-slate-600">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading books...
            </div>
          ) : books.length === 0 && !editingId ? (
            <div className="text-xs text-slate-500 px-3 sm:px-4 py-3">
              No books found for current filters.
            </div>
          ) : null}

          <div className="overflow-auto max-h-[calc(100dvh-210px)] border-t border-slate-100">
            <table className="w-full text-xs border-collapse bg-white">
              <thead className="bg-slate-50 sticky top-0 z-20">
                <tr>
                  <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700 min-w-[320px]">
                    Title
                  </th>
                  <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700 min-w-[90px]">
                    Class
                  </th>
                  <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700 min-w-[140px]">
                    Subject
                  </th>
                  <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700 min-w-[180px]">
                    Publisher
                  </th>
                  <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700 min-w-[180px]">
                    Supplier
                  </th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-semibold text-slate-700 min-w-[90px]">
                    MRP
                  </th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-semibold text-slate-700 min-w-[80px]">
                    Disc %
                  </th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right font-semibold text-slate-700 min-w-[90px]">
                    Rate
                  </th>
                  <th className="border-b border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 min-w-[90px]">
                    Active
                  </th>

                  <th className="border-b border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 w-[110px] sticky right-0 bg-slate-50 z-30">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* ADD ROW */}
                <tr className="bg-white">
                  <td className="border-b border-slate-200 px-2 py-1.5">
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

                  <td className="border-b border-slate-200 px-2 py-1.5">
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

                  <td className="border-b border-slate-200 px-2 py-1.5">
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

                  <td className="border-b border-slate-200 px-2 py-1.5">
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

                  <td className="border-b border-slate-200 px-2 py-1.5">
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

                  <td className="border-b border-slate-200 px-2 py-1.5">
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

                  <td className="border-b border-slate-200 px-2 py-1.5">
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

                  <td className="border-b border-slate-200 px-2 py-1.5">
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

                  <td className="border-b border-slate-200 px-2 py-1.5 text-center">
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

                  <td className="border-b border-slate-200 px-2 py-1.5 sticky right-0 bg-white z-10">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={saveBook}
                      className="w-full inline-flex items-center justify-center h-8 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow-sm hover:shadow disabled:opacity-60"
                    >
                      {loading ? "Saving..." : "Add"}
                    </button>
                  </td>
                </tr>

                {/* DATA ROWS */}
                {books.map((b) =>
                  editingId === b.id ? (
                    <tr key={b.id} className="bg-amber-50">
                      <td className="border-b border-slate-200 px-2 py-1.5">
                        <input
                          name="title"
                          value={form.title}
                          onChange={handleChange}
                          ref={setEditRef(0)}
                          onKeyDown={makeEditRowKeyDown(0)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-2 py-1.5">
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

                      <td className="border-b border-slate-200 px-2 py-1.5">
                        <input
                          name="subject"
                          value={form.subject}
                          onChange={handleChange}
                          ref={setEditRef(2)}
                          onKeyDown={makeEditRowKeyDown(2)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-2 py-1.5">
                        <input
                          list="publisherOptions"
                          value={publisherInput}
                          onChange={(e) => setPublisherInput(e.target.value)}
                          ref={setEditRef(3)}
                          onKeyDown={makeEditRowKeyDown(3)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-2 py-1.5">
                        <input
                          list="supplierOptions"
                          value={supplierInput}
                          onChange={(e) => setSupplierInput(e.target.value)}
                          ref={setEditRef(4)}
                          onKeyDown={makeEditRowKeyDown(4)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>

                      <td className="border-b border-slate-200 px-2 py-1.5">
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

                      <td className="border-b border-slate-200 px-2 py-1.5">
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

                      <td className="border-b border-slate-200 px-2 py-1.5">
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

                      <td className="border-b border-slate-200 px-2 py-1.5 text-center">
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

                      <td className="border-b border-slate-200 px-2 py-1.5 sticky right-0 bg-amber-50 z-10">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={saveBook}
                            className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-indigo-600 text-white text-xs font-semibold shadow-sm hover:shadow disabled:opacity-60"
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
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="border-b border-slate-200 px-2 py-2">
                        <div className="font-semibold text-slate-800 truncate">{b.title}</div>
                      </td>

                      <td className="border-b border-slate-200 px-2 py-2">
                        <span className="truncate block">{b.class_name || "-"}</span>
                      </td>

                      <td className="border-b border-slate-200 px-2 py-2">
                        <span className="truncate block">{b.subject || "-"}</span>
                      </td>

                      <td className="border-b border-slate-200 px-2 py-2">
                        <span className="truncate block">{b.publisher?.name || "-"}</span>
                      </td>

                      <td className="border-b border-slate-200 px-2 py-2">
                        <span className="truncate block">{b.supplier?.name || "-"}</span>
                      </td>

                      <td className="border-b border-slate-200 px-2 py-2 text-right tabular-nums">
                        {formatAmount(b.mrp)}
                      </td>

                      <td className="border-b border-slate-200 px-2 py-2 text-right tabular-nums">
                        {formatAmount(b.discount_percent)}
                      </td>

                      <td className="border-b border-slate-200 px-2 py-2 text-right tabular-nums font-semibold">
                        {formatAmount(b.rate)}
                      </td>

                      <td className="border-b border-slate-200 px-2 py-2 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${
                            b.is_active
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-50 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {b.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="border-b border-slate-200 px-2 py-2 sticky right-0 bg-white z-10">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(b)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-indigo-600 text-white shadow-sm hover:shadow hover:scale-105 transition"
                            aria-label="Edit book"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(b.id)}
                            disabled={deletingId === b.id}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-rose-600 text-white shadow-sm hover:shadow hover:scale-105 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Delete book"
                            title="Delete"
                          >
                            {deletingId === b.id ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
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

        {/* hidden file input */}
        <input
          type="file"
          accept=".xlsx,.xls"
          ref={importInputRef}
          onChange={handleImportFileChange}
          className="hidden"
        />
      </main>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default BooksPageClient;
