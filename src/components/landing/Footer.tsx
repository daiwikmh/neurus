import { site } from "@/lib/site";

const columns = [
  {
    heading: "Product",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Help", href: "/help" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact", href: `mailto:${site.contact}` },
      { label: "X / Twitter", href: site.x },
    ],
  },
];

export function Footer() {
  return (
    <footer
      className="relative overflow-hidden border-t border-white/10"
      style={{
        background: "linear-gradient(135deg, #070809 0%, #0a1428 50%, #051030 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[120%] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(ellipse at center, rgba(154,168,240,0.25), transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-0">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-0">
          <div className="flex flex-col gap-8 lg:w-[45%] lg:pr-16">
            <p className="text-4xl font-semibold leading-tight text-white md:text-5xl">
              {site.tagline}
            </p>
            <div className="flex gap-3">
              <a
                href={site.x}
                target="_blank"
                rel="noreferrer"
                aria-label="X"
                className="group flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10 hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.257 5.629L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href={`mailto:${site.contact}`}
                aria-label="Email"
                className="group flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10 hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-8 lg:flex-1">
            {columns.map((col) => (
              <div key={col.heading}>
                <h4 className="inline-block rounded border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
                  {col.heading}
                </h4>
                <ul className="mt-5 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="group inline-flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white"
                      >
                        <span className="h-px w-0 bg-[#9aa8f0] transition-all duration-200 group-hover:w-3" />
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 border-t border-white/10" />

        <div className="relative -mx-6 overflow-hidden">
          <p
            className="select-none bg-gradient-to-b from-[#9aa8f0] to-[#9aa8f0]/10 bg-clip-text text-center font-bold leading-none tracking-tight text-transparent"
            style={{ fontSize: "clamp(80px, 18vw, 260px)", fontFamily: "var(--font-playfair)" }}
          >
            Neurus
          </p>
        </div>
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-5">
        <div className="flex items-center justify-between text-xs text-white/30">
          <span>© {new Date().getFullYear()} Neurus. All rights reserved.</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9aa8f0]" />
            Built on Walrus
          </span>
        </div>
      </div>
    </footer>
  );
}
