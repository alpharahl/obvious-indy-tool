"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deleteStockpile, saveStockpile, searchLocations } from "../actions/stockpile";

interface Props {
  existingStockpiles: Array<{
    id: string;
    name: string;
    itemCount: number;
    updatedAt: string; // ISO string
  }>;
}

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function StockpileManager({ existingStockpiles }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<Array<{ name: string; kind: string }>>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [result, setResult] = useState<{ saved: number; unmatched: string[] } | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [saving, startSaveTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced location search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (locationQuery.length < 2) {
      setLocationResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await searchLocations(locationQuery);
      setLocationResults(res);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [locationQuery]);

  function handleSelectLocation(name: string) {
    setSelectedLocation(name);
    setLocationQuery(name);
    setLocationResults([]);
  }

  function handleSave() {
    if (!selectedLocation.trim() || !pasteText.trim()) return;
    startSaveTransition(async () => {
      const res = await saveStockpile(selectedLocation.trim(), pasteText);
      setResult(res);
      setShowForm(false);
      setSelectedLocation("");
      setLocationQuery("");
      setPasteText("");
    });
  }

  function handleDelete(id: string) {
    setDeleting((prev) => new Set([...prev, id]));
    // fire-and-forget; revalidatePath will update the server component
    deleteStockpile(id).finally(() => {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Section header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
            Stockpiles
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>
            Paste in-game inventory to track on-hand materials
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setResult(null);
          }}
          className="text-xs uppercase tracking-widest px-2 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70"
          style={
            showForm
              ? { borderColor: "var(--accent)", color: "var(--accent)" }
              : { borderColor: "var(--border)", color: "var(--muted-fg)" }
          }
        >
          {showForm ? "Cancel" : "+ Add Stockpile"}
        </button>
      </div>

      {/* Save result banner */}
      {result && (
        <div
          className="rounded border px-3 py-2 text-xs"
          style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--panel)" }}
        >
          Saved {result.saved} items
          {result.unmatched.length > 0 && (
            <span style={{ color: "var(--muted-fg)" }}>
              {" "}— {result.unmatched.length} unmatched: {result.unmatched.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div
          className="rounded border flex flex-col gap-3 p-3"
          style={{ background: "var(--panel)", borderColor: "var(--border)" }}
        >
          {/* Location search */}
          <div className="flex flex-col gap-1 relative">
            <label className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
              Location
            </label>
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => {
                setLocationQuery(e.target.value);
                setSelectedLocation("");
              }}
              placeholder="Search station, structure, system, or region…"
              className="rounded border px-2 py-1 text-xs w-full outline-none"
              style={{
                background: "var(--background)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
            {locationResults.length > 0 && (
              <ul
                className="absolute top-full mt-1 left-0 right-0 rounded border z-10 overflow-hidden"
                style={{ background: "var(--panel)", borderColor: "var(--border)" }}
              >
                {locationResults.map((r) => (
                  <li key={r.name + r.kind}>
                    <button
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left cursor-pointer transition-opacity hover:opacity-70"
                      style={{ color: "var(--foreground)" }}
                      onClick={() => handleSelectLocation(r.name)}
                    >
                      <span className="truncate">{r.name}</span>
                      <span
                        className="ml-2 shrink-0 uppercase tracking-widest text-xs"
                        style={{ color: "var(--muted-fg)" }}
                      >
                        {r.kind}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Paste area */}
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
              Items
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              placeholder="Paste items from EVE inventory window (Ctrl+A, Ctrl+C in-game)"
              className="rounded border px-2 py-1.5 text-xs w-full outline-none resize-y font-mono"
              style={{
                background: "var(--background)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !selectedLocation.trim() || !pasteText.trim()}
              className="text-xs uppercase tracking-widest px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              {saving ? "Saving…" : "Save Stockpile"}
            </button>
          </div>
        </div>
      )}

      {/* Existing stockpiles list */}
      {existingStockpiles.length > 0 ? (
        <div
          className="rounded border overflow-hidden"
          style={{ borderColor: "var(--border)" }}
        >
          {existingStockpiles.map((sp, i) => (
            <div
              key={sp.id}
              className="flex items-center gap-3 px-3 py-2 text-xs"
              style={{
                borderTop: i > 0 ? `1px solid var(--border)` : undefined,
                background: "var(--panel)",
              }}
            >
              <span className="flex-1 truncate" style={{ color: "var(--foreground)" }}>
                {sp.name}
              </span>
              <span className="shrink-0 tabular-nums" style={{ color: "var(--muted-fg)" }}>
                {sp.itemCount} items
              </span>
              <span className="shrink-0" style={{ color: "var(--muted-fg)" }}>
                Updated {timeAgo(sp.updatedAt)}
              </span>
              <button
                onClick={() => handleDelete(sp.id)}
                disabled={deleting.has(sp.id)}
                className="shrink-0 text-xs uppercase tracking-widest px-2 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40"
                style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
              >
                {deleting.has(sp.id) ? "…" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <p className="text-xs py-4 text-center" style={{ color: "var(--muted-fg)" }}>
            No stockpiles yet — add one to track on-hand materials
          </p>
        )
      )}
    </div>
  );
}
