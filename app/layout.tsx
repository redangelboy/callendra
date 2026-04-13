import type { Metadata, Viewport } from "next";
import "./[locale]/globals.css";

/** Absolute URLs for metadata (icons, OG, etc.). Set NEXT_PUBLIC_URL on the VPS if the public domain is not callendra.com. */
const metadataBaseUrl =
  process.env.NEXT_PUBLIC_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://callendra.com");

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: "Callendra",
  description: "The booking system for your business",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Callendra",
  },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/favicon.png", type: "image/png", sizes: "32x32" }],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-[100dvh] antialiased">{children}</body>
    </html>
  );
}
