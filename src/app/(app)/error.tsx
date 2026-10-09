"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card text-center">
      <p className="mb-3 font-semibold">Something went wrong.</p>
      <p className="mb-4 text-sm text-slate-500">Check your connection and that every required field is filled in.</p>
      <button className="btn" onClick={reset}>Try again</button>
    </div>
  );
}
