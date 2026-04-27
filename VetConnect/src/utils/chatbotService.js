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
  if (status === 401 || status === 403) return 'Service unavailable. Contact clinic staff.';
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status === 529) return 'AI service is busy. Try again shortly.';
  if (status === null) return 'Network error. Check your connection.';
  return fallback;
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
    response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt, messages }),
    });
  } catch {
    throw new Error(buildErrorMessage(null));
  }

  if (!response.ok) {
    throw new Error(buildErrorMessage(response.status));
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
 * Production-quality default system prompt for the Starbarks chatbot.
 * Used when the `system_prompts/chatbot_assistant` Firestore doc does not exist yet.
 */
export const DEFAULT_CHATBOT_SYSTEM_PROMPT = `You are the Starbarks Veterinary Clinic virtual assistant, helping pet owners in the Philippines. You are friendly, concise, and helpful.

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
