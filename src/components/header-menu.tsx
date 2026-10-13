"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** ☰ button that opens a small menu; closes when an item or anything outside is tapped. */
export function HeaderMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1 opacity-90 hover:bg-white/10 hover:opacity-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-7 w-7" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div
          // Close after following a link. (Not on the Sign out button: closing first would cancel its form.)
          onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
          className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg bg-white py-1 text-sm text-slate-800 shadow-lg ring-1 ring-black/10">
          {children}
        </div>
      )}
    </div>
  );
}
