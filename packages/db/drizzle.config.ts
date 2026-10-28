import path from "node:path";
import { defineConfig } from "drizzle-kit";
import { findRepoRoot, loadRootEnv } from "./src/env";

loadRootEnv();

const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  ...(url
    ? { dbCredentials: { url } }
    : {
        driver: "pglite",
        dbCredentials: {
          url: process.env.PGLITE_DIR ?? path.join(findRepoRoot(), ".data", "pglite"),
        },
      }),
});
