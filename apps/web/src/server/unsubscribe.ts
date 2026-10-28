import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, login-free unsubscribe links for digest emails. The token proves the
// link came from us for this user; it does nothing except turn digests off.

function sign(userId: string): string {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(`digest-off:${userId}`).digest("base64url");
}

/** The page with a confirm button, for the link in the email body. */
export function unsubscribeUrl(baseUrl: string, userId: string): string {
  return `${baseUrl}/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
}

/** The endpoint mail clients POST to for one-click unsubscribe (List-Unsubscribe header). */
export function oneClickUnsubscribeUrl(baseUrl: string, userId: string): string {
  return `${baseUrl}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
}

export function verifyUnsubscribe(userId: string | null, token: string | null): boolean {
  if (!userId || !token) return false;
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
