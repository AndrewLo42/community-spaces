import {
  announcementAudienceInput,
  can,
  canManageEvent,
  canManagePoll,
  canVote,
  createPollInput,
  MAX_POLLS_PER_DAY,
  messageSnippet,
  pollClosed,
  pollIdInput,
  votePollInput,
  type PermissionContext,
} from "@cs/core";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  eventRsvps,
  events,
  gt,
  inArray,
  isNull,
  or,
  pollOptions,
  polls,
  pollVotes,
  sql,
  users,
  type Db,
} from "@cs/db";
import { TRPCError } from "@trpc/server";
import { loadGroupAccess } from "../lib/access";
import { audienceIds, DAY_MS, loadAudience } from "../lib/announcements";
import { notify } from "../lib/notify";
import { protectedProcedure, publicProcedure, router } from "../trpc";

/** Closed group polls stay up this long so members can see how it came out. */
const SHOW_CLOSED_MS = 7 * DAY_MS;

type PollRow = typeof polls.$inferSelect;

/** Whether the viewer is coming to the event (or runs it), which decides who answers its polls. */
async function eventStanding(db: Db, ctx: PermissionContext, eventId: string | null) {
  if (!eventId || !ctx.userId) return { attending: false, managesEvent: false };
  const [event] = await db
    .select({ createdById: events.createdById, status: eventRsvps.status })
    .from(events)
    .leftJoin(eventRsvps, and(eq(eventRsvps.eventId, events.id), eq(eventRsvps.userId, ctx.userId)))
    .where(eq(events.id, eventId));
  return {
    attending: event?.status === "going" || event?.status === "maybe",
    managesEvent: !!event && canManageEvent(ctx, event),
  };
}

/**
 * Polls as the viewer sees them. Counts stay hidden until you've answered
 * (or can't), so early results don't sway the vote.
 */
async function toPollViews(db: Db, rows: PollRow[], ctx: PermissionContext) {
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id);
  const authorIds = rows.flatMap((p) => (p.authorId ? [p.authorId] : []));
  const [options, mine, authors] = await Promise.all([
    db.select().from(pollOptions).where(inArray(pollOptions.pollId, ids)).orderBy(asc(pollOptions.position)),
    ctx.userId
      ? db
          .select({ pollId: pollVotes.pollId, optionId: pollVotes.optionId })
          .from(pollVotes)
          .where(and(inArray(pollVotes.pollId, ids), eq(pollVotes.userId, ctx.userId)))
      : [],
    authorIds.length
      ? db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(inArray(users.id, authorIds))
      : [],
  ]);
  // Every poll in one list belongs to the same group or event, so one lookup covers them.
  const standing = await eventStanding(db, ctx, rows[0]!.eventId);

  return rows.map((poll) => {
    const closed = pollClosed(poll);
    const votes = mine.filter((v) => v.pollId === poll.id).map((v) => v.optionId);
    const voteAllowed = canVote(ctx, { closed, forEvent: poll.eventId !== null }, standing);
    const manage = canManagePoll(ctx, poll);
    const showResults = closed || votes.length > 0 || !voteAllowed || manage;
    return {
      id: poll.id,
      eventId: poll.eventId,
      question: poll.question,
      multiple: poll.multiple,
      voterCount: poll.voterCount,
      closesAt: poll.closesAt,
      closed,
      createdAt: poll.createdAt,
      author: authors.find((a) => a.id === poll.authorId) ?? null,
      options: options
        .filter((o) => o.pollId === poll.id)
        .map((o) => ({ id: o.id, label: o.label, voteCount: showResults ? o.voteCount : null })),
      viewer: { votes, canVote: voteAllowed, canManage: manage, showResults },
    };
  });
}
export type PollView = Awaited<ReturnType<typeof toPollViews>>[number];

async function loadPoll(db: Db, pollId: string, userId: string) {
  const [poll] = await db.select().from(polls).where(eq(polls.id, pollId));
  const access = poll ? await loadGroupAccess(db, { id: poll.groupId }, userId) : null;
  if (!poll || !access) throw new TRPCError({ code: "NOT_FOUND" });
  return { poll, ...access };
}

