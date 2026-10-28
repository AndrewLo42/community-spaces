import { commentRouter } from "./routers/comment";
import { groupRouter } from "./routers/group";
import { postRouter } from "./routers/post";
import { userRouter } from "./routers/user";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  user: userRouter,
  group: groupRouter,
  post: postRouter,
  comment: commentRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export type { Context, SessionUser } from "./trpc";
export type { Storage } from "./storage";
export type { PostView } from "./lib/posts";
