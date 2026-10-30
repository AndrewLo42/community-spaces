import type { EventView } from "@cs/api";
import { eventDateBadge, formatEventWhen, RSVP_LABELS } from "@cs/core";
import Link from "next/link";
import { Card, cx } from "./ui";

/** A little calendar page: "NOV / 7", in the event's own time zone. */
export function EventDateBadge({
  event,
  size = "md",
  muted = false,
}: {
  event: { startsAt: Date; timeZone: string };
  size?: "sm" | "md";
  muted?: boolean;
}) {
  const { month, day } = eventDateBadge(event);
  return (
    <span
      aria-hidden
      className={cx(
        "flex shrink-0 flex-col items-center self-start rounded-lg border border-line bg-bg leading-none",
        size === "sm" ? "w-10 py-1" : "w-14 py-2",
      )}
    >
      <span className={cx("font-semibold tracking-wide", size === "sm" ? "text-[10px]" : "text-xs", muted ? "text-muted" : "text-accent")}>
        {month}
      </span>
      <span className={cx("mt-0.5 font-semibold", size === "sm" ? "text-base" : "text-2xl")}>{day}</span>
    </span>
  );
}

/** "12 going · 3 maybe · 4 spots left" */
export function attendanceSummary(event: Pick<EventView, "goingCount" | "maybeCount" | "spotsLeft" | "ended">) {
  const parts = [`${event.goingCount} ${event.ended ? "went" : "going"}`];
  if (event.maybeCount > 0 && !event.ended) parts.push(`${event.maybeCount} maybe`);
  if (event.spotsLeft !== null && !event.ended) parts.push(event.spotsLeft === 0 ? "Full" : `${event.spotsLeft} ${event.spotsLeft === 1 ? "spot" : "spots"} left`);
  return parts.join(" · ");
}

export function EventCard({ event }: { event: EventView }) {
  const dim = event.cancelled || event.ended;
  return (
    <Link href={`/e/${event.id}`} className="block">
      <Card className="flex gap-4 p-4 transition hover:border-muted">
        <EventDateBadge event={event} muted={dim} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cx("font-semibold", event.cancelled && "line-through decoration-muted")}>{event.title}</h3>
            {event.cancelled ? <Badge tone="danger">Cancelled</Badge> : null}
            {!event.cancelled && event.viewer.rsvp && event.viewer.rsvp !== "not_going" ? (
              <Badge tone="accent">{event.ended && event.viewer.rsvp === "going" ? "You went" : RSVP_LABELS[event.viewer.rsvp]}</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted">{formatEventWhen(event)}</p>
          {event.location ? <p className="truncate text-sm text-muted">{event.location}</p> : null}
          {!event.cancelled ? <p className="text-xs text-muted">{attendanceSummary(event)}</p> : null}
        </div>
      </Card>
    </Link>
  );
}

function Badge({ tone, children }: { tone: "accent" | "danger"; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "accent" ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger",
      )}
    >
      {children}
    </span>
  );
}
