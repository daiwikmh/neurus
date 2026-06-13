const PUBLISHER = process.env.WALRUS_PUBLISHER_URL ?? "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL ?? "https://aggregator.walrus-testnet.walrus.space";

export interface BlobInfo {
  blobId: string;
  objectId?: string;
  startEpoch?: number;
  endEpoch?: number;
}

let blobOwner: string | undefined = process.env.WALRUS_OWNER_ADDRESS;

export function setBlobOwner(address: string | undefined): void {
  blobOwner = address;
}

export async function putBlobInfo(data: Uint8Array | string, epochs = 5): Promise<BlobInfo> {
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const send = blobOwner ? `&send_object_to=${blobOwner}` : "";
  const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${epochs}${send}`, { method: "PUT", body: body as BodyInit });
  const text = await res.text();
  if (!res.ok) throw new Error(`Walrus publish HTTP ${res.status}: ${text}`);
  const r = JSON.parse(text);
  const nc = r?.newlyCreated?.blobObject;
  const ac = r?.alreadyCertified;
  const blobId = nc?.blobId ?? ac?.blobId;
  if (!blobId) throw new Error(`no blobId in Walrus response: ${text}`);
  return { blobId, objectId: nc?.id, startEpoch: nc?.storage?.startEpoch, endEpoch: nc?.storage?.endEpoch ?? ac?.endEpoch };
}

export async function putBlob(data: Uint8Array | string, epochs = 5): Promise<string> {
  return (await putBlobInfo(data, epochs)).blobId;
}

export async function getBlob(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Walrus read HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function getBlobText(blobId: string): Promise<string> {
  return new TextDecoder().decode(await getBlob(blobId));
}
