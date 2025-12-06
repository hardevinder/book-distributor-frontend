"use client";

import React, { useEffect, useRef, useState } from "react";
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

/* ---------- Types ---------- */

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

type School = {
  id: number;
  name: string;
};

type Book = {
  id: number;
  title: string;
  class_name?: string | null;
  subject?: string | null;
  publisher?: Publisher | null;
};

type Requirement = {
  id: number;
  school_id: number;
  book_id: number;
  class_id?: number | null;
  academic_session?: string | null;
  required_copies: number | string;
  status: "draft" | "confirmed";
  remarks?: string | null;
  is_locked: boolean;

  school?: School | null;
  book?: Book | null;
  class?: ClassItem | null;
};

type RequirementFormState = {
  school_id: string;
  book_id: string;
  class_id: string;
  academic_session: string;
  required_copies: string;
  status: "draft" | "confirmed";
  remarks: string;
  is_locked: boolean;
};

// 🔹 Session dropdown options: 2025-26 + next 5
const SESSION_OPTIONS: string[] = (() => {
  const base = 2025; // 2025-26
  const arr: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const y1 = base + i;
    const y2Short = String((y1 + 1) % 100).padStart(2, "0");
    arr.push(`${y1}-${y2Short}`);
  }
  return arr;
})();

const emptyRequirementForm: RequirementFormState = {
  school_id: "",
  book_id: "",
  class_id: "",
  academic_session: "2025-26", // 🔹 default session
  required_copies: "",
  status: "draft",
  remarks: "",
  is_locked: false,
};

type SchoolsListResponse = School[] | { data: School[]; meta?: any };
type BooksListResponse = Book[] | { data: Book[]; meta?: any };
type ClassesListResponse = ClassItem[] | { data: ClassItem[]; meta?: any };
type RequirementsListResponse =
  | Requirement[]
  | { data: Requirement[]; meta?: any };

