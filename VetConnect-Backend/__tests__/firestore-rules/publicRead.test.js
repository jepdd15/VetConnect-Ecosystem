// Public-read exceptions (`read: if true`) and their locked write-side.
// These exist so the Cloudflare Worker cron can read/PATCH via the REST API with
// only the web API key (no Firebase Auth JWT). The security-critical nuance is
// that the public surface is read + update ONLY — create/delete stay locked so a
// stranger cannot POISON the reminder queues with fabricated targets.
import { describe, it, beforeAll, afterAll, afterEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { getEnv, clearData, cleanupEnv, authedDb, unauthedDb, seed } from "./helpers.js";

beforeAll(getEnv);
afterEach(clearData);
afterAll(cleanupEnv);

// The three pre-computed reminder queues all share the same access shape under
// Spark: read public, update public (Worker PATCHes lastReminderSentAt), but
// create + delete require authentication (anti-poisoning).
const REMINDER_QUEUES = [
  "vaccine_reminder_queue",
  "appointment_reminder_queue",
  "balance_reminder_queue",
];

describe("reminder queues — public read/update, locked create/delete (anti-poisoning)", () => {
  it.each(REMINDER_QUEUES)("%s: unauthenticated client can READ", async (col) => {
    await seed(async (db) => setDoc(doc(db, col, "t1"), { lastReminderSentAt: null }));
    const db = await unauthedDb();
    await assertSucceeds(getDoc(doc(db, col, "t1")));
  });

  it.each(REMINDER_QUEUES)("%s: unauthenticated client can UPDATE (Worker PATCH)", async (col) => {
    await seed(async (db) => setDoc(doc(db, col, "t1"), { lastReminderSentAt: null }));
    const db = await unauthedDb();
    await assertSucceeds(updateDoc(doc(db, col, "t1"), { lastReminderSentAt: "2026-06-08" }));
  });

  it.each(REMINDER_QUEUES)("%s: unauthenticated client CANNOT create (poisoning blocked)", async (col) => {
    const db = await unauthedDb();
    await assertFails(setDoc(doc(db, col, "evil"), { fake: true }));
  });

  it.each(REMINDER_QUEUES)("%s: unauthenticated client CANNOT delete", async (col) => {
    await seed(async (db) => setDoc(doc(db, col, "t1"), { x: 1 }));
    const db = await unauthedDb();
    await assertFails(deleteDoc(doc(db, col, "t1")));
  });

  it.each(REMINDER_QUEUES)("%s: authenticated staff CAN create + delete", async (col) => {
    const db = await authedDb();
    await assertSucceeds(setDoc(doc(db, col, "t2"), { target: true }));
    await assertSucceeds(deleteDoc(doc(db, col, "t2")));
  });
});

describe("vaccine_preferences — public read, authenticated write", () => {
  it("unauthenticated client can read", async () => {
    await seed(async (db) => setDoc(doc(db, "vaccine_preferences", "pet1"), { disabledVaccines: [] }));
    const db = await unauthedDb();
    await assertSucceeds(getDoc(doc(db, "vaccine_preferences", "pet1")));
  });

  it("unauthenticated client cannot write", async () => {
    const db = await unauthedDb();
    await assertFails(setDoc(doc(db, "vaccine_preferences", "pet1"), { disabledVaccines: ["rabies"] }));
  });

  it("authenticated pet owner can write", async () => {
    const db = await authedDb();
    await assertSucceeds(setDoc(doc(db, "vaccine_preferences", "pet1"), { disabledVaccines: ["rabies"] }));
  });
});

describe("consent_versions — public read (registration needs DPA pre-auth), admin write", () => {
  it("unauthenticated client can read", async () => {
    await seed(async (db) => setDoc(doc(db, "consent_versions", "dpa_v1"), { type: "dpa" }));
    const db = await unauthedDb();
    await assertSucceeds(getDoc(doc(db, "consent_versions", "dpa_v1")));
  });

  it("unauthenticated client cannot write", async () => {
    const db = await unauthedDb();
    await assertFails(setDoc(doc(db, "consent_versions", "dpa_v2"), { type: "dpa" }));
  });

  it("authenticated (admin==auth) can write", async () => {
    const db = await authedDb();
    await assertSucceeds(setDoc(doc(db, "consent_versions", "dpa_v2"), { type: "dpa" }));
  });
});

describe("clinic_settings — general + consent_policy are public read; other docs need auth", () => {
  it("unauthenticated client can read 'general'", async () => {
    await seed(async (db) => setDoc(doc(db, "clinic_settings", "general"), { openHour: 8 }));
    const db = await unauthedDb();
    await assertSucceeds(getDoc(doc(db, "clinic_settings", "general")));
  });

  it("unauthenticated client can read 'consent_policy'", async () => {
    await seed(async (db) => setDoc(doc(db, "clinic_settings", "consent_policy"), { v: 1 }));
    const db = await unauthedDb();
    await assertSucceeds(getDoc(doc(db, "clinic_settings", "consent_policy")));
  });

  it("unauthenticated client CANNOT read other settings docs (e.g. llm_config)", async () => {
    await seed(async (db) => setDoc(doc(db, "clinic_settings", "llm_config"), { model: "haiku" }));
    const db = await unauthedDb();
    await assertFails(getDoc(doc(db, "clinic_settings", "llm_config")));
  });

  it("authenticated client can read any settings doc", async () => {
    await seed(async (db) => setDoc(doc(db, "clinic_settings", "llm_config"), { model: "haiku" }));
    const db = await authedDb();
    await assertSucceeds(getDoc(doc(db, "clinic_settings", "llm_config")));
  });

  it("unauthenticated client cannot write settings", async () => {
    const db = await unauthedDb();
    await assertFails(setDoc(doc(db, "clinic_settings", "general"), { openHour: 9 }));
  });

  it("authenticated (admin==auth) can write settings", async () => {
    const db = await authedDb();
    await assertSucceeds(setDoc(doc(db, "clinic_settings", "general"), { openHour: 9 }));
  });
});
