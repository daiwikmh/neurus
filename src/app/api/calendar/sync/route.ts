import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const ENGINE = process.env.NEXT_PUBLIC_NEURUS_API ?? "http://localhost:4318";

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const accessToken = token?.accessToken;
  const userId = token?.sub;
  if (!accessToken) {
    return NextResponse.json({ error: "Google Calendar not connected — sign out and sign in again to grant calendar access." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const set = typeof body?.set === "string" && body.set ? body.set : "default";

  const now = new Date();
  const max = new Date(now.getTime() + 30 * 86_400_000);
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", now.toISOString());
  url.searchParams.set("timeMax", max.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");

  const gcal = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!gcal.ok) {
    const detail = await gcal.text().catch(() => "");
    return NextResponse.json({ error: `Google Calendar API ${gcal.status}`, detail: detail.slice(0, 200) }, { status: 502 });
  }
  const data = await gcal.json();
  const events = (data.items ?? []).map((e: any) => ({
    id: e.id,
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    location: e.location,
    description: e.description,
    attendees: (e.attendees ?? []).map((a: any) => a.email).filter(Boolean),
    link: e.htmlLink,
  }));

  const ing = await fetch(`${ENGINE}/v1/ingest/calendar`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(userId ? { "x-neurus-user": userId } : {}) },
    body: JSON.stringify({ set, events }),
  });
  const out = await ing.json().catch(() => ({}));
  if (!ing.ok) return NextResponse.json({ error: out?.error ?? `engine ${ing.status}`, fetched: events.length }, { status: 502 });

  return NextResponse.json({ fetched: events.length, added: out.added ?? 0, skipped: out.skipped ?? 0, set });
}
