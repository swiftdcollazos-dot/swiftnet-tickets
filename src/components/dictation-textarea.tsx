"use client";

import { useEffect, useRef, useState } from "react";

// The browser's built-in speech recognition (Chrome, Edge, Safari on iPhone).
// It isn't in TypeScript's DOM types yet, so describe the parts we use.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Español" },
];

/** A textarea with a microphone button that types what you say. */
export function DictationTextarea(props: { id: string; name: string; rows: number; defaultValue: string }) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [lang, setLang] = useState("en-US");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = setTimeout(() => setSupported(getRecognition() !== null), 0);
    return () => {
      clearTimeout(check);
      recRef.current?.stop();
    };
  }, []);

  function append(text: string) {
    const box = textRef.current;
    if (!box || !text.trim()) return;
    const before = box.value;
    const spacer = before && !/\s$/.test(before) ? " " : "";
    const sentence = before.trim() === "" || /[.!?]\s*$/.test(before) ? text.trim().charAt(0).toUpperCase() + text.trim().slice(1) : text.trim();
    box.value = before + spacer + sentence;
  }

  function start() {
    const Rec = getRecognition();
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) append(r[0].transcript);
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow the microphone for this site in your browser settings.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError("Couldn't hear that. Tap the microphone and try again.");
      }
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }

  function stop() {
    recRef.current?.stop();
  }

  return (
    <div>
      <textarea ref={textRef} className="input" id={props.id} name={props.name} rows={props.rows} defaultValue={props.defaultValue} />
      {listening && interim && <p className="mt-1 text-sm italic text-slate-400">{interim}…</p>}
      {supported && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={listening ? stop : start}
            className={listening ? "btn bg-red-600" : "btn-light"}
            aria-pressed={listening}
          >
            {listening ? "■ Stop" : "🎤 Talk"}
          </button>
          {listening ? (
            <span className="text-sm text-red-600">Listening… speak now</span>
          ) : (
            <select className="input w-auto py-1 text-sm" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Dictation language">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
