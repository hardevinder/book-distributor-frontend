"use client";

import React, { useEffect, useRef, useState } from "react";
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
} from "lucide-react";

type Publisher = {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
};

const emptyForm: Omit<Publisher, "id"> = {
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

type Meta = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

type PublishersListResponse =
  | Publisher[]
  | {
      data: Publisher[];
      meta?: Meta;
    };

const normalizePublishers = (
  payload: PublishersListResponse
): { rows: Publisher[]; meta?: Meta } => {
  if (Array.isArray(payload)) return { rows: payload };
  return { rows: payload?.data ?? [], meta: payload?.meta };
};

const PublishersPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ✅ refs to always have latest values (fix "saving previous")
  const formRef = useRef(emptyForm);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // ✅ Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState<Meta | null>(null);

  // ✅ keep state + ref in sync whenever we set form
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

  const fetchPublishers = async (nextPage?: number, nextLimit?: number) => {
    setListLoading(true);
    try {
      const params: any = {
        page: nextPage ?? page,
        limit: nextLimit ?? limit,
      };

      const res = await api.get<PublishersListResponse>("/api/publishers", {
        params,
      });

      const { rows, meta } = normalizePublishers(res.data);

      // ✅ latest on top if backend returns array without ordering
      const sorted = [...(rows || [])].sort((a, b) => (b.id || 0) - (a.id || 0));

      setPublishers(sorted);
      setMeta(meta ?? null);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load publishers.");
      setPublishers([]);
      setMeta(null);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchPublishers(1, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto hide toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

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

  const savePublisher = async () => {
    setError(null);
    setImportSummary(null);
    setLoading(true);

    try {
      const latest = formRef.current;

      const cleanName = (latest.name ?? "").trim();
      if (!cleanName) {
        throw new Error("Publisher name is required.");
      }

      const payload = {
        ...latest,
        name: cleanName,
      };

      if (editingId) {
        await api.put(`/api/publishers/${editingId}`, payload);
        setToast({ message: "Publisher updated successfully.", type: "success" });
      } else {
        await api.post("/api/publishers", payload);
        setToast({ message: "Publisher added successfully.", type: "success" });
      }

      resetForm();
      // ✅ refresh same page
      await fetchPublishers(page, limit);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.message ||
        err?.response?.data?.error ||
        (editingId ? "Failed to update publisher." : "Failed to create publisher.");
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (publisher: Publisher) => {
    setError(null);
    setImportSummary(null);
    setEditingId(publisher.id);

    const nextForm = {
      name: publisher.name || "",
      contact_person: publisher.contact_person || "",
      phone: publisher.phone || "",
      email: publisher.email || "",
      address: publisher.address || "",
    };

    setFormBoth(nextForm);
    editRowRefs.current = [];
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this publisher? (Soft delete)"
    );
    if (!confirmDelete) return;

    setError(null);
    setImportSummary(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/publishers/${id}`);

      // ✅ after delete, if page becomes empty, go prev page
      const willBeEmpty = publishers.length === 1 && page > 1;
      const nextPage = willBeEmpty ? page - 1 : page;
      if (willBeEmpty) setPage(nextPage);

      await fetchPublishers(nextPage, limit);

      if (editingId === id) resetForm();
      setToast({ message: "Publisher deleted successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to delete publisher.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async () => {
    setError(null);
    setImportSummary(null);
    setExporting(true);
    try {
      const res = await api.get("/api/publishers/export", {
        responseType: "blob",
      });

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "publishers.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setToast({ message: "Publishers exported successfully.", type: "success" });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to export publishers.";
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

      const res = await api.post("/api/publishers/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const { created, updated, errors: importErrors } = res.data || {};
      let summary = `Import completed. Created: ${created ?? 0}, Updated: ${updated ?? 0}`;
      if (importErrors && importErrors.length > 0) {
        summary += `, Errors: ${importErrors.length}`;
      }
      setImportSummary(summary);

      setToast({ message: "Publishers imported successfully.", type: "success" });

      // after import, go page 1
      setPage(1);
      await fetchPublishers(1, limit);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error || "Failed to import publishers from Excel.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ---------- Excel-like key handlers ---------- */

  const makeAddRowKeyDown =
    (index: number) =>
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (index < LAST_INDEX) {
        const next = addRowRefs.current[index + 1];
        if (next) next.focus();
      } else {
        if (!loading) savePublisher();
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
        if (!loading) savePublisher();
      }
    };

  /* ---------- Pagination helpers ---------- */

  const totalPages = meta?.totalPages;
  const total = meta?.total;

  const canPrev = page > 1;

  // if backend gives totalPages → trust it; else fallback: hasNext when rows == limit
  const canNext =
    typeof totalPages === "number" ? page < totalPages : publishers.length === limit;

  const goPrev = () => {
    if (!canPrev || listLoading) return;
    const nextPage = page - 1;
    setPage(nextPage);
    fetchPublishers(nextPage, limit);
  };

  const goNext = () => {
    if (!canNext || listLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPublishers(nextPage, limit);
  };

  const changeLimit = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLimit = Number(e.target.value);
    setLimit(nextLimit);
    setPage(1);
    fetchPublishers(1, nextLimit);
  };

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 overflow-hidden relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200/30 rounded-full blur-3xl" />
      </div>

      {/* Top bar (compact for 13") */}
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
                <div className="text-sm font-semibold leading-tight truncate">
                  Publisher Master
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  Onboard & organize partners
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Actions (kept in header, no overlap on 13") */}
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || listLoading || publishers.length === 0}
              className="h-9 px-3 rounded-full bg-indigo-600 text-white text-xs font-semibold shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
              title="Export Excel"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{exporting ? "Exporting..." : "Export"}</span>
            </button>

            <label
              className={`h-9 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow-sm hover:shadow inline-flex items-center gap-2 cursor-pointer ${
                importing ? "opacity-60 cursor-not-allowed" : ""
              }`}
              title="Import Excel"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">{importing ? "Importing..." : "Import"}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportChange}
                disabled={importing}
              />
            </label>

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

     
      </header>

      <main className="relative z-10 px-3 sm:px-4 py-3">
        {/* Alerts */}
        {(error || importSummary) && (
          <div className="mb-3 space-y-2">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                  !
                </div>
                <span className="truncate">{error}</span>
              </div>
            )}
            {importSummary && !error && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Sparkles className="w-3 h-3" />
                </div>
                <span className="truncate">{importSummary}</span>
              </div>
            )}
          </div>
        )}

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 border-b border-slate-200">
            <h2 className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Publishers{" "}
              {typeof total === "number" ? (
                <span className="text-slate-500 font-medium">({total})</span>
              ) : (
                <span className="text-slate-500 font-medium">({publishers.length})</span>
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

              {/* Pagination controls */}
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
              Loading publishers...
            </div>
          ) : publishers.length === 0 && !editingId ? (
            <div className="text-xs text-slate-500 px-3 sm:px-4 py-3">
              Start typing in the row below headers to add your first publisher.
            </div>
          ) : null}

          {/* ✅ max area for listing */}
          <div className="overflow-auto max-h-[calc(100dvh-210px)] border-t border-slate-100">
            <table className="w-full text-[11px] border-collapse bg-white">
              <thead className="bg-slate-50 sticky top-0 z-20">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[220px]">
                    Publisher
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[160px]">
                    Contact
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[130px]">
                    Phone
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[190px]">
                    Email
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200 min-w-[260px]">
                    Address
                  </th>

                  {/* ✅ sticky actions to stop overlap */}
                  <th className="px-2 py-2 text-center font-semibold text-slate-700 border-b border-slate-200 w-[110px] sticky right-0 bg-slate-50 z-30">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* ADD ROW */}
                <tr className="bg-white">
                  <td className="px-2 py-1.5 border-b border-slate-200">
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[0] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(0)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Publisher name"
                    />
                  </td>

                  <td className="px-2 py-1.5 border-b border-slate-200">
                    <input
                      name="contact_person"
                      value={form.contact_person}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[1] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(1)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Contact person"
                    />
                  </td>

                  <td className="px-2 py-1.5 border-b border-slate-200">
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

                  <td className="px-2 py-1.5 border-b border-slate-200">
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

                  <td className="px-2 py-1.5 border-b border-slate-200">
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

                  <td className="px-2 py-1.5 border-b border-slate-200 sticky right-0 bg-white z-10">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={savePublisher}
                      className="w-full inline-flex items-center justify-center h-8 px-3 rounded-full bg-emerald-600 text-white text-[11px] font-semibold shadow-sm hover:shadow disabled:opacity-60"
                    >
                      {loading ? "Saving..." : "Add"}
                    </button>
                  </td>
                </tr>

                {/* DATA ROWS */}
                {publishers.map((p) =>
                  editingId === p.id ? (
                    <tr key={p.id} className="bg-amber-50">
                      <td className="px-2 py-1.5 border-b border-slate-200">
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

                      <td className="px-2 py-1.5 border-b border-slate-200">
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

                      <td className="px-2 py-1.5 border-b border-slate-200">
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

                      <td className="px-2 py-1.5 border-b border-slate-200">
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

                      <td className="px-2 py-1.5 border-b border-slate-200">
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

                      <td className="px-2 py-1.5 border-b border-slate-200 sticky right-0 bg-amber-50 z-10">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={savePublisher}
                            className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-indigo-600 text-white text-[11px] font-semibold shadow-sm hover:shadow disabled:opacity-60"
                          >
                            {loading ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={resetForm}
                            className="inline-flex items-center justify-center h-8 px-3 rounded-full border border-slate-300 bg-white text-[11px] text-slate-700 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-2 py-2 border-b border-slate-200 font-medium text-slate-800">
                        {p.name || "-"}
                      </td>

                      <td className="px-2 py-2 border-b border-slate-200 text-slate-600">
                        {p.contact_person || "-"}
                      </td>

                      <td className="px-2 py-2 border-b border-slate-200 text-slate-600">
                        {p.phone || "-"}
                      </td>

                      <td className="px-2 py-2 border-b border-slate-200 text-slate-600">
                        {p.email || "-"}
                      </td>

                      <td className="px-2 py-2 border-b border-slate-200 text-slate-600">
                        <span className="line-clamp-2">{p.address || "-"}</span>
                      </td>

                      <td className="px-2 py-2 border-b border-slate-200 sticky right-0 bg-white z-10">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(p)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-indigo-600 text-white shadow-sm hover:shadow hover:scale-105 transition"
                            aria-label="Edit publisher"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            disabled={deletingId === p.id}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-rose-600 text-white shadow-sm hover:shadow hover:scale-105 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Delete publisher"
                            title="Delete"
                          >
                            {deletingId === p.id ? (
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
        </section>
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

export default PublishersPageClient;
