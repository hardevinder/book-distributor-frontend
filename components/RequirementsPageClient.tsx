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
  publisher_id?: number | null;
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

type RequirementRowFormState = {
  school_name: string;
  publisher_name: string;
  book_title: string;
  class_name: string;
  academic_session: string;
  required_copies: string;
  status: "draft" | "confirmed";
  is_locked: boolean;
};

const SESSION_OPTIONS: string[] = (() => {
  const base = 2025;
  const arr: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const y1 = base + i;
    const y2Short = String((y1 + 1) % 100).padStart(2, "0");
    arr.push(`${y1}-${y2Short}`);
  }
  return arr;
})();

const emptyRequirementForm: RequirementRowFormState = {
  school_name: "",
  publisher_name: "",
  book_title: "",
  class_name: "",
  academic_session: "2025-26",
  required_copies: "",
  status: "draft",
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

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

const RequirementsPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);

  const [form, setForm] = useState<RequirementRowFormState>(
    emptyRequirementForm
  );
  const [editingId, setEditingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterSchoolId, setFilterSchoolId] = useState<string>("");
  const [filterSession, setFilterSession] = useState<string>("");

  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [toast, setToast] = useState<ToastState>(null);

  // Excel-style key nav
  const addRowRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>(
    []
  );
  const editRowRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>(
    []
  );
  // school, publisher, book, class, session, copies, status => 0..6
  const LAST_INDEX = 6;

  /* ------------ FETCH HELPERS ------------ */

  const fetchSchools = async () => {
    try {
      const res = await api.get<SchoolsListResponse>("/api/schools", {
        params: { is_active: "true", limit: 500 },
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
        params: { limit: 1000 },
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

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // Books visible in book combo (roughly filter by publisher name typed)
  const getVisibleBooks = (): Book[] => {
    const pubName = form.publisher_name.trim().toLowerCase();
    if (!pubName) return books;
    return books.filter(
      (b) =>
        b.publisher?.name &&
        b.publisher.name.toLowerCase().includes(pubName)
    );
  };

  /* ------------ FORM HANDLERS ------------ */

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const resetForm = () => {
    setForm(emptyRequirementForm);
    setEditingId(null);
    editRowRefs.current = [];
  };

  const saveRequirement = async () => {
    setError(null);
    setLoading(true);

    try {
      const schoolName = form.school_name.trim();
      const publisherName = form.publisher_name.trim();
      const bookTitle = form.book_title.trim();
      const className = form.class_name.trim();

      if (!schoolName) {
        throw new Error("School is required.");
      }
      if (!bookTitle) {
        throw new Error("Book title is required.");
      }

      /* 1️⃣ School: find or create */
      let schoolId: number;
      const existingSchool = schools.find(
        (s) => s.name.toLowerCase() === schoolName.toLowerCase()
      );
      if (existingSchool) {
        schoolId = existingSchool.id;
      } else {
        const res = await api.post("/api/schools", { name: schoolName });
        const newSchool: School = res.data;
        schoolId = newSchool.id;
        setSchools((prev) => [...prev, newSchool]);
      }

      /* 2️⃣ Publisher: optional but needed for new book */
      let publisherId: number | null = null;
      if (publisherName) {
        const existingPublisher = publishers.find(
          (p) => p.name.toLowerCase() === publisherName.toLowerCase()
        );
        if (existingPublisher) {
          publisherId = existingPublisher.id;
        } else {
          const resPub = await api.post("/api/publishers", {
            name: publisherName,
          });
          const newPublisher: Publisher = resPub.data;
          publisherId = newPublisher.id;
          setPublishers((prev) => [...prev, newPublisher]);
        }
      }

      /* 3️⃣ Class: optional, create if new */
      let classId: number | null = null;
      if (className) {
        const existingClass = classes.find(
          (c) => c.class_name.toLowerCase() === className.toLowerCase()
        );
        if (existingClass) {
          classId = existingClass.id;
        } else {
          try {
            const resClass = await api.post("/api/classes", {
              class_name: className,
              sort_order: 0,
              is_active: true,
            });
            const newClass: ClassItem = resClass.data;
            classId = newClass.id;
            setClasses((prev) => [...prev, newClass]);
          } catch (err) {
            console.error("Failed to auto-create class:", err);
            classId = null;
          }
        }
      }

      /* 4️⃣ Book: find or create */
      let bookId: number;
      let existingBook: Book | undefined;
      if (publisherId) {
        existingBook = books.find(
          (b) =>
            b.title.toLowerCase() === bookTitle.toLowerCase() &&
            (b.publisher_id === publisherId ||
              b.publisher?.id === publisherId)
        );
      } else {
        existingBook = books.find(
          (b) => b.title.toLowerCase() === bookTitle.toLowerCase()
        );
      }

      if (existingBook) {
        bookId = existingBook.id;
      } else {
        if (!publisherId) {
          throw new Error(
            "Publisher is required when creating a new book. Please type/select publisher."
          );
        }

        const resBook = await api.post("/api/books", {
          title: bookTitle,
          publisher_id: publisherId,
          class_name: className || null,
          subject: null,
          medium: null,
          mrp: 0,
          selling_price: null,
          is_active: true,
        });
        const newBook: Book = resBook.data;
        bookId = newBook.id;
        setBooks((prev) => [...prev, newBook]);
      }

      /* 5️⃣ Build requirement payload */
      const payload = {
        school_id: schoolId,
        book_id: bookId,
        class_id: classId,
        academic_session: form.academic_session.trim() || null,
        required_copies: form.required_copies
          ? Number(form.required_copies)
          : 0,
        status: form.status,
        remarks: null,
        is_locked: form.is_locked,
      };

      if (editingId) {
        await api.put(`/api/requirements/${editingId}`, payload);
        setToast({ message: "Requirement updated successfully.", type: "success" });
      } else {
        await api.post("/api/requirements", payload);
        setToast({ message: "Requirement added successfully.", type: "success" });
      }

      resetForm();
      await fetchRequirements(search, filterSchoolId, filterSession);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        (editingId
          ? "Failed to update requirement."
          : "Failed to create requirement.");
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (r: Requirement) => {
    setError(null);
    setEditingId(r.id);

    setForm({
      school_name: r.school?.name || "",
      publisher_name: r.book?.publisher?.name || "",
      book_title: r.book?.title || "",
      class_name: r.class?.class_name || "",
      academic_session: r.academic_session || "2025-26",
      required_copies:
        r.required_copies !== null && r.required_copies !== undefined
          ? String(r.required_copies)
          : "",
      status: r.status || "draft",
      is_locked: r.is_locked,
    });

    editRowRefs.current = [];
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this requirement?"
    );
    if (!confirmDelete) return;

    setError(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/requirements/${id}`);
      if (editingId === id) resetForm();
      await fetchRequirements(search, filterSchoolId, filterSession);
      setToast({ message: "Requirement deleted successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to delete requirement.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  /* ------------ SEARCH & FILTERS ------------ */

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

  /* ------------ IMPORT / EXPORT ------------ */

  const triggerImport = () => {
    setError(null);
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
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/api/requirements/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const { created, updated, errors } = res.data || {};
      const errorCount = Array.isArray(errors) ? errors.length : 0;

      setToast({
        message: `Import: ${created ?? 0} new, ${
          updated ?? 0
        } updated, ${errorCount} error(s).`,
        type: "success",
      });

      await fetchRequirements(search, filterSchoolId, filterSession);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error ||
        "Failed to import requirements. Please check the file format.";
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

      setToast({
        message: "Requirements exported successfully.",
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to export requirements.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setExportLoading(false);
    }
  };

  /* ------------ EXCEL-LIKE KEY NAV ------------ */

  const makeAddRowKeyDown =
    (index: number) =>
    (
      e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
    ): void => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (index < LAST_INDEX) {
        const next = addRowRefs.current[index + 1];
        if (next) next.focus();
      } else {
        if (!loading) {
          saveRequirement();
        }
      }
    };

  const makeEditRowKeyDown =
    (index: number) =>
    (
      e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
    ): void => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (index < LAST_INDEX) {
        const next = editRowRefs.current[index + 1];
        if (next) next.focus();
      } else {
        if (!loading) {
          saveRequirement();
        }
      }
    };

  /* ------------ UI ------------ */

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
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors text-sm"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
        <div className="font-bold flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg animate-pulse">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg sm:text-xl tracking-tight">
              School Book Requirements
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Capture & Lock School Orders
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-slate-800 text-sm">
              {user?.name || "User"}
            </span>
            {user?.role && (
              <span className="text-[11px] rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-2.5 py-1 border border-indigo-200 text-indigo-700 font-medium">
                {user.role}
              </span>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-red-600 text-white px-4 py-2 rounded-full text-xs sm:text-sm font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 transform"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 p-6 lg:p-8 space-y-6">
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
            <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
              Excel-like{" "}
              <span className="font-semibold">
                inline entry & editing for school-wise, class-wise book
                requirements
              </span>{" "}
              with import / export support feeding publisher orders.
            </p>
          </div>

          <div className="flex flex-col gap-2 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                className="px-3 py-1.5 border border-slate-300 rounded-full text-xs sm:text-sm min-w-[220px] bg-white shadow-sm"
                placeholder="Search by school / book..."
              />

              {/* School filter */}
              <select
                value={filterSchoolId}
                onChange={handleSchoolFilterChange}
                className="px-3 py-1.5 border border-slate-300 rounded-full text-xs sm:text-sm bg-white min-w-[200px] shadow-sm"
              >
                <option value="">All schools</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id.toString()}>
                    {s.name}
                  </option>
                ))}
              </select>

              {/* Session filter */}
              <select
                value={filterSession}
                onChange={handleSessionFilterChange}
                className="px-3 py-1.5 border border-slate-300 rounded-full text-xs sm:text-sm bg-white min-w-[140px] shadow-sm"
              >
                <option value="">All sessions</option>
                {SESSION_OPTIONS.map((session) => (
                  <option key={session} value={session}>
                    {session}
                  </option>
                ))}
              </select>
            </div>

            {/* Hidden file input */}
            <input
              type="file"
              accept=".xlsx,.xls"
              ref={importInputRef}
              onChange={handleImportFileChange}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-2">
              {/* Import */}
              <button
                type="button"
                onClick={triggerImport}
                disabled={importLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs sm:text-sm font-medium shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{importLoading ? "Importing..." : "Import Excel"}</span>
              </button>

              {/* Export */}
              <button
                type="button"
                onClick={handleExport}
                disabled={exportLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs sm:text-sm font-medium shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exportLoading ? "Exporting..." : "Export Excel"}</span>
              </button>
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

        {/* Table with Excel-style add/edit */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              Requirements ({requirements.length})
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
              Loading requirements...
            </div>
          ) : requirements.length === 0 && !editingId ? (
            <div className="text-xs sm:text-sm text-slate-500 py-4 mb-3">
              Start typing in the row below headers to add your first requirement.
            </div>
          ) : null}

          <div className="overflow-auto max-h-[520px] rounded-xl border border-slate-200/80 shadow-inner">
            <table className="w-full text-[11px] sm:text-sm border-collapse bg-white">
              <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-20">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    School
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    Publisher
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
                {/* ADD ROW (Excel style) */}
                <tr className="bg-slate-50/80">
                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      list="schoolOptions"
                      name="school_name"
                      value={form.school_name}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[0] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(0)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="School"
                    />
                  </td>
                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      list="publisherOptions"
                      name="publisher_name"
                      value={form.publisher_name}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[1] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(1)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Publisher"
                    />
                  </td>
                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      list="bookOptions"
                      name="book_title"
                      value={form.book_title}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[2] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(2)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Book"
                    />
                  </td>
                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      list="classOptions"
                      name="class_name"
                      value={form.class_name}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[3] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(3)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Class"
                    />
                  </td>
                  <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                    <select
                      name="academic_session"
                      value={form.academic_session}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[4] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(4)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    >
                      <option value="">Session</option>
                      {SESSION_OPTIONS.map((session) => (
                        <option key={session} value={session}>
                          {session}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-slate-200 px-3 py-1.5 text-right">
                    <input
                      name="required_copies"
                      type="number"
                      min={0}
                      value={form.required_copies}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[5] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(5)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white text-right focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="0"
                    />
                  </td>
                  <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                    <select
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[6] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(6)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    >
                      <option value="draft">Draft</option>
                      <option value="confirmed">Confirmed</option>
                    </select>
                  </td>
                  <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      name="is_locked"
                      checked={form.is_locked}
                      onChange={handleChange}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={saveRequirement}
                      className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] sm:text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                    >
                      {loading ? "Saving..." : "Add"}
                    </button>
                  </td>
                </tr>

                {/* DATA ROWS */}
                {requirements.map((r) =>
                  editingId === r.id ? (
                    // EDIT MODE ROW (inline)
                    <tr key={r.id} className="bg-yellow-50/70">
                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          list="schoolOptions"
                          name="school_name"
                          value={form.school_name}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[0] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(0)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>
                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          list="publisherOptions"
                          name="publisher_name"
                          value={form.publisher_name}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[1] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(1)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>
                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          list="bookOptions"
                          name="book_title"
                          value={form.book_title}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[2] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(2)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>
                      <td className="border-b border-slate-200 px-3 py-1.5">
                        <input
                          list="classOptions"
                          name="class_name"
                          value={form.class_name}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[3] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(3)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>
                      <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                        <select
                          name="academic_session"
                          value={form.academic_session}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[4] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(4)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        >
                          <option value="">Session</option>
                          {SESSION_OPTIONS.map((session) => (
                            <option key={session} value={session}>
                              {session}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-1.5 text-right">
                        <input
                          name="required_copies"
                          type="number"
                          min={0}
                          value={form.required_copies}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[5] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(5)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white text-right focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        />
                      </td>
                      <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                        <select
                          name="status"
                          value={form.status}
                          onChange={handleChange}
                          ref={(el) => {
                            editRowRefs.current[6] = el;
                          }}
                          onKeyDown={makeEditRowKeyDown(6)}
                          className="w-full border border-amber-300 rounded-md px-2 py-1 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        >
                          <option value="draft">Draft</option>
                          <option value="confirmed">Confirmed</option>
                        </select>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                        <input
                          type="checkbox"
                          name="is_locked"
                          checked={form.is_locked}
                          onChange={handleChange}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={saveRequirement}
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
                    // NORMAL DISPLAY ROW
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
                        <div className="text-[11px] text-slate-700 truncate max-w-[160px]">
                          {r.book?.publisher?.name || "-"}
                        </div>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 align-top">
                        <div className="font-semibold truncate max-w-[260px] text-slate-800">
                          {r.book?.title || "-"}
                        </div>
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
                          {r.status === "confirmed" ? "Confirmed" : "Draft"}
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
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all"
                            aria-label="Edit requirement"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDelete(r.id)}
                            disabled={deletingId === r.id}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all disabled:opacity-60"
                            aria-label="Delete requirement"
                          >
                            {deletingId === r.id ? (
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

          {/* Combos data sources */}
          <datalist id="schoolOptions">
            {schools.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>

          <datalist id="publisherOptions">
            {publishers.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>

          <datalist id="bookOptions">
            {getVisibleBooks().map((b) => (
              <option key={b.id} value={b.title} />
            ))}
          </datalist>

          <datalist id="classOptions">
            {classes.map((c) => (
              <option key={c.id} value={c.class_name} />
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

export default RequirementsPageClient;
