import { TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { serverApi } from "@/server/api";
import { auth } from "@/server/auth";
import { FRESH_SIGN_IN_MS, verifyRsvpToken, type GuestRsvpStatus } from "@/server/rsvp-link";

/**
 * Where a guest's sign-in link lands. Saves the RSVP they asked for, but only
 * for the address the link was made for, and only right after signing in, so a
 * copied link can't make someone else RSVP. Either way it ends on the event page.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const share = url.searchParams.get("s") ?? "";
  const statusParam = url.searchParams.get("status");
  const status: GuestRsvpStatus | null = statusParam === "going" || statusParam === "maybe" ? statusParam : null;

  const back = new URLSearchParams();
  if (share) back.set("s", share);
  const done = (result?: string) => {
    if (result) back.set("rsvp", result);
    const q = back.toString();
    return NextResponse.redirect(new URL(`/e/${id}${q ? `?${q}` : ""}`, url.origin));
  };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !status) return done();
  const fresh = Date.now() - new Date(session.session.createdAt).getTime() < FRESH_SIGN_IN_MS;
  const valid = verifyRsvpToken({ eventId: id, status, share, email: session.user.email }, url.searchParams.get("t"));
  if (!fresh || !valid) return done();

  try {
    await (await serverApi()).event.rsvp({ eventId: id, status, share: share || undefined });
    return done(status);
  } catch (e) {
    if (e instanceof TRPCError) return done(e.code === "CONFLICT" ? "full" : "failed");
    throw e;
  }
}
