// Appointment field-level conditionals — the forensic backbone of the booking +
// clinical lifecycle. These are the most distinctive (and most fragile) rules:
// closed-date enforcement, terminal-status audit reasons, the no-show gate, the
// forensicSeal-on-triage requirement, the no-revert-triage guard, and the
// append-only clinicalPulse array.
import { describe, it, beforeAll, afterAll, afterEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteField } from "firebase/firestore";
import { getEnv, clearData, cleanupEnv, authedDb, seed } from "./helpers.js";

beforeAll(getEnv);
afterEach(clearData);
afterAll(cleanupEnv);

const OPEN_DATE = "2026-06-15";
const CLOSED_DATE = "2026-12-25";

// Baseline appointment a1: confirmed, on an open date, no triage/pulse — so a
// minimal updateDoc trips ONLY the conjunct under test.
async function seedAppt(extra = {}) {
  await seed(async (db) =>
    setDoc(doc(db, "appointments", "a1"), { status: "confirmed", scheduledDateStr: OPEN_DATE, ...extra }),
  );
}
async function seedClosedDates() {
  await seed(async (db) => setDoc(doc(db, "clinic_settings", "general"), { closedDates: [CLOSED_DATE] }));
}

describe("closed-date enforcement", () => {
  it("create on an open date is allowed", async () => {
    const db = await authedDb();
    await assertSucceeds(setDoc(doc(db, "appointments", "c1"), { status: "pending", scheduledDateStr: OPEN_DATE }));
  });

  it("create on a clinic-closed date is denied", async () => {
    await seedClosedDates();
    const db = await authedDb();
    await assertFails(setDoc(doc(db, "appointments", "c2"), { status: "pending", scheduledDateStr: CLOSED_DATE }));
  });

  it("update moving an appointment onto a closed date is denied", async () => {
    await seedAppt();
    await seedClosedDates();
    const db = await authedDb();
    await assertFails(updateDoc(doc(db, "appointments", "a1"), { scheduledDateStr: CLOSED_DATE }));
  });
});

describe("terminal status requires a non-empty auditReason", () => {
  it("cancelling without an auditReason is denied", async () => {
    await seedAppt();
    const db = await authedDb();
    await assertFails(updateDoc(doc(db, "appointments", "a1"), { status: "cancelled" }));
  });

  it("cancelling WITH a non-empty auditReason is allowed", async () => {
    await seedAppt();
    const db = await authedDb();
    await assertSucceeds(updateDoc(doc(db, "appointments", "a1"), { status: "cancelled", auditReason: "client requested" }));
  });

  it("no-show without an auditReason is denied", async () => {
    await seedAppt();
    const db = await authedDb();
    await assertFails(updateDoc(doc(db, "appointments", "a1"), { status: "no-show" }));
  });

  it("no-show WITH an auditReason is allowed (staff gate collapses to auth under Spark)", async () => {
    await seedAppt();
    const db = await authedDb();
    await assertSucceeds(updateDoc(doc(db, "appointments", "a1"), { status: "no-show", auditReason: "did not arrive" }));
  });
});

describe("forensicSeal must accompany isTriaged becoming true, and triage cannot revert", () => {
  it("setting isTriaged true WITHOUT a forensicSeal is denied", async () => {
    await seedAppt();
    const db = await authedDb();
    await assertFails(updateDoc(doc(db, "appointments", "a1"), { isTriaged: true }));
  });

  it("setting isTriaged true WITH a forensicSeal is allowed", async () => {
    await seedAppt();
    const db = await authedDb();
    await assertSucceeds(updateDoc(doc(db, "appointments", "a1"), { isTriaged: true, forensicSeal: { hash: "abc123" } }));
  });

  it("reverting isTriaged from true back to false is denied", async () => {
    await seedAppt({ isTriaged: true, forensicSeal: { hash: "abc123" } });
    const db = await authedDb();
    await assertFails(updateDoc(doc(db, "appointments", "a1"), { isTriaged: false }));
  });
});

describe("clinicalPulse is append-only — can only grow, never shrink or be erased", () => {
  it("shrinking the clinicalPulse array is denied", async () => {
    await seedAppt({ clinicalPulse: [{ e: 1 }, { e: 2 }] });
    const db = await authedDb();
    await assertFails(updateDoc(doc(db, "appointments", "a1"), { clinicalPulse: [{ e: 1 }] }));
  });

  it("growing the clinicalPulse array is allowed", async () => {
    await seedAppt({ clinicalPulse: [{ e: 1 }, { e: 2 }] });
    const db = await authedDb();
    await assertSucceeds(updateDoc(doc(db, "appointments", "a1"), { clinicalPulse: [{ e: 1 }, { e: 2 }, { e: 3 }] }));
  });

  it("erasing the clinicalPulse array entirely is denied", async () => {
    await seedAppt({ clinicalPulse: [{ e: 1 }, { e: 2 }] });
    const db = await authedDb();
    await assertFails(updateDoc(doc(db, "appointments", "a1"), { clinicalPulse: deleteField() }));
  });
});
