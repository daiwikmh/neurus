import type { NeuronType } from "@/services/neurus";

export const dashboardNav = [
  { label: "Overview", href: "/dashboard", icon: "grid" },
  { label: "Neurons", href: "/dashboard/neurons", icon: "pulse" },
  { label: "Ask", href: "/dashboard/ask", icon: "spark" },
  { label: "Second Brain", href: "/dashboard/brain", icon: "brain" },
  { label: "Sets", href: "/dashboard/sets", icon: "layers" },
  { label: "Connect", href: "/dashboard/connect", icon: "plug" },
] as const;

export const neuronColor: Record<NeuronType, string> = {
  person: "#4f46e5",
  note: "#64748b",
  file: "#0d9488",
  chunk: "#6b7280",
  insight: "#9333ea",
  commitment: "#b45309",
};

export const trustColor: Record<string, string> = {
  owned: "#15803d",
  shared: "#1d4ed8",
  untrusted: "#b91c1c",
};

export const durabilityColor: Record<string, string> = {
  confirmed: "#22c55e",
  pending: "#f59e0b",
  failed: "#ef4444",
};
