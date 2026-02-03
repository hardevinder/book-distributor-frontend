"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  Search,
  RefreshCcw,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Receipt,
  X,
  Minus,
  Plus,
  School as SchoolIcon,
  User,
  IndianRupee,
  Layers,
} from "lucide-react";

/* ================= Types ================= */

type School = { id: number; name: string };
type ClassItem = { id: number; class_name: string; sort_order?: number; is_active?: boolean };

type BundleLite = { id: number; status?: string | null; school_id?: number; class_id?: number };

type BundleItemApi = {
  id: number;
  product_id: number;
  qty: number;

  product?: {
    id: number;
    type?: "BOOK" | "MATERIAL" | string;
    name?: string | null;
    title?: string | null;
    rate?: number | string | null;
    selling_price?: number | string | null;
    mrp?: number | string | null;

    book?: {
      id: number;
      title?: string | null;
      class_name?: string | null;
    } | null;
  } | null;

  sale_price?: number | string | null;
  selling_price?: number | string | null;
  unit_price?: number | string | null;
  rate?: number | string | null;
  mrp?: number | string | null;
};

type BundleFull = {
  id: number;
  status?: string | null;
  school_id?: number | null;
  class_id?: number | null;
  academic_session?: string | null;
  items?: BundleItemApi[];
  school?: { id: number; name: string } | null;
  class?: { id: number; class_name: string } | null;
};

type CartLine = {
  key: string;
  product_id: number;
  kind: "BOOK" | "MATERIAL";
  title: string;
  class_name?: string | null;
  qty: number;
  unit_price: number;
  include: boolean;

  book_id?: number | null;
};

/* ================= Helpers ================= */

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v: any) => Math.round(num(v) * 100) / 100;

const money = (v: any) => round2(v).toFixed(2);

// supports: {data:[...]}, {rows:[...]}, direct array, {data:{data:[...]}} etc
function normalizeArray<T>(resData: any): T[] {
  if (Array.isArray(resData?.data)) return resData.data as T[];
  if (Array.isArray(resData?.rows)) return resData.rows as T[];
  if (Array.isArray(resData)) return resData as T[];
  if (Array.isArray(resData?.data?.rows)) return resData.data.rows as T[];
  if (Array.isArray(resData?.data?.data)) return resData.data.data as T[];
  return [];
}

// ✅ supports: {success:true,data:{...}}, {data:{...}}, {bundle:{...}}, direct object
function normalizeObject<T>(resData: any): T | null {
  if (!resData) return null;
  if (resData?.data && typeof resData.data === "object" && !Array.isArray(resData.data)) return resData.data as T;
  if (resData?.bundle && typeof resData.bundle === "object") return resData.bundle as T;
  if (typeof resData === "object") return resData as T;
  return null;
}

function pickTitle(it: BundleItemApi): {
  title: string;
  class_name?: string | null;
  book_id?: number | null;
  kind: "BOOK" | "MATERIAL";
} {
  const p = it.product || null;
  const kind = String(p?.type || "BOOK").toUpperCase() === "MATERIAL" ? "MATERIAL" : "BOOK";

  const book = p?.book || null;
  const title =
    String(book?.title || "").trim() ||
    String(p?.name || "").trim() ||
    String(p?.title || "").trim() ||
    (kind === "BOOK" ? "Book" : "Item");

  const class_name = (book?.class_name || null) ?? null;
  const book_id = book?.id ? num(book.id) : null;

  return { title, class_name, book_id, kind };
}

function resolveUnitPrice(it: BundleItemApi): number {
  const p = it.product || null;
  return (
    num(it.sale_price) ||
    num(it.selling_price) ||
    num(it.unit_price) ||
    num(it.rate) ||
    num(it.mrp) ||
    num(p?.selling_price) ||
    num(p?.rate) ||
    num(p?.mrp) ||
    0
  );
}

