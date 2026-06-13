import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { SetProvider } from "./components/SetContext";
import { SettingsProvider } from "./components/SettingsContext";
import { ProductTour } from "./components/ProductTour";

export const metadata: Metadata = {
  title: "Dashboard — Neurus",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SetProvider>
      <SettingsProvider>
        <div className="flex h-screen overflow-hidden bg-[#0b0c0f] text-white">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
          <ProductTour />
        </div>
      </SettingsProvider>
    </SetProvider>
  );
}
