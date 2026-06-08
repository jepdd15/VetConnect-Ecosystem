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
    // Rules tests share one emulator + one project namespace; run serially
    // so concurrent clearFirestore() calls can't wipe another test's seed.
    fileParallelism: false,
  },
});
