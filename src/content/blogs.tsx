import type { ReactNode } from "react";

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readingTime: string;
  tag: string;
  body: ReactNode;
}

function P({ children }: { children: ReactNode }) {
  return <p className="mb-5 leading-relaxed text-white/65">{children}</p>;
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-10 text-xl font-semibold tracking-tight text-white">{children}</h2>;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mb-5 overflow-x-auto rounded-xl border border-white/10 bg-[#0c0d10] p-4 font-mono text-[12.5px] leading-[1.7] text-white/80">
      <code>{children}</code>
    </pre>
  );
}

export const blogs: BlogPost[] = [
  {
    slug: "cross-encoder-contextual-retrieval",
    title: "Beyond bi-encoders: cross-encoder reranking and contextual retrieval",
    excerpt:
      "MemWal gives us fast, broad recall — but bi-encoders are weak at precision ordering. Here is how we pair a cross-encoder reranker with Anthropic-style contextual chunking to find the right neuron, first.",
    date: "Jun 5, 2026",
    readingTime: "6 min",
    tag: "Retrieval",
    body: (
      <>
        <P>
          A memory layer is only as good as its retrieval. When an agent asks &ldquo;what do I owe Sarah, and
          when?&rdquo;, it does not need ten loosely-related memories — it needs the one that answers the question, at
          the top. Getting that right is a two-part problem, and a single embedding model solves neither part well.
        </P>
        <H>Bi-encoders recall; cross-encoders rank</H>
        <P>
          MemWal embeds each neuron independently and compares vectors — a <em>bi-encoder</em>. That is exactly right
          for the first stage: it is fast and casts a wide net, so the neuron you want almost always lands somewhere in
          the top-20. But bi-encoders score the query and the document <em>separately</em>, so they are notoriously
          weak at <em>ordering</em> those 20 candidates precisely. That is a documented anti-pattern, and it is why
          naive vector search so often buries the best answer at position 6.
        </P>
        <P>
          A <em>cross-encoder</em> fixes the ordering. It reads the query and a candidate <em>together</em> and emits a
          single relevance score, capturing interactions a dot-product cannot. The cost is that you cannot pre-compute
          it — so you run it only over the small candidate pool, as a second stage. Neurus uses
          <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px]">ms-marco-MiniLM-L-6-v2</code>
          locally via ONNX — no API key, ~3ms per query — and it is the single biggest quality lever in the pipeline.
        </P>
        <Code>{`const hits = await memwal.recall(query, 20);   // stage 1: broad, bi-encoder
const ranked = await rerank(query, hits.map(h => h.text)); // stage 2: precise, cross-encoder
return ranked.slice(0, limit);`}</Code>
        <H>The chunk that lost its context</H>
        <P>
          The second problem is subtler. Split a document into chunks and one of them reads simply &ldquo;The base rate
          is 0.05%.&rdquo; Embedded on its own, that chunk has no idea it is about <em>fees</em> on the
          <em> Zephyr Protocol</em> — so a query for &ldquo;trading fee&rdquo; may never retrieve it. Anthropic&rsquo;s
          contextual retrieval (Sept 2024) showed this is responsible for a large share of retrieval failures, and that
          prepending a short, generated context sentence to each chunk <em>before</em> embedding cut failed retrievals
          by ~35% on its own — and up to ~67% combined with BM25 and reranking.
        </P>
        <P>
          We implement this with one twist for cost: instead of an LLM call per chunk, a single call per document
          returns a context line for every chunk at once. The context is prepended only to the <em>embedded</em> text;
          the original body is preserved for display and grounding.
        </P>
        <Code>{`// one LLM call situates every chunk in the whole document
const contexts = await contextualize(docTitle, chunks);
chunk.meta.embedText = \`\${contexts[i]}\n\n\${chunk.body}\`; // embed the contextual version
// chunk.body stays original for the answer + citation`}</Code>
        <H>The honest part</H>
        <P>
          We built an eval harness to measure this, and found something worth saying plainly: at small scale,
          dense recall plus a cross-encoder already saturates — hybrid BM25 and contextual chunking add little, because
          the gold neuron is always already in the pool. These levers earn their keep at <em>document scale</em>, where
          the first stage genuinely misses. So they ship on by default, the eval makes every future change measurable,
          and we do not claim a number we cannot show.
        </P>
      </>
    ),
  },
  {
    slug: "neurus-architecture",
    title: "The architecture of Neurus: an owned, verifiable memory layer on Walrus",
    excerpt:
      "Every memory is a neuron; links between them are synapses. Here is how the layers fit together — from ingest to retrieval to proactive reflection — and why the whole thing lives on Walrus.",
    date: "Jun 5, 2026",
    readingTime: "7 min",
    tag: "Architecture",
    body: (
      <>
        <P>
          Neurus is the intelligence layer over the Walrus data economy. Its spine is a single abstraction: the
          <strong> neuron</strong> — one stored fact, file chunk, person, commitment, or synthesized insight, indexed in
          MemWal and stored on Walrus. Neurons are joined by typed <strong>synapses</strong> (<code>about</code>,
          <code> derived_from</code>, <code>promised_to</code>, <code>reflects_on</code>), so your memory is literally a
          graph, not a flat table.
        </P>
        <H>One engine, clean layers</H>
        <P>
          Everything funnels through a single <code>Memory</code> engine, with thin layers around it:
        </P>
        <Code>{`ingest/    note · file · dir · walrus   → turn anything into neurons
core/      neuron · memory · sets       → the engine + knowledge sets
retrieval/ rerank · bm25 · rrf · mmr    → two-stage precision recall
reason/    answer · brief               → grounded, cited, conflict-aware
proactive/ reflect · surface           → sleep-time insight + interruption calculus
storage/   walrus · memwal             → owned, encrypted persistence
access/    seal        integrity/ merkle → revocable + tamper-evident`}</Code>
        <P>
          The unit a user works with is a <strong>knowledge set</strong>: a named bundle of neurons with its own
          namespace, manifest, visibility, and integrity tier. Your personal memory is one set; a company&rsquo;s
          documentation indexed from Walrus is another. The same engine serves both — only the trust tag differs.
        </P>
        <H>Reactive and proactive, in one graph</H>
        <P>
          The reactive path is RAG done carefully: recall &rarr; cross-encoder rerank &rarr; an answer that uses only
          retrieved neurons, cites them, and surfaces contradictions instead of guessing. The proactive path is the
          differentiator — a sleep-time reflection process reads recent neurons, synthesizes higher-level
          <em> insight-neurons</em> (&ldquo;three people are blocked on the Q3 deck&rdquo;), scores their importance, and
          an interruption calculus decides what is worth your attention now. The clock is a trivial trigger; the
          intelligence is in the synthesis and the restraint.
        </P>
        <H>Three surfaces, one core</H>
        <P>
          The same engine is exposed as a TypeScript SDK (<code>Neurus.open(set).ask(...)</code>), a CORS-enabled HTTP
          API (<code>/v1/ask</code>, <code>/v1/retrieve</code>, …) so any language plugs in, a CLI, and a memory
          inspector that shows the neuron graph and the exact recall spans behind every answer. Retrieval quality,
          verifiability, and ownership are all properties of the core — not bolt-ons.
        </P>
      </>
    ),
  },
  {
    slug: "walrus-memwal-user-layer",
    title: "Wiring it together: Walrus, MemWal, and your owned memory",
    excerpt:
      "Neuron bodies go through MemWal; files go straight to Walrus; the map is a manifest you can publish and verify. Here is how the three layers connect — and why the index is a cache, not the source of truth.",
    date: "Jun 5, 2026",
    readingTime: "6 min",
    tag: "Storage",
    body: (
      <>
        <P>
          &ldquo;On Walrus&rdquo; is easy to say and easy to get wrong. The honest picture has three layers, each
          trusted differently, and getting that split right is what makes the memory both fast and genuinely owned.
        </P>
        <H>Bodies, files, and the map</H>
        <P>
          A searchable neuron&rsquo;s text goes through <strong>MemWal</strong>: the relayer embeds it, Seal-encrypts it
          under your keys, uploads the ciphertext to Walrus, and returns a blob id. Raw <strong>files</strong> go
          straight to Walrus via a content-addressed PUT. And the <strong>manifest</strong> — the map of every neuron,
          its trust tag, and its synapses — is what ties it together.
        </P>
        <Code>{`async embed(neuron) {
  const text = neuron.meta.embedText ?? neuron.body;
  const blobId = await memwal.remember(text);   // embed + Seal + Walrus
  neuron.meta.memwalBlob = blobId;              // manifest records the pointer
}`}</Code>
        <H>The index is a cache; Walrus is the truth</H>
        <P>
          The key design fact: MemWal&rsquo;s vector index lives in the relayer&rsquo;s database — it is a
          <em> disposable cache</em>. The durable, owned source of truth is the set of Seal-encrypted blobs on Walrus,
          plus the manifest. That is why the manifest can be published to Walrus (optionally sealed, so only a
          key-holder can restore it) and rebuilt anywhere: hand someone a blob id and they reconstruct the whole graph.
        </P>
        <Code>{`const blobId = await neurus.publish({ sealKey });   // map → Walrus, encrypted
const n = await other.restore(blobId, { sealKey }); // rebuilt elsewhere, intact`}</Code>
        <H>Instant writes, durable in the background</H>
        <P>
          A Walrus write waits for durability — around twenty seconds. Blocking the user on that is unacceptable, so
          writes are <strong>write-behind</strong>: the neuron lands in the manifest and a local index instantly
          (recall can find it immediately via a keyword fallback), and a background worker confirms Walrus durability a
          few seconds later. The 20-second wait disappears without giving up the guarantee.
        </P>
        <H>Owned means revocable and verifiable</H>
        <P>
          Because storage is content-addressed on Walrus and access is governed by Seal, the user — not a company —
          holds the keys. An agent only ever sees what you grant it, revocably. And for the sets where being wrong is
          expensive, a Merkle root over the manifest is anchored on Sui: an agent acting on a verified set refuses to
          run on memory that has been altered. That is the difference between &ldquo;trust me&rdquo; and
          &ldquo;here is proof.&rdquo;
        </P>
      </>
    ),
  },
  {
    slug: "crdt-shared-memory",
    title: "Conflict-free shared memory: implementing CRDTs for multi-agent sets",
    excerpt:
      "When two agents write the same knowledge set at once, last-write-wins clobbers. Here is how we built an OR-Set op-log with Lamport clocks and capability signatures so they converge — and unauthorized edits are simply ignored.",
    date: "Jun 5, 2026",
    readingTime: "7 min",
    tag: "Multi-agent",
    body: (
      <>
        <P>
          Shared memory is becoming table-stakes for multi-agent systems. But the moment two agents write the same set
          concurrently, a naive manifest does last-write-wins: one agent&rsquo;s edits silently clobber the other&rsquo;s.
          The fix is a <strong>CRDT</strong> — a structure where concurrent edits merge deterministically, with no central
          coordinator.
        </P>
        <H>An op-log of signed, causal operations</H>
        <P>
          Instead of storing a manifest snapshot, a shared set is an append-only log of operations. Each op is an
          add, remove, or update of a neuron, stamped with a Lamport clock (for causal ordering without a server) and
          signed with the actor&rsquo;s capability.
        </P>
        <Code>{`type Op = {
  type: "add" | "remove" | "update";
  neuronId: string; tag: string; neuron?: Neuron;
  lamport: number; actor: string; sig: string;
};`}</Code>
        <H>OR-Set semantics: add-wins, observed-remove</H>
        <P>
          The merge follows Observed-Remove Set rules. Each add gets a unique tag; a remove tombstones only the tags it
          has actually observed. So a concurrent add and remove resolve deterministically, and two agents adding
          different neurons simply both win. The algebra guarantees convergence regardless of order or network delay —
          there are no &ldquo;conflicts&rdquo; in a CRDT, only concurrent updates with a defined merge.
        </P>
        <H>Capabilities: unauthorized edits are ignored, by math</H>
        <P>
          Access control is not a server check that can be bypassed — it is part of the merge. Every op is signed; on
          merge, an op from an actor without a write capability fails signature verification and is dropped. We tested
          it: two authorized agents writing concurrently converge to an identical state with the same Merkle root,
          while a third actor with no capability has its injected op deterministically rejected.
        </P>
        <Code>{`// Alice and Bob both write — then exchange logs
alice.receive(bob.log());  bob.receive(alice.log());
alice.state() === bob.state();   // converged, no clobber
alice.root()  === bob.root();    // same Merkle root → verifiable
// Mallory (no capability) → her op is dropped on merge`}</Code>
        <H>Verifiable, shared, owned</H>
        <P>
          Because the merged state is hashed into the same Merkle root we use for integrity, a shared set is at once
          concurrently-writable, access-controlled, and tamper-evident — three properties in one primitive, grounded in
          the 2025–26 frontier work on CRDTs for agent memory. The op-log is content-addressable, so Walrus is the
          natural store: agents pull, merge, and converge, with no coordinator in the middle.
        </P>
      </>
    ),
  },
];

export function getBlog(slug: string): BlogPost | undefined {
  return blogs.find((b) => b.slug === slug);
}
