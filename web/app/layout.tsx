import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stakes by Kaleva",
  description: "What every Liiga goal was worth, for every team.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // translate="no": the widget sits in a Finnish page (lang="fi"). When a browser translates that page it
    // also translated our iframes, turning team names into words ("Lukko" -> "Lock") and "No" into "Well".
    <html
      lang="en"
      translate="no"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
