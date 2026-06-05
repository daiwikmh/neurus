import { getObjectFields, getDynamicFieldObject, suiNetwork } from "./tatum";

const SYSTEM_OBJECT: Record<string, string> = {
  testnet: "0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af",
};

function systemObjectId(): string | undefined {
  return process.env.WALRUS_SYSTEM_OBJECT || SYSTEM_OBJECT[suiNetwork()];
}

export interface BlobHealth {
  objectId: string;
  certified: boolean;
  certifiedEpoch?: number;
  startEpoch: number;
  endEpoch: number;
  deletable: boolean;
  currentEpoch?: number;
  epochsRemaining?: number;
  expired?: boolean;
}

export async function currentWalrusEpoch(): Promise<number | undefined> {
  const sysId = systemObjectId();
  if (!sysId) return undefined;
  try {
    const wrapper = await getObjectFields(sysId);
    const version = wrapper?.version;
    if (version == null) return undefined;
    const inner = await getDynamicFieldObject(sysId, { type: "u64", value: String(version) });
    const epoch = inner?.value?.fields?.committee?.fields?.epoch;
    return epoch == null ? undefined : Number(epoch);
  } catch {
    return undefined;
  }
}

export async function blobHealth(objectId: string): Promise<BlobHealth> {
  const f = await getObjectFields(objectId);
  if (!f) throw new Error(`Walrus blob object ${objectId} not found on chain (expired, deleted, or wrong network)`);
  const storage = f.storage?.fields ?? {};
  const startEpoch = Number(storage.start_epoch);
  const endEpoch = Number(storage.end_epoch);
  const certifiedEpoch = f.certified_epoch == null ? undefined : Number(f.certified_epoch);
  const current = await currentWalrusEpoch();
  return {
    objectId,
    certified: certifiedEpoch != null,
    certifiedEpoch,
    startEpoch,
    endEpoch,
    deletable: Boolean(f.deletable),
    currentEpoch: current,
    epochsRemaining: current == null ? undefined : endEpoch - current,
    expired: current == null ? undefined : current >= endEpoch,
  };
}
