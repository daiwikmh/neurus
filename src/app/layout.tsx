import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { SuiProviders } from "@/components/SuiProviders";
import "@/styles/globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Neurus — owned, verifiable memory for AI agents",
  description: "The owned, verifiable memory layer for AI agents, on Walrus. Capture anything, recall it by meaning, and prove it was never tampered with.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>
          <SuiProviders>{children}</SuiProviders>
        </AuthProvider>
      </body>
    </html>
  );
}
