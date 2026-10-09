import Link from "next/link";
import { signOut } from "@/app/actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 bg-brand text-white shadow print:hidden">
        <nav className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm font-semibold">
          <Link href="/" className="mr-auto text-base">Swiftnet</Link>
          <Link href="/">Tickets</Link>
          <Link href="/clients">Clients</Link>
          <Link href="/settings">Settings</Link>
          <form action={signOut}>
            <button className="opacity-80 hover:opacity-100">Sign out</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl p-4 pb-16">{children}</main>
    </>
  );
}
