import { readFile, writeFile } from "node:fs/promises";
import { createNeuron, type Neuron, type NeuronType, type Trust } from "./neuron";
import { MemwalStore } from "../storage/memwal";
import { putBlobInfo, getBlobText, type BlobInfo } from "../storage/walrus";
import { seal, unseal, isSealed } from "../access/seal";
import { rerank } from "../retrieval/rerank";
import { mmrSelect } from "../retrieval/mmr";
import { BM25 } from "../retrieval/bm25";
import { rrf } from "../retrieval/rrf";
import { standsOut } from "../retrieval/margin";
import { merkleRoot } from "../integrity/merkle";

const SEARCHABLE: Set<NeuronType> = new Set(["note", "chunk", "insight"]);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export interface RankedNeuron {
  neuron: Neuron;
  score: number;
  relevance: number;
}

export interface RecallOptions {
  limit?: number;
  overFetch?: number;
  type?: NeuronType;
  trust?: Trust;
  minRelevance?: number;
  mmr?: number;
  hybrid?: boolean;
  abstain?: number;
  datasetId?: string;
}

export class Memory {
  private neurons = new Map<string, Neuron>();
  private byMemwalBlob = new Map<string, string>();
  private loaded = false;
  private queue: Neuron[] = [];
  private draining = false;

  constructor(
    private namespace: string,
    private manifestPath = ".neurus-manifest.json",
    private memwal = new MemwalStore(namespace),
  ) {}

  private async load() {
    if (this.loaded) return;
    try {
      const arr: Neuron[] = JSON.parse(await readFile(this.manifestPath, "utf8"));
      for (const n of arr) {
        this.neurons.set(n.id, n);
        const mb = n.meta?.memwalBlob as string | undefined;
        if (mb) this.byMemwalBlob.set(mb, n.id);
      }
    } catch {
      console.error("No existing memory manifest found, starting fresh.");
    }
    this.loaded = true;
  }

  private async save() {
    await writeFile(this.manifestPath, JSON.stringify([...this.neurons.values()], null, 2));
  }

  private async embed(neuron: Neuron): Promise<void> {
    if (SEARCHABLE.has(neuron.type)) {
      const text = (neuron.meta?.embedText as string | undefined) ?? neuron.body;
      const memwalBlob = await this.memwal.remember(text);
      this.byMemwalBlob.set(memwalBlob, neuron.id);
      neuron.meta = { ...(neuron.meta ?? {}), memwalBlob };
    }
  }

  async remember(neuron: Neuron, opts: { behind?: boolean } = {}): Promise<Neuron> {
    await this.load();
    this.neurons.set(neuron.id, neuron);
    if (SEARCHABLE.has(neuron.type)) {
      if (opts.behind) {
        neuron.meta = { ...(neuron.meta ?? {}), durability: "pending" };
        this.queue.push(neuron);
        void this.drain();
      } else {
        await this.embed(neuron);
        neuron.meta = { ...(neuron.meta ?? {}), durability: "confirmed" };
      }
    }
    await this.save();
    return neuron;
  }

