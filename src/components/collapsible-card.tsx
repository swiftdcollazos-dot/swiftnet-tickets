import type { ReactNode } from "react";

/**
 * A card that starts closed; the bar shows the title and a short summary.
 * `action` (e.g. a button) sits on the bar too, but outside <summary> so tapping it doesn't open the card.
 */
export function CollapsibleCard({
  title,
  summary,
  action,
  children,
}: {
  title: string;
  summary?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card relative">
      <details className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <h2 className="h2 mb-0">{title}</h2>
          <span className="text-sm text-slate-500">
            {summary} <span className="inline-block transition-transform group-open:rotate-180">▼</span>
          </span>
        </summary>
        <div className="mt-3">{children}</div>
      </details>
      {action && <div className="absolute right-10 top-4 flex h-10 items-center">{action}</div>}
    </div>
  );
}
