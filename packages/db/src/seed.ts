import { GROUP_ACCENTS, zonedTimeToUtc } from "@cs/core";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { connect } from "./client";
import { comments, eventRsvps, events, groups, memberships, places, posts, users } from "./schema";

// Sample local communities so Discover isn't empty in dev. Safe to re-run.

const { db, close } = connect();

const organizers = [
  { email: "maria@example.com", name: "Maria Okafor", bio: "Garden coordinator, compost evangelist." },
  { email: "dev@example.com", name: "Dev Patel", bio: "Runs the Saturday 5k loop." },
  { email: "june@example.com", name: "June Alvarez", bio: "Librarian by day." },
];

const sampleGroups: Array<{
  slug: string;
  name: string;
  description: string;
  rules: string;
  tags: string[];
  owner: string;
  visibility?: "public" | "private";
  joinPolicy?: "open" | "request";
  postPolicy?: "members" | "approval" | "admins";
}> = [
  {
    slug: "riverside-community-garden",
    name: "Riverside Community Garden",
    description:
      "Plot holders and volunteers at the Riverside garden. Work days, seed swaps, harvest sharing and who's watering this week.",
    rules: "Be kind. Tag posts about shared tools with [tools]. No selling produce here.",
    tags: ["gardening", "community-garden", "volunteering"],
    owner: "maria@example.com",
  },
  {
    slug: "eastside-running-club",
    name: "Eastside Running Club",
    description: "Free weekly group runs for every pace. Saturday 8am at the boathouse, Wednesday evening trail runs.",
    rules: "Route changes are posted by organizers only.",
    tags: ["running", "5k", "trail-running"],
    owner: "dev@example.com",
    postPolicy: "approval",
  },
  {
    slug: "downtown-book-circle",
    name: "Downtown Book Circle",
    description: "A monthly book club that meets at the central library. We read one fiction and one non-fiction pick each season.",
    rules: "Mark spoilers. Be generous with differing opinions.",
    tags: ["books", "book-club"],
    owner: "june@example.com",
    visibility: "private",
    joinPolicy: "request",
  },
  {
    slug: "maple-street-neighbors",
    name: "Maple Street Neighbors",
    description: "Announcements for the Maple Street block association: street sweeping, block party, lost and found.",
    rules: "Announcements come from the block committee. Questions go in the comments.",
    tags: ["neighborhood", "block-association"],
    owner: "maria@example.com",
    postPolicy: "admins",
  },
];

const userIds = new Map<string, string>();
for (const o of organizers) {
  await db.insert(users).values({ ...o, emailVerified: true }).onConflictDoNothing({ target: users.email });
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, o.email));
  userIds.set(o.email, row!.id);
}

// Groups created before hashtags existed only have their old category as a tag.
for (const g of sampleGroups) {
  await db
    .update(groups)
    .set({ tags: g.tags })
    .where(and(eq(groups.slug, g.slug), sql`cardinality(${groups.tags}) <= 1`));
}

for (const [i, g] of sampleGroups.entries()) {
  const ownerId = userIds.get(g.owner)!;
  const [created] = await db
    .insert(groups)
    .values({
      slug: g.slug,
      name: g.name,
      description: g.description,
      rules: g.rules,
      tags: g.tags,
      accentColor: GROUP_ACCENTS[i % GROUP_ACCENTS.length]!,
      visibility: g.visibility ?? "public",
      joinPolicy: g.joinPolicy ?? "open",
      postPolicy: g.postPolicy ?? "members",
      memberCount: 1,
      createdById: ownerId,
    })
    .onConflictDoNothing({ target: groups.slug })
    .returning({ id: groups.id });

  if (created) {
    await db.insert(memberships).values({ groupId: created.id, userId: ownerId, role: "owner" });
    console.log(`  + ${g.name}`);
  }
}

// Sample conversation, added once per group (skipped if the group has posts).
const samplePosts: Record<string, Array<{ author: string; body: string; pinned?: boolean; comments?: Array<[string, string]> }>> = {
  "riverside-community-garden": [
    {
      author: "maria@example.com",
      pinned: true,
      body: "Welcome! Work days are the first Saturday of every month, 9–12. Gloves and tools are in the shed (code is on the board by the gate).",
    },
    {
      author: "june@example.com",
      body: "Anyone have extra tomato starts? Mine didn't survive the cold snap.",
      comments: [
        ["maria@example.com", "I have about six Sungolds left. Leaving them by the shed tomorrow morning."],
        ["june@example.com", "Thank you! Grabbing two if that's alright."],
      ],
    },
    {
      author: "dev@example.com",
      body: "Reminder that the compost bins are for plant matter only. Found a pizza box in bin 2 again 🙃",
    },
  ],
  "eastside-running-club": [
    {
      author: "dev@example.com",
      pinned: true,
      body: "Saturday route: boathouse → river path → Elm St bridge and back. 5k, with a 3k turnaround for anyone easing in.",
      comments: [["june@example.com", "Is the river path still muddy after last week's rain?"]],
    },
  ],
  "maple-street-neighbors": [
    {
      author: "maria@example.com",
      body: "Street sweeping is moving to Thursdays starting next month. Please move cars from the even side by 8am.",
      comments: [["june@example.com", "Thanks for the heads up. Is this permanent?"]],
    },
  ],
};

