import type { MetadataRoute } from "next";

// Lets the app be added to a phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Swiftnet Work Tracker",
    short_name: "Work Tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#1f5fa8",
    // The orange dots from the Swiftnet I.T. logo.
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
