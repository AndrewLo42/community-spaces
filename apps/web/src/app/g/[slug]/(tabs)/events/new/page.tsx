import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EventForm } from "@/components/event-form";
import { Card } from "@/components/ui";
import { getSessionUser } from "@/server/auth";
import { loadGroup } from "../../../load-group";

export const metadata: Metadata = { title: "Plan an event" };

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getSessionUser())) redirect(`/sign-in?next=${encodeURIComponent(`/g/${slug}/events/new`)}`);
  const { group, permissions } = await loadGroup(slug);
  if (!permissions.createEvent) redirect(`/g/${group.slug}/events`);

  return (
    <Card className="mx-auto max-w-2xl p-5 sm:p-6">
      <h2 className="mb-5 font-serif text-2xl font-semibold">Plan an event</h2>
      <EventForm mode="create" groupId={group.id} cancelHref={`/g/${group.slug}/events`} />
    </Card>
  );
}
