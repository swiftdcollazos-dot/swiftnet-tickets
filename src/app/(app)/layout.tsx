import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { RunningTimers } from "@/components/running-timers";
import { PendingBadge } from "@/components/pending-badge";
import { signOut } from "@/app/actions";

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 bg-brand text-white shadow print:hidden">
        {/* On phones the logo and Sign out share the top row so the links always fit. */}
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap px-4 py-2 text-[13px] font-semibold sm:flex-nowrap sm:py-3 sm:text-sm">
          <Link href="/dashboard" className="shrink-0 sm:mr-auto">
            <Image src="/logo.png" alt="Swiftnet I.T." width={1163} height={198} priority className="h-6 w-auto" />
          </Link>
          {/* Sign out with the Settings gear under it, top right. */}
          <div className="ml-auto flex flex-col items-end gap-1 sm:order-3 sm:ml-0">
            <form action={signOut}>
              <button className="opacity-80 hover:opacity-100">Sign out</button>
            </form>
            <Link href="/settings" aria-label="Settings" title="Settings" className="opacity-90 hover:opacity-100">
              <GearIcon />
            </Link>
          </div>
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
