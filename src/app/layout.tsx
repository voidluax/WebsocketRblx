import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RELAY — realtime rooms over WebSocket",
    template: "RELAY · %s",
  },
  description:
    "A free-tier-friendly chat app that speaks raw WebSocket. Create a room via POST /api/rooms, share the code, and chat over wss://your-app.onrender.com/ws.",
};

export const viewport: Viewport = {
  themeColor: "#06080e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="grain">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
