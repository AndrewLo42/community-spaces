import {
  announcementAudienceInput,
  can,
  createAnnouncementInput,
  MAX_ANNOUNCEMENTS_PER_DAY,
  messageSnippet,
  setAnnouncementEmailsInput,
} from "@cs/core";
import { and, announcements, asc, count, desc, eq, events, groups, gt, isNull, memberships, users } from "@cs/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadGroupAccess } from "../lib/access";
import { audienceIds, DAY_MS, loadAudience } from "../lib/announcements";
import { notify } from "../lib/notify";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const listColumns = {
  id: announcements.id,
  body: announcements.body,
  createdAt: announcements.createdAt,
  recipientCount: announcements.recipientCount,
  authorId: announcements.authorId,
  authorName: users.name,
  authorImage: users.image,
};

export const announcementRouter = router({
  /** How many people a message would reach, for the composer's confirm line. */
  audienceSize: protectedProcedure.input(announcementAudienceInput).query(async ({ ctx, input }) => {
    const { allowed } = await loadAudience(ctx.db, input, ctx.user.id);
    if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });
    return (await audienceIds(ctx.db, input, ctx.user.id)).length;
  }),

  /**
   * Sends to everyone in the audience at once: an in-app notification now,
   * emails right after the response (to those who haven't turned them off).
   */
  create: protectedProcedure.input(createAnnouncementInput).mutation(async ({ ctx, input }) => {
    const { body, ...audience } = input;
    const { group, event, allowed } = await loadAudience(ctx.db, audience, ctx.user.id);
    if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "You can't send announcements here" });

    const [recent] = await ctx.db
      .select({ n: count() })
      .from(announcements)
      .where(
        and(
          eq(announcements.groupId, group.id),
          event ? eq(announcements.eventId, event.id) : isNull(announcements.eventId),
          gt(announcements.createdAt, new Date(Date.now() - DAY_MS)),
        ),
      );
    if ((recent?.n ?? 0) >= MAX_ANNOUNCEMENTS_PER_DAY) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `That's ${MAX_ANNOUNCEMENTS_PER_DAY} announcements today. Post it in the group instead, or try again tomorrow.`,
      });
    }

    const recipients = await audienceIds(ctx.db, audience, ctx.user.id);
    const [created] = await ctx.db
      .insert(announcements)
      .values({ groupId: group.id, eventId: event?.id ?? null, authorId: ctx.user.id, body, recipientCount: recipients.length })
      .returning({ id: announcements.id });
    const id = created!.id;

    await notify(ctx.db, recipients, {
      type: "announcement",
      // Never coalesced: each announcement is its own notice.
      groupKey: `announcement:${id}`,
      groupId: group.id,
      eventId: event?.id,
      actorId: ctx.user.id,
      data: { snippet: messageSnippet(body), ...(event ? { eventTitle: event.title } : {}) },
    });

    const { mailer } = ctx;
    if (mailer && recipients.length > 0) {
      const send = () => mailer.sendAnnouncement(id).catch((e) => console.error(`announcement ${id} email failed:`, e));
      if (ctx.after) ctx.after(send);
      else void send();
    }
    return { id, recipients: recipients.length };
  }),

  /** Recent group-wide announcements, newest first, pinned above the posts. */
  recent: publicProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    const access = await loadGroupAccess(ctx.db, { id: input.groupId }, ctx.user?.id ?? null);
    if (!access || !can(access.permissionContext, "group:read")) return [];
    return ctx.db
      .select(listColumns)
      .from(announcements)
      .leftJoin(users, eq(users.id, announcements.authorId))
      .where(
        and(
          eq(announcements.groupId, input.groupId),
          isNull(announcements.eventId),
          gt(announcements.createdAt, new Date(Date.now() - 30 * DAY_MS)),
        ),
      )
      .orderBy(desc(announcements.createdAt))
      .limit(3);
  }),

  /** Every update sent about an event, oldest first, so they read in order. */
  forEvent: publicProcedure.input(z.object({ eventId: z.string() })).query(async ({ ctx, input }) => {
    const [event] = await ctx.db.select({ groupId: events.groupId }).from(events).where(eq(events.id, input.eventId));
    const access = event ? await loadGroupAccess(ctx.db, { id: event.groupId }, ctx.user?.id ?? null) : null;
    if (!access || !can(access.permissionContext, "group:read")) return [];
    return ctx.db
      .select(listColumns)
      .from(announcements)
      .leftJoin(users, eq(users.id, announcements.authorId))
      .where(eq(announcements.eventId, input.eventId))
      .orderBy(asc(announcements.createdAt));
  }),

  /** The viewer's groups and whether each one's announcements also come by email. */
  emailSettings: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({ groupId: groups.id, name: groups.name, enabled: memberships.announcementEmails })
      .from(memberships)
      .innerJoin(groups, eq(groups.id, memberships.groupId))
      .where(and(eq(memberships.userId, ctx.user.id), eq(memberships.status, "active")))
      .orderBy(groups.name);
  }),

  setEmails: protectedProcedure.input(setAnnouncementEmailsInput).mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(memberships)
      .set({ announcementEmails: input.enabled })
      .where(and(eq(memberships.userId, ctx.user.id), eq(memberships.groupId, input.groupId)));
    return { ok: true };
  }),
});
