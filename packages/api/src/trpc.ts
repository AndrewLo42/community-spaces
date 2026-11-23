import type { EventChangeEmail } from "./lib/event-changes";
import type { Db } from "@cs/db";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import type { Storage } from "./storage";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

/** Emails the API asks the host app to send; the host owns templates, links and the mail provider. */
export interface Mailer {
  sendAnnouncement(announcementId: string): Promise<void>;
  /** Tells people coming that an event moved or was cancelled. */
  sendEventChange(change: EventChangeEmail): Promise<void>;
}

/** Built per request by the host app (Next.js today, the same server for mobile later). */
export interface Context {
  db: Db;
  storage: Storage;
  user: SessionUser | null;
  mailer?: Mailer;
  /** Runs work after the response is sent (Next's `after`). Without it, work starts immediately and isn't awaited. */
  after?: (task: () => Promise<void>) => void;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        fieldErrors: error.cause instanceof ZodError ? z.flattenError(error.cause).fieldErrors : null,
      },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in first" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
