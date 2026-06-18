import { NextRequest } from "next/server";
import { engineHeaders } from "@/lib/server-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE = process.env.NEURUS_API ?? process.env.NEXT_PUBLIC_NEURUS_API ?? "http://localhost:4318";

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const target = `${ENGINE}/${path.join("/")}${req.nextUrl.search}`;

  const headers = await engineHeaders();
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.text();

  const upstream = await fetch(target, init);

  const out = new Headers();
  for (const k of ["content-type", "cache-control"]) {
    const v = upstream.headers.get(k);
    if (v) out.set(k, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
