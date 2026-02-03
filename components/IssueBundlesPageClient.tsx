// components/IssueBundlesPageClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronLeft,
  Layers,
  School as SchoolIcon,
  Users,
  PackagePlus,
  RefreshCcw,
  XCircle,
  Eye,
  Search,
  Truck,
  Receipt,
  ClipboardCheck,
  NotebookPen,
  IndianRupee,
  Tag,
  Info,
  Filter,
  Download,
} from "lucide-react";

/* ---------------- Types ---------------- */

type Distributor = {
  id: number;
  name: string;
  mobile?: string | null;
  city?: string | null;
};

type School = { id: number; name: string };

type BookMini = {
  id: number;
  title: string;
  class_name?: string | null;

  rate?: number | string | null;
  selling_price?: number | string | null;
  mrp?: number | string | null;
};

type ProductMini = {
  id: number;
  type?: string | null; // BOOK/MATERIAL
  name?: string | null;
  book_id?: number | null;
  book?: BookMini | null;
};

type BundleItem = {
  id: number;
  bundle_id: number;

  product_id?: number | null;
  book_id?: number | null;

  reserved_qty: number;
  issued_qty: number;
  required_qty?: number;

  book?: BookMini | null;
  product?: ProductMini | null;

  mrp?: number | string | null;
  sale_price?: number | string | null;
  selling_price?: number | string | null;
  unit_price?: number | string | null;
  rate?: number | string | null;
};

type Bundle = {
  id: number;
  school_id: number;
  academic_session: string;

  status?: "RESERVED" | "ISSUED" | "CANCELLED" | string;

  name?: string | null;
  is_active?: boolean;
  class_id?: number | null;
  class_name?: string | null;

  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;

  school?: { id: number; name: string } | null;
  class?: { id: number; class_name: string } | null;

  items?: BundleItem[];
};

type IssueToType = "DISTRIBUTOR" | "SCHOOL";

type IssueMetaItemRow = {
  class_name?: string | null;

  title?: string | null;
  book_title?: string | null;
  product_name?: string | null;

  issued_qty?: number | string | null;
  reserved_qty?: number | string | null;

  requested_qty?: number | string | null;

  unit_price?: number | string | null;
  line_total?: number | string | null;

  book_id?: number | null;
  product_id?: number | null;
  bundle_item_id?: number | null;
  type?: string | null; // BOOK/MATERIAL
};

type IssueMeta = {
  item_rows?: IssueMetaItemRow[];
  totalRequested?: number;
  totalIssuedNow?: number;
  shortages?: Array<{ title?: string; shortBy?: number }>;
  non_book_items?: Array<{ title?: string; type?: string }>;
  totals?: {
    requested_amount?: number;
    issued_amount?: number;
    reserved_amount?: number;
    total_amount?: number;
  };
};

type BundleIssueRow = {
  id: number;
  issue_no?: string | null;
  academic_session?: string;

  issued_to_type: "DISTRIBUTOR" | "SCHOOL";
  issued_to_id: number;

  bundle_id: number;

  status?: "ISSUED" | "CANCELLED" | "PARTIAL" | "PENDING_STOCK" | string;

  notes?: string | null;
  pretty_notes?: string | null;
  meta?: IssueMeta | null;

  remarks?: string | null;

  createdAt?: string;
  updatedAt?: string;

  bundle?: Bundle | null;

  issuedDistributor?: Distributor | null;
  issuedSchool?: School | null;
};

type ToastState = { message: string; type: "success" | "error" } | null;

const DEFAULT_SESSION = "2026-27";

