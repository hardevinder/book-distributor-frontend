"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  GraduationCap,
  Upload,
  Download,
  Pencil,
  Trash2,
  ChevronLeft,
  Sparkles,
} from "lucide-react";

type ClassItem = {
  id: number;
  class_name: string;
  sort_order: number;
  is_active: boolean;
};

type ClassFormState = {
  class_name: string;
  sort_order: string;
  is_active: boolean;
};

const emptyClassForm: ClassFormState = {
  class_name: "",
  sort_order: "",
  is_active: true,
};

type ClassesListResponse = ClassItem[] | { data: ClassItem[]; meta?: any };

const normalizeClasses = (payload: ClassesListResponse): ClassItem[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

const ClassesPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [form, setForm] = useState<ClassFormState>(emptyClassForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>(""); // all / active / inactive
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  /* -------------------- API FETCH -------------------- */

  const fetchClasses = async (query?: string, status?: string) => {
    setListLoading(true);
    try {
      const params: any = {};

      if (query && query.trim()) {
        params.q = query.trim();
      }

      if (status === "active") params.is_active = "true";
      if (status === "inactive") params.is_active = "false";

      const res = await api.get<ClassesListResponse>("/api/classes", {
        params,
      });

      setClasses(normalizeClasses(res.data));
    } catch (err: any) {
      console.error(err);
      setError("Failed to load classes.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  /* -------------------- FORM HANDLERS -------------------- */

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const target = e.target as HTMLInputElement;
      setForm((prev) => ({ ...prev, [name]: target.checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleToggleActive = () => {
    setForm((prev) => ({ ...prev, is_active: !prev.is_active }));
  };

  const resetForm = () => {
    setForm(emptyClassForm);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (!form.class_name.trim()) {
        setError("Class Name is required.");
        setLoading(false);
        return;
      }

      const payload = {
        class_name: form.class_name.trim(),
        sort_order: form.sort_order ? Number(form.sort_order) : 0,
        is_active: form.is_active,
      };

      if (editingId) {
        await api.put(`/api/classes/${editingId}`, payload);
        setInfo("Class updated successfully.");
      } else {
        await api.post("/api/classes", payload);
        setInfo("Class added successfully.");
      }

      resetForm();
      await fetchClasses(search, filterStatus);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          (editingId ? "Failed to update class." : "Failed to create class.")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cls: ClassItem) => {
    setError(null);
    setInfo(null);
    setEditingId(cls.id);
    setForm({
      class_name: cls.class_name || "",
      sort_order:
        cls.sort_order !== null && cls.sort_order !== undefined
          ? String(cls.sort_order)
          : "",
      is_active: cls.is_active,
    });
  };

  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this class?"
    );
    if (!confirmDelete) return;

    setError(null);
    setInfo(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/classes/${id}`);
      if (editingId === id) {
        resetForm();
      }
      await fetchClasses(search, filterStatus);
      setInfo("Class deleted successfully.");
    } catch (err: any) {
      console.error(err);
      setError("Failed to delete class.");
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
      fetchClasses(value, filterStatus);
    }, 400);
  };

  const handleStatusFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value;
    setFilterStatus(value);
    fetchClasses(search, value);
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

      const res = await api.post("/api/classes/import", formData, {
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

      await fetchClasses(search, filterStatus);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          "Failed to import classes. Please check the file format."
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
      const res = await api.get("/api/classes/export", {
        responseType: "blob",
      });

      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/octet-stream",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "classes.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setInfo("Classes exported successfully.");
    } catch (err: any) {
      console.error(err);
      setError("Failed to export classes.");
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg tracking-tight">
              Classes Master
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Standardised list for mapping books & reports
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
                Classes Setup
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Define a clean{" "}
              <span className="font-semibold">
                class hierarchy (Nursery to XII)
              </span>{" "}
              with sort order and status. This list will be used across the
              entire book distribution module.
            </p>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                className="px-3 py-1.5 border border-slate-300 rounded-full text-xs min-w-[200px] bg-white shadow-sm"
                placeholder="Search by class name..."
              />

              {/* Status filter */}
              <select
                value={filterStatus}
                onChange={handleStatusFilterChange}
                className="px-3 py-1.5 border border-slate-300 rounded-full text-xs bg-white min-w-[150px] shadow-sm"
              >
                <option value="">All status</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
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
                Export once & use as template for future imports.
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
                    Edit Class
                  </>
                ) : (
                  <>
                    <GraduationCap className="w-4 h-4 text-emerald-500" />
                    Add New Class
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
                  Class Name *
                </label>
                <input
                  name="class_name"
                  value={form.class_name}
                  onChange={handleChange}
                  placeholder="Nursery / LKG / UKG / I / II / XII..."
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs mb-1.5 text-slate-700">
                    Sort Order
                  </label>
                  <input
                    name="sort_order"
                    type="number"
                    value={form.sort_order}
                    onChange={handleChange}
                    placeholder="0,1,2..."
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Controls dropdown order (lower = higher priority).
                  </p>
                </div>
                <div className="flex items-center">
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={handleToggleActive}
                      className="h-3 w-3"
                      name="is_active"
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
                    Update Class
                  </>
                ) : (
                  <>
                    <GraduationCap className="w-4 h-4" />
                    Save Class
                  </>
                )}
              </button>
            </form>
          </div>

          {/* List */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-indigo-500" />
                Existing Classes ({classes.length})
              </h2>
            </div>
            {listLoading ? (
              <div className="flex items-center justify-center py-10 text-xs text-slate-600">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                Loading classes...
              </div>
            ) : classes.length === 0 ? (
              <div className="text-xs text-slate-500 py-8 text-center">
                No classes added yet. Start by adding your first class on the
                left.
              </div>
            ) : (
              <div className="overflow-auto max-h-[480px] rounded-xl border border-slate-200/80 shadow-inner">
                <table className="w-full text-[11px] border-collapse bg-white">
                  <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-10">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                        Class
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                        Sort Order
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
                    {classes.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="border-b border-slate-200 px-3 py-2">
                          <div className="font-semibold text-slate-800">
                            {c.class_name || "-"}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            ID: {c.id}
                          </div>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right">
                          {c.sort_order ?? 0}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] ${
                              c.is_active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-50 text-slate-500 border border-slate-200"
                            }`}
                          >
                            {c.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          <div className="flex items-center justify-center gap-2">
                            {/* Edit icon */}
                            <button
                              type="button"
                              onClick={() => handleEdit(c)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all"
                              aria-label="Edit class"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete icon */}
                            <button
                              type="button"
                              onClick={() => handleDelete(c.id)}
                              disabled={deletingId === c.id}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all disabled:opacity-60"
                              aria-label="Delete class"
                            >
                              {deletingId === c.id ? (
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

export default ClassesPageClient;
