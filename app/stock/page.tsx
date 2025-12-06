"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  BookOpen,
  Package,
  RefreshCcw,
  Layers,
  Building2,
  Search,
  ChevronLeft,
  Sparkles,
} from "lucide-react";

/* ---------- Types (expected from backend) ---------- */

type StockRow = {
  book_id: number;
  title: string;
  class_name?: string | null;
  subject?: string | null;
  code?: string | null;
  isbn?: string | null;
  publisher_name?: string | null;

  total_ordered_qty: number; // sum of all ordered qty from POs (non-cancelled)
  total_received_qty: number; // sum of all received qty from POs (non-cancelled)
  current_stock?: number | null; // optional: backend can send (if you maintain ledger)
};

const StockPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [publisherFilter, setPublisherFilter] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");

  // 🔽 Unique publishers for dropdown
  const publisherOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.publisher_name && r.publisher_name.trim()) {
        set.add(r.publisher_name.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // Derived totals
  const { totalBooks, totalOrdered, totalReceived, totalPending } = (() => {
    let totalBooks = rows.length;
    let totalOrdered = 0;
    let totalReceived = 0;
    rows.forEach((r) => {
      totalOrdered += Number(r.total_ordered_qty || 0);
      totalReceived += Number(r.total_received_qty || 0);
    });
    const totalPending = Math.max(totalOrdered - totalReceived, 0);
    return { totalBooks, totalOrdered, totalReceived, totalPending };
  })();

  const fetchStockSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<StockRow[]>("/api/stock/summary");
      setRows(res.data || []);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Failed to load stock summary. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockSummary();
  }, []);

  const filteredRows = rows.filter((r) => {
    let ok = true;

    if (publisherFilter) {
      ok =
        ok &&
        (r.publisher_name || "").trim().toLowerCase() ===
          publisherFilter.trim().toLowerCase();
    }

    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      ok =
        ok &&
        [
          r.title,
          r.class_name,
          r.subject,
          r.code,
          r.isbn,
          r.publisher_name,
        ]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(s));
    }

    return ok;
  });

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
            <Layers className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg tracking-tight">
              Stock Intake & Inventory
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Live book-wise stock from publisher receipts
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
        {/* Heading + Refresh */}
        <section className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md">
                <Sparkles className="w-4 h-4" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-500" />
                <span>Book-wise Stock Summary</span>
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Stock is auto-updated using{" "}
              <span className="font-semibold">
                Publisher Orders & Receive entries
              </span>
              . Whenever you mark books as received, numbers here reflect the
              latest position.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchStockSummary}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-slate-300 bg-white text-xs sm:text-sm font-medium hover:bg-slate-50 disabled:opacity-60 shadow-sm"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            {loading ? "Refreshing..." : "Refresh Stock"}
          </button>
        </section>

        {/* Alerts */}
        {error && (
          <section>
            <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 shadow-sm text-xs text-red-700 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                !
              </div>
              <span>{error}</span>
            </div>
          </section>
        )}

        {/* Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-md px-4 py-3 flex flex-col">
            <span className="text-[11px] text-slate-500">
              Distinct Books in Stock
            </span>
            <span className="mt-1 text-lg font-semibold text-slate-900">
              {totalBooks}
            </span>
            <span className="mt-1 text-[11px] text-slate-400">
              Based on publisher orders
            </span>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-md px-4 py-3 flex flex-col">
            <span className="text-[11px] text-slate-500">
              Total Ordered (Qty)
            </span>
            <span className="mt-1 text-lg font-semibold text-slate-900">
              {totalOrdered}
            </span>
            <span className="mt-1 text-[11px] text-slate-400">
              Sum of quantities in all POs
            </span>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-md px-4 py-3 flex flex-col">
            <span className="text-[11px] text-slate-500">
              Total Received (Qty)
            </span>
            <span className="mt-1 text-lg font-semibold text-emerald-700">
              {totalReceived}
            </span>
            <span className="mt-1 text-[11px] text-slate-400">
              From receive entries
            </span>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-md px-4 py-3 flex flex-col">
            <span className="text-[11px] text-slate-500">
              Pending to Receive (Qty)
            </span>
            <span className="mt-1 text-lg font-semibold text-amber-700">
              {totalPending}
            </span>
            <span className="mt-1 text-[11px] text-slate-400">
              Ordered – Received
            </span>
          </div>
        </section>

        {/* Filters */}
        <section className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center border border-slate-300 rounded-full bg-white px-3 py-1.5 min-w-[240px] shadow-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <input
              type="text"
              placeholder="Search by book, class, subject, code, ISBN..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full outline-none text-xs bg-transparent"
            />
          </div>

          <div>
            <label className="block text-[11px] mb-1 text-slate-600">
              Filter by Publisher
            </label>
            <div className="flex items-center gap-1">
              <div className="flex items-center border border-slate-300 rounded-full bg-white px-2 py-1.5 min-w-[220px] shadow-sm">
                <Building2 className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                <select
                  value={publisherFilter}
                  onChange={(e) => setPublisherFilter(e.target.value)}
                  className="w-full bg-transparent outline-none text-xs"
                >
                  <option value="">All publishers</option>
                  {publisherOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Stock Table */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-200/60">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2 text-slate-800">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <span>Book-wise Stock</span>
            </h2>
            <span className="text-[11px] text-slate-500">
              Showing {filteredRows.length} of {rows.length} records
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-xs text-slate-600">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading stock...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-xs text-slate-500 py-8 text-center">
              No stock records found. Make sure you have generated Publisher
              Orders and marked books as received.
            </div>
          ) : (
            <div className="overflow-auto max-h-[480px] rounded-xl border border-slate-200/80 shadow-inner">
              <table className="w-full text-[11px] border-collapse bg-white">
                <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-10">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left w-10 font-semibold text-slate-700">
                      #
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Book
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Class
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Subject
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Code / ISBN
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Publisher
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Ordered Qty
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Received Qty
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Pending Qty
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                      Current Stock
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => {
                    const ordered = Number(row.total_ordered_qty || 0);
                    const received = Number(row.total_received_qty || 0);
                    const pending = Math.max(ordered - received, 0);
                    const currentStock =
                      row.current_stock != null
                        ? Number(row.current_stock)
                        : received; // fallback: treat received as current stock

                    return (
                      <tr
                        key={row.book_id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="border-b border-slate-200 px-3 py-2 text-left">
                          {idx + 1}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          <span className="font-medium text-slate-800">
                            {row.title}
                          </span>
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {row.class_name || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {row.subject || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {row.code || row.isbn || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2">
                          {row.publisher_name || "-"}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right">
                          {ordered}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right">
                          {received}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right">
                          {pending}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-right">
                          {currentStock}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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

export default StockPageClient;
