import React, { useEffect, useMemo, useRef, useState } from "react";

type Opt = { label: string; value: string };

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search...",
  disabled,
  buttonClassName = "",
  menuClassName = "",
  noResultsText = "No results",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
  placeholder?: string;
  disabled?: boolean;
  buttonClassName?: string;
  menuClassName?: string;
  noResultsText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s));
  }, [q, options]);

  const selectedLabel = useMemo(() => {
    const hit = options.find((o) => o.value === value);
    return hit?.label ?? (value || "");
  }, [options, value]);

  const close = () => {
    setOpen(false);
    setQ("");
    setActive(0);
  };

  const openMenu = () => {
    setOpen(true);
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reset active when filtering changes
  useEffect(() => {
    if (!open) return;
    setActive(0);
  }, [q, open]);

  // auto-scroll active item into view
  useEffect(() => {
    if (!open) return;
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    if (!el) return;

    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (elTop < viewTop) container.scrollTop = elTop;
    else if (elBottom > viewBottom) container.scrollTop = elBottom - container.clientHeight;
  }, [active, open]);

  const pick = (opt: Opt) => {
    onChange(opt.value);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    // If menu closed and user presses ArrowDown/Enter, open it
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div ref={ref} className="relative w-full" onKeyDown={onKeyDown}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        className={`w-full h-[36px] border border-slate-300 rounded-md px-2 py-1.5 bg-white text-left outline-none
          focus:ring-2 focus:ring-indigo-500 focus:border-transparent
          ${disabled ? "bg-slate-100 text-slate-500" : ""}
          ${buttonClassName}`}
      >
        <span className={selectedLabel ? "text-slate-900" : "text-slate-400"}>
          {selectedLabel || "Select..."}
        </span>
      </button>

      {open && !disabled && (
        <div
          className={`absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg ${menuClassName}`}
        >
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              placeholder={placeholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full px-2 py-1.5 border border-slate-300 rounded-md outline-none
                focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div ref={listRef} className="max-h-56 overflow-auto">
            {filtered.length ? (
              filtered.map((o, idx) => (
                <button
                  key={`${o.value}__${idx}`}
                  type="button"
                  data-idx={idx}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => pick(o)}
                  className={`w-full text-left px-3 py-2 text-sm cursor-pointer
                    ${idx === active ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                >
                  {o.label}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-slate-400">{noResultsText}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
