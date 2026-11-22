import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Sora } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const sora = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-sora" });

export const metadata: Metadata = {
  title: { default: "KeyStone Portal", template: "%s · KeyStone Portal" },
  description: "Employee portal for Key Stone Investment LLC.",
  robots: { index: false, follow: false },
  icons: { icon: "/assets/logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} ${sora.variable} font-sans`}>{children}</body>
    </html>
  );
}
