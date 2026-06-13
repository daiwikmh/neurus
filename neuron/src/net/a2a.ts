import { randomBytes } from "node:crypto";
import type { AgentDef } from "../core/agents";

// A2A (Agent2Agent) interop: expose a Neurus agent as a discoverable A2A server.
// Card shape follows the A2A AgentCard spec; the single skill is grounded Q&A over the
// agent's Walrus-backed dataset. Read-only, resolved by the agent's unguessable id.

const PROTOCOL_VERSION = "0.2.6";

export function buildAgentCard(agent: AgentDef, baseUrl: string): Record<string, unknown> {
  const url = `${baseUrl}/v1/a2a/${agent.id}`;
  const scope = agent.datasetId ? "a curated dataset" : `the "${agent.dataset || "default"}" set`;
  const description = agent.role || `Answers questions grounded in ${scope}, stored on Walrus, with citations.`;
  return {
    protocolVersion: PROTOCOL_VERSION,
    name: agent.name,
    description,
    url,
    preferredTransport: "JSONRPC",
    provider: { organization: "Neurus", url: "https://neurus.xyz" },
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [
      {
        id: "ask",
        name: "Ask grounded in memory",
        description: `Answers questions grounded in ${scope} on Walrus and returns a cited answer.`,
        tags: ["memory", "retrieval", "rag", "walrus"],
        examples: [`What does ${agent.dataset || "this dataset"} say about …?`],
        inputModes: ["text/plain"],
        outputModes: ["text/plain"],
      },
    ],
  };
}

export function textFromMessage(params: unknown): string {
  const parts = (params as { message?: { parts?: Array<{ kind?: string; text?: string }> } })?.message?.parts ?? [];
  return parts
    .filter((p) => (p.kind === "text" || p.kind === undefined) && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n")
    .trim();
}

export function jsonrpcResult(id: unknown, text: string, sources: string[]): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result: {
      kind: "message",
      role: "agent",
      messageId: "msg_" + randomBytes(8).toString("hex"),
      parts: [{ kind: "text", text }],
      ...(sources.length ? { metadata: { "neurus/sources": sources } } : {}),
    },
  };
}

export function jsonrpcError(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
