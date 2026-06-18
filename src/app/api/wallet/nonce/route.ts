import { NextResponse } from "next/server";
import { newNonce } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function GET() {
  const nonce = newNonce();
  const res = NextResponse.json({ nonce });
  res.cookies.set("neurus_nonce", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 300,
  });
  return res;
}
