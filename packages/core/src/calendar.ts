import { eventEnd } from "./events";

// "Add to calendar": an .ics file (Apple Calendar, Outlook, and most others
// open it) and a Google Calendar link. Both use UTC instants, which every
// calendar converts to the reader's own zone, so nothing depends on the
// calendar knowing the event's IANA zone.

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  link: string;
  cancelled: boolean;
}

/** 2026-11-14T02:30:00.000Z → 20261114T023000Z */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 text values escape backslashes, commas, semicolons and newlines. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 bytes continue on the next line after a space, without splitting a character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75.
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Where to go: a place, or failing that the online link. */
function where(event: CalendarEvent) {
  return event.location || event.link;
}

/** The event's own page first, so people can get back to it and change their RSVP. */
function details(event: CalendarEvent, pageUrl: string) {
  return [pageUrl, event.link && event.link !== where(event) ? event.link : "", event.description].filter(Boolean).join("\n\n");
}

/**
 * A one-event calendar file. The UID stays the same for an event, so calendars
 * that support it update their copy instead of adding a second one.
 */
export function eventIcs(event: CalendarEvent, options: { pageUrl: string; host: string; now?: Date }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Community Spaces//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@${options.host}`,
    `DTSTAMP:${utcStamp(options.now ?? new Date())}`,
    `DTSTART:${utcStamp(event.startsAt)}`,
    `DTEND:${utcStamp(eventEnd(event))}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(details(event, options.pageUrl))}`,
    ...(where(event) ? [`LOCATION:${escapeText(where(event))}`] : []),
    `URL:${options.pageUrl}`,
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // The format requires CRLF line endings, including after the last line.
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Opens Google Calendar's "new event" form, filled in. */
export function googleCalendarUrl(event: CalendarEvent, pageUrl: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.startsAt)}/${utcStamp(eventEnd(event))}`,
    details: details(event, pageUrl),
  });
  if (where(event)) params.set("location", where(event));
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** A safe download name: "Night run on the Springwater trail.ics" → "night-run-on-the-springwater-trail.ics" */
export function icsFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "event"}.ics`;
}