function cmpClass(a: ClassItem, b: ClassItem) {
  const sa = num(a.sort_order);
  const sb = num(b.sort_order);
  if (sa !== sb) return sa - sb;

  const na = Number(String(a.class_name).replace(/[^\d]/g, ""));
  const nb = Number(String(b.class_name).replace(/[^\d]/g, ""));
  const fa = Number.isFinite(na) && na > 0;
  const fb = Number.isFinite(nb) && nb > 0;
  if (fa && fb && na !== nb) return na - nb;

  return String(a.class_name || "").localeCompare(String(b.class_name || ""), undefined, { numeric: true });
}

function pickBundleStatus(b: any): string | null {
  const s = String(b?.status ?? "").trim();
  return s ? s.toUpperCase() : null;
}

/* ================= Component ================= */

export default function SalesPosPageClient() {
  const { user } = useAuth();

  // Customer selection
  const [soldToType, setSoldToType] = useState<"SCHOOL" | "WALKIN">("SCHOOL");

  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [schoolQuery, setSchoolQuery] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  // Bundle/cart
  const [loading, setLoading] = useState(false);
  const [bundleId, setBundleId] = useState<number | null>(null);
  const [bundleStatus, setBundleStatus] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

  // Payment
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "CARD" | "CREDIT">("CASH");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  // UI feedback
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // receipt
  const lastSaleIdRef = useRef<number | null>(null);

  const clearBundleAndCart = () => {
    setCart([]);
    setBundleId(null);
    setBundleStatus(null);
    setPaidAmount(0);
    lastSaleIdRef.current = null;
  };

  /* -----------------------------------
     Receipt printing (FIX Unauthorized)
     - Fetch PDF with JWT header (axios)
     - Open as Blob URL in new tab
     ----------------------------------- */
  const openReceipt = async (saleId: number, size: "3in" | "a5") => {
    try {
      setErrMsg(null);

      const res = await api.get(`/api/sales/${saleId}/receipt?size=${size}`, {
        responseType: "blob",
      });

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        setErrMsg("Popup blocked. Please allow popups to print receipt.");
      }

      // cleanup later
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message || e?.message || "Failed to open receipt");
    }
  };

  /* ---------- Load masters ---------- */
  useEffect(() => {
    (async () => {
      try {
        setErrMsg(null);

        const [sRes, cRes] = await Promise.all([api.get("/api/schools?limit=500"), api.get("/api/classes?limit=500")]);

        const sList = normalizeArray<School>(sRes.data)
          .filter((s) => num(s.id) > 0 && String(s.name || "").trim())
          .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

        const cList = normalizeArray<ClassItem>(cRes.data)
          .filter((c) => num(c.id) > 0 && String(c.class_name || "").trim())
          .sort(cmpClass);

        setSchools(sList);
        setClasses(cList);

        if (sList.length && !selectedSchoolId) setSelectedSchoolId(num(sList[0].id));
        if (cList.length && !selectedClassId) setSelectedClassId(num(cList[0].id));
      } catch (e: any) {
        setErrMsg(e?.response?.data?.message || e?.message || "Failed to load masters");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Derived ---------- */
  const filteredSchools = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter((s) => String(s.name || "").toLowerCase().includes(q));
  }, [schools, schoolQuery]);

  const selectedSchool = useMemo(
    () => schools.find((s) => num(s.id) === num(selectedSchoolId)) || null,
    [schools, selectedSchoolId]
  );

  const selectedClass = useMemo(
    () => classes.find((c) => num(c.id) === num(selectedClassId)) || null,
    [classes, selectedClassId]
  );

  const totals = useMemo(() => {
    const included = cart.filter((x) => x.include);
    const subtotal = included.reduce((s, x) => s + round2(x.qty * x.unit_price), 0);
    const total = round2(subtotal);
    const paid = round2(Math.min(total, Math.max(0, paidAmount)));
    const balance = round2(Math.max(0, total - paid));
    return { subtotal: round2(subtotal), total, paid, balance, itemCount: included.length };
  }, [cart, paidAmount]);

  /* ---------- Cart operations ---------- */
  const setLine = (key: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };

  const incQty = (key: string) =>
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, qty: round2(x.qty + 1) } : x)));

  const decQty = (key: string) =>
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, qty: Math.max(0, round2(x.qty - 1)) } : x)));

  /* ---------- Load bundle items into cart ---------- */
  const loadBundleForSchoolClass = async () => {
    setErrMsg(null);
    setOkMsg(null);

    if (soldToType !== "SCHOOL") return setErrMsg("Select SCHOOL mode to load bundle items.");
    if (!selectedSchoolId || !selectedClassId) return setErrMsg("Select School and Class first.");

    setLoading(true);
    try {
      const bRes = await api.get(`/api/bundles?school_id=${selectedSchoolId}&class_id=${selectedClassId}&limit=5`);
      const rows = normalizeArray<BundleLite>(bRes.data);

      if (!rows.length) {
        clearBundleAndCart();
        setErrMsg("No bundle found for this school/class.");
        return;
      }

      const preferred =
        rows.find((r) => ["ISSUED", "PARTIAL", "RESERVED"].includes(String(r.status || "").toUpperCase())) || rows[0];

      const id = num(preferred.id);
      if (!id) {
        clearBundleAndCart();
        setErrMsg("Invalid bundle id returned.");
        return;
      }

      const fullRes = await api.get(`/api/bundles/${id}`);

      const bundle = normalizeObject<BundleFull>(fullRes.data);
      const realBundle =
        bundle && (bundle as any)?.items !== undefined ? bundle : normalizeObject<BundleFull>(fullRes.data?.data);

      const b =
        realBundle ||
        (fullRes.data?.data as BundleFull) ||
        (fullRes.data?.bundle as BundleFull) ||
        (fullRes.data as BundleFull);

      const items = Array.isArray(b?.items) ? b.items : [];
      const fallbackClassName = b?.class?.class_name || selectedClass?.class_name || null;

      const lines: CartLine[] = items
        .map((it) => {
          const { title, class_name, book_id, kind } = pickTitle(it);
          const qty = Math.max(0, round2(it.qty));
          const unit_price = Math.max(0, round2(resolveUnitPrice(it)));

          const product_id = num(it.product_id || it.product?.id);
          const key = `${product_id}:${book_id || 0}:${title}`;

          return {
            key,
            product_id,
            kind,
            title,
            class_name: class_name || fallbackClassName,
            qty,
            unit_price,
            include: qty > 0,
            book_id: book_id || null,
          };
        })
        .filter((x) => x.product_id > 0);

      setBundleId(num(b?.id) || id);
      setBundleStatus(pickBundleStatus(b) || String(preferred.status || "").toUpperCase() || null);
      setCart(lines);

      const autoTotal = lines.filter((x) => x.include).reduce((s, x) => s + round2(x.qty * x.unit_price), 0);
      setPaidAmount(round2(autoTotal));

      if (!lines.length) {
        setOkMsg(null);
        setErrMsg("Bundle loaded but items list is empty.");
      } else {
        setOkMsg(`Loaded bundle #${id} (${pickBundleStatus(b) || String(preferred.status || "").toUpperCase() || "OK"})`);
      }
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message || e?.message || "Failed to load bundle");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Submit sale ---------- */
  const submitSale = async (printSize: "3in" | "a5") => {
    setErrMsg(null);
    setOkMsg(null);

    const included = cart.filter((x) => x.include && x.qty > 0);
    if (!included.length) return setErrMsg("No items selected.");

    if (soldToType === "SCHOOL") {
      if (!selectedSchoolId) return setErrMsg("Select a school.");
      if (!selectedClassId) return setErrMsg("Select a class.");
    }

    setLoading(true);
    try {
      const payload = {
        sold_to_type: soldToType,
        sold_to_id: soldToType === "SCHOOL" ? selectedSchoolId : null,
        bundle_id: bundleId,
        class_name: soldToType === "SCHOOL" ? (selectedClass?.class_name || null) : null,
        payment_mode: paymentMode,
        paid_amount: paidAmount,
        notes: notes || null,
        items: included.map((x) => ({
          product_id: x.product_id,
          qty: x.qty,
          unit_price: x.unit_price,
          include: x.include,
        })),
      };

      const res = await api.post("/api/sales", payload);
      const saleId = num(res.data?.sale_id);
      lastSaleIdRef.current = saleId;

      setOkMsg(res.data?.message || "Sale saved");

      if (saleId) {
        await openReceipt(saleId, printSize);
      }
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message || e?.message || "Sale failed");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Reset ---------- */
  const resetCart = () => {
    clearBundleAndCart();
    setNotes("");
    setOkMsg(null);
    setErrMsg(null);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      {/* Top sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-slate-900 p-2 text-white">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold leading-5">POS Sales</div>
                <div className="text-xs text-slate-500">Fast billing • {user?.name ? `Hi, ${user.name}` : "Logged in"}</div>
              </div>
            </div>

            <button
              onClick={resetCart}
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium shadow-sm active:scale-[0.99]"
              title="Reset"
              type="button"
            >
              <RefreshCcw className="h-4 w-4" />
              Reset
            </button>
          </div>

          {/* Alerts */}
          {(errMsg || okMsg) && (
            <div className="mt-3 space-y-2">
              {errMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                  <div className="flex-1">{errMsg}</div>
                  <button onClick={() => setErrMsg(null)} className="p-1" type="button">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {okMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4" />
                  <div className="flex-1">{okMsg}</div>
                  <button onClick={() => setOkMsg(null)} className="p-1" type="button">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Customer selection bar */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSoldToType("SCHOOL")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                soldToType === "SCHOOL" ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700"
              }`}
            >
              <SchoolIcon className="h-4 w-4" />
              School
            </button>

            <button
              type="button"
              onClick={() => {
                setSoldToType("WALKIN");
                setSelectedSchoolId(null);
                setSelectedClassId(null);
                resetCart();
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                soldToType === "WALKIN" ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700"
              }`}
            >
              <User className="h-4 w-4" />
              Walk-in
            </button>
          </div>

          {/* School & class controls */}
          {soldToType === "SCHOOL" && (
            <div className="mt-3 space-y-2">
              {/* School dropdown + search */}
              <div className="rounded-2xl border bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <Search className="h-4 w-4" /> School
                  </div>
                  <div className="text-[11px] text-slate-500">{schools.length} schools loaded</div>
                </div>

                <input
                  value={schoolQuery}
                  onChange={(e) => setSchoolQuery(e.target.value)}
                  placeholder="Type school name to filter…"
                  className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                />

                <select
                  value={selectedSchoolId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setSelectedSchoolId(id);
                    clearBundleAndCart();
                    setOkMsg(null);
                    setErrMsg(null);
                  }}
                  className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select school…</option>
                  {filteredSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Class dropdown + load bundle */}
              <div className="rounded-2xl border bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-600">Class</div>
                  {bundleId && (
                    <div className="text-xs text-slate-500">
                      Bundle: <span className="font-semibold">#{bundleId}</span>{" "}
                      {bundleStatus ? <span className="ml-1 rounded-lg bg-slate-100 px-2 py-0.5">{bundleStatus}</span> : null}
                    </div>
                  )}
                </div>

                <select
                  value={selectedClassId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setSelectedClassId(id);
                    clearBundleAndCart();
                    setOkMsg(null);
                    setErrMsg(null);
                  }}
                  className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.class_name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={loading}
                  onClick={loadBundleForSchoolClass}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                >
                  <Layers className="h-4 w-4" />
                  {loading ? "Loading…" : "Load Items"}
                </button>

                {selectedSchool && selectedClass && (
                  <div className="mt-2 text-xs text-slate-500">
                    Selected: <span className="font-semibold">{selectedSchool.name}</span> •{" "}
                    <span className="font-semibold">{selectedClass.class_name}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main cart */}
      <div className="mx-auto max-w-2xl px-3 pb-28 pt-4">
        <div className="rounded-2xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-3 py-3">
            <div className="text-sm font-semibold">Cart</div>
            <div className="text-xs text-slate-500">
              Included: <span className="font-semibold">{totals.itemCount}</span>
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="p-5 text-center text-sm text-slate-500">
              No items loaded. Select school/class and tap <span className="font-semibold">Load Items</span>.
            </div>
          ) : (
            <div className="divide-y">
              {cart.map((x) => {
                const lineTotal = round2((x.include ? x.qty : 0) * x.unit_price);
                return (
                  <div key={x.key} className="p-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setLine(x.key, { include: !x.include })}
                        className={`mt-0.5 h-6 w-6 rounded-lg border flex items-center justify-center ${
                          x.include ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-400"
                        }`}
                        title="Include/Exclude"
                      >
                        {x.include ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{x.title}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {x.kind}
                              {x.class_name ? <> • {x.class_name}</> : null}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Line</div>
                            <div className="text-sm font-semibold">Rs. {money(lineTotal)}</div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border p-2">
                            <div className="text-[11px] font-semibold text-slate-600">Qty</div>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => decQty(x.key)}
                                className="rounded-lg border bg-white p-2 active:scale-[0.99]"
                              >
                                <Minus className="h-4 w-4" />
                              </button>

                              <input
                                inputMode="decimal"
                                value={String(x.qty)}
                                onChange={(e) => setLine(x.key, { qty: Math.max(0, round2(e.target.value)) })}
                                className="w-full rounded-lg border px-2 py-2 text-center text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                              />

                              <button
                                type="button"
                                onClick={() => incQty(x.key)}
                                className="rounded-lg border bg-white p-2 active:scale-[0.99]"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="rounded-xl border p-2">
                            <div className="text-[11px] font-semibold text-slate-600">Unit Price</div>
                            <div className="mt-1 flex items-center gap-2">
                              <IndianRupee className="h-4 w-4 text-slate-500" />
                              <input
                                inputMode="decimal"
                                value={String(x.unit_price)}
                                onChange={(e) => setLine(x.key, { unit_price: Math.max(0, round2(e.target.value)) })}
                                className="w-full rounded-lg border px-2 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment box */}
        <div className="mt-4 rounded-2xl border bg-white p-3 shadow-sm">
          <div className="text-sm font-semibold">Payment</div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as any)}
              className="w-full rounded-xl border bg-white px-3 py-3 text-sm font-semibold"
            >
              <option value="CASH">CASH</option>
              <option value="UPI">UPI</option>
              <option value="CARD">CARD</option>
              <option value="CREDIT">CREDIT</option>
            </select>

            <div className="rounded-xl border px-3 py-2">
              <div className="text-[11px] font-semibold text-slate-600">Paid</div>
              <div className="mt-1 flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-slate-500" />
                <input
                  inputMode="decimal"
                  value={String(paidAmount)}
                  onChange={(e) => setPaidAmount(Math.max(0, round2(e.target.value)))}
                  className="w-full rounded-lg border px-2 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)…"
            className="mt-2 w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            rows={2}
          />

          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Total</div>
              <div className="mt-1 font-semibold">Rs. {money(totals.total)}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Paid</div>
              <div className="mt-1 font-semibold">Rs. {money(totals.paid)}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Balance</div>
              <div className="mt-1 font-semibold">Rs. {money(totals.balance)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Grand Total</div>
              <div className="truncate text-lg font-extrabold">Rs. {money(totals.total)}</div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading || totals.total <= 0}
                onClick={() => submitSale("3in")}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60 active:scale-[0.99]"
              >
                <Printer className="h-4 w-4" />
                3in
              </button>

              <button
                type="button"
                disabled={loading || totals.total <= 0}
                onClick={() => submitSale("a5")}
                className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold shadow-sm disabled:opacity-60 active:scale-[0.99]"
              >
                <Receipt className="h-4 w-4" />
                A5
              </button>
            </div>
          </div>

          {bundleId && (
            <div className="mt-2 text-[11px] text-slate-500">
              Using bundle #{bundleId}
              {bundleStatus ? <span className="ml-2 rounded-lg bg-slate-100 px-2 py-0.5">{bundleStatus}</span> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