  async ingest(file: Neuron, chunks: Neuron[], opts: { behind?: boolean } = {}): Promise<void> {
    await this.load();
    const items = [file, ...chunks];
    for (const n of items) this.neurons.set(n.id, n);
    if (opts.behind) {
      for (const n of items) {
        if (SEARCHABLE.has(n.type)) {
          n.meta = { ...(n.meta ?? {}), durability: "pending" };
          this.queue.push(n);
        }
      }
      void this.drain();
    } else {
      await Promise.all(items.map((n) => this.embed(n)));
      for (const n of items) if (SEARCHABLE.has(n.type)) n.meta = { ...(n.meta ?? {}), durability: "confirmed" };
    }
    await this.save();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.length) {
      const n = this.queue.shift()!;
      try {
        await this.embed(n);
        n.meta = { ...(n.meta ?? {}), durability: "confirmed" };
      } catch {
        n.meta = { ...(n.meta ?? {}), durability: "failed" };
      }
      await this.save();
    }
    this.draining = false;
  }

  async flush(): Promise<void> {
    void this.drain();
    while (this.queue.length || this.draining) await new Promise((r) => setTimeout(r, 50));
  }

  pending(): number {
    return [...this.neurons.values()].filter((n) => n.meta?.durability === "pending").length;
  }

  async recall(query: string, opts: RecallOptions = {}): Promise<RankedNeuron[]> {
    await this.load();
    const { limit = 5, overFetch = 20, type, trust, minRelevance = 0, mmr, datasetId } = opts;
    const dsOk = (n: Neuron) => !datasetId || (n.meta as Record<string, unknown> | undefined)?.datasetId === datasetId;

    const hits = await this.memwal.recall(query, overFetch);
    const seen = new Set<string>();
    const pool: Neuron[] = [];
    for (const h of hits) {
      const id = this.byMemwalBlob.get(h.blobId);
      const n = id ? this.neurons.get(id) : undefined;
      if (!n || seen.has(n.id)) continue;
      if (type && n.type !== type) continue;
      if (!dsOk(n)) continue;
      seen.add(n.id);
      pool.push(n);
    }

    if (opts.hybrid ?? true) {
      const corpus = [...this.neurons.values()].filter((n) => SEARCHABLE.has(n.type) && (!type || n.type === type) && dsOk(n));
      const bm = new BM25(corpus.map((n) => ({ id: n.id, text: n.body })));
      const bmRanking = bm.search(query, overFetch).map((x) => x.id);
      const denseRanking = pool.map((n) => n.id);
      const fused = rrf([denseRanking, bmRanking]).slice(0, overFetch);
      const byId = new Map(this.neurons.entries());
      pool.length = 0;
      seen.clear();
      for (const id of fused) {
        const n = byId.get(id);
        if (n && !seen.has(id)) { seen.add(id); pool.push(n); }
      }
    } else {
      const qWords = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
      if (qWords.length) {
        for (const n of this.neurons.values()) {
          if (seen.has(n.id) || n.meta?.durability !== "pending") continue;
          if (type && n.type !== type) continue;
          if (!dsOk(n)) continue;
          if (qWords.some((w) => n.body.toLowerCase().includes(w))) { seen.add(n.id); pool.push(n); }
        }
      }
    }

    if (pool.length === 0) return [];

    const ranked = await rerank(query, pool.map((n) => n.body));
    let out = ranked
      .map((r) => ({ neuron: pool[r.index], score: r.score, relevance: sigmoid(r.score) }))
      .filter((r) => r.relevance >= minRelevance);
    if (trust) out = out.filter((r) => r.neuron.source.trust === trust);
    if (opts.abstain != null && out.length > 1 && standsOut(out.map((r) => r.score)) < opts.abstain) return [];
    return mmr != null
      ? mmrSelect(out, limit, mmr, (r) => r.neuron.body, (r) => r.relevance)
      : out.slice(0, limit);
  }

  async ready(): Promise<void> {
    await this.load();
  }

  get(id: string): Neuron | undefined {
    return this.neurons.get(id);
  }

  all(): Neuron[] {
    return [...this.neurons.values()];
  }

  findPerson(name: string): Neuron | undefined {
    const key = name.trim().toLowerCase();
    const people = this.all().filter((n) => n.type === "person");
    return (
      people.find((n) => n.title.toLowerCase() === key) ??
      people.find((n) => n.title.toLowerCase().includes(key) || key.includes(n.title.toLowerCase()))
    );
  }

  async ensurePerson(name: string): Promise<Neuron> {
    await this.load();
    const existing = this.findPerson(name);
    if (existing) return existing;
    const person = createNeuron({ type: "person", title: name.trim(), body: name.trim() });
    this.neurons.set(person.id, person);
    await this.save();
    return person;
  }

  async update(neuron: Neuron): Promise<void> {
    await this.load();
    this.neurons.set(neuron.id, neuron);
    await this.save();
  }

  async root(): Promise<string> {
    await this.load();
    return merkleRoot([...this.neurons.values()]);
  }

  async verify(expectedRoot: string): Promise<{ ok: boolean; root: string }> {
    const root = await this.root();
    return { ok: root === expectedRoot, root };
  }

  async forget(id: string): Promise<boolean> {
    await this.load();
    const n = this.neurons.get(id);
    if (!n) return false;
    this.neurons.delete(id);
    const mb = n.meta?.memwalBlob as string | undefined;
    if (mb) this.byMemwalBlob.delete(mb);
    for (const other of this.neurons.values()) other.synapses = other.synapses.filter((s) => s.to !== id);
    await this.save();
    return true;
  }

  neighbors(id: string): Neuron[] {
    const out = new Map<string, Neuron>();
    const self = this.neurons.get(id);
    if (self) {
      for (const s of self.synapses) {
        const t = this.neurons.get(s.to);
        if (t) out.set(t.id, t);
      }
    }
    for (const n of this.neurons.values()) {
      if (n.id !== id && n.synapses.some((s) => s.to === id)) out.set(n.id, n);
    }
    return [...out.values()];
  }

  async publishInfo(opts: { epochs?: number; sealKey?: string } = {}): Promise<BlobInfo> {
    await this.load();
    const json = JSON.stringify([...this.neurons.values()]);
    const body = opts.sealKey ? seal(json, opts.sealKey) : json;
    return putBlobInfo(body, opts.epochs ?? 5);
  }

  async publish(opts: { epochs?: number; sealKey?: string } = {}): Promise<string> {
    return (await this.publishInfo(opts)).blobId;
  }

  async restoreFrom(blobId: string, opts: { sealKey?: string } = {}): Promise<number> {
    let body = await getBlobText(blobId);
    if (isSealed(body)) {
      if (!opts.sealKey) throw new Error("manifest is sealed — a sealKey is required to restore it");
      body = unseal(body, opts.sealKey);
    }
    const arr: Neuron[] = JSON.parse(body);
    for (const n of arr) {
      this.neurons.set(n.id, n);
      const mb = n.meta?.memwalBlob as string | undefined;
      if (mb) this.byMemwalBlob.set(mb, n.id);
    }
    this.loaded = true;
    await this.save();
    return arr.length;
  }
}
