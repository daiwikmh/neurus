import { readFile, writeFile } from "node:fs/promises";
import { putBlobInfo, getBlobText } from "../storage/walrus";
import { seal, unseal } from "../access/seal";
import { vaultKey } from "./persist";

const POINTER = process.env.NEURUS_WF_INDEX ?? ".neurus-workflows.json";

export interface WorkflowRecord {
  id: string;
  set: string;
  tenantId: string;
  spec: {
    feeds: string[];
    assets: string[];
    wallets: string[];
    deepbook?: boolean;
    deepbookManagers?: string[];
    intervalMs: number;
    threshold: number;
    epsilon: number;
    reportEvery: number;
    consolidateEvery?: number;
    strategySet?: string;
    instruction?: string;
    durationDays?: number;
    autoReport: boolean;
  };
  cursor: { ticksDone: number; lastTickAt: number };
  startedAt: number;
  endsAt: number;
  status: "active" | "expired" | "stopped";
}

export async function saveRecords(records: WorkflowRecord[]): Promise<string> {
  const blob = seal(JSON.stringify(records), vaultKey());
  const info = await putBlobInfo(blob, Number(process.env.WALRUS_EPOCHS ?? 5));
  await writeFile(POINTER, JSON.stringify({ blobId: info.blobId }, null, 2));
  return info.blobId;
}

export async function loadRecords(): Promise<WorkflowRecord[]> {
  try {
    const { blobId } = JSON.parse(await readFile(POINTER, "utf8"));
    return JSON.parse(unseal(await getBlobText(blobId), vaultKey())) as WorkflowRecord[];
  } catch {
    return [];
  }
}
