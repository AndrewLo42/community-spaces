import { buildDigest, dueDigestUsers, markDigestSent } from "@cs/api/digest";
import { db } from "@/server/db";
import { renderDigestEmail } from "@/server/digest-email";
import { sendEmail } from "@/server/email";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "@/server/unsubscribe";

// Runs once a day (apps/web/vercel.json). Daily and weekly users are both
// handled here; each user's own lastDigestAt decides whether they're due.

const BATCH = 50;
const TIME_BUDGET_MS = 45_000; // stay inside the serverless function limit

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Vercel Cron sends this header automatically when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const baseUrl = (process.env.BETTER_AUTH_URL || new URL(req.url).origin).replace(/\/$/, "");
  const started = Date.now();
  const now = new Date();
  let checked = 0;
  let sent = 0;
  let failed = 0;

  while (Date.now() - started < TIME_BUDGET_MS) {
    const due = await dueDigestUsers(db, now, BATCH);
    if (due.length === 0) break;

    for (const user of due) {
      checked++;
      try {
        const digest = await buildDigest(db, user, now);
        if (digest) {
          const email = renderDigestEmail(digest, user, baseUrl, unsubscribeUrl(baseUrl, user.id));
          await sendEmail({
            to: user.email,
            ...email,
            // One-click unsubscribe (RFC 8058), which Gmail and Yahoo expect from bulk senders.
            headers: {
              "List-Unsubscribe": `<${oneClickUnsubscribeUrl(baseUrl, user.id)}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });
          sent++;
        }
      } catch (error) {
        failed++;
        console.error(`digest for ${user.id} failed:`, error);
      }
      // Close the window either way, so a failing address isn't retried every run
      // and "nothing new" users aren't re-checked until their next period.
      await markDigestSent(db, user.id, now);
    }
  }

  return Response.json({ checked, sent, failed });
}
