import { randomUUID } from "node:crypto";

export type NeuronType = "person" | "note" | "file" | "chunk" | "commitment" | "insight";

export type SynapseKind =
  | "about"
  | "mentions"
  | "intro_by"
  | "attached_to"
  | "derived_from"
  | "promised_to"
  | "reflects_on";

export type Trust = "owned" | "shared" | "untrusted";

export interface Synapse {
  to: string;
  kind: SynapseKind;
}

export interface NeuronSource {
  author: string;
  trust: Trust;
}

export interface Neuron {
  id: string;
  type: NeuronType;
  title: string;
  body: string;
  blobId?: string;
  source: NeuronSource;
  validFrom?: number;
  createdAt: number;
  synapses: Synapse[];
  meta?: Record<string, unknown>;
}

export interface CreateNeuronInput {
  type: NeuronType;
  title: string;
  body: string;
  blobId?: string;
  author?: string;
  trust?: Trust;
  validFrom?: number;
  synapses?: Synapse[];
  meta?: Record<string, unknown>;
}

export function createNeuron(input: CreateNeuronInput): Neuron {
  return {
    id: `${input.type}_${randomUUID().slice(0, 8)}`,
    type: input.type,
    title: input.title,
    body: input.body,
    blobId: input.blobId,
    source: { author: input.author ?? "self", trust: input.trust ?? "owned" },
    validFrom: input.validFrom,
    createdAt: Date.now(),
    synapses: input.synapses ?? [],
    meta: input.meta,
  };
}

export function link(from: Neuron, toId: string, kind: SynapseKind): void {
  from.synapses.push({ to: toId, kind });
}
