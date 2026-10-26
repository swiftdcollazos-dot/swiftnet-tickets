import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { RunningTimers } from "@/components/running-timers";
import { PendingBadge } from "@/components/pending-badge";
import { HeaderMenu } from "@/components/header-menu";
import { requireUser } from "@/lib/supabase/server";
import { isOwner, permissions } from "@/lib/owner";
import { NotificationsToggle } from "@/components/notifications-toggle";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";
import { signOut } from "@/app/actions";
import { BackButton } from "@/components/back-button";
import { BottomNav } from "@/components/bottom-nav";
import { TimerSync } from "@/components/timer-sync";
import { pendingCounts } from "@/lib/pending";

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

/** Reports menu item, for the owner and users allowed to see reports. */
async function ReportsLink() {
  const { user } = await requireUser();
  if (!permissions(user).reports) return null;
  return (
    <Link href="/reports" className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-100">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M3 3v18h18M8 17v-5M12 17V8M16 17v-8M20 17V5" />
      </svg>
      Reports
    </Link>
  );
}

/** Office menu item (money owed, expenses), for the owner only. */
async function OfficeLink() {
  const { user } = await requireUser();
  if (!isOwner(user.email)) return null;
  return (
    <Link href="/office" className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-100">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        <path d="M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
      </svg>
      Office
    </Link>
  );
}

/** Settings menu item, hidden from users who can't change settings or users. */
async function SettingsLink() {
  const { user } = await requireUser();
  if (!permissions(user).settings) return null;
  return (
    <Link href="/settings" className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-100">
      <GearIcon /> Settings
    </Link>
  );
}

/** Bottom menu for phones, with the open-job counts and what this user may create. */
async function MobileMenu() {
  const { supabase, user } = await requireUser();
  const counts = await pendingCounts(supabase);
  return <BottomNav counts={counts} canCreateJobs={permissions(user).createJobs} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 bg-brand text-white shadow print:hidden">
        {/* On phones the logo and the menu share the top row so the links always fit. */}
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap px-4 py-2 text-[13px] font-semibold sm:flex-nowrap sm:py-3 sm:text-sm">
          <Link href="/dashboard" className="shrink-0 sm:mr-auto">
            <Image src="/logo.png" alt="Swiftnet I.T." width={1163} height={198} priority className="h-6 w-auto" />
          </Link>
          {/* ☰ menu with Settings and Sign out, top right. */}
          <div className="ml-auto sm:order-3 sm:ml-0">
            <HeaderMenu>
              <Suspense fallback={null}>
                <ReportsLink />
              </Suspense>
              <Suspense fallback={null}>
                <OfficeLink />
              </Suspense>
              <Link href="/expenses" className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                  <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h3" />
                </svg>
                Expenses
              </Link>
              <Suspense fallback={null}>
                <SettingsLink />
              </Suspense>
              <NotificationsToggle publicKey={VAPID_PUBLIC_KEY} />
              <form action={signOut} className="border-t border-slate-100">
                <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-100">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                    <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                  </svg>{" "}
                  Sign out
                </button>
              </form>
            </HeaderMenu>
          </div>
          {/* On phones these links move to the bottom menu. */}
          <div className="hidden items-center sm:order-2 sm:flex sm:w-auto sm:justify-end sm:gap-4">
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
      <main className="mx-auto max-w-3xl p-4 pb-32 sm:pb-20">{children}</main>
      <BackButton />
      <TimerSync />
      <Suspense fallback={null}>
        <MobileMenu />
      </Suspense>
    </>
  );
}
