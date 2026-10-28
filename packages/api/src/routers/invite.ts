import { canAcceptInvite, inviteCodeInput } from "@cs/core";
import { and, eq, groups, gt, invites, isNull, lt, memberships, or, sql, type Db } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { loadGroupAccess } from "../lib/access";
import { protectedProcedure, publicProcedure, router } from "../trpc";

async function findInvite(db: Db, code: string) {
  const [invite] = await db.select().from(invites).where(eq(invites.code, code));
  return invite ?? null;
}

function inviteStatus(invite: NonNullable<Awaited<ReturnType<typeof findInvite>>>) {
  if (invite.revokedAt) return "revoked" as const;
  if (invite.expiresAt && invite.expiresAt <= new Date()) return "expired" as const;
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return "used-up" as const;
  return "valid" as const;
}

export const inviteRouter = router({
  /** What an invite link shows. Holding the link reveals the group, even a hidden one. */
  byCode: publicProcedure.input(inviteCodeInput).query(async ({ ctx, input }) => {
    const invite = await findInvite(ctx.db, input.code);
    if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
    const access = await loadGroupAccess(ctx.db, { id: invite.groupId }, ctx.user?.id ?? null);
    if (!access) throw new TRPCError({ code: "NOT_FOUND" });

    const { group, membership, permissionContext } = access;
    return {
      status: inviteStatus(invite),
      group: {
        slug: group.slug,
        name: group.name,
        description: group.description,
        accentColor: group.accentColor,
        memberCount: group.memberCount,
        visibility: group.visibility,
      },
      viewer: {
        signedIn: ctx.user !== null,
        membershipStatus: membership?.status ?? null,
        canAccept: canAcceptInvite(permissionContext),
      },
    };
  }),

  accept: protectedProcedure.input(inviteCodeInput).mutation(async ({ ctx, input }) => {
    const invite = await findInvite(ctx.db, input.code);
    if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
    const access = await loadGroupAccess(ctx.db, { id: invite.groupId }, ctx.user.id);
    if (!access || !canAcceptInvite(access.permissionContext)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can't join with this invite" });
    }

    await ctx.db.transaction(async (tx) => {
      // Claim a use atomically so concurrent accepts can't exceed maxUses.
      const claimed = await tx
        .update(invites)
        .set({ uses: sql`${invites.uses} + 1` })
        .where(
          and(
            eq(invites.id, invite.id),
            isNull(invites.revokedAt),
            or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
            or(isNull(invites.maxUses), lt(invites.uses, invites.maxUses)),
          ),
        )
        .returning({ id: invites.id });
      if (claimed.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has expired or been used up" });
      }

      if (access.membership?.status === "pending") {
        await tx
          .update(memberships)
          .set({ status: "active", requestMessage: null })
          .where(and(eq(memberships.groupId, invite.groupId), eq(memberships.userId, ctx.user.id)));
      } else {
        await tx.insert(memberships).values({ groupId: invite.groupId, userId: ctx.user.id });
      }
      await tx
        .update(groups)
        .set({ memberCount: sql`${groups.memberCount} + 1` })
        .where(eq(groups.id, invite.groupId));
    });
    return { slug: access.group.slug };
  }),
});
