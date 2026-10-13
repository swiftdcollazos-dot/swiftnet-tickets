import Link from "next/link";
import { signOut } from "@/app/actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 bg-brand text-white shadow print:hidden">
        <nav className="mx-auto flex max-w-3xl items-center gap-3 whitespace-nowrap px-4 py-3 text-[13px] font-semibold sm:gap-4 sm:text-sm">
          <Link href="/" className="mr-auto text-[15px] max-[360px]:hidden sm:text-base">Swiftnet</Link>
          <Link href="/">Work Tickets</Link>
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
