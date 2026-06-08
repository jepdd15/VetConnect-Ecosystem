import { defineConfig } from "vitest/config";

// Scope Vitest to the Firestore rules suite only. The emulator round-trips
// (initializeTestEnvironment + per-test clearFirestore) are slower than the
// pure-unit suite in VetConnect-Admin, so the timeouts are generous.
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/firestore-rules/**/*.test.js"],
    testTimeout: 15000,
    hookTimeout: 30000,
    // Rules tests share one emulator + one project namespace, so they MUST run
    // serially — concurrent clearFirestore() calls would wipe another test's seed.
    // A single fork (rather than the default multi-worker forks pool) also avoids
    // an intermittent "Vitest failed to find the runner" worker-spin-up flake seen
    // on Windows with fileParallelism:false.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
