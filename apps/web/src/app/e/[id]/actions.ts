"use server";

import { z } from "zod";
import { serverApi } from "@/server/api";
import { rsvpCallbackPath } from "@/server/rsvp-link";

const input = z.object({
  eventId: z.string().min(1),
  share: z.string().max(64).default(""),
  email: z.string().trim().email().max(320),
  status: z.enum(["going", "maybe"]),
});

/**
 * Where the guest's sign-in link should land to save their RSVP. Checks that
 * this visitor can see the event and that it's still taking answers, so we
 * don't send email for events nobody can come to.
 */
export async function guestRsvpCallback(raw: z.input<typeof input>): Promise<{ callbackURL: string } | { error: string }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "Enter a valid email address" };
  const { eventId, share, email, status } = parsed.data;
  let event;
  try {
    event = await (await serverApi()).event.byId({ eventId, share: share || undefined });
  } catch {
    return { error: "This event isn't available" };
  }
  if (event.cancelled) return { error: "This event was cancelled" };
  if (event.ended) return { error: "This event is over" };
  if (status === "going" && event.spotsLeft === 0) return { error: "This event is full" };
  return { callbackURL: rsvpCallbackPath({ eventId, status, share, email }) };
}
