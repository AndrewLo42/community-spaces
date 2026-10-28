import { updateProfileInput } from "@cs/core";
import { eq, users } from "@cs/db";
import { protectedProcedure, router } from "../trpc";

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const [me] = await ctx.db
      .select({ id: users.id, name: users.name, email: users.email, image: users.image, bio: users.bio })
      .from(users)
      .where(eq(users.id, ctx.user.id));
    return me ?? null;
  }),

  updateProfile: protectedProcedure.input(updateProfileInput).mutation(async ({ ctx, input }) => {
    await ctx.db.update(users).set({ name: input.name, bio: input.bio }).where(eq(users.id, ctx.user.id));
    return { ok: true };
  }),
});
