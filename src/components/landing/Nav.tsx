"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Container } from "./Container";
import { site } from "@/lib/site";

function Logo() {
  return <Image src="/neurus.png" alt="Neurus" width={75} height={75} priority />;
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-white/10 bg-black/70 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <Container className="flex h-[60px] items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            {site.nav.map((l, i) => (
              <Link
                key={l.label}
                href={l.href}
                className={`text-[16px] font-semibold transition-colors hover:text-white ${i === 0 ? "text-white" : "text-white/45"}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href={site.x}
            target="_blank"
            rel="noreferrer"
            aria-label="Neurus on X"
            className="text-[13px] text-white/45 transition-colors hover:text-white"
          >
            X
          </a>
          <a
            href={`mailto:${site.contact}`}
            className="rounded-full border border-white/25 px-4 py-1.5 text-[13px] text-white transition-colors hover:bg-white/10"
          >
            Contact
          </a>
          <Link
            href="/login"
            className="rounded-full bg-[#9aa8f0] px-4 py-1.5 text-[13px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4]"
          >
            Get Started
          </Link>
        </div>
      </Container>
    </header>
  );
}