const IssueBundlesPageClient: React.FC = () => {
  const { logout } = useAuth();

  // master lists
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);

  // issued history
  const [issues, setIssues] = useState<BundleIssueRow[]>([]);
  const [issueSearch, setIssueSearch] = useState("");

  // hide cancelled by default
  const [showCancelled, setShowCancelled] = useState(false);

  const [selectedIssue, setSelectedIssue] = useState<BundleIssueRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // form
  const [issueToType, setIssueToType] = useState<IssueToType>("DISTRIBUTOR");
  const [issuedToId, setIssuedToId] = useState<number | "">("");
  const [bundleId, setBundleId] = useState<number | "">("");
  const [session, setSession] = useState<string>(DEFAULT_SESSION);
  const [qtyMultiplier, setQtyMultiplier] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");

  // ui
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  // confirm cancel modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState<BundleIssueRow | null>(null);

  const notesRef = useRef<HTMLInputElement | null>(null);

  /* ---------------- Helpers ---------------- */

  const normalizeList = (raw: any) => {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.rows)) return raw.rows;
    if (Array.isArray(raw?.success?.data)) return raw.success.data;
    return [];
  };

  const fmtDate = (iso?: string | null) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString();
    } catch {
      return iso || "";
    }
  };

  const toNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const money = (v: any) => {
    const n = toNum(v);
    return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  const normStatus = (st?: string) => String(st || "ISSUED").trim().toUpperCase();
  const statusLabel = (st?: string) => normStatus(st);

  // ✅ show cancel for anything except CANCELLED
  const canCancelIssue = (st?: string) => normStatus(st) !== "CANCELLED";

  // Book fallback pricing
  const bookRate = (b?: BookMini | null) => {
    if (!b) return 0;
    const r = toNum(b.rate);
    if (r) return r;
    const s = toNum(b.selling_price);
    if (s) return s;
    const m = toNum(b.mrp);
    if (m) return m;
    return 0;
  };

  // Bundle item pricing
  const bundleItemPrice = (it?: BundleItem | null) => {
    if (!it) return 0;

    const sp =
      toNum((it as any).sale_price) ||
      toNum((it as any).selling_price) ||
      toNum((it as any).unit_price) ||
      toNum((it as any).rate) ||
      0;
    if (sp) return sp;

    const mrp = toNum((it as any).mrp);
    if (mrp) return mrp;

    const pb = (it as any).product?.book as BookMini | undefined;
    if (pb) return bookRate(pb);

    return bookRate((it as any).book);
  };

  const displayNotes = (row?: { pretty_notes?: string | null; notes?: string | null; remarks?: string | null }) =>
    (row?.pretty_notes && String(row.pretty_notes).trim()) ||
    (row?.notes && String(row.notes).trim()) ||
    (row?.remarks && String(row.remarks).trim()) ||
    "";

  const bundleLabel = (b: Bundle) => {
    const schoolName = b.school?.name || `School #${b.school_id}`;
    const className = b.class?.class_name || b.class_name || (b.class_id ? `Class #${b.class_id}` : "");
    const itemCount = b.items?.length ?? 0;

    const qtyTotal = (b.items || []).reduce((s, it) => {
      const rq = toNum((it as any).required_qty);
      const res = toNum((it as any).reserved_qty);
      return s + (rq || res || 0);
    }, 0);

    if (!b.items || b.items.length === 0) {
      return `#${b.id} — ${schoolName} — ${className} — ${b.name || "Bundle"}`;
    }

    return `#${b.id} — ${schoolName} — ${className} — ${itemCount} titles • ${qtyTotal} qty`;
  };

  const selectedBundle = useMemo(() => {
    if (!bundleId) return null;
    return bundles.find((b) => b.id === bundleId) || null;
  }, [bundleId, bundles]);

  const selectedParty = useMemo(() => {
    if (!issuedToId) return null;
    if (issueToType === "DISTRIBUTOR") return distributors.find((d) => d.id === issuedToId) || null;
    return schools.find((s) => s.id === issuedToId) || null;
  }, [issuedToId, issueToType, distributors, schools]);

  const visibleBundles = useMemo(() => {
    if (issueToType === "SCHOOL" && issuedToId) {
      return bundles.filter((b) => Number(b.school_id) === Number(issuedToId));
    }
    return bundles;
  }, [bundles, issueToType, issuedToId]);

  useEffect(() => {
    if (!bundleId) return;
    const exists = visibleBundles.some((b) => b.id === bundleId);
    if (!exists) setBundleId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueToType, issuedToId, bundles]);

  const partyName = (row: BundleIssueRow) => {
    if (row.issued_to_type === "DISTRIBUTOR") return row.issuedDistributor?.name || `Distributor #${row.issued_to_id}`;
    return row.issuedSchool?.name || `School #${row.issued_to_id}`;
  };

  const partySub = (row: BundleIssueRow) => {
    if (row.issued_to_type === "DISTRIBUTOR") {
      const c = row.issuedDistributor?.city ? `City: ${row.issuedDistributor.city}` : "";
      const m = row.issuedDistributor?.mobile ? `Mobile: ${row.issuedDistributor.mobile}` : "";
      return [c, m].filter(Boolean).join(" • ");
    }
    return "";
  };

  const issueBadge = (st?: string) => {
    const s = normStatus(st);
    if (s === "CANCELLED") return "bg-rose-50 text-rose-700 border-rose-200";
    if (s === "ISSUED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "PARTIAL") return "bg-amber-50 text-amber-800 border-amber-200";
    if (s === "PENDING_STOCK") return "bg-slate-50 text-slate-700 border-slate-200";
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  };

  /* ---------------- Invoice Download ---------------- */

  const downloadInvoice = async (row: BundleIssueRow) => {
    if (!row?.id) return;

    try {
      setLoading(true);
      setError(null);

      const res = await api.get(`/api/bundle-issues/${row.id}/invoice`, { responseType: "blob" });

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const issueNo = row.issue_no || `ISSUE-${row.id}`;
      const party = (partyName(row) || "").replace(/[^\w\-]+/g, "_");
      const fileName = `Invoice_${issueNo}_${party}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);

      setToast({ message: "Invoice downloaded.", type: "success" });
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || "Failed to download invoice.";
      setToast({ message: msg, type: "error" });
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- Modal: Build display item rows ---------------- */

  const selectedIssueBundleItemPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    const items = selectedIssue?.bundle?.items || [];
    for (const bi of items) {
      const pId = toNum((bi as any).product_id);
      const biId = toNum((bi as any).id);
      const price = bundleItemPrice(bi);
      if (pId) map.set(`p:${pId}`, price);
      if (biId) map.set(`bi:${biId}`, price);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssue]);

  const modalItemRows = useMemo<IssueMetaItemRow[]>(() => {
    const rows = selectedIssue?.meta?.item_rows;

    if (Array.isArray(rows) && rows.length) {
      return rows.map((r) => {
        const unit = toNum(r.unit_price);
        if (unit > 0) return r;

        const biId = toNum((r as any).bundle_item_id);
        const pId = toNum((r as any).product_id);

        const fallback =
          (biId ? selectedIssueBundleItemPriceMap.get(`bi:${biId}`) : 0) ||
          (pId ? selectedIssueBundleItemPriceMap.get(`p:${pId}`) : 0) ||
          0;

        if (!fallback) return r;

        const requested =
          r.requested_qty != null ? toNum(r.requested_qty) : toNum(r.issued_qty) + toNum(r.reserved_qty);

        const line = toNum(r.line_total) || requested * fallback;

        return { ...r, unit_price: fallback, line_total: line };
      });
    }

    const items = selectedIssue?.bundle?.items || [];
    if (!items.length) return [];

    return items.map((it) => {
      const unit = bundleItemPrice(it);

      const issued = toNum((it as any).issued_qty);
      const reserved = toNum((it as any).reserved_qty);
      const requested = toNum((it as any).required_qty) || issued + reserved;

      const pType = String((it as any).product?.type || "BOOK").toUpperCase();

      const title =
        pType !== "BOOK"
          ? (it as any).product?.name || "Item"
          : (it as any).book?.title ||
            (it as any).product?.book?.title ||
            ((it as any).book_id ? `Book #${(it as any).book_id}` : "Book");

      const className =
        (it as any).book?.class_name ||
        (it as any).product?.book?.class_name ||
        (pType !== "BOOK" ? null : "Unassigned");

      return {
        class_name: className || "Unassigned",
        title,
        requested_qty: requested,
        unit_price: unit,
        line_total: unit * requested,
        book_id: (it as any).book_id ?? null,
        product_id: (it as any).product_id ?? undefined,
        bundle_item_id: (it as any).id,
        type: pType,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssue, selectedIssueBundleItemPriceMap]);

  const modalTotals = useMemo(() => {
    const rows = modalItemRows;
    const totalTitles = rows.length;

    const backendTotal = toNum(selectedIssue?.meta?.totals?.total_amount);

    const computedTotal = rows.reduce((s, r) => {
      const unit = toNum(r.unit_price);
      const requested =
        r.requested_qty != null ? toNum(r.requested_qty) : toNum(r.issued_qty) + toNum(r.reserved_qty);
      const line = toNum(r.line_total) || requested * unit;
      return s + line;
    }, 0);

    return { totalTitles, totalAmount: backendTotal > 0 ? backendTotal : computedTotal };
  }, [modalItemRows, selectedIssue]);

  const modalGroups = useMemo(() => {
    const rows = modalItemRows;
    const map = new Map<string, IssueMetaItemRow[]>();

    for (const r of rows) {
      const cn = String(r.class_name || "").trim();
      const key = cn ? cn : "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }

    const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return keys.map((k) => ({
      class_name: k,
      rows: (map.get(k) || [])
        .slice()
        .sort((x, y) => {
          const ax = String(x.title || x.book_title || x.product_name || "");
          const by = String(y.title || y.book_title || y.product_name || "");
          return ax.localeCompare(by);
        }),
    }));
  }, [modalItemRows]);

  /* ---------------- Toast ---------------- */

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  /* ---------------- Data Fetch ---------------- */

  const fetchMastersAndReservedBundles = async (sessionForFilter: string) => {
    setPageLoading(true);
    setError(null);
    try {
      const [dRes, sRes, bRes] = await Promise.all([
        api.get("/api/distributors"),
        api.get("/api/schools"),
        api.get("/api/bundles"),
      ]);

      const dList: Distributor[] = normalizeList(dRes?.data);
      const sList: School[] = normalizeList(sRes?.data);
      const bList: Bundle[] = normalizeList(bRes?.data);

      setDistributors([...dList].sort((a, b) => (b.id || 0) - (a.id || 0)));
      setSchools([...sList].sort((a, b) => (b.id || 0) - (a.id || 0)));

      const sess = String(sessionForFilter || "").trim();

      const filtered = [...bList]
        .filter((b) => {
          const bSess = String(b.academic_session || "").trim();
          const active = b.is_active !== false;
          return bSess === sess && active;
        })
        .sort((a, b) => (b.id || 0) - (a.id || 0));

      setBundles(filtered);
    } catch (e: any) {
      console.error(e);
      setError("Failed to load distributors/schools/bundles.");
    } finally {
      setPageLoading(false);
    }
  };

  const fetchIssues = async (sessionForFilter: string) => {
    setHistoryLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/bundle-issues", {
        params: { academic_session: String(sessionForFilter || "").trim() },
      });
      const list: BundleIssueRow[] = normalizeList(res?.data);

      const normalized = list.map((x) => ({
        ...x,
        academic_session:
          (x as any).academic_session ||
          (x as any).bundle?.academic_session ||
          String(sessionForFilter || "").trim(),
      }));

      setIssues([...normalized].sort((a, b) => (b.id || 0) - (a.id || 0)));
    } catch (e: any) {
      console.error(e);
      setIssues([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchAll = async (sessionForFilter: string) => {
    await Promise.all([fetchMastersAndReservedBundles(sessionForFilter), fetchIssues(sessionForFilter)]);
  };

  useEffect(() => {
    fetchAll(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIssuedToId("");
  }, [issueToType]);

  useEffect(() => {
    setBundleId("");
    fetchAll(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /* ---------------- Actions ---------------- */

  const submitIssue = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!issuedToId) throw new Error("Please select Distributor/School.");
      if (!bundleId) throw new Error("Please select Bundle.");
      if (!session.trim()) throw new Error("Academic session is required.");

      const payload: any = {
        academic_session: session.trim(),
        issued_to_type: issueToType,
        issued_to_id: issuedToId,
        bundle_id: bundleId,
        qty: clamp(toNum(qtyMultiplier) || 1, 1, 999),
        notes: notes.trim() || null,
      };

      await api.post(`/api/bundle-issues/bundles/${bundleId}/issue`, payload);

      setToast({ message: "Bundle issued successfully.", type: "success" });

      setIssueToType("DISTRIBUTOR");
      setIssuedToId("");
      setBundleId("");
      setQtyMultiplier(1);
      setNotes("");

      await fetchAll(session);
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || "Failed to issue bundle.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
      notesRef.current?.focus();
    }
  };

  const openIssueDetails = (row: BundleIssueRow) => {
    setSelectedIssue(row);
    setModalOpen(true);
  };

  const openCancelConfirm = (row: BundleIssueRow) => {
    setConfirmIssue(row);
    setConfirmOpen(true);
  };

  const doCancelConfirmed = async () => {
    if (!confirmIssue?.id) return;
    try {
      setLoading(true);
      setError(null);

      await api.post(`/api/bundle-issues/${confirmIssue.id}/cancel`);

      setToast({ message: "Issue cancelled & stock reverted.", type: "success" });

      setConfirmOpen(false);
      setConfirmIssue(null);

      // if that issue is open in details modal, close it
      if (selectedIssue?.id === confirmIssue.id) {
        setModalOpen(false);
        setSelectedIssue(null);
      }

      await fetchAll(session);
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.response?.data?.message || e?.response?.data?.error || e?.message || "Failed to cancel issue.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- Derived ---------------- */

  const filteredIssues = useMemo(() => {
    const q = issueSearch.trim().toLowerCase();

    let base = issues;
    if (!showCancelled) base = base.filter((x) => normStatus(x.status) !== "CANCELLED");

    if (!q) return base;

    return base.filter((x) => {
      const bId = String(x.bundle_id || "");
      const iNo = String(x.issue_no || "");
      const pName = partyName(x);
      const st = String(x.status || "");
      const n = displayNotes(x);
      const bn = (x.bundle?.notes || "").toLowerCase();
      const schoolName = (x.bundle?.school?.name || "").toLowerCase();

      return (
        bId.includes(q) ||
        iNo.toLowerCase().includes(q) ||
        pName.toLowerCase().includes(q) ||
        st.toLowerCase().includes(q) ||
        n.toLowerCase().includes(q) ||
        bn.includes(q) ||
        schoolName.includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, issueSearch, showCancelled]);

  const kpi = useMemo(() => {
    const base = showCancelled ? issues : issues.filter((x) => normStatus(x.status) !== "CANCELLED");
    const total = base.length;
    const issued = base.filter((x) => normStatus(x.status) === "ISSUED").length;
    const cancelled = base.filter((x) => normStatus(x.status) === "CANCELLED").length;
    const partial = base.filter((x) => normStatus(x.status) === "PARTIAL").length;
    const pending = base.filter((x) => normStatus(x.status) === "PENDING_STOCK").length;
    return { total, issued, cancelled, partial, pending };
  }, [issues, showCancelled]);

  /* ---------------- UI ---------------- */

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden relative">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-25 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-72 h-72 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-25 animate-blob animation-delay-2000" />
        <div className="absolute top-40 left-40 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-25 animate-blob animation-delay-4000" />
      </div>

      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/92 backdrop-blur-md border-b border-slate-200/60">
        <div className="px-4 sm:px-6 py-3">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors shrink-0">
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm font-semibold hidden sm:inline">Dashboard</span>
              </Link>

              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow">
                  <PackagePlus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold leading-tight truncate text-[15px]">Bundle Issue</div>
                  <div className="text-[11px] text-slate-500 leading-tight truncate hidden sm:block">
                    Issue bundles • Cancel reverts stock • Invoice for distributor issues
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                  <Filter className="w-3.5 h-3.5" />
                  Session
                </div>
                <input
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  className="w-full lg:w-[150px] border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm"
                  placeholder="2026-27"
                />
              </div>

              <div className="relative w-full lg:w-[380px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={issueSearch}
                  onChange={(e) => setIssueSearch(e.target.value)}
                  placeholder="Search: bundle / issue / school / distributor / notes"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowCancelled((v) => !v)}
                className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border font-semibold shadow-sm transition-all text-sm ${
                  showCancelled
                    ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <XCircle className="w-4 h-4" />
                {showCancelled ? "Hide Cancelled" : "Show Cancelled"}
              </button>

              <button
                onClick={() => fetchAll(session)}
                disabled={pageLoading || historyLoading}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold shadow-sm hover:shadow disabled:opacity-60 text-sm"
                title="Refresh all"
              >
                <RefreshCcw className={`w-4 h-4 ${pageLoading || historyLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>

              <button
                onClick={logout}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-500 to-red-600 text-white px-3 py-2 rounded-xl text-sm font-semibold shadow hover:shadow-md"
              >
                Logout
              </button>

              <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-500 pl-1">
                <Info className="w-3.5 h-3.5" />
                {kpi.total} records • {kpi.partial} partial • {kpi.pending} pending
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 h-[calc(100vh-76px)]">
        <div className="h-full px-4 sm:px-6 py-3">
          {error ? (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-red-700">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">!</div>
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-h-0">
            {/* LEFT */}
            <section className="lg:col-span-4 h-full min-h-0">
              <div className="h-full min-h-0 rounded-2xl border border-slate-200/60 bg-white/85 backdrop-blur-sm shadow-lg overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-slate-200 bg-white/70">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow">
                      <ClipboardCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold">Issue Now</div>
                      <div className="text-[11px] text-slate-500">
                        Session: <span className="font-semibold">{session}</span> • Bundles:{" "}
                        <span className="font-semibold">{bundles.length}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 overflow-auto min-h-0">
                  {pageLoading ? (
                    <div className="flex items-center justify-center py-8 text-sm text-slate-600">
                      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                      Loading...
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-700 mb-1.5">Issue To</div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setIssueToType("DISTRIBUTOR")}
                            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                              issueToType === "DISTRIBUTOR"
                                ? "bg-indigo-600 text-white border-indigo-600 shadow"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <Users className="w-4 h-4" />
                            Distributor
                          </button>

                          <button
                            type="button"
                            onClick={() => setIssueToType("SCHOOL")}
                            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                              issueToType === "SCHOOL"
                                ? "bg-indigo-600 text-white border-indigo-600 shadow"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <SchoolIcon className="w-4 h-4" />
                            School
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-700">
                          {issueToType === "DISTRIBUTOR" ? "Distributor" : "School"}
                        </label>
                        <select
                          value={issuedToId === "" ? "" : String(issuedToId)}
                          onChange={(e) => setIssuedToId(e.target.value ? Number(e.target.value) : "")}
                          className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm"
                        >
                          <option value="">Select {issueToType === "DISTRIBUTOR" ? "Distributor" : "School"}</option>
                          {(issueToType === "DISTRIBUTOR" ? distributors : schools).map((x: any) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>

                        {selectedParty && issueToType === "DISTRIBUTOR" ? (
                          <div className="mt-1 text-[11px] text-slate-500">
                            {(selectedParty as Distributor).city ? `City: ${(selectedParty as Distributor).city}` : ""}
                            {(selectedParty as Distributor).mobile ? `  •  Mobile: ${(selectedParty as Distributor).mobile}` : ""}
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-700">
                          Bundle {issueToType === "SCHOOL" ? "(Selected School)" : ""}
                        </label>
                        <select
                          value={bundleId === "" ? "" : String(bundleId)}
                          onChange={(e) => setBundleId(e.target.value ? Number(e.target.value) : "")}
                          className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm"
                        >
                          <option value="">Select Bundle</option>
                          {visibleBundles.map((b) => (
                            <option key={b.id} value={b.id}>
                              {bundleLabel(b)}
                            </option>
                          ))}
                        </select>

                        {issueToType === "SCHOOL" && issuedToId && visibleBundles.length === 0 ? (
                          <div className="mt-1 text-[11px] text-rose-600">No active bundles for this school in session {session}.</div>
                        ) : null}

                        {selectedBundle ? (
                          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-start gap-2">
                              <Layers className="w-4 h-4 text-indigo-600 mt-0.5" />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900">
                                  Bundle #{selectedBundle.id} • {selectedBundle.school?.name || `School #${selectedBundle.school_id}`}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {(selectedBundle.class?.class_name || selectedBundle.class_name || "") ? (
                                    <span className="font-semibold">{selectedBundle.class?.class_name || selectedBundle.class_name}</span>
                                  ) : null}
                                  {selectedBundle.name ? <span> • {selectedBundle.name}</span> : null}
                                </div>

                                {selectedBundle.notes?.trim() ? (
                                  <div className="mt-2 text-xs text-slate-700 flex items-start gap-2">
                                    <NotebookPen className="w-4 h-4 text-slate-500 mt-0.5" />
                                    <span className="line-clamp-3">{selectedBundle.notes}</span>
                                  </div>
                                ) : (
                                  <div className="mt-2 text-xs text-slate-500">
                                    {selectedBundle.items?.length ? "Reserved items loaded." : "This is a master bundle (no items in this API)."}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-700">Qty Multiplier</label>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={qtyMultiplier}
                            onChange={(e) => setQtyMultiplier(clamp(toNum(e.target.value) || 1, 1, 999))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm"
                            placeholder="1"
                          />
                          <div className="text-[11px] text-slate-500 whitespace-nowrap">x bundle qty</div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-700">Issue Notes (optional)</label>
                        <input
                          ref={notesRef}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm"
                          placeholder="Deliver with next transport / urgent / received by ..."
                        />
                      </div>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={submitIssue}
                        className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-extrabold shadow-md hover:shadow-lg hover:scale-[1.01] transition-all disabled:opacity-60"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        {loading ? "Issuing..." : "Issue Bundle"}
                      </button>

                      <div className="text-[11px] text-slate-500">Tip: Distributor users can issue only to their own distributor_id (backend rule).</div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* RIGHT */}
            <section className="lg:col-span-8 h-full min-h-0">
              <div className="h-full min-h-0 rounded-2xl border border-slate-200/60 bg-white/85 backdrop-blur-sm shadow-lg overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-slate-200 bg-white/70 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold truncate">Issued History</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Total: <span className="font-semibold">{kpi.total}</span> • Issued:{" "}
                        <span className="font-semibold">{kpi.issued}</span> • Partial:{" "}
                        <span className="font-semibold">{kpi.partial}</span> • Pending:{" "}
                        <span className="font-semibold">{kpi.pending}</span> • Cancelled:{" "}
                        <span className="font-semibold">{kpi.cancelled}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchIssues(session)}
                    disabled={historyLoading}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold shadow-sm hover:shadow disabled:opacity-60 text-sm"
                    title="Reload only history"
                  >
                    <Receipt className="w-4 h-4" />
                    Reload
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-10 text-sm text-slate-600">
                      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                      Loading issued history...
                    </div>
                  ) : filteredIssues.length === 0 ? (
                    <div className="p-4 text-sm text-slate-600">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">No issued records found for this session.</div>
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                        <tr className="text-left text-slate-600">
                          <th className="py-2 px-4">Issue</th>
                          <th className="py-2 px-4">Bundle</th>
                          <th className="py-2 px-4">School</th>
                          <th className="py-2 px-4">Issued To</th>
                          <th className="py-2 px-4">Notes</th>
                          <th className="py-2 px-4">Status</th>
                          <th className="py-2 px-4">Date</th>
                          <th className="py-2 px-4 text-right">Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredIssues.map((x) => {
                          const isDist = String(x.issued_to_type).toUpperCase() === "DISTRIBUTOR";
                          return (
                            <tr key={x.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                              <td className="py-3 px-4">
                                <div className="font-extrabold text-slate-900">{x.issue_no || `#${x.id}`}</div>
                                <div className="text-xs text-slate-500">{x.issued_to_type}</div>
                              </td>

                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900">Bundle #{x.bundle_id}</div>
                                <div className="text-xs text-slate-500">Session: {(x.academic_session || session).trim()}</div>
                              </td>

                              <td className="py-3 px-4">
                                {x.bundle?.school?.name ? <div className="font-semibold text-slate-900">{x.bundle.school.name}</div> : <span className="text-slate-400">—</span>}
                                {x.bundle?.notes ? (
                                  <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                                    <span className="font-semibold">Bundle:</span> {x.bundle.notes}
                                  </div>
                                ) : null}
                              </td>

                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900">{partyName(x)}</div>
                                <div className="text-xs text-slate-500">{partySub(x) || "—"}</div>
                              </td>

                              <td className="py-3 px-4">
                                {displayNotes(x) ? (
                                  <div className="text-slate-800 whitespace-pre-wrap line-clamp-3">{displayNotes(x)}</div>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-extrabold ${issueBadge(x.status)}`}>
                                  {statusLabel(x.status)}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{fmtDate(x.createdAt)}</td>

                              <td className="py-3 px-4">
                                <div className="flex items-center justify-end gap-2">
                                  {isDist ? (
                                    <button
                                      type="button"
                                      disabled={loading}
                                      onClick={() => downloadInvoice(x)}
                                      className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 shadow-sm disabled:opacity-60"
                                      title="Invoice"
                                    >
                                      <Download className="w-4 h-4" />
                                    </button>
                                  ) : null}

                                  <button
                                    type="button"
                                    onClick={() => openIssueDetails(x)}
                                    className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 shadow-sm"
                                    title="Details"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>

                                  {canCancelIssue(x.status) ? (
                                    <button
                                      type="button"
                                      disabled={loading}
                                      onClick={() => openCancelConfirm(x)}
                                      className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white shadow hover:shadow-md disabled:opacity-60"
                                      title="Cancel"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Details Modal */}
      {modalOpen && selectedIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setModalOpen(false);
              setSelectedIssue(null);
            }}
          />
          <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-4 bg-gradient-to-r from-slate-50 to-indigo-50">
              <div>
                <div className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-indigo-600" />
                  Issue Details
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Issue: <span className="font-semibold">{selectedIssue.issue_no || `#${selectedIssue.id}`}</span> • Bundle:{" "}
                  <span className="font-semibold">#{selectedIssue.bundle_id}</span> • Session:{" "}
                  <span className="font-semibold">{(selectedIssue.academic_session || session).trim()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {String(selectedIssue.issued_to_type).toUpperCase() === "DISTRIBUTOR" ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => downloadInvoice(selectedIssue)}
                    className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-60"
                    title="Invoice"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                ) : null}

                {canCancelIssue(selectedIssue.status) ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => openCancelConfirm(selectedIssue)}
                    className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white shadow hover:shadow-md disabled:opacity-60"
                    title="Cancel"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                ) : null}

                <button
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold shadow-sm"
                  onClick={() => {
                    setModalOpen(false);
                    setSelectedIssue(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[78vh] overflow-auto p-4 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 p-3 shadow-sm">
                  <div className="text-xs text-slate-500">Issued To</div>
                  <div className="font-extrabold text-slate-900">{partyName(selectedIssue)}</div>
                  <div className="text-xs text-slate-500">Type: {selectedIssue.issued_to_type}</div>
                  {partySub(selectedIssue) ? <div className="text-xs text-slate-500 mt-1">{partySub(selectedIssue)}</div> : null}
                </div>

                <div className="rounded-2xl border border-slate-200 p-3 shadow-sm">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-extrabold ${issueBadge(selectedIssue.status)}`}>
                      {statusLabel(selectedIssue.status)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Date: {fmtDate(selectedIssue.createdAt)}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-3 shadow-sm">
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <IndianRupee className="w-3.5 h-3.5" /> Total Amount
                  </div>
                  <div className="mt-2 text-base font-extrabold text-slate-900">₹ {money(modalTotals.totalAmount)}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Titles: <span className="font-semibold">{modalTotals.totalTitles}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 p-3 shadow-sm">
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <NotebookPen className="w-4 h-4 text-slate-500" />
                    Bundle Notes
                  </div>
                  <div className="text-slate-900 mt-1">
                    {selectedIssue.bundle?.notes?.trim() ? <span className="whitespace-pre-wrap">{selectedIssue.bundle.notes}</span> : <span className="text-slate-400">—</span>}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-3 shadow-sm">
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-slate-500" />
                    Issue Notes
                  </div>
                  <div className="text-slate-900 mt-1">
                    {displayNotes(selectedIssue) ? <span className="whitespace-pre-wrap">{displayNotes(selectedIssue)}</span> : <span className="text-slate-400">—</span>}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-3 font-extrabold text-slate-900">Items (Class-wise) • Item + Sale Price</div>

                <div className="p-4 space-y-4">
                  {modalItemRows.length === 0 ? (
                    <div className="text-sm text-slate-600">
                      Items not included in this response. (Backend should send <b>issue.meta.item_rows</b>)
                    </div>
                  ) : (
                    modalGroups.map((g) => (
                      <div key={g.class_name} className="rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 bg-white">
                          <div className="font-semibold text-slate-900">{g.class_name}</div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="text-left text-slate-600 bg-slate-50">
                                <th className="py-2 px-4">Item</th>
                                <th className="py-2 px-4 text-right">Sale Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.rows.map((r, idx) => {
                                const title = r.title || r.book_title || r.product_name || "Item";
                                const unit = toNum(r.unit_price);

                                return (
                                  <tr key={`${g.class_name}-${idx}`} className="border-t border-slate-100">
                                    <td className="py-2 px-4 font-semibold text-slate-900">
                                      {title}
                                      {r.type && String(r.type).toUpperCase() !== "BOOK" ? (
                                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                                          {String(r.type).toUpperCase()}
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className="py-2 px-4 text-right font-extrabold">₹ {money(unit)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50">
                          Note: If Sale Price shows ₹ 0, either bundle item price is 0 or backend did not include pricing.
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Cancel Modal */}
      {confirmOpen && confirmIssue && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => {
              if (loading) return;
              setConfirmOpen(false);
              setConfirmIssue(null);
            }}
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-rose-50 to-red-50 flex items-center justify-between gap-3">
              <div className="font-extrabold text-slate-900">Confirm Cancel</div>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmIssue(null);
                }}
                className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60"
                title="Close"
              >
                <XCircle className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm text-slate-700">
                Issue <span className="font-extrabold">{confirmIssue.issue_no || `#${confirmIssue.id}`}</span> will be cancelled and stock will be reverted.
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">To</span>
                  <span className="text-right">{partyName(confirmIssue)}</span>
                </div>
                <div className="flex justify-between gap-2 mt-1">
                  <span className="font-semibold">Bundle</span>
                  <span className="text-right">#{confirmIssue.bundle_id}</span>
                </div>
                <div className="flex justify-between gap-2 mt-1">
                  <span className="font-semibold">Status</span>
                  <span className="text-right">{statusLabel(confirmIssue.status)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setConfirmOpen(false);
                    setConfirmIssue(null);
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold shadow-sm disabled:opacity-60"
                >
                  No
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={doCancelConfirmed}
                  className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white shadow hover:shadow-md disabled:opacity-60"
                  title="Yes"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast ? (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
          {toast.message}
        </div>
      ) : null}

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.08);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.92);
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

export default IssueBundlesPageClient;
