import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readWallet } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function GET() {
  const jar = await cookies();
  const address = readWallet(jar.get("neurus_wallet")?.value);
  return NextResponse.json({ address });
}
