export interface NavLink {
  label: string;
  href: string;
}

export const site = {
  name: "Neurus",
  tagline: "Owned, verifiable memory for AI agents.",
  contact: "daiwikdomain@gmail.com",
  x: "https://x.com/neurusHQ",
  nav: [
    { label: "Neurus", href: "/" },
    { label: "Docs", href: "/help" },
    { label: "Blogs", href: "/blog" },
  ] as NavLink[],
} as const;
