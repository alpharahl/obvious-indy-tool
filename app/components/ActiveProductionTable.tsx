const jobs = [
  { name: "Muninn Blueprint", status: 0.78, timeLeft: "04:12:33", qty: 1 },
  { name: "Eos Hull x10", status: 0.45, timeLeft: "08:51:07", qty: 10 },
  { name: "Reinforced Carbot", status: 0.91, timeLeft: "01:09:22", qty: 48 },
];

export default function ActiveProductionTable() {
  return (
    <div
      className="rounded border overflow-hidden"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
          Active Production
        </span>
        <span className="text-xs" style={{ color: "var(--accent)" }}>
          {jobs.length} jobs
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: `1px solid var(--border)` }}>
            <th className="text-left px-4 py-2 font-normal" style={{ color: "var(--muted-fg)" }}>
              Item
            </th>
            <th className="text-left px-4 py-2 font-normal" style={{ color: "var(--muted-fg)" }}>
              Progress
            </th>
            <th className="text-left px-4 py-2 font-normal" style={{ color: "var(--muted-fg)" }}>
              Time Remaining
            </th>
            <th className="text-right px-4 py-2 font-normal" style={{ color: "var(--muted-fg)" }}>
              Qty
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => (
            <tr
              key={i}
              style={{ borderBottom: i < jobs.length - 1 ? `1px solid var(--border)` : "none" }}
            >
              <td className="px-4 py-3" style={{ color: "var(--foreground)" }}>
                {job.name}
              </td>
              <td className="px-4 py-3 w-40">
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--border)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${job.status * 100}%`,
                        background: "var(--accent)",
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <span style={{ color: "var(--muted-fg)" }}>
                    {Math.round(job.status * 100)}%
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 tabular-nums" style={{ color: "var(--muted-fg)" }}>
                {job.timeLeft}
              </td>
              <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--foreground)" }}>
                {job.qty}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
