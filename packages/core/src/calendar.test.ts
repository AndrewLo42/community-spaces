import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventIcs, googleCalendarUrl, icsFilename, type CalendarEvent } from "./calendar";

const event: CalendarEvent = {
  id: "e1",
  title: "Night run; bring lights, please",
  description: "Meet at the gate.\nWe go at 6:30 sharp.",
  startsAt: new Date("2026-11-15T02:30:00Z"),
  endsAt: new Date("2026-11-15T04:30:00Z"),
  location: "Springwater trailhead, SE 45th",
  link: "",
  cancelled: false,
};
const options = { pageUrl: "https://example.com/e/e1", host: "example.com", now: new Date("2026-11-06T12:00:00Z") };

/** Undo line folding, the way a calendar reads the file. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("calendar file", () => {
  const ics = eventIcs(event, options);

  it("uses CRLF line endings, ending with one", () => {
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.ok(!/[^\r]\n/.test(ics));
  });

  it("writes UTC times and a stable id", () => {
    assert.match(ics, /\r\nDTSTART:20261115T023000Z\r\n/);
    assert.match(ics, /\r\nDTEND:20261115T043000Z\r\n/);
    assert.match(ics, /\r\nUID:e1@example\.com\r\n/);
    assert.match(ics, /\r\nDTSTAMP:20261106T120000Z\r\n/);
  });

  it("escapes text", () => {
    const text = unfold(ics);
    assert.match(text, /\r\nSUMMARY:Night run\; bring lights\\, please\r\n/);
    assert.match(text, /\r\nLOCATION:Springwater trailhead\\, SE 45th\r\n/);
    assert.match(text, /DESCRIPTION:https:\/\/example\.com\/e\/e1\\n\\nMeet at the gate\.\\nWe go at 6:30 sharp\./);
  });

  it("folds long lines at 75 bytes without splitting characters", () => {
    const long = eventIcs({ ...event, title: "Café ☕ ".repeat(30) }, options);
    for (const line of long.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
    assert.match(unfold(long), new RegExp(`SUMMARY:${"Café ☕ ".repeat(30)}\r\n`));
  });

  it("defaults the end, falls back to the link for online events, and marks cancellations", () => {
    const online = eventIcs({ ...event, endsAt: null, location: "", link: "https://meet.example/abc", cancelled: true }, options);
    assert.match(online, /\r\nDTEND:20261115T053000Z\r\n/);
    assert.match(unfold(online), /\r\nLOCATION:https:\/\/meet\.example\/abc\r\n/);
    assert.match(online, /\r\nSTATUS:CANCELLED\r\n/);
  });
});

describe("Google Calendar link", () => {
  it("fills in the event", () => {
    const url = new URL(googleCalendarUrl({ ...event, link: "https://meet.example/abc" }, options.pageUrl));
    assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
    assert.equal(url.searchParams.get("text"), event.title);
    assert.equal(url.searchParams.get("dates"), "20261115T023000Z/20261115T043000Z");
    assert.equal(url.searchParams.get("location"), event.location);
    // The link isn't the location here, so it goes in the details after the page.
    assert.ok(url.searchParams.get("details")!.startsWith("https://example.com/e/e1\n\nhttps://meet.example/abc\n\n"));
  });
});

describe("download name", () => {
  it("is a short, safe slug", () => {
    assert.equal(icsFilename("Night run on the Springwater trail!"), "night-run-on-the-springwater-trail.ics");
    assert.equal(icsFilename("Café crawl"), "cafe-crawl.ics");
    assert.equal(icsFilename("☕☕"), "event.ics");
  });
});
