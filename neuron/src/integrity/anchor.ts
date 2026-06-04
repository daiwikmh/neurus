export type AnchorMode = "sui" | "local";

export interface Attestation {
  root: string;
  mode: AnchorMode;
  ref: string;
  at: number;
}

export async function anchorRoot(root: string): Promise<Attestation> {
  const pkg = process.env.NEURUS_HEAD_PACKAGE;
  const headObj = process.env.NEURUS_HEAD_OBJECT;
  if (pkg && headObj && process.env.SUI_PRIVATE_KEY) {
    return anchorOnSui(root, pkg, headObj);
  }
  return { root, mode: "local", ref: `local:${root.slice(0, 16)}`, at: Date.now() };
}

async function anchorOnSui(root: string, pkg: string, headObj: string): Promise<Attestation> {
  throw new Error(
    `Sui HEAD anchoring not wired: would call ${pkg}::manifest::update(${headObj}, 0x${root}) ` +
      `via @mysten/sui with SUI_PRIVATE_KEY. Deploy move/neurus_manifest and set NEURUS_HEAD_PACKAGE/OBJECT to enable.`,
  );
}
