"use client";

import { useRef, useState, useTransition } from "react";
import { deleteStockpile, saveStockpile } from "../actions/stockpile";

interface Stockpile {
  id: string;
  name: string;
  itemCount: number;
  updatedAt: string;
}

interface Props {
  existingStockpiles: Stockpile[];
}

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export default function StockpileManager({ existingStockpiles }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [result, setResult] = useState<{ saved: number; unmatched: string[] } | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [saving, startSave] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  function openForm() {
    setShowForm(true);
    setResult(null);
    setTimeout(() => nameRef.current?.focus(), 30);
  }

  function closeForm() {
    setShowForm(false);
    setName("");
    setPasteText("");
  }

  function handleSave() {
    if (!name.trim() || !pasteText.trim()) return;
    startSave(async () => {
      const res = await saveStockpile(name.trim(), pasteText);
      setResult(res);
      closeForm();
    });
  }

  function handleDelete(id: string) {
    setDeleting((prev) => new Set([...prev, id]));
    deleteStockpile(id).finally(() =>
      setDeleting((prev) => { const next = new Set(prev); next.delete(id); return next; })
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--foreground)" }}>Stockpiles</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-fg)" }}>Paste in-game inventory to track on-hand materials</p>
        </div>
        <button
          onClick={showForm ? closeForm : openForm}
          className="text-xs uppercase tracking-widest px-2 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-70"
          style={showForm
            ? { borderColor: "var(--accent)", color: "var(--accent)" }
            : { borderColor: "var(--border)", color: "var(--muted-fg)" }}
        >
          {showForm ? "Cancel" : "+ Add"}
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
              {" "}— {result.unmatched.length} unmatched: {result.unmatched.slice(0, 5).join(", ")}
              {result.unmatched.length > 5 ? ` +${result.unmatched.length - 5} more` : ""}
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
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>Name</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jita 4-4, Main Hangar…"
              className="rounded border px-2 py-1.5 text-xs w-full outline-none"
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
              onKeyDown={(e) => { if (e.key === "Escape") closeForm(); }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>Items</label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              placeholder={"Paste from EVE inventory (Ctrl+A, Ctrl+C in-game)\n\nSupports:\n  Name\tQuantity  (inventory window)\n  Name x Quantity  (contracts / multibuy)"}
              className="rounded border px-2 py-1.5 text-xs w-full outline-none resize-y font-mono"
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || !pasteText.trim()}
              className="text-xs uppercase tracking-widest px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              {saving ? "Saving…" : "Save Stockpile"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {existingStockpiles.length > 0 ? (
        <div className="rounded border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {existingStockpiles.map((sp, i) => (
            <div
              key={sp.id}
              className="flex items-center gap-3 px-3 py-2 text-xs"
              style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--panel)" }}
            >
              <span className="flex-1 truncate" style={{ color: "var(--foreground)" }}>{sp.name}</span>
              <span className="shrink-0 tabular-nums" style={{ color: "var(--muted-fg)" }}>{sp.itemCount} items</span>
              <span className="shrink-0" style={{ color: "var(--muted-fg)" }}>Updated {timeAgo(sp.updatedAt)}</span>
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
