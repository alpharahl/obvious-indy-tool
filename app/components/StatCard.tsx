interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
}

export default function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div
      className="flex flex-col gap-1 p-4 rounded border"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
    >
      <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-fg)" }}>
        {label}
      </span>
      <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>
        {value}
      </span>
      {sub && (
        <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}
