import { useSyncExternalStore } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { DEFAULT_CLINICAL_SYSTEM_PROMPT } from '../utils/llmService';

/**
 * Default fallback values for LLM configuration.
 */
const DEFAULT_LLM_CONFIG = {
  enabled: false,
  workerUrl: '',
  systemPrompt: DEFAULT_CLINICAL_SYSTEM_PROMPT,
};

// --- Module-level singleton store ---
let currentConfig = { ...DEFAULT_LLM_CONFIG };
let listenerUnsub = null;
const subscribers = new Set();

function notifyAll() {
  subscribers.forEach((cb) => cb());
}

/**
 * Ensures the Firestore listener is active for the LLM configuration.
 * Also performs a one-shot fetch for the custom system prompt.
 */
function ensureListener() {
  if (listenerUnsub) return;

  // 1. Live listener for the core config (enabled, workerUrl)
  listenerUnsub = onSnapshot(doc(db, 'clinic_settings', 'llm_config'), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      currentConfig = { 
        ...currentConfig, 
        enabled: data.enabled ?? false,
        workerUrl: data.workerUrl ?? '',
      };
      
      // If the config has an inline prompt, use it as fallback
      if (data.systemPrompt && !currentConfig.hasCustomPrompt) {
        currentConfig.systemPrompt = data.systemPrompt;
      }
    }
    notifyAll();
  });

  // 2. One-shot fetch for the centralized clinical system prompt
  getDoc(doc(db, 'system_prompts', 'clinical_reasoning')).then(snap => {
    if (snap.exists()) {
      const promptDoc = snap.data();
      if (promptDoc.prompt) {
        currentConfig = { 
          ...currentConfig, 
          systemPrompt: promptDoc.prompt,
          hasCustomPrompt: true 
        };
        notifyAll();
      }
    }
  }).catch(e => console.warn('[useLLMConfig] Failed to fetch system prompt:', e.message));
}

function subscribe(callback) {
  ensureListener();
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function getSnapshot() {
  return currentConfig;
}

/**
 * Returns the current LLM configuration (enabled status, worker URL, and system prompt).
 * All components share a single source of truth and a single Firestore listener.
 * 
 * @returns {object} { enabled, workerUrl, systemPrompt }
 */
export function useLLMConfig() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
