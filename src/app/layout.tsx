import type { Metadata } from "next";
import { Source_Sans_3, Fraunces } from "next/font/google";
import "./globals.css";

const source = Source_Sans_3({
  variable: "--font-source",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atrium",
  description:
    "Self-hosted multi-agent studio. Your OpenRouter key. Your models. Your files.",
  openGraph: {
    title: "Atrium",
    description:
      "Self-hosted multi-agent studio. Your OpenRouter key. Your models. Your files.",
    images: [{ url: "/og.png", width: 1280, height: 640 }],
  },
  icons: { icon: "/favicon.svg", apple: "/brand/logo-mark-512.png" },
  twitter: {
    card: "summary_large_image",
    title: "Atrium",
    description:
      "Self-hosted multi-agent studio. Your OpenRouter key. Your models. Your files.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${source.variable} ${display.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
