import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { RunningTimers } from "@/components/running-timers";
import { PendingBadge } from "@/components/pending-badge";
import { signOut } from "@/app/actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 bg-brand text-white shadow print:hidden">
        {/* On phones the logo and Sign out share the top row so the links always fit. */}
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap px-4 py-2 text-[13px] font-semibold sm:flex-nowrap sm:py-3 sm:text-sm">
          <Link href="/dashboard" className="shrink-0 sm:mr-auto">
            <Image src="/logo.png" alt="Swiftnet I.T." width={1163} height={198} priority className="h-6 w-auto" />
          </Link>
          <form action={signOut} className="ml-auto sm:order-3 sm:ml-0">
            <button className="opacity-80 hover:opacity-100">Sign out</button>
          </form>
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 sm:order-2 sm:flex-nowrap sm:w-auto sm:justify-end sm:gap-4">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/" className="inline-flex items-center">
              Work Tickets
              <Suspense fallback={null}>
                <PendingBadge />
              </Suspense>
            </Link>
            <Link href="/projects" className="inline-flex items-center">
              Projects
              <Suspense fallback={null}>
                <PendingBadge projects />
              </Suspense>
            </Link>
            <Link href="/clients">Clients</Link>
            <Link href="/settings">Settings</Link>
          </div>
        </nav>
        <Suspense fallback={null}>
          <RunningTimers />
        </Suspense>
      </header>
      <main className="mx-auto max-w-3xl p-4 pb-16">{children}</main>
    </>
  );
}
