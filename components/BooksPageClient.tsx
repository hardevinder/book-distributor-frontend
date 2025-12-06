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

type Publisher = {
  id: number;
  name: string;
};

type ClassItem = {
  id: number;
  class_name: string;
  sort_order: number;
  is_active: boolean;
};

type Book = {
  id: number;
  title: string;
  code?: string | null;
  isbn?: string | null;
  class_name?: string | null;
  subject?: string | null;
  medium?: string | null;
  mrp?: number | string | null;
  selling_price?: number | string | null;
  is_active: boolean;
  publisher_id: number;
  publisher?: Publisher | null;
};

type BookFormState = {
  title: string;
  code: string;
  isbn: string;
  publisher_id: string;
  class_name: string; // will store class_name string from ClassItem
  subject: string;
  medium: string;
  mrp: string;
  selling_price: string;
  is_active: boolean;
};

const emptyBookForm: BookFormState = {
  title: "",
  code: "",
  isbn: "",
  publisher_id: "",
  class_name: "",
  subject: "",
  medium: "",
  mrp: "",
  selling_price: "",
  is_active: true,
};

type BooksListResponse = Book[] | { data: Book[]; meta?: any };
type ClassesListResponse = ClassItem[] | { data: ClassItem[]; meta?: any };

const normalizeBooks = (payload: BooksListResponse): Book[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

const normalizeClasses = (payload: ClassesListResponse): ClassItem[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

// 🔢 Safely format number/decimal from string or number
const formatAmount = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "-";

  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;

  if (Number.isNaN(num)) {
    // fallback: just show raw value as string
    return String(value);
  }

  return num.toFixed(2);
};

const BooksPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [books, setBooks] = useState<Book[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [form, setForm] = useState<BookFormState>(emptyBookForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterPublisherId, setFilterPublisherId] = useState<string>("");
  const [filterClassName, setFilterClassName] = useState<string>("");

  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  /* -------------------- FETCH HELPERS -------------------- */

  const fetchPublishers = async () => {
    try {
      const res = await api.get<Publisher[]>("/api/publishers");
      setPublishers(res.data || []);
    } catch (err) {
      console.error(err);
      // ignore for now
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await api.get<ClassesListResponse>("/api/classes", {
        params: {
          is_active: "true",
          limit: 200,
        },
      });
      setClasses(normalizeClasses(res.data));
    } catch (err) {
      console.error(err);
      // ignore for now
    }
  };

  const fetchBooks = async (
    query?: string,
    publisherId?: string,
    className?: string
  ) => {
    setListLoading(true);
    try {
      const params: any = {};

      if (query && query.trim()) {
        params.q = query.trim();
      }

      if (publisherId && publisherId !== "all") {
        params.publisherId = publisherId;
      }

      if (className && className !== "all") {
        params.className = className;
      }

      const res = await api.get<BooksListResponse>("/api/books", { params });
      setBooks(normalizeBooks(res.data));
    } catch (err: any) {
      console.error(err);
      setError("Failed to load books.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchPublishers();
    fetchClasses();
    fetchBooks();
  }, []);

  /* -------------------- FORM HANDLERS -------------------- */

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleToggleActive = () => {
    setForm((prev) => ({ ...prev, is_active: !prev.is_active }));
  };

  const resetForm = () => {
    setForm(emptyBookForm);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (!form.title.trim()) {
        setError("Title is required.");
        setLoading(false);
        return;
      }
      if (!form.publisher_id) {
        setError("Publisher is required.");
        setLoading(false);
        return;
      }

      const payload = {
        title: form.title.trim(),
        code: form.code.trim() || null,
        isbn: form.isbn.trim() || null,
        publisher_id: Number(form.publisher_id),
        class_name: form.class_name.trim() || null, // selected class_name string
        subject: form.subject.trim() || null,
        medium: form.medium.trim() || null,
        mrp: form.mrp ? Number(form.mrp) : null,
        selling_price: form.selling_price ? Number(form.selling_price) : null,
        is_active: form.is_active,
      };

      if (editingId) {
        await api.put(`/api/books/${editingId}`, payload);
        setInfo("Book updated successfully.");
      } else {
        await api.post("/api/books", payload);
        setInfo("Book added successfully.");
      }

      resetForm();
      await fetchBooks(search, filterPublisherId, filterClassName);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          (editingId ? "Failed to update book." : "Failed to create book.")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (book: Book) => {
    setError(null);
    setInfo(null);
    setEditingId(book.id);
    setForm({
      title: book.title || "",
      code: book.code || "",
      isbn: book.isbn || "",
      publisher_id: book.publisher_id ? String(book.publisher_id) : "",
      class_name: book.class_name || "",
      subject: book.subject || "",
      medium: book.medium || "",
      mrp:
        book.mrp !== null && book.mrp !== undefined ? String(book.mrp) : "",
      selling_price:
        book.selling_price !== null && book.selling_price !== undefined
          ? String(book.selling_price)
          : "",
      is_active: book.is_active,
    });
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this book record?"
    );
    if (!confirmDelete) return;

    setError(null);
    setInfo(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/books/${id}`);
      if (editingId === id) {
        resetForm();
      }
      await fetchBooks(search, filterPublisherId, filterClassName);
      setInfo("Book deleted successfully.");
    } catch (err: any) {
      console.error(err);
      setError("Failed to delete book.");
    } finally {
      setDeletingId(null);
    }
  };

  /* -------------------- SEARCH & FILTERS -------------------- */

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchBooks(value, filterPublisherId, filterClassName);
    }, 400);
  };

  const handlePublisherFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value;
    setFilterPublisherId(value);
    fetchBooks(search, value, filterClassName);
  };

  const handleClassFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value;
    setFilterClassName(value);
    fetchBooks(search, filterPublisherId, value);
  };

  /* ----------------- IMPORT / EXPORT HANDLERS ----------------- */

  const triggerImport = () => {
    setError(null);
    setInfo(null);
    if (importInputRef.current) {
      importInputRef.current.value = "";
      importInputRef.current.click();
    }
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setInfo(null);
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/api/books/import", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const { created, updated, errors } = res.data || {};
      const errorCount = Array.isArray(errors) ? errors.length : 0;

      setInfo(
        `Import completed: ${created ?? 0} created, ${
          updated ?? 0
        } updated, ${errorCount} row(s) with errors.`
      );

      await fetchBooks(search, filterPublisherId, filterClassName);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.error ||
          "Failed to import books. Please check the file format."
      );
    } finally {
      setImportLoading(false);
    }
  };

  const handleExport = async () => {
    setError(null);
    setInfo(null);
    setExportLoading(true);

    try {
      const res = await api.get("/api/books/export", {
        responseType: "blob",
      });

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

      setInfo("Books exported successfully.");
    } catch (err: any) {
      console.error(err);
      setError("Failed to export books.");
    } finally {
      setExportLoading(false);
    }
  };

  /* -------------------- UI -------------------- */

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
              Book Master
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Class-wise & Publisher-wise catalogue
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

      <main className="relative z-10 p-6 lg:p-8 space-y-8">
        {/* Header + search + filters + import/export */}
        <section className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md">
                <Sparkles className="w-4 h-4" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                Books Catalogue
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Manage your{" "}
              <span className="font-semibold">
                complete book master (class-wise, subject-wise, publisher-wise)
              </span>{" "}
              and keep it in sync with Excel import / export.
            </p>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                className="px-3 py-1.5 border border-slate-300 rounded-full text-xs min-w-[200px] bg-white shadow-sm"
                placeholder="Search by title / subject..."
              />

              {/* Class filter */}
              <select
                value={filterClassName}
                onChange={handleClassFilterChange}
                className="px-3 py-1.5 border border-slate-300 rounded-full text-xs bg-white min-w-[180px] shadow-sm"
              >
                <option value="">All classes</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.class_name}>
                    {cls.class_name}
                  </option>
                ))}
              </select>

              {/* Publisher filter */}
              <select
                value={filterPublisherId}
                onChange={handlePublisherFilterChange}
                className="px-3 py-1.5 border border-slate-300 rounded-full text-xs bg-white min-w-[180px] shadow-sm"
              >
                <option value="">All publishers</option>
                {publishers.map((pub) => (
                  <option key={pub.id} value={pub.id.toString()}>
                    {pub.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Hidden file input for import */}
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
                onClick={triggerImport}
                disabled={importLoading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs font-medium shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{importLoading ? "Importing..." : "Import Excel"}</span>
              </button>

              <button
                type="button"
                onClick={handleExport}
                disabled={exportLoading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs font-medium shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exportLoading ? "Exporting..." : "Export Excel"}</span>
              </button>

              <span className="text-[11px] text-slate-500 hidden sm:block">
                Use export as template for bulk updates.
              </span>
            </div>
          </div>
        </section>

        {/* Alerts */}
        {(error || info) && (
          <section className="space-y-3">
            {error && (
              <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 shadow-sm text-xs text-red-700 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                  !
                </div>
                <span>{error}</span>
              </div>
            )}
            {info && !error && (
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-3 shadow-sm text-xs text-emerald-700 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Sparkles className="w-3 h-3" />
                </div>
                <span>{info}</span>
              </div>
            )}
          </section>
        )}

        {/* Form + List */}
        <section className="grid gap-8 lg:grid-cols-2">
          {/* Add / Edit form */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2 text-slate-800">
                {editingId ? (
                  <>
                    <Pencil className="w-4 h-4 text-indigo-500" />
                    Edit Book
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4 text-emerald-500" />
                    Add New Book
                  </>
                )}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] px-3 py-1.5 border border-slate-200 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
              <div>
                <label className="block text-xs mb-1.5 text-slate-700">
                  Title *
                </label>
                <input
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="Enter book title"
                />
              </div>

              {/* Code + ISBN + Publisher */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs mb-1.5 text-slate-700">
                    Book Code
                  </label>
                  <input
                    name="code"
                    value={form.code}
                    onChange={handleChange}
                    placeholder="Optional internal code"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5 text-slate-700">
                    ISBN (Optional)
                  </label>
                  <input
                    name="isbn"
                    value={form.isbn}
                    onChange={handleChange}
                    placeholder="ISBN-10 / ISBN-13"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5 text-slate-700">
                    Publisher *
                  </label>
                  <select
                    name="publisher_id"
                    value={form.publisher_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select publisher</option>
                    {publishers.map((pub) => (
                      <option key={pub.id} value={pub.id}>
                        {pub.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Class + Subject + Medium */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs mb-1.5 text-slate-700">
                    Class
                  </label>
                  <select
                    name="class_name"
                    value={form.class_name}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select class</option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.class_name}>
                        {cls.class_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1.5 text-slate-700">
                    Subject
                  </label>
                  <input
                    name="subject"
                    value={form.subject}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Mathematics, Science..."
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5 text-slate-700">
                    Medium
                  </label>
                  <input
                    name="medium"
                    value={form.medium}
                    onChange={handleChange}
                    placeholder="English / Hindi..."
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* MRP + Selling Price + Active */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs mb-1.5 text-slate-700">
                    MRP
                  </label>
                  <input
                    name="mrp"
                    type="number"
                    step="0.01"
                    value={form.mrp}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5 text-slate-700">
                    Selling Price
                  </label>
                  <input
                    name="selling_price"
                    type="number"
                    step="0.01"
                    value={form.selling_price}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={handleToggleActive}
                      className="h-3 w-3"
                    />
                    <span className="text-slate-700">Active</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full sm:w-auto bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-2 rounded-full text-sm font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {editingId ? "Updating..." : "Saving..."}
                  </>
                ) : editingId ? (
                  <>
                    <Pencil className="w-4 h-4" />
                    Update Book
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4" />
                    Save Book
                  </>
                )}
              </button>
            </form>
          </div>

          {/* List */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-500" />
                Existing Books ({books.length})
              </h2>
            </div>

            {listLoading ? (
              <div className="flex items-center justify-center py-10 text-xs text-slate-600">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                Loading books...
              </div>
            ) : books.length === 0 ? (
              <div className="text-xs text-slate-500 py-8 text-center">
                No books added yet. Start by adding your first book on the left.
              </div>
            ) : (
              <div className="overflow-auto max-h-[480px] rounded-xl border border-slate-200/80 shadow-inner">
                <table className="w-full text-[11px] border-collapse bg-white">
                  <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-10">
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
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                        MRP
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                        Price
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                        <td className="border-b border-slate-200 px-3 py-2">
                          <div className="font-semibold text-slate-800 truncate max-w-[260px]">
                            {b.title}
                          </div>
                          <div className="space-y-0.5 mt-0.5">
                            {b.code && (
                              <div className="text-[10px] text-slate-500">
                                Code: {b.code}
                              </div>
                            )}
                            {b.isbn && (
                              <div className="text-[10px] text-slate-500">
                                ISBN: {b.isbn}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {b.class_name || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {b.subject || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {b.publisher?.name || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right">
                          {formatAmount(b.mrp)}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right">
                          {formatAmount(b.selling_price)}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-center">
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
                        <td className="border-b border-slate-200 px-3 py-2">
                          <div className="flex items-center justify-center gap-2">
                            {/* Edit icon */}
                            <button
                              type="button"
                              onClick={() => handleEdit(b)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all"
                              aria-label="Edit book"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete icon */}
                            <button
                              type="button"
                              onClick={() => handleDelete(b.id)}
                              disabled={deletingId === b.id}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all disabled:opacity-60"
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>

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
