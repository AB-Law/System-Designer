import type { StreamEvent } from "./types";

/** Pull the complete events out of a buffer of server-sent text. Returns them and whatever is left (a partial event, kept for the next chunk). */
export function parseSse(buffer: string): { events: StreamEvent[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events: StreamEvent[] = [];
  for (const frame of frames) {
    const line = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue; // a comment such as ": open"
    try {
      events.push(JSON.parse(line.slice(6)) as StreamEvent);
    } catch {
      /* a malformed frame is skipped rather than ending the interview */
    }
  }
  return { events, rest };
}
