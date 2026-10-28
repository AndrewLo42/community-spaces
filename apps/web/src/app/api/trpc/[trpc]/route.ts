import { appRouter } from "@cs/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

// The same endpoint will serve the mobile app (Better Auth bearer/cookie session).
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const session = await auth.api.getSession({ headers: req.headers });
      return { db, storage, user: session?.user ?? null };
    },
    onError: ({ path, error }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path}:`, error);
    },
  });

export { handler as GET, handler as POST };
