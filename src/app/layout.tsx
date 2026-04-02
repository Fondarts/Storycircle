import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppMenu } from "@/components/AppMenu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Story Circle",
  description: "Outline screenplays with a Story Circle and beat outline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-dvh antialiased`}
    >
      <body dir="ltr" suppressHydrationWarning className="flex min-h-0 h-dvh flex-col">
        <AppMenu />
        {children}
      </body>
    </html>
  );
}