const normalizeSchools = (payload: SchoolsListResponse): School[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

const normalizeBooks = (payload: BooksListResponse): Book[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

const normalizeClasses = (payload: ClassesListResponse): ClassItem[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

const normalizeRequirements = (
  payload: RequirementsListResponse
): Requirement[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

// Helper for integer-like display
const formatNumber = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "-";
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;
  if (Number.isNaN(num)) return String(value);
  return String(num);
};

const RequirementsPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);

  const [form, setForm] = useState<RequirementFormState>(emptyRequirementForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterSchoolId, setFilterSchoolId] = useState<string>("");
  const [filterSession, setFilterSession] = useState<string>("");

  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // 🔹 NEW: Publisher selected in FORM (for filtering book dropdown)
  const [formPublisherId, setFormPublisherId] = useState<string>("");

  /* -------------------- FETCH HELPERS -------------------- */

  const fetchSchools = async () => {
    try {
      const res = await api.get<SchoolsListResponse>("/api/schools", {
        params: {
          is_active: "true",
          limit: 500,
        },
      });
      setSchools(normalizeSchools(res.data));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await api.get<ClassesListResponse>("/api/classes", {
        params: { is_active: "true", limit: 200 },
      });
      setClasses(normalizeClasses(res.data));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBooks = async () => {
    try {
      const res = await api.get<BooksListResponse>("/api/books", {
        params: {
          limit: 1000,
        },
      });
      setBooks(normalizeBooks(res.data));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPublishers = async () => {
    try {
      const res = await api.get<Publisher[]>("/api/publishers");
      setPublishers(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRequirements = async (
    query?: string,
    schoolId?: string,
    session?: string
  ) => {
    setListLoading(true);
    try {
      const params: any = {};
      if (query && query.trim()) params.q = query.trim();
      if (schoolId && schoolId !== "all") params.schoolId = schoolId;
      if (session && session.trim()) params.academic_session = session.trim();

      const res = await api.get<RequirementsListResponse>("/api/requirements", {
        params,
      });
      setRequirements(normalizeRequirements(res.data));
    } catch (err: any) {
      console.error(err);
      setError("Failed to load requirements.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
    fetchBooks();
    fetchClasses();
    fetchPublishers();
    fetchRequirements();
  }, []);

  // 🔹 Books visible in dropdown, filtered by selected publisher
  const getVisibleBooks = (): Book[] => {
    if (!formPublisherId) return books;
    const pid = Number(formPublisherId);
    return books.filter((b) => b.publisher?.id === pid);
  };

  /* -------------------- FORM HANDLERS -------------------- */

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;

    // 🔹 Special case: publisher change controls filter, not payload
    if (name === "publisher_id") {
      setFormPublisherId(value);
      // reset book when publisher changes
      setForm((prev) => ({ ...prev, book_id: "" }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleToggleLocked = () => {
    setForm((prev) => ({ ...prev, is_locked: !prev.is_locked }));
  };

  const resetForm = () => {
    setForm(emptyRequirementForm);
    setEditingId(null);
    setFormPublisherId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (!form.school_id) {
        setError("School is required.");
        setLoading(false);
        return;
      }
      if (!form.book_id) {
        setError("Book is required.");
        setLoading(false);
        return;
      }

      const payload = {
        school_id: Number(form.school_id),
        book_id: Number(form.book_id),
        class_id: form.class_id ? Number(form.class_id) : null,
        academic_session: form.academic_session.trim() || null,
        required_copies: form.required_copies
          ? Number(form.required_copies)
          : 0,
        status: form.status,
        remarks: form.remarks.trim() || null,
        is_locked: form.is_locked,
      };

      if (editingId) {
        await api.put(`/api/requirements/${editingId}`, payload);
        setInfo("Requirement updated successfully.");
      } else {
        await api.post("/api/requirements", payload);
        setInfo("Requirement added successfully.");
      }

      resetForm();
      await fetchRequirements(search, filterSchoolId, filterSession);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          (editingId
            ? "Failed to update requirement."
            : "Failed to create requirement.")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (r: Requirement) => {
    setError(null);
    setInfo(null);
    setEditingId(r.id);

    setForm({
      school_id: r.school_id ? String(r.school_id) : "",
      book_id: r.book_id ? String(r.book_id) : "",
      class_id: r.class_id ? String(r.class_id) : "",
      academic_session: r.academic_session || "2025-26",
      required_copies:
        r.required_copies !== null && r.required_copies !== undefined
          ? String(r.required_copies)
          : "",
      status: r.status || "draft",
      remarks: r.remarks || "",
      is_locked: r.is_locked,
    });

    // 🔹 Pre-select publisher in form based on book's publisher
    const bookPublisherId = r.book?.publisher?.id;
    setFormPublisherId(bookPublisherId ? String(bookPublisherId) : "");
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this requirement?"
    );
    if (!confirmDelete) return;

    setError(null);
    setInfo(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/requirements/${id}`);
      if (editingId === id) resetForm();
      await fetchRequirements(search, filterSchoolId, filterSession);
      setInfo("Requirement deleted successfully.");
    } catch (err: any) {
      console.error(err);
      setError("Failed to delete requirement.");
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
      fetchRequirements(value, filterSchoolId, filterSession);
    }, 400);
  };

  const handleSchoolFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value;
    setFilterSchoolId(value);
    fetchRequirements(search, value, filterSession);
  };

  // 🔹 Session filter now Select
  const handleSessionFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value;
    setFilterSession(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchRequirements(search, filterSchoolId, value);
    }, 400);
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

      const res = await api.post("/api/requirements/import", formData, {
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

      await fetchRequirements(search, filterSchoolId, filterSession);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.error ||
          "Failed to import requirements. Please check the file format."
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
      const res = await api.get("/api/requirements/export", {
        responseType: "blob",
        params: {
          schoolId: filterSchoolId || undefined,
          academic_session: filterSession || undefined,
        },
      });

      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/octet-stream",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "school-book-requirements.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setInfo("Requirements exported successfully.");
    } catch (err: any) {
      console.error(err);
      setError("Failed to export requirements.");
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
              School Book Requirements
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Capture & Lock School Orders
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
                Requirements Intake
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Record <span className="font-semibold">school-wise, class-wise</span> book
              requirements for each academic session. These entries will power{" "}
              <span className="font-semibold">publisher purchase orders</span> and stock planning.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs justify-end">
            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              className="px-3 py-2 border border-slate-300 rounded-full min-w-[220px] bg-white text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Search by school / book..."
            />

            {/* School filter */}
            <select
              value={filterSchoolId}
              onChange={handleSchoolFilterChange}
              className="px-3 py-2 border border-slate-300 rounded-full bg-white min-w-[200px] text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All schools</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id.toString()}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Session filter - dropdown */}
            <select
              value={filterSession}
              onChange={handleSessionFilterChange}
              className="px-3 py-2 border border-slate-300 rounded-full bg-white min-w-[140px] text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All sessions</option>
              {SESSION_OPTIONS.map((session) => (
                <option key={session} value={session}>
                  {session}
                </option>
              ))}
            </select>

            {/* Hidden file input */}
            <input
              type="file"
              accept=".xlsx,.xls"
              ref={importInputRef}
              onChange={handleImportFileChange}
              className="hidden"
            />

            {/* Import */}
            <button
              type="button"
              onClick={triggerImport}
              disabled={importLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-slate-300 bg-white text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{importLoading ? "Importing..." : "Import Excel"}</span>
            </button>

            {/* Export */}
            <button
              type="button"
              onClick={handleExport}
              disabled={exportLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-slate-300 bg-white text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportLoading ? "Exporting..." : "Export Excel"}</span>
            </button>
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
            {info && (
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-3 shadow-sm text-xs text-emerald-700 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  ✓
                </div>
                <span>{info}</span>
              </div>
            )}
          </section>
        )}

        {/* Form + List */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Add / Edit form */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
                {editingId ? (
                  <>
                    <Pencil className="w-4 h-4 text-indigo-500" />
                    Edit Requirement
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4 text-emerald-500" />
                    Add New Requirement
                  </>
                )}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] px-3 py-1.5 border border-slate-200 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium transition"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
              {/* School + Publisher + Book */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    School *
                  </label>
                  <select
                    name="school_id"
                    value={form.school_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select school</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Publisher
                  </label>
                  <select
                    name="publisher_id"
                    value={formPublisherId}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">All publishers</option>
                    {publishers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Book *
                  </label>
                  <select
                    name="book_id"
                    value={form.book_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select book</option>
                    {getVisibleBooks().map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                        {b.publisher?.name ? ` (${b.publisher.name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Class + Session */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Class
                  </label>
                  <select
                    name="class_id"
                    value={form.class_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.class_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Session
                  </label>
                  <select
                    name="academic_session"
                    value={form.academic_session}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select session</option>
                    {SESSION_OPTIONS.map((session) => (
                      <option key={session} value={session}>
                        {session}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Copies + Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Required Copies
                  </label>
                  <input
                    name="required_copies"
                    type="number"
                    min={0}
                    value={form.required_copies}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Status
                  </label>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="draft">Draft</option>
                    <option value="confirmed">Confirmed</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer text-slate-600">
                    <input
                      type="checkbox"
                      checked={form.is_locked}
                      onChange={handleToggleLocked}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    <span>Locked (final)</span>
                  </label>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Remarks
                </label>
                <textarea
                  name="remarks"
                  value={form.remarks}
                  onChange={handleChange}
                  rows={2}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {editingId ? "Updating..." : "Saving..."}
                  </>
                ) : editingId ? (
                  <>
                    <Pencil className="w-4 h-4" />
                    Update Requirement
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4" />
                    Save Requirement
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
                Existing Requirements ({requirements.length})
              </h2>
            </div>
            {listLoading ? (
              <div className="flex items-center justify-center py-10 text-xs text-slate-600">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                Loading requirements...
              </div>
            ) : requirements.length === 0 ? (
              <div className="text-xs text-slate-500 py-10 text-center">
                No requirements added yet.
              </div>
            ) : (
              <div className="overflow-auto max-h-[420px] rounded-xl border border-slate-200/80 shadow-inner">
                <table className="w-full text-[11px] border-collapse bg-white">
                  <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-10">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                        School
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                        Book
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                        Class
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                        Session
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                        Copies
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                        Lock
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="border-b border-slate-200 px-3 py-2 align-top">
                          <div className="font-semibold truncate max-w-[220px] text-slate-800">
                            {r.school?.name || "-"}
                          </div>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 align-top">
                          <div className="font-semibold truncate max-w-[260px] text-slate-800">
                            {r.book?.title || "-"}
                          </div>
                          {r.book?.publisher?.name && (
                            <div className="text-[10px] text-slate-500">
                              {r.book.publisher.name}
                            </div>
                          )}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-left align-top text-slate-700">
                          {r.class?.class_name || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-center align-top text-slate-700">
                          {r.academic_session || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right align-top text-slate-800">
                          {formatNumber(r.required_copies)}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-center align-top">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${
                              r.status === "confirmed"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {r.status === "confirmed"
                              ? "Confirmed"
                              : "Draft"}
                          </span>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-center align-top">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${
                              r.is_locked
                                ? "bg-slate-900 text-white"
                                : "bg-slate-50 text-slate-600 border border-slate-200"
                            }`}
                          >
                            {r.is_locked ? "Locked" : "Open"}
                          </span>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 align-top">
                          <div className="flex items-center justify-center gap-2">
                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => handleEdit(r)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition"
                              aria-label="Edit requirement"
                            >
                              <Pencil className="w-3.5 h-3.5 text-slate-700" />
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => handleDelete(r.id)}
                              disabled={deletingId === r.id}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 text-red-700 transition disabled:opacity-60"
                              aria-label="Delete requirement"
                            >
                              {deletingId === r.id ? (
                                <div className="w-3 h-3 border-2 border-red-700 border-t-transparent rounded-full animate-spin" />
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

export default RequirementsPageClient;
