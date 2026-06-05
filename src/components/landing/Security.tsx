import { Reveal } from "./primitives";
import { Container } from "./Container";

function InfraVisual() {
  return (
    <div className="relative flex h-full items-end justify-center gap-[3px] overflow-hidden bg-gradient-to-br from-[#34d399] via-[#10b981] to-[#047857] p-6">
      {Array.from({ length: 40 }).map((_, i) => (
        <span key={i} className="w-1 rounded-full bg-white/40" style={{ height: `${25 + ((i * 53) % 70)}%` }} />
      ))}
      <span className="absolute left-1/2 top-8 -translate-x-1/2 rounded-md bg-black/30 px-2 py-0.5 text-[11px] font-medium text-white">
        $1,000
      </span>
      <span className="absolute bottom-10 right-12 rounded-md bg-black/30 px-2 py-0.5 text-[11px] font-medium text-white">
        $1,000
      </span>
    </div>
  );
}

function Soc2Visual() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#34d399] via-[#10b981] to-[#047857] font-mono">
      <div className="pointer-events-none absolute inset-0 select-none break-all p-2 text-[10px] leading-3 text-white/15">
        {"!H=>0%!*~@#10$^>0!*-@$#!H=>0%!*~@#0$^>0!*-@$#!H=>0%!*~@".repeat(20)}
      </div>
      <div className="relative text-center">
        <div className="mb-1 text-amber-300">★★★★★</div>
        <div className="text-5xl font-extrabold tracking-tight text-white">SEAL</div>
        <div className="mt-1 text-sm tracking-[0.3em] text-white/80">ENCRYPTED</div>
      </div>
    </div>
  );
}

const rows = [
  {
    visual: <InfraVisual />,
    title: "Your memory is yours.\nOwned by design.",
    body: "Every neuron is stored on Walrus, encrypted with Seal under your own keys. No company holds your plaintext — you own the data, and an agent only ever sees what you grant it, revocably.",
  },
  {
    visual: <Soc2Visual />,
    title: "Verifiable, tamper-evident memory.",
    body: "Content-addressed on Walrus and anchored by a Merkle root on Sui — agents acting on a verified set refuse to run on memory that has been altered, and anyone can prove what was stored, and when.",
  },
];

export function Security() {
  return (
    <Container className="py-24">
      <h2 className="mb-14 text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Owned. Encrypted. Verifiable.
      </h2>
      <div className="space-y-10">
        {rows.map((r) => (
          <Reveal key={r.title}>
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div className="aspect-[2/1] overflow-hidden rounded-2xl border border-white/10">{r.visual}</div>
              <div>
                <h3 className="whitespace-pre-line text-2xl font-semibold tracking-tight text-white">{r.title}</h3>
                <p className="mt-3 leading-relaxed text-white/45">{r.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}
