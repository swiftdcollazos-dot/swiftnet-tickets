"use client";

/** Opens a PDF data URL in a new tab; browsers block opening data: URLs directly, so it goes through a blob URL. */
function openPdf(dataUrl: string) {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0));
  window.open(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), "_blank");
}

/** Shows a saved receipt: a photo inline, or a PDF as a button that opens it. */
export function ReceiptView({ receipt, large = false }: { receipt: string; large?: boolean }) {
  if (receipt.startsWith("data:application/pdf")) {
    return (
      <button type="button" className="btn-light" onClick={() => openPdf(receipt)}>
        📄 View PDF receipt
      </button>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing for next/image to optimize
    <img src={receipt} alt="Receipt" className={large ? "mx-auto max-h-[70vh] rounded" : "max-h-40 rounded border border-slate-200"} />
  );
}
