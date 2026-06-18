import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { readWallet } from "@/lib/wallet-session";

export interface ServerIdentity {
  wallet?: string;
  googleSub?: string;
  email?: string;
}

export async function getServerIdentity(): Promise<ServerIdentity> {
  const jar = await cookies();
  const wallet = readWallet(jar.get("neurus_wallet")?.value) ?? undefined;
  const session = await auth();
  return {
    wallet,
    googleSub: session?.userId,
    email: session?.user?.email ?? undefined,
  };
}

// Headers that prove identity to the engine: the shared proxy secret plus the server-derived
// identity. Used by the /api/neurus proxy and any other server route that calls the engine.
export async function engineHeaders(): Promise<Record<string, string>> {
  const id = await getServerIdentity();
  const h: Record<string, string> = {};
  const secret = process.env.NEURUS_PROXY_SECRET;
  if (secret) h["x-neurus-proxy-secret"] = secret;
  if (id.wallet) h["x-neurus-wallet"] = id.wallet;
  if (id.googleSub) h["x-neurus-google"] = id.googleSub;
  if (id.email) h["x-neurus-email"] = id.email;
  return h;
}
