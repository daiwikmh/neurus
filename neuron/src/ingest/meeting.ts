import { z } from "zod";
import { chatJSON } from "../llm/nvidia";

const MeetingSchema = z.object({
  isMeeting: z.boolean(),
  title: z.string().nullish(),
  start: z.string().nullish(),
  end: z.string().nullish(),
  attendees: z.array(z.string()).nullish(),
});

export type MeetingSpec = z.infer<typeof MeetingSchema>;

const SYSTEM = `You extract a calendar meeting from a note — ONLY if the note describes a meeting or event with a SPECIFIC, resolvable date/time.
Return JSON { isMeeting, title, start, end, attendees }:
- isMeeting: true only when there is a real meeting AND a concrete date/time you can resolve. Otherwise false.
- start, end: ISO 8601 WITH timezone offset, resolved against the provided "Now". If only a start is given, set end to one hour later. If a day but no time, assume 09:00 local.
- title: short event title. attendees: names/emails explicitly mentioned, never invented.
If the note is vague about timing ("soon", "next week" with no day), set isMeeting=false and leave the rest empty/null.`;

export async function extractMeeting(text: string, now = new Date()): Promise<MeetingSpec> {
  const user = `Now: ${now.toString()}\n\nNote: ${text}`;
  return chatJSON(SYSTEM, user, MeetingSchema);
}
