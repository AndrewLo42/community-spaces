import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventDateBadge, eventEnd, formatEventWhen, utcToZonedTime, zonedTimeToUtc } from "./events";

const LA = "America/Los_Angeles";
const now = new Date("2026-10-30T12:00:00Z");

describe("event times", () => {
  it("turns a wall-clock time in a zone into the right instant, across DST", () => {
    // PDT (UTC-7) before Nov 1 2026, PST (UTC-8) after.
    assert.equal(zonedTimeToUtc("2026-10-31", "09:30", LA)?.toISOString(), "2026-10-31T16:30:00.000Z");
    assert.equal(zonedTimeToUtc("2026-11-07", "09:30", LA)?.toISOString(), "2026-11-07T17:30:00.000Z");
    assert.equal(zonedTimeToUtc("2026-11-07", "09:30", "America/New_York")?.toISOString(), "2026-11-07T14:30:00.000Z");
    assert.equal(zonedTimeToUtc("2026-11-07", "9:30", LA), null);
    assert.equal(zonedTimeToUtc("2026-11-07", "09:30", "Mars/Olympus"), null);
  });

  it("round-trips back to the form's date and time", () => {
    for (const [date, time] of [["2026-10-31", "23:45"], ["2026-11-07", "00:15"], ["2027-03-14", "12:00"]] as const) {
      assert.deepEqual(utcToZonedTime(zonedTimeToUtc(date, time, LA)!, LA), { date, time });
    }
  });

  it("formats in the event's zone", () => {
    const startsAt = zonedTimeToUtc("2026-11-07", "09:30", LA)!;
    const endsAt = zonedTimeToUtc("2026-11-07", "11:00", LA)!;
    assert.equal(formatEventWhen({ startsAt, endsAt, timeZone: LA }, now), "Sat, Nov 7 · 9:30 – 11:00 AM PST");
    assert.equal(formatEventWhen({ startsAt, endsAt: null, timeZone: LA }, now), "Sat, Nov 7 · 9:30 AM PST");
    const late = zonedTimeToUtc("2026-11-08", "01:00", LA)!;
    const evening = zonedTimeToUtc("2026-11-07", "21:30", LA)!;
    assert.equal(
      formatEventWhen({ startsAt: evening, endsAt: late, timeZone: LA }, now),
      "Sat, Nov 7, 9:30 PM – Sun, Nov 8, 1:00 AM PST",
    );
    const nextYear = zonedTimeToUtc("2027-01-09", "10:00", LA)!;
    assert.equal(formatEventWhen({ startsAt: nextYear, endsAt: null, timeZone: LA }, now), "Sat, Jan 9, 2027 · 10:00 AM PST");
    // Late evening in LA is already the next day in UTC; the badge stays local.
    assert.deepEqual(eventDateBadge({ startsAt: evening, timeZone: LA }), { month: "NOV", day: "7" });
  });

  it("events without an end are over three hours after they start", () => {
    const startsAt = new Date("2026-11-07T17:00:00Z");
    assert.equal(eventEnd({ startsAt, endsAt: null }).toISOString(), "2026-11-07T20:00:00.000Z");
  });
});
