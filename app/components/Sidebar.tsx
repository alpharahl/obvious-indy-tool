"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Tracking",
    href: "/tracking",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    label: "Plans",
    href: "/plans",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    label: "Blueprints",
    href: "/blueprints",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  {
    label: "Market",
    href: "/market",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20 12h-2M6 12H4M19.07 19.07l-1.41-1.41M5.34 5.34 3.93 3.93M12 20v2M12 2v2" />
      </svg>
    ),
  },
];

const enabledHrefs = new Set(["/", "/plans", "/blueprints", "/admin"]);

export default function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col w-16 shrink-0 border-r"
      style={{ background: "var(--sidebar)", borderColor: "var(--border)" }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-center h-14 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
          style={{ background: "var(--accent)", color: "#000" }}
        >
          O
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col items-center gap-1 py-4 flex-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const enabled = enabledHrefs.has(item.href);

          if (!enabled) {
            return (
              <span
                key={item.href}
                title={`${item.label} (coming soon)`}
                className="flex items-center justify-center w-10 h-10 rounded cursor-not-allowed opacity-30"
                style={{ color: "var(--muted-fg)" }}
              >
                {item.icon}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className="flex items-center justify-center w-10 h-10 rounded transition-colors"
              style={{
                color: active ? "var(--accent)" : "var(--muted-fg)",
                background: active ? "rgba(0,229,192,0.08)" : "transparent",
              }}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>

      {/* Admin — pinned to bottom, hidden for non-admins */}
      {isAdmin && (
        <div className="flex flex-col items-center pb-4">
          <Link
            href="/admin"
            title="Admin"
            className="flex items-center justify-center w-10 h-10 rounded transition-colors"
            style={{
              color: pathname === "/admin" ? "var(--accent)" : "var(--muted-fg)",
              background: pathname === "/admin" ? "rgba(0,229,192,0.08)" : "transparent",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </Link>
      </div>
      )}
    </aside>
  );
}
