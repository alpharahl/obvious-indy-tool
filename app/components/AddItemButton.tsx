"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { searchBuildableTypes, addPlanItem } from "../actions/build-plans";

interface Result {
  id: number;
  name: string;
}

export default function AddItemButton({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Result | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (selected) return;
    if (query.trim().length < 2) { setResults([]); return; }
    startSearch(async () => {
      const res = await searchBuildableTypes(query);
      setResults(res);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSelected(null);
    setQuantity("1");
  }

  function pick(r: Result) {
    setSelected(r);
    setQuery(r.name);
    setResults([]);
  }

  function handleAdd() {
    if (!selected) return;
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    startAdd(async () => {
      await addPlanItem(planId, selected.id, qty);
      close();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs uppercase tracking-widest px-4 py-1.5 rounded border cursor-pointer transition-opacity hover:opacity-70 shrink-0"
        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
      >
        Add Item
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            className="flex flex-col gap-4 w-full max-w-md rounded border p-5"
            style={{ background: "var(--panel)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
                Add Item
              </span>
              <button
                onClick={close}
                className="text-xs transition-opacity hover:opacity-70 cursor-pointer"
                style={{ color: "var(--muted-fg)" }}
              >
                ✕
              </button>
            </div>

            {/* Search */}
            <div ref={containerRef} className="relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Search ships, modules…"
                className="w-full text-xs px-3 py-2 rounded border bg-transparent outline-none"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                onKeyDown={(e) => { if (e.key === "Escape") close(); }}
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--muted-fg)" }}>
                  …
                </span>
              )}
              {results.length > 0 && (
                <div
                  className="absolute z-10 mt-1 w-full rounded border overflow-hidden max-h-52 overflow-y-auto"
                  style={{ background: "var(--panel)", borderColor: "var(--border)" }}
                >
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onMouseDown={() => pick(r)}
                      className="w-full text-left px-3 py-2 text-xs transition-opacity hover:opacity-70 cursor-pointer"
                      style={{ color: "var(--foreground)" }}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quantity + confirm */}
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-24 text-xs px-3 py-2 rounded border bg-transparent outline-none tabular-nums"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              />
              <button
                onClick={handleAdd}
                disabled={!selected || adding}
                className="flex-1 text-xs uppercase tracking-widest py-2 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                {adding ? "Adding…" : "Add to Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
