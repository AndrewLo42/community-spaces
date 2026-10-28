import { GROUP_ACCENTS, type GroupCategory } from "@cs/core";
import { eq } from "drizzle-orm";
import { connect } from "./client";
import { comments, groups, memberships, posts, users } from "./schema";

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
  category: GroupCategory;
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
    category: "neighborhood",
    owner: "maria@example.com",
  },
  {
    slug: "eastside-running-club",
    name: "Eastside Running Club",
    description: "Free weekly group runs for every pace. Saturday 8am at the boathouse, Wednesday evening trail runs.",
    rules: "Route changes are posted by organizers only.",
    category: "sports",
    owner: "dev@example.com",
    postPolicy: "approval",
  },
  {
    slug: "downtown-book-circle",
    name: "Downtown Book Circle",
    description: "A monthly book club that meets at the central library. We read one fiction and one non-fiction pick each season.",
    rules: "Mark spoilers. Be generous with differing opinions.",
    category: "arts",
    owner: "june@example.com",
    visibility: "private",
    joinPolicy: "request",
  },
  {
    slug: "maple-street-neighbors",
    name: "Maple Street Neighbors",
    description: "Announcements for the Maple Street block association: street sweeping, block party, lost and found.",
    rules: "Announcements come from the block committee. Questions go in the comments.",
    category: "neighborhood",
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

for (const [i, g] of sampleGroups.entries()) {
  const ownerId = userIds.get(g.owner)!;
  const [created] = await db
    .insert(groups)
    .values({
      slug: g.slug,
      name: g.name,
      description: g.description,
      rules: g.rules,
      category: g.category,
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

await close();
console.log("Seed complete.");
