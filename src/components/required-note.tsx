/** Explains the red star that marks required fields (see `.label` in globals.css). */
export function RequiredNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-slate-500 ${className}`}>
      Fields marked with <span className="font-bold text-red-600">*</span> are mandatory.
    </p>
  );
}