export const pollRouter = router({
  /**
   * Group polls for everyone in the group; event polls for the people coming.
   * Asking one notifies that audience in the app (no email).
   */
  create: protectedProcedure.input(createPollInput).mutation(async ({ ctx, input }) => {
    const { question, options, multiple, closesInDays, ...audience } = input;
    const { group, event, allowed } = await loadAudience(ctx.db, audience, ctx.user.id);
    if (!allowed || event?.cancelledAt) throw new TRPCError({ code: "FORBIDDEN", message: "You can't start a poll here" });

    const [recent] = await ctx.db
      .select({ n: count() })
      .from(polls)
      .where(
        and(
          eq(polls.groupId, group.id),
          event ? eq(polls.eventId, event.id) : isNull(polls.eventId),
          gt(polls.createdAt, new Date(Date.now() - DAY_MS)),
        ),
      );
    if ((recent?.n ?? 0) >= MAX_POLLS_PER_DAY) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `That's ${MAX_POLLS_PER_DAY} polls today. Try again tomorrow.` });
    }

    const id = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(polls)
        .values({
          groupId: group.id,
          eventId: event?.id ?? null,
          authorId: ctx.user.id,
          question,
          multiple,
          closesAt: closesInDays ? new Date(Date.now() + closesInDays * DAY_MS) : null,
        })
        .returning({ id: polls.id });
      await tx.insert(pollOptions).values(options.map((label, position) => ({ pollId: created!.id, label, position })));
      return created!.id;
    });

    const recipients = await audienceIds(ctx.db, audience, ctx.user.id);
    await notify(ctx.db, recipients, {
      type: "poll",
      groupKey: `poll:${id}`,
      groupId: group.id,
      eventId: event?.id,
      actorId: ctx.user.id,
      data: { snippet: messageSnippet(question), ...(event ? { eventTitle: event.title } : {}) },
    });
    return { id };
  }),

  /** A group's open polls (and ones closed this past week), or every poll on an event. Newest first. */
  list: publicProcedure.input(announcementAudienceInput).query(async ({ ctx, input }) => {
    const groupId =
      "groupId" in input
        ? input.groupId
        : (await ctx.db.select({ groupId: events.groupId }).from(events).where(eq(events.id, input.eventId)))[0]?.groupId;
    const access = groupId ? await loadGroupAccess(ctx.db, { id: groupId }, ctx.user?.id ?? null) : null;
    if (!access || !can(access.permissionContext, "group:read")) return [];

    const cutoff = new Date(Date.now() - SHOW_CLOSED_MS);
    const rows = await ctx.db
      .select()
      .from(polls)
      .where(
        "eventId" in input
          ? eq(polls.eventId, input.eventId)
          : and(
              eq(polls.groupId, input.groupId),
              isNull(polls.eventId),
              // Still open, or closed recently enough to be worth showing the result.
              or(isNull(polls.closedAt), gt(polls.closedAt, cutoff)),
              or(isNull(polls.closesAt), gt(polls.closesAt, cutoff)),
            ),
      )
      .orderBy(desc(polls.createdAt))
      .limit(10);
    return toPollViews(ctx.db, rows, access.permissionContext);
  }),

  /**
   * Replaces the viewer's answer. Counts are recomputed from the votes under a
   * lock on the poll, so concurrent voters can't drift them.
   */
  vote: protectedProcedure.input(votePollInput).mutation(async ({ ctx, input }) => {
    const { poll, permissionContext } = await loadPoll(ctx.db, input.pollId, ctx.user.id);
    const standing = await eventStanding(ctx.db, permissionContext, poll.eventId);
    const choices = [...new Set(input.optionIds)];

    await ctx.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(polls).where(eq(polls.id, poll.id)).for("update");
      if (!locked) throw new TRPCError({ code: "NOT_FOUND" });
      const closed = pollClosed(locked);
      if (!canVote(permissionContext, { closed, forEvent: locked.eventId !== null }, standing)) {
        const message = closed ? "This poll is closed" : locked.eventId ? "This poll is for the people coming" : "Join the group to vote";
        throw new TRPCError({ code: "FORBIDDEN", message });
      }
      if (!locked.multiple && choices.length > 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick one choice" });
      if (choices.length > 0) {
        const valid = await tx
          .select({ id: pollOptions.id })
          .from(pollOptions)
          .where(and(eq(pollOptions.pollId, poll.id), inArray(pollOptions.id, choices)));
        if (valid.length !== choices.length) throw new TRPCError({ code: "BAD_REQUEST", message: "That choice isn't in this poll" });
      }

      await tx.delete(pollVotes).where(and(eq(pollVotes.pollId, poll.id), eq(pollVotes.userId, ctx.user.id)));
      if (choices.length > 0) {
        await tx.insert(pollVotes).values(choices.map((optionId) => ({ pollId: poll.id, optionId, userId: ctx.user.id })));
      }

      await tx
        .update(pollOptions)
        .set({ voteCount: sql`(select count(*) from ${pollVotes} where ${pollVotes.optionId} = ${pollOptions.id})::int` })
        .where(eq(pollOptions.pollId, poll.id));
      const [voters] = await tx.select({ n: countDistinct(pollVotes.userId) }).from(pollVotes).where(eq(pollVotes.pollId, poll.id));
      await tx.update(polls).set({ voterCount: voters?.n ?? 0 }).where(eq(polls.id, poll.id));
    });
    return { ok: true };
  }),

  /** Stops voting early. The result stays visible. */
  close: protectedProcedure.input(pollIdInput).mutation(async ({ ctx, input }) => {
    const { poll, permissionContext } = await loadPoll(ctx.db, input.pollId, ctx.user.id);
    if (!canManagePoll(permissionContext, poll)) throw new TRPCError({ code: "FORBIDDEN" });
    if (!pollClosed(poll)) await ctx.db.update(polls).set({ closedAt: new Date() }).where(eq(polls.id, poll.id));
    return { ok: true };
  }),

  delete: protectedProcedure.input(pollIdInput).mutation(async ({ ctx, input }) => {
    const { poll, permissionContext } = await loadPoll(ctx.db, input.pollId, ctx.user.id);
    if (!canManagePoll(permissionContext, poll)) throw new TRPCError({ code: "FORBIDDEN" });
    await ctx.db.delete(polls).where(eq(polls.id, poll.id));
    return { ok: true };
  }),
});
