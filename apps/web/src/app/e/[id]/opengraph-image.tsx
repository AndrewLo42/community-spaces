import { eventDateBadge, formatEventWhen } from "@cs/core";
import { ImageResponse } from "next/og";
import { loadEvent } from "./load-event";

// The card shown when an event link is pasted into a chat or a post. It goes
// through the same access check as the page, so link-preview bots (which are
// signed out) only ever get an image for events in public groups.
export const alt = "Event details";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const event = await loadEvent((await params).id);
  const { month, day } = eventDateBadge(event);
  const accent = event.group.accentColor;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#f6f5f1", color: "#1f2421", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", width: 24, height: "100%", background: accent }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "64px 72px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 160,
                padding: "20px 0",
                borderRadius: 24,
                border: "3px solid #dcd9d0",
                background: "#ffffff",
              }}
            >
              <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 2, color: accent }}>{month}</div>
              <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1 }}>{day}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 20 }}>
              <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, textDecoration: event.cancelled ? "line-through" : "none" }}>
                {clip(event.title, 70)}
              </div>
              <div style={{ fontSize: 34, color: "#646b66" }}>{event.cancelled ? "Cancelled" : formatEventWhen(event)}</div>
              {event.location ? <div style={{ fontSize: 34, color: "#646b66" }}>{clip(event.location, 60)}</div> : null}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 30 }}>
            <div style={{ display: "flex", fontWeight: 600 }}>{clip(event.group.name, 50)}</div>
            <div style={{ display: "flex", color: "#646b66" }}>
              {event.goingCount > 0 ? `${event.goingCount} going · ` : ""}Community Spaces
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
