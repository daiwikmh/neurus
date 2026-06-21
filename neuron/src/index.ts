export * from "./core/neuron";
export * from "./core/sets";
export { Memory, type RankedNeuron, type RecallOptions } from "./core/memory";
export { ingestFile, type IngestedFile } from "./ingest/file";
export { ingestNote, type NoteResult } from "./ingest/note";
export { ingestWalrusBlob, type WalrusIngestOptions } from "./ingest/walrus";
export { ingestDir, listIngestible, type DirResult } from "./ingest/dir";
export { answer, answerStream, type Answer } from "./reason/answer";
export { brief, type Brief } from "./reason/brief";
export { reflect, type ReflectResult } from "./proactive/reflect";
export { surface, type Surfacing, type SurfaceOptions } from "./proactive/surface";
export { learn, primeSkills, type Episode, type SkillStats } from "./proactive/skills";
export { seal, unseal, isSealed } from "./access/seal";
export { merkleRoot } from "./integrity/merkle";
export { anchorRoot, type Attestation } from "./integrity/anchor";

import { Memory, type RankedNeuron, type RecallOptions } from "./core/memory";
import { resolveSet, openSet, type KnowledgeSet } from "./core/sets";
import { ingestNote, type NoteResult } from "./ingest/note";
import { ingestFile, ingestBuffer } from "./ingest/file";
import { ingestSite, type CrawlOptions, type CrawlResult } from "./ingest/web";
import { fetchRepoFiles } from "./ingest/github";
import type { DatasetKind } from "./core/datasets";
import { createWidget, listWidgets, deleteWidget, getWidget, type Widget } from "./core/widgets";
import { addDataset, listDatasets, updateDataset, getDataset, deleteDataset, type Dataset } from "./core/datasets";
import { blobHealth, type BlobHealth } from "./integrity/health";
import { readFile } from "node:fs/promises";
import { getBlob, putBlobInfo } from "./storage/walrus";
import { extendBlob } from "./storage/extend";
import { ingestWalrusBlob, type WalrusIngestOptions } from "./ingest/walrus";
import { ingestDir, type DirResult } from "./ingest/dir";
import { ingestCalendarEvents, type CalEvent } from "./ingest/calendar";
import { answer, type Answer } from "./reason/answer";
import { brief, type Brief } from "./reason/brief";
import { reflect, type ReflectResult } from "./proactive/reflect";
import { surface, type Surfacing, type SurfaceOptions } from "./proactive/surface";
import { learn, primeSkills, type Episode } from "./proactive/skills";
import { setIntegrity, attest } from "./core/sets";
import { anchorRoot, type Attestation } from "./integrity/anchor";
import { localTenant, type Tenant } from "./identity/credentials";
import { connectTelegram, getNotifyConfig, notify, bindChat, type NotifyConfig, type NotifyResult } from "./notify";
import type { Neuron, NeuronType, Trust } from "./core/neuron";

