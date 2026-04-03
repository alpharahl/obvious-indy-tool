"use client";

import { signIn, signOut } from "next-auth/react";

export default function UserMenuClient({ name }: { name: string | null }) {
  if (!name) {
    return (
      <button
        onClick={() => signIn("eve", { callbackUrl: "/" })}
        className="text-xs uppercase tracking-widest px-3 py-1 rounded border cursor-pointer transition-colors"
        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
        {name}
      </span>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="text-xs uppercase tracking-widest px-3 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70"
        style={{ borderColor: "var(--border)", color: "var(--muted-fg)" }}
      >
        Sign out
      </button>
    </div>
  );
}
