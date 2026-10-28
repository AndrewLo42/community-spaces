# Community Spaces

A calm home for local communities: find groups, join them, read posts, comment.
No algorithm, no follower counts.

## Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 16 (App Router) + Tailwind v4 |
| API | tRPC v11 (shared with the future Expo app) |
| Auth | Better Auth, email magic links |
| DB | Postgres via Drizzle. PGlite locally, Neon in production |
| Images | Cloudflare R2 (presigned uploads), wired up with posts |
| Email | Resend (logs to the console when no key is set) |

```
apps/web         Next.js app: pages, auth + tRPC route handlers
packages/api     tRPC routers (user, group), the HTTP surface for web and mobile
packages/core    enums, permissions (can()), Zod validation, with no framework deps
packages/db      Drizzle schema, migrations, seed, connection
```

All permission rules live in `packages/core/src/permissions.ts` and are covered by
`permissions.test.ts`. API procedures load the group and the viewer's membership, then ask `can()`.

## Getting started

```bash
pnpm install
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:migrate
pnpm db:seed                  # optional sample groups
pnpm dev                      # http://localhost:3000
```

Sign in with any email. In dev, the magic link is printed in the server terminal.

## Scripts

| | |
|---|---|
| `pnpm dev` | run the web app |
| `pnpm typecheck` | typecheck every package |
| `pnpm test` | run permission tests |
| `pnpm db:generate` | create a migration after editing `packages/db/src/schema.ts` |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:studio` | browse the database |

## Deploying (free tier)

1. Create a Neon project and copy the **pooled** connection string.
2. Import the repo on Vercel with root directory `apps/web`.
3. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`.
4. Run `DATABASE_URL=… pnpm db:migrate` once against Neon.

Vercel's Hobby plan is non-commercial. Move to Pro once the app makes money.
