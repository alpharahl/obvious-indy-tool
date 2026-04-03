"use client";

import { addCharacter } from "../actions/add-character";

export default function AddCharacterButton() {
  return (
    <button
      onClick={() => addCharacter()}
      className="w-fit text-xs uppercase tracking-widest px-4 py-2 rounded border cursor-pointer transition-opacity hover:opacity-70"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
    >
      Add Character
    </button>
  );
}
