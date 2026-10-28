import { commentRouter } from "./routers/comment";
import { groupRouter } from "./routers/group";
import { inviteRouter } from "./routers/invite";
import { manageRouter } from "./routers/manage";
import { notificationRouter } from "./routers/notification";
import { postRouter } from "./routers/post";
import { reportRouter } from "./routers/report";
import { uploadRouter } from "./routers/upload";
import { userRouter } from "./routers/user";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  user: userRouter,
  group: groupRouter,
  post: postRouter,
  comment: commentRouter,
  report: reportRouter,
  invite: inviteRouter,
  manage: manageRouter,
  notification: notificationRouter,
  upload: uploadRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
export type { Context, SessionUser } from "./trpc";
export type { Storage } from "./storage";
export { deleteUnusedUploads } from "./lib/uploads";
export type { PostView } from "./lib/posts";
