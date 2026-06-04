const PUBLISHER = process.env.WALRUS_PUBLISHER_URL ?? "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL ?? "https://aggregator.walrus-testnet.walrus.space";

export async function putBlob(data: Uint8Array | string, epochs = 5): Promise<string> {
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${epochs}`, { method: "PUT", body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Walrus publish HTTP ${res.status}: ${text}`);
  const r = JSON.parse(text);
  const id = r?.newlyCreated?.blobObject?.blobId ?? r?.alreadyCertified?.blobId;
  if (!id) throw new Error(`no blobId in Walrus response: ${text}`);
  return id;
}

export async function getBlob(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Walrus read HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function getBlobText(blobId: string): Promise<string> {
  return new TextDecoder().decode(await getBlob(blobId));
}
