import type { Db } from "@cs/db";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

/** Built per request by the host app (Next.js today, the same server for mobile later). */
export interface Context {
  db: Db;
  user: SessionUser | null;
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
