"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--background)" }}
    >
      <div
        className="flex flex-col items-center gap-6 p-10 rounded border"
        style={{ background: "var(--panel)", borderColor: "var(--border)" }}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs uppercase tracking-widest" style={{ color: "var(--accent)" }}>
            Obvious Indy Tool
          </span>
          <p className="text-xs" style={{ color: "var(--muted-fg)" }}>
            Sign in with your EVE Online character to continue
          </p>
        </div>

        <button
          onClick={() => signIn("eve", { callbackUrl: "/" })}
          className="px-6 py-3 rounded text-xs uppercase tracking-widest font-bold cursor-pointer transition-opacity hover:opacity-80"
          style={{ background: "var(--accent)", color: "#000" }}
        >
          Sign in with EVE Online
        </button>

        <p className="text-xs text-center max-w-xs" style={{ color: "var(--muted-fg)" }}>
          You will be redirected to the EVE Online SSO. Multiple characters can be linked after login.
        </p>
      </div>
    </div>
  );
}
