import { existsSync } from "node:fs";
import path from "node:path";

/** Walks up from cwd to the folder holding pnpm-workspace.yaml. */
export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

let loaded = false;

/**
 * Loads the repo-root .env so every app and script shares one file.
 * Variables already set in the environment (e.g. on Vercel) win.
 */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(findRepoRoot(), ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}
