// Auth boundary + deny-all fallback.
// Every protected collection must reject an unauthenticated client, and any
// collection NOT explicitly matched in the rules must be denied to everyone.
import { describe, it, beforeAll, afterAll, afterEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getEnv, clearData, cleanupEnv, authedDb, unauthedDb, seed } from "./helpers.js";

beforeAll(getEnv);
afterEach(clearData);
afterAll(cleanupEnv);

// Collections whose READ requires authentication (i.e. NOT the public-read set).
const AUTH_READ_COLLECTIONS = [
  "appointments", "pets", "medical_records", "services", "inventory",
  "inventory_categories", "departments", "sales", "payments", "queue",
  "system_prompts", "llm_audit_logs", "faqs", "notification_templates",
  "notification_log", "counters", "daily_closings", "promo_templates",
  "slot_reservations", "expenses", "expense_categories",
  "inventory_logs", "service_logs", "staff_logs", "settings_logs", "auth_logs",
  "users",
];

// Collections whose CREATE requires authentication.
const AUTH_CREATE_COLLECTIONS = [
  "appointments", "pets", "medical_records", "sales", "payments",
  "queue", "slot_reservations", "notification_log", "auth_logs",
  "inventory_logs", "service_logs", "staff_logs", "settings_logs", "llm_audit_logs",
];

describe("auth boundary — unauthenticated client is denied", () => {
  it.each(AUTH_READ_COLLECTIONS)("unauthed read of %s is denied", async (col) => {
    await seed(async (db) => setDoc(doc(db, col, "seed1"), { x: 1 }));
    const db = await unauthedDb();
    await assertFails(getDoc(doc(db, col, "seed1")));
  });

  it.each(AUTH_CREATE_COLLECTIONS)("unauthed create in %s is denied", async (col) => {
    const db = await unauthedDb();
    await assertFails(setDoc(doc(db, col, "new1"), { x: 1 }));
  });
});

describe("deny-all fallback — unmatched collections are denied to everyone", () => {
  it("authenticated read of an unmatched collection is denied", async () => {
    await seed(async (db) => setDoc(doc(db, "totally_unmatched_xyz", "d"), { x: 1 }));
    const db = await authedDb();
    await assertFails(getDoc(doc(db, "totally_unmatched_xyz", "d")));
  });

  it("authenticated write to an unmatched collection is denied", async () => {
    const db = await authedDb();
    await assertFails(setDoc(doc(db, "totally_unmatched_xyz", "d"), { x: 1 }));
  });

  it("unauthenticated write to an unmatched collection is denied", async () => {
    const db = await unauthedDb();
    await assertFails(setDoc(doc(db, "totally_unmatched_xyz", "d"), { x: 1 }));
  });

  it("authenticated read of a protected collection IS allowed (sanity — boundary is auth, not deny-all)", async () => {
    await seed(async (db) => setDoc(doc(db, "appointments", "a1"), { status: "pending" }));
    const db = await authedDb();
    await assertSucceeds(getDoc(doc(db, "appointments", "a1")));
  });
});
