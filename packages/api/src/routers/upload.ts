import { createUploadInput } from "@cs/core";
import { createUpload } from "../lib/uploads";
import { protectedProcedure, router } from "../trpc";

export const uploadRouter = router({
  /** Step 1 of adding any image: get somewhere to PUT the (already resized) file. */
  createUrl: protectedProcedure.input(createUploadInput).mutation(({ ctx, input }) =>
    createUpload(ctx.db, ctx.storage, { userId: ctx.user.id, ...input }),
  ),
});
