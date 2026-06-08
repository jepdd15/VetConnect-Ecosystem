// Shared harness for the Firestore security-rules suite (T4.250).
//
// initializeTestEnvironment loads firestore.rules into the local emulator and
// hands out per-identity Firestore clients. We model only what the rules can
// actually distinguish:
//   - authedDb(uid)  → an authenticated principal. Under the Spark workaround
//                      isStaff() === isAdmin() === isAuth(), so "staff", "admin"
//                      and "pet owner" are all just authenticated users; the only
//                      axis the rules can tell apart is uid identity (isOwner) and
//                      request-field identity checks (e.g. expenses.loggedByUid).
//   - unauthedDb()   → no JWT. This is the Cloudflare Worker hitting Firestore via
//                      the REST API with only the web API key (the reminder-queue
//                      public-read/update path), and any anonymous client.
// seed() writes fixtures with rules DISABLED so tests can set up pre-existing docs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";

const here = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(here, "../../firestore.rules");

export const PROJECT_ID = "demo-vetconnect";

// Canonical identities reused across files.
export const STAFF_UID = "staff_alice";   // any authenticated user == staff under Spark
export const OWNER_UID = "owner_bob";      // resource owner
export const OTHER_UID = "owner_carol";    // a different authenticated user

let _env;

export async function getEnv() {
  if (!_env) {
    _env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(RULES_PATH, "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  }
  return _env;
}

export async function clearData() {
  if (_env) await _env.clearFirestore();
}

export async function cleanupEnv() {
  if (_env) {
    await _env.cleanup();
    _env = undefined;
  }
}

/** Firestore handle for an authenticated principal (defaults to staff). */
export async function authedDb(uid = STAFF_UID) {
  return (await getEnv()).authenticatedContext(uid).firestore();
}

/** Firestore handle for an unauthenticated client (Worker REST / anonymous). */
export async function unauthedDb() {
  return (await getEnv()).unauthenticatedContext().firestore();
}

/** Seed fixture docs bypassing rules. fn receives a rules-disabled Firestore. */
export async function seed(fn) {
  const env = await getEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}
