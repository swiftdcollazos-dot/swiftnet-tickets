"use client";

import { useRef, useState, useTransition } from "react";
import { saveSignature } from "@/app/actions";

/** Lets the client sign on the phone screen with a finger. */
export function SignaturePad({ ticketId, defaultName }: { ticketId: string; defaultName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState(defaultName);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current!.getContext("2d")!;
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function save() {
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    setError(null);
    startTransition(async () => {
      try {
        await saveSignature(ticketId, name, dataUrl);
      } catch {
        setError("Could not save the signature. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drawing.current = false)}
        onPointerLeave={() => (drawing.current = false)}
      />
      <div>
        <label className="label" htmlFor="signed_name">Name of person signing</label>
        <input className="input" id="signed_name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-light" onClick={clear}>Clear</button>
        <button type="button" className="btn flex-1" disabled={!hasInk || pending} onClick={save}>
          {pending ? "Saving…" : "Save signature"}
        </button>
      </div>
    </div>
  );
}
