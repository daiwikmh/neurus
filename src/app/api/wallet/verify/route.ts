import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { signWallet, walletStatement } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { address, signature } = await req.json().catch(() => ({}));
  if (!address || !signature) {
    return NextResponse.json({ error: "address and signature required" }, { status: 400 });
  }
  const jar = await cookies();
  const nonce = jar.get("neurus_nonce")?.value;
  if (!nonce) {
    return NextResponse.json({ error: "no nonce; request one first" }, { status: 400 });
  }
  const message = new TextEncoder().encode(walletStatement(nonce));
  let recovered: string;
  try {
    const pubkey = await verifyPersonalMessageSignature(message, signature);
    recovered = pubkey.toSuiAddress();
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  if (recovered !== address) {
    return NextResponse.json({ error: "signature does not match address" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, address });
  res.cookies.set("neurus_wallet", signWallet(address), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.delete("neurus_nonce");
  return res;
}
