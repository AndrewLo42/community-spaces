import { setAvatarInput, updateProfileInput } from "@cs/core";
import { eq, users } from "@cs/db";
import { assertPlace, getPlace } from "../lib/places";
import { claimUploads, discardUploads } from "../lib/uploads";
import { protectedProcedure, router } from "../trpc";

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const [me] = await ctx.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        bio: users.bio,
        placeId: users.placeId,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id));
    if (!me) return null;
    const { placeId, ...rest } = me;
    return { ...rest, place: await getPlace(ctx.db, placeId) };
  }),

  updateProfile: protectedProcedure.input(updateProfileInput).mutation(async ({ ctx, input }) => {
    await assertPlace(ctx.db, input.placeId);
    await ctx.db
      .update(users)
      .set({ name: input.name, bio: input.bio, ...(input.placeId !== undefined ? { placeId: input.placeId } : {}) })
      .where(eq(users.id, ctx.user.id));
    return { ok: true };
  }),

  /** Set (or clear, with null) the profile photo. The old file is deleted. */
  setAvatar: protectedProcedure.input(setAvatarInput).mutation(async ({ ctx, input }) => {
    const [current] = await ctx.db.select({ imageKey: users.imageKey }).from(users).where(eq(users.id, ctx.user.id));
    if (input.key) await claimUploads(ctx.db, ctx.user.id, "avatar", [input.key]);
    await ctx.db
      .update(users)
      .set({ imageKey: input.key, image: input.key ? ctx.storage.publicUrl(input.key) : null })
      .where(eq(users.id, ctx.user.id));
    if (current?.imageKey && current.imageKey !== input.key) await discardUploads(ctx.db, ctx.storage, [current.imageKey]);
    return { image: input.key ? ctx.storage.publicUrl(input.key) : null };
  }),
});
