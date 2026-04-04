"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { searchBuildableTypes, addPlanItem } from "../actions/build-plans";

interface Result {
  id: number;
  name: string;
}

export default function PlanItemSearch({ planId }: { planId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Result | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [open, setOpen] = useState(false);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Search as user types
  useEffect(() => {
    if (selected) return; // don't re-search once something is picked
    if (query.trim().length < 2) { setResults([]); setOpen(false); return; }
    startSearch(async () => {
      const res = await searchBuildableTypes(query);
      setResults(res);
      setOpen(res.length > 0);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(r: Result) {
    setSelected(r);
    setQuery(r.name);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setQuantity("1");
  }

  function handleAdd() {
    if (!selected) return;
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    startAdd(async () => {
      await addPlanItem(planId, selected.id, qty);
      clear();
    });
  }

  return (
    <div className="flex gap-2 items-start">
      {/* Type search */}
      <div ref={containerRef} className="relative flex-1">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          placeholder="Search for a ship or module…"
          className="w-full text-xs px-3 py-1.5 rounded border bg-transparent outline-none"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        />
        {searching && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--muted-fg)" }}>
            …
          </span>
        )}
        {open && (
          <div
            className="absolute z-10 mt-1 w-full rounded border overflow-hidden"
            style={{ background: "var(--panel)", borderColor: "var(--border)" }}
          >
            {results.map((r) => (
              <button
                key={r.id}
                onMouseDown={() => pick(r)}
                className="w-full text-left px-3 py-1.5 text-xs transition-opacity hover:opacity-70 cursor-pointer"
                style={{ color: "var(--foreground)" }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quantity */}
      <input
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="w-20 text-xs px-3 py-1.5 rounded border bg-transparent outline-none tabular-nums"
        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
      />

      {/* Add button */}
      <button
        onClick={handleAdd}
        disabled={!selected || adding}
        className="text-xs uppercase tracking-widest px-3 py-1.5 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
      >
        {adding ? "Adding…" : "Add"}
      </button>
    </div>
  );
}
