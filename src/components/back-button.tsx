"use client";

import { useRouter } from "next/navigation";

/** Round ← button at the bottom left, like a phone's back button. Goes to the dashboard when there's nothing to go back to. */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard"))}
      className="fixed bottom-24 left-4 z-20 flex h-12 w-12 sm:bottom-4 items-center justify-center rounded-full bg-brand text-white shadow-lg active:scale-95 print:hidden"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
