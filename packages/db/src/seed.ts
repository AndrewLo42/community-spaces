import { GROUP_ACCENTS, type GroupCategory } from "@cs/core";
import { eq } from "drizzle-orm";
import { connect } from "./client";
import { groups, memberships, users } from "./schema";

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

await close();
console.log("Seed complete.");
