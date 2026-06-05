import Link from "next/link";
import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { blogs } from "@/content/blogs";

export const metadata: Metadata = {
  title: "Blog — Neurus",
  description: "How we built an owned, verifiable memory layer for AI agents on Walrus.",
};

export default function BlogIndex() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-28 pt-32">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">Blog</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Building the memory layer</h1>
        <p className="mt-4 max-w-xl text-lg text-white/55">
          Notes from inside Neurus — retrieval, architecture, storage, and multi-agent memory on Walrus.
        </p>

        <div className="mt-14 space-y-4">
          {blogs.map((b) => (
            <Link
              key={b.slug}
              href={`/blog/${b.slug}`}
              className="group block rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-white/25 hover:bg-white/[0.05]"
            >
              <div className="flex items-center gap-3 text-[12px] text-white/40">
                <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 font-mono uppercase tracking-wide">{b.tag}</span>
                <span>{b.date}</span>
                <span>·</span>
                <span>{b.readingTime} read</span>
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-white transition group-hover:text-white">
                {b.title}
              </h2>
              <p className="mt-2 leading-relaxed text-white/50">{b.excerpt}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-[#9aa8f0]">
                Read <span className="transition group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
