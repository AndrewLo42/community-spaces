import { groupRouter } from "./routers/group";
import { userRouter } from "./routers/user";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  user: userRouter,
  group: groupRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export type { Context, SessionUser } from "./trpc";
