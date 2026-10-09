import type { MetadataRoute } from "next";

// Lets the app be added to a phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Swiftnet Tickets",
    short_name: "Tickets",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#1f5fa8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
