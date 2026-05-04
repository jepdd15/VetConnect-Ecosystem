/**
 * buildPetHistoryPrompt.js
 *
 * Assembles a pet's complete medical history into a structured system prompt
 * for the AI History Assistant (T4.96 admin, T4.97 mobile).
 *
 * Design: clinically relevant data only. No Firestore coupling — all data
 * is passed as plain objects from the caller's existing state.
 */

import { calculatePetAge } from './printUtils';
import { resolveVitals } from './resolveVitals';
import { resolveObjectiveText } from './examUtils';

/**
 * Builds a structured system prompt from a pet's full medical history.
 *
 * @param {object} params
 * @param {object} params.pet          - Pet document { name, species, breed, dob, gender, isNeutered, petAllergies/allergies }
 * @param {object} params.owner        - Owner document { fullName, displayName, phone, email }
 * @param {Array}  params.records      - medical_records array (newest-first from PatientDashboard state)
 * @param {Array}  params.vaccinations - vaccinationStatus array from useMemo (name, status, lastDate, daysUntilDue)
 * @returns {string} System prompt
 */
export function buildPetHistoryPrompt({ pet, owner, records, vaccinations }) {
  const lines = [];

  lines.push('You are VetConnect AI History Assistant, supporting licensed veterinarians at Starbarks Veterinary Clinic in the Philippines.');
  lines.push('You have access to the complete medical history of the patient described below.');
  lines.push('Answer questions accurately based ONLY on the provided records. If the answer is not in the records, say so.');
  lines.push('Be clinical, concise, and suitable for a licensed veterinarian audience.');
  lines.push('Use markdown formatting: headings, bold, numbered lists, bullet lists. Do NOT use markdown tables — they render poorly in narrow panels. Use lists with bold labels instead.');
  lines.push('Never fabricate data. Never diagnose. Frame observations as findings from the records.');
  lines.push('');

  // ── Patient Signalment ──────────────────────────────────────────────────────
  const allergies = pet?.petAllergies || pet?.allergies || 'None recorded';
  const sex = pet?.gender === 'Male'
    ? (pet?.isNeutered ? 'Male Neutered' : 'Male Intact')
    : pet?.gender === 'Female'
      ? (pet?.isNeutered ? 'Female Spayed' : 'Female Intact')
      : 'Unknown';

  lines.push('## PATIENT SIGNALMENT');
  lines.push(`- Name: ${pet?.name || 'Unknown'}`);
  lines.push(`- Species: ${pet?.species || 'Unknown'}`);
  lines.push(`- Breed: ${pet?.breed || 'Unknown'}`);
  lines.push(`- Age: ${calculatePetAge(pet?.dob) || 'Unknown'}`);
  lines.push(`- Sex: ${sex}`);
  lines.push(`- Weight: ${pet?.weight ? `${pet.weight} kg` : 'Not recorded'}`);
  lines.push(`- Allergies: ${allergies}`);
  lines.push(`- Owner: ${owner?.fullName || owner?.displayName || 'Unknown'}`);
  lines.push('');

  // ── Medical Records (SOAP) ──────────────────────────────────────────────────
  const safeRecords = records || [];

  if (safeRecords.length > 0) {
    lines.push(`## MEDICAL RECORDS (${safeRecords.length} total)`);

    safeRecords.forEach((r, i) => {
      const date = r.date?.toDate
        ? r.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : r.date?.seconds
          ? new Date(r.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Unknown date';
      const type = r.recordType || 'medical';
      const vet = r.vetName || 'Unknown';

      lines.push(`### Record ${i + 1} — ${date} [${type}] (Dr. ${vet})`);

      // Vitals
      const v = resolveVitals(r);
      const vParts = [];
      if (v.weight) vParts.push(`Weight: ${v.weight} kg`);
      if (v.temp)   vParts.push(`Temp: ${v.temp}°C`);
      if (v.hr)     vParts.push(`HR: ${v.hr} bpm`);
      if (v.rr)     vParts.push(`RR: ${v.rr}`);
      if (v.crt)    vParts.push(`CRT: ${v.crt}s`);
      if (v.bcs)    vParts.push(`BCS: ${v.bcs}/9`);
      if (v.pain)   vParts.push(`Pain: ${v.pain}/10`);
      if (vParts.length) lines.push(`- Vitals: ${vParts.join(', ')}`);

      // SOAP
      if (r.soap?.subjective)    lines.push(`- S: ${r.soap.subjective}`);
      const objText = resolveObjectiveText(r);
      if (objText) lines.push(`- O: ${objText}`);
      // Structured diagnoses (T4.141) — list all with severity; fall back to legacy SOAP/string
      if (r.diagnoses?.length > 0) {
        const dxList = r.diagnoses.map(d => d.severity ? `${d.name} (${d.severity})` : d.name).join(', ');
        lines.push(`- A (Diagnoses): ${dxList}`);
        if (r.assessmentNotes) lines.push(`- A (Notes): ${r.assessmentNotes}`);
      } else if (r.soap?.assessment) {
        lines.push(`- A: ${r.soap.assessment}`);
        if (r.assessmentNotes) lines.push(`- A (Notes): ${r.assessmentNotes}`);
      } else if (r.diagnosis) {
        lines.push(`- Diagnosis: ${r.diagnosis}`);
        if (r.assessmentNotes) lines.push(`- A (Notes): ${r.assessmentNotes}`);
      }
      if (r.soap?.plan)          lines.push(`- P: ${r.soap.plan}`);

      // Legacy plain fields (only if SOAP plan absent)
      if (!r.soap?.plan && r.treatment)        lines.push(`- Treatment: ${r.treatment}`);

      // Medications / prescriptions
      const rxItems = r.dispensedProducts || r.prescriptions || [];
      const drugs = rxItems.filter(rx => rx.isDrug || rx.isMedicine);
      if (drugs.length > 0) {
        const drugList = drugs.map(rx => {
          const parts = [rx.name];
          if (rx.instructions) parts.push(`(${rx.instructions})`);
          return parts.join(' ');
        }).join('; ');
        lines.push(`- Medications: ${drugList}`);
      }

      // Lab results — handles both array and legacy string forms.
      // Includes unit and species-resolved reference range for richer AI context.
      if (Array.isArray(r.labResults) && r.labResults.length > 0) {
        const speciesKey = (pet?.species || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
        const labList = r.labResults.map(l => {
          let parts = `${l.testName}: ${l.result}`;
          if (l.unit) parts += ` ${l.unit}`;
          if (l.referenceRange) {
            // Prefer species-specific range; fall back to array or skip if neither resolves
            const range = l.referenceRange?.[speciesKey] || l.referenceRange;
            if (Array.isArray(range) && range.length === 2) {
              parts += ` (ref: ${range[0]}-${range[1]})`;
            }
          }
          if (l.status && l.status !== 'normal') parts += ` [${l.status}]`;
          return parts;
        }).join('; ');
        lines.push(`- Lab Results: ${labList}`);
      } else if (typeof r.labResults === 'string' && r.labResults.trim()) {
        lines.push(`- Lab Results: ${r.labResults}`);
      }

      // Vaccine administrations this visit
      const vaxAdmins = r.vaccineAdministrations || (r.vaccineData ? [r.vaccineData] : []);
      if (vaxAdmins.length > 0) {
        lines.push(`- Vaccines Given: ${vaxAdmins.map(va => va.vaccineName || 'Unknown').join(', ')}`);
      }

      // Attachment count (for context — no content sent)
      if (r.attachments?.length > 0) {
        lines.push(`- Attachments: ${r.attachments.length} file(s)`);
      }

      // Amendments
      if (r.amendments?.length > 0) {
        r.amendments.forEach(a => {
          lines.push(`  - Amendment (${a.field || 'general'}): "${a.newValue || a.text}" by ${a.staffName || 'staff'}`);
        });
      }

      lines.push('');
    });
  } else {
    lines.push('## MEDICAL RECORDS');
    lines.push('No medical records on file.');
    lines.push('');
  }

  // ── Vaccination Status Summary ──────────────────────────────────────────────
  const safeVax = vaccinations || [];
  if (safeVax.length > 0) {
    lines.push('## VACCINATION STATUS');
    safeVax.forEach(v => {
      const dateStr = v.lastDate
        ? v.lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Never';
      const statusLabel = v.status === 'overdue'   ? 'OVERDUE'
        : v.status === 'due_soon' ? 'DUE SOON'
        : v.status === 'current'  ? 'Current'
        : 'Not administered';
      const duePart = v.daysUntilDue != null
        ? ` (${v.daysUntilDue > 0 ? `due in ${v.daysUntilDue}d` : `${Math.abs(v.daysUntilDue)}d overdue`})`
        : '';
      lines.push(`- ${v.name}: ${statusLabel} — Last: ${dateStr}${duePart}`);
    });
    lines.push('');
  }

  // ── Weight Trend (last 10 readings, newest first) ───────────────────────────
  const weightReadings = (records || [])
    .map(r => {
      const rv2 = resolveVitals(r);
      if (!rv2.weight) return null;
      const date = r.date?.toDate
        ? r.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : r.date?.seconds
          ? new Date(r.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '?';
      return `${date}: ${rv2.weight} kg`;
    })
    .filter(Boolean)
    .slice(0, 10);

  if (weightReadings.length > 0) {
    lines.push('## WEIGHT TREND (newest first)');
    weightReadings.forEach(w => lines.push(`- ${w}`));
    lines.push('');
  }

  return lines.join('\n');
}
