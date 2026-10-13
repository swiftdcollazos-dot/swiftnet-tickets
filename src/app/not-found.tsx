import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-sm p-8 text-center">
      <h1 className="h1 mb-2">Not found</h1>
      <p className="mb-4 text-slate-500">That service ticket doesn&apos;t exist.</p>
      <Link href="/" className="btn">Back to service tickets</Link>
    </main>
  );
}
