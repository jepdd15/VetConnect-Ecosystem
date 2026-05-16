/**
 * examUtils.js (Mobile)
 *
 * Ported from VetConnect-Admin/src/utils/examUtils.js
 * Constants and utilities for the structured physical exam checklist.
 * Defines body system templates, conversion to text, and data-presence checks.
 *
 * NOTE: This is a mobile-only subset. We intentionally omit resolveObjectiveText
 * and examSummaryLine — the mobile app uses hasExamData + examToText directly
 * on item.objectiveExam, never falling back to legacy free-text fields.
 */

/** The 10 body systems in standard small-animal exam order */
export const BODY_SYSTEMS = [
  'General Appearance',
  'EENT',
  'Cardiovascular',
  'Respiratory',
  'Gastrointestinal',
  'Musculoskeletal',
  'Integumentary',
  'Lymph Nodes',
  'Neurological',
  'Urogenital',
];

export const DENTAL_GRADES = [
  { value: null, label: '— Not Examined —' },
  { value: 0, label: 'Grade 0 — No calculus/gingivitis' },
  { value: 1, label: 'Grade 1 — Mild gingivitis' },
  { value: 2, label: 'Grade 2 — Moderate calculus' },
  { value: 3, label: 'Grade 3 — Severe periodontitis' },
  { value: 4, label: 'Grade 4 — Advanced disease' },
];

export const HYDRATION_OPTIONS = [
  { value: null,       label: '— Not Examined —' },
  { value: 'normal',   label: 'Normal' },
  { value: 'mild',     label: 'Mild dehydration' },
  { value: 'moderate', label: 'Moderate dehydration' },
  { value: 'severe',   label: 'Severe dehydration' },
];

export const MEMBRANE_OPTIONS = [
  { value: null,         label: '— Not Examined —' },
  { value: 'pink-moist', label: 'Pink/Moist (normal)' },
  { value: 'pale',       label: 'Pale' },
  { value: 'icteric',    label: 'Icteric (jaundice)' },
  { value: 'cyanotic',   label: 'Cyanotic' },
];

/**
 * Converts a structured objectiveExam to human-readable text.
 * Lists abnormal systems with findings first, then WNL systems as a group,
 * then special fields (dental, hydration, MM), then general notes.
 *
 * @param {object} exam - The objectiveExam object
 * @returns {string} Formatted text summary
 */
export function examToText(exam) {
  if (!exam) return '';

  const lines = [];
  const normal = [];
  const abnormal = [];

  (exam.systems || []).forEach(sys => {
    if (sys.status === 'abnormal') {
      abnormal.push(`${sys.name}: ABNORMAL${sys.notes ? ` — ${sys.notes}` : ''}`);
    } else if (sys.status === 'normal') {
      normal.push(sys.name);
    }
  });

  // Abnormal findings first (clinically important)
  if (abnormal.length > 0) {
    lines.push('ABNORMAL FINDINGS:');
    abnormal.forEach(a => lines.push(`  ${a}`));
    lines.push('');
  }

  // Normal systems grouped
  if (normal.length > 0) {
    lines.push(`WNL: ${normal.join(', ')}`);
  }

  // Special fields
  const dental = exam.dental?.grade;
  if (dental != null) {
    const label = DENTAL_GRADES.find(d => d.value === dental)?.label || `Grade ${dental}`;
    lines.push(`Dental: ${label}`);
  }

  const hydration = exam.hydration?.status;
  if (hydration) {
    const label = HYDRATION_OPTIONS.find(h => h.value === hydration)?.label || hydration;
    lines.push(`Hydration: ${label}`);
  }

  const mm = exam.mucousMembranes?.status;
  if (mm) {
    const label = MEMBRANE_OPTIONS.find(m => m.value === mm)?.label || mm;
    lines.push(`Mucous Membranes: ${label}`);
  }

  // General notes
  if (exam.generalNotes?.trim()) {
    lines.push('');
    lines.push(`Notes: ${exam.generalNotes.trim()}`);
  }

  return lines.join('\n');
}

/**
 * Checks whether an objectiveExam has any meaningful data beyond defaults.
 * Used for conditional rendering and data presence checks.
 *
 * @param {object} exam
 * @returns {boolean}
 */
export function hasExamData(exam) {
  if (!exam) return false;
  const hasAbnormal = (exam.systems || []).some(s => s.status === 'abnormal');
  const hasNormal = (exam.systems || []).some(s => s.status === 'normal');
  const hasNotes = (exam.systems || []).some(s => s.notes?.trim());
  const hasDental = exam.dental?.grade !== null;
  const hasHydration = exam.hydration?.status !== null;
  const hasMM = exam.mucousMembranes?.status !== null;
  const hasGeneral = exam.generalNotes?.trim();
  return hasAbnormal || hasNormal || hasNotes || hasDental || hasHydration || hasMM || !!hasGeneral;
}
