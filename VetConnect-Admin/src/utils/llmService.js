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
 * Calls the Cloudflare Worker proxy with structured clinical SOAP data
 * and returns the LLM's differential diagnosis reasoning.
 *
 * @param {object} params
 * @param {string} params.subjective      - SOAP subjective history
 * @param {string} params.objective       - SOAP objective notes
 * @param {object} params.vitals          - Vitals object { temp, hr, rr, crt, bcs, pain }
 * @param {string} params.species         - Patient species (e.g. "dog")
 * @param {string} params.breed           - Patient breed
 * @param {string} params.age             - Formatted age string
 * @param {string|number} params.weight   - Patient weight in kg
 * @param {string} params.systemPrompt    - The clinical reasoning system prompt
 * @param {string} params.workerUrl       - Cloudflare Worker URL
 * @returns {Promise<{ text: string, tokenCount: number | null }>}
 * @throws {Error} with a human-readable message on failure
 */
export async function callClinicalReasoning({
  subjective,
  objective,
  vitals,
  species,
  breed,
  age,
  weight,
  systemPrompt,
  workerUrl,
}) {
  const userMessage = buildUserMessage({ subjective, objective, vitals, species, breed, age, weight });

  let response;
  try {
    response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt || '',
        messages: [{ role: 'user', content: userMessage }],
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
 * Sends a multi-turn conversation to the Cloudflare Worker proxy.
 * Unlike callClinicalReasoning (which builds a single structured message),
 * this function accepts a pre-built messages array for conversational use.
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
    response = await fetch(workerUrl, {
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

// ─── Default System Prompt ────────────────────────────────────────────────────

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
