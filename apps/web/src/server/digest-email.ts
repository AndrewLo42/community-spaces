import type { Digest, DigestUser } from "@cs/api/digest";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain, calm email: what's addressed to you, then what's new in your groups. */
export function renderDigestEmail(digest: Digest, user: DigestUser, baseUrl: string, unsubscribeUrl: string) {
  const period = user.emailDigest === "daily" ? "today" : "this week";
  const subject =
    digest.notifications.length > 0
      ? `${digest.notifications[0]!.text}${digest.notifications.length > 1 ? ` and more` : ""}`
      : `What's new in your groups ${period}`;

  const text: string[] = [`Hi ${user.name || "there"}, here's what happened ${period}.`, ""];
  const html: string[] = [
    `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1f2421;line-height:1.5">`,
    `<p>Hi ${escape(user.name || "there")}, here's what happened ${period}.</p>`,
  ];

  if (digest.notifications.length > 0) {
    text.push("FOR YOU");
    html.push(`<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#646b66">For you</h2><ul>`);
    for (const n of digest.notifications) {
      text.push(`- ${n.text}: ${baseUrl}${n.href}`);
      html.push(`<li><a href="${baseUrl}${n.href}" style="color:#2f6f5e">${escape(n.text)}</a></li>`);
    }
    if (digest.moreNotifications > 0) {
      text.push(`- and ${digest.moreNotifications} more: ${baseUrl}/notifications`);
      html.push(`<li><a href="${baseUrl}/notifications" style="color:#2f6f5e">and ${digest.moreNotifications} more</a></li>`);
    }
    text.push("");
    html.push(`</ul>`);
  }

  for (const g of digest.groups) {
    const heading = `${g.name}: ${g.newPosts} new ${g.newPosts === 1 ? "post" : "posts"}`;
    text.push(heading.toUpperCase());
    html.push(
      `<h2 style="font-size:16px;margin-top:24px"><a href="${baseUrl}/g/${g.slug}" style="color:#1f2421">${escape(g.name)}</a> <span style="color:#646b66;font-weight:normal">· ${g.newPosts} new</span></h2>`,
    );
    for (const p of g.highlights) {
      text.push(`- ${p.author}: ${p.snippet} (${baseUrl}/p/${p.id})`);
      html.push(
        `<p style="margin:8px 0;padding:8px 12px;border-left:3px solid #e1ded6"><strong>${escape(p.author)}</strong><br>${escape(p.snippet)} <a href="${baseUrl}/p/${p.id}" style="color:#2f6f5e">Read</a></p>`,
      );
    }
    text.push("");
  }

  const footer = `You get this ${user.emailDigest} summary from Community Spaces. Change how often on your profile (${baseUrl}/profile) or unsubscribe: ${unsubscribeUrl}`;
  text.push("--", footer);
  html.push(
    `<p style="margin-top:32px;font-size:12px;color:#646b66">You get this ${user.emailDigest} summary from Community Spaces. <a href="${baseUrl}/profile" style="color:#646b66">Change how often</a> · <a href="${unsubscribeUrl}" style="color:#646b66">Unsubscribe</a></p></div>`,
  );

  return { subject, text: text.join("\n"), html: html.join("\n") };
}
