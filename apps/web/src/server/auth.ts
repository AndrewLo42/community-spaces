import * as schema from "@cs/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { headers } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import { sendEmail } from "./email";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  rateLimit: {
    // On in production only (Better Auth's default). Shared storage, because
    // each serverless instance would otherwise count separately.
    storage: "database",
    customRules: {
      // Each request sends an email to any address typed in: keep that from
      // being used to spam people or burn the sending quota.
      "/sign-in/magic-link": { window: 15 * 60, max: 5 },
    },
  },
  user: {
    additionalFields: {
      bio: { type: "string", required: false, defaultValue: "", input: false },
    },
  },
  plugins: [
    magicLink({
      async sendMagicLink({ email, url }) {
        // Guests RSVPing from an event page get a link that confirms their answer (see rsvp-link.ts).
        const callback = new URL(url).searchParams.get("callbackURL") ?? "";
        const rsvp = /^\/e\/[^/]+\/rsvp\?/.test(callback);
        const action = rsvp ? "Confirm your RSVP" : "Sign in to Community Spaces";
        await sendEmail({
          to: email,
          subject: rsvp ? "Confirm your RSVP" : "Your Community Spaces sign-in link",
          text: `${action}: ${url}\n\nThis link expires in 5 minutes.${rsvp ? " It also signs you in to Community Spaces." : ""}`,
          html: `<p><a href="${url}">${action}</a></p><p>This link expires in 5 minutes.${rsvp ? " It also signs you in to Community Spaces." : ""}</p>`,
        });
      },
    }),
    nextCookies(), // must stay last
  ],
});

/** The signed-in user for this request, or null. Deduped per render. */
export const getSessionUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});