for (const [slug, postsForGroup] of Object.entries(samplePosts)) {
  const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug));
  if (!group) continue;
  const [existing] = await db.select({ id: posts.id }).from(posts).where(eq(posts.groupId, group.id)).limit(1);
  if (existing) continue;

  // Space posts out over the past few days so the feed reads naturally.
  let hoursAgo = 4 + postsForGroup.length * 20;
  for (const p of postsForGroup) {
    const createdAt = new Date(Date.now() - hoursAgo * 3_600_000);
    hoursAgo -= 20;
    const [post] = await db
      .insert(posts)
      .values({
        groupId: group.id,
        authorId: userIds.get(p.author)!,
        body: p.body,
        pinned: p.pinned ?? false,
        commentCount: p.comments?.length ?? 0,
        createdAt,
      })
      .returning({ id: posts.id });
    for (const [i, [author, body]] of (p.comments ?? []).entries()) {
      await db.insert(comments).values({
        postId: post!.id,
        authorId: userIds.get(author)!,
        body,
        createdAt: new Date(createdAt.getTime() + (i + 1) * 45 * 60_000),
      });
    }
  }
  console.log(`  + posts in ${slug}`);
}

// Sample locations around Portland, OR. Only fills in places that are still
// empty, so it never overwrites a location someone set. Needs `pnpm db:places`.
const sampleLocations: { groups: Record<string, [string, string]>; users: Record<string, [string, string]> } = {
  groups: {
    "riverside-community-garden": ["Portland", "OR"],
    "eastside-running-club": ["Gresham", "OR"],
    "downtown-book-circle": ["Beaverton", "OR"],
    "maple-street-neighbors": ["Vancouver", "WA"],
  },
  users: {
    "maria@example.com": ["Portland", "OR"],
    "dev@example.com": ["Gresham", "OR"],
    "june@example.com": ["Beaverton", "OR"],
  },
};

async function findPlaceId(name: string, state: string) {
  const [place] = await db
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.name, name), eq(places.state, state)))
    .orderBy(desc(places.population))
    .limit(1);
  return place?.id ?? null;
}

const [anyPlace] = await db.select({ id: places.id }).from(places).limit(1);
if (!anyPlace) {
  console.log("  (no places loaded; run `pnpm db:places` to add sample locations)");
} else {
  for (const [slug, [name, state]] of Object.entries(sampleLocations.groups)) {
    const placeId = await findPlaceId(name, state);
    if (placeId) await db.update(groups).set({ placeId }).where(and(eq(groups.slug, slug), isNull(groups.placeId)));
  }
  for (const [email, [name, state]] of Object.entries(sampleLocations.users)) {
    const placeId = await findPlaceId(name, state);
    if (placeId) await db.update(users).set({ placeId }).where(and(eq(users.email, email), isNull(users.placeId)));
  }
  console.log("  + sample locations");
}

// Sample events around today, once per group (skipped if the group has events).
const sampleEvents: Record<string, Array<{ organizer: string; title: string; days: number; start: string; end?: string; location: string; capacity?: number; description: string }>> = {
  "riverside-community-garden": [
    { organizer: "maria@example.com", title: "Fall seed swap", days: -18, start: "10:00", end: "12:00", location: "Riverside garden shed", description: "Bring labeled envelopes of anything you saved this year." },
    { organizer: "maria@example.com", title: "Garden work day", days: 5, start: "09:00", end: "12:00", location: "Riverside Community Garden, main gate", capacity: 15, description: "Turning compost, mulching paths and putting beds to sleep for winter. Gloves and tools provided; coffee too." },
  ],
  "eastside-running-club": [
    { organizer: "dev@example.com", title: "Morning 5k loop", days: 2, start: "08:00", location: "Laurelhurst Park boathouse", description: "All paces welcome. We regroup at the halfway point." },
  ],
  "downtown-book-circle": [
    { organizer: "june@example.com", title: "Winter pick discussion", days: 12, start: "18:30", end: "20:00", location: "Central Library, room 3B", description: "Fiction pick for the season. Finished or not, come along." },
  ],
};

const timeZone = "America/Los_Angeles";
for (const [slug, eventsForGroup] of Object.entries(sampleEvents)) {
  const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug));
  if (!group) continue;
  const [existing] = await db.select({ id: events.id }).from(events).where(eq(events.groupId, group.id)).limit(1);
  if (existing) continue;
  for (const e of eventsForGroup) {
    const date = new Date(Date.now() + e.days * 86_400_000).toLocaleDateString("en-CA", { timeZone });
    const organizerId = userIds.get(e.organizer)!;
    const [event] = await db
      .insert(events)
      .values({
        groupId: group.id,
        createdById: organizerId,
        title: e.title,
        description: e.description,
        startsAt: zonedTimeToUtc(date, e.start, timeZone)!,
        endsAt: e.end ? zonedTimeToUtc(date, e.end, timeZone) : null,
        timeZone,
        location: e.location,
        capacity: e.capacity ?? null,
        goingCount: 1,
      })
      .returning({ id: events.id });
    await db.insert(eventRsvps).values({ eventId: event!.id, userId: organizerId, status: "going" });
  }
  console.log(`  + events for ${slug}`);
}

await close();
console.log("Seed complete.");
