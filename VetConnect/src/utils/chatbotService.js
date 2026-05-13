// Cloudflare Worker proxy client for the Starbarks chatbot.
// Mirrors the admin llmService.js pattern but adapted for multi-turn conversation
// (messages array instead of a single clinical SOAP prompt).
// Zero dependencies -- plain fetch(), which is a React Native global.

/** @typedef {{ role: 'user' | 'assistant', content: string }} ChatMessage */

/**
 * Maps an HTTP error status to a user-friendly fallback string.
 *
 * @param {number | null} status - HTTP status code, or null for network errors.
 * @param {string} [fallback] - Generic fallback used for uncovered codes.
 * @returns {string}
 */
function buildErrorMessage(status, fallback = 'Could not get a response. Try again.') {
  // 401/403: surface the real Anthropic error when the caller extracted one,
  // otherwise show a generic user-safe message (key details stay server-side).
  if (status === 401 || status === 403) {
    if (fallback && fallback !== `HTTP ${status}`) return fallback;
    return 'Service unavailable. Contact clinic staff.';
  }
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status === 529) return 'AI service is busy. Try again shortly.';
  if (status === null) return 'Network error. Check your connection.';
  return fallback;
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

/**
 * Send a multi-turn conversation to the Cloudflare Worker and return the AI reply.
 *
 * @param {{ messages: ChatMessage[], systemPrompt: string, workerUrl: string }} params
 * @returns {Promise<{ text: string, tokenCount: number | null }>}
 * @throws {Error} with a user-friendly message on failure
 */
export async function sendChatMessage({ messages, systemPrompt, workerUrl }) {
  let response;

  try {
    response = await fetchWithRetry(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt, messages }),
    });
  } catch {
    throw new Error(buildErrorMessage(null));
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
    throw new Error('Could not parse AI response. Try again.');
  }

  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new Error('Could not get a response. Try again.');
  }

  const tokenCount = data?.usage
    ? (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0)
    : null;

  return { text, tokenCount };
}

/**
 * Production-quality default system prompt for the veterinary clinic chatbot.
 * Used when the `system_prompts/chatbot_assistant` Firestore doc does not exist yet.
 */
export const DEFAULT_CHATBOT_SYSTEM_PROMPT = `You are a Veterinary Clinic virtual assistant, helping pet owners in the Philippines. You are friendly, concise, and helpful.

WHAT YOU CAN DO:
- Answer general pet care questions (nutrition, grooming, behavior, first aid)
- Provide clinic information (hours, location, services, pricing)
- Guide users on how to book appointments through the app
- Explain common veterinary procedures in simple terms
- Offer basic pet health tips appropriate for Philippine climate and conditions

WHAT YOU MUST NOT DO:
- Never diagnose medical conditions or prescribe medications
- Never provide specific treatment plans -- always direct to a licensed veterinarian
- Never share information about other clients or their pets
- Never make promises about pricing, availability, or outcomes

WHEN ASKED ABOUT MEDICAL CONCERNS:
- Acknowledge the concern empathetically
- Suggest booking an appointment for proper examination
- If it sounds urgent, advise going to the clinic immediately or calling the emergency line
- You may share general information (e.g. "vomiting can have many causes") but never diagnose

RESPONSE STYLE:
- Keep responses under 150 words unless the question requires detail
- Use simple, warm language -- avoid medical jargon unless explaining a term
- Use Filipino cultural context when relevant (e.g. weather, common local pet issues)
- Be encouraging about regular vet visits and preventive care`;
