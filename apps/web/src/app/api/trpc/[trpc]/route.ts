import { appRouter } from "@cs/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { mailerContext } from "@/server/mailer";
import { storage } from "@/server/storage";

// The same endpoint will serve the mobile app (Better Auth bearer/cookie session).
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const session = await auth.api.getSession({ headers: req.headers });
      return { db, storage, user: session?.user ?? null, ...mailerContext };
    },
    onError: ({ path, error }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path}:`, error);
    },
  });

// Room for work that runs after the response: an event's change email waits
// a couple of minutes for more edits before it goes out.
export const maxDuration = 300;

export { handler as GET, handler as POST };
