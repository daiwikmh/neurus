import { NetworkManager, type Capability, type Indexer, type SubmitResult } from "./manager";
import { Capabilities, type Op } from "../crdt/oplog";
import { SharedReplica } from "../crdt/replica";
import type { Neuron } from "../core/neuron";
import { saveSnapshot, loadSnapshots } from "./persist";

export type NetEvent = "op" | "state" | "roster";
export type Sink = (event: NetEvent, data: unknown) => void;

export interface OpSummary {
  actor: string;
  type: string;
  lamport: number;
  neuronId: string;
  title?: string;
}

export interface Snapshot {
  neurons: Neuron[];
  root: string;
  roster: { actor: string; can: Capability }[];
}

const summarize = (op: Op): OpSummary => ({
  actor: op.actor,
  type: op.type,
  lamport: op.lamport,
  neuronId: op.neuronId,
  title: op.neuron?.title,
});

export class NetHub {
  private mgr: NetworkManager;
  private subs = new Map<string, Set<Sink>>();
  private dirty = new Set<string>();

  constructor(index?: Indexer) {
    this.mgr = new NetworkManager(index);
  }

  grant(set: string, actor: string, secret: string, can: Capability = "write"): void {
    this.mgr.grant(set, actor, secret, can);
    this.dirty.add(set);
    this.fan(set, "roster", { roster: this.mgr.roster(set) });
  }

  revoke(set: string, actor: string): void {
    this.mgr.revoke(set, actor);
    this.dirty.add(set);
    this.fan(set, "roster", { roster: this.mgr.roster(set) });
    this.fan(set, "state", this.snapshot(set));
  }

  async submit(set: string, op: Op): Promise<SubmitResult> {
    const res = await this.mgr.submit(set, op);
    this.fan(set, "op", { op: summarize(op), ok: res.ok, reason: res.reason, root: res.root });
    if (res.ok) {
      this.dirty.add(set);
      this.fan(set, "state", this.snapshot(set));
    }
    return res;
  }

  snapshot(set: string): Snapshot {
    return { neurons: this.mgr.state(set), root: this.mgr.root(set), roster: this.mgr.roster(set) };
  }

  opsSince(set: string, since: number): Op[] {
    return this.mgr.log(set).filter((o) => o.lamport > since);
  }

  async checkpoint(): Promise<{ set: string; blobId: string }[]> {
    const sets = [...this.dirty];
    this.dirty.clear();
    const out: { set: string; blobId: string }[] = [];
    for (const set of sets) {
      try {
        out.push({ set, blobId: await saveSnapshot(set, this.mgr.exportSet(set)) });
      } catch (e) {
        console.error(`checkpoint ${set} failed:`, (e as Error)?.message);
        this.dirty.add(set);
      }
    }
    return out;
  }

  async restore(): Promise<{ set: string; neurons: number }[]> {
    const out: { set: string; neurons: number }[] = [];
    for (const { setId, snap } of await loadSnapshots()) {
      this.mgr.importSet(setId, snap);
      out.push({ set: setId, neurons: this.mgr.state(setId).length });
    }
    return out;
  }

  async seed(set: string, neurons: Neuron[]): Promise<number> {
    const secret = `owner:${set}`;
    this.mgr.grant(set, "self", secret, "write");
    const self = new SharedReplica("self", secret, new Capabilities());
    const have = new Set(this.mgr.state(set).map((n) => n.id));
    let added = 0;
    for (const n of neurons) {
      if (have.has(n.id)) continue;
      const res = await this.mgr.submit(set, self.add(n));
      if (res.ok) added++;
    }
    this.dirty.add(set);
    this.fan(set, "roster", { roster: this.mgr.roster(set) });
    this.fan(set, "state", this.snapshot(set));
    return added;
  }

  subscribe(set: string, sink: Sink): () => void {
    let bucket = this.subs.get(set);
    if (!bucket) {
      bucket = new Set();
      this.subs.set(set, bucket);
    }
    bucket.add(sink);
    return () => bucket.delete(sink);
  }

  private fan(set: string, event: NetEvent, data: unknown): void {
    for (const sink of this.subs.get(set) ?? []) {
      try {
        sink(event, data);
      } catch {
        void 0;
      }
    }
  }
}
