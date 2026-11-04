"use client";

import { useEffect, useState } from "react";
import { deletePushSubscription, savePushSubscription, testPushNotification } from "@/app/actions";

function base64UrlToBytes(base64: string) {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "install" | "off" | "on" | "blocked";

/** Subscribes this device and saves it for the signed-in user. Asks for permission only if it wasn't given yet. */
async function subscribe(publicKey: string): Promise<boolean> {
  if ((await Notification.requestPermission()) !== "granted") return false;
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
  await savePushSubscription(JSON.parse(JSON.stringify(sub)));
  return true;
}

/** Where this device stands: notifications on, off, blocked, or not possible here. */
async function currentState(): Promise<State> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhones only allow notifications once the app is added to the Home Screen.
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ? "install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Someone turned notifications off on purpose on this device: don't turn them back on by ourselves. */
const OFF_KEY = "notifications-off";
const turnedOff = () => {
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
};
const rememberOff = (off: boolean) => {
  try {
    if (off) localStorage.setItem(OFF_KEY, "1");
    else localStorage.removeItem(OFF_KEY);
  } catch {}
};

/**
 * Notifications are on by default. Phones only let a site ask once someone taps, so this card on the Today screen
 * asks until they are on. Where permission was already given but the device lost its subscription, it quietly
 * subscribes again. Hidden once on, and on a device where someone turned them off from the menu.
 */
export function NotificationsPrompt({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      let now = await currentState();
      if (now === "off" && turnedOff()) return setState("on"); // their choice: say nothing
      if (now === "off" && Notification.permission === "granted") now = (await subscribe(publicKey)) ? "on" : "off";
      setState(now);
    })().catch(() => setState("unsupported"));
  }, [publicKey]);

  if (state !== "off" && state !== "install") return null;
  if (state === "install") {
    return (
      <p className="card border-2 border-sky-300 bg-sky-50 text-sm text-slate-700">
        🔔 To get your morning schedule and job alerts, add this app to your Home Screen (Share → Add to Home Screen) and open it from there.
      </p>
    );
  }
  return (
    <div className="card flex items-center gap-3 border-2 border-sky-300 bg-sky-50">
      <p className="flex-1 text-sm text-slate-700">🔔 Turn on notifications on this phone for your 8 AM schedule, appointment reminders and new jobs.</p>
      <button
        type="button"
        className="btn shrink-0"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setState((await subscribe(publicKey)) ? "on" : "blocked");
          } catch (e) {
            alert(`Couldn't turn on notifications on this device: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : "Turn on"}
      </button>
    </div>
  );
}

/** Menu item that turns notifications on or off for this device. */
export function NotificationsToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentState().then(setState, () => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      rememberOff(false);
      setState((await subscribe(publicKey)) ? "on" : "blocked");
    } catch (e) {
      alert(`Couldn't turn on notifications on this device: ${e instanceof Error ? e.message : String(e)}`);
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
      rememberOff(true);
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
  async function sendTest() {
    setBusy(true);
    try {
      alert(await testPushNotification());
    } catch (e) {
      alert(`Test failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={row} disabled={busy} onClick={state === "on" ? turnOff : turnOn}>
        {bell}
        {busy ? "Working…" : state === "on" ? "Turn off notifications" : "Turn on notifications"}
      </button>
      {state === "on" && (
        <button type="button" className={`${row} pl-10 text-slate-600`} disabled={busy} onClick={sendTest}>
          Send test notification
        </button>
      )}
    </>
  );
}
