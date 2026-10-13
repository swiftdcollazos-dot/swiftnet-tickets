import type { ReactNode } from "react";

/** A card that starts closed; the bar shows the title and a short summary. */
export function CollapsibleCard({ title, summary, children }: { title: string; summary?: ReactNode; children: ReactNode }) {
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <h2 className="h2 mb-0">{title}</h2>
        <span className="text-sm text-slate-500">
          {summary} <span className="inline-block transition-transform group-open:rotate-180">▼</span>
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
