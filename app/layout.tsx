import type { Metadata, Viewport } from "next";
import { Geist_Mono, Hanken_Grotesk, Young_Serif } from "next/font/google";
import "./globals.css";

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BoothCall",
  description: "展示会ブース向け呼出・待ち状況表示アプリ",
};

export const viewport: Viewport = {
  themeColor: "#e8ddc7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${youngSerif.variable} ${hankenGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-body">
        {children}
      </body>
    </html>
  );
}
