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
| DB | Postgres via Drizzle. Homebrew Postgres locally, Neon in production |
| Images | Cloudflare R2 (presigned uploads). Saved to `.data/uploads` until R2 is configured |
| Email | Resend (logs to the console when no key is set) |

```
apps/web         Next.js app: pages, auth + tRPC route handlers
packages/api     tRPC routers (user, group, post, comment), the HTTP surface for web and mobile
packages/core    enums, permissions (can()), Zod validation, with no framework deps
packages/db      Drizzle schema, migrations, seed, connection
```

All permission rules live in `packages/core/src/permissions.ts` and are covered by
`permissions.test.ts`. API procedures load the group and the viewer's membership, then ask `can()`.

## Getting started

Local dev uses a real Postgres server. (Next.js dev renders in several processes,
so an embedded single-process database like PGlite isn't an option.)

```bash
brew install postgresql@17 && brew services start postgresql@17
createdb community_spaces
pnpm install
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:migrate
pnpm db:places                # US towns for locations (17k rows, ~3s)
pnpm db:seed                  # optional sample groups
pnpm dev                      # http://localhost:3000
```

Sign in with any email. In dev, the magic link is printed in the server terminal.

## Scripts

| | |
|---|---|
| `pnpm dev` | run the web app |
| `pnpm typecheck` | typecheck every package |
| `pnpm test` | run permission and notification-wording tests |
| `pnpm db:generate` | create a migration after editing `packages/db/src/schema.ts` |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:places` | load or refresh the US towns list |
| `pnpm db:studio` | browse the database |

## Deploying (free tier)

In production the app checks its settings at startup and refuses to run if any are missing,
listing all of them in the error (see `apps/web/src/server/env.ts`). Every variable in
`.env.example` is required there.

**Accounts to create first**

1. **Neon** (Postgres). You'll use two connection strings: the **pooled** one for the app, and
   the **direct** (unpooled) one for migrations.
2. **Resend.** Add and verify your sending domain (DNS records), then create an API key.
   `EMAIL_FROM` must use that domain, e.g. `Community Spaces <hello@yourdomain.com>`.
   Without a verified domain, Resend only delivers to your own address, so nobody else could sign in.
3. **Cloudflare R2.** Create a bucket with public access (an `r2.dev` URL or a custom domain),
   an API token with read and write access to it, and a CORS rule allowing `PUT` with the
   `Content-Type` header from your site's origin (browsers upload straight to R2).

**Database (from your machine, once, then after every new migration)**

```bash
DATABASE_URL="<neon direct string>" pnpm db:migrate
DATABASE_URL="<neon direct string>" pnpm db:places
```

Run migrations *before* deploying code that needs them. `pnpm db:seed` refuses to run against
anything but a local database; sample groups and test accounts don't belong in production.

**Vercel**

1. Import the repo with root directory `apps/web`.
2. Set, for Production: `DATABASE_URL` (Neon **pooled**), `BETTER_AUTH_SECRET`
   (`openssl rand -base64 32`), `BETTER_AUTH_URL` (your https site URL, no trailing slash),
   `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` (`openssl rand -base64 32`) and the five `R2_*` values.
3. Sign-in links point at `BETTER_AUTH_URL`, so preview deployments on other URLs can't sign
   anyone in. Test sign-in on the production URL (or a second Vercel project for staging).
4. Three daily Vercel Cron jobs (`apps/web/vercel.json`), all protected by `CRON_SECRET`.
   On Hobby, Vercel may run each one up to an hour after its scheduled time.
   - `/api/cron/digest` (15:00 UTC) sends daily and weekly email digests.
   - `/api/cron/reminders` (16:00 UTC) reminds attendees of events starting within 36 hours.
   - `/api/cron/cleanup` (09:00 UTC) deletes photos uploaded but never used (after 24 hours).

   To try one locally: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/digest`

**After the first deploy, check by hand**

- Sign in with your own email: the link arrives, and opens signed in.
- Create a group and a post with a photo (R2 upload and display).
- Post an announcement and check that members get the email, with a working unsubscribe link.
- In Vercel, run each cron job once from the Cron Jobs tab and check its JSON response.

Sign-in requests are rate limited (5 sign-in emails per 15 minutes per IP address), with the
counts kept in the database so they hold across serverless instances.

Vercel's Hobby plan is non-commercial. Move to Pro once the app makes money.

## Locations

Groups and users pick a US town from `packages/db/data/us-places.tsv`: populated places
with 1,000+ residents, trimmed from GeoNames `cities1000`. Search matches town names by prefix,
and "near" searches filter by great-circle distance in SQL, so no geocoding service is needed.
GeoNames data is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the site footer
carries the required credit. To refresh the data, download `cities1000.zip` from
https://download.geonames.org/export/dump/, keep rows where country is `US` and the feature
class is `P`, write the same seven columns, then run `pnpm db:places`.
