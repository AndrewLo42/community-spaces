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
  user: {
    additionalFields: {
      bio: { type: "string", required: false, defaultValue: "", input: false },
    },
  },
  plugins: [
    magicLink({
      async sendMagicLink({ email, url }) {
        await sendEmail({
          to: email,
          subject: "Your Community Spaces sign-in link",
          text: `Sign in to Community Spaces: ${url}\n\nThis link expires in 5 minutes.`,
          html: `<p><a href="${url}">Sign in to Community Spaces</a></p><p>This link expires in 5 minutes.</p>`,
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
