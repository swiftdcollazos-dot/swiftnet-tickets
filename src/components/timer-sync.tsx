"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { runningTimersKey } from "@/app/actions";

/**
 * Keeps every open copy of the app in step with the timers: checks every few seconds which timers are running and
 * refreshes the page as soon as someone starts or stops one. Also refreshes when the app comes back to the screen.
 */
export function TimerSync({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const key = await runningTimersKey();
        if (last.current !== null && key !== last.current) router.refresh();
        last.current = key;
      } catch {
        // Offline or signed out: try again next time.
      } finally {
        busy = false;
      }
    };
    const onShow = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    check();
    const id = setInterval(check, seconds * 1000);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [router, seconds]);

  return null;
}
