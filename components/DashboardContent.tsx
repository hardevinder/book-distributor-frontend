"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import {
  Building2,
  BookOpen,
  GraduationCap,
  Receipt,
  Package,
  Layers,
  ChevronRight,
  Truck,
  Users,
  ClipboardList,
  Boxes,
  PackageCheck,
  FileText,
  ScrollText,
  IndianRupee,
  Star,
  Search,
} from "lucide-react";

/* ---------------- Types ---------------- */

type DashCard = {
  title: string;
  href: string;
  icon: React.ReactNode;
  accent:
    | "emerald"
    | "amber"
    | "indigo"
    | "cyan"
    | "blue"
    | "teal"
    | "purple"
    | "sky"
    | "slate"
    | "fuchsia"
    | "rose";
};

/* ---------------- Colors ---------------- */

const accentMap: Record<
  DashCard["accent"],
  { iconBg: string; ring: string; hover: string }
> = {
  emerald: {
    iconBg: "from-emerald-500 to-teal-600",
    ring: "ring-emerald-200/70",
    hover: "hover:bg-emerald-50/60",
  },
  amber: {
    iconBg: "from-amber-500 to-orange-600",
    ring: "ring-amber-200/70",
    hover: "hover:bg-amber-50/60",
  },
  indigo: {
    iconBg: "from-indigo-500 to-purple-600",
    ring: "ring-indigo-200/70",
    hover: "hover:bg-indigo-50/60",
  },
  cyan: {
    iconBg: "from-cyan-500 to-sky-600",
    ring: "ring-cyan-200/70",
    hover: "hover:bg-cyan-50/60",
  },
  blue: {
    iconBg: "from-blue-500 to-sky-600",
    ring: "ring-blue-200/70",
    hover: "hover:bg-blue-50/60",
  },
  teal: {
    iconBg: "from-teal-500 to-emerald-600",
    ring: "ring-teal-200/70",
    hover: "hover:bg-teal-50/60",
  },
  purple: {
    iconBg: "from-purple-500 to-violet-600",
    ring: "ring-purple-200/70",
    hover: "hover:bg-purple-50/60",
  },
  sky: {
    iconBg: "from-sky-500 to-cyan-600",
    ring: "ring-sky-200/70",
    hover: "hover:bg-sky-50/60",
  },
  slate: {
    iconBg: "from-slate-700 to-indigo-700",
    ring: "ring-slate-200/70",
    hover: "hover:bg-slate-50/60",
  },
  fuchsia: {
    iconBg: "from-fuchsia-600 to-indigo-700",
    ring: "ring-fuchsia-200/70",
    hover: "hover:bg-fuchsia-50/60",
  },
  rose: {
    iconBg: "from-rose-500 to-red-600",
    ring: "ring-rose-200/70",
    hover: "hover:bg-rose-50/60",
  },
};

/* ---------------- Small Tile ---------------- */

