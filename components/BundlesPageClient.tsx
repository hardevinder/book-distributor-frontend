"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronLeft,
  Layers,
  School as SchoolIcon,
  Search,
  RefreshCcw,
  Plus,
  Trash2,
  PackagePlus,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  X,
  Ban,
} from "lucide-react";

/* ---------------- Types ---------------- */

type School = { id: number; name: string };

type AvlBookRow = {
  book_id: number;
  title: string;
  subject?: string | null;
  code?: string | null;
  required_qty: number;
  available_qty: number;
  reserved_qty: number;
  issued_qty: number;
  free_qty?: number;
  class_name?: string;
};

type ClassBlock = { class_name: string; books: AvlBookRow[] };

type AvailabilityResponse = {
  school: School;
  academic_session: string | null;
  classes: ClassBlock[];
};

type BundleItemDraft = {
  book_id: number;
  title: string;
  code?: string | null;
  subject?: string | null;
  class_name?: string;
  free_qty: number;
  qty: number;
};

type BundleRow = {
  id: number;
  school_id: number;
  academic_session: string;
  status: "DRAFT" | "RESERVED" | "CANCELLED" | "ISSUED";
  notes?: string | null;
  createdAt?: string;
  school?: School;
  items?: Array<{
    id: number;
    book_id: number;
    qty: number;
    book?: { id: number; title: string };
  }>;
};

const SESSION_OPTIONS = (() => {
  const base = 2025;
  const arr: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const y1 = base + i;
    const y2Short = String((y1 + 1) % 100).padStart(2, "0");
    arr.push(`${y1}-${y2Short}`);
  }
  return arr;
})();

const normalizeSchools = (payload: any): School[] => {
  if (Array.isArray(payload)) return payload as School[];
  if (payload && Array.isArray(payload.data)) return payload.data as School[];
  if (payload && Array.isArray(payload.rows)) return payload.rows as School[];
  if (payload && Array.isArray(payload.schools)) return payload.schools as School[];
  return [];
};

const safeStr = (v: any) => String(v ?? "").trim();
const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const freeOf = (b: AvlBookRow) => {
  if (b.free_qty !== undefined && b.free_qty !== null) return Math.max(0, num(b.free_qty));
  return Math.max(0, num(b.available_qty) - num(b.reserved_qty));
};

