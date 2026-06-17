const PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
  "https://publisher.walrus-testnet.walrus.space";

export interface WalrusUploadResult {
  blobId: string;
  objectId?: string;
  endEpoch?: number;
}

export async function uploadToWalrus(
  bytes: Uint8Array,
  opts: { epochs?: number; owner?: string } = {},
): Promise<WalrusUploadResult> {
  const ownerParam = opts.owner ? `&send_object_to=${opts.owner}` : "";
  const url = `${PUBLISHER}/v1/blobs?epochs=${opts.epochs ?? 5}${ownerParam}`;
  const res = await fetch(url, { method: "PUT", body: bytes.buffer as BodyInit });
  const text = await res.text();
  if (!res.ok) throw new Error(`Walrus upload failed (${res.status}): ${text}`);
  const r = JSON.parse(text);
  const nc = r?.newlyCreated?.blobObject;
  const ac = r?.alreadyCertified;
  const blobId = nc?.blobId ?? ac?.blobId;
  if (!blobId) throw new Error("No blobId in Walrus response");
  return { blobId, objectId: nc?.id, endEpoch: nc?.storage?.endEpoch ?? ac?.endEpoch };
}
