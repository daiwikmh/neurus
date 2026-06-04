import { createHash } from "node:crypto";
import type { Neuron } from "../core/neuron";

export type OpType = "add" | "remove" | "update";

export interface Op {
  type: OpType;
  neuronId: string;
  tag: string;
  neuron?: Neuron;
  lamport: number;
  actor: string;
  sig: string;
}

function payload(o: Omit<Op, "sig">): string {
  return JSON.stringify({ type: o.type, neuronId: o.neuronId, tag: o.tag, lamport: o.lamport, actor: o.actor, body: o.neuron?.body ?? null });
}

const sign = (secret: string, p: string) => createHash("sha256").update(`${secret}:${p}`).digest("hex").slice(0, 32);

export class Capabilities {
  private secrets = new Map<string, string>();
  grant(actor: string, secret: string) { this.secrets.set(actor, secret); }
  revoke(actor: string) { this.secrets.delete(actor); }
  verify(o: Op): boolean {
    const secret = this.secrets.get(o.actor);
    return secret ? o.sig === sign(secret, payload(o)) : false;
  }
}

export function makeOp(
  args: { type: OpType; actor: string; secret: string; lamport: number; neuronId: string; tag: string; neuron?: Neuron },
): Op {
  const base = { type: args.type, neuronId: args.neuronId, tag: args.tag, neuron: args.neuron, lamport: args.lamport, actor: args.actor };
  return { ...base, sig: sign(args.secret, payload(base)) };
}

export interface MergeResult {
  neurons: Neuron[];
  applied: number;
  rejected: number;
  lamport: number;
}

export function mergeOps(ops: Op[], caps: Capabilities): MergeResult {
  let rejected = 0;
  const valid = ops.filter((o) => (caps.verify(o) ? true : (rejected++, false)));
  const ordered = [...valid].sort((a, b) => a.lamport - b.lamport || a.tag.localeCompare(b.tag));

  const elements = new Map<string, { neuronId: string; neuron: Neuron }>();
  const tombstoned = new Set<string>();
  for (const o of ordered) {
    if ((o.type === "add" || o.type === "update") && o.neuron) {
      if (o.type === "update") for (const [t, e] of elements) if (e.neuronId === o.neuronId) tombstoned.add(t);
      elements.set(o.tag, { neuronId: o.neuronId, neuron: o.neuron });
    } else if (o.type === "remove") {
      tombstoned.add(o.tag);
    }
  }

  const byNeuron = new Map<string, Neuron>();
  for (const [tag, e] of elements) if (!tombstoned.has(tag)) byNeuron.set(e.neuronId, e.neuron);

  const lamport = ordered.length ? Math.max(...ordered.map((o) => o.lamport)) : 0;
  return { neurons: [...byNeuron.values()], applied: valid.length, rejected, lamport };
}
