"use client";

/** A form button that asks before running its action. */
export function ConfirmButton({ action, question, className, children }: { action: () => Promise<void>; question: string; className: string; children: React.ReactNode }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(question)) e.preventDefault();
      }}
    >
      <button className={className}>{children}</button>
    </form>
  );
}
