/**
 * llmService.js
 *
 * LLM service utility for VetConnect AI Clinical Reasoning (T3.107).
 *
 * Architecture: Browser → Cloudflare Worker → Anthropic API
 * The API key lives exclusively in the Cloudflare Worker environment variable.
 * It never touches the browser, Firestore, or version control.
 *
 * Zero npm dependencies — uses plain fetch().
 */

// ─── Error message helpers ────────────────────────────────────────────────────

/**
 * Maps HTTP status codes and network errors to human-readable messages
 * for display in the ClinicalWorkspace LLM panel.
 *
 * @param {number|null} status - HTTP status code, or null for network errors
 * @param {string} fallback - Original error message as a last resort
 * @returns {string}
 */
function buildErrorMessage(status, fallback) {
  if (status === 401 || status === 403) {
    // If the caller extracted a real Anthropic error message (not just the
    // generic "HTTP {status}" placeholder), surface it directly so the operator
    // can see the exact reason (e.g. "Invalid API Key", "permission denied").
    if (fallback && fallback !== `HTTP ${status}`) {
      return fallback;
    }
    return 'API key invalid — check Cloudflare Worker environment variable.';
  }
  if (status === 429) {
    return 'Rate limit exceeded. Wait a moment and try again.';
  }
  if (status === 529) {
    return 'Anthropic API overloaded. Try again shortly.';
  }
  if (status === null) {
    return 'Network error. Check your internet connection and Worker URL.';
  }
  return fallback || `Unexpected error (HTTP ${status}).`;
}

// ─── Retry helper (internal — not exported) ─────────────────────────────────

const RETRYABLE_STATUSES = new Set([429, 529, 503]);
const BACKOFF_MS = [1000, 3000]; // delay before retry 2, retry 3

/**
 * Wraps fetch() with automatic retry for transient errors.
 * Returns the Response object on success OR after all retries are exhausted.
 * Throws only on network errors that persist through all retries.
 *
 * Non-retryable codes (401, 403, 400) return immediately — retrying auth or
 * bad-request errors is pointless and would mask real configuration problems.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options) {
  const maxAttempts = BACKOFF_MS.length + 1; // 3 total

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);

      // Non-retryable failure or success — return immediately
      if (response.ok || !RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }

      // Retryable status but last attempt — return the failed response
      // so the caller's existing buildErrorMessage logic handles it
      if (attempt === maxAttempts) {
        return response;
      }

      // Wait before next retry
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]));
    } catch (networkError) {
      // Network error (DNS failure, offline, CORS, etc.)
      if (attempt === maxAttempts) {
        throw networkError; // Let caller's catch block handle it
      }
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]));
    }
  }
}

// ─── User message builder ─────────────────────────────────────────────────────

/**
 * Assembles the structured clinical prompt sent as the user message.
 * Follows the PATIENT SIGNALMENT → SUBJECTIVE → OBJECTIVE format
 * that the system prompt instructs the model to analyze.
 *
 * @param {object} params
 * @param {string} params.subjective
 * @param {string} params.objective
 * @param {object} params.vitals - { temp, hr, rr, crt, bcs, pain }
 * @param {string} params.species
 * @param {string} params.breed
 * @param {string} params.age
 * @param {string|number} params.weight
 * @returns {string}
 */
export function buildUserMessage({ subjective, objective, vitals = {}, species, breed, age, weight }) {
  const { temp, hr, rr, crt, bcs, pain } = vitals;

  const vitalsLine = [
    temp  ? `Temp ${temp}°C`    : null,
    hr    ? `HR ${hr} bpm`      : null,
    rr    ? `RR ${rr}`          : null,
    crt   ? `CRT ${crt}s`       : null,
    bcs   ? `BCS ${bcs}/9`      : null,
    pain  ? `Pain ${pain}/10`   : null,
  ].filter(Boolean).join(', ') || 'Not recorded';

  return [
    'PATIENT SIGNALMENT:',
    `Species: ${species || 'Unknown'}  |  Breed: ${breed || 'Unknown'}  |  Age: ${age || 'Unknown'}  |  Weight: ${weight ? `${weight} kg` : 'Unknown'}`,
    '',
    'SUBJECTIVE (S):',
    subjective || '(not recorded)',
    '',
    'OBJECTIVE (O):',
    `Vitals: ${vitalsLine}`,
    `Notes: ${objective || '(not recorded)'}`,
    '',
    'Please analyze the above clinical presentation and provide your differential diagnosis, recommended diagnostics, and urgency assessment.',
  ].join('\n');
}

// ─── Exported API ─────────────────────────────────────────────────────────────

/**
 * Sends a multi-turn conversation to the Cloudflare Worker proxy.
 * Accepts a pre-built messages array for conversational use.
 *
 * @param {object} params
 * @param {Array<{role: 'user'|'assistant', content: string}>} params.messages
 * @param {string} params.systemPrompt - System prompt providing context
 * @param {string} params.workerUrl    - Cloudflare Worker URL
 * @returns {Promise<{ text: string, tokenCount: number | null }>}
 * @throws {Error} with a human-readable message on failure
 */
export async function chatWithHistory({ messages, systemPrompt, workerUrl }) {
  if (!workerUrl?.trim()) {
    throw new Error('Worker URL is not configured.');
  }
  if (!messages?.length) {
    throw new Error('At least one message is required.');
  }

  let response;
  try {
    response = await fetchWithRetry(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt || '',
        messages,
      }),
    });
  } catch {
    throw new Error(buildErrorMessage(null, 'Network error.'));
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      const raw = errBody?.error?.message || errBody?.error || detail;
      detail = typeof raw === 'object' ? JSON.stringify(raw) : raw;
    } catch {}
    throw new Error(buildErrorMessage(response.status, detail));
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid response from Worker — could not parse JSON.');
  }

  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new Error('Worker returned an empty response. Check the Worker logs.');
  }

  const tokenCount =
    data.usage
      ? (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
      : null;

  return { text, tokenCount };
}

