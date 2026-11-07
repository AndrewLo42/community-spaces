// Settings a production deploy can't work without. Without them the app would
// still start, then fail quietly: sign-in links printed to a log instead of
// emailed, photos written to a server disk that disappears, scheduled jobs
// refusing every call. So production refuses to start instead.

const REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const;

/** Throws naming every missing or malformed setting, so one deploy shows them all. */
export function assertProductionEnv(env: Record<string, string | undefined> = process.env) {
  const problems: string[] = REQUIRED.filter((name) => !env[name]?.trim()).map((name) => `${name} is not set`);

  for (const name of ["BETTER_AUTH_URL", "R2_PUBLIC_URL"] as const) {
    const value = env[name];
    if (value && !/^https:\/\/[^/]+/.test(value)) problems.push(`${name} must be an https:// URL (got "${value}")`);
  }
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length < 32) {
    problems.push("BETTER_AUTH_SECRET is too short; generate one with: openssl rand -base64 32");
  }

  if (problems.length > 0) {
    throw new Error(`Community Spaces can't start in production:\n- ${problems.join("\n- ")}\nSee "Deploying" in the README.`);
  }
}
