import { SharedReplica } from "../crdt/replica";
import { Capabilities, type Op } from "../crdt/oplog";
import type { Neuron } from "../core/neuron";

export type Capability = "read" | "write";

export interface SubmitResult {
  ok: boolean;
  reason?: string;
  root: string;
  lamport: number;
}

export type Indexer = (setId: string, neuron: Neuron) => Promise<void>;

export interface SetSnapshot {
  ops: Op[];
  grants: { actor: string; secret: string; can: Capability }[];
}

interface NetSet {
  replica: SharedReplica;
  caps: Capabilities;
  actors: Map<string, { secret: string; can: Capability }>;
}

export class NetworkManager {
  private sets = new Map<string, NetSet>();

  constructor(private index?: Indexer) {}

  private ensure(setId: string): NetSet {
    let s = this.sets.get(setId);
    if (!s) {
      const caps = new Capabilities();
      s = { replica: new SharedReplica("server", `server:${setId}`, caps), caps, actors: new Map() };
      this.sets.set(setId, s);
    }
    return s;
  }

  grant(setId: string, actor: string, secret: string, can: Capability = "write"): void {
    const s = this.ensure(setId);
    s.caps.grant(actor, secret);
    s.actors.set(actor, { secret, can });
  }

  revoke(setId: string, actor: string): void {
    const s = this.ensure(setId);
    s.caps.revoke(actor);
    s.actors.delete(actor);
  }

  async submit(setId: string, op: Op): Promise<SubmitResult> {
    const s = this.ensure(setId);
    if (!s.caps.verify(op)) {
      return { ok: false, reason: "unauthorized actor or bad signature", root: s.replica.root(), lamport: op.lamport };
    }
    if (s.actors.get(op.actor)?.can !== "write") {
      return { ok: false, reason: "actor lacks write capability", root: s.replica.root(), lamport: op.lamport };
    }
    s.replica.receive([op]);
    if ((op.type === "add" || op.type === "update") && op.neuron && this.index) {
      void this.index(setId, op.neuron).catch(() => {});
    }
    return { ok: true, root: s.replica.root(), lamport: op.lamport };
  }

  state(setId: string): Neuron[] {
    return this.ensure(setId).replica.state();
  }

  root(setId: string): string {
    return this.ensure(setId).replica.root();
  }

  log(setId: string): Op[] {
    return this.ensure(setId).replica.log();
  }

  roster(setId: string): { actor: string; can: Capability }[] {
    return [...this.ensure(setId).actors.entries()].map(([actor, v]) => ({ actor, can: v.can }));
  }

  setIds(): string[] {
    return [...this.sets.keys()];
  }

  exportSet(setId: string): SetSnapshot {
    const s = this.ensure(setId);
    return {
      ops: s.replica.log(),
      grants: [...s.actors.entries()].map(([actor, v]) => ({ actor, secret: v.secret, can: v.can })),
    };
  }

  importSet(setId: string, snap: SetSnapshot): void {
    const s = this.ensure(setId);
    for (const g of snap.grants) {
      s.caps.grant(g.actor, g.secret);
      s.actors.set(g.actor, { secret: g.secret, can: g.can });
    }
    s.replica.receive(snap.ops);
  }
}
