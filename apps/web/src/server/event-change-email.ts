import type { EventChangeEmail } from "@cs/api/event-changes";
import { escape } from "./announcement-email";
import { sendEmail } from "./email";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "./unsubscribe";

function baseUrl() {
  return (process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
}

function render(c: EventChangeEmail, recipient: { id: string; guest: boolean }, base: string) {
  const href = `${base}/e/${c.eventId}`;
  const stop = unsubscribeUrl(base, { userId: recipient.id, groupId: c.groupId });
  // Guests of a secret group's event don't learn the group's name.
  const groupName = recipient.guest && c.groupVisibility === "hidden" ? "a private group" : c.groupName;
  const cancelled = c.change.kind === "cancelled";
  const changed = c.change.kind === "changed" ? c.change.changed : null;

  const subject = cancelled
    ? `Cancelled: ${c.title}`
    : changed === "time"
      ? `New time: ${c.title} · ${c.when}`
      : changed === "place"
        ? `New place: ${c.title}`
        : `Changed: ${c.title} · ${c.when}`;
  const lead = cancelled
    ? `${c.title} (${groupName}) was cancelled. It was planned for ${c.when}.`
    : `${c.title} (${groupName}) has a new ${changed === "time" ? "time" : changed === "place" ? "place" : "time and place"}.`;
  const details = cancelled ? [] : [c.when, c.location, c.link].filter(Boolean);
  const footerText = recipient.guest
    ? `You're getting this because you RSVP'd.${cancelled ? "" : ` To stop, change your RSVP to "Can't go": ${href}`}`
    : `Stop announcement and reminder emails from ${c.groupName}: ${stop}`;

  const text = [lead, "", ...details, ...(details.length ? [""] : []), `${cancelled ? "Details" : "Details, or change your RSVP"}: ${href}`, "", footerText].join("\n");

  const html = [
    `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1f2421;line-height:1.5">`,
    `<p>${escape(lead)}</p>`,
    details.length
      ? `<div style="border-left:3px solid #2f6f5e;padding:4px 0 4px 14px"><strong>${escape(c.title)}</strong>${details.map((d) => `<br>${escape(d)}`).join("")}</div>`
      : "",
    `<p><a href="${href}" style="color:#2f6f5e">${cancelled ? "See the event" : "Details, or change your RSVP"}</a></p>`,
    recipient.guest
      ? `<p style="color:#646b66;font-size:12px;margin-top:32px">You're getting this because you RSVP'd.${
          cancelled ? "" : ` To stop, <a href="${href}" style="color:#646b66">change your RSVP to “Can't go”</a>.`
        }</p>`
      : `<p style="color:#646b66;font-size:12px;margin-top:32px">You're getting this because you said you'd come. <a href="${stop}" style="color:#646b66">Stop announcement and reminder emails from ${escape(c.groupName)}</a>.</p>`,
    `</div>`,
  ].join("");

  return { subject, text, html };
}

/** Emails everyone coming who still wants event emails. One failed address doesn't stop the rest. */
export async function sendEventChangeEmails(change: EventChangeEmail) {
  const base = baseUrl();
  for (const recipient of change.recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        ...render(change, recipient, base),
        headers: recipient.guest
          ? undefined
          : {
              "List-Unsubscribe": `<${oneClickUnsubscribeUrl(base, { userId: recipient.id, groupId: change.groupId })}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
      });
    } catch (error) {
      console.error(`event ${change.eventId} change email to ${recipient.id} failed:`, error);
    }
  }
}
