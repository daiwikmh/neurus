function PillIcon({ children, tint }: { children: React.ReactNode; tint: string }) {
  return (
    <span className="grid h-5 w-5 place-items-center" style={{ color: tint }} aria-hidden>
      {children}
    </span>
  );
}

const pills = [
  {
    label: "Coding",
    tint: "#22d3ee",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="m8 9-3 3 3 3M16 9l3 3-3 3M13 5l-2 14" />
      </svg>
    ),
  },
  {
    label: "Companion",
    tint: "#f59e0b",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
      </svg>
    ),
  },
  {
    label: "Customer Support",
    tint: "#10b981",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
      </svg>
    ),
  },
  {
    label: "Trading",
    tint: "#8b5cf6",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M3 3v18h18M7 14l3-4 3 3 4-6" />
      </svg>
    ),
  },
];

function Pill({ p }: { p: (typeof pills)[number] }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 align-middle shadow-sm">
      <PillIcon tint={p.tint}>{p.icon}</PillIcon>
      <span className="text-[#101010]">{p.label}</span>
    </span>
  );
}

export function DeployAgents() {
  return (
    <section className="relative overflow-hidden">
      {/* full-bleed walrus background */}
      <div
        className="relative flex min-h-[70vh] items-center justify-center overflow-hidden bg-cover px-6 py-24"
        style={{ backgroundImage: "url(/walrus.jpeg)", backgroundPosition: "center 22%" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-black/55" />
        <h2 className="relative max-w-4xl text-center text-3xl font-semibold leading-[1.5] tracking-tight text-white sm:text-[40px] sm:leading-[1.45]">
          Give your <Pill p={pills[0]} /> <Pill p={pills[1]} /> <Pill p={pills[2]} /> and <Pill p={pills[3]} /> agents Neurus — a memory they own, and can act on.
        </h2>
      </div>
    </section>
  );
}
