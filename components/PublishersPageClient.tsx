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
} from "lucide-react"; // ✨ icons

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setImportSummary(null);
    setLoading(true);

    try {
      if (!form.name.trim()) {
        setError("Name is required.");
        setLoading(false);
        return;
      }

      if (editingId) {
        // UPDATE
        await api.put(`/api/publishers/${editingId}`, form);
      } else {
        // CREATE
        await api.post("/api/publishers", form);
      }

      resetForm();
      await fetchPublishers();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.error ||
          (editingId
            ? "Failed to update publisher."
            : "Failed to create publisher.")
      );
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
    } catch (err: any) {
      console.error(err);
      setError("Failed to delete publisher.");
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
    } catch (err: any) {
      console.error(err);
      setError("Failed to export publishers.");
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

      await fetchPublishers();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.error || "Failed to import publishers from Excel."
      );
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
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
          <Link href="/" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors">
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

      <main className="relative z-10 p-6 lg:p-8 space-y-8">
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
              className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
            <label className="group flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 cursor-pointer disabled:opacity-60">
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
            <span className="text-xs text-slate-500 hidden sm:block">
              (Template via export for bulk edits)
            </span>
          </div>
        </section>

        {/* Alerts */}
        {(error || importSummary) && (
          <div className="space-y-3">
            {error && (
              <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-red-700">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </div>
                  <span>{error}</span>
                </div>
              </div>
            )}
            {importSummary && !error && (
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <span>{importSummary}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form + List Grid */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Add / Edit Form Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                {editingId ? (
                  <>
                    <Pencil className="w-5 h-5 text-indigo-500" />
                    Edit Publisher
                  </>
                ) : (
                  <>
                    <BookOpen className="w-5 h-5 text-emerald-500" />
                    Add New Publisher
                  </>
                )}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Publisher Name *
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="Enter publisher name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Contact Person
                </label>
                <input
                  name="contact_person"
                  value={form.contact_person}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="Enter contact person"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Phone
                  </label>
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Enter phone number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Enter email address"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Address
                </label>
                <textarea
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                  rows={3}
                  placeholder="Enter full address"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-3 rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {editingId ? "Updating..." : "Saving..."}
                  </>
                ) : editingId ? (
                  <>
                    <Pencil className="w-4 h-4" />
                    Update Publisher
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4" />
                    Save Publisher
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Publishers List Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/50 overflow-hidden">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-500" />
              Active Partners ({publishers.length})
            </h2>
            {listLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-slate-500">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
                Loading publishers...
              </div>
            ) : publishers.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-500">
                <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                No publishers yet. Add your first one above!
              </div>
            ) : (
              <div className="overflow-auto max-h-96">
                <table className="w-full text-sm border-collapse bg-white rounded-xl overflow-hidden shadow-inner">
                  <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200">Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200">Contact Person</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200">Phone</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700 border-b border-slate-200">Email</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-700 border-b border-slate-200">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publishers.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3 border-b border-slate-200 font-medium text-slate-800">{p.name}</td>
                        <td className="px-4 py-3 border-b border-slate-200 text-slate-600">{p.contact_person || "-"}</td>
                        <td className="px-4 py-3 border-b border-slate-200 text-slate-600">{p.phone || "-"}</td>
                        <td className="px-4 py-3 border-b border-slate-200 text-slate-600">{p.email || "-"}</td>
                        <td className="px-4 py-3 border-b border-slate-200">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(p)}
                              className="flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all duration-200 group-hover:opacity-100 opacity-70"
                              aria-label="Edit publisher"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(p.id)}
                              disabled={deletingId === p.id}
                              className="flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all duration-200 group-hover:opacity-100 opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label="Delete publisher"
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
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

export default PublishersPageClient;