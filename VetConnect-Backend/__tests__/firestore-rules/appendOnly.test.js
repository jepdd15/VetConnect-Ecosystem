// Append-only / immutability invariants — the audit-trail backbone.
// Two families:
//   A. Fully append-only: create is allowed (to an authed principal) but UPDATE
//      and DELETE are denied to everyone — the log/payment, once written, is frozen.
//   B. Mutable-but-permanent: create + update allowed, but DELETE is denied — the
//      document can evolve (corrections, refunds) yet can never be erased.
import { describe, it, beforeAll, afterAll, afterEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { getEnv, clearData, cleanupEnv, authedDb, seed, OWNER_UID, STAFF_UID } from "./helpers.js";

beforeAll(getEnv);
afterEach(clearData);
afterAll(cleanupEnv);

// Family A — create allowed, update + delete denied for everyone.
const FROZEN_AFTER_CREATE = [
  "inventory_logs",
  "service_logs",
  "staff_logs",
  "settings_logs",
  "auth_logs",
  "llm_audit_logs",
  "payments",
];

describe("append-only — frozen after create (no update, no delete)", () => {
  it.each(FROZEN_AFTER_CREATE)("%s: authenticated create is allowed", async (col) => {
    const db = await authedDb();
    await assertSucceeds(setDoc(doc(db, col, "log1"), { at: "2026-06-08", actor: "staff_alice" }));
  });

  it.each(FROZEN_AFTER_CREATE)("%s: update is denied even for authenticated staff", async (col) => {
    await seed(async (db) => setDoc(doc(db, col, "log1"), { at: "2026-06-08" }));
    const db = await authedDb();
    await assertFails(updateDoc(doc(db, col, "log1"), { tampered: true }));
  });

  it.each(FROZEN_AFTER_CREATE)("%s: delete is denied even for authenticated staff", async (col) => {
    await seed(async (db) => setDoc(doc(db, col, "log1"), { at: "2026-06-08" }));
    const db = await authedDb();
    await assertFails(deleteDoc(doc(db, col, "log1")));
  });
});

// Family B — create + update allowed, delete denied.
const MUTABLE_BUT_PERMANENT = [
  "medical_records",
  "sales",
  "daily_closings",
];

describe("immutable delete — record can evolve but never be erased", () => {
  it.each(MUTABLE_BUT_PERMANENT)("%s: authenticated create + update are allowed", async (col) => {
    const db = await authedDb();
    await assertSucceeds(setDoc(doc(db, col, "r1"), { v: 1 }));
    await assertSucceeds(updateDoc(doc(db, col, "r1"), { v: 2 }));
  });

  it.each(MUTABLE_BUT_PERMANENT)("%s: delete is denied even for authenticated staff", async (col) => {
    await seed(async (db) => setDoc(doc(db, col, "r1"), { v: 1 }));
    const db = await authedDb();
    await assertFails(deleteDoc(doc(db, col, "r1")));
  });
});

describe("pets/{petId}/problems — structured problem list is delete-blocked for audit integrity", () => {
  it("authenticated staff can create + update a problem", async () => {
    await seed(async (db) => setDoc(doc(db, "pets", "pet1"), { ownerId: "owner_bob" }));
    const db = await authedDb();
    await assertSucceeds(setDoc(doc(db, "pets", "pet1", "problems", "p1"), { title: "otitis" }));
    await assertSucceeds(updateDoc(doc(db, "pets", "pet1", "problems", "p1"), { status: "resolved" }));
  });

  it("delete of a problem is permanently denied", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "pets", "pet1"), { ownerId: "owner_bob" });
      await setDoc(doc(db, "pets", "pet1", "problems", "p1"), { title: "otitis" });
    });
    const db = await authedDb();
    await assertFails(deleteDoc(doc(db, "pets", "pet1", "problems", "p1")));
  });
});

describe("users/{uid}/consent_records — immutable consent audit trail (RA 10173)", () => {
  const recPath = (uid) => ["users", uid, "consent_records", "cr1"];

  it("the owner can create their own consent record", async () => {
    const db = await authedDb(OWNER_UID);
    await assertSucceeds(setDoc(doc(db, ...recPath(OWNER_UID)), { type: "dpa", version: 1 }));
  });

  it("staff can create a consent record on a client's behalf", async () => {
    const db = await authedDb(STAFF_UID);
    await assertSucceeds(setDoc(doc(db, ...recPath(OWNER_UID)), { type: "waiver", version: 1 }));
  });

  it("update is denied — consent records are immutable once written", async () => {
    await seed(async (db) => setDoc(doc(db, ...recPath(OWNER_UID)), { type: "dpa", version: 1 }));
    const db = await authedDb(STAFF_UID);
    await assertFails(updateDoc(doc(db, ...recPath(OWNER_UID)), { version: 2 }));
  });

  it("delete is denied — consent records are immutable once written", async () => {
    await seed(async (db) => setDoc(doc(db, ...recPath(OWNER_UID)), { type: "dpa", version: 1 }));
    const db = await authedDb(STAFF_UID);
    await assertFails(deleteDoc(doc(db, ...recPath(OWNER_UID))));
  });
});
