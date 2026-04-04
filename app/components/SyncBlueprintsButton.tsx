"use client";

import { useTransition } from "react";
import { syncBlueprints } from "../actions/sync-blueprints";

export default function SyncBlueprintsButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => syncBlueprints())}
      className="w-fit text-xs uppercase tracking-widest px-4 py-2 rounded border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
    >
      {pending ? "Syncing…" : "Sync Blueprints"}
    </button>
  );
}
