import type { EventReminder } from "@cs/api/reminders";
import { escape } from "./announcement-email";
import { sendEmail } from "./email";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "./unsubscribe";

function render(r: EventReminder, recipient: { id: string }, base: string) {
  const href = `${base}/e/${r.eventId}`;
  const stop = unsubscribeUrl(base, { userId: recipient.id, groupId: r.groupId });
  const details = [r.when, r.location].filter(Boolean);

  const text = [
    `${r.title} is coming up (${r.groupName}).`,
    "",
    ...details,
    "",
    `Details, or change your RSVP: ${href}`,
    "",
    `Stop announcement and reminder emails from ${r.groupName}: ${stop}`,
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1f2421;line-height:1.5">`,
    `<p style="color:#646b66;font-size:14px">Coming up in ${escape(r.groupName)}</p>`,
    `<div style="border-left:3px solid #2f6f5e;padding:4px 0 4px 14px">`,
    `<strong>${escape(r.title)}</strong>`,
    ...details.map((d) => `<br>${escape(d)}`),
    `</div>`,
    `<p><a href="${href}" style="color:#2f6f5e">Details, or change your RSVP</a></p>`,
    `<p style="color:#646b66;font-size:12px;margin-top:32px">You're getting this because you said you might come. <a href="${stop}" style="color:#646b66">Stop announcement and reminder emails from ${escape(r.groupName)}</a>.</p>`,
    `</div>`,
  ].join("");

  return { subject: `Reminder: ${r.title} · ${r.when}`, text, html };
}

/** Emails everyone coming who still wants them. One failed address doesn't stop the rest. */
export async function sendReminderEmails(reminder: EventReminder, base: string) {
  let sent = 0;
  for (const recipient of reminder.recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        ...render(reminder, recipient, base),
        headers: {
          "List-Unsubscribe": `<${oneClickUnsubscribeUrl(base, { userId: recipient.id, groupId: reminder.groupId })}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      sent++;
    } catch (error) {
      console.error(`reminder for ${reminder.eventId} to ${recipient.id} failed:`, error);
    }
  }
  return sent;
}
