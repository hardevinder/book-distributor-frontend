"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import { Pencil, Trash2, ChevronLeft, Sparkles, Tags, X } from "lucide-react";

type ProductCategory = {
  id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  createdAt?: string;
  updatedAt?: string;
  products_count?: number;
};

type CategoryFormState = {
  name: string;
  description: string;
  is_active: boolean;
};

const emptyForm: CategoryFormState = {
  name: "",
  description: "",
  is_active: true,
};

type CategoriesListResponse =
  | ProductCategory[]
  | { data: ProductCategory[]; meta?: any };

const normalizeCategories = (payload: CategoriesListResponse): ProductCategory[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? [];
};

const ProductCategoriesPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ✅ Filters in title bar
  const [search, setSearch] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterActive, setFilterActive] = useState<string>(""); // "", "active", "inactive"

  // Excel-style navigation refs: name, description
  const addRowRefs = useRef<(HTMLInputElement | HTMLTextAreaElement | null)[]>([]);
  const editRowRefs = useRef<(HTMLInputElement | HTMLTextAreaElement | null)[]>([]);
  const LAST_INDEX = 1;

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    const max = 56;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  };

  /* -------------------- FETCH -------------------- */

  const fetchCategories = async (query?: string, activeFilter?: string) => {
    setListLoading(true);
    try {
      const params: any = { include_counts: "1" };

      if (query && query.trim()) params.q = query.trim();

      // backend expects ?active=true|false
      if (activeFilter === "active") params.active = "true";
      else if (activeFilter === "inactive") params.active = "false";

      const res = await api.get<CategoriesListResponse>("/api/product-categories", { params });
      setCategories(normalizeCategories(res.data));
    } catch (err: any) {
      console.error(err);
      setError("Failed to load categories.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------- FORM -------------------- */

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleToggleActive = () => {
    setForm((prev) => ({ ...prev, is_active: !prev.is_active }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    editRowRefs.current = [];
  };

  const saveCategory = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (!form.name.trim()) throw new Error("Category name is required.");

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
      };

      if (editingId) {
        await api.put(`/api/product-categories/${editingId}`, payload);
        setInfo("Category updated successfully.");
      } else {
        await api.post("/api/product-categories", payload);
        setInfo("Category added successfully.");
      }

      resetForm();
      await fetchCategories(search, filterActive);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        (editingId ? "Failed to update category." : "Failed to create category.");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (c: ProductCategory) => {
    setError(null);
    setInfo(null);
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      description: c.description || "",
      is_active: c.is_active,
    });
    editRowRefs.current = [];
  };

  const handleDelete = async (id: number) => {
    const ok = window.confirm("Delete this category? (It must not be used by products.)");
    if (!ok) return;

    setError(null);
    setInfo(null);
    setDeletingId(id);

    try {
      await api.delete(`/api/product-categories/${id}`);
      if (editingId === id) resetForm();
      await fetchCategories(search, filterActive);
      setInfo("Category deleted successfully.");
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message || "Failed to delete category. It may be used by products.";
      setError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  /* -------------------- SEARCH & FILTERS (TITLE BAR) -------------------- */

  const applyFilters = (q: string, af: string) => {
    fetchCategories(q, af);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      applyFilters(value, filterActive);
    }, 250);
  };

  const handleActiveFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilterActive(value);
    applyFilters(search, value);
  };

  const clearFilters = () => {
    setSearch("");
    setFilterActive("");
    applyFilters("", "");
  };

  /* ----------------- EXCEL-LIKE KEY NAV ----------------- */

  const makeAddRowKeyDown =
    (index: number) =>
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      if (index < LAST_INDEX) {
        const next = addRowRefs.current[index + 1];
        if (next) next.focus();
      } else if (!loading) {
        saveCategory();
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
      } else if (!loading) {
        saveCategory();
      }
    };

  /* -------------------- UI -------------------- */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden relative">
      {/* Blurry background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-25 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-25 animate-blob animation-delay-2000" />
        <div className="absolute top-40 left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-25 animate-blob animation-delay-4000" />
      </div>

      {/* ✅ Compact Title Bar: title + filters + user */}
      <header className="relative z-10 px-4 sm:px-6 py-2.5 bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: back + compact title */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs font-semibold">Back</span>
            </Link>

            <div className="h-5 w-px bg-slate-200" />

            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow">
                <Tags className="w-4 h-4" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-bold tracking-tight">Categories</span>
                <span className="text-[10px] text-slate-500">
                  {listLoading ? "Loading..." : `${categories.length} item(s)`}
                </span>
              </div>
            </div>
          </div>

          {/* Middle: filters (moved here for more list space) */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              className="px-3 py-1.5 border border-slate-300 rounded-full text-xs min-w-[220px] bg-white shadow-sm"
              placeholder="Search…"
            />

            <select
              value={filterActive}
              onChange={handleActiveFilterChange}
              className="px-3 py-1.5 border border-slate-300 rounded-full text-xs bg-white min-w-[140px] shadow-sm"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            {(search || filterActive) && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold shadow-sm"
                title="Clear filters"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          {/* Right: user + logout (compact) */}
          <div className="flex items-center justify-between lg:justify-end gap-3">
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-xs font-semibold text-slate-800">
                  {user?.name || "User"}
                </span>
                {user?.role && (
                  <span className="text-[10px] rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-2 py-0.5 border border-indigo-200 text-indigo-700 font-semibold">
                    {user.role}
                  </span>
                )}
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-red-600 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow hover:shadow-md hover:scale-[1.02] transition-all"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* ✅ Tiny helper bar for edit mode */}
        {editingId && (
          <div className="mt-2 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <div className="text-xs text-amber-800 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Editing category #{editingId}
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="text-[11px] px-3 py-1 rounded-full border border-amber-200 bg-white hover:bg-amber-50 text-amber-800 font-semibold"
            >
              Cancel Edit
            </button>
          </div>
        )}
      </header>

      <main className="relative z-10 p-4 sm:p-6">
        {/* Alerts (compact) */}
        {(error || info) && (
          <section className="mb-3 space-y-2">
            {error && (
              <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-2.5 shadow-sm text-xs text-red-700 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold">
                  !
                </div>
                <span className="truncate">{error}</span>
              </div>
            )}
            {info && !error && (
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-2.5 shadow-sm text-xs text-emerald-700 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Sparkles className="w-3 h-3" />
                </div>
                <span className="truncate">{info}</span>
              </div>
            )}
          </section>
        )}

        {/* ✅ Table takes max space now */}
        <section className="bg-white/85 backdrop-blur-sm rounded-2xl p-3 sm:p-4 shadow-lg border border-slate-200/60">
          <div className="overflow-auto max-h-[72vh] rounded-xl border border-slate-200/80 shadow-inner">
            <table className="w-full text-[11px] sm:text-xs border-collapse bg-white">
              <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-20">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    Category
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    Description
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700 w-[90px]">
                    Products
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700 w-[90px]">
                    Active
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700 w-[110px]">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* ADD ROW */}
                <tr className="bg-slate-50/80">
                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      ref={(el) => {
                        addRowRefs.current[0] = el;
                      }}
                      onKeyDown={makeAddRowKeyDown(0)}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Stationery"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5">
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={(e) => {
                        handleChange(e);
                        autoGrow(e.currentTarget);
                      }}
                      ref={(el) => {
                        addRowRefs.current[1] = el;
                        if (el) autoGrow(el);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          makeAddRowKeyDown(1)(e as any);
                        }
                      }}
                      className="w-full border border-slate-300 rounded-md px-2 py-1 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none leading-5"
                      rows={1}
                      placeholder="Pens, pencils, erasers..."
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5 text-right">
                    <span className="text-[11px] text-slate-500">0</span>
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={handleToggleActive}
                      className="h-4 w-4"
                      title="Active"
                    />
                  </td>

                  <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={saveCategory}
                      className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] sm:text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                    >
                      {loading ? "Saving..." : "Add"}
                    </button>
                  </td>
                </tr>

                {/* LOADING ROW */}
                {listLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-600">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        Loading categories...
                      </div>
                    </td>
                  </tr>
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">
                      No categories found. Add one in the top row.
                    </td>
                  </tr>
                ) : null}

                {/* DATA ROWS */}
                {!listLoading &&
                  categories.map((c) =>
                    editingId === c.id ? (
                      <tr key={c.id} className="bg-yellow-50/70">
                        <td className="border-b border-slate-200 px-3 py-1.5">
                          <input
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            ref={(el) => {
                              editRowRefs.current[0] = el;
                            }}
                            onKeyDown={makeEditRowKeyDown(0)}
                            className="w-full border border-amber-300 rounded-md px-2 py-1 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                          />
                        </td>

                        <td className="border-b border-slate-200 px-3 py-1.5">
                          <textarea
                            name="description"
                            value={form.description}
                            onChange={(e) => {
                              handleChange(e);
                              autoGrow(e.currentTarget);
                            }}
                            ref={(el) => {
                              editRowRefs.current[1] = el;
                              if (el) autoGrow(el);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                makeEditRowKeyDown(1)(e as any);
                              }
                            }}
                            className="w-full border border-amber-300 rounded-md px-2 py-1 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                            rows={1}
                          />
                        </td>

                        <td className="border-b border-slate-200 px-3 py-1.5 text-right">
                          <span className="text-[11px] text-slate-700">{c.products_count ?? 0}</span>
                        </td>

                        <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={handleToggleActive}
                            className="h-4 w-4"
                          />
                        </td>

                        <td className="border-b border-slate-200 px-3 py-1.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              disabled={loading}
                              onClick={saveCategory}
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
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="border-b border-slate-200 px-3 py-2">
                          <div className="font-semibold truncate max-w-[260px] text-slate-800" title={c.name}>
                            {c.name}
                          </div>
                        </td>

                        <td className="border-b border-slate-200 px-3 py-2">
                          {c.description ? (
                            <div className="text-[10px] text-slate-600 line-clamp-2 max-w-[520px]">
                              {c.description}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">-</span>
                          )}
                        </td>

                        <td className="border-b border-slate-200 px-3 py-2 text-right">
                          <span className="text-[11px] text-slate-700">{c.products_count ?? 0}</span>
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
                            <button
                              type="button"
                              onClick={() => handleEdit(c)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all"
                              aria-label="Edit category"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(c.id)}
                              disabled={deletingId === c.id}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all disabled:opacity-60"
                              aria-label="Delete category"
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
                    )
                  )}
              </tbody>
            </table>
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

export default ProductCategoriesPageClient;
