"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export interface CiteOptions {
  count: number;
  onCite: (n: number) => void;
  title?: (n: number) => string | undefined;
}

function buildComponents(size: "sm" | "md", cite?: CiteOptions): Components {
  const h1 = size === "md" ? "text-base" : "text-[14px]";
  const h2 = size === "md" ? "text-[15px]" : "text-[13.5px]";
  const h3 = size === "md" ? "text-sm" : "text-[13px]";
  const codeSize = size === "md" ? "text-[12.5px]" : "text-[11.5px]";
  const my = size === "md" ? "my-2" : "my-1.5";
  return {
    a({ href, children }) {
      const m = cite && typeof href === "string" ? href.match(/^#cite-(\d+)$/) : null;
      if (m) {
        const n = Number(m[1]);
        return (
          <button
            onClick={() => cite!.onCite(n)}
            className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[#9aa8f0]/20 px-1 align-text-top text-[10px] font-semibold text-[#aeb9f4] transition hover:bg-[#9aa8f0]/40"
            title={cite!.title?.(n)}
          >
            {n}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" className="text-[#aeb9f4] underline underline-offset-2 transition hover:text-[#c4ccf7]">
          {children}
        </a>
      );
    },
    p: ({ children }) => <p className={`${my} first:mt-0 last:mb-0`}>{children}</p>,
    ul: ({ children }) => <ul className={`${my} list-disc space-y-1 pl-5 marker:text-white/30`}>{children}</ul>,
    ol: ({ children }) => <ol className={`${my} list-decimal space-y-1 pl-5 marker:text-white/30`}>{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    h1: ({ children }) => <h1 className={`mb-2 mt-3 font-semibold text-white first:mt-0 ${h1}`}>{children}</h1>,
    h2: ({ children }) => <h2 className={`mb-2 mt-3 font-semibold text-white first:mt-0 ${h2}`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`mb-1.5 mt-2.5 font-semibold text-white/90 first:mt-0 ${h3}`}>{children}</h3>,
    code: ({ className, children }) => {
      const block = /language-/.test(className ?? "");
      return block ? (
        <code className={className}>{children}</code>
      ) : (
        <code className={`rounded bg-white/10 px-1 py-0.5 font-mono text-[#d7defb] ${codeSize}`}>{children}</code>
      );
    },
    pre: ({ children }) => <pre className={`${my} overflow-x-auto rounded-lg bg-black/40 p-3 font-mono leading-relaxed text-white/80 ${codeSize}`}>{children}</pre>,
    blockquote: ({ children }) => <blockquote className={`${my} border-l-2 border-[#9aa8f0]/40 pl-3 text-white/60`}>{children}</blockquote>,
    hr: () => <hr className="my-3 border-white/10" />,
    table: ({ children }) => (
      <div className={`${my} overflow-x-auto`}>
        <table className="w-full border-collapse text-[13px]">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border border-white/10 bg-white/[0.04] px-2 py-1 text-left font-medium">{children}</th>,
    td: ({ children }) => <td className="border border-white/10 px-2 py-1">{children}</td>,
  };
}

export function Markdown({ text, size = "md", cite, streaming }: { text: string; size?: "sm" | "md"; cite?: CiteOptions; streaming?: boolean }) {
  // When citations are clickable, rewrite [n] into links we intercept; otherwise render [n] as plain text.
  const md = cite ? text.replace(/\[(\d+)\]/g, (full, d: string) => (Number(d) >= 1 && Number(d) <= cite.count ? `[${d}](#cite-${d})` : full)) : text;
  const outer = size === "md" ? "text-[14.5px]" : "text-[13.5px]";
  return (
    <div className={`${outer} leading-relaxed text-white/85`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(size, cite)}>
        {md}
      </ReactMarkdown>
      {streaming && <span className="ml-0.5 inline-block h-[15px] w-[7px] translate-y-[2px] animate-pulse rounded-[2px] bg-[#9aa8f0]" />}
    </div>
  );
}
