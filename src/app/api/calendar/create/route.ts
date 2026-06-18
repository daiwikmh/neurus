import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { engineHeaders } from "@/lib/server-identity";

const ENGINE = process.env.NEURUS_API ?? process.env.NEXT_PUBLIC_NEURUS_API ?? "http://localhost:4318";

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const accessToken = token?.accessToken;
  if (!accessToken) return NextResponse.json({ created: false });

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ created: false });

  const ex = await fetch(`${ENGINE}/v1/extract/meeting`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await engineHeaders()) },
    body: JSON.stringify({ text }),
  });
  const spec = await ex.json().catch(() => ({}));
  if (!spec?.isMeeting || !spec?.start) return NextResponse.json({ created: false });

  const start = spec.start as string;
  const end = (spec.end as string) || new Date(Date.parse(start) + 3_600_000).toISOString();
  const attendees: string[] = Array.isArray(spec.attendees) ? spec.attendees : [];
  const description = `${attendees.length ? `With: ${attendees.join(", ")}\n\n` : ""}Added by Neurus from a note.`;

  // No attendees array on purpose — never email people parsed from a private note. sendUpdates=none.
  const g = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ summary: spec.title || "Meeting", description, start: { dateTime: start }, end: { dateTime: end } }),
  });
  if (!g.ok) {
    const detail = await g.text().catch(() => "");
    return NextResponse.json({ created: false, error: `Google Calendar ${g.status}`, detail: detail.slice(0, 200) });
  }
  const ev = await g.json();
  return NextResponse.json({ created: true, summary: spec.title, start, link: ev.htmlLink });
}
