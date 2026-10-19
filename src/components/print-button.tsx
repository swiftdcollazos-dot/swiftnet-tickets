"use client";

import { useEffect } from "react";

/** Prints the page; `fileName` becomes the page title, which browsers use as the saved PDF's name. */
export function PrintButton({ fileName }: { fileName: string }) {
  useEffect(() => {
    const previous = document.title;
    document.title = fileName;
    return () => {
      document.title = previous;
    };
  }, [fileName]);

  return (
    <button
      className="btn"
      onClick={() => {
        document.title = fileName;
        window.print();
      }}
    >
      Print / Save as PDF
    </button>
  );
}
