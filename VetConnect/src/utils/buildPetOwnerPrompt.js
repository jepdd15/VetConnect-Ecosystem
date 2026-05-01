/**
 * buildPetOwnerPrompt.js
 *
 * Assembles a pet's medical history into a system prompt for the
 * mobile AI Pet History Assistant (T4.97).
 *
 * CRITICAL SAFETY DESIGN:
 * - Safety guardrails appear FIRST, before any patient data
 * - Raw SOAP fields (subjective, objectiveNotes, plan) are NEVER included
 * - Only client-appropriate fields are surfaced: diagnosis, vitals (weight/temp/HR/RR),
 *   medications with instructions, discharge summaries, lab results, and vaccinations
 * - Owner is the user — no need to include owner name
 */

/**
 * Calculates a pet's age from a date-of-birth value.
 * Accepts Firestore Timestamps, seconds-epoch objects, Date instances, or strings.
 * Returns full-word descriptions ("2 years old", "4 months") for a warm owner-facing tone.
 *
 * @param {any} dob - Raw date-of-birth value from Firestore
 * @returns {string}
 */
function calculatePetAge(dob) {
  if (!dob) return 'Unknown';
  try {
    const birthDate = dob?.toDate ? dob.toDate() : new Date(dob);
    if (isNaN(birthDate.getTime())) return 'Unknown';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 0) return 'Unknown';
    if (age === 0) {
      const months = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24 * 30.44));
      return months > 0 ? `${months} month${months !== 1 ? 's' : ''} old` : 'Newborn';
    }
    return `${age} year${age !== 1 ? 's' : ''} old`;
  } catch {
    return 'Unknown';
  }
}

/**
 * Resolves a Firestore Timestamp, seconds-epoch object, Date, or date string
 * to a formatted date string. Returns 'N/A' on failure.
 *
 * @param {any} raw - Raw date value
 * @returns {string}
 */
function formatDate(raw) {
  if (!raw) return 'N/A';
  try {
    let date;
    if (raw?.toDate) date = raw.toDate();
    else if (raw?.seconds != null) date = new Date(raw.seconds * 1000);
    else if (raw instanceof Date) date = raw;
    else date = new Date(raw);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return 'N/A';
  }
}

/**
 * Builds the client-safe AI system prompt for the Pet History Assistant.
 *
 * @param {object} params
 * @param {object} params.pet           - Pet profile document (name, species, breed, dob, allergies, gender, isNeutered)
 * @param {Array}  params.records       - All medical record documents for this pet (raw, no cap)
 * @param {Array}  params.vaccinations  - Subset of records that contain vaccineAdministrations or vaccineData
 * @returns {string} System prompt string
 */
