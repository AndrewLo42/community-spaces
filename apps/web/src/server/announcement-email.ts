import { announcementEmail, type AnnouncementEmail } from "@cs/api/announcements";
import { messageSnippet } from "@cs/core";
import { db } from "./db";
import { sendEmail } from "./email";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "./unsubscribe";

export const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Absolute links need the public origin; in dev with BETTER_AUTH_URL blank, that's the local server. */
function baseUrl() {
  return (process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
}

function render(a: AnnouncementEmail, recipient: { id: string; name: string; guest: boolean }, base: string) {
  // Guests came for one event: a secret group's guests don't learn its name or who's in it.
  const secret = recipient.guest && a.groupVisibility === "hidden";
  const groupName = secret ? "a private group" : a.groupName;
  const where = a.eventTitle ? `${a.eventTitle} (${groupName})` : groupName;
  const href = `${base}${a.eventId ? `/e/${a.eventId}` : `/g/${a.groupSlug}`}`;
  const stop = unsubscribeUrl(base, { userId: recipient.id, groupId: a.groupId });
  const from = a.authorName && !secret ? `${a.authorName} in ${where}` : `The organizer of ${where}`;
  const subject = `${a.eventTitle ? `Update: ${a.eventTitle}` : groupName} · ${messageSnippet(a.body, 60)}`;

  const text = [
    `${from}:`,
    "",
    a.body,
    "",
    `Open it: ${href}`,
    "",
    recipient.guest ? `You're getting this because you RSVP'd. To stop, change your RSVP to "Can't go": ${href}` : `Stop announcement and reminder emails from ${a.groupName}: ${stop}`,
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1f2421;line-height:1.5">`,
    `<p style="color:#646b66;font-size:14px">${escape(from)}</p>`,
    `<div style="border-left:3px solid #2f6f5e;padding:4px 0 4px 14px;white-space:pre-line">${escape(a.body)}</div>`,
    `<p><a href="${href}" style="color:#2f6f5e">Open in Community Spaces</a></p>`,
    recipient.guest
      ? `<p style="color:#646b66;font-size:12px;margin-top:32px">You're getting this because you RSVP'd to ${escape(a.eventTitle ?? "this event")}. To stop, <a href="${href}" style="color:#646b66">change your RSVP to “Can't go”</a>.</p>`
      : `<p style="color:#646b66;font-size:12px;margin-top:32px">You're getting this because you're ${
          a.eventTitle ? `going to ${escape(a.eventTitle)}` : `a member of ${escape(a.groupName)}`
        }. <a href="${stop}" style="color:#646b66">Stop announcement and reminder emails from ${escape(a.groupName)}</a>.</p>`,
    `</div>`,
  ].join("");

  return { subject, text, html };
}

/** Emails an announcement to everyone in its audience who still wants them. One failed address doesn't stop the rest. */
export async function sendAnnouncementEmails(announcementId: string) {
  const announcement = await announcementEmail(db, announcementId);
  if (!announcement) return;
  const base = baseUrl();
  for (const recipient of announcement.recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        ...render(announcement, recipient, base),
        // Guests have no email setting to turn off; their footer says how to stop instead.
        headers: recipient.guest
          ? undefined
          : {
              "List-Unsubscribe": `<${oneClickUnsubscribeUrl(base, { userId: recipient.id, groupId: announcement.groupId })}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
      });
    } catch (error) {
      console.error(`announcement ${announcementId} to ${recipient.id} failed:`, error);
    }
  }
}
