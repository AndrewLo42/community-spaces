import {
  can,
  canAcceptInvite,
  createInviteInput,
  groupIdInput,
  inviteCodeInput,
  inviteIdInput,
  MAX_ACTIVE_INVITES_PER_MEMBER,
  type GroupRules,
} from "@cs/core";
import { and, count, desc, eq, groups, gt, invites, isNull, lt, memberships, or, sql, type Db } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "node:crypto";
import { loadGroupAccess, requireGroupAction } from "../lib/access";
import { getPlace } from "../lib/places";
import { protectedProcedure, publicProcedure, router } from "../trpc";

async function findInvite(db: Db, code: string) {
  const [invite] = await db.select().from(invites).where(eq(invites.code, code));
  return invite ?? null;
}

type Invite = NonNullable<Awaited<ReturnType<typeof findInvite>>>;

/**
 * A link works only while the person who made it could still make it: they're
 * an active member and the group's invite setting allows them. Leaving, being
 * removed, being demoted, or the group going back to admin-only invites turns
 * their links off.
 */
async function creatorCanInvite(db: Db, invite: Invite, group: GroupRules) {
  if (!invite.createdById) return false;
  const [membership] = await db
    .select({ role: memberships.role, status: memberships.status })
    .from(memberships)
    .where(and(eq(memberships.groupId, invite.groupId), eq(memberships.userId, invite.createdById)));
  return can({ userId: invite.createdById, group, membership: membership ?? null }, "invite:create");
}

async function inviteStatus(db: Db, invite: Invite, group: GroupRules) {
  if (invite.revokedAt) return "revoked" as const;
  if (invite.expiresAt && invite.expiresAt <= new Date()) return "expired" as const;
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return "used-up" as const;
  if (!(await creatorCanInvite(db, invite, group))) return "inactive" as const;
  return "valid" as const;
}

/** Live: not revoked, not expired, not used up. */
const liveInvite = () =>
  and(
    isNull(invites.revokedAt),
    or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
    or(isNull(invites.maxUses), lt(invites.uses, invites.maxUses)),
  );

export const inviteRouter = router({
  /**
   * What an invite link shows. A working link reveals the group, even a secret
   * one. A dead link to a secret group reveals nothing, unless you're already in it.
   */
  byCode: publicProcedure.input(inviteCodeInput).query(async ({ ctx, input }) => {
    const invite = await findInvite(ctx.db, input.code);
    if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
    const access = await loadGroupAccess(ctx.db, { id: invite.groupId }, ctx.user?.id ?? null);
    if (!access) throw new TRPCError({ code: "NOT_FOUND" });

    const { group, membership, permissionContext } = access;
    const status = await inviteStatus(ctx.db, invite, group);
    const viewer = {
      signedIn: ctx.user !== null,
      membershipStatus: membership?.status ?? null,
      canAccept: canAcceptInvite(permissionContext),
    };
    if (status !== "valid" && !can(permissionContext, "group:discover")) {
      return { status, group: null, viewer };
    }
    return {
      status,
      group: {
        slug: group.slug,
        name: group.name,
        description: group.description,
        accentColor: group.accentColor,
        bannerUrl: group.bannerKey ? ctx.storage.publicUrl(group.bannerKey) : null,
        place: await getPlace(ctx.db, group.placeId),
        memberCount: group.memberCount,
        visibility: group.visibility,
      },
      viewer,
    };
  }),

  accept: protectedProcedure.input(inviteCodeInput).mutation(async ({ ctx, input }) => {
    const invite = await findInvite(ctx.db, input.code);
    if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
    const access = await loadGroupAccess(ctx.db, { id: invite.groupId }, ctx.user.id);
    if (!access || !canAcceptInvite(access.permissionContext)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can't join with this invite" });
    }
    if (!(await creatorCanInvite(ctx.db, invite, access.group))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This invite link no longer works" });
    }

    await ctx.db.transaction(async (tx) => {
      // Claim a use atomically so concurrent accepts can't exceed maxUses.
      const claimed = await tx
        .update(invites)
        .set({ uses: sql`${invites.uses} + 1` })
        .where(
          and(eq(invites.id, invite.id), liveInvite()),
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

  // ─── Your own links (members, when the group allows it) ──────────────────

  /** Live links you made for this group, newest first. */
  mine: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "invite:create");
    return ctx.db
      .select({ id: invites.id, code: invites.code, uses: invites.uses, maxUses: invites.maxUses, expiresAt: invites.expiresAt })
      .from(invites)
      .where(and(eq(invites.groupId, input.groupId), eq(invites.createdById, ctx.user.id), liveInvite()))
      .orderBy(desc(invites.createdAt));
  }),

  /** Make a link of your own. Capped, so one member can't flood a group with links. */
  create: protectedProcedure.input(createInviteInput).mutation(async ({ ctx, input }) => {
    await requireGroupAction(ctx.db, input.groupId, ctx.user.id, "invite:create");
    const [live] = await ctx.db
      .select({ n: count() })
      .from(invites)
      .where(and(eq(invites.groupId, input.groupId), eq(invites.createdById, ctx.user.id), liveInvite()));
    if ((live?.n ?? 0) >= MAX_ACTIVE_INVITES_PER_MEMBER) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `You have ${MAX_ACTIVE_INVITES_PER_MEMBER} links already. Turn one off first.`,
      });
    }
    const [invite] = await ctx.db
      .insert(invites)
      .values({
        groupId: input.groupId,
        code: randomBytes(8).toString("base64url"),
        createdById: ctx.user.id,
        maxUses: input.maxUses,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      })
      .returning({ code: invites.code });
    return invite!;
  }),

  /** Turn off a link you made. Admins revoke anyone's from the manage page. */
  revoke: protectedProcedure.input(inviteIdInput).mutation(async ({ ctx, input }) => {
    const [revoked] = await ctx.db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invites.id, input.inviteId),
          eq(invites.groupId, input.groupId),
          eq(invites.createdById, ctx.user.id),
          isNull(invites.revokedAt),
        ),
      )
      .returning({ id: invites.id });
    if (!revoked) throw new TRPCError({ code: "NOT_FOUND", message: "That link isn't there any more." });
    return { ok: true };
  }),
});
