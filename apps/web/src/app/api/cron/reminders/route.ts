import { dueReminders, sendReminder } from "@cs/api/reminders";
import { db } from "@/server/db";
import { sendReminderEmails } from "@/server/reminder-email";

// Runs once a day (apps/web/vercel.json). Each event is reminded once; moving
// it clears that, so the next run tells people the new time.

const BATCH = 20;
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
  let events = 0;
  let emails = 0;
  let failed = 0;

  while (Date.now() - started < TIME_BUDGET_MS) {
    const due = await dueReminders(db, now, BATCH);
    if (due.length === 0) break;

    for (const eventId of due) {
      try {
        const reminder = await sendReminder(db, eventId, now);
        if (!reminder) continue;
        events++;
        emails += await sendReminderEmails(reminder, baseUrl);
      } catch (error) {
        failed++;
        console.error(`reminder for event ${eventId} failed:`, error);
      }
    }
  }

  return Response.json({ events, emails, failed });
}
