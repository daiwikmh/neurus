"use client";

import { Container } from "./Container";

const services = [
  "Owned Memory",
  "Semantic Recall",
  "Verifiable Integrity",
  "Seal-Gated Sharing",
  "MCP · A2A Interop",
];

export function TrustedBy() {
  const loop = [...services, ...services];

  return (
    <Container className="py-28">
      <h2 className="text-center text-3xl font-bold leading-snug tracking-tight text-white sm:text-[40px]">
        The memory layer for the
        <br />
        teams building serious agents
      </h2>

      <div className="mt-14">
        <p className="mb-6 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-white/35">
          Services
        </p>
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div className="flex w-max animate-marquee whitespace-nowrap">
            {loop.map((s, i) => (
              <span key={i} className="flex items-center text-lg font-semibold text-white/35">
                {s}
                <span className="mx-10 text-white/15">◆</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Container>
  );
}
