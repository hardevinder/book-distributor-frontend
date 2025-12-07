"use client";

import React, { useEffect, useState, useRef } from "react";
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

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

const PublishersPageClient: React.FC = () => {
  const { user, logout } = useAuth();
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

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
  // name, contact_person, phone, email, address => 0..4
  const LAST_INDEX = 4;

  const [toast, setToast] = useState<ToastState>(null);

  const fetchPublishers = async () => {
    setListLoading(true);
    try {
      const res = await api.get<Publisher[]>("/api/publishers");
      setPublishers(res.data);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load publishers.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchPublishers();
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
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    editRowRefs.current = [];
  };

  const savePublisher = async () => {
    setError(null);
    setImportSummary(null);
    setLoading(true);

    try {
      if (!form.name.trim()) {
        throw new Error("Name is required.");
      }

      if (editingId) {
        // UPDATE
        await api.put(`/api/publishers/${editingId}`, form);
        setToast({
          message: "Publisher updated successfully.",
          type: "success",
        });
      } else {
        // CREATE
        await api.post("/api/publishers", form);
        setToast({
          message: "Publisher added successfully.",
          type: "success",
        });
      }

      resetForm();
      await fetchPublishers();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.message ||
        err?.response?.data?.error ||
        (editingId
          ? "Failed to update publisher."
          : "Failed to create publisher.");
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
    setForm({
      name: publisher.name || "",
      contact_person: publisher.contact_person || "",
      phone: publisher.phone || "",
      email: publisher.email || "",
      address: publisher.address || "",
    });

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
      await fetchPublishers();
      if (editingId === id) {
        resetForm();
      }
      setToast({
        message: "Publisher deleted successfully.",
        type: "success",
      });
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

      setToast({
        message: "Publishers exported successfully.",
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to export publishers.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleImportChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setImportSummary(null);
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/api/publishers/import", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const { created, updated, errors: importErrors } = res.data || {};
      let summary = `Import completed. Created: ${created ?? 0}, Updated: ${
        updated ?? 0
      }`;
      if (importErrors && importErrors.length > 0) {
        summary += `, Errors: ${importErrors.length}`;
      }
      setImportSummary(summary);

      setToast({
        message: "Publishers imported successfully.",
        type: "success",
      });

      await fetchPublishers();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error ||
        "Failed to import publishers from Excel.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
        if (!loading) {
          savePublisher();
        }
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
        if (!loading) {
          savePublisher();
        }
      }
    };

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
              Publisher Management
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Onboard & Organize Partners
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
              Publisher Directory
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || listLoading || publishers.length === 0}
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

        {/* Table with Excel-style add/edit */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              Publishers ({publishers.length})
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
              Loading publishers...
            </div>
          ) : publishers.length === 0 && !editingId ? (
            <div className="text-xs sm:text-sm text-slate-500 py-4 mb-3">
              Start typing in the row below headers to add your first
              publisher.
            </div>
          ) : null}

          <div className="overflow-auto max-h-[520px] rounded-xl border border-slate-200/80 shadow-inner">
            <table className="w-full text-[11px] sm:text-sm border-collapse bg-white">
              <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-20">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                    Name
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
                      placeholder="Publisher name"
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
                      onClick={savePublisher}
                      className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] sm:text-xs font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60"
                    >
                      {loading ? "Saving..." : "Add"}
                    </button>
                  </td>
                </tr>

                {/* DATA ROWS */}
                {publishers.map((p) =>
                  editingId === p.id ? (
                    // EDIT ROW
                    <tr key={p.id} className="bg-yellow-50/70">
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
                            onClick={savePublisher}
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
                    // NORMAL ROW
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      <td className="px-3 py-2 border-b border-slate-200 font-medium text-slate-800">
                        {p.name}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-600">
                        {p.contact_person || "-"}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-600">
                        {p.phone || "-"}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-600">
                        {p.email || "-"}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-600">
                        <span className="line-clamp-2">
                          {p.address || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(p)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all group-hover:opacity-100 opacity-80"
                            aria-label="Edit publisher"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            disabled={deletingId === p.id}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all group-hover:opacity-100 opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Delete publisher"
                          >
                            {deletingId === p.id ? (
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

export default PublishersPageClient;