export * from "./identity/credentials";
export { Vault } from "./identity/vault";
export { provisionCredentials } from "./identity/provision";
export { AccountManager, type AccountStatus } from "./identity/account";
export { connectTelegram, getNotifyConfig, notify, sendTelegram, bindChat, getChatBinding, mintLinkToken, consumeLinkToken } from "./notify";
export type { NotifyConfig, NotifyResult, TelegramTarget, ChatBinding } from "./notify";
export { listDatasets, type Dataset, type DatasetKind } from "./core/datasets";
export { blobHealth, currentWalrusEpoch, type BlobHealth } from "./integrity/health";
export { getWidget, type Widget } from "./core/widgets";

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
  private constructor(public readonly set: KnowledgeSet, private mem: Memory, private behind: boolean, private tenant: Tenant) {}

  static async open(setName = "default", opts: { behind?: boolean; tenant?: Tenant } = {}): Promise<Neurus> {
    const tenant = opts.tenant ?? localTenant();
    const set = await resolveSet(setName, tenant);
    return new Neurus(set, openSet(set, tenant), opts.behind ?? false, tenant);
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

  async addFile(path: string, opts: { store?: boolean } = {}): Promise<Neuron> {
    const { file, chunks } = await ingestFile(path, { store: opts.store ?? true });
    await this.mem.ingest(file, chunks, { behind: this.behind });
    return file;
  }

  async uploadFileToBlobstore(fileId: string, path: string): Promise<string> {
    const raw = await readFile(path);
    const info = await putBlobInfo(raw, 5);
    await this.mem.ready();
    const neuron = this.mem.all().find((n: Neuron) => n.id === fileId);
    if (neuron) {
      await this.mem.update({
        ...neuron,
        blobId: info.blobId,
        meta: { ...neuron.meta, walrusObject: info.objectId, endEpoch: info.endEpoch },
      });
    }
    return info.blobId;
  }

  async indexWalrus(blobId: string, opts?: WalrusIngestOptions): Promise<Neuron> {
    const { source, chunks } = await ingestWalrusBlob(blobId, opts);
    const dataset = await addDataset(
      { set: this.set.id, kind: "file", title: source.title, blobId },
      this.tenant,
    );
    source.meta = { ...source.meta, datasetId: dataset.id };
    for (const c of chunks) c.meta = { ...c.meta, datasetId: dataset.id };
    await this.mem.ingest(source, chunks, { behind: this.behind });
    return source;
  }

  addDir(path: string, opts?: { max?: number; store?: boolean }): Promise<DirResult> {
    return ingestDir(this.mem, path, { ...opts, behind: this.behind });
  }

  addCalendar(events: CalEvent[]): Promise<{ added: number; skipped: number }> {
    return ingestCalendarEvents(this.mem, events);
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
    await setIntegrity(this.set.id, "verified", this.tenant);
    this.set.integrity = "verified";
  }

  async checkpoint(): Promise<Attestation> {
    const root = await this.mem.root();
    const att = await anchorRoot(root);
    await attest(this.set.id, root, this.tenant);
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
    const skills = await primeSkills(this.mem, "ask");
    const hits = await this.mem.recall(question, { limit: 5 });
    return answer(question, hits, { skills: skills.map((s) => s.body) });
  }

  // act -> outcome -> distill: record how a task turned out so the matching skill improves.
  learn(episode: Episode): Promise<Neuron> {
    return learn(this.mem, episode);
  }

  reflect(opts?: { recent?: number }): Promise<ReflectResult> {
    return reflect(this.mem, opts);
  }

  surface(opts?: SurfaceOptions): Promise<Surfacing[]> {
    return surface(this.mem, opts);
  }

  async connectTelegram(chatId: string): Promise<NotifyConfig> {
    const cfg = await connectTelegram(chatId, this.tenant);
    await bindChat(chatId, { user: this.tenant.id, set: this.set.name });
    return cfg;
  }

  notifyConfig(): Promise<NotifyConfig> {
    return getNotifyConfig(this.tenant);
  }

  notify(text: string): Promise<NotifyResult> {
    return notify(text, this.tenant);
  }

  async surfaceAndNotify(opts: SurfaceOptions & { notify?: boolean } = {}): Promise<{ surfacings: Surfacing[]; delivered: string[] }> {
    const surfacings = await surface(this.mem, opts);
    if (!opts.notify || surfacings.length === 0) return { surfacings, delivered: [] };
    const lines = surfacings.map((s) => `• ${s.neuron.body}  _(${s.score.toFixed(2)})_`).join("\n");
    const res = await notify(`*Neurus — ${this.set.name}*\n${lines}`, this.tenant);
    return { surfacings, delivered: res.delivered };
  }

  publish(opts?: { epochs?: number; sealKey?: string }): Promise<string> {
    return this.mem.publish(opts);
  }

  restore(blobId: string, opts?: { sealKey?: string }): Promise<number> {
    return this.mem.restoreFrom(blobId, opts);
  }

  async addUpload(name: string, contentBase64: string): Promise<{ file: Neuron; dataset: Dataset }> {
    const raw = Buffer.from(contentBase64, "base64");
    const { file, chunks } = await ingestBuffer(name, raw, { store: true });
    const dataset = await addDataset(
      {
        set: this.set.id,
        kind: "file",
        title: name,
        blobId: file.blobId!,
        objectId: file.meta?.walrusObject as string | undefined,
        endEpoch: file.meta?.endEpoch as number | undefined,
        bytes: file.meta?.bytes as number | undefined,
      },
      this.tenant,
    );
    file.meta = { ...file.meta, datasetId: dataset.id };
    for (const c of chunks) c.meta = { ...c.meta, datasetId: dataset.id };
    await this.mem.ingest(file, chunks, { behind: this.behind });
    return { file, dataset };
  }

  async publishDataset(opts?: { sealKey?: string }): Promise<Dataset> {
    const info = await this.mem.publishInfo(opts);
    return addDataset(
      { set: this.set.id, kind: "snapshot", title: `${this.set.name} snapshot`, blobId: info.blobId, objectId: info.objectId, endEpoch: info.endEpoch },
      this.tenant,
    );
  }

  async importDataset(blobId: string, title?: string): Promise<Dataset> {
    const source = await this.indexWalrus(blobId, { title });
    return addDataset({ set: this.set.id, kind: "import", title: title ?? source.title, blobId }, this.tenant);
  }

  async addSite(url: string, opts?: CrawlOptions): Promise<{ dataset: Dataset; pages: number; failed: number; skipped: number }> {
    const res: CrawlResult = await ingestSite(url, opts);
    if (res.pages === 0) {
      throw new Error(`no readable pages found at ${url} — the site may be JS-rendered (try a direct page URL) or blocked by robots.txt`);
    }
    const dataset = await addDataset(
      { set: this.set.id, kind: "web", title: res.host, url: res.root, pages: res.pages },
      this.tenant,
    );
    for (const { source, chunks } of res.ingested) {
      source.meta = { ...source.meta, datasetId: dataset.id };
      for (const c of chunks) c.meta = { ...c.meta, datasetId: dataset.id };
      await this.mem.ingest(source, chunks, { behind: this.behind });
    }
    return { dataset, pages: res.pages, failed: res.failed.length, skipped: res.skipped };
  }

  private async ingestStructure(kind: DatasetKind, title: string, url: string | undefined, items: { name: string; bytes: Buffer }[]): Promise<{ dataset: Dataset; files: number; failed: number }> {
    const CONCURRENCY = 6;
    const staged: { file: Parameters<Memory["ingest"]>[0]; chunks: Parameters<Memory["ingest"]>[1] }[] = [];
    let firstBlobId: string | undefined;
    let failed = 0;

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map((it) => ingestBuffer(it.name, it.bytes, { store: true })));
      for (const r of results) {
        if (r.status === "fulfilled") {
          staged.push(r.value);
          if (!firstBlobId && r.value.file.blobId) firstBlobId = r.value.file.blobId;
        } else {
          failed++;
        }
      }
    }

    if (staged.length === 0) throw new Error(`no ingestible files found in "${title}" (need md/txt/csv/json/log/pdf/docx)`);
    const dataset = await addDataset(
      { set: this.set.id, kind, title, url, pages: staged.length, ...(firstBlobId ? { blobId: firstBlobId } : {}) },
      this.tenant,
    );
    for (const { file, chunks } of staged) {
      file.meta = { ...file.meta, datasetId: dataset.id };
      for (const c of chunks) c.meta = { ...c.meta, datasetId: dataset.id };
      await this.mem.ingest(file, chunks, { behind: this.behind });
    }
    return { dataset, files: staged.length, failed };
  }

  async addRepo(repoUrl: string, opts?: { max?: number }): Promise<{ dataset: Dataset; files: number; failed: number }> {
    const { items, repo, url } = await fetchRepoFiles(repoUrl, opts);
    if (items.length === 0) throw new Error(`no ingestible docs found in ${repo}`);
    return this.ingestStructure("github", repo, url, items);
  }

  async addFolder(name: string, files: { path: string; content: string }[]): Promise<{ dataset: Dataset; files: number; failed: number }> {
    const items = files.map((f) => ({ name: f.path, bytes: Buffer.from(f.content, "base64") }));
    return this.ingestStructure("folder", name, undefined, items);
  }

  datasets(): Promise<Dataset[]> {
    return listDatasets(this.set.id, this.tenant);
  }

  async deleteDataset(id: string): Promise<{ deleted: boolean; neuronsForgotten: number }> {
    const removed = await deleteDataset(id, this.tenant);
    if (!removed) return { deleted: false, neuronsForgotten: 0 };
    const neuronsForgotten = await this.mem.forgetByDataset(id);
    return { deleted: true, neuronsForgotten };
  }

  async reconcile(): Promise<{ queued: number; pending: number; failed: number }> {
    const { queued } = await this.mem.resume();
    return { queued, pending: this.mem.pending(), failed: this.mem.failed() };
  }

  restoreIndex(limit = 50): Promise<{ restored: number; skipped: number; total: number }> {
    return this.mem.restoreIndex(limit);
  }

  datasetHealth(objectId: string): Promise<BlobHealth> {
    return blobHealth(objectId);
  }

  async renewDataset(id: string, epochs = 5, opts?: { signer?: string }): Promise<Dataset | undefined> {
    const d = await getDataset(id, this.tenant);
    if (!d || !d.blobId) return undefined;

    if (opts?.signer && d.objectId) {
      await extendBlob(d.objectId, opts.signer, epochs);
      const endEpoch = d.endEpoch ? d.endEpoch + epochs : undefined;
      return updateDataset(id, endEpoch ? { endEpoch } : {}, this.tenant);
    }

    let bytes: Uint8Array;
    try {
      bytes = await getBlob(d.blobId);
    } catch (e) {
      if (e instanceof Error && /HTTP 404/.test(e.message)) {
        throw new Error(`"${d.title}" has expired and is no longer stored on Walrus — its data is gone, so it can't be renewed. Re-upload the original file to restore it.`);
      }
      throw e;
    }
    const info = await putBlobInfo(bytes, epochs);
    return updateDataset(id, { blobId: info.blobId, objectId: info.objectId, endEpoch: info.endEpoch }, this.tenant);
  }

  createWidget(name: string, origins: string[] = [], datasetId?: string): Promise<Widget> {
    return createWidget(this.tenant, this.set.id, name, origins, datasetId);
  }

  widgets(): Promise<Widget[]> {
    return listWidgets(this.tenant, this.set.id);
  }

  deleteWidget(id: string): Promise<boolean> {
    return deleteWidget(id, this.tenant);
  }
}