export function buildPetOwnerPrompt({ pet, records, vaccinations }) {
  const lines = [];
  const safeRecords = records || [];
  const safeVaccinations = vaccinations || [];

  // ── Persona ──────────────────────────────────────────────────────────────
  lines.push(
    'You are VetConnect Pet Health Assistant, helping pet owners understand their ' +
    "pet's medical records at Starbarks Veterinary Clinic in the Philippines.",
  );
  lines.push('');

  // ── Safety guardrails — MUST precede all patient data ────────────────────
  lines.push('CRITICAL RULES YOU MUST ALWAYS FOLLOW:');
  lines.push('1. NEVER diagnose medical conditions or suggest specific diagnoses.');
  lines.push('2. NEVER recommend treatments, medications, or dosage changes.');
  lines.push('3. NEVER suggest changing, stopping, or starting any medication.');
  lines.push(
    '4. When answering questions about symptoms, conditions, or treatments, ALWAYS end with: ' +
    '"Please consult your veterinarian for medical advice."',
  );
  lines.push(
    '5. Use simple, reassuring language. Explain medical terms when you must use them, ' +
    'with a plain-English explanation in parentheses immediately after.',
  );
  lines.push('6. If you are unsure or the information is not in the records, say so honestly.');
  lines.push('7. Keep responses concise — under 200 words unless the question genuinely needs more detail.');
  lines.push('');

  // ── Response style ────────────────────────────────────────────────────────
  lines.push('RESPONSE STYLE:');
  lines.push(
    'Use warm, supportive language. Avoid jargon. When you use a medical term, ' +
    'follow it with a plain-English explanation in parentheses. ' +
    'Always be encouraging and empathetic.',
  );
  lines.push('');

  // ── Patient signalment ────────────────────────────────────────────────────
  lines.push('--- PATIENT PROFILE ---');
  lines.push(`Name: ${pet?.name || 'Unknown'}`);
  if (pet?.species) lines.push(`Species: ${pet.species}`);
  if (pet?.breed) lines.push(`Breed: ${pet.breed}`);
  if (pet?.gender) {
    const neuterStatus = pet.isNeutered ? ' (neutered/spayed)' : '';
    lines.push(`Sex: ${pet.gender}${neuterStatus}`);
  }
  if (pet?.dob) lines.push(`Age: ${calculatePetAge(pet.dob)}`);
  if (pet?.allergies && String(pet.allergies).trim()) {
    lines.push(`Known Allergies: ${pet.allergies}`);
  } else {
    lines.push('Known Allergies: None on record');
  }
  lines.push('');

  // ── Medical records ───────────────────────────────────────────────────────
  if (safeRecords.length > 0) {
    lines.push(`--- MEDICAL RECORDS (${safeRecords.length} total, newest first) ---`);

    safeRecords.forEach((r, idx) => {
      lines.push('');
      lines.push(`[Visit ${idx + 1}]`);
      lines.push(`Date: ${formatDate(r.date)}`);
      if (r.serviceType) lines.push(`Service: ${r.serviceType}`);
      if (r.serviceNames?.length > 0) lines.push(`Services: ${r.serviceNames.join(', ')}`);
      if (r.vetName) lines.push(`Veterinarian: ${r.vetName}`);

      // Vitals — weight, temp, HR, RR only (BCS/CRT/pain are clinician-facing)
      const hasVitals = r.vitals && (
        r.vitals.weight != null ||
        r.vitals.temp   != null ||
        r.vitals.hr     != null ||
        r.vitals.rr     != null
      );
      if (hasVitals) {
        const vitalParts = [];
        if (r.vitals.weight != null && r.vitals.weight !== '') vitalParts.push(`Weight: ${r.vitals.weight} kg`);
        if (r.vitals.temp   != null && r.vitals.temp   !== '') vitalParts.push(`Temperature: ${r.vitals.temp} °C`);
        if (r.vitals.hr     != null && r.vitals.hr     !== '') vitalParts.push(`Heart Rate: ${r.vitals.hr} bpm`);
        if (r.vitals.rr     != null && r.vitals.rr     !== '') vitalParts.push(`Respiratory Rate: ${r.vitals.rr} br/min`);
        if (vitalParts.length > 0) lines.push(`Vitals: ${vitalParts.join(' | ')}`);
      }

      // Diagnosis — from top-level field or SOAP assessment ONLY (never soap.subjective/objectiveNotes/plan)
      const diagnosis = r.diagnosis || r.soap?.assessment;
      if (diagnosis) lines.push(`Diagnosis / Assessment: ${diagnosis}`);
      if (r.patientStatus) lines.push(`Patient Status: ${r.patientStatus}`);

      // Medications with instructions (drug items only, with instructions)
      const meds = (r.dispensedProducts || r.prescriptions || []).filter(rx => rx.isDrug);
      if (meds.length > 0) {
        lines.push('Medications:');
        meds.forEach(rx => {
          lines.push(`  - ${rx.name}: ${rx.instructions || 'Use as directed'}`);
        });
      }

      // Other dispensed items (non-drug)
      const otherItems = (r.dispensedProducts || r.prescriptions || []).filter(rx => !rx.isDrug);
      if (otherItems.length > 0) {
        lines.push('Other Items Dispensed:');
        otherItems.forEach(item => {
          lines.push(`  - ${item.name}${item.instructions ? ': ' + item.instructions : ''}`);
        });
      }

      // Lab results — includes unit and reference range for richer AI context
      if (r.labResults?.length > 0) {
        lines.push('Lab Results:');
        r.labResults.forEach(lab => {
          let line = `  - ${lab.testName}: ${lab.result}`;
          if (lab.unit) line += ` ${lab.unit}`;
          if (lab.referenceRange) {
            const range = lab.referenceRange;
            if (Array.isArray(range) && range.length === 2) {
              line += ` (ref: ${range[0]}-${range[1]})`;
            } else if (typeof range === 'object') {
              const speciesKey = (pet?.species || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
              const resolved = range[speciesKey];
              if (Array.isArray(resolved)) {
                line += ` (ref: ${resolved[0]}-${resolved[1]})`;
              } else {
                const parts = [];
                if (range.canine) parts.push(`Dog: ${range.canine[0]}-${range.canine[1]}`);
                if (range.feline) parts.push(`Cat: ${range.feline[0]}-${range.feline[1]}`);
                if (parts.length) line += ` (ref: ${parts.join(', ')})`;
              }
            }
          }
          line += ` (${lab.status || 'normal'})`;
          lines.push(line);
        });
      }

      // Discharge summary — these are explicitly client-facing going-home instructions
      if (r.dischargeSummary) {
        const ds = r.dischargeSummary;
        lines.push('Going-Home Instructions:');
        if (ds.diagnosis) lines.push(`  Summary: ${ds.diagnosis}`);
        if (ds.instructions) lines.push(`  Instructions: ${ds.instructions}`);
        if (ds.medications?.length > 0) {
          lines.push('  Discharge Medications:');
          ds.medications.forEach(med => {
            lines.push(`    - ${med.name} x${med.qty || 1}: ${med.instructions || 'Use as directed'}`);
          });
        }
        if (ds.nextVisit) lines.push(`  Follow-Up Due: ${formatDate(ds.nextVisit)}`);
      }

      // Vaccine administrations
      const vaxItems = r.vaccineAdministrations?.length > 0
        ? r.vaccineAdministrations
        : (r.vaccineData ? [r.vaccineData] : []);
      if (vaxItems.length > 0) {
        lines.push('Vaccines Given:');
        vaxItems.forEach(vax => {
          let vaxLine = `  - ${vax.vaccineName || 'Unknown vaccine'}`;
          if (vax.manufacturer) vaxLine += ` (${vax.manufacturer})`;
          if (vax.dueDate) vaxLine += ` | Next due: ${formatDate(vax.dueDate)}`;
          lines.push(vaxLine);
        });
      }
    });

    lines.push('');
  } else {
    lines.push('--- MEDICAL RECORDS ---');
    lines.push('No medical records available yet.');
    lines.push('');
  }

  // ── Vaccination status summary ────────────────────────────────────────────
  if (safeVaccinations.length > 0) {
    lines.push('--- CURRENT VACCINATION STATUS ---');

    // Flatten all vaccine administrations, then keep only the most recent per vaccine name
    const allAdmins = safeVaccinations.flatMap(r => {
      const recordDate = r.date;
      const items = r.vaccineAdministrations?.length > 0
        ? r.vaccineAdministrations
        : (r.vaccineData ? [r.vaccineData] : []);
      return items.map(vax => ({ ...vax, recordDate }));
    });

    const seenVaccines = new Set();
    const latestByVaccine = allAdmins.filter(vax => {
      const key = (vax.vaccineName || 'Unknown').toLowerCase();
      if (seenVaccines.has(key)) return false;
      seenVaccines.add(key);
      return true;
    });

    const now = new Date();
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    latestByVaccine.forEach(vax => {
      const name = vax.vaccineName || 'Unknown vaccine';
      const lastDate = formatDate(vax.recordDate);
      let status = 'CURRENT';
      if (vax.dueDate) {
        try {
          const dueRaw = vax.dueDate;
          const due = dueRaw?.toDate ? dueRaw.toDate()
            : dueRaw?.seconds != null ? new Date(dueRaw.seconds * 1000)
            : new Date(dueRaw);
          if (!isNaN(due.getTime())) {
            if (due < now) status = 'OVERDUE';
            else if (due < thirtyDays) status = 'DUE SOON';
          }
        } catch { /* skip */ }
      }
      lines.push(`  ${name}: Last given ${lastDate} — Status: ${status}`);
    });
    lines.push('');
  }

  // ── Weight trend (last 10 readings, newest first) ─────────────────────────
  const weightReadings = safeRecords
    .filter(r => r.vitals?.weight != null && r.vitals.weight !== '')
    .sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : a.date?.seconds ? new Date(a.date.seconds * 1000) : new Date(0);
      const db = b.date?.toDate ? b.date.toDate() : b.date?.seconds ? new Date(b.date.seconds * 1000) : new Date(0);
      return db - da;
    })
    .slice(0, 10)
    .map(r => `${formatDate(r.date)}: ${r.vitals.weight} kg`);

  if (weightReadings.length > 0) {
    lines.push('--- WEIGHT TREND (newest first) ---');
    weightReadings.forEach(w => lines.push(`  ${w}`));
    lines.push('');
  }

  return lines.join('\n');
}
