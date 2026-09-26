import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// CJK font: no subset preload, so the kanji accents (済 否 保留 関所…) load via unicode-range on demand
const zenKaku = Zen_Kaku_Gothic_New({
  variable: "--font-zen-kaku",
  weight: ["400", "500", "700", "900"],
  preload: false,
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Trinity Guardian",
  description: "Three layers before an AI agent pays: an ENS gate, an Intercepta checkpoint, and a World ID human approver.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${zenKaku.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
