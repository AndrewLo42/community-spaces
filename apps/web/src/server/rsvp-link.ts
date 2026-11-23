import { createHmac, timingSafeEqual } from "node:crypto";

// An RSVP that rides along a sign-in link. Someone outside the app types their
// name and email on an event page; we email them a magic link whose callback is
// /e/[id]/rsvp?…&t=token. The token ties the answer to that email address, so
// the callback only saves it for the person who just signed in as that address.

export type GuestRsvpStatus = "going" | "maybe";

interface RsvpIntent {
  eventId: string;
  status: GuestRsvpStatus;
  share: string;
  email: string;
}

function sign({ eventId, status, share, email }: RsvpIntent): string {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(`event-rsvp:${eventId}:${status}:${share}:${email.trim().toLowerCase()}`)
    .digest("base64url");
}

/** The callback path for the magic link. */
export function rsvpCallbackPath(intent: RsvpIntent): string {
  const params = new URLSearchParams({ status: intent.status, t: sign(intent) });
  if (intent.share) params.set("s", intent.share);
  return `/e/${intent.eventId}/rsvp?${params}`;
}

export function verifyRsvpToken(intent: RsvpIntent, token: string | null): boolean {
  if (!token) return false;
  const expected = Buffer.from(sign(intent));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Magic links last 5 minutes; a sign-in older than this didn't come from one just now. */
export const FRESH_SIGN_IN_MS = 10 * 60_000;
