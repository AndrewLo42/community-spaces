import { utcToZonedTime } from "@cs/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EventForm } from "@/components/event-form";
import { Card } from "@/components/ui";
import { loadEvent } from "../load-event";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await loadEvent(id);
  if (!event.viewer.canManage) redirect(`/e/${id}`);

  const start = utcToZonedTime(event.startsAt, event.timeZone);
  const end = event.endsAt ? utcToZonedTime(event.endsAt, event.timeZone) : null;

  return (
    <Card className="mx-auto max-w-2xl p-5 sm:p-6">
      <h1 className="mb-5 font-serif text-2xl font-semibold">Edit event</h1>
      <EventForm
        mode="edit"
        eventId={event.id}
        timeZone={event.timeZone}
        cancelHref={`/e/${event.id}`}
        initial={{
          title: event.title,
          description: event.description,
          date: start.date,
          startTime: start.time,
          endTime: end?.time ?? "",
          location: event.location,
          link: event.link,
          capacity: event.capacity === null ? "" : String(event.capacity),
        }}
      />
    </Card>
  );
}
