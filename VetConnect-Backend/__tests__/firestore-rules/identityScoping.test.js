// Identity-scoped rules — the constraints isStaff()===isAuth() does NOT collapse.
//
// Most "owner OR staff" rules degrade to "any authenticated user" under Spark
// (the staff clause always passes), so they are covered as auth-boundary tests
// elsewhere. The rules that genuinely discriminate by identity are:
//   1. users/{uid}/recordFilterPresets — isOwner(uid) with NO staff escape hatch.
//   2. expenses — create/update require the request's own uid in loggedByUid /
//      updatedByUid (a field-identity check beyond mere authentication).
// We also pin down the ACTUAL behavior of `payments` read, whose comment claims
// owner-exclusion that the rule does not in fact enforce under Spark.
import { describe, it, beforeAll, afterAll, afterEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import {
  getEnv, clearData, cleanupEnv, authedDb, unauthedDb, seed,
  STAFF_UID, OWNER_UID, OTHER_UID,
} from "./helpers.js";

beforeAll(getEnv);
afterEach(clearData);
afterAll(cleanupEnv);

describe("recordFilterPresets — strictly owner-scoped (no staff escape)", () => {
  const presetPath = (uid) => ["users", uid, "recordFilterPresets", "preset1"];

  it("owner can write their own preset", async () => {
    const db = await authedDb(OWNER_UID);
    await assertSucceeds(setDoc(doc(db, ...presetPath(OWNER_UID)), { cols: ["a"] }));
  });

  it("owner can read their own preset", async () => {
    await seed(async (db) => setDoc(doc(db, ...presetPath(OWNER_UID)), { cols: ["a"] }));
    const db = await authedDb(OWNER_UID);
    await assertSucceeds(getDoc(doc(db, ...presetPath(OWNER_UID))));
  });

  it("a different authenticated user CANNOT write another user's preset", async () => {
    const db = await authedDb(OTHER_UID);
    await assertFails(setDoc(doc(db, ...presetPath(OWNER_UID)), { cols: ["x"] }));
  });

  it("a different authenticated user CANNOT read another user's preset", async () => {
    await seed(async (db) => setDoc(doc(db, ...presetPath(OWNER_UID)), { cols: ["a"] }));
    const db = await authedDb(OTHER_UID);
    await assertFails(getDoc(doc(db, ...presetPath(OWNER_UID))));
  });
});

describe("expenses — field-identity check on create/update", () => {
  it("create succeeds when loggedByUid matches the caller", async () => {
    const db = await authedDb(STAFF_UID);
    await assertSucceeds(setDoc(doc(db, "expenses", "e1"), { amount: 100, loggedByUid: STAFF_UID }));
  });

  it("create is denied when loggedByUid is someone else (spoofed attribution)", async () => {
    const db = await authedDb(STAFF_UID);
    await assertFails(setDoc(doc(db, "expenses", "e2"), { amount: 100, loggedByUid: OTHER_UID }));
  });

  it("update succeeds when updatedByUid matches the caller", async () => {
    await seed(async (db) => setDoc(doc(db, "expenses", "e1"), { amount: 100, loggedByUid: STAFF_UID }));
    const db = await authedDb(STAFF_UID);
    await assertSucceeds(updateDoc(doc(db, "expenses", "e1"), { amount: 120, updatedByUid: STAFF_UID }));
  });

  it("update is denied when updatedByUid is someone else", async () => {
    await seed(async (db) => setDoc(doc(db, "expenses", "e1"), { amount: 100, loggedByUid: STAFF_UID }));
    const db = await authedDb(STAFF_UID);
    await assertFails(updateDoc(doc(db, "expenses", "e1"), { amount: 120, updatedByUid: OTHER_UID }));
  });
});

describe("payments read — actual behavior under Spark (documents a comment/rule gap)", () => {
  // The rule is `allow read: if isStaff()`, and isStaff() === isAuth(), so ANY
  // authenticated user passes — the "pet owners never read payments" intent is
  // enforced only client-side, NOT by the rules. These tests assert the real
  // behavior so a future Blaze + custom-claims migration has a baseline to tighten.
  it("an authenticated user CAN read payments (staff clause is satisfied by any auth)", async () => {
    await seed(async (db) => setDoc(doc(db, "payments", "pay1"), { amount: 500 }));
    const db = await authedDb(OWNER_UID);
    await assertSucceeds(getDoc(doc(db, "payments", "pay1")));
  });

  it("an unauthenticated client cannot read payments (the only rule-enforced boundary)", async () => {
    await seed(async (db) => setDoc(doc(db, "payments", "pay1"), { amount: 500 }));
    const db = await unauthedDb();
    await assertFails(getDoc(doc(db, "payments", "pay1")));
  });
});