function Tile({
  card,
  pinned,
  onTogglePin,
}: {
  card: DashCard;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const a = accentMap[card.accent];

  return (
    <div className="relative">
      {/* Pin button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin();
        }}
        className={`absolute right-2 top-2 z-10 inline-flex items-center justify-center rounded-full border bg-white/90 backdrop-blur px-2 py-1 text-[11px] font-semibold shadow-sm transition ${
          pinned
            ? "border-amber-200 text-amber-700"
            : "border-slate-200 text-slate-500 hover:text-slate-700"
        }`}
        title={pinned ? "Unpin" : "Pin"}
      >
        <Star className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
      </button>

      <Link
        href={card.href}
        className={`group flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/85 backdrop-blur px-3 py-3 shadow-sm transition active:scale-[0.99] ${a.hover}`}
      >
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${a.iconBg} text-white shadow ring-2 ${a.ring}`}
        >
          {card.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-extrabold text-slate-900">
            {card.title}
          </div>
          <div className="mt-0.5 h-[3px] w-10 rounded-full bg-slate-200/70 group-hover:w-14 transition-all" />
        </div>

        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition" />
      </Link>
    </div>
  );
}

/* ---------------- Page ---------------- */

const LS_PIN_KEY = "bdp_dashboard_pins_v1";

const DashboardContent: React.FC = () => {
  const { user, logout } = useAuth();

  const allCards = useMemo<DashCard[]>(
    () => [
      { title: "Company", href: "/company-profile", icon: <Building2 className="h-5 w-5" />, accent: "emerald" },
      { title: "Suppliers", href: "/suppliers", icon: <Users className="h-5 w-5" />, accent: "amber" },
      { title: "Publishers", href: "/publishers", icon: <Building2 className="h-5 w-5" />, accent: "indigo" },
      { title: "Transports", href: "/transports", icon: <Truck className="h-5 w-5" />, accent: "cyan" },
      { title: "Classes", href: "/classes", icon: <GraduationCap className="h-5 w-5" />, accent: "blue" },
      { title: "Schools", href: "/schools", icon: <Building2 className="h-5 w-5" />, accent: "teal" },
      { title: "Distributors", href: "/distributors", icon: <Users className="h-5 w-5" />, accent: "rose" },

      { title: "Books", href: "/books", icon: <BookOpen className="h-5 w-5" />, accent: "purple" },
      { title: "Requirements", href: "/requirements", icon: <Receipt className="h-5 w-5" />, accent: "amber" },
      { title: "Publisher Orders", href: "/publisher-orders", icon: <Package className="h-5 w-5" />, accent: "emerald" },
      { title: "School Orders", href: "/school-orders", icon: <Package className="h-5 w-5" />, accent: "sky" },

      // ✅ RENAMED: Supplier Receipts -> Purchases
      { title: "Purchases", href: "/supplier-receipts", icon: <ScrollText className="h-5 w-5" />, accent: "teal" },

      { title: "Supplier Payments", href: "/supplier-payments", icon: <IndianRupee className="h-5 w-5" />, accent: "emerald" },

      { title: "Availability", href: "/school-orders/availability", icon: <ClipboardList className="h-5 w-5" />, accent: "slate" },
      { title: "Bundles", href: "/bundles", icon: <Boxes className="h-5 w-5" />, accent: "fuchsia" },
      { title: "Issue Bundles", href: "/issue-bundles", icon: <PackageCheck className="h-5 w-5" />, accent: "cyan" },
      { title: "Dispatches", href: "/bundle-dispatches", icon: <FileText className="h-5 w-5" />, accent: "indigo" },
      { title: "Stock", href: "/stock", icon: <Layers className="h-5 w-5" />, accent: "emerald" },
    ],
    []
  );

  const [pins, setPins] = useState<string[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PIN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPins(parsed.filter((x) => typeof x === "string"));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PIN_KEY, JSON.stringify(pins));
    } catch {}
  }, [pins]);

  const togglePin = (href: string) => {
    setPins((prev) =>
      prev.includes(href) ? prev.filter((x) => x !== href) : [href, ...prev].slice(0, 12)
    );
  };

  const pinnedCards = useMemo(() => {
    const map = new Map(allCards.map((c) => [c.href, c]));
    return pins.map((href) => map.get(href)).filter(Boolean) as DashCard[];
  }, [pins, allCards]);

  const filteredCards = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = allCards.filter((c) => !pins.includes(c.href));
    if (!s) return base;
    return base.filter(
      (c) => c.title.toLowerCase().includes(s) || c.href.toLowerCase().includes(s)
    );
  }, [q, allCards, pins]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900">
      {/* TOP BAR ONLY */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 bg-white/90 backdrop-blur-md border-b border-slate-200/70 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] sm:text-sm font-extrabold leading-tight">
              Book Distribution Panel
            </div>
            <div className="truncate text-[11px] text-slate-500 font-semibold">
              {user?.name || "User"}
              {user?.role ? ` • ${user.role}` : ""}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="shrink-0 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-600 text-white px-3 py-2 text-xs font-extrabold shadow hover:shadow-md active:scale-[0.99] transition"
        >
          Logout
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <main className="p-3 sm:p-4">
        {/* Search */}
        <div className="mb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/85 backdrop-blur px-3 py-2 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent outline-none text-sm placeholder:text-slate-400"
            />
            {q ? (
              <button
                className="text-[12px] font-bold text-slate-500 hover:text-slate-800"
                onClick={() => setQ("")}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {/* Frequently Used (Pinned) */}
        {pinnedCards.length > 0 && (
          <section className="mb-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-extrabold text-slate-800 flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                Frequently Used
              </div>
              <div className="text-[11px] text-slate-500 font-semibold">
                {pinnedCards.length}/12
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {pinnedCards.map((c) => (
                <Tile
                  key={c.href}
                  card={c}
                  pinned
                  onTogglePin={() => togglePin(c.href)}
                />
              ))}
            </div>
          </section>
        )}

        {/* All Tiles: 4 per row */}
        <section>
          <div className="grid grid-cols-4 gap-2">
            {filteredCards.map((c) => (
              <Tile
                key={c.href}
                card={c}
                pinned={pins.includes(c.href)}
                onTogglePin={() => togglePin(c.href)}
              />
            ))}
          </div>

          {filteredCards.length === 0 && (
            <div className="mt-6 text-center text-sm font-semibold text-slate-500">
              No match.
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default DashboardContent;
