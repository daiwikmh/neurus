import { readFile, writeFile } from "node:fs/promises";
import { putBlobInfo, getBlobText } from "../storage/walrus";
import { seal, unseal } from "../access/seal";
import type { SetSnapshot } from "./manager";

const POINTER = process.env.NEURUS_NET_INDEX ?? ".neurus-net.json";

function vaultKey(): string {
  const k = process.env.NEURON_VAULT_KEY;
  if (!k) throw new Error("NEURON_VAULT_KEY is required to persist net sets");
  return k;
}

async function readPointers(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(POINTER, "utf8"));
  } catch {
    return {};
  }
}

export async function saveSnapshot(setId: string, snap: SetSnapshot): Promise<string> {
  const blob = seal(JSON.stringify(snap), vaultKey());
  const info = await putBlobInfo(blob, Number(process.env.WALRUS_EPOCHS ?? 5));
  const ptr = await readPointers();
  ptr[setId] = info.blobId;
  await writeFile(POINTER, JSON.stringify(ptr, null, 2));
  return info.blobId;
}

export async function loadSnapshots(): Promise<{ setId: string; snap: SetSnapshot }[]> {
  const ptr = await readPointers();
  const out: { setId: string; snap: SetSnapshot }[] = [];
  for (const [setId, blobId] of Object.entries(ptr)) {
    try {
      const body = unseal(await getBlobText(blobId), vaultKey());
      out.push({ setId, snap: JSON.parse(body) as SetSnapshot });
    } catch {
      void 0;
    }
  }
  return out;
}
