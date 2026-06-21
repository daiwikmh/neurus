import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { SuiProviders } from "@/components/SuiProviders";
import "@/styles/globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["700", "900"] });

export const metadata: Metadata = {
  title: "Neurus",
  description: "Neurus is a personal AI memory app. Sign in with Google to capture notes, files, and calendar events — then ask questions and get grounded answers from your own private memory stored on Walrus.",
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>
          <SuiProviders>{children}</SuiProviders>
        </AuthProvider>
      </body>
    </html>
  );
}
