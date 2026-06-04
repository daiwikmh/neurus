import { randomUUID } from "node:crypto";
import type { Neuron } from "../core/neuron";
import { merkleRoot } from "../integrity/merkle";
import { Capabilities, makeOp, mergeOps, type Op } from "./oplog";

export class SharedReplica {
  private ops: Op[] = [];
  private lamport = 0;

  constructor(
    public readonly actor: string,
    private secret: string,
    private caps: Capabilities,
  ) {}

  private tick(observed = 0): number {
    this.lamport = Math.max(this.lamport, observed) + 1;
    return this.lamport;
  }

  add(neuron: Neuron): Op {
    const op = makeOp({ type: "add", actor: this.actor, secret: this.secret, lamport: this.tick(), neuronId: neuron.id, tag: `${this.actor}-${randomUUID().slice(0, 8)}`, neuron });
    this.ops.push(op);
    return op;
  }

  remove(neuronId: string): Op[] {
    const liveTags = this.ops.filter((o) => o.neuronId === neuronId && (o.type === "add" || o.type === "update")).map((o) => o.tag);
    return liveTags.map((tag) => {
      const op = makeOp({ type: "remove", actor: this.actor, secret: this.secret, lamport: this.tick(), neuronId, tag });
      this.ops.push(op);
      return op;
    });
  }

  receive(incoming: Op[]): void {
    for (const o of incoming) {
      this.tick(o.lamport);
      if (!this.ops.some((e) => e.tag === o.tag && e.type === o.type)) this.ops.push(o);
    }
  }

  state(): Neuron[] {
    return mergeOps(this.ops, this.caps).neurons;
  }

  root(): string {
    return merkleRoot(this.state());
  }

  log(): Op[] {
    return [...this.ops];
  }
}
