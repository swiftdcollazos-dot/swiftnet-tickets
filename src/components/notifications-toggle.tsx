"use client";

import { useEffect, useState } from "react";
import { deletePushSubscription, savePushSubscription } from "@/app/actions";

function base64UrlToBytes(base64: string) {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "install" | "off" | "on" | "blocked";

/** Menu item that turns "job assigned to you" notifications on or off for this device. */
export function NotificationsToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhones only allow notifications once the app is added to the Home Screen.
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        setState(ios ? "install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
      await savePushSubscription(JSON.parse(JSON.stringify(sub)));
      setState("on");
    } catch {
      alert("Couldn't turn on notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  const row = "flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-100";
  const bell = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden>
      <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  );

  if (state === "loading" || state === "unsupported") return null;
  if (state === "install" || state === "blocked") {
    return (
      <p className="flex items-start gap-2 px-3 py-2.5 text-xs text-slate-500">
        {bell}
        {state === "install"
          ? "For notifications, add this app to your Home Screen (Share → Add to Home Screen) and open it from there."
          : "Notifications are blocked. Allow them for this site in your phone or browser settings."}
      </p>
    );
  }
  return (
    <button type="button" className={row} disabled={busy} onClick={state === "on" ? turnOff : turnOn}>
      {bell}
      {busy ? "Working…" : state === "on" ? "Turn off notifications" : "Turn on notifications"}
    </button>
  );
}
