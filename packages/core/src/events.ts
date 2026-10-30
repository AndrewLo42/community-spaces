// Event times. An event happens somewhere, so its times are stored as instants
// plus the IANA time zone it was planned in, and always shown in that zone:
// "7:00 PM PDT" means the same thing to every member, wherever their browser is.

/** Events without an end time count as over this long after they start. */
export const DEFAULT_EVENT_LENGTH_MS = 3 * 3_600_000;

export const MAX_EVENT_CAPACITY = 10_000;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** When an event stops being upcoming. */
export function eventEnd(event: { startsAt: Date; endsAt: Date | null }): Date {
  return event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_EVENT_LENGTH_MS);
}

/** How far `timeZone` is ahead of UTC at a given instant, in ms (negative in the US). */
function zoneOffset(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utcMs)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The instant a wall-clock time happens in a zone: ("2026-11-07", "09:30",
 * "America/Los_Angeles") → 17:30 UTC. Returns null for malformed input.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t || !isValidTimeZone(timeZone)) return null;
  const wall = Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!, +t[1]!, +t[2]!);
  // Guess with the offset at the wall time, then correct once for a DST change in between.
  let utc = wall - zoneOffset(wall, timeZone);
  utc = wall - zoneOffset(utc, timeZone);
  return new Date(utc);
}

/** The reverse, for filling a form: an instant → { date: "2026-11-07", time: "09:30" } in that zone. */
export function utcToZonedTime(instant: Date, timeZone: string): { date: string; time: string } {
  const local = new Date(instant.getTime() + zoneOffset(instant.getTime(), timeZone));
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * "Sat, Nov 7 · 9:30 – 11:00 AM PST", or across days
 * "Sat, Nov 7, 9:30 PM – Sun, Nov 8, 1:00 AM PST". The year shows when it isn't this year.
 */
export function formatEventWhen(
  event: { startsAt: Date; endsAt: Date | null; timeZone: string },
  now = new Date(),
): string {
  const { startsAt, endsAt, timeZone } = event;
  const year = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(d);
  const showYear = year(startsAt) !== year(now);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(startsAt)
      .find((p) => p.type === "timeZoneName")?.value ?? "";

  let text: string;
  if (!endsAt) text = `${day.format(startsAt)} · ${time.format(startsAt)} ${zone}`;
  else if (day.format(startsAt) === day.format(endsAt)) {
    text = `${day.format(startsAt)} · ${time.formatRange(startsAt, endsAt)} ${zone}`;
  } else {
    text = `${day.format(startsAt)}, ${time.format(startsAt)} – ${day.format(endsAt)}, ${time.format(endsAt)} ${zone}`;
  }
  // Intl uses thin and narrow no-break spaces around "–" and before "AM"; keep plain ones.
  return text.replace(/[\u2009\u202f]/g, " ");
}

/** The calendar-page badge on event cards: { month: "NOV", day: "7" } in the event's zone. */
export function eventDateBadge(event: { startsAt: Date; timeZone: string }): { month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: event.timeZone, month: "short", day: "numeric" }).formatToParts(
    event.startsAt,
  );
  return {
    month: (parts.find((p) => p.type === "month")?.value ?? "").toUpperCase(),
    day: parts.find((p) => p.type === "day")?.value ?? "",
  };
}