const BundlesPageClient: React.FC = () => {
  const { user } = useAuth();

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<number | "">("");
  const [session, setSession] = useState<string>("");

  const [loadingAvl, setLoadingAvl] = useState(false);
  const [avl, setAvl] = useState<AvailabilityResponse | null>(null);

  const [loadingBundles, setLoadingBundles] = useState(false);
  const [bundles, setBundles] = useState<BundleRow[]>([]);

  const [q, setQ] = useState("");
  const [cart, setCart] = useState<BundleItemDraft[]>([]);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* ---------- Load Schools ---------- */
  useEffect(() => {
    const loadSchools = async () => {
      try {
        const res = await api.get("/api/schools");
        setSchools(normalizeSchools(res?.data));
      } catch (err) {
        console.error("Failed to load schools", err);
        setSchools([]);
      }
    };
    loadSchools();
  }, []);

  const selectedSchool = useMemo(() => {
    const idNum = Number(schoolId);
    return schools.find((s) => s.id === idNum);
  }, [schools, schoolId]);

  /* ---------- Load Availability (books list) ---------- */
  const loadAvailability = async () => {
    if (!schoolId) return;
    setError(null);
    setSuccess(null);

    try {
      setLoadingAvl(true);
      const res = await api.get("/api/school-orders/availability", {
        params: { schoolId, academic_session: session || undefined },
      });
      const payload: AvailabilityResponse = res.data;
      setAvl(payload);
    } catch (err: any) {
      console.error("Failed to load availability", err);
      setAvl(null);
      setError(err?.response?.data?.message || "Failed to load availability.");
    } finally {
      setLoadingAvl(false);
    }
  };

  /* ---------- Load Bundles list ---------- */
  const loadBundles = async () => {
    if (!schoolId) return;
    setError(null);

    try {
      setLoadingBundles(true);
      const res = await api.get("/api/bundles", {
        params: { schoolId, academic_session: session || undefined },
      });

      const rows = Array.isArray(res?.data?.rows) ? (res.data.rows as BundleRow[]) : [];
      setBundles(rows);
    } catch (err: any) {
      console.error("Failed to load bundles", err);
      setBundles([]);
      setError(err?.response?.data?.message || "Failed to load bundles.");
    } finally {
      setLoadingBundles(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([loadAvailability(), loadBundles()]);
  };

  /* ---------- Flatten availability books for search/add ---------- */
  const allBooks = useMemo(() => {
    const out: Array<AvlBookRow & { class_name: string }> = [];
    (avl?.classes || []).forEach((cls) => {
      (cls.books || []).forEach((b) => out.push({ ...b, class_name: cls.class_name }));
    });
    return out;
  }, [avl]);

  const filteredBooks = useMemo(() => {
    const query = safeStr(q).toLowerCase();
    if (!query) return allBooks.slice(0, 50);

    return allBooks
      .filter((b) => {
        const hay = `${b.title || ""} ${b.subject || ""} ${b.code || ""} ${b.class_name || ""}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 50);
  }, [allBooks, q]);

  const cartTotals = useMemo(() => {
    const items = cart.length;
    const qty = cart.reduce((s, it) => s + num(it.qty), 0);
    return { items, qty };
  }, [cart]);

  // ✅ quick lookup for “Added” state
  const cartMap = useMemo(() => {
    const m = new Map<number, BundleItemDraft>();
    cart.forEach((it) => m.set(it.book_id, it));
    return m;
  }, [cart]);

  const addToCart = (b: AvlBookRow & { class_name: string }) => {
    setError(null);
    setSuccess(null);

    // ✅ already added -> do nothing (button will show "Added")
    if (cartMap.has(b.book_id)) {
      setSuccess("Already added in cart ✅");
      return;
    }

    const free = freeOf(b);
    if (free <= 0) {
      setError("No FREE stock for this book. Cannot add.");
      return;
    }

    setCart((prev) => [
      ...prev,
      {
        book_id: b.book_id,
        title: b.title,
        subject: b.subject || null,
        code: b.code || null,
        class_name: b.class_name,
        free_qty: free,
        qty: 1,
      },
    ]);

    setSuccess("Added ✅");
  };

  const updateQty = (book_id: number, qty: number) => {
    setCart((prev) =>
      prev.map((x) => {
        if (x.book_id !== book_id) return x;
        const safeQty = Math.max(1, Math.min(num(qty), num(x.free_qty)));
        return { ...x, qty: safeQty };
      })
    );
  };

  const removeFromCart = (book_id: number) => {
    setCart((prev) => prev.filter((x) => x.book_id !== book_id));
  };

  const clearCart = () => setCart([]);

  const canCreate = !!schoolId && !!(session || avl?.academic_session) && cart.length > 0 && !saving;

  /* ---------- Create Bundle (reserve) ---------- */
  const createBundle = async () => {
    if (!canCreate) return;
    setError(null);
    setSuccess(null);

    const academic_session = session || avl?.academic_session || "";
    if (!academic_session) {
      setError("Session is required.");
      return;
    }

    const bad = cart.find((it) => num(it.qty) <= 0 || num(it.qty) > num(it.free_qty));
    if (bad) {
      setError(`Invalid qty for ${bad.title}. Max free: ${bad.free_qty}`);
      return;
    }

    try {
      setSaving(true);

      await api.post("/api/bundles", {
        schoolId: Number(schoolId),
        academic_session,
        notes: safeStr(notes) || null,
        items: cart.map((x) => ({ book_id: x.book_id, qty: num(x.qty) })),
      });

      setSuccess("Bundle created & stock reserved ✅");
      setNotes("");
      setCart([]);
      setQ("");

      await refreshAll();
    } catch (err: any) {
      console.error("Create bundle failed", err);
      const msg = err?.response?.data?.message || "Failed to create bundle.";
      setError(msg);

      if (err?.response?.data?.shortages?.length) {
        const s = err.response.data.shortages[0];
        setError(`${msg} (book_id ${s.book_id} short by ${s.shortBy})`);
      }
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Cancel Bundle ---------- */
  const cancelBundle = async (bundleId: number) => {
    setError(null);
    setSuccess(null);

    try {
      await api.post(`/api/bundles/${bundleId}/cancel`);
      setSuccess(`Bundle #${bundleId} cancelled ✅`);
      await refreshAll();
    } catch (err: any) {
      console.error("Cancel bundle failed", err);
      setError(err?.response?.data?.message || "Failed to cancel bundle.");
    }
  };

  /* ---------- Auto load when school/session selected ---------- */
  useEffect(() => {
    if (!schoolId) return;
    setCart([]);
    setNotes("");
    setQ("");
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, session]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                Desktop
              </Link>

              <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Layers className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <div className="text-base font-bold truncate">Bundles / Kits (Reserve Stock)</div>
                <div className="text-xs text-slate-500 truncate">
                  {selectedSchool?.name ? (
                    <>
                      <SchoolIcon className="inline w-4 h-4 mr-1" />
                      {selectedSchool.name}
                      {(session || avl?.academic_session) ? ` • ${(session || avl?.academic_session)}` : ""}
                    </>
                  ) : (
                    <>Select a school to create kits/bundles</>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-600 shrink-0 hidden sm:block">{user?.name || "User"}</div>
        </div>

        {/* Filters */}
        <div className="px-4 pb-4">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-12 md:col-span-5">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">School</label>
              <select
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                value={schoolId}
                onChange={(e) => setSchoolId(Number(e.target.value) || "")}
              >
                <option value="">Select School</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-12 sm:col-span-6 md:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Session</label>
              <select
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                value={session}
                onChange={(e) => setSession(e.target.value)}
              >
                <option value="">Auto</option>
                {SESSION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-12 sm:col-span-6 md:col-span-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={refreshAll}
                  disabled={!schoolId || loadingAvl || loadingBundles}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
                >
                  <RefreshCcw className={`w-4 h-4 ${(loadingAvl || loadingBundles) ? "animate-spin" : ""}`} />
                  Refresh
                </button>

                <button
                  onClick={clearCart}
                  disabled={cart.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Cart
                </button>

                <div className="ml-auto text-xs text-slate-600">
                  Cart: <b>{cartTotals.items}</b> items • <b>{cartTotals.qty}</b> qty
                </div>
              </div>
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="mt-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              {success}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="p-4 max-w-7xl mx-auto grid grid-cols-12 gap-4">
        {/* Left: Book Picker */}
        <section className="col-span-12 lg:col-span-7">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-bold">Add Books to Bundle</div>
                <div className="text-xs text-slate-500">Search & add from availability (shows FREE stock).</div>
              </div>
              {!schoolId && (
                <span className="text-xs px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                  Select school first
                </span>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  className={`w-full border border-slate-300 rounded-xl pl-10 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                    q ? "pr-10" : "pr-4"
                  }`}
                  placeholder="Title / subject / code / class…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  disabled={!schoolId}
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {!schoolId ? (
              <div className="mt-5 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Select a school to load availability list.
              </div>
            ) : loadingAvl ? (
              <div className="mt-5 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !avl ? (
              <div className="mt-5 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Click <b>Refresh</b> to load availability.
              </div>
            ) : (
              <div className="mt-5 border border-slate-200 rounded-2xl overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-100 sticky top-0 z-10">
                      <tr>
                        <th className="border-b border-slate-200 px-4 py-3 text-left font-bold text-slate-800">
                          Book
                        </th>
                        <th className="border-b border-slate-200 px-4 py-3 text-center font-bold text-slate-800 w-24">
                          Free
                        </th>
                        <th className="border-b border-slate-200 px-4 py-3 text-left font-bold text-slate-800 w-28">
                          Class
                        </th>
                        <th className="border-b border-slate-200 px-4 py-3 text-center font-bold text-slate-800 w-28">
                          Add
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBooks.map((b) => {
                        const free = freeOf(b);
                        const inCart = cartMap.has(b.book_id);
                        const cartItem = cartMap.get(b.book_id);
                        const noFree = free <= 0;

                        const buttonDisabled = noFree || inCart;

                        return (
                          <tr key={b.book_id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{b.title}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {b.subject && <span>{b.subject}</span>}
                                {b.code && <span>{b.subject ? " • " : ""}{b.code}</span>}
                              </div>

                              {inCart && (
                                <div className="mt-2 text-[11px] text-emerald-700 inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  In cart: <b>{cartItem?.qty ?? 0}</b>
                                </div>
                              )}

                              {noFree && (
                                <div className="mt-2 text-[11px] text-rose-700 inline-flex items-center gap-1">
                                  <Ban className="w-3.5 h-3.5" />
                                  Not available as FREE
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 text-center font-semibold">
                              <span
                                className={`px-2 py-1 rounded-lg border text-xs ${
                                  free > 0
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                    : "bg-rose-50 border-rose-200 text-rose-700"
                                }`}
                              >
                                {free}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-xs text-slate-700">{b.class_name}</td>

                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => addToCart(b)}
                                disabled={buttonDisabled}
                                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition border ${
                                  noFree
                                    ? "border-rose-200 bg-rose-50 text-rose-700 cursor-not-allowed opacity-90"
                                    : inCart
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 cursor-not-allowed"
                                    : "border-slate-300 bg-white hover:bg-slate-100 text-slate-800"
                                }`}
                                title={
                                  noFree
                                    ? "No FREE stock"
                                    : inCart
                                    ? "Already added"
                                    : "Add to bundle"
                                }
                              >
                                {noFree ? (
                                  <>
                                    <Ban className="w-4 h-4" />
                                    No Free
                                  </>
                                ) : inCart ? (
                                  <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Added
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-4 h-4" />
                                    Add
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredBooks.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-600">
                            No matching books.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right: Cart + Create */}
        <section className="col-span-12 lg:col-span-5 space-y-4">
          {/* Cart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold">Bundle Cart</div>
                <div className="text-xs text-slate-500">Set qty and reserve stock.</div>
              </div>
              <div className="text-xs text-slate-600">
                Items: <b>{cartTotals.items}</b> • Qty: <b>{cartTotals.qty}</b>
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Add books from left side.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {cart.map((it) => {
                  const over = num(it.qty) > num(it.free_qty);
                  return (
                    <div key={it.book_id} className="border border-slate-200 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{it.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {it.class_name ? <span>{it.class_name}</span> : null}
                            {it.code ? <span>{it.class_name ? " • " : ""}{it.code}</span> : null}
                          </div>
                          <div className="mt-2 text-xs">
                            Free:{" "}
                            <span className="px-2 py-1 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-800">
                              {it.free_qty}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFromCart(it.book_id)}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <label className="text-xs text-slate-600 w-14">Qty</label>
                        <input
                          type="number"
                          min={1}
                          max={it.free_qty}
                          value={it.qty}
                          onChange={(e) => updateQty(it.book_id, Number(e.target.value))}
                          className={`w-28 border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                            over ? "border-rose-300 bg-rose-50" : "border-slate-300 bg-white"
                          }`}
                        />
                        {over ? (
                          <span className="text-xs text-rose-700 inline-flex items-center gap-1">
                            <XCircle className="w-4 h-4" />
                            Over free stock
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            OK
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes (optional)</label>
              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                placeholder="e.g., Class 6 kits, term-1…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!schoolId}
              />
            </div>

            <div className="mt-4">
              <button
                onClick={createBundle}
                disabled={!canCreate}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
              >
                <PackagePlus className="w-5 h-5" />
                {saving ? "Creating…" : "Create Bundle & Reserve"}
              </button>

              <div className="mt-2 text-xs text-slate-500">
                This will only <b>reserve</b> stock (no deduction yet).
              </div>
            </div>
          </div>

          {/* Bundles list */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold">Created Bundles</div>
                <div className="text-xs text-slate-500">Cancel to unreserve stock.</div>
              </div>

              <button
                type="button"
                onClick={loadBundles}
                disabled={!schoolId || loadingBundles}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <RefreshCcw className={`w-4 h-4 ${loadingBundles ? "animate-spin" : ""}`} />
                Reload
              </button>
            </div>

            {!schoolId ? (
              <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Select a school to view bundles.
              </div>
            ) : loadingBundles ? (
              <div className="mt-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : bundles.length === 0 ? (
              <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                No bundles yet.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {bundles.map((b) => {
                  const canCancel = b.status === "RESERVED" || b.status === "DRAFT";
                  return (
                    <div key={b.id} className="border border-slate-200 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">
                            Bundle #{b.id}{" "}
                            <span
                              className={`ml-2 text-xs px-2 py-1 rounded-full border ${
                                b.status === "RESERVED"
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                  : b.status === "CANCELLED"
                                  ? "bg-rose-50 border-rose-200 text-rose-800"
                                  : "bg-slate-50 border-slate-200 text-slate-700"
                              }`}
                            >
                              {b.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {b.school?.name || selectedSchool?.name || `School #${b.school_id}`} • {b.academic_session}
                          </div>
                          {b.notes ? (
                            <div className="text-xs text-slate-600 mt-1">
                              Note: <span className="font-medium">{b.notes}</span>
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => cancelBundle(b.id)}
                          disabled={!canCancel}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 px-3 py-2 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition"
                          title={canCancel ? "Cancel bundle" : "Cannot cancel"}
                        >
                          <Ban className="w-4 h-4" />
                          Cancel
                        </button>
                      </div>

                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <div className="text-xs font-semibold text-slate-700 mb-2">Items</div>
                        <div className="space-y-1">
                          {(b.items || []).map((it) => (
                            <div key={it.id} className="flex items-center justify-between text-xs text-slate-700">
                              <div className="truncate">
                                {it.book?.title ? it.book.title : `Book #${it.book_id}`}
                              </div>
                              <div className="font-bold">{it.qty}</div>
                            </div>
                          ))}
                          {(b.items || []).length === 0 && (
                            <div className="text-xs text-slate-500">No items</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default BundlesPageClient;
