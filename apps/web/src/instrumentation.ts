/** Runs once when a server starts (not during `next build`). */
export async function register() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionEnv } = await import("./server/env");
    assertProductionEnv();
  }
}
