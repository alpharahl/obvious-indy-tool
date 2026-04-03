"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Terminal", href: "/" },
  { label: "Alert", href: "/alerts" },
  { label: "Intel", href: "/intel" },
];

export default function TopBar() {
  const pathname = usePathname();
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toISOString().replace("T", " ").slice(0, 19) + " UTC"
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className="flex items-center justify-between px-4 h-14 border-b shrink-0"
      style={{ background: "var(--sidebar)", borderColor: "var(--border)" }}
    >
      {/* Left: breadcrumb + status */}
      <div className="flex items-center gap-4">
        <Link href="/" className="text-xs uppercase tracking-widest" style={{ color: "var(--accent)" }}>
          Obvious Indy Tool
        </Link>
        <span
          className="ml-4 text-xs px-2 py-0.5 rounded border"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          Status: All systems nominal — Production online
        </span>
      </div>

      {/* Center: tabs (disabled until built) */}
      <nav className="flex items-center gap-1">
        {tabs.map((tab) => (
          <span
            key={tab.href}
            className="px-4 py-1 text-xs uppercase tracking-widest rounded cursor-not-allowed opacity-40"
            style={{ color: "var(--muted-fg)" }}
          >
            {tab.label}
          </span>
        ))}
      </nav>

      {/* Right: datetime */}
      <div className="text-xs tabular-nums" style={{ color: "var(--muted-fg)" }}>
        {time}
      </div>
    </header>
  );
}