/**
 * Sends a minimal test request to the Cloudflare Worker to validate
 * connectivity and API key validity without consuming significant tokens.
 *
 * @param {object} params
 * @param {string} params.workerUrl - Cloudflare Worker URL
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function testLlmConnection({ workerUrl }) {
  if (!workerUrl?.trim()) {
    return { ok: false, message: 'Worker URL is required.' };
  }

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: '',
        messages: [{ role: 'user', content: 'Respond with exactly: OK' }],
      }),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        const raw = errBody?.error?.message || errBody?.error || detail;
        detail = typeof raw === 'object' ? JSON.stringify(raw) : raw;
      } catch {}
      return { ok: false, message: buildErrorMessage(response.status, detail) };
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text;

    if (text) {
      return { ok: true, message: 'Connected — Claude Haiku 4.5 ready.' };
    }

    return { ok: false, message: 'Worker reachable but returned an empty response.' };
  } catch {
    return { ok: false, message: buildErrorMessage(null, 'Network error.') };
  }
}

// ─── Default System Prompts ───────────────────────────────────────────────────

/**
 * The default system prompt for VetConnect Clinical AI.
 * Stored in Firestore at system_prompts/clinical_reasoning on first save.
 * Clinic admins can customize it via Settings Pillar 11.
 */
export const DEFAULT_CLINICAL_SYSTEM_PROMPT = `You are VetConnect Clinical AI, assisting licensed veterinarians at Starbarks Veterinary Clinic in the Philippines. You are an advisory tool — all clinical decisions are made by the attending veterinarian.

Given a patient's SOAP data (Subjective history, Objective findings including vitals), provide:

1. DIFFERENTIAL DIAGNOSIS (ranked by likelihood)
   - List 3-5 differentials with brief reasoning
   - Assign confidence: HIGH / MODERATE / LOW for each
   - Flag any emergency/life-threatening conditions first

2. RECOMMENDED DIAGNOSTICS
   - Prioritized list of tests to confirm or rule out each differential
   - Note which tests are most cost-effective as a first step
   - Include expected findings for each differential

3. URGENCY ASSESSMENT
   - Rate: EMERGENCY / URGENT / ROUTINE
   - If EMERGENCY or URGENT, specify immediate actions

4. SPECIES-SPECIFIC CONSIDERATIONS
   - Flag breed predispositions relevant to the presentation
   - Note any species-specific drug sensitivities or contraindications
   - Consider age-related factors (pediatric, geriatric)

5. TREATMENT CONSIDERATIONS
   - Suggest initial stabilization if needed
   - Note common Philippine-available medications
   - Flag any zoonotic risk if applicable

FORMAT RULES:
- Use clear headings with the numbers above
- Be concise but thorough
- Do NOT use markdown tables — they render poorly in narrow panels. Use numbered or bulleted lists with bold labels instead (e.g., "1. **Trauma (fracture/sprain)** — HIGH — Limping is classic; wild cat at higher injury risk")
- Never diagnose definitively — always frame as differentials
- If data is insufficient, state what additional information would help
- Do not repeat the patient data back — go straight to analysis`;

/**
 * The default system prompt for VetConnect Calendar AI.
 * Stored in Firestore at system_prompts/calendar_assistant on first save.
 * Clinic admins can customize it via Settings (Day 2).
 *
 * This prompt is combined with a dynamic calendar data appendix at query time.
 */
export const DEFAULT_CALENDAR_AI_PROMPT = `You are VetConnect Scheduling AI, assisting clinic staff at Starbarks Veterinary Clinic in the Philippines with scheduling, capacity planning, and appointment management.

You have access to the clinic's current calendar data, services catalog, staff roster, clinic settings, department capacities, and inventory levels. Use this context to provide accurate, actionable scheduling intelligence.

CAPABILITIES:
1. SCHEDULE ANALYSIS — Summarize appointments for any day/week/period in view
2. SLOT FINDING — Identify available time slots considering department capacity, staff availability, and service duration
3. CONFLICT DETECTION — Flag overbooking, understaffing, equipment conflicts, or scheduling gaps
4. STAFF COORDINATION — Report who is working when, department coverage, and workload balance
5. PREPARATION NOTES — For specific appointments, suggest what to prepare based on services booked, pet history, and inventory stock
6. CAPACITY PLANNING — Analyze utilization trends and suggest optimal scheduling

CONSTRAINTS:
- You are READ-ONLY — you cannot create, modify, or cancel appointments. Suggest actions for staff to take manually.
- Do NOT provide clinical diagnosis or treatment recommendations. Redirect clinical questions to the AI Clinical Reasoning panel in the Clinical Workspace.
- Do NOT quote exact inventory quantities as guarantees — stock levels change in real time.
- When suggesting slots, always note the department and whether it has remaining capacity.

FORMAT RULES:
- Be concise and actionable — staff are busy
- Use clear headings and bullet points
- Do NOT use markdown tables — they render poorly in narrow panels. Use bold labels and lists instead.
- When listing appointments, include time, pet name, services, and status
- Highlight urgent items (overdue, conflicts, gaps) at the top
- Use Philippine peso (P) for any prices mentioned`;
