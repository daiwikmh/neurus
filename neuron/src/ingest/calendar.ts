import { createNeuron, type Neuron } from "../core/neuron";
import type { Memory } from "../core/memory";

export interface CalEvent {
  id: string;
  summary: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
  attendees?: string[];
  link?: string;
}

function describe(e: CalEvent): string {
  const when = e.start ? new Date(e.start).toLocaleString() : "unscheduled";
  const lines = [`${e.summary} — ${when}`];
  if (e.location) lines.push(`Location: ${e.location}`);
  if (e.attendees?.length) lines.push(`With: ${e.attendees.join(", ")}`);
  if (e.description) lines.push(e.description.replace(/\s+/g, " ").trim().slice(0, 400));
  return lines.join("\n");
}

function eventToNeuron(e: CalEvent): Neuron {
  return createNeuron({
    type: "note",
    title: e.summary,
    body: describe(e),
    validFrom: e.start ? Date.parse(e.start) || undefined : undefined,
    meta: { kind: "calendar_event", eventId: e.id, start: e.start, end: e.end, attendees: e.attendees, location: e.location, link: e.link, source: "google_calendar" },
  });
}

export async function ingestCalendarEvents(mem: Memory, events: CalEvent[]): Promise<{ added: number; skipped: number }> {
  await mem.ready();
  const existing = new Set(mem.all().map((n) => n.meta?.eventId).filter(Boolean) as string[]);
  let added = 0;
  let skipped = 0;
  for (const e of events) {
    if (!e.id || existing.has(e.id)) { skipped++; continue; }
    await mem.remember(eventToNeuron(e));
    existing.add(e.id);
    added++;
  }
  return { added, skipped };
}
