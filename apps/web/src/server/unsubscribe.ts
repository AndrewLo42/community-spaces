import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, login-free unsubscribe links. The token proves the link came from us
// for this user (and group); it does nothing except turn that one kind of
// email off: summary digests, or one group's announcement emails.

export interface UnsubscribeTarget {
  userId: string;
  /** Set for a group's announcement emails; absent for digests. */
  groupId?: string;
}

function sign({ userId, groupId }: UnsubscribeTarget): string {
  const scope = groupId ? `announcements-off:${userId}:${groupId}` : `digest-off:${userId}`;
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(scope).digest("base64url");
}

function query(target: UnsubscribeTarget): string {
  const params = new URLSearchParams({ u: target.userId, t: sign(target) });
  if (target.groupId) params.set("g", target.groupId);
  return params.toString();
}

/** The page with a confirm button, for the link in the email body. */
export function unsubscribeUrl(baseUrl: string, target: UnsubscribeTarget | string): string {
  return `${baseUrl}/unsubscribe?${query(typeof target === "string" ? { userId: target } : target)}`;
}

/** The endpoint mail clients POST to for one-click unsubscribe (List-Unsubscribe header). */
export function oneClickUnsubscribeUrl(baseUrl: string, target: UnsubscribeTarget | string): string {
  return `${baseUrl}/api/unsubscribe?${query(typeof target === "string" ? { userId: target } : target)}`;
}

export function verifyUnsubscribe(userId: string | null, token: string | null, groupId?: string | null): boolean {
  if (!userId || !token) return false;
  const expected = Buffer.from(sign({ userId, groupId: groupId ?? undefined }));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
