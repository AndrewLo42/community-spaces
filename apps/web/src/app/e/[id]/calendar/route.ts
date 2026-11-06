import { eventIcs, googleCalendarUrl, icsFilename } from "@cs/core";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/server/api";

/**
 * The event as a calendar file, or with ?to=google a redirect to Google
 * Calendar's form. Goes through the same access check as the event page, so
 * events in private groups stay private.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let event;
  try {
    event = await (await serverApi()).event.byId({ eventId: id });
  } catch (e) {
    if (e instanceof TRPCError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) return new Response("Not found", { status: 404 });
    throw e;
  }

  const url = new URL(req.url);
  const base = (process.env.BETTER_AUTH_URL || url.origin).replace(/\/$/, "");
  const pageUrl = `${base}/e/${event.id}`;

  if (url.searchParams.get("to") === "google") return Response.redirect(googleCalendarUrl(event, pageUrl), 302);

  return new Response(eventIcs(event, { pageUrl, host: new URL(base).hostname }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFilename(event.title)}"`,
      // Events in private groups shouldn't sit in shared caches.
      "Cache-Control": "private, no-store",
    },
  });
}
