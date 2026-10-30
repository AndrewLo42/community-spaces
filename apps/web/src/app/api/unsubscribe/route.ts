import { and, eq, memberships, users } from "@cs/db";
import { db } from "@/server/db";
import { verifyUnsubscribe } from "@/server/unsubscribe";

// POST only: mail clients prefetch links, so a GET must never change anything.
// Handles both the confirm button on /unsubscribe and one-click List-Unsubscribe.
export async function POST(req: Request) {
  const url = new URL(req.url);
  let userId = url.searchParams.get("u");
  let token = url.searchParams.get("t");
  let groupId = url.searchParams.get("g");
  if (!userId || !token) {
    const form = await req.formData().catch(() => null);
    userId = (form?.get("u") as string | null) ?? null;
    token = (form?.get("t") as string | null) ?? null;
    groupId = (form?.get("g") as string | null) || null;
  }

  if (!verifyUnsubscribe(userId, token, groupId)) return new Response("Invalid link", { status: 400 });
  if (groupId) {
    await db
      .update(memberships)
      .set({ announcementEmails: false })
      .where(and(eq(memberships.userId, userId!), eq(memberships.groupId, groupId)));
  } else {
    await db.update(users).set({ emailDigest: "off" }).where(eq(users.id, userId!));
  }

  // One-click requests carry the token in the URL; the confirm page posts it as form fields.
  if (url.searchParams.has("u")) return new Response(null, { status: 200 });
  return Response.redirect(new URL(`/unsubscribe?done=${groupId ? "announcements" : "digest"}`, url.origin), 303);
}
