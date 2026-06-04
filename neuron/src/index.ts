export * from "./core/neuron";
export * from "./core/sets";
export { Memory, type RankedNeuron, type RecallOptions } from "./core/memory";
export { ingestFile, type IngestedFile } from "./ingest/file";
export { ingestNote, type NoteResult } from "./ingest/note";
export { ingestWalrusBlob, type WalrusIngestOptions } from "./ingest/walrus";
export { ingestDir, listIngestible, type DirResult } from "./ingest/dir";
export { answer, type Answer } from "./reason/answer";
export { brief, type Brief } from "./reason/brief";
export { reflect, type ReflectResult } from "./proactive/reflect";
export { surface, type Surfacing, type SurfaceOptions } from "./proactive/surface";
export { seal, unseal, isSealed } from "./access/seal";
export { merkleRoot } from "./integrity/merkle";
export { anchorRoot, type Attestation } from "./integrity/anchor";

import { Memory, type RankedNeuron, type RecallOptions } from "./core/memory";
import { resolveSet, openSet, type KnowledgeSet } from "./core/sets";
import { ingestNote, type NoteResult } from "./ingest/note";
import { ingestFile } from "./ingest/file";
import { ingestWalrusBlob, type WalrusIngestOptions } from "./ingest/walrus";
import { ingestDir, type DirResult } from "./ingest/dir";
import { answer, type Answer } from "./reason/answer";
import { brief, type Brief } from "./reason/brief";
import { reflect, type ReflectResult } from "./proactive/reflect";
import { surface, type Surfacing, type SurfaceOptions } from "./proactive/surface";
import { setIntegrity, attest } from "./core/sets";
import { anchorRoot, type Attestation } from "./integrity/anchor";
import type { Neuron, NeuronType, Trust } from "./core/neuron";

export interface Passage {
  text: string;
  score: number;
  relevance: number;
  metadata: { id: string; type: NeuronType; trust: Trust; source: string; blobId?: string; ageHours: number };
}

export interface RetrieveOptions {
  topK?: number;
  minRelevance?: number;
  mmr?: number;
  type?: NeuronType;
  trust?: Trust;
}

export class Neurus {
  private constructor(public readonly set: KnowledgeSet, private mem: Memory, private behind: boolean) {}

  static async open(setName = "default", opts: { behind?: boolean } = {}): Promise<Neurus> {
    const set = await resolveSet(setName);
    return new Neurus(set, openSet(set), opts.behind ?? false);
  }

  get memory(): Memory {
    return this.mem;
  }

  flush(): Promise<void> {
    return this.mem.flush();
  }

  note(text: string): Promise<NoteResult> {
    return ingestNote(this.mem, text, { behind: this.behind });
  }

  async addFile(path: string): Promise<Neuron> {
    const { file, chunks } = await ingestFile(path, { store: true });
    await this.mem.ingest(file, chunks, { behind: this.behind });
    return file;
  }

  async indexWalrus(blobId: string, opts?: WalrusIngestOptions): Promise<Neuron> {
    const { source, chunks } = await ingestWalrusBlob(blobId, opts);
    await this.mem.ingest(source, chunks, { behind: this.behind });
    return source;
  }

  addDir(path: string, opts?: { max?: number; store?: boolean }): Promise<DirResult> {
    return ingestDir(this.mem, path, { ...opts, behind: this.behind });
  }

  recall(query: string, opts?: RecallOptions): Promise<RankedNeuron[]> {
    return this.mem.recall(query, opts);
  }

  async retrieve(query: string, opts: RetrieveOptions = {}): Promise<Passage[]> {
    const hits = await this.mem.recall(query, {
      limit: opts.topK ?? 8,
      minRelevance: opts.minRelevance,
      mmr: opts.mmr,
      type: opts.type,
      trust: opts.trust,
    });
    const now = Date.now();
    return hits.map((h) => ({
      text: h.neuron.body,
      score: Number(h.score.toFixed(3)),
      relevance: Number(h.relevance.toFixed(3)),
      metadata: {
        id: h.neuron.id,
        type: h.neuron.type,
        trust: h.neuron.source.trust,
        source: h.neuron.title,
        blobId: h.neuron.blobId,
        ageHours: Math.round((now - h.neuron.createdAt) / 3_600_000),
      },
    }));
  }

  brief(name: string): Promise<Brief> {
    return brief(this.mem, name);
  }

  async nudges(): Promise<Neuron[]> {
    await this.mem.ready();
    return this.mem.all().filter((n) => n.type === "commitment");
  }

  async neurons(): Promise<Neuron[]> {
    await this.mem.ready();
    return this.mem.all();
  }

  forget(id: string): Promise<boolean> {
    return this.mem.forget(id);
  }

  async makeVerified(): Promise<void> {
    await setIntegrity(this.set.id, "verified");
    this.set.integrity = "verified";
  }

  async checkpoint(): Promise<Attestation> {
    const root = await this.mem.root();
    const att = await anchorRoot(root);
    await attest(this.set.id, root);
    this.set.attestedRoot = root;
    this.set.attestedAt = att.at;
    return att;
  }

  async verifyIntegrity(): Promise<{ ok: boolean; root: string; attested?: string }> {
    if (!this.set.attestedRoot) return { ok: false, root: await this.mem.root() };
    const v = await this.mem.verify(this.set.attestedRoot);
    return { ...v, attested: this.set.attestedRoot };
  }

  async ask(question: string): Promise<Answer> {
    if (this.set.integrity === "verified") {
      const v = await this.verifyIntegrity();
      if (!v.ok) throw new Error(`integrity check FAILED — memory root ${v.root.slice(0, 16)} != attested ${v.attested?.slice(0, 16)}. Refusing to act on tampered memory.`);
    }
    const hits = await this.mem.recall(question, { limit: 5 });
    return answer(question, hits);
  }

  reflect(opts?: { recent?: number }): Promise<ReflectResult> {
    return reflect(this.mem, opts);
  }

  surface(opts?: SurfaceOptions): Promise<Surfacing[]> {
    return surface(this.mem, opts);
  }

  publish(opts?: { epochs?: number; sealKey?: string }): Promise<string> {
    return this.mem.publish(opts);
  }

  restore(blobId: string, opts?: { sealKey?: string }): Promise<number> {
    return this.mem.restoreFrom(blobId, opts);
  }
}
