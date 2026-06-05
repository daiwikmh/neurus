import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import { blogs, getBlog } from "@/content/blogs";

export function generateStaticParams() {
  return blogs.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlog(slug);
  if (!post) return { title: "Blog — Neurus" };
  return { title: `${post.title} — Neurus`, description: post.excerpt };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlog(slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />
      <main className="mx-auto max-w-2xl px-6 pb-28 pt-32">
        <Link href="/blog" className="text-sm text-white/40 transition hover:text-white/70">
          ← Blog
        </Link>
        <div className="mt-6 flex items-center gap-3 text-[12px] text-white/40">
          <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 font-mono uppercase tracking-wide">{post.tag}</span>
          <span>{post.date}</span>
          <span>·</span>
          <span>{post.readingTime} read</span>
        </div>
        <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-[40px] sm:leading-[1.1]">
          {post.title}
        </h1>
        <article className="mt-10">{post.body}</article>

        <div className="mt-16 border-t border-white/10 pt-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            ← More from the blog
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
