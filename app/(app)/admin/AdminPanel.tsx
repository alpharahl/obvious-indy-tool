"use client";

import { useState, useRef } from "react";

type LogEntry =
  | { kind: "step"; message: string }
  | { kind: "progress"; table: string; count: number }
  | { kind: "done" }
  | { kind: "error"; message: string };

const TABLES = [
  "SdeCategory",
  "SdeGroup",
  "SdeType",
  "SdeRegion",
  "SdeSolarSystem",
  "SdeStation",
  "Blueprint",
  "BlueprintActivity",
  "BlueprintMaterial",
  "BlueprintProduct",
  "BlueprintSkill",
];

export default function AdminPanel({ canImport }: { canImport: boolean }) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const append = (entry: LogEntry) => {
    setLog((prev) => [...prev, entry]);
    setTimeout(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  };

  const startImport = async () => {
    setLog([]);
    setCounts({});
    setDone(false);
    setRunning(true);

    try {
      const res = await fetch("/api/admin/sde-import", { method: "POST" });
      if (!res.ok || !res.body) {
        append({ kind: "error", message: `HTTP ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += dec.decode(value, { stream: true });

        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const data = line.replace(/^data: /, "");
          if (!data.trim()) continue;
          try {
            const event = JSON.parse(data);
            if (event.type === "step") {
              append({ kind: "step", message: event.message });
            } else if (event.type === "progress") {
              append({ kind: "progress", table: event.table, count: event.count });
              setCounts((prev) => ({ ...prev, [event.table]: event.count }));
            } else if (event.type === "done") {
              append({ kind: "done" });
              setDone(true);
            } else if (event.type === "error") {
              append({ kind: "error", message: event.message });
            }
          } catch {
            // malformed SSE line, skip
          }
        }
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1
            className="text-base uppercase tracking-widest"
            style={{ color: "var(--accent)" }}
          >
            Admin
          </h1>
        </div>

        {/* SDE Import card */}
        <div
          className="rounded border p-6 flex flex-col gap-4"
          style={{ background: "var(--panel)", borderColor: "var(--border)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                className="text-xs uppercase tracking-widest"
                style={{ color: "var(--foreground)" }}
              >
                SDE Import
              </h2>
              <p className="text-xs mt-1" style={{ color: "var(--muted-fg)" }}>
                Downloads the EVE Static Data Export and populates all game
                reference tables. This will take several minutes. Existing rows
                are skipped (safe to re-run).
              </p>
              {!canImport && (
                <p className="text-xs mt-1" style={{ color: "#f87171" }}>
                  Only the character Alethoria can run imports.
                </p>
              )}
            </div>
            <button
              onClick={startImport}
              disabled={!canImport || running}
              className="shrink-0 px-5 py-2 rounded text-xs uppercase tracking-widest font-bold transition-opacity disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              {running ? "Importing…" : "Run Import"}
            </button>
          </div>

          {/* Progress table */}
          {TABLES.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th
                    className="text-left py-1 font-normal"
                    style={{ color: "var(--muted-fg)" }}
                  >
                    Table
                  </th>
                  <th
                    className="text-right py-1 font-normal"
                    style={{ color: "var(--muted-fg)" }}
                  >
                    Rows imported
                  </th>
                </tr>
              </thead>
              <tbody>
                {TABLES.map((table) => (
                  <tr key={table} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="py-1.5" style={{ color: "var(--foreground)" }}>
                      {table}
                    </td>
                    <td
                      className="py-1.5 text-right tabular-nums"
                      style={{
                        color: counts[table] != null ? "var(--accent)" : "var(--muted-fg)",
                      }}
                    >
                      {counts[table] != null
                        ? counts[table].toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Log output */}
          {log.length > 0 && (
            <div
              ref={logRef}
              className="rounded border p-3 h-48 overflow-y-auto flex flex-col gap-0.5"
              style={{ background: "var(--background)", borderColor: "var(--border)" }}
            >
              {log.map((entry, i) => {
                if (entry.kind === "step")
                  return (
                    <p key={i} className="text-xs" style={{ color: "var(--muted-fg)" }}>
                      › {entry.message}
                    </p>
                  );
                if (entry.kind === "progress")
                  return (
                    <p key={i} className="text-xs" style={{ color: "var(--accent)" }}>
                      ✓ {entry.table}: {entry.count.toLocaleString()} rows
                    </p>
                  );
                if (entry.kind === "done")
                  return (
                    <p key={i} className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                      ✓ Import complete
                    </p>
                  );
                if (entry.kind === "error")
                  return (
                    <p key={i} className="text-xs" style={{ color: "#f87171" }}>
                      ✗ {entry.message}
                    </p>
                  );
              })}
            </div>
          )}

          {done && (
            <p className="text-xs" style={{ color: "var(--muted-fg)" }}>
              SDE data is up to date. You can safely re-run to refresh.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
