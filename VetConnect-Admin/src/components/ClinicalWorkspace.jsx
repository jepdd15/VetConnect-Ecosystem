import React, { useState, useEffect, useRef, useMemo } from 'react';
import './ClinicalWorkspace.css';
import { resolveTieredPrice } from '../utils/resolveTieredPrice';
// T4.117: buildVaccineKeywords import removed — detection is now category-based
import { useVaccineCatalog } from '../hooks/useVaccineCatalog';
// T4.120: Lab test catalog hook + constants
import { useLabTestCatalog } from '../hooks/useLabTestCatalog';
import { LAB_CATEGORIES, LAB_STATUSES } from '../utils/labTestConstants';
// T4.141: Diagnosis catalog hook + constants
import { useDiagnosisCatalog } from '../hooks/useDiagnosisCatalog';
import { DIAGNOSIS_CATEGORIES } from '../utils/diagnosisConstants';
import { ZEN_PLACEHOLDERS } from '../utils/soapConstants';
// T4.181: Breed catalog for species-filtered breed Autocomplete in identity edit form
import { BREED_CATALOG } from '../constants/breedConstants';
import {
  Dialog, Slide, AppBar, Toolbar, IconButton, Typography, Button,
  Box, Paper, Avatar, Chip, TextField, MenuItem,
  Grid, // MUI v6 Grid
  Stack, Collapse, Tooltip, InputBase, Switch,
  Autocomplete, Alert, Snackbar, CircularProgress,
  DialogTitle, DialogContent, DialogContentText, DialogActions,
  Drawer, ListSubheader,
  ToggleButtonGroup, ToggleButton, FormControlLabel,
} from '@mui/material';

// Icons (Unified)
import {
  Close as CloseIcon, Medication as MedicationIcon, AutoFixHigh as AutoFixHighIcon,
  ContentCut as ContentCutIcon,
  AddCircle as AddCircleIcon, ReceiptLong as ReceiptLongIcon,
  HistoryEdu as HistoryEduIcon,
  Shield as ShieldIcon,
  OpenInFull as OpenInFullIcon, FitScreen as FitScreenIcon,
  SaveAlt as SaveAltIcon,
  WarningAmber as WarningAmberIcon,
  Psychology as PsychologyIcon,
  Vaccines as VaccinesIcon,
  // T4.121: File attachment icons
  AttachFile as AttachFileIcon,
  PhotoCamera as PhotoCameraIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { doc, collection, Timestamp, addDoc, updateDoc, getDoc, query, where, orderBy, getDocs, arrayUnion, writeBatch, runTransaction, setDoc } from 'firebase/firestore';
import { db, auth, storage } from '../firebaseConfig';
// T4.121: File attachment upload utility
import { uploadAttachment } from '../utils/uploadAttachment';
import { useInventory } from '../features/Inventory/hooks/useInventory';
import { calculatePulseMetrics, makePulseEventId, createPulseEvent } from '../utils/pulseUtils';
import { createDefaultExam, examToText } from '../utils/examUtils';
import { useClinicSettings } from '../hooks/useClinicSettings';
import { useUser } from '../context/UserContext';
import { chatWithHistory, buildUserMessage, DEFAULT_CLINICAL_SYSTEM_PROMPT } from '../utils/llmService';
import { sendPushNotification } from '../utils/sendPushNotification';
import { computeSinglePetVaccineReminder } from '../utils/vaccineReminderQueue';

// Design Tokens
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import SoapGrid from './SoapGrid';
import PhysicalExamChecklist from './PhysicalExamChecklist';
import ClinicalAIPanel from './ClinicalAIPanel';
import EMRDrawer from './EMRDrawer';
import AmendmentDialog from './AmendmentDialog';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

/**
 * Default/empty vaccine administration row. Defined at module scope so that
 * spreading it inside the component never re-creates the object reference
 * on each render (avoids subtle re-initialization bugs).
 */
const EMPTY_VAX = {
  vaccineName: '', manufacturer: '', lotNumber: '',
  routeOfAdmin: 'SQ', siteOfInjection: 'Right Scruff',
  dueDate: '', intervalDays: 365,
};

/**
 * Returns a human-readable relative time string for a given Date.
 * Keeps granularity appropriate for clinical context (min / h / d).
 */
const formatRelativeTime = (date) => {
  if (!date) return 'recently';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

/**
 * Truncates a string to `max` characters, appending an ellipsis when clipped.
 */
const truncate = (text, max) => {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
};

// Helper for CRM-style age calculation
const calculateAge = (dob) => {
  if (!dob) return 'AGE UNKNOWN';
  try {
    const birthDate = dob.toDate ? dob.toDate() : new Date(dob);
    if (isNaN(birthDate.getTime())) return 'AGE UNKNOWN';
    const now = new Date();
    let years = now.getFullYear() - birthDate.getFullYear();
    let months = now.getMonth() - birthDate.getMonth();
    if (months < 0) {
        years--;
        months += 12;
    }
    if (years < 0) return 'AGE UNKNOWN';
    return years > 0 ? `${years}y ${months}m` : `${months}m`;
  } catch { return 'AGE UNKNOWN'; }
};


/**
 * Derives a human-readable dosing instruction string from a structured sig object.
 * Used both at cart-item creation time (auto-populate) and on every sig field edit,
 * so the instructions string stays in sync with the structured fields at all times.
 *
 * @param {{ dose?: string, unit?: string, frequency?: string, duration?: string, route?: string }} sig
 * @returns {string}
 */
const buildInstructionsFromSig = (sig) => {
  if (!sig) return '';
  const freqMap = {
    SID: 'once daily',
    BID: 'twice daily',
    TID: 'three times daily',
    QID: 'four times daily',
    EOD: 'every other day',
    PRN: 'as needed',
  };
  const dose = sig.dose || '1';
  const unit = sig.unit || 'unit';
  const freq = freqMap[sig.frequency] || sig.frequency || 'once daily';
  const duration = sig.duration || '1';
  const route = sig.route || '';
  const routeStr = route ? ` (${route})` : '';
  return `${dose} ${unit} ${freq} for ${duration} day${duration !== '1' ? 's' : ''}${routeStr}`;
};

// ---------------------------------------------------------------------------
// Module-scope sub-components — defined here (not inside the parent function)
// so React sees a stable function reference across renders and never unmounts
// the subtree. Each is wrapped in React.memo to prevent unnecessary re-renders
// when unrelated parent state changes. Closed-over parent values are threaded
// through as explicit props.
// ---------------------------------------------------------------------------

/**
 * SoapQuadrant — labelled container for a single S/O/A/P section.
 *
 * @prop {string}   id           - SOAP field key (e.g. "subjective")
 * @prop {string}   label        - Display label rendered in the header
 * @prop {node}     children     - Inner field content
 * @prop {function} onZoomField  - Called with `id` when the Zen Focus button is clicked
 * @prop {object}   [sx]         - Optional MUI sx overrides applied to the outer Box
 */
export const SoapQuadrant = React.memo(function SoapQuadrant({ id, label, children, onZoomField, sx: sxOverride = {} }) {
  return (
    <Box sx={{
      height: '100%',
      p: { xs: 2, md: 3 },
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflowY: 'auto',
      scrollbarWidth: 'thin',
      '&::-webkit-scrollbar': { width: '4px' },
      '&::-webkit-scrollbar-track': { background: 'transparent' },
      '&::-webkit-scrollbar-thumb': { background: '#E0E0E0' },
      '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand },
      '&:focus-within': { bgcolor: '#FDFCFB' },
      transition: 'background 0.2s',
      ...sxOverride,
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexShrink: 0 }}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontWeight: 900 }}>
          {label}
        </Typography>
        <Tooltip title={`Zen Focus: ${id.toUpperCase()}`}>
          <IconButton size="small" onClick={() => onZoomField(id)}
            sx={{ opacity: 0.3, '&:hover': { opacity: 1, bgcolor: '#F5F5F5' }, transition: 'all 0.2s' }}>
            <OpenInFullIcon sx={{ fontSize: 16, color: COLORS.brand }} />
          </IconButton>
        </Tooltip>
      </Box>
      {children}
    </Box>
  );
});

/**
 * T3.136: Per-field vitals validation limits.
 * - clamp: true  => value is silently clamped into [min, max] on every keystroke (fixed scoring scales).
 * - clamp: false => value triggers a soft warning + sign-off block when outside [min, max] (measurements).
 * CRT (objCRT) is intentionally absent — it uses non-numeric clinical notation like "<2".
 */
const VITALS_LIMITS = {
  objWeight:  { min: 0.1, max: 200,  clamp: false, unit: 'kg',  label: 'Weight' },
  objTemp:    { min: 35,  max: 43,   clamp: false, unit: '°C',  label: 'Temp' },
  objHR:      { min: 10,  max: 350,  clamp: false, unit: 'bpm', label: 'HR' },
  objRR:      { min: 5,   max: 100,  clamp: false, unit: 'rpm', label: 'RR' },
  bcs:        { min: 1,   max: 9,    clamp: true,  unit: '',    label: 'BCS' },
  painScale:  { min: 0,   max: 10,   clamp: true,  unit: '',    label: 'Pain' },
};

/**
 * VitalsGrid — compact grid of numeric vital-sign inputs with triage colouring.
 *
 * @prop {object}   soapData               - Current SOAP field values
 * @prop {function} updateSoap             - (field, value) => void state setter
 * @prop {function} getTriageLevel         - (type, value) => 'normal'|'warning'|'critical'
 * @prop {function} renderHistoricalLabel  - (field) => ReactNode showing prior-visit value
 * @prop {boolean}  [compact=false]        - Compact spacing variant
 */
export const VitalsGrid = React.memo(function VitalsGrid({ soapData, updateSoap, getTriageLevel, renderHistoricalLabel, compact = false }) {
  const vitalsFields = [
    { label: 'WT (kg)',     value: soapData.objWeight,  field: 'objWeight',  icon: '\u2696\uFE0F', status: 'normal',                                        numeric: true },
    { label: 'TEMP (\u00B0C)', value: soapData.objTemp, field: 'objTemp',    icon: '\uD83C\uDF21\uFE0F', status: getTriageLevel('temp', soapData.objTemp), numeric: true },
    { label: 'HR (bpm)',    value: soapData.objHR,      field: 'objHR',      icon: '\u2764\uFE0F', status: getTriageLevel('hr', soapData.objHR),             numeric: true },
    { label: 'RR (rpm)',    value: soapData.objRR,      field: 'objRR',      icon: '\uD83E\uDEC1', status: getTriageLevel('rr', soapData.objRR),             numeric: true },
    { label: 'CRT (sec)',   value: soapData.objCRT,     field: 'objCRT',     icon: '\u23F1\uFE0F', status: getTriageLevel('crt', soapData.objCRT),           numeric: false },
    { label: 'BCS (1-9)',   value: soapData.bcs,        field: 'bcs',        icon: '\uD83D\uDC3E', status: 'normal',                                        numeric: true },
    { label: 'PAIN (0-10)', value: soapData.painScale,  field: 'painScale',  icon: '\uD83E\uDE79', status: getTriageLevel('pain', soapData.painScale),       numeric: true },
  ];

  const triageColor = (status) =>
    status === 'critical' ? '#D32F2F' :
    status === 'warning'  ? '#FF8F00' :
    COLORS.brand;

  const triageBorder = (status) =>
    status === 'critical' ? '2px solid #D32F2F' :
    status === 'warning'  ? '2px solid #FF8F00' :
    '2px solid rgba(0,0,0,0.1)';

  // Step 3A.1: Returns true for clamp:false fields whose value is outside [min, max].
  // CRT is absent from VITALS_LIMITS so it always returns false here.
  const isOutOfRange = (field, value) => {
    const limits = VITALS_LIMITS[field];
    if (!limits || limits.clamp || value === '' || value == null) return false;
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    return num < limits.min || num > limits.max;
  };

  return (
    <Box sx={{ bgcolor: '#FAFAF9', p: compact ? 1.5 : 2, border: '1px solid rgba(0,0,0,0.06)', mb: compact ? 1 : 2, flexShrink: 0 }}>
      <Grid container spacing={compact ? 1 : 1.5}>
        {vitalsFields.map((v, idx) => (
          <Grid key={v.field} size={{ xs: 6, sm: 3, md: idx < 4 ? 3 : 4 }}>
            <Typography variant="caption" sx={{
              fontWeight: 1000, color: COLORS.textSecondary,
              display: 'block', mb: 0.25,
              fontSize: compact ? '0.55rem' : '0.6rem'
            }}>
              {v.icon} {v.label}
            </Typography>
            <InputBase
              size="small"
              value={v.value}
              onChange={(e) => {
                // Step 2.2: Clamp fixed-scale fields (BCS, Pain) on every keystroke.
                // Measurement fields (Weight, Temp, HR, RR) pass through unchanged.
                let val = e.target.value;
                const limits = VITALS_LIMITS[v.field];
                if (limits?.clamp && val !== '') {
                  const num = parseFloat(val);
                  if (!isNaN(num)) val = String(Math.min(Math.max(num, limits.min), limits.max));
                }
                updateSoap(v.field, val);
              }}
              // Step 1.3: Block e/E/+/- on numeric fields (browsers allow these in type="number")
              onKeyDown={v.numeric ? (e) => {
                if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
              } : undefined}
              // Step 1.2: Conditionally apply numeric keyboard attributes; CRT stays type="text"
              inputProps={{
                'aria-label': v.label,
                ...(v.numeric && { type: 'number', inputMode: 'decimal', step: 'any' }),
              }}
              className={v.status === 'critical' ? 'glow-critical' : v.status === 'warning' ? 'glow-warning' : ''}
              sx={{
                width: '100%',
                fontWeight: 1000,
                color: triageColor(v.status),
                borderBottom: triageBorder(v.status),
                fontSize: compact ? '0.85rem' : '1rem',
                px: 0.5,
                bgcolor: 'white'
              }}
            />
            {renderHistoricalLabel(v.field)}
            {/* Step 3A.2: Soft warning for measurement vitals outside physical limits */}
            {isOutOfRange(v.field, v.value) && (
              <Typography
                variant="caption"
                sx={{
                  color: COLORS.warning,
                  fontSize: '0.5rem',
                  fontWeight: 700,
                  mt: 0.25,
                  display: 'block',
                  lineHeight: 1.2,
                }}
              >
                Outside expected range ({VITALS_LIMITS[v.field].min}–{VITALS_LIMITS[v.field].max} {VITALS_LIMITS[v.field].unit})
              </Typography>
            )}
          </Grid>
        ))}
      </Grid>
    </Box>
  );
});

/**
 * DiagnosticBridge — buttons-only trigger surface for AI clinical reasoning.
 *
 * The response panels (rule-based blue + LLM purple) have moved to ClinicalAIPanel.
 * This component now renders only the "Analyze S+O" and "Ask AI" / "New Analysis"
 * trigger buttons, plus a "Show/Hide AI Panel" toggle.
 *
 * @prop {object}   soapData           - Current SOAP data (for disabled state check)
 * @prop {boolean}  [llmEnabled=false] - Whether LLM feature is active
 * @prop {boolean}  [llmLoading=false] - LLM call in-flight
 * @prop {Array}    [llmMessages=[]]   - Conversation history (used for label switching)
 * @prop {function} onAnalyze          - Runs rule-based engine + opens AI panel
 * @prop {function} [onAskAI]          - Triggers initial LLM call
 * @prop {function} [onResetAndAskAI]  - Clears conversation and re-analyzes
 * @prop {function} onToggleAIPanel    - (open: boolean) => void — toggles drawer/panel
 * @prop {boolean}  isAIPanelOpen      - Whether the AI panel is currently visible
 */
export const DiagnosticBridge = React.memo(function DiagnosticBridge({
  soapData,
  llmEnabled = false,
  llmLoading = false,
  llmMessages = [],
  onAnalyze,
  onAskAI,
  onResetAndAskAI,
  onToggleAIPanel,
  isAIPanelOpen,
}) {
  const hasInputData = !!(soapData.subjective || soapData.objectiveNotes);
  const hasConversation = llmMessages.length > 0;

  return (
    <Box sx={{ mb: 1.5, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>

        {/* Rule-based "Analyze S+O" — opens AI panel to show suggestions */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<AutoFixHighIcon />}
          onClick={() => { onAnalyze(); onToggleAIPanel(true); }}
          disabled={!hasInputData}
          sx={{
            fontWeight: 900,
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: COLORS.medical,
            borderColor: COLORS.medical,
            borderRadius: 0,
            '&:hover': { bgcolor: 'rgba(21,101,192,0.05)' },
          }}
        >
          Analyze S+O
        </Button>

        {/* LLM "Ask AI" / "New Analysis" — opens AI panel */}
        {llmEnabled && (
          <Button
            size="small"
            variant="outlined"
            startIcon={llmLoading
              ? <CircularProgress size={14} sx={{ color: COLORS.grooming }} />
              : <PsychologyIcon />
            }
            onClick={() => {
              if (hasConversation) onResetAndAskAI();
              else onAskAI();
              onToggleAIPanel(true);
            }}
            disabled={!hasInputData || llmLoading}
            sx={{
              fontWeight: 900,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: COLORS.grooming,
              borderColor: COLORS.grooming,
              borderRadius: 0,
              '&:hover': { bgcolor: 'rgba(123,31,162,0.05)' },
              '&.Mui-disabled': { opacity: 0.5 },
            }}
          >
            {llmLoading ? 'Analyzing...' : hasConversation ? 'New Analysis' : 'Ask AI'}
          </Button>
        )}

        {/* Show/Hide toggle — visible once a conversation exists (default view only) */}
        {llmEnabled && hasConversation && (
          <Button
            size="small"
            variant="text"
            startIcon={<PsychologyIcon />}
            onClick={() => onToggleAIPanel(!isAIPanelOpen)}
            sx={{
              fontWeight: 900,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              borderRadius: 0,
              color: isAIPanelOpen ? COLORS.grooming : COLORS.textMuted,
              '&:hover': { bgcolor: 'rgba(123,31,162,0.05)' },
            }}
          >
            {isAIPanelOpen ? 'Hide AI Panel' : 'Show AI Panel'}
          </Button>
        )}
      </Box>
    </Box>
  );
});

// --- 🩺 CLINICAL INTELLIGENCE KNOWLEDGE BASE (30+ rules) ---
const KNOWLEDGE_BASE = [
  // Respiratory
  { keywords: ['cough', 'hacking', 'trachea'], suggestion: "RECOMMEND: Thoracic radiographs to rule out Kennel Cough vs. Cardiac (CHF) vs. Tracheal Collapse." },
  { keywords: ['dyspnea', 'difficulty breathing', 'open mouth breathing', 'labored'], suggestion: "RECOMMEND: Immediate oxygen support. Thoracic rads + CBC/Chem. Rule out pleural effusion, pneumothorax, diaphragmatic hernia." },
  { keywords: ['nasal discharge', 'sneezing', 'reverse sneeze'], suggestion: "RECOMMEND: Nasal cytology/culture. Rule out upper respiratory infection, foreign body, or nasal polyp/mass. Consider rhinoscopy." },
  // Gastrointestinal
  { keywords: ['vomiting', 'diarrhea', 'dehydrated'], suggestion: "RECOMMEND: Fluid therapy (IV/SQ) + Parvovirus SNAP test if puppy. Rule out dietary indiscretion vs. pancreatitis." },
  { keywords: ['anorexia', 'not eating', 'inappetence', 'loss of appetite'], suggestion: "RECOMMEND: CBC/Chem/Urinalysis baseline. Abdominal palpation + radiographs. Rule out GI obstruction, systemic illness, pain." },
  { keywords: ['constipation', 'straining to defecate', 'no feces'], suggestion: "RECOMMEND: Abdominal radiographs to assess colonic load. Enema if indicated. Rule out obstipation, pelvic canal narrowing, perineal hernia." },
  { keywords: ['hematemesis', 'blood in vomit', 'bloody vomit'], suggestion: "RECOMMEND: CBC/Coagulation panel. Endoscopy if stable. Rule out GI ulceration, foreign body, coagulopathy, hemorrhagic gastroenteritis." },
  // Dermatological
  { keywords: ['scratching', 'shaking head', 'ear', 'brown discharge'], suggestion: "RECOMMEND: Ear cytology for Malassezia (Yeast) vs. Bacterial Otitis. Check for Otodectes." },
  { keywords: ['hot spot', 'moist dermatitis', 'pyotraumatic'], suggestion: "RECOMMEND: Clip and clean lesion. Cytology for infection type. Rule out underlying allergy (atopy, food, flea). Systemic antibiotics if deep." },
  { keywords: ['alopecia', 'hair loss', 'bald patches'], suggestion: "RECOMMEND: Skin scraping for Demodex/Sarcoptes. Fungal culture for dermatophytosis. CBC/Chem/thyroid (T4) for endocrine causes." },
  { keywords: ['pruritus', 'itching', 'intense scratching', 'papules'], suggestion: "RECOMMEND: Skin scraping, cytology, Wood's lamp. Rule out ectoparasites, allergic dermatitis (atopy, food). Consider intradermal allergy test." },
  // Ophthalmological
  { keywords: ['eye discharge', 'epiphora', 'tearing', 'weeping eye'], suggestion: "RECOMMEND: Fluorescein stain to rule out corneal ulceration. Schirmer Tear Test for KCS (dry eye). Culture if purulent." },
  { keywords: ['squinting', 'blepharospasm', 'pawing at eye'], suggestion: "RECOMMEND: Fluorescein stain — urgent if positive for corneal ulcer. Tonometry to rule out glaucoma. Check for foreign body or entropion." },
  { keywords: ['corneal ulcer', 'corneal scratch', 'eye wound'], suggestion: "RECOMMEND: Daily fluorescein recheck. Topical antibiotic + atropine. E-collar mandatory. Refer to ophthalmologist if deep/descemetocele." },
  // Dental
  { keywords: ['halitosis', 'bad breath', 'mouth odor'], suggestion: "RECOMMEND: Oral exam under sedation. Dental grade 0-4. Periapical radiographs if grades 3-4. Schedule dental prophylaxis." },
  { keywords: ['broken tooth', 'fractured tooth', 'missing tooth'], suggestion: "RECOMMEND: Dental radiograph to assess root viability. Options: extraction vs. vital pulp therapy. Antibiotics + pain management." },
  { keywords: ['drooling', 'ptyalism', 'hypersalivation'], suggestion: "RECOMMEND: Oral exam for foreign body, mass, ulceration. Rule out nausea (GI), toxin ingestion, neurological cause, or esophageal disease." },
  // Cardiac
  { keywords: ['exercise intolerance', 'tires easily', 'weakness after walk'], suggestion: "RECOMMEND: Thoracic rads (VHS measurement) + ECG. Cardiac auscultation for murmur grade. Echocardiogram if murmur detected. NT-proBNP biomarker." },
  { keywords: ['cyanosis', 'blue gums', 'mucous membrane blue'], suggestion: "RECOMMEND: EMERGENCY — Oxygen immediately. Pulse oximetry. Thoracic rads + ECG. Rule out congenital heart disease, severe anemia, respiratory failure." },
  { keywords: ['ascites', 'fluid abdomen', 'pot belly', 'abdominal distension'], suggestion: "RECOMMEND: Abdominal ultrasound + abdominocentesis for fluid analysis. Rule out right heart failure, liver disease, neoplasia, hypoalbuminemia." },
  // Endocrine / Metabolic
  { keywords: ['polydipsia', 'polyuria', 'pu pd', 'drinking a lot', 'urinating frequently'], suggestion: "RECOMMEND: CBC/Chem/Urinalysis + USG. Rule out Diabetes Mellitus, Cushing's (LDDST/HDDS), Addison's, Chronic Kidney Disease, Pyometra." },
  { keywords: ['weight gain', 'obesity', 'sluggish', 'cold intolerance'], suggestion: "RECOMMEND: Thyroid panel (Total T4 + fT4) to rule out hypothyroidism. Fasting glucose, CBC/Chem for metabolic screen." },
  // Orthopedic
  { keywords: ['limping', 'hind', 'cruciate', 'stifle'], suggestion: "RECOMMEND: Orthopedic exam (Drawer/Tibial Compression) + stifle radiographs. Consider NSAIDs and rest." },
  { keywords: ['hip', 'reluctant to rise', 'bunny hopping', 'hip dysplasia'], suggestion: "RECOMMEND: Hip extension radiograph (PennHIP or OFA views). Coxofemoral joint palpation. Analgesics, weight management, or surgical referral." },
  { keywords: ['ataxia', 'stumbling', 'incoordination', 'wobbly'], suggestion: "RECOMMEND: Full neurological exam. Differentiate vestibular (head tilt) from cerebellar or spinal cord disease. MRI referral if progressive." },
  // Neurological
  { keywords: ['seizure', 'fits', 'convulsions'], suggestion: "RECOMMEND: CBC/Chem to rule out metabolic causes (liver/glucose). Monitor duration/frequency for Phenobarbital start." },
  // Oncological
  { keywords: ['mass', 'lump', 'growth', 'nodule'], suggestion: "RECOMMEND: Fine needle aspirate (FNA) cytology as first step. If malignant or indeterminate, surgical excision + histopathology. Thoracic rads for staging." },
  { keywords: ['lymph node', 'lymphadenopathy', 'swollen glands'], suggestion: "RECOMMEND: FNA of enlarged lymph node. CBC with differential for lymphocytosis. Abdominal ultrasound for visceral lymphadenopathy. Rule out lymphoma." },
  // Urinary / Reproductive
  { keywords: ['peeing', 'straining', 'blood', 'urinary'], suggestion: "RECOMMEND: Urinalysis + Culture to rule out UTI vs. Crystals/Calculi (Uroliths). Abdominal rads or ultrasound for bladder stones." },
  { keywords: ['vaginal discharge', 'pyometra', 'uterine'], suggestion: "RECOMMEND: Abdominal ultrasound for uterine distension. CBC for leukocytosis. Emergency OVH for closed pyometra. Aglepristone if open + stable." },
  // Neonatal / Pediatric
  { keywords: ['fading', 'neonatal', 'newborn', 'puppy sick'], suggestion: "RECOMMEND: Check blood glucose (hypoglycemia common). Assess dehydration. Warm environment critical. Rule out fading puppy syndrome causes (herpesvirus, bacteria)." },
  // Toxicological
  { keywords: ['chocolate', 'theobromine', 'toxic ingestion', 'ate chocolate'], suggestion: "RECOMMEND: Calculate theobromine dose by chocolate type and body weight. Induce emesis if < 2h. Activated charcoal. Monitor cardiac arrhythmias." },
  { keywords: ['rat poison', 'rodenticide', 'anticoagulant', 'brodifacoum'], suggestion: "RECOMMEND: Coagulation panel (PT/PTT). Vitamin K1 therapy for anticoagulant rodenticide. Monitor for 4-6 weeks post-exposure. Transfusion if severe bleeding." },
  { keywords: ['xylitol', 'sugar free', 'sweetener ingestion'], suggestion: "RECOMMEND: EMERGENCY — Induce emesis if < 30 min. IV dextrose for hypoglycemia. Monitor liver enzymes (ALT/ALP) q24h for 72h. Hepatotoxicity risk." },
  // Behavioral
  { keywords: ['aggression', 'biting', 'snapping', 'sudden behavior change'], suggestion: "RECOMMEND: Rule out pain source (orthopedic, dental, neurological). Thyroid panel. Consider behavioral referral if no medical cause found." },
];

// ZEN_PLACEHOLDERS imported from shared constants — see src/utils/soapConstants.js

const CUSTOM_TEST_SENTINEL = { id: '__custom__', name: '+ Add Custom Test', category: '__action__' };

export default function ClinicalWorkspace({ open, onClose, patient, inventoryList, servicesList, departments, vetsList }) {
  const clinicSettings = useClinicSettings();
  const vaccineCatalog = useVaccineCatalog();
  const { profile: cwProfile } = useUser();
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);

  // A3 — Draft SOAP Recovery: holds draft metadata while the user decides RESUME or DISCARD.
  // Null means no banner. Populated when a recent (< 24h) draft is detected on mount.
  // Scoped to the current session — cleared on unmount via React's normal state lifecycle.
  const [draftBannerState, setDraftBannerState] = useState(null);
  // Controls the discard confirmation dialog visibility.
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const { reserveStock, releaseStock } = useInventory();
  
  const [history, setHistory] = useState([]);
  const [nextAppointment, setNextAppointment] = useState(null);
  const [petDetails, setPetDetails] = useState(null);
  const [prevVitals, setPrevVitals] = useState(null);
  // T3.53: Count of overdue vaccines derived from the pet's medical history.
  // Displayed as a warning badge in the identity strip to prompt the vet during consult.
  const [overdueVaccineCount, setOverdueVaccineCount] = useState(0);

  // T4.181: Inline pet identity editing — edit mode, form data, saving flag
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [identityForm, setIdentityForm] = useState(null);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [localPetAllergies, setLocalPetAllergies] = useState(null);

  const [soapData, setSoapData] = useState({
    // T4.158: Auto-populate subjective from intake notes on first open (no draft).
    subjective: (() => {
      const client = patient?.clientNotes || (!patient?.staffNotes ? patient?.notes : '') || '';
      const filtered = (client === 'Walk-in client' || client.includes('QUICK ADMIT')) ? '' : client;
      const staff = patient?.staffNotes || '';
      if (!filtered && !staff) return '';
      return [
        filtered ? `Owner: ${filtered}` : '',
        staff ? `Staff: ${staff}` : '',
      ].filter(Boolean).join('\n');
    })(),
    objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '', bcs: '', painScale: '',
    objectiveNotes: '', objectiveExam: createDefaultExam(),
    // T4.141: assessment replaced with structured diagnoses[] + free-text assessmentNotes
    diagnoses: [], assessmentNotes: '',
    prognosis: 'Good', plan: '', clientInstructions: '', recheckIn: '1 Week', patientStatus: 'Stable', nextVisit: ''
  });
  const [isRecordLocked, setIsRecordLocked] = useState(false);
  const [ownerSignature, setOwnerSignature] = useState(null);
  const [assistiveText, setAssistiveText] = useState('');
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  // --- LLM CLINICAL REASONING STATE (T3.107 / T4.109 multi-turn) ---
  const [llmConfig, setLlmConfig] = useState({ enabled: false, workerUrl: '', systemPrompt: '' });
  // Multi-turn conversation history. Each entry: { role: 'user'|'assistant', content: string }
  const [llmMessages, setLlmMessages] = useState([]);
  const [llmFollowUpInput, setLlmFollowUpInput] = useState('');
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState('');
  // T4.110: AI side panel — replaces the inline LLM Collapse panel in DiagnosticBridge.
  // Default view opens a right-anchored MUI Drawer; God View uses a persistent third column.
  const [isAIDrawerOpen, setIsAIDrawerOpen] = useState(false);
  // Unmount guard: set to true on unmount to prevent setState after component is gone.
  const llmAbortRef = useRef(false);
  // Stores the last user content sent to the LLM so handleLlmRetry can re-send it.
  const lastLlmUserContentRef = useRef('');

  // T3.118: Amendment dialog state — inline form extracted to shared AmendmentDialog
  const [amendDialogOpen, setAmendDialogOpen] = useState(false);

  // C1: Structured vaccine administration records — array for multi-vaccine-per-visit
  const [vaccineAdministrations, setVaccineAdministrations] = useState([{ ...EMPTY_VAX }]);
  // T3.2: Manual override — lets the vet show the vaccine form on non-vaccination visits
  const [manualVaccineOverride, setManualVaccineOverride] = useState(false);
  // T3.1: EMR slide-over drawer state
  const [emrOpen, setEmrOpen] = useState(false);

  // T4.120: Lab test catalog — singleton Firestore-backed hook, same pattern as useVaccineCatalog
  const labCatalog = useLabTestCatalog();
  // T4.141: Diagnosis catalog — singleton hook, called unconditionally before any early returns
  const diagnosisCatalog = useDiagnosisCatalog();
  const labCatalogWithSentinel = useMemo(
    () => [...labCatalog, CUSTOM_TEST_SENTINEL],
    [labCatalog],
  );

  // T4.120: Lab results — extended shape includes catalog-derived fields
  // { testName, result, status, notes, unit, referenceRange, catalogTestId, resultType, attachmentUrl }
  const [labResults, setLabResults] = useState([]);

  // T4.121: General SOAP attachments — pending (pre-upload) File objects with metadata.
  // Shape: { file: File, label: string, type: string, clientVisible: boolean,
  //          preview: string|null, uploading: boolean }
  // This list is upload-queued at sign-off; it does NOT hold already-saved URLs.
  const [soapAttachments, setSoapAttachments] = useState([]);

  // T4.121 Amendment 1: Already-uploaded attachment metadata from the sealed medical record.
  // Populated by hydrating from the medical_records document when the workspace opens
  // for a signed-off appointment. Different shape from soapAttachments (has url, no file).
  // Sealed-view JSX reads this — NOT patient.attachments (patient is the appointment doc).
  const [savedAttachments, setSavedAttachments] = useState([]);

  // T4.120: Custom lab test dialog state
  const [addCustomLabOpen, setAddCustomLabOpen] = useState(false);
  const [customLabPendingIdx, setCustomLabPendingIdx] = useState(null);
  const [customLabForm, setCustomLabForm] = useState({
    name: '', category: 'Other', unit: '', resultType: 'numeric',
    canineLow: '', canineHigh: '', felineLow: '', felineHigh: '',
  });

  // T4.141: Custom diagnosis dialog state
  const [addCustomDxOpen, setAddCustomDxOpen] = useState(false);
  const [customDxName, setCustomDxName] = useState('');
  const [customDxCategory, setCustomDxCategory] = useState('Dermatology');

  const [treatmentCart, setTreatmentCart] = useState([]);
  const [serviceAttribution, setServiceAttribution] = useState({});
  // T2.95: Per-service progress — tracks completion status for each booked service.
  // Keys are service IDs, values are 'pending' | 'in-progress' | 'completed'.
  const [serviceProgress, setServiceProgress] = useState({});

  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  // Refs to access latest cart and lock state inside cleanup closures without stale captures
  const treatmentCartRef = useRef(treatmentCart);
  const isRecordLockedRef = useRef(isRecordLocked);
  const hasReleasedRef = useRef(false);
  // T4.121: Hidden file input ref for the general SOAP attachment picker
  const fileInputRef = useRef(null);

  // Keep refs in sync so the unmount cleanup always sees the latest values
  useEffect(() => { treatmentCartRef.current = treatmentCart; }, [treatmentCart]);
  useEffect(() => { isRecordLockedRef.current = isRecordLocked; }, [isRecordLocked]);
  const soapAttachmentsRef = useRef(soapAttachments);
  useEffect(() => { soapAttachmentsRef.current = soapAttachments; }, [soapAttachments]);

  // T4.121: Revoke all pending attachment preview URLs on unmount to prevent memory leaks.
  // Uses ref so the cleanup always sees the latest array, not the empty mount-time capture.
  useEffect(() => {
    return () => {
      soapAttachmentsRef.current.forEach(att => {
        if (att.preview) URL.revokeObjectURL(att.preview);
      });
    };
  }, []);

  // On unmount: release all product reservations if the record was never signed off.
  // This prevents the `reserved` counter from being permanently inflated when the vet
  // closes the workspace without completing the encounter.
  // hasReleasedRef guards against double-release when handleCloseRequest already ran.
  useEffect(() => {
    llmAbortRef.current = false;
    return () => {
      // Signal any in-flight LLM call to not update state after unmount.
      llmAbortRef.current = true;

      if (!isRecordLockedRef.current && !hasReleasedRef.current) {
        hasReleasedRef.current = true;
        treatmentCartRef.current.forEach(item => {
          if (item.type === 'product' && releaseStock) {
            releaseStock(item.id, item.qty || 1).catch(e =>
              console.error(`[ClinicalWorkspace] Failed to release reservation for ${item.name}:`, e)
            );
          }
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- LLM CONFIG FETCH (one-shot on mount) ---
  // ClinicalWorkspace mounts fresh each time it opens, so a one-shot getDoc is
  // sufficient — no real-time listener needed.
  useEffect(() => {
    let cancelled = false;

    const fetchLlmConfig = async () => {
      try {
        const [configSnap, promptSnap] = await Promise.all([
          getDoc(doc(db, 'clinic_settings', 'llm_config')),
          getDoc(doc(db, 'system_prompts', 'clinical_reasoning')),
        ]);
        if (cancelled) return;
        const config = configSnap.exists() ? configSnap.data() : {};
        const promptDoc = promptSnap.exists() ? promptSnap.data() : {};
        setLlmConfig({
          enabled: config.enabled ?? false,
          workerUrl: config.workerUrl ?? '',
          systemPrompt: promptDoc.prompt || config.systemPrompt || DEFAULT_CLINICAL_SYSTEM_PROMPT,
        });
      } catch (e) {
        console.warn('[ClinicalWorkspace] Failed to load LLM config:', e.message);
      }
    };

    fetchLlmConfig();
    return () => { cancelled = true; };
  }, []);

  // --- 🧘 ZEN FOCUS & IMMERSION ---
  const [fullscreenField, setFullscreenField] = useState(null); // Field ID for zoom
  const [isUnifiedZen, setIsUnifiedZen] = useState(false); // Global SOAP zoom

  // --- ZEN NAVIGATION & STATE ---
  const treatmentRef = useRef(null);
  const isSavingRef = useRef(false);

  const [lockedServices, setLockedServices] = useState(new Set());
  const [signOffConfirm, setSignOffConfirm] = useState(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [allergenConfirm, setAllergenConfirm] = useState(null);

  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.65)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
    borderRadius: 0,
  };


  // --- 1. INITIALIZATION & AUTO-BUNDLE ENGINE ---
  useEffect(() => {
    let cancelled = false;

    const fetchPatientContext = async () => {
        if (open && patient) {
          setIsDirty(false);
          setAssistiveText('');
          setOverdueVaccineCount(0);
          setLlmMessages([]);
          setLlmFollowUpInput('');
          setLlmError('');
          setIsAIDrawerOpen(false);

          // Sign-off guard: check if a medical record already exists for this appointment.
          // The 'medical' key in lockedServices prevents duplicate sign-off.
          const completedFromDb = new Set();
          if (patient.signedOffAt) completedFromDb.add('medical');
          setLockedServices(completedFromDb);

          // T4.121 Amendment 1: Reset pending/saved attachment state on patient change.
          // soapAttachments are pending File objects for the next sign-off — always clear.
          // savedAttachments are from the sealed record — fetched below if signed off.
          setSoapAttachments([]);
          setSavedAttachments([]);

          // T4.121 Amendment 1: Hydrate savedAttachments from the sealed medical record.
          // patient is the APPOINTMENT doc — it has no attachments field. The attachments
          // live on the medical_records doc, so we query by appointmentId when signed off.
          if (patient.signedOffAt) {
            try {
              const recordQuery = query(
                collection(db, 'medical_records'),
                where('appointmentId', '==', patient.id),
              );
              const recordSnap = await getDocs(recordQuery);
              if (!recordSnap.empty && !cancelled) {
                const rec = recordSnap.docs[0].data();
                setSavedAttachments(rec.attachments || []);
              }
            } catch (e) {
              console.warn('[ClinicalWorkspace] Failed to load saved attachments:', e.message);
            }
          }

          // --- A3: DRAFT SOAP RECOVERY — gate recent drafts behind explicit user intent ---
          // A draft that was saved in the last 24 hours while the appointment is in an
          // active clinical status must NOT silently pre-fill the form. Instead, we hold
          // the draft in banner state and show RESUME / DISCARD options. This prevents a
          // vet from unknowingly signing off on stale data that looks like a fresh start.
          //
          // Drafts older than 24 hours, or on non-clinical statuses, fall through to the
          // legacy silent-hydration path to preserve backward-compatible behaviour.
          const draft = patient.soapDraft;
          const savedAtTs = patient.draftSavedAt;
          const savedAt = savedAtTs?.toDate ? savedAtTs.toDate() : null;
          const DRAFT_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24 hours
          const isDraftRecent = savedAt && (Date.now() - savedAt.getTime()) < DRAFT_FRESHNESS_MS;
          const isEligibleStatus = ['arrived', 'in-consult'].includes(patient.status);

          const freshDefaults = {
            // T4.158: Auto-populate subjective from intake notes so the vet has a starting
            // point. Filtered to exclude walk-in placeholders. Draft resume bypasses this.
            subjective: (() => {
              const client = patient?.clientNotes || (!patient?.staffNotes ? patient?.notes : '') || '';
              const filtered = (client === 'Walk-in client' || client.includes('QUICK ADMIT')) ? '' : client;
              const staff = patient?.staffNotes || '';
              if (!filtered && !staff) return '';
              return [
                filtered ? `Owner: ${filtered}` : '',
                staff ? `Staff: ${staff}` : '',
              ].filter(Boolean).join('\n');
            })(),
            objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '',
            bcs: '', painScale: '',
            objectiveNotes: '', objectiveExam: createDefaultExam(),
            // T4.141: structured diagnosis fields replace the legacy assessment string
            diagnoses: [], assessmentNotes: '',
            prognosis: 'Good', recheckIn: '1 Week',
            patientStatus: 'Stable', plan: '', clientInstructions: '', nextVisit: '',
          };

          if (draft && Object.keys(draft).length > 0 && isDraftRecent && isEligibleStatus) {
            // Recent draft on an active appointment: suppress silent hydration, show banner.
            const savedByUser = (vetsList || []).find(v => v.id === patient.draftSavedBy);
            const savedByName = savedByUser?.fullName || (patient.draftSavedBy ? patient.draftSavedBy.slice(0, 8) : 'Unknown vet');
            setDraftBannerState({
              draft,
              savedAt,
              savedByName,
              savedByUid: patient.draftSavedBy || null,
            });
            // Initialize fresh defaults so the form is visibly empty — the vet sees
            // blank fields and the banner explaining why, rather than pre-filled fields
            // with no indication they came from a prior draft session.
            setSoapData(freshDefaults);
          } else if (draft && Object.keys(draft).length > 0) {
            // Stale (> 24h) or status-ineligible draft: silently hydrate as before.
            // This preserves legacy behaviour for forgotten drafts that are unlikely
            // to cause clinical harm — suppressing them would just lose data.
            setDraftBannerState(null);
            setSoapData({
              subjective: draft.subjective || '',
              objWeight: draft.objWeight || '',
              objTemp: draft.objTemp || '',
              objHR: draft.objHR || '',
              objRR: draft.objRR || '',
              objCRT: draft.objCRT ?? '',
              bcs: draft.bcs ?? '',
              painScale: draft.painScale ?? '',
              objectiveNotes: draft.objectiveNotes || '',
              objectiveExam: draft.objectiveExam || createDefaultExam(),
              // T4.141: dual-read — new fields first, fall back to legacy assessment string
              diagnoses: draft.diagnoses || [],
              assessmentNotes: draft.assessmentNotes || draft.assessment || '',
              prognosis: draft.prognosis || 'Good',
              patientStatus: draft.patientStatus || 'Stable',
              plan: draft.plan || '',
              clientInstructions: draft.clientInstructions || '',
              recheckIn: draft.recheckIn || '1 Week',
              nextVisit: draft.nextVisit || '',
            });
            setLabResults((draft.labResults || []).map(l => ({
              testName: l.testName || '', result: l.result || '',
              status: l.status || 'normal', notes: l.notes || '',
              unit: l.unit || '', referenceRange: l.referenceRange ?? null,
              catalogTestId: l.catalogTestId ?? null, resultType: l.resultType || 'descriptive',
            })));
          } else {
            // No draft: initialize fresh defaults.
            setDraftBannerState(null);
            setSoapData(freshDefaults);
          }

        let initialCart = [];
        // T2.29: baseService lookup now uses services[0].id instead of legacy primaryService string.
        const baseService = servicesList.find(s => s.id === (patient.services?.[0]?.id));
        const patientWeight = patient.petWeight ? parseFloat(patient.petWeight) : null;

        // Push every booked service into the cart — use tiered price if applicable
        (patient.services || []).forEach(svc => {
            const svcDef = servicesList.find(s => s.id === svc.id);
            if (!svcDef && svc.id) console.warn(`[ClinicalWorkspace] Service id="${svc.id}" not found in catalog. Using appointment price.`);
            const resolvedPrice = resolveTieredPrice(svcDef, patientWeight) || svc.price || 0;
            initialCart.push({
                type: 'service', id: svc.id, name: svc.name,
                price: resolvedPrice, qty: 1, isDrug: false, productClass: 'retail', isBase: true,
                isDiscountable: svcDef?.isScPwdEligible !== false,
                department: svc.department || svcDef?.department || 'General',
                category: '', // Services don't carry inventory categories
            });
        });

        // T2.14: Auto-bundle linked inventory products for ALL booked services.
        // Deduplicates across services so a product linked by two services is only added once.
        // Skips out-of-stock items with a console warning rather than silently adding them.
        const bundledProductIds = new Set();
        let firstVaccineLinkedItem = null;
        (patient.services || []).forEach(svc => {
            const svcDef = servicesList.find(s => s.id === svc.id);
            if (!svcDef) return;
            const linkedIds = svcDef.linkedProducts
                || (svcDef.linkedProduct ? [svcDef.linkedProduct] : []);
            linkedIds.forEach(productId => {
                if (bundledProductIds.has(productId)) return;
                bundledProductIds.add(productId);
                const linkedInv = inventoryList.find(i => i.id === productId);
                if (!linkedInv) return;
                const netAvailable = (linkedInv.stock || 0) - (linkedInv.reserved || 0);
                if (netAvailable <= 0) {
                    console.warn(`[ClinicalWorkspace] Auto-bundle skipped: ${linkedInv.itemName} is out of stock.`);
                    return;
                }
                initialCart.push({
                    type: 'product', id: linkedInv.id, name: linkedInv.itemName,
                    price: linkedInv.price, qty: 1,
                    isDrug: !!linkedInv.isMedicine,
                    productClass: linkedInv.productClass || (linkedInv.isMedicine ? 'medicine' : 'retail'),
                    isBase: false, isAutoBundled: true, instructions: '',
                    category: (linkedInv.category || '').toLowerCase(), // T4.117: enables category-based detection
                });
                // Track the first linked vaccine product for auto-fill below
                if (!firstVaccineLinkedItem && linkedInv.batches?.length > 0) {
                    if ((linkedInv.category || '').toLowerCase() === 'vaccine') {
                        firstVaccineLinkedItem = linkedInv;
                    }
                }
            });
        });

        // T2.474 / T2.22 / T4.117: Pre-fill vaccine form from the first linked vaccine product.
        // Uses vaccineConfig defaults (route, site, interval, manufacturer) in addition to
        // batch lot number. Detection is category-based.
        const isVax = initialCart.some(item => item.category === 'vaccine');
        if (isVax && firstVaccineLinkedItem) {
            const batch = firstVaccineLinkedItem.batches[0];
            const vc = firstVaccineLinkedItem.vaccineConfig || {};
            const hydrationDueDate = (() => {
                const days = vc.intervalDays || 365;
                const due = new Date();
                due.setDate(due.getDate() + days);
                return due.toISOString().slice(0, 10);
            })();
            setVaccineAdministrations(prev => {
                const updated = [...prev];
                if (updated[0]) {
                    updated[0] = {
                        ...updated[0],
                        vaccineName: updated[0].vaccineName || firstVaccineLinkedItem.itemName || '',
                        manufacturer: updated[0].manufacturer || batch?.manufacturer || vc.defaultManufacturer || '',
                        lotNumber: updated[0].lotNumber || batch?.batchNumber || batch?.lotNumber || '',
                        routeOfAdmin: updated[0].routeOfAdmin || vc.defaultRoute || 'SQ',
                        siteOfInjection: updated[0].siteOfInjection || vc.defaultSite || 'Right Scruff',
                        dueDate: updated[0].dueDate || hydrationDueDate,
                        intervalDays: updated[0].intervalDays || vc.intervalDays || 365,
                    };
                }
                return updated;
            });
        }

        if (cancelled) return;
        setTreatmentCart(initialCart);

        const initAttribution = {};
        (patient.services || []).forEach(svc => {
            if (svc.staffId) {
                initAttribution[svc.id] = { staffId: svc.staffId, staffName: svc.staffName || 'Unassigned' };
            }
        });
        setServiceAttribution(initAttribution);

        // T2.95: Hydrate per-service progress from appointment data
        const initProgress = {};
        (patient.services || []).forEach(svc => {
            if (svc.id) initProgress[svc.id] = svc.serviceStatus || 'pending';
        });
        setServiceProgress(initProgress);

        // Reserve stock for auto-bundled products
        for (const cartItem of initialCart) {
            if (cartItem.type === 'product' && reserveStock) {
                try { await reserveStock(cartItem.id, cartItem.qty); }
                catch (e) { console.error(`Failed to reserve stock for ${cartItem.name}:`, e); }
            }
        }

        if (patient.petId && patient.petId !== "WALK_IN_USER" && patient.petId !== "UNKNOWN") {
          try {
            const petDoc = await getDoc(doc(db, "pets", patient.petId));
            if (petDoc.exists()) setPetDetails(petDoc.data());
            else setPetDetails(null);

            const q = query(collection(db, "medical_records"), where("petId", "==", patient.petId), orderBy("date", "desc"));
            const snapshot = await getDocs(q);
            const historyData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setHistory(historyData);

            // T3.53: Derive overdue vaccine count for the identity strip warning badge.
            // historyData is sorted desc by date, so the first record per vaccine name is
            // the most recent. The seen Set deduplicates correctly on that basis.
            {
              const nowTs = new Date();
              let overdueCount = 0;
              const seen = new Set();
              historyData.forEach(r => {
                const admins = r.vaccineAdministrations?.length > 0
                  ? r.vaccineAdministrations
                  : (r.vaccineData?.vaccineName ? [r.vaccineData] : []);
                admins.forEach(vax => {
                  const name = vax.vaccineName;
                  if (!name || seen.has(name)) return;
                  seen.add(name);
                  const rDate = r.date?.toDate
                    ? r.date.toDate()
                    : r.date?.seconds
                    ? new Date(r.date.seconds * 1000)
                    : r.date
                    ? new Date(r.date)
                    : null;
                  if (!rDate) return;
                  const explicit = vax.dueDate
                    ? (vax.dueDate.toDate
                      ? vax.dueDate.toDate()
                      : vax.dueDate.seconds
                      ? new Date(vax.dueDate.seconds * 1000)
                      : new Date(vax.dueDate))
                    : null;
                  const interval = vax.intervalDays || 365;
                  const dueDate = explicit || new Date(rDate.getTime() + interval * 86400000);
                  if (dueDate < nowTs) overdueCount++;
                });
              });
              if (!cancelled) setOverdueVaccineCount(overdueCount);
            }

            if (cancelled) return;

            if (historyData.length > 0) {
              setPrevVitals(historyData[0].vitals || null);
            } else {
              setPrevVitals(null);
            }

             const apptQ = query(collection(db, 'appointments'), where('petId', '==', patient.petId));
             const apptSnap = await getDocs(apptQ);
             const now = new Date();
             const future = apptSnap.docs
               .map(d => ({ id: d.id, ...d.data() }))
               .filter(a => {
                 const aDate = a.date?.toDate ? a.date.toDate() : (a.date?.seconds ? new Date(a.date.seconds * 1000) : null);
                 return aDate && aDate > now && !['completed', 'cancelled', 'no-show'].includes(a.status);
               })
               .sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));
             setNextAppointment(future.length > 0 ? future[0] : null);

          } catch (e) { console.error("Error fetching context:", e); }
        } else {
          if (cancelled) return;
          setPetDetails(null); setHistory([]);
        }
      }
    };
    fetchPatientContext();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient]);

  // --- 2. HANDLERS ---

  // --- TRIAGE ENGINE ---
  const getTriageLevel = (type, value) => {
    const v = parseFloat(value);
    if (!v && v !== 0) return 'normal';

    // Temperature (species-aware)
    if (type === 'temp') {
        const species = (patient?.petSpecies || '').toLowerCase();
        if (species === 'cat' || species === 'feline') {
            if (v > 39.5 || v < 37.5) return 'critical';
            if (v > 39.2 || v < 38.0) return 'warning';
        } else {
            if (v > 39.5 || v < 37.0) return 'critical';
            if (v > 39.2 || v < 37.5) return 'warning';
        }
    }
    // Heart Rate
    if (type === 'hr') {
        if (v > 180 || v < 40) return 'critical';
        if (v > 140 || v < 60) return 'warning';
    }
    // Respiratory Rate
    if (type === 'rr') {
        if (v > 60 || v < 8) return 'critical';
        if (v > 40 || v < 10) return 'warning';
    }
    // CRT (Capillary Refill Time)
    if (type === 'crt') {
        if (v > 4) return 'critical';
        if (v > 2.5) return 'warning';
    }
    // Pain Scale
    if (type === 'pain') {
        if (v >= 8) return 'critical';
        if (v >= 5) return 'warning';
    }
    return 'normal';
  };
  
  const doClose = () => {
    if (!isRecordLockedRef.current && !hasReleasedRef.current) {
      hasReleasedRef.current = true;
      treatmentCartRef.current.forEach(item => {
        if (item.type === 'product' && releaseStock) {
          releaseStock(item.id, item.qty || 1).catch(e =>
            console.error(`[ClinicalWorkspace] Failed to release reservation for ${item.name}:`, e)
          );
        }
      });
    }
    onClose();
  };

  const handleCloseRequest = () => {
    setIsEditingIdentity(false);
    setIdentityForm(null);
    setLocalPetAllergies(null);

    if (isDirty) {
      setCloseConfirmOpen(true);
    } else {
      doClose();
    }
  };

  const updateSoap = (field, value) => { setSoapData(prev => ({ ...prev, [field]: value })); setIsDirty(true); };

  const applyTemplate = (type) => {
    switch (type) {
      case 'wnl': {
        setSoapData(prev => ({
          ...prev,
          objectiveExam: createDefaultExam(),
          objectiveNotes: '',
        }));
        setIsDirty(true);
        break;
      }

      default:
        break;
    }
  };

  // --- 🆕 CLINCAL COMPARISON ENGINE (THE GHOST) ---
  const renderHistoricalLabel = (field, customVal = null) => {
    if (!history || history.length === 0) return null;
    const last = history[0];
    let val = customVal;

    if (!val) {
        const FIELD_TO_VITALS_KEY = {
            objWeight: 'weight',
            objTemp: 'temp',
            objHR: 'hr',
            objRR: 'rr',
            objCRT: 'crt',
            bcs: 'bcs',
            painScale: 'pain',
        };
        const vKey = FIELD_TO_VITALS_KEY[field];
        val = vKey ? last.vitals?.[vKey] : last[field];
    }

    if (!val || val === '0' || val === 0) return null;
    return (
      <Typography variant="caption" sx={{ display: 'block', fontSize: '0.62rem', color: COLORS.textMuted, fontWeight: 900, mt: 0.25, opacity: 0.8, letterSpacing: 0.5 }}>
        LAST: {val}
      </Typography>
    );
  };

  const runAssistiveDiagnosis = () => {
    const examText = examToText(soapData.objectiveExam) || soapData.objectiveNotes || '';
    const combinedNotes = (soapData.subjective + " " + examText).toLowerCase();
    let suggestions =[];
    KNOWLEDGE_BASE.forEach(c => {
      if (c.keywords.some(k => combinedNotes.includes(k))) suggestions.push(c.suggestion);
    });
    setAssistiveText(suggestions.length > 0 ? suggestions.join('\n\n') : 'No rule-based suggestions found. Please proceed with standard diagnostics.');
  };

  /**
   * Sends the current SOAP S+O data to the LLM via the Cloudflare Worker proxy
   * and writes a full audit trail to the `llm_audit_logs` Firestore collection.
   *
   * Guard: only runs when llmEnabled is true and a workerUrl is configured.
   * Unmount guard: checks llmAbortRef before every setState to prevent React
   * warnings when the vet closes the workspace during an in-flight call.
   */
  /**
   * Builds the structured SOAP user message for the initial AI analysis.
   * Delegates message assembly to the exported buildUserMessage from llmService
   * so the format stays consistent with the structured clinical prompt format.
   */
  const buildInitialSoapMessage = () => buildUserMessage({
    subjective: soapData.subjective || '',
    objective: examToText(soapData.objectiveExam) || soapData.objectiveNotes || '',
    vitals: {
      temp: soapData.objTemp,
      hr: soapData.objHR,
      rr: soapData.objRR,
      crt: soapData.objCRT,
      bcs: soapData.bcs,
      pain: soapData.painScale,
    },
    species: patient?.petSpecies || petDetails?.species || '',
    breed: patient?.petBreed || petDetails?.breed || '',
    age: calculateAge(patient?.petBirthdate || petDetails?.dob) || '',
    weight: soapData.objWeight || patient?.petWeight || '',
  });

  /**
   * Multi-turn LLM handler (T4.109). On the first call (empty messages + no followUpText),
   * assembles the SOAP context message and opens the panel. On subsequent calls, appends the
   * follow-up text to the existing conversation and sends the full history via chatWithHistory.
   *
   * A 20-message sliding window (first message preserved + last 19) prevents context overflow
   * while keeping the original SOAP signalment in every request.
   *
   * @param {string} [followUpText] - Follow-up question text. Omit for an initial "Analyze S+O" call.
   * @param {{ forceInitial?: boolean }} [options]
   *   forceInitial: true starts a fresh analysis regardless of existing messages (used by
   *   handleResetAndAskAI to avoid a setState race between clearing messages and re-triggering).
   */
  const runLlmDiagnosis = async (followUpText, { forceInitial = false } = {}) => {
    if (!llmConfig.enabled || !llmConfig.workerUrl) return;
    if (llmLoading) return;

    // Determine message content and conversation base
    const isInitial = (llmMessages.length === 0 && !followUpText) || forceInitial;
    const userContent = isInitial
      ? buildInitialSoapMessage()
      : (followUpText || '').trim();

    if (!userContent) return;

    // Persist the content so handleLlmRetry can re-send after an error.
    lastLlmUserContentRef.current = userContent;

    const baseMessages = forceInitial ? [] : llmMessages;
    const userMsg = { role: 'user', content: userContent };
    const updatedMessages = [...baseMessages, userMsg];

    // Sliding window: always preserve the first SOAP context message + last 19 turns
    const cappedMessages = updatedMessages.length > 20
      ? [updatedMessages[0], ...updatedMessages.slice(-19)]
      : updatedMessages;

    if (!llmAbortRef.current) {
      setLlmMessages(cappedMessages);
      setLlmLoading(true);
      setLlmError('');
      setIsAIDrawerOpen(true);
      setLlmFollowUpInput('');
    }

    const auditBase = {
      staffId: cwProfile?.uid || '',
      staffName: cwProfile?.fullName || cwProfile?.email || 'Unknown',
      appointmentId: patient?.id || '',
      petName: patient?.petName || '',
      species: patient?.petSpecies || petDetails?.species || '',
      timestamp: Timestamp.now(),
    };

    // Pre-call audit log — written unconditionally so every request is traced,
    // even if the call subsequently fails.
    let auditRef;
    try {
      auditRef = await addDoc(collection(db, 'llm_audit_logs'), {
        ...auditBase,
        type: isInitial ? 'request' : 'follow_up',
        status: 'pending',
        promptSummary: userContent.substring(0, 200),
        messageCount: cappedMessages.length,
      });
    } catch (auditErr) {
      // Non-fatal: log and continue — a failed audit write should not block the AI call.
      console.error('[ClinicalWorkspace.runLlmDiagnosis] Audit pre-log failed:', auditErr.message);
    }

    try {
      const result = await chatWithHistory({
        messages: cappedMessages,
        systemPrompt: llmConfig.systemPrompt,
        workerUrl: llmConfig.workerUrl,
      });

      if (!llmAbortRef.current) {
        setLlmMessages(prev => [...prev, { role: 'assistant', content: result.text }]);
      }

      if (auditRef) {
        await updateDoc(auditRef, {
          status: 'success',
          responseSummary: (result.text || '').substring(0, 500),
          tokenCount: result.tokenCount ?? null,
          completedAt: Timestamp.now(),
        });
      }
    } catch (err) {
      if (!llmAbortRef.current) {
        setLlmError(err.message || 'LLM request failed.');
      }

      if (auditRef) {
        await updateDoc(auditRef, {
          status: 'error',
          errorMessage: err.message || 'Unknown error',
          completedAt: Timestamp.now(),
        }).catch(() => {});
      }
    } finally {
      if (!llmAbortRef.current) {
        setLlmLoading(false);
      }
    }
  };

  /**
   * Sends the current follow-up input as a new turn in the conversation.
   * No-ops if the input is blank or an LLM call is already in-flight.
   */
  const handleLlmFollowUp = () => {
    const text = llmFollowUpInput.trim();
    if (!text) return;
    runLlmDiagnosis(text);
  };

  /**
   * Clears the existing conversation and runs a fresh SOAP analysis.
   * Uses forceInitial=true to build from scratch regardless of current llmMessages state,
   * avoiding the async setState race that would occur with setLlmMessages([]) + runLlmDiagnosis().
   */
  const handleResetAndAskAI = () => {
    setLlmMessages([]);
    runLlmDiagnosis(undefined, { forceInitial: true });
  };

  /**
   * Retries the last failed LLM call using the stored user message content.
   * Called by ClinicalAIPanel's "Try Again" button after all auto-retries fail.
   * Drops the orphaned user message (no paired assistant reply) before re-sending
   * to prevent the conversation accumulating incomplete turns.
   */
  const handleLlmRetry = () => {
    if (!lastLlmUserContentRef.current) return;
    setLlmError('');
    setLlmMessages(prev => {
      // Drop the trailing user message that had no paired assistant reply.
      if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
        return prev.slice(0, -1);
      }
      return prev;
    });
    // Use setTimeout(0) to let the state flush before runLlmDiagnosis reads llmMessages.
    setTimeout(() => {
      const content = lastLlmUserContentRef.current;
      // If only 1 message existed (the initial SOAP call), re-run as fresh analysis.
      if (llmMessages.length <= 1) {
        runLlmDiagnosis(undefined, { forceInitial: true });
      } else {
        runLlmDiagnosis(content);
      }
    }, 0);
  };

  /** Opens or closes the AI side panel (drawer in default view, no-op in God View). */
  const handleToggleAIPanel = (open) => setIsAIDrawerOpen(open);

  // --- 3. TREATMENT PLAN LOGIC (THE BRIDGE) ---
  const handleAddRx = async (item, _skipAllergenCheck) => {
    if (!item) return;

    // T4.117: Block out-of-stock products — with vaccine-specific override.
    // Vaccine products can be administered even when stock is zero (client-supplied
    // vaccine scenario). Non-vaccine products retain the hard block.
    if (item.stock !== undefined) {
        const netAvailable = (item.stock || 0) - (item.reserved || 0);
        if (netAvailable <= 0) {
            if ((item.category || '').toLowerCase() !== 'vaccine') {
                showToast("This product is out of stock and cannot be added.", "error");
                return;
            }
            // Vaccine: allow add — noStockDeduction flag set on itemObj below
        }
    }

    // T2.175: Allergen safety check — warn if any of the product's allergenTags match a word
    // in the patient's petAllergies string. Case-insensitive word-boundary match.
    if (!_skipAllergenCheck && item.allergenTags && item.allergenTags.length > 0) {
      const patientAllergies = (patient?.petAllergies || patient?.allergies || '').toLowerCase();
      if (patientAllergies.length > 0 && patientAllergies !== 'none') {
        const matchingTags = item.allergenTags.filter(tag => {
          const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`\\b${escaped}\\b`, 'i').test(patientAllergies);
        });
        if (matchingTags.length > 0) {
          setAllergenConfirm({
            productName: item.itemName || item.name,
            matchingTags: matchingTags.join(', '),
            patientAllergies: patient?.petAllergies || patient?.allergies || '',
            onConfirm: () => { setAllergenConfirm(null); handleAddRx(item, true); },
          });
          return;
        }
      }
    }

    const resolvedPC = item.productClass || (item.isMedicine ? 'medicine' : 'retail');

    // Deduplicate: if item already in cart, increment qty instead of adding duplicate
    const existingIdx = treatmentCart.findIndex(rx => rx.id === item.id);
    if (existingIdx >= 0) {
        handleUpdateQty(existingIdx, 1);
        return;
    }

    const itemCategory = (item.category || '').toLowerCase();
    const netAvailableForItem = item.stock !== undefined
      ? (item.stock || 0) - (item.reserved || 0)
      : Infinity;
    const itemObj = {
      type: item.stock !== undefined ? 'product' : 'service',
      id: item.id,
      name: item.itemName || item.name,
      price: item.stock !== undefined
          ? (item.price || 0)
          : resolveTieredPrice(item, parseFloat(soapData.objWeight) || (patient?.petWeight ? parseFloat(patient.petWeight) : null)),
      qty: 1,
      isDrug: resolvedPC === 'medicine',
      productClass: resolvedPC,
      isDispensed: false, // Default to Clinic Admin
      // T4.117: Carry inventory category so category-based vaccine detection works
      category: itemCategory,
      // T4.117: Flag zero-stock vaccine adds — stock deduction is skipped for these,
      // and the flag is persisted to the medical record for audit purposes.
      noStockDeduction: itemCategory === 'vaccine' && netAvailableForItem <= 0,
      sig: { dose: '1', frequency: 'SID', duration: '1', unit: item.unit || 'unit', route: 'SQ' },
      instructions: ''
    };

    // Step 4 (T3.110): Auto-populate instructions for drug items from sig defaults.
    // Gives the vet a readable starting point (e.g. "1 unit once daily for 1 day (SQ)")
    // that they can overwrite before signing off.
    if (resolvedPC === 'medicine') {
      itemObj.instructions = buildInstructionsFromSig(itemObj.sig);
    }

    setTreatmentCart(prev => [...prev, itemObj]);
    setIsDirty(true);

    // T4.127: Mid-consult service registration — push to appointment's services[]
    // so handleToggleServiceProgress, clinicalPulse events, and serviceStartedAt/
    // serviceCompletedAt timestamps work for ad-hoc service additions.
    if (itemObj.type === 'service') {
      setServiceProgress(prev => ({ ...prev, [itemObj.id]: 'pending' }));
      try {
        await updateDoc(doc(db, "appointments", patient.id), {
          services: arrayUnion({
            id: itemObj.id,
            name: itemObj.name,
            price: itemObj.price,
            addedDuringConsult: true,
          }),
        });
      } catch (e) {
        console.error('[ClinicalWorkspace] Mid-consult service registration failed:', e);
        // Non-blocking: service still appears in treatmentCart, just won't have
        // full progress tracking. Show warning toast.
        showToast('Service added to cart but progress tracking may be limited.', 'warning');
      }
    }

    // T4.117: If this is a vaccine-category product, auto-fill the vaccine form
    // from vaccineConfig defaults + FIFO batch data. Replaces the old keyword-based
    // detection (vaccineKeywords.some(kw => name.includes(kw))).
    if (itemObj.type === 'product' && itemObj.category === 'vaccine') {
        const vc = item.vaccineConfig || {};
        const batch = item.batches?.length > 0 ? item.batches[0] : null;

        // Enable the vaccine form if not already showing
        if (!showVaccineForm) {
            setManualVaccineOverride(true);
        }

        const dueDate = (() => {
            const days = vc.intervalDays || 365;
            const due = new Date();
            due.setDate(due.getDate() + days);
            return due.toISOString().slice(0, 10);
        })();

        setVaccineAdministrations(prev => {
            const emptyIdx = prev.findIndex(v => !v.vaccineName);
            const updated = [...prev];
            const newEntry = {
                vaccineName: item.itemName || item.name || '',
                manufacturer: batch?.manufacturer || vc.defaultManufacturer || '',
                lotNumber: batch?.batchNumber || batch?.lotNumber || '',
                routeOfAdmin: vc.defaultRoute || 'SQ',
                siteOfInjection: vc.defaultSite || 'Right Scruff',
                dueDate,
                intervalDays: vc.intervalDays || 365,
                noStockDeduction: itemObj.noStockDeduction || false,
            };
            if (emptyIdx >= 0) {
                updated[emptyIdx] = { ...updated[emptyIdx], ...newEntry };
            } else {
                updated.push(newEntry);
            }
            return updated;
        });

        if (itemObj.noStockDeduction) {
            showToast(
                `${itemObj.name} added with no stock deduction — client-supplied vaccine. Record will be flagged for audit.`,
                'warning'
            );
        }
    }

    // --- SOFT-RESERVE TRIGGER ---
    // T4.117: Skip reservation for noStockDeduction items (zero-stock vaccines).
    if (itemObj.type === 'product' && reserveStock && !itemObj.noStockDeduction) {
        try {
            await reserveStock(itemObj.id, 1);
        } catch (e) {
            console.error(`[ClinicalWorkspace] Stock reservation failed for ${itemObj.name}:`, e);
            showToast(`Warning: Could not reserve stock for ${itemObj.name}. The item was added but may not be available at checkout.`, 'warning');
        }
    }
  };

  const handleRemoveRx = (index) => {
    if (treatmentCart[index].isBase) return;
    const itemToRemove = treatmentCart[index];
    const newCart =[...treatmentCart];
    newCart.splice(index, 1);
    setTreatmentCart(newCart);
    setIsDirty(true);

    // --- SOFT-RELEASE TRIGGER ---
    if (itemToRemove.type === 'product') {
        releaseStock(itemToRemove.id, itemToRemove.qty || 1).catch(e =>
            console.error(`[ClinicalWorkspace] Failed to release reservation for ${itemToRemove.name}:`, e)
        );
    }
  };

  const handleUpdateQty = async (index, delta) => {
    const newCart = [...treatmentCart];
    const item = newCart[index];
    const oldQty = item.qty || 1;
    const newQty = Math.max(1, oldQty + delta);

    if (newQty === oldQty) return;

    // Check Stock Availability if increasing
    if (delta > 0 && item.type === 'product') {
      const invItem = inventoryList.find(i => i.id === item.id);
      if (invItem && (invItem.stock - invItem.reserved) <= 0) {
        return alert("⚠️ STOCK EXHAUSTED: Cannot increase quantity further.");
      }
    }

    item.qty = newQty;
    setTreatmentCart(newCart);
    setIsDirty(true);

    // Sync Inventory Reservation
    if (item.type === 'product') {
        try {
            if (delta > 0) await reserveStock(item.id, 1);
            else await releaseStock(item.id, 1);
        } catch (e) {
            console.error(`[ClinicalWorkspace] Stock reservation sync failed:`, e);
        }
    }
  };
  const handleUpdateRxSig = (index, text) => {
    const newCart = [...treatmentCart];
    newCart[index].instructions = text;
    setTreatmentCart(newCart);
    setIsDirty(true);
  };

  /**
   * Updates a single sig field on a medicine cart item and auto-regenerates
   * the instructions string so both remain in sync.
   */
  const handleUpdateSigField = (index, field, value) => {
    const newCart = [...treatmentCart];
    const item = newCart[index];
    const newSig = { ...(item.sig || {}), [field]: value };
    item.sig = newSig;
    item.instructions = buildInstructionsFromSig(newSig);
    setTreatmentCart(newCart);
    setIsDirty(true);
  };

  const handleUpdateRxField = (index, field, value) => {
    const newCart = [...treatmentCart];
    newCart[index][field] = value;
    setTreatmentCart(newCart);
    setIsDirty(true);
  };

  // T2.95: Cycle per-service progress: pending → in-progress → completed
  const handleToggleServiceProgress = async (svcId) => {
    const current = serviceProgress[svcId] || 'pending';
    const next = current === 'pending' ? 'in-progress'
               : current === 'in-progress' ? 'completed'
               : 'completed'; // completed stays completed (no revert in normal flow)

    setServiceProgress(prev => ({ ...prev, [svcId]: next }));

    try {
      const now = Timestamp.now();
      // T4.127: Merge mid-consult services from treatmentCart into patient.services before mapping.
      // Without this, arrayUnion-added services get silently dropped when we write the full array.
      const existingIds = new Set((patient.services || []).map(s => s.id));
      const mergedServices = [
        ...(patient.services || []),
        ...treatmentCart
          .filter(item => item.type === 'service' && !existingIds.has(item.id))
          .map(item => ({ id: item.id, name: item.name, price: item.price, addedDuringConsult: true })),
      ];
      const newServices = mergedServices.map(s => ({
        ...s,
        serviceStatus: s.id === svcId ? next : (serviceProgress[s.id] ?? s.serviceStatus ?? 'pending'),
        ...(s.id === svcId && next === 'in-progress' ? { serviceStartedAt: now } : {}),
        ...(s.id === svcId && next === 'completed' ? { serviceCompletedAt: now } : {}),
      }));
      await updateDoc(doc(db, "appointments", patient.id), {
        services: newServices,
        clinicalPulse: arrayUnion({
          eventId: makePulseEventId(`svc-${next}`),
          type: next === 'in-progress' ? 'SERVICE_STARTED' : 'SERVICE_COMPLETED',
          timestamp: Timestamp.now(),
          staffId: auth.currentUser?.uid || 'unknown',
          staffName: auth.currentUser?.displayName || 'Authorized Clinician',
          serviceId: svcId,
          serviceName: (patient.services || []).find(s => s.id === svcId)?.name || svcId,
          note: `${(patient.services || []).find(s => s.id === svcId)?.name || 'Service'} ${next === 'in-progress' ? 'started' : 'completed'}.`,
        }),
      });
    } catch (e) {
      console.error('[ClinicalWorkspace] Service progress update failed:', e);
      setServiceProgress(prev => ({ ...prev, [svcId]: current }));
      showToast('Failed to update service progress.', 'error');
    }
  };

  // --- 4. SAVE LOGIC ---

  /**
   * T4.117: Detects vaccination visits by checking whether any treatment cart item
   * carries category === 'vaccine'. Category-based detection is deterministic and
   * eliminates false positives from keyword substring matching.
   *
   * This replaces the previous keyword-based approach (buildVaccineKeywords + string
   * matching against service names) which was fragile and required manual curation
   * of the keyword list.
   */
  const isVaccinationVisit = treatmentCart.some(item => item.category === 'vaccine');

  // T3.2: Effective flag — vaccine form is shown when auto-detected OR manually toggled.
  const showVaccineForm = isVaccinationVisit || manualVaccineOverride;

  /** Species-filtered vaccine dropdown options from the live catalog (active entries only), plus a free-text "Other" entry */
  const vaccineOptions = useMemo(() => {
    const species = (petDetails?.species || '').toLowerCase();
    const active = vaccineCatalog.filter(v => v.isActive !== false);
    const filtered = species
      ? active.filter(v => v.species.includes(species))
      : active;
    return [...filtered.map(v => v.name), 'Other'];
  }, [petDetails, vaccineCatalog]);

  /**
   * T4.117: Species-filtered vaccine-category inventory products for the Plan
   * quadrant Autocomplete. Non-archived products only. Species matching uses
   * vaccineConfig.species array; if absent, the product appears for all species.
   */
  const vaccineProducts = useMemo(() => {
    const species = (petDetails?.species || patient?.petSpecies || '').toLowerCase();
    const spKey = (species.includes('cat') || species.includes('feline')) ? 'cat' : 'dog';
    return (inventoryList || [])
      .filter(p => (p.category || '').toLowerCase() === 'vaccine' && !p.isArchived)
      .filter(p => {
        const vcSpecies = p.vaccineConfig?.species;
        return !vcSpecies || vcSpecies.length === 0 || vcSpecies.includes(spKey);
      });
  }, [inventoryList, petDetails, patient?.petSpecies]);

  /**
   * T4.117: Plan quadrant vaccine Autocomplete handler.
   * Delegates to handleAddRx so cart handling, stock reservation, and vaccine
   * form auto-population all use a single code path.
   */
  const handleAddVaccineProduct = (product) => {
    if (!product) return;
    handleAddRx(product);
  };

  const hasDrugsInCart = treatmentCart.some(item =>
    (item.productClass || (item.isDrug ? 'medicine' : 'retail')) === 'medicine'
  );
  const nextRouteStatus = hasDrugsInCart ? "dispensing" : "billing";
  const saveBtnText = hasDrugsInCart ? "Sign & Send to Pharmacy" : "Sign & Send to Cashier";

  // T4.181: Enter identity edit mode — pre-fill form from petDetails (Firestore pet doc).
  const handleEditIdentity = () => {
    if (!petDetails) return;

    // --- DOB MODE PRE-FILL (same pattern as EditPetModal lines 33-53) ---
    let initialDobMode = 'unknown';
    let initialEstYears = '';
    let initialEstMonths = '';
    let initialDob = '';

    if (petDetails.dob) {
      const dobDate = petDetails.dob?.toDate ? petDetails.dob.toDate() : new Date(petDetails.dob);
      if (petDetails.isAgeExact === true || petDetails.isAgeExact === undefined) {
        initialDobMode = 'exact';
        initialDob = dobDate.toISOString().split('T')[0];
      } else {
        initialDobMode = 'approximate';
        const now = new Date();
        const diffMs = now - dobDate;
        const totalMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44));
        initialEstYears = String(Math.floor(totalMonths / 12));
        initialEstMonths = String(totalMonths % 12);
      }
    }

    // --- ALLERGY PRE-FILL (same pattern as EditPetModal lines 57-61) ---
    const existingAllergies = petDetails.petAllergies || petDetails.allergies || 'None';
    const hasAllergies = existingAllergies.trim().toLowerCase() !== 'none' && existingAllergies.trim() !== '';
    const parsedAllergyArray = hasAllergies
      ? existingAllergies.split(',').map(a => a.trim()).filter(Boolean)
      : [];

    setIdentityForm({
      name: petDetails.name || patient?.petName || '',
      species: petDetails.species || patient?.petSpecies || 'Canine',
      breed: petDetails.breed || patient?.petBreed || '',
      gender: petDetails.gender || patient?.petGender || 'Male',
      isNeutered: petDetails.isNeutered ?? patient?.petIsNeutered ?? false,
      microchip: petDetails.microchip || '',
      color: petDetails.color || '',
      dobMode: initialDobMode,
      dob: initialDob,
      estYears: initialEstYears,
      estMonths: initialEstMonths,
      showAllergyInput: hasAllergies,
      allergyArray: parsedAllergyArray,
      currentAllergyInput: '',
    });
    setIsEditingIdentity(true);
  };

  // T4.181: Save identity edits — write to pets + appointment + pulse + propagate allergies.
  const handleSaveIdentity = async () => {
    if (!identityForm || !patient?.petId || !patient?.id) return;
    setIdentitySaving(true);
    try {
      // 1. Resolve DOB (same pattern as EditPetModal lines 86-104)
      let resolvedDob = null;
      let resolvedIsAgeExact = false;
      if (identityForm.dobMode === 'exact') {
        resolvedDob = identityForm.dob ? Timestamp.fromDate(new Date(identityForm.dob)) : null;
        resolvedIsAgeExact = true;
      } else if (identityForm.dobMode === 'approximate') {
        const years = parseInt(identityForm.estYears) || 0;
        const months = parseInt(identityForm.estMonths) || 0;
        const d = new Date();
        d.setFullYear(d.getFullYear() - years);
        d.setMonth(d.getMonth() - months);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        resolvedDob = Timestamp.fromDate(d);
        resolvedIsAgeExact = false;
      }

      // 2. Resolve allergies (same pattern as EditPetModal lines 113-115)
      const resolvedAllergies = identityForm.showAllergyInput && identityForm.allergyArray.length > 0
        ? identityForm.allergyArray.join(', ')
        : 'None';

      // 3. Build pet payload
      const petPayload = {
        name: identityForm.name.trim(),
        species: identityForm.species,
        breed: identityForm.breed.trim() || 'Unknown Breed',
        gender: identityForm.gender,
        isNeutered: identityForm.isNeutered,
        dob: resolvedDob,
        isAgeExact: resolvedIsAgeExact,
        petAllergies: resolvedAllergies,
        allergies: resolvedAllergies,       // legacy alias
        microchip: identityForm.microchip.trim(),
        color: identityForm.color.trim(),
        updatedAt: Timestamp.now(),
      };

      // 4. Write to pets/{petId}
      await updateDoc(doc(db, 'pets', patient.petId), petPayload);

      // 5. Compute changedFields[] (same pattern as Queue.jsx lines 930-938)
      const changedFields = [];
      if (identityForm.name.trim() !== (petDetails?.name || patient?.petName || '')) changedFields.push('petName');
      if (identityForm.species !== (petDetails?.species || patient?.petSpecies || '')) changedFields.push('petSpecies');
      if (identityForm.breed.trim() !== (petDetails?.breed || patient?.petBreed || '')) changedFields.push('petBreed');
      if (identityForm.gender !== (petDetails?.gender || patient?.petGender || '')) changedFields.push('petGender');
      if (identityForm.isNeutered !== (petDetails?.isNeutered ?? patient?.petIsNeutered ?? false)) changedFields.push('petIsNeutered');
      if (identityForm.microchip.trim() !== (petDetails?.microchip || '')) changedFields.push('microchip');
      if (identityForm.color.trim() !== (petDetails?.color || '')) changedFields.push('color');
      // DOB comparison: compare dobMode + resolved values vs original
      const origDobMode = (petDetails?.isAgeExact === true || petDetails?.isAgeExact === undefined)
        ? (petDetails?.dob ? 'exact' : 'unknown')
        : (petDetails?.dob ? 'approximate' : 'unknown');
      if (identityForm.dobMode !== origDobMode) changedFields.push('dob');
      else if (identityForm.dobMode === 'exact' && identityForm.dob !== (petDetails?.dob?.toDate?.()?.toISOString()?.split('T')[0] || '')) changedFields.push('dob');
      // Allergy comparison
      const origAllergies = petDetails?.petAllergies || petDetails?.allergies || 'None';
      if (resolvedAllergies !== origAllergies) changedFields.push('petAllergies');

      // 6. Write to appointments/{appointmentId} + IDENTITY_EDIT pulse
      await updateDoc(doc(db, 'appointments', patient.id), {
        petName: identityForm.name.trim(),
        petSpecies: identityForm.species,
        petBreed: identityForm.breed.trim() || 'Unknown Breed',
        petGender: identityForm.gender,
        petIsNeutered: identityForm.isNeutered,
        petBirthdate: resolvedDob,
        isAgeExact: resolvedIsAgeExact,
        petAllergies: resolvedAllergies,
        color: identityForm.color.trim(),
        microchip: identityForm.microchip.trim(),
        clinicalPulse: arrayUnion({
          eventId: makePulseEventId('identity-edit'),
          type: 'IDENTITY_EDIT',
          timestamp: Timestamp.now(),
          staffId: cwProfile?.uid || 'unknown',
          staffName: cwProfile?.fullName || 'System',
          note: changedFields.length > 0
            ? `Identity fields edited during consult: ${changedFields.join(', ')}`
            : 'Identity record accessed during consult (no changes detected)',
        }),
      });

      // 7. Propagate petAllergies to all active appointments for this pet
      //    (same pattern as EditPetModal lines 144-157)
      const ACTIVE_STATUSES = ['pending', 'confirmed', 'arrived', 'in-consult', 'dispensing', 'billing'];
      const apptQuery = query(
        collection(db, 'appointments'),
        where('petId', '==', patient.petId),
        where('status', 'in', ACTIVE_STATUSES),
      );
      const apptSnap = await getDocs(apptQuery);
      if (!apptSnap.empty) {
        const batch = writeBatch(db);
        apptSnap.docs.forEach(apptDoc => {
          // Skip the current appointment — already updated above
          if (apptDoc.id !== patient.id) {
            batch.update(apptDoc.ref, { petAllergies: resolvedAllergies });
          }
        });
        await batch.commit();
      }

      // 8. Refresh local petDetails state
      const refreshedPetDoc = await getDoc(doc(db, 'pets', patient.petId));
      if (refreshedPetDoc.exists()) setPetDetails(refreshedPetDoc.data());

      // 9. Close edit mode + overlay allergy display for current session
      setIsEditingIdentity(false);
      setIdentityForm(null);
      setLocalPetAllergies(resolvedAllergies);
      showToast(
        changedFields.length > 0
          ? `Patient identity updated: ${changedFields.join(', ')}`
          : 'No changes detected.',
        changedFields.length > 0 ? 'success' : 'info'
      );
    } catch (err) {
      console.error('[ClinicalWorkspace.handleSaveIdentity]:', err);
      showToast(`Identity save failed: ${err.message}`, 'error');
    } finally {
      setIdentitySaving(false);
    }
  };

  const handleSaveConsult = async () => {
    if (isSavingRef.current) return;

    if (lockedServices.has('medical')) {
        showToast("This clinical record has already been signed off. No duplicate records can be created.", "error");
        return;
    }

    // T3.136 Layer 3B: Block sign-off when measurement vitals exceed physical limits.
    // BCS and Pain are excluded (clamp:true — they are always within range after Layer 2).
    // CRT is excluded (absent from VITALS_LIMITS — it uses clinical text notation).
    // Empty vitals are allowed — vets may intentionally skip fields.
    const outOfRangeVitals = Object.entries(VITALS_LIMITS)
      .filter(([, cfg]) => !cfg.clamp)
      .filter(([field, cfg]) => {
        const val = soapData[field];
        if (val === '' || val == null) return false;
        const num = parseFloat(val);
        if (isNaN(num)) return false;
        return num < cfg.min || num > cfg.max;
      })
      .map(([, cfg]) => `${cfg.label} (${cfg.min}–${cfg.max} ${cfg.unit})`);

    if (outOfRangeVitals.length > 0) {
      showToast(
        `Vitals out of valid range: ${outOfRangeVitals.join(', ')}. Please correct before signing off.`,
        'error'
      );
      return;
    }

    const proceedWithSave = async () => {
      isSavingRef.current = true;
      setLoading(true);
      try {
      const vetUid = auth.currentUser?.uid || "system";
      const vetName = auth.currentUser?.displayName || "Authorized Clinician";
      const visitTotal = treatmentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      const commitTimestamp = Timestamp.now();

      // Read fresh appointment data before the batch so statusHistory uses the
      // server-side array rather than arrayUnion (which silently deduplicates).
      // Option A: pre-batch read — small race window, acceptable for this path.
      const freshApptSnap = await getDoc(doc(db, "appointments", patient.id));
      const freshStatusHistory = freshApptSnap.exists() ? (freshApptSnap.data().statusHistory || []) : [];

      // T3.121: Sign-off guard — auto-transition arrived/confirmed patients to in-consult.
      // Without this guard, sign-off would skip the arrived→in-consult transition —
      // corrupting statusHistory, pulse timeline, timeStarted, and consult duration metrics.
      // Uses fresh server-side status (not stale patient prop).
      let currentFreshStatus = freshApptSnap.exists() ? (freshApptSnap.data().status || 'unknown') : 'unknown';
      const PRE_CONSULT_STATUSES = ['arrived', 'confirmed'];

      if (PRE_CONSULT_STATUSES.includes(currentFreshStatus)) {
          const transitionEvent = createPulseEvent('STATUS_CHANGE', {
              fromStatus: currentFreshStatus,
              toStatus: 'in-consult',
              staffId: vetUid,
              staffName: vetName,
              note: 'Auto-transition: sign-off initiated on pre-consult patient (T3.121 guard).',
          });

          try {
              await updateDoc(doc(db, "appointments", patient.id), {
                  status: 'in-consult',
                  timeStarted: Timestamp.now(),
                  startedBy: vetName,
                  statusHistory: [...freshStatusHistory, currentFreshStatus],
                  clinicalPulse: arrayUnion(transitionEvent),
              });

              // T4.90: Push notification — auto-transition to in-consult
              sendPushNotification({
                ownerId: patient.ownerId,
                status: 'in-consult',
                petName: patient.petName,
                vetName: vetName,
                appointmentId: patient.id,
                sentBy: vetName,
              });

              // Mutate local tracking so the subsequent sign-off batch uses correct values.
              freshStatusHistory.push(currentFreshStatus);
              currentFreshStatus = 'in-consult';
          } catch (guardError) {
              isSavingRef.current = false;
              setLoading(false);
              return alert(`Failed to transition patient to in-consult before sign-off: ${guardError.message}`);
          }
      }

      const batch = writeBatch(db);

      // 1. MEDICAL RECORD — batch.set on a pre-created ref (atomic, no orphan risk)
      const recordRef = doc(collection(db, "medical_records"));

      // T4.121: Upload pending SOAP attachments before the batch commit so we have
      // real download URLs to persist. Failures are NON-BLOCKING — a failed upload
      // is logged and skipped; the record still saves without that attachment.
      const uploadedAttachments = [];
      for (const att of soapAttachments) {
        try {
          const result = await uploadAttachment({
            file: att.file,
            petId: patient.petId || 'WALK_IN_PET',
            recordId: recordRef.id,
            label: att.label,
            uploadedBy: vetName,
          });
          uploadedAttachments.push({
            ...result,
            type: att.type,
            clientVisible: att.clientVisible,
          });
        } catch (uploadErr) {
          console.error('[ClinicalWorkspace.handleSaveConsult] Attachment upload failed (non-blocking):', uploadErr.message);
        }
      }

      batch.set(recordRef, {
        appointmentId: patient.id,
        petId: patient.petId || "WALK_IN_PET",
        petName: patient.petName,
        ownerId: patient.ownerId,
        ownerName: patient.ownerName || "Walk-In Client",
        vetId: vetUid,
        vetName: vetName,
        signedBy: { uid: vetUid, name: vetName },
        date: commitTimestamp,
        recordType: 'medical',
        diagnosis: (soapData.diagnoses || [])[0]?.name || "Clinical Visit",
        diagnoses: (soapData.diagnoses || []).filter(d => d.name).map(d => ({
            name: d.name,
            catalogId: d.catalogId || null,
            category: d.category || '',
            severity: d.severity || null,
            notes: d.notes || '',
        })),
        assessmentNotes: soapData.assessmentNotes || '',
        treatment: soapData.plan,
        objectiveExam: soapData.objectiveExam,
        soap: {
            subjective: soapData.subjective,
            objective: examToText(soapData.objectiveExam) || soapData.objectiveNotes || '',
            objectiveNotes: examToText(soapData.objectiveExam) || soapData.objectiveNotes || '',
            assessment: soapData.assessmentNotes || '',
            prognosis: soapData.prognosis,
            plan: soapData.plan,
            clientInstructions: soapData.clientInstructions || '',
            recheckIn: soapData.recheckIn
        },
        vitals: {
            weight: soapData.objWeight, temp: soapData.objTemp, hr: soapData.objHR,
            rr: soapData.objRR, crt: soapData.objCRT, bcs: soapData.bcs, pain: soapData.painScale
        },
        legal: {
            ownerSignature: ownerSignature,
            consentVersion: patient?.consentVersion || null,
            isLocked: true,
            lockedAt: commitTimestamp
        },
        patientStatus: soapData.patientStatus,
        nextVisit: soapData.nextVisit ? (() => { const [y,m,d] = soapData.nextVisit.split('-').map(Number); return Timestamp.fromDate(new Date(y, m-1, d, 8, 0, 0, 0)); })() : null,
        // T3.70: Preserve intake context on the permanent medical record as a nested
        // object — clearly separated from the vet's SOAP assessment.
        intakeContext: {
          clientNotes: patient?.clientNotes || patient?.notes || '',
          staffNotes: patient?.staffNotes || '',
        },
        // D5: Dispensed products natively on the medical record
        dispensedProducts: treatmentCart
            .filter(item => item.type === 'product')
            .map(item => ({
                name: item.name,
                qty: item.qty,
                instructions: item.instructions || '',
                sig: item.sig || null,
                price: item.price,
                isDrug: !!item.isDrug,
                productClass: item.productClass || (item.isDrug ? 'medicine' : 'retail'),
            })),
        serviceType: patient.services?.[0]?.name || patient.primaryService || patient.serviceType || 'Clinical Visit',
        serviceNames: (patient.services || []).filter(s => s.name).map(s => s.name),
        serviceAttribution: Object.entries(serviceAttribution).map(([svcId, attr]) => ({
            serviceId: svcId,
            staffId: attr.staffId,
            staffName: attr.staffName,
        })),
        serviceProgress: Object.entries(serviceProgress).map(([svcId, status]) => ({
            serviceId: svcId,
            status: status,
        })),
        // B1: Discharge Summary — client-safe subset of SOAP data
        dischargeSummary: {
            patientName: patient.petName,
            ownerName: patient.ownerName || 'Walk-In Client',
            visitDate: commitTimestamp,
            diagnosis: (soapData.diagnoses || [])[0]?.name || 'Clinical Visit',
            instructions: soapData.clientInstructions || soapData.plan || '',
            medications: treatmentCart
                .filter(item => (item.productClass || (item.isDrug ? 'medicine' : 'retail')) === 'medicine')
                .map(item => ({
                    name: item.name,
                    qty: item.qty,
                    instructions: item.instructions || 'Use as directed',
                })),
            supplies: treatmentCart
                .filter(item => (item.productClass || (item.isDrug ? 'medicine' : 'retail')) === 'medical_supply')
                .map(item => ({
                    name: item.name,
                    qty: item.qty,
                    instructions: item.instructions || '',
                })),
            nextVisit: soapData.nextVisit || null,
            recheckIn: soapData.recheckIn || null,
            vetName: vetName,
            patientStatus: soapData.patientStatus || 'Stable',
        },
        // C1: Structured vaccine records — array, supports multi-vaccine per visit.
        // Also writes legacy vaccineData (first entry) for backward compat with
        // mobile PetHistoryScreen and printVaccinationRecord until they are updated.
        // T3.2: showVaccineForm replaces isVaccinationVisit so manually-toggled vaccines are persisted.
        ...(showVaccineForm && vaccineAdministrations.some(v => v.vaccineName) ? (() => {
            const filled = vaccineAdministrations.filter(v => v.vaccineName);
            const first = filled[0];
            return {
                vaccineAdministrations: filled.map(v => ({
                    vaccineName: v.vaccineName,
                    manufacturer: v.manufacturer,
                    lotNumber: v.lotNumber,
                    routeOfAdmin: v.routeOfAdmin,
                    siteOfInjection: v.siteOfInjection,
                    dueDate: v.dueDate || null,
                    intervalDays: v.intervalDays || 365,
                    // T4.117: Audit flag — persisted so reports can identify client-supplied vaccine administrations.
                    ...(v.noStockDeduction ? { noStockDeduction: true } : {}),
                })),
                // Legacy shim — first vaccine duplicated as vaccineData for old readers
                vaccineData: {
                    vaccineName: first.vaccineName,
                    manufacturer: first.manufacturer,
                    lotNumber: first.lotNumber,
                    routeOfAdmin: first.routeOfAdmin,
                    siteOfInjection: first.siteOfInjection,
                    dueDate: first.dueDate || null,
                    intervalDays: first.intervalDays || 365,
                },
            };
        })() : {}),
        // C3: Lab results — only written when at least one row has been added.
        // Empty testName rows are filtered to avoid noise.
        ...(labResults.length > 0 ? {
            // T4.120: Extended lab write — includes catalog-derived metadata.
            // Amendment 1: status is already mapped at the form level (positive→'abnormal',
            // negative→'normal') so no additional transformation needed here.
            labResults: labResults.filter(l => l.testName).map(l => ({
                testName: l.testName,
                result: l.result,
                status: l.status,
                notes: l.notes || '',
                unit: l.unit || '',
                referenceRange: l.referenceRange || null,
                catalogTestId: l.catalogTestId || null,
                resultType: l.resultType || 'descriptive',
                attachmentUrl: l.attachmentUrl || null,
            }))
        } : {}),
        // T4.121: General SOAP attachments — written only when at least one upload succeeded.
        ...(uploadedAttachments.length > 0 ? { attachments: uploadedAttachments } : {}),
      });

      // NOTE: The orphaned `transactions` collection write has been removed (Issue #5).
      // POSModal's `sales` collection is the canonical billing path — that write happens
      // at checkout after the patient reaches the billing/dispensing station.

      // 2. VITALS CACHE — propagate latest vitals to pet doc for fast CRM lookup
      if (patient.petId && patient.petId !== "WALK_IN_PET") {
          const petRef = doc(db, "pets", patient.petId);

          // Vitals-only propagation to pet doc. CRM identity sync removed (T2.13).
          const petUpdate = {
              "lastVitals.weight": soapData.objWeight || null,
              "lastVitals.temp": soapData.objTemp || null,
              "lastVitals.hr": soapData.objHR || null,
              "lastVitals.rr": soapData.objRR || null,
              "lastVitals.bcs": soapData.bcs || null,
              "lastVitals.painScale": soapData.painScale || null,
              "lastVitals.crt": soapData.objCRT || null,
              "lastVitals.safetyStatus": 'Safe',
              "lastVitals.recordedAt": commitTimestamp,
              lastVisitDate: commitTimestamp,
          };

          batch.update(petRef, petUpdate);

      }

      // 3. APPOINTMENT STATUS ADVANCE — single authoritative write
      // Merge any mid-consult service additions from treatmentCart into the appointment's
      // service list so the downstream stations see the complete service picture (Issue #14).
      const existingServiceIds = new Set((patient.services || []).map(s => s.id));
      const addedServices = treatmentCart
          .filter(item => item.type === 'service' && !existingServiceIds.has(item.id))
          .map(item => ({ id: item.id, name: item.name, price: item.price }));
      const updatedServices = [...(patient.services || []), ...addedServices].map(svc => {
          const override = serviceAttribution[svc.id];
          return {
              ...svc,
              serviceStatus: 'completed',
              ...(override ? { staffId: override.staffId, staffName: override.staffName } : {}),
          };
      });

      // Freeze the forensic metrics at the exact moment of clinical sign-off.
      // This seal persists through dispensing/billing and is never recomputed.
      const forensicSeal = calculatePulseMetrics(
          patient.clinicalPulse || [],
          clinicSettings,
          patient.createdAt,
          new Date()
      );

      const appointmentUpdate = {
          status: nextRouteStatus,
          statusHistory: [...freshStatusHistory, currentFreshStatus],
          encounterItems: treatmentCart.map(({ _showInstructions, ...rest }) => rest),
          finalTotal: visitTotal,
          signedOffAt: commitTimestamp,
          encounterItemsVersion: commitTimestamp,
          services: updatedServices,
          forensicSeal,
          // T3.78: Close the sign-off pulse event gap — record the in-consult → dispensing/billing transition.
          // forensicSeal is computed above using the pre-existing pulse array; adding this event here
          // does not affect the seal (it freezes at sign-off time, before this event is persisted).
          clinicalPulse: arrayUnion(createPulseEvent('STATUS_CHANGE', {
              fromStatus: currentFreshStatus,
              toStatus: nextRouteStatus,
              staffId: vetUid,
              staffName: vetName,
              note: `Clinical sign-off. Record finalized. Routed to ${nextRouteStatus}.`,
          })),
      };

      batch.update(doc(db, "appointments", patient.id), appointmentUpdate);

      // B2: Auto-create follow-up appointment (1 conditional write)
      if (soapData.nextVisit) {
          const followUpRef = doc(collection(db, "appointments"));
          const [fY, fM, fD] = soapData.nextVisit.split('-').map(Number);
          const followUpDate = new Date(fY, fM - 1, fD, 8, 0, 0, 0);
          batch.set(followUpRef, {
              petId: patient.petId || 'WALK_IN_PET',
              petName: patient.petName,
              petSpecies: patient.petSpecies || '',
              petBreed: patient.petBreed || '',
              petGender: patient.petGender || '',
              petBirthdate: patient.petBirthdate || null,
              petWeight: soapData.objWeight || patient.petWeight || null,
              petAllergies: patient.petAllergies || '',
              petIsNeutered: patient.petIsNeutered || false,
              ownerId: patient.ownerId || 'WALK_IN_USER',
              ownerName: patient.ownerName || 'Walk-In Client',
              ownerPhone: patient.ownerPhone || '',
              serviceType: 'Follow-Up Visit',
              primaryService: 'Follow-Up Visit',
              services: [{ id: 'follow_up', name: 'Follow-Up Visit', price: 0 }],
              status: 'pending',
              date: Timestamp.fromDate(followUpDate),
              scheduledDate: Timestamp.fromDate(followUpDate),
              scheduledDateStr: `${followUpDate.getFullYear()}-${String(followUpDate.getMonth() + 1).padStart(2, '0')}-${String(followUpDate.getDate()).padStart(2, '0')}`,
              createdAt: commitTimestamp,
              notes: `Follow-up from visit on ${new Date().toLocaleDateString()}. Diagnosis: ${(soapData.diagnoses || [])[0]?.name || 'N/A'}. Recheck: ${soapData.recheckIn || 'N/A'}.`,
              isFollowUp: true,
              parentAppointmentId: patient.id,
              parentRecordId: recordRef.id,
              parentDiagnosis: (soapData.diagnoses || [])[0]?.name || 'N/A',
              parentServiceType: patient.services?.[0]?.name || patient.primaryService || patient.serviceType || 'Clinical Visit',
              source: 'clinical_workspace',
              caseDay: 1,
              clinicalPulse: [{
                  eventId: makePulseEventId('inception'),
                  type: 'STATUS_CHANGE',
                  toStatus: 'pending',
                  timestamp: commitTimestamp,
                  staffId: vetUid,
                  staffName: vetName,
                  note: `Follow-up created from sign-off of appointment ${patient.id}.`,
              }],
          });
      }

      // Single atomic commit — all writes succeed together or none do.
      await batch.commit();

      // T4.90: Push notification — sign-off route (dispensing or billing)
      sendPushNotification({
        ownerId: patient.ownerId,
        status: nextRouteStatus,
        petName: patient.petName,
        vetName: vetName,
        appointmentId: patient.id,
        sentBy: vetName,
      });

      // T3.55: Fire-and-forget vaccine reminder queue update — recalculates
      // this pet's due/overdue vaccine status after sign-off. The queue doc is
      // written within seconds of consult completion, keeping the reminder queue
      // fresh without waiting for the next weekly full recompute.
      // This call MUST NOT block sign-off — errors are swallowed completely.
      computeSinglePetVaccineReminder(
        patient.petId,
        {
          petName:    patient.petName,
          petSpecies: patient.petSpecies || '',
          ownerName:  patient.ownerName || 'Walk-In Client',
          ownerId:    patient.ownerId   || '',
        },
        clinicSettings,
      ).catch((err) => {
        console.error('[ClinicalWorkspace] Vaccine queue update failed (non-blocking):', err?.message);
      });

      // Set ref SYNCHRONOUSLY so unmount cleanup sees it immediately, before React
      // schedules the state update and re-render that follows.
      isRecordLockedRef.current = true;
      setIsRecordLocked(true);
      setLoading(false);
      setIsDirty(false);
      // T4.121: Clear pending attachments — they have been uploaded and persisted.
      setSoapAttachments([]);
      onClose();
      alert(`✅ ENCOUNTER FINALIZED!\n\nClinical record signed by ${vetName}.\nPatient moved to ${hasDrugsInCart ? 'PHARMACY' : 'CHECKOUT'}.\nTotal: ₱${visitTotal.toLocaleString()}`);
    } catch (error) {
        console.error('[ClinicalWorkspace.handleSaveConsult]:', error.message);
        isSavingRef.current = false;
        setLoading(false);
        showToast("Critical Save Error: " + error.message, "error");
    }
    };

    if (treatmentCart.length === 0) {
      setSignOffConfirm({
        title: 'Empty Services & Items',
        message: 'No services or items have been added to this visit.',
        warnings: ['The medical record will be saved without any billable items.'],
        onConfirm: () => { setSignOffConfirm(null); proceedWithSave(); },
      });
      return;
    }

    const incompleteServices = (patient.services || []).filter(svc => svc.id).filter(svc => {
      const status = serviceProgress[svc.id] || 'pending';
      return status !== 'completed';
    });
    if (incompleteServices.length > 0) {
      setSignOffConfirm({
        title: 'Incomplete Services',
        message: `${incompleteServices.length} service(s) are not marked as completed:`,
        warnings: incompleteServices.map(s => s.name),
        onConfirm: () => { setSignOffConfirm(null); proceedWithSave(); },
      });
      return;
    }

    const emptyFields = [];
    if (!soapData.diagnoses?.length || !soapData.diagnoses.some(d => d.name)) emptyFields.push('No diagnosis entered');
    if (!soapData.plan?.trim()) emptyFields.push('No treatment plan documented');
    if (!soapData.clientInstructions?.trim()) emptyFields.push('No client instructions / discharge notes');
    if (!soapData.subjective?.trim()) emptyFields.push('No presenting complaint (Subjective)');

    if (emptyFields.length > 0) {
      setSignOffConfirm({
        title: 'Documentation Check',
        message: 'The following fields are empty. The vet makes the clinical judgment call.',
        warnings: emptyFields,
        onConfirm: () => { setSignOffConfirm(null); proceedWithSave(); },
      });
      return;
    }

    proceedWithSave();
  };

  /**
   * Persists the current SOAP notes and treatment plan to the appointment document
   * as a draft. Does NOT create a medical_records document, does NOT advance
   * appointment status, and does NOT require owner consent.
   *
   * This is the safe mid-consult save path. The consent-gated `handleSaveConsult`
   * remains the sole path to creating a finalized medical record.
   */
  const handleSaveDraft = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const apptRef = doc(db, "appointments", patient.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(apptRef);
        if (!snap.exists()) throw new Error("Appointment not found.");

        // Optimistic lock: reject the save if another user saved a newer version
        // while this session had the workspace open.
        const serverVersion = (snap.data().encounterItemsVersion || snap.data().prescribedItemsVersion)?.toMillis?.() || 0;
        const localVersion = (patient.encounterItemsVersion || patient.prescribedItemsVersion)?.toMillis?.() || 0;
        if (serverVersion > 0 && serverVersion !== localVersion) {
          throw new Error("Draft was modified by another user. Please reload to see the latest version.");
        }

        transaction.update(apptRef, {
          soapDraft: {
            subjective: soapData.subjective,
            objectiveNotes: soapData.objectiveNotes,
            objectiveExam: soapData.objectiveExam,
            objWeight: soapData.objWeight,
            objTemp: soapData.objTemp,
            objHR: soapData.objHR,
            objRR: soapData.objRR,
            objCRT: soapData.objCRT,
            bcs: soapData.bcs,
            painScale: soapData.painScale,
            // T4.141: write structured diagnoses instead of legacy assessment string
            diagnoses: (soapData.diagnoses || []).map(({ _showNoteField, ...rest }) => rest),
            assessmentNotes: soapData.assessmentNotes || '',
            prognosis: soapData.prognosis,
            plan: soapData.plan,
            clientInstructions: soapData.clientInstructions || '',
            recheckIn: soapData.recheckIn,
            patientStatus: soapData.patientStatus,
            nextVisit: soapData.nextVisit,
            labResults: labResults.filter(l => l.testName).map(l => ({
              testName: l.testName, result: l.result, status: l.status,
              notes: l.notes || '', unit: l.unit || '',
              referenceRange: l.referenceRange || null,
              catalogTestId: l.catalogTestId || null,
              resultType: l.resultType || 'descriptive',
            })),
          },
          encounterItems: treatmentCart.map(({ _showInstructions, ...rest }) => rest),
          encounterItemsVersion: Timestamp.now(),
          draftSavedAt: Timestamp.now(),
          draftSavedBy: auth.currentUser?.uid || "system",
          clinicalPulse: arrayUnion(createPulseEvent('DRAFT_SAVED', {
            staffId: auth.currentUser?.uid || 'unknown',
            staffName: cwProfile?.fullName || auth.currentUser?.displayName || 'Clinician',
            note: 'SOAP draft saved.',
          })),
        });
      });
      setIsDirty(false);
      showToast("Draft saved successfully.", "success");
      return true;
    } catch (error) {
      console.error('[ClinicalWorkspace.handleSaveDraft]:', error.message);
      showToast("Failed to save draft: " + error.message, "error");
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * A3 — Applies the captured draft to SOAP form state, signalling explicit resume intent.
   * Clears the banner. Does NOT modify Firestore — the existing auto-save handles persistence.
   * isDirty is set to false because the state exactly mirrors the saved draft.
   */
  const handleResumeDraft = async () => {
    const d = draftBannerState?.draft;
    if (!d) {
      setDraftBannerState(null);
      return;
    }
    // Capture banner context before clearing it — setDraftBannerState(null) runs below.
    const savedByName = draftBannerState?.savedByName;
    setSoapData({
      subjective: d.subjective || '',
      objWeight: d.objWeight || '',
      objTemp: d.objTemp || '',
      objHR: d.objHR || '',
      objRR: d.objRR || '',
      objCRT: d.objCRT ?? '',
      bcs: d.bcs ?? '',
      painScale: d.painScale ?? '',
      objectiveNotes: d.objectiveNotes || '',
      objectiveExam: d.objectiveExam || createDefaultExam(),
      // T4.141: dual-read — new fields first, fall back to legacy assessment string
      diagnoses: d.diagnoses || [],
      assessmentNotes: d.assessmentNotes || d.assessment || '',
      prognosis: d.prognosis || 'Good',
      patientStatus: d.patientStatus || 'Stable',
      plan: d.plan || '',
      clientInstructions: d.clientInstructions || '',
      recheckIn: d.recheckIn || '1 Week',
      nextVisit: d.nextVisit || '',
    });
    setLabResults((d.labResults || []).map(l => ({
      testName: l.testName || '', result: l.result || '',
      status: l.status || 'normal', notes: l.notes || '',
      unit: l.unit || '', referenceRange: l.referenceRange ?? null,
      catalogTestId: l.catalogTestId ?? null, resultType: l.resultType || 'descriptive',
    })));
    setIsDirty(false);
    setDraftBannerState(null);
    showToast("Draft restored. Continue editing.", "success");
    try {
      await updateDoc(doc(db, "appointments", patient.id), {
        clinicalPulse: arrayUnion(createPulseEvent('DRAFT_RESUMED', {
          staffId: auth.currentUser?.uid || 'unknown',
          staffName: cwProfile?.fullName || auth.currentUser?.displayName || 'Clinician',
          note: `Draft resumed (was saved by ${savedByName || 'unknown'}).`,
        })),
      });
    } catch (e) {
      console.error('[ClinicalWorkspace.handleResumeDraft] DRAFT_RESUMED pulse write failed:', e.message);
    }
  };

  /**
   * A3 — Permanently removes the draft from Firestore and appends a DRAFT_DISCARDED
   * clinical pulse event for audit purposes. Clears the banner on success.
   */
  const handleDiscardDraft = async () => {
    try {
      const apptRef = doc(db, "appointments", patient.id);
      const pulseEvent = {
        eventId: makePulseEventId('draft-discard'),
        type: 'DRAFT_DISCARDED',
        timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
        staffId: auth.currentUser?.uid || 'unknown',
        staffName: auth.currentUser?.displayName || 'Authorized Clinician',
        note: `Draft discarded (was saved by ${draftBannerState?.savedByName || 'unknown'})`,
        discardedDraftSavedAt: draftBannerState?.savedAt ? Timestamp.fromDate(draftBannerState.savedAt) : null,
        discardedDraftSavedBy: draftBannerState?.savedByUid || null,
      };
      await updateDoc(apptRef, {
        soapDraft: null,
        draftSavedAt: null,
        draftSavedBy: null,
        clinicalPulse: arrayUnion(pulseEvent),
      });
      setDraftBannerState(null);
      showToast("Draft discarded.", "success");
    } catch (error) {
      console.error('[ClinicalWorkspace.handleDiscardDraft]:', error.message);
      showToast("Failed to discard draft: " + error.message, "error");
    }
  };


  // --- T4.121: File Attachment Handlers ---

  /** Allowed MIME types for the file picker guard. */
  const ATTACHMENT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
  const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

  /**
   * Handles the hidden file input change event for general SOAP attachments.
   * Validates type and size client-side, generates a preview URL for images,
   * and appends the entry to the pending soapAttachments list.
   * Upload is deferred to handleSaveConsult (batch with the medical record write).
   */
  const handleAttachFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ATTACHMENT_ALLOWED_TYPES.includes(file.type)) {
      showToast('Only JPEG, PNG, and PDF files are accepted.', 'error');
      event.target.value = '';
      return;
    }

    if (file.size > ATTACHMENT_MAX_BYTES) {
      showToast('File must be under 5 MB.', 'error');
      event.target.value = '';
      return;
    }

    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;

    setSoapAttachments(prev => [
      ...prev,
      { file, label: file.name, type: 'other', clientVisible: false, preview, uploading: false },
    ]);

    // Reset so the same file can be re-selected if removed and re-added
    event.target.value = '';
  };

  /**
   * Removes a pending SOAP attachment by index.
   * Revokes the preview URL to free browser memory.
   */
  const handleRemoveAttachment = (index) => {
    setSoapAttachments(prev => {
      const att = prev[index];
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  /**
   * Handles per-lab-test file attachment. Unlike SOAP attachments, lab attachments
   * are uploaded eagerly (before sign-off) because the lab result row needs the URL
   * to display the "View attachment" link immediately.
   *
   * Uses patient.id as the recordId path segment — the permanent recordRef.id is
   * created at sign-off, but for lab attachments the appointment ID is a safe proxy
   * since lab test files are uniquely stamped with Date.now().
   */
  const handleLabAttach = async (event, labIndex) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ATTACHMENT_ALLOWED_TYPES.includes(file.type)) {
      showToast('Only JPEG, PNG, and PDF files are accepted.', 'error');
      event.target.value = '';
      return;
    }

    if (file.size > ATTACHMENT_MAX_BYTES) {
      showToast('File must be under 5 MB.', 'error');
      event.target.value = '';
      return;
    }

    event.target.value = '';

    try {
      const result = await uploadAttachment({
        file,
        petId: patient.petId || 'WALK_IN_PET',
        recordId: patient.id,
        label: file.name,
        uploadedBy: auth.currentUser?.displayName || 'Clinician',
      });

      setLabResults(prev => {
        const updated = [...prev];
        updated[labIndex] = { ...updated[labIndex], attachmentUrl: result.url };
        return updated;
      });

      showToast('Lab attachment uploaded.', 'success');
    } catch (err) {
      console.error('[ClinicalWorkspace.handleLabAttach]:', err.message);
      showToast('Lab attachment failed: ' + err.message, 'error');
    }
  };

  // --- Phase 3: Group Navigation Handlers ---

  const getWeightDelta = () => {
    if (!soapData.objWeight || !prevVitals?.weight) return null;
    const current = parseFloat(soapData.objWeight);
    const previous = parseFloat(prevVitals.weight);
    if (isNaN(current) || isNaN(previous) || previous === 0) return null;
    return (((current - previous) / previous) * 100).toFixed(1);
  };
  const weightDelta = getWeightDelta();

  const autocompleteOptions = useMemo(() => [
    ...(inventoryList || []).filter(i => !i.isArchived).map(i => {
      const netAvailable = i.stock - (i.reserved || 0);
      return {
        ...i,
        label: `${i.itemName} (${netAvailable} avail)`,
        // T4.117: Preserve the inventory product's category before overwriting for groupBy
        inventoryCategory: (i.category || '').toLowerCase(),
        category: 'Pharmacy/Products',
        isLow: netAvailable <= 5,
        isOut: netAvailable <= 0,
      };
    }),
    ...(servicesList || []).filter(s => !s.isArchived).map(s => ({
      ...s,
      label: s.name,
      inventoryCategory: '',
      category: 'Clinical Services',
      isLow: false,
      isOut: false,
    })),
  ], [inventoryList, servicesList]);

  if (!patient) return null;

  const vaccineFormJSX = (
    <Box sx={{ mb: 2, p: 2, bgcolor: COLORS.kpiGreenBg, border: `1px solid ${COLORS.kpiGreenBorder}`, flexShrink: 0 }}>

      {/* T3.2: Info banner shown only when the form was manually enabled on a non-vaccination visit */}
      {manualVaccineOverride && !isVaccinationVisit && (
        <Alert
          severity="info"
          sx={{ mb: 1.5, py: 0, fontSize: '0.7rem', fontWeight: 700, borderRadius: 0 }}
          action={
            <IconButton size="small" onClick={() => { setManualVaccineOverride(false); setVaccineAdministrations([{ ...EMPTY_VAX }]); }}>
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          }
        >
          Vaccine form manually enabled — dismiss to hide
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography sx={{ fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, color: COLORS.success }}>
          VACCINE DETAILS ({vaccineAdministrations.length})
        </Typography>
        <Button size="small"
          onClick={() => setVaccineAdministrations(prev => [...prev, { ...EMPTY_VAX }])}
          sx={{ fontWeight: 900, fontSize: '0.6rem', textTransform: 'uppercase', color: COLORS.success, minWidth: 0 }}>
          + Add Vaccine
        </Button>
      </Box>

      {vaccineAdministrations.map((vax, idx) => {
        const update = (field, value) => setVaccineAdministrations(prev =>
          prev.map((v, i) => i === idx ? { ...v, [field]: value } : v)
        );
        const remove = () => setVaccineAdministrations(prev =>
          prev.length <= 1 ? [{ ...EMPTY_VAX }] : prev.filter((_, i) => i !== idx)
        );

        return (
          <Box key={idx} sx={{
            mb: idx < vaccineAdministrations.length - 1 ? 2 : 0,
            pb: idx < vaccineAdministrations.length - 1 ? 2 : 0,
            borderBottom: idx < vaccineAdministrations.length - 1 ? '1px dashed #A5D6A7' : 'none',
          }}>
            {vaccineAdministrations.length > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase', color: '#558B2F' }}>
                  Vaccine #{idx + 1}
                </Typography>
                <Button size="small" onClick={remove}
                  sx={{ fontWeight: 700, fontSize: '0.55rem', color: '#C62828', minWidth: 0, p: 0.5 }}>
                  Remove
                </Button>
              </Box>
            )}
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 6 }}>
                <Autocomplete size="small" freeSolo options={vaccineOptions}
                  value={vax.vaccineName || ''}
                  inputValue={vax.vaccineName || ''}
                  onInputChange={(_, val) => update('vaccineName', val)}
                  renderInput={(params) => (
                    <TextField {...params} label="Vaccine Name" sx={{ bgcolor: 'white' }} />
                  )} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField size="small" fullWidth label="Manufacturer" value={vax.manufacturer}
                  onChange={(e) => update('manufacturer', e.target.value)} sx={{ bgcolor: 'white' }} />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField size="small" fullWidth label="Lot Number" value={vax.lotNumber}
                  onChange={(e) => update('lotNumber', e.target.value)} sx={{ bgcolor: 'white' }} />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField size="small" fullWidth label="Route" select value={vax.routeOfAdmin}
                  onChange={(e) => update('routeOfAdmin', e.target.value)} sx={{ bgcolor: 'white' }}>
                  {['SQ', 'IM', 'ID', 'IN', 'PO'].map(r => (
                    <MenuItem key={r} value={r}>{r}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField size="small" fullWidth label="Site" value={vax.siteOfInjection}
                  onChange={(e) => update('siteOfInjection', e.target.value)} sx={{ bgcolor: 'white' }} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField size="small" fullWidth label="Next Due Date" type="date" value={vax.dueDate}
                  onChange={(e) => update('dueDate', e.target.value)}
                  InputLabelProps={{ shrink: true }} sx={{ bgcolor: 'white' }} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField size="small" fullWidth label="Interval (days)" type="number" value={vax.intervalDays}
                  onChange={(e) => update('intervalDays', parseInt(e.target.value) || 365)}
                  sx={{ bgcolor: 'white' }} />
              </Grid>
            </Grid>
          </Box>
        );
      })}
    </Box>
  );

  /**
   * T4.120: Persists a new custom lab test to Firestore (clinic_settings/lab_test_catalog)
   * then auto-selects it in the pending row. The useLabTestCatalog singleton listener
   * picks up the change in real-time so the test becomes available in all future dropdowns.
   */
  const handleSaveCustomLabTest = async () => {
    const { name, category, unit, resultType, canineLow, canineHigh, felineLow, felineHigh } = customLabForm;
    if (!name.trim()) {
      showToast('Test name is required.', 'error');
      return;
    }

    const hasRanges = canineLow !== '' && canineHigh !== '' && felineLow !== '' && felineHigh !== '';
    const newTest = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      category: category || 'Other',
      unit: unit.trim(),
      resultType,
      referenceRange: hasRanges
        ? { canine: [parseFloat(canineLow), parseFloat(canineHigh)], feline: [parseFloat(felineLow), parseFloat(felineHigh)] }
        : null,
    };

    try {
      await setDoc(
        doc(db, 'clinic_settings', 'lab_test_catalog'),
        { tests: arrayUnion(newTest) },
        { merge: true },
      );

      // Auto-select the new test in the pending row
      if (customLabPendingIdx !== null) {
        const speciesKey = (patient?.petSpecies || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
        const resolvedRange = newTest.referenceRange?.[speciesKey] || null;
        setLabResults(prev => {
          const updated = [...prev];
          updated[customLabPendingIdx] = {
            ...updated[customLabPendingIdx],
            testName: newTest.name,
            unit: newTest.unit,
            referenceRange: newTest.referenceRange,
            resultType: newTest.resultType,
            catalogTestId: newTest.id,
            _resolvedRange: resolvedRange,
          };
          return updated;
        });
      }

      setAddCustomLabOpen(false);
      setCustomLabPendingIdx(null);
      setCustomLabForm({ name: '', category: 'Other', unit: '', resultType: 'numeric', canineLow: '', canineHigh: '', felineLow: '', felineHigh: '' });
      showToast(`"${newTest.name}" added to lab catalog.`, 'success');
    } catch (err) {
      console.error('[ClinicalWorkspace.handleSaveCustomLabTest]:', err.message);
      showToast('Failed to save custom test. Check your connection.', 'error');
    }
  };

  /**
   * T4.141: Persists a new custom diagnosis to Firestore (clinic_settings/diagnosis_catalog)
   * then immediately adds it to the current soapData.diagnoses array so the vet does not
   * need to search for it again. The useDiagnosisCatalog singleton listener picks up the
   * change in real-time so the diagnosis appears in future Autocomplete dropdowns.
   */
  const handleSaveCustomDiagnosis = async () => {
    if (!customDxName.trim()) {
      showToast('Diagnosis name is required.', 'error');
      return;
    }
    if (!customDxCategory) {
      showToast('Category is required.', 'error');
      return;
    }

    const newDx = {
      id: `custom-${Date.now()}`,
      name: customDxName.trim(),
      category: customDxCategory,
      species: ['dog', 'cat'],
      hasSeverity: false,
      severityScale: null,
    };

    try {
      await setDoc(
        doc(db, 'clinic_settings', 'diagnosis_catalog'),
        { tests: arrayUnion(newDx) },
        { merge: true },
      );

      // Immediately add to the current SOAP form
      updateSoap('diagnoses', [
        ...(soapData.diagnoses || []),
        {
          name: newDx.name,
          catalogId: newDx.id,
          category: newDx.category,
          severity: null,
          notes: '',
        },
      ]);

      setAddCustomDxOpen(false);
      setCustomDxName('');
      setCustomDxCategory('Dermatology');
      showToast(`"${newDx.name}" added to diagnosis catalog.`, 'success');
    } catch (err) {
      console.error('[ClinicalWorkspace.handleSaveCustomDiagnosis]:', err.message);
      showToast('Failed to save custom diagnosis. Check your connection.', 'error');
    }
  };

  /**
   * T4.120: Auto-computes a result status from the numeric value and species-specific
   * reference range. Vet can always override manually via the status dropdown.
   *
   * For positive-negative tests: regex match on result text (Amendment 1).
   * For numeric tests: deviation from reference range bounds.
   * For descriptive tests: no auto-compute — returns current status unchanged.
   */
  const computeAutoStatus = (resultValue, resultType, resolvedRange, currentStatus) => {
    if (resultType === 'positive-negative') {
      if (/positive/i.test(resultValue)) return 'abnormal';
      if (/negative/i.test(resultValue)) return 'normal';
      return currentStatus || 'normal';
    }

    if (resultType === 'numeric' && Array.isArray(resolvedRange) && resolvedRange.length === 2) {
      const num = parseFloat(resultValue);
      if (isNaN(num)) return currentStatus || 'normal';
      const [low, high] = resolvedRange;
      // Heuristic: 30% deviation from reference range. Vet can override.
      if (num < low * 0.7 || num > high * 1.3) return 'critical';
      if (num < low || num > high) return 'abnormal';
      return 'normal';
    }

    return currentStatus || 'normal';
  };

  /**
   * T4.120: Derives the display label for the status chip based on resultType.
   * For positive-negative tests, 'abnormal' renders as POSITIVE and 'normal'
   * renders as NEGATIVE — preserving the 3-value status contract while showing
   * clinically meaningful labels to the vet. (Amendment 1)
   */
  const getStatusChipLabel = (status, resultType) => {
    const key = (status || 'normal').toLowerCase();
    if (resultType === 'positive-negative') {
      if (key === 'normal') return 'NEGATIVE';
      if (key === 'critical') return 'CRITICAL';
      return 'POSITIVE';
    }
    return key.toUpperCase();
  };

  const labResultsJSX = (
    <Box sx={{ mb: 2, flexShrink: 0 }}>
      <Button
        size="small"
        variant="text"
        onClick={() => setLabResults(prev => [
          ...prev,
          { testName: '', result: '', status: 'normal', notes: '', unit: '', referenceRange: null, catalogTestId: null, resultType: 'descriptive', _resolvedRange: null, attachmentUrl: null },
        ])}
        sx={{ fontWeight: 900, fontSize: '0.65rem', textTransform: 'uppercase', color: COLORS.medical, mb: 1 }}
      >
        + Add Lab Result
      </Button>

      {labResults.map((lab, idx) => {
        const speciesKey = (patient?.petSpecies || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
        // Resolve species-specific reference range for display; fall back to the cached _resolvedRange
        const resolvedRange = lab.referenceRange?.[speciesKey]
          || (Array.isArray(lab.referenceRange) ? lab.referenceRange : null)
          || lab._resolvedRange
          || null;

        const statusKey = (lab.status || 'normal').toLowerCase();
        const statusChipColor = statusKey === 'critical' ? COLORS.danger : statusKey === 'abnormal' ? COLORS.warning : COLORS.success;
        const statusChipBg   = statusKey === 'critical' ? COLORS.dangerSurface : statusKey === 'abnormal' ? COLORS.warningSurface : '#E8F5E9';

        return (
          <Box key={idx} sx={{ mb: 1.5, p: 1, bgcolor: '#FAFAFA', border: `1px solid ${COLORS.borderLight}` }}>
            {/* Row 1: Autocomplete + Delete */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.75 }}>
              <Autocomplete
                size="small"
                options={labCatalogWithSentinel}
                groupBy={(opt) => opt.category === '__action__' ? '' : opt.category}
                getOptionLabel={(opt) => opt.name || opt.testName || ''}
                value={lab.catalogTestId ? (labCatalog.find(c => c.id === lab.catalogTestId) || null) : null}
                filterOptions={(opts, state) => {
                  // Always include the sentinel; filter the rest by the input value
                  const q = state.inputValue.toLowerCase();
                  const filtered = opts.filter(o => o.id === '__custom__' || o.name.toLowerCase().includes(q));
                  return filtered;
                }}
                onChange={(_, selected) => {
                  if (!selected) return;

                  if (selected.id === '__custom__') {
                    // Open the Add Custom Test dialog, targeting this row
                    setCustomLabPendingIdx(idx);
                    setAddCustomLabOpen(true);
                    return;
                  }

                  const specKey = (patient?.petSpecies || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
                  const rRange = selected.referenceRange?.[specKey]
                    || (Array.isArray(selected.referenceRange) ? selected.referenceRange : null)
                    || null;

                  const updated = [...labResults];
                  updated[idx] = {
                    ...updated[idx],
                    testName: selected.name,
                    unit: selected.unit || '',
                    referenceRange: selected.referenceRange || null,
                    resultType: selected.resultType || 'descriptive',
                    catalogTestId: selected.id,
                    _resolvedRange: rRange,
                    // Re-compute status if there's already a result value
                    status: updated[idx].result
                      ? computeAutoStatus(updated[idx].result, selected.resultType, rRange, updated[idx].status)
                      : updated[idx].status,
                  };
                  setLabResults(updated);
                }}
                renderOption={(props, option) => {
                  const isAction = option.id === '__custom__';
                  return (
                    <Box component="li" {...props}>
                      <Typography sx={{
                        fontFamily: FONT,
                        fontSize: '0.8rem',
                        fontWeight: isAction ? 900 : 500,
                        color: isAction ? COLORS.medical : COLORS.brand,
                        fontStyle: isAction ? 'normal' : 'inherit',
                      }}>
                        {option.name}
                      </Typography>
                    </Box>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Search test…"
                    size="small"
                    sx={{
                      flex: 3,
                      '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: 'white', fontSize: '0.8rem' },
                    }}
                  />
                )}
                noOptionsText="No matching tests"
                sx={{ flex: 3 }}
                clearOnBlur={false}
                blurOnSelect
              />

              {/* Unit — read-only, shown inline */}
              {lab.unit && (
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, minWidth: 40, flexShrink: 0 }}>
                  {lab.unit}
                </Typography>
              )}

              <IconButton
                size="small"
                onClick={() => setLabResults(prev => prev.filter((_, i) => i !== idx))}
                sx={{ color: COLORS.danger, flexShrink: 0 }}
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>

            {/* Row 2: Result + Status */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <Box sx={{ flex: 2 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Result"
                  value={lab.result}
                  onChange={(e) => {
                    const val = e.target.value;
                    const updated = [...labResults];
                    updated[idx] = {
                      ...updated[idx],
                      result: val,
                      // Auto-compute status from the new result value
                      status: computeAutoStatus(val, updated[idx].resultType, resolvedRange, updated[idx].status),
                    };
                    setLabResults(updated);
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: 'white', fontSize: '0.8rem' } }}
                />
                {/* Reference range helper — only for numeric tests with a resolved range */}
                {lab.resultType === 'numeric' && Array.isArray(resolvedRange) && (
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, mt: 0.25 }}>
                    Ref: {resolvedRange[0]} – {resolvedRange[1]}{lab.unit ? ` ${lab.unit}` : ''}
                  </Typography>
                )}
              </Box>

              <TextField
                size="small"
                select
                value={lab.status}
                onChange={(e) => {
                  const updated = [...labResults];
                  updated[idx] = { ...updated[idx], status: e.target.value };
                  setLabResults(updated);
                }}
                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: 'white', fontSize: '0.8rem' } }}
              >
                {/* Amendment 1: positive-negative tests show Positive/Negative labels
                    but store 'abnormal'/'normal' values — matching the 3-value contract
                    all downstream consumers depend on. Critical is not shown because
                    qualitative results have no meaningful critical distinction. */}
                {lab.resultType === 'positive-negative' ? [
                  <MenuItem key="pos" value="abnormal">Positive</MenuItem>,
                  <MenuItem key="neg" value="normal">Negative</MenuItem>,
                ] : LAB_STATUSES.map(s => (
                  <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
                ))}
              </TextField>

              {/* Status chip — visual quick-scan indicator */}
              <Chip
                label={getStatusChipLabel(lab.status, lab.resultType)}
                size="small"
                sx={{
                  fontFamily: FONT,
                  fontSize: '0.6rem',
                  fontWeight: 900,
                  height: 22,
                  borderRadius: 0,
                  bgcolor: statusChipBg,
                  color: statusChipColor,
                  flexShrink: 0,
                  alignSelf: 'center',
                }}
              />
            </Box>

            {/* T4.121: Row 3 — Per-lab-test file attachment */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              {lab.attachmentUrl ? (
                <>
                  <Typography
                    component="a"
                    href={lab.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ fontSize: '0.7rem', color: COLORS.medical, textDecoration: 'underline', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.3 }}
                  >
                    <AttachFileIcon sx={{ fontSize: 12 }} />
                    View attachment
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      const updated = [...labResults];
                      updated[idx] = { ...updated[idx], attachmentUrl: null };
                      setLabResults(updated);
                    }}
                    sx={{ color: COLORS.danger, p: 0.25 }}
                  >
                    <CloseIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </>
              ) : (
                <>
                  <IconButton
                    size="small"
                    component="label"
                    sx={{ color: COLORS.textMuted, p: 0.25, '&:hover': { color: COLORS.medical } }}
                  >
                    <PhotoCameraIcon sx={{ fontSize: 14 }} />
                    <input
                      type="file"
                      hidden
                      accept="image/jpeg,image/png,application/pdf"
                      onChange={(e) => handleLabAttach(e, idx)}
                    />
                  </IconButton>
                  <Typography sx={{ fontSize: '0.6rem', color: COLORS.textMuted }}>
                    Attach file
                  </Typography>
                </>
              )}
            </Box>
          </Box>
        );
      })}

      {/* T4.120: Add Custom Lab Test Dialog */}
      <Dialog
        open={addCustomLabOpen}
        onClose={() => { setAddCustomLabOpen(false); setCustomLabPendingIdx(null); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.border}` } }}
      >
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.brand, borderBottom: `1px solid ${COLORS.borderLight}` }}>
          Add Custom Lab Test
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={1.5}>
            <TextField
              label="Test Name"
              fullWidth
              required
              size="small"
              value={customLabForm.name}
              onChange={(e) => setCustomLabForm(prev => ({ ...prev, name: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            />
            <TextField
              label="Category"
              select
              fullWidth
              size="small"
              value={customLabForm.category}
              onChange={(e) => setCustomLabForm(prev => ({ ...prev, category: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            >
              {LAB_CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <TextField
              label="Unit (e.g. mg/dL)"
              fullWidth
              size="small"
              value={customLabForm.unit}
              onChange={(e) => setCustomLabForm(prev => ({ ...prev, unit: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            />
            <TextField
              label="Result Type"
              select
              fullWidth
              size="small"
              value={customLabForm.resultType}
              onChange={(e) => setCustomLabForm(prev => ({ ...prev, resultType: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            >
              <MenuItem value="numeric">Numeric</MenuItem>
              <MenuItem value="positive-negative">Positive / Negative</MenuItem>
              <MenuItem value="descriptive">Descriptive</MenuItem>
            </TextField>
            <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, display: 'block' }}>
              Reference Ranges (optional — leave blank if not applicable)
            </Typography>
            <Grid container spacing={1}>
              <Grid size={{ xs: 6 }}>
                <TextField label="Canine Low" type="number" size="small" fullWidth value={customLabForm.canineLow}
                  onChange={(e) => setCustomLabForm(prev => ({ ...prev, canineLow: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField label="Canine High" type="number" size="small" fullWidth value={customLabForm.canineHigh}
                  onChange={(e) => setCustomLabForm(prev => ({ ...prev, canineHigh: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField label="Feline Low" type="number" size="small" fullWidth value={customLabForm.felineLow}
                  onChange={(e) => setCustomLabForm(prev => ({ ...prev, felineLow: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField label="Feline High" type="number" size="small" fullWidth value={customLabForm.felineHigh}
                  onChange={(e) => setCustomLabForm(prev => ({ ...prev, felineHigh: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }} />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, borderTop: `1px solid ${COLORS.borderLight}` }}>
          <Button
            onClick={() => { setAddCustomLabOpen(false); setCustomLabPendingIdx(null); }}
            sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveCustomLabTest}
            sx={{ fontFamily: FONT, fontWeight: 900, borderRadius: 0, bgcolor: COLORS.medical, '&:hover': { bgcolor: COLORS.brand } }}
          >
            Save & Select
          </Button>
        </DialogActions>
      </Dialog>

      {/* T4.141: Add Custom Diagnosis Dialog */}
      <Dialog
        open={addCustomDxOpen}
        onClose={() => { setAddCustomDxOpen(false); setCustomDxName(''); setCustomDxCategory('Dermatology'); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.border}` } }}
      >
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.brand, borderBottom: `1px solid ${COLORS.borderLight}` }}>
          Add Custom Diagnosis
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={1.5}>
            <TextField
              label="Diagnosis Name"
              fullWidth
              required
              size="small"
              value={customDxName}
              onChange={(e) => setCustomDxName(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
              autoFocus
            />
            <TextField
              label="Category"
              select
              fullWidth
              size="small"
              value={customDxCategory}
              onChange={(e) => setCustomDxCategory(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            >
              {DIAGNOSIS_CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </TextField>
            <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, display: 'block' }}>
              Custom diagnoses are saved permanently to the clinic catalog and will appear in future Autocomplete searches.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, borderTop: `1px solid ${COLORS.borderLight}` }}>
          <Button
            onClick={() => { setAddCustomDxOpen(false); setCustomDxName(''); setCustomDxCategory('Dermatology'); }}
            sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveCustomDiagnosis}
            sx={{ fontFamily: FONT, fontWeight: 900, borderRadius: 0, bgcolor: COLORS.success, '&:hover': { bgcolor: COLORS.brand } }}
          >
            Add & Select
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  const draftSaveJSX = (
    <Box sx={{ pt: 1.5, flexShrink: 0, borderTop: '1px dashed rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
      <Button
        variant="outlined"
        size="small"
        startIcon={<SaveAltIcon />}
        onClick={handleSaveDraft}
        disabled={loading || !isDirty}
        sx={{
          fontWeight: 800,
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: COLORS.textSecondary,
          borderColor: COLORS.border,
          '&:hover': {
            borderColor: COLORS.accent,
            bgcolor: 'rgba(93, 64, 55, 0.04)',
          },
          '&.Mui-disabled': {
            borderColor: COLORS.borderLight,
            color: COLORS.textMuted,
          },
        }}
      >
        {loading ? 'Saving...' : 'Save Draft'}
      </Button>
    </Box>
  );

  const followUpJSX = !lockedServices.has('medical') ? (
    <Box sx={{ mt: 2, p: 2, bgcolor: '#F3E5F5', border: '1px solid #CE93D8', flexShrink: 0 }}>
      <Typography sx={{ fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, color: '#6A1B9A', mb: 1.5 }}>
        FOLLOW-UP & DISCHARGE
      </Typography>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 4 }}>
          <TextField
            size="small" fullWidth select
            label="Patient Status"
            value={soapData.patientStatus || 'Stable'}
            onChange={(e) => updateSoap('patientStatus', e.target.value)}
            sx={{ bgcolor: 'white' }}
          >
            <MenuItem value="Stable">Stable</MenuItem>
            <MenuItem value="Improving">Improving</MenuItem>
            <MenuItem value="Guarded">Guarded</MenuItem>
            <MenuItem value="Critical">Critical</MenuItem>
            <MenuItem value="Palliative">Palliative</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 4 }}>
          <TextField
            size="small" fullWidth select
            label="Recheck In"
            value={soapData.recheckIn || '1 Week'}
            onChange={(e) => updateSoap('recheckIn', e.target.value)}
            sx={{ bgcolor: 'white' }}
          >
            <MenuItem value="3 Days">3 Days</MenuItem>
            <MenuItem value="1 Week">1 Week</MenuItem>
            <MenuItem value="2 Weeks">2 Weeks</MenuItem>
            <MenuItem value="1 Month">1 Month</MenuItem>
            <MenuItem value="3 Months">3 Months</MenuItem>
            <MenuItem value="6 Months">6 Months</MenuItem>
            <MenuItem value="1 Year">1 Year</MenuItem>
            <MenuItem value="As Needed">As Needed</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 4 }}>
          <TextField
            size="small" fullWidth
            label="Next Visit Date"
            type="date"
            value={soapData.nextVisit || ''}
            onChange={(e) => updateSoap('nextVisit', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ bgcolor: 'white' }}
            inputProps={{ min: new Date().toISOString().split('T')[0] }}
          />
        </Grid>
      </Grid>
      {soapData.nextVisit && (
        <Typography sx={{ mt: 1, fontSize: '0.68rem', fontWeight: 800, color: '#6A1B9A', opacity: 0.9 }}>
          A follow-up appointment will be auto-created when you sign off.
        </Typography>
      )}
    </Box>
  ) : null;

  // T3.124: Re-route a patient whose record is already sealed but whose appointment
  // was reverted (e.g. by an admin) back to a pre-cashier status. Determines the
  // correct next station (dispensing vs billing) by inspecting treatmentCart — the
  // same logic used by handleSaveConsult's nextRouteStatus derivation.
  const handleRerouteSealed = async () => {
    setLoading(true);
    try {
      const freshSnap = await getDoc(doc(db, 'appointments', patient.id));
      const freshData = freshSnap.exists() ? freshSnap.data() : {};
      const freshHistory = freshData.statusHistory || [];
      const freshStatus = freshData.status || patient.status;

      // Mirror handleSaveConsult's nextRouteStatus: dispensing if any drug is in cart,
      // otherwise send straight to billing.
      const hasDispensableItems = treatmentCart.some(item =>
        (item.productClass || (item.isDrug ? 'medicine' : 'retail')) === 'medicine'
      );
      const nextStatus = hasDispensableItems ? 'dispensing' : 'billing';

      const rerouteEvent = createPulseEvent('STATUS_CHANGE', {
        fromStatus: freshStatus,
        toStatus: nextStatus,
        staffId: auth.currentUser?.uid || 'system',
        staffName: auth.currentUser?.displayName || 'Clinician',
        note: 'Re-routed to cashier after revert — record already sealed.',
      });

      await updateDoc(doc(db, 'appointments', patient.id), {
        status: nextStatus,
        statusHistory: [...freshHistory, freshStatus],
        clinicalPulse: arrayUnion(rerouteEvent),
      });

      // T4.90: Push notification — re-route to dispensing/billing
      const rerouteVetName = auth.currentUser?.displayName || 'Clinician';
      sendPushNotification({
        ownerId: patient.ownerId,
        status: nextStatus,
        petName: patient.petName,
        vetName: rerouteVetName,
        appointmentId: patient.id,
        sentBy: rerouteVetName,
      });

      showToast(`Patient re-routed to ${nextStatus}.`, 'success');
      onClose();
    } catch (err) {
      console.error('[ClinicalWorkspace.handleRerouteSealed]:', err.message);
      showToast(`Re-route failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog fullScreen open={open} onClose={handleCloseRequest} TransitionComponent={Transition}
      PaperProps={{ sx: { bgcolor: '#FDFCFB' } }}>

      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {/* === SOAP COLUMN (LEFT) === */}
        <Box sx={{ flex: 7.5, display: 'flex', flexDirection: 'column', borderRight: '2px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>

          {/* --- IDENTITY STRIP --- */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.75,
            bgcolor: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.08)',
            flexShrink: 0, minHeight: 48, maxHeight: 56,
          }}>
            {/* Close button */}
            <IconButton size="small" onClick={handleCloseRequest} sx={{ color: COLORS.textMuted }}>
              <CloseIcon />
            </IconButton>

            {/* Avatar */}
            <Avatar sx={{
              width: 36, height: 36, bgcolor: COLORS.brand, fontFamily: FONT,
              fontWeight: 700, fontSize: '0.9rem', border: `2px solid ${COLORS.border}`,
            }}>
              {(patient?.petName || '?')[0].toUpperCase()}
            </Avatar>

            {/* Pet Name */}
            <Typography sx={{
              fontFamily: FONT, fontSize: '1.1rem', fontWeight: 1000,
              color: COLORS.brand, textTransform: 'uppercase', letterSpacing: -0.3,
              maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {patient?.petName || 'Unknown'}
            </Typography>

            {/* Species Rail */}
            <Typography sx={{
              fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 900,
              color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {[patient?.petSpecies, patient?.petBreed, patient?.petGender,
                patient?.petAge || calculateAge(patient?.petBirthdate || patient?.dob),
                soapData.objWeight || patient?.petWeight ? `${soapData.objWeight || patient.petWeight} KG` : '??? KG',
                patient?.petIsNeutered ? 'FIXED' : 'INTACT'
              ].filter(Boolean).join(' \u00B7 ')}
            </Typography>

            {/* Owner Info */}
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
              {patient?.ownerName || 'Walk-In'} {patient?.ownerPhone ? `| ${patient.ownerPhone}` : ''}
            </Typography>

            {/* Allergy — unified read: petAllergies (canonical) || allergies (legacy) */}
            {(() => {
              const allergyVal = localPetAllergies ?? patient?.petAllergies ?? patient?.allergies ?? '';
              const hasAllergy = allergyVal && allergyVal.toUpperCase() !== 'NONE' && allergyVal.trim().length > 0;
              return (
                <Chip
                  label={hasAllergy ? `ALLERGY: ${allergyVal}` : 'NKA'}
                  size="small"
                  sx={{
                    height: 20, fontSize: '0.58rem', fontWeight: 1000,
                    bgcolor: hasAllergy ? '#D32F2F' : 'transparent',
                    color: hasAllergy ? 'white' : COLORS.textMuted,
                    border: hasAllergy ? 'none' : '1px solid rgba(0,0,0,0.12)',
                  }}
                />
              );
            })()}

            {/* T4.181: Edit identity icon — opens inline form below */}
            {!isEditingIdentity && petDetails && (
              <Tooltip title="Edit Patient Identity">
                <IconButton size="small" onClick={handleEditIdentity}
                  sx={{ color: COLORS.accentLight, '&:hover': { color: COLORS.brand } }}>
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}

            {/* T3.53: Overdue vaccine badge — prompts vet to discuss vaccination during consult */}
            {overdueVaccineCount > 0 && (
              <Chip
                label={`${overdueVaccineCount} VACCINE${overdueVaccineCount > 1 ? 'S' : ''} OVERDUE`}
                size="small"
                sx={{
                  bgcolor: COLORS.dangerSurface,
                  color: COLORS.surgery,
                  fontWeight: 900,
                  fontSize: '0.58rem',
                  height: 20,
                  borderRadius: 0,
                  border: `1px solid ${COLORS.surgery}`,
                }}
              />
            )}

            {/* No-show lineage chip — display-only, reads written field from appointment doc */}
            {patient?.noShowCount > 0 && (
              <Tooltip
                title={patient.rebookedFromId
                  ? `Rebooked after ${patient.noShowCount} no-show${patient.noShowCount > 1 ? 's' : ''} on record`
                  : `${patient.noShowCount} no-show${patient.noShowCount > 1 ? 's' : ''} on record`
                }
              >
                <Chip
                  label={`${patient.noShowCount} NO-SHOW${patient.noShowCount > 1 ? 'S' : ''}`}
                  size="small"
                  sx={{
                    height: 20, fontSize: '0.56rem', fontWeight: 1000,
                    bgcolor: '#F57C00', color: 'white', cursor: 'help',
                  }}
                />
              </Tooltip>
            )}

            {/* God-View Button */}
            <Tooltip title="God-View (Fullscreen SOAP)">
              <IconButton size="small" onClick={() => setIsUnifiedZen(true)} sx={{ color: COLORS.brand }}>
                <FitScreenIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>

            {/* T3.1: EMR History Button */}
            <Tooltip title="View Pet EMR History">
              <IconButton size="small" onClick={() => setEmrOpen(true)} sx={{ color: COLORS.medical }}>
                <HistoryEduIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* T4.181: Inline identity edit form — Collapse for smooth open/close animation */}
          <Collapse in={isEditingIdentity} timeout={200}>
            {identityForm && (
              <Box sx={{
                px: 2, py: 1.5, bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`,
                flexShrink: 0,
              }}>
                {/* Section header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ ...TYPE.label, color: COLORS.accent }}>
                    PATIENT IDENTITY — EDIT MODE
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined"
                      onClick={() => { setIsEditingIdentity(false); setIdentityForm(null); }}
                      disabled={identitySaving}
                      sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem', borderRadius: 0,
                            color: COLORS.accent, borderColor: COLORS.accent, textTransform: 'uppercase' }}>
                      CANCEL
                    </Button>
                    <Button size="small" variant="contained"
                      onClick={handleSaveIdentity}
                      disabled={identitySaving || !identityForm.name.trim()}
                      sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem', borderRadius: 0,
                            bgcolor: COLORS.sky, '&:hover': { bgcolor: COLORS.skyHover },
                            textTransform: 'uppercase' }}>
                      {identitySaving ? 'SAVING...' : 'SAVE'}
                    </Button>
                  </Box>
                </Box>

                {/* Row 1: Name, Species, Breed, Gender, Color, Neutered */}
                <Grid container spacing={1} sx={{ mb: 1 }}>
                  <Grid item xs={3}>
                    <TextField size="small" label="PET NAME" variant="outlined" fullWidth
                      value={identityForm.name}
                      onChange={e => setIdentityForm(prev => ({ ...prev, name: e.target.value }))}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    />
                  </Grid>
                  <Grid item xs={2}>
                    <TextField size="small" label="SPECIES" variant="outlined" fullWidth select
                      value={identityForm.species}
                      onChange={e => {
                        const newSpecies = e.target.value;
                        setIdentityForm(prev => ({
                          ...prev,
                          species: newSpecies,
                          // Species change clears breed — catalog is species-filtered
                          breed: prev.species !== newSpecies ? '' : prev.breed,
                        }));
                      }}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } }}>
                      <MenuItem value="Canine" sx={{ fontWeight: 800 }}>CANINE</MenuItem>
                      <MenuItem value="Feline" sx={{ fontWeight: 800 }}>FELINE</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={3}>
                    <Autocomplete
                      freeSolo
                      size="small"
                      options={BREED_CATALOG[identityForm.species] || []}
                      value={identityForm.breed}
                      onChange={(_, v) => setIdentityForm(prev => ({ ...prev, breed: v || '' }))}
                      onInputChange={(_, v, reason) => {
                        if (reason === 'input') setIdentityForm(prev => ({ ...prev, breed: v }));
                      }}
                      componentsProps={{ paper: { sx: { borderRadius: 0, border: `1px solid ${COLORS.accent}` } } }}
                      renderInput={params => (
                        <TextField {...params} label="BREED"
                          inputProps={{ ...params.inputProps, style: { fontWeight: 900, fontSize: '0.85rem' } }}
                          sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={1.5}>
                    <TextField size="small" label="SEX" variant="outlined" fullWidth select
                      value={identityForm.gender}
                      onChange={e => setIdentityForm(prev => ({ ...prev, gender: e.target.value }))}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } }}>
                      <MenuItem value="Male" sx={{ fontWeight: 800 }}>MALE</MenuItem>
                      <MenuItem value="Female" sx={{ fontWeight: 800 }}>FEMALE</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={1.5}>
                    <TextField size="small" label="COLOR" variant="outlined" fullWidth
                      value={identityForm.color}
                      onChange={e => setIdentityForm(prev => ({ ...prev, color: e.target.value }))}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <FormControlLabel
                      control={
                        <Switch size="small" color="success"
                          checked={identityForm.isNeutered}
                          onChange={e => setIdentityForm(prev => ({ ...prev, isNeutered: e.target.checked }))}
                        />
                      }
                      label={<Typography sx={{ fontSize: '0.6rem', fontWeight: 900, color: COLORS.accent }}>
                        {identityForm.isNeutered ? 'FIXED' : 'INTACT'}
                      </Typography>}
                      sx={{ m: 0, mt: 0.5 }}
                    />
                  </Grid>
                </Grid>

                {/* Row 2: DOB 3-mode + Microchip + Allergies */}
                <Grid container spacing={1}>
                  {/* DOB 3-mode selector */}
                  <Grid item xs={5}>
                    <Box sx={{ p: 1, border: `1px dashed ${COLORS.borderLight}`, bgcolor: 'white' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, gap: 1 }}>
                        <Typography sx={{ fontWeight: 900, fontSize: '0.65rem', color: COLORS.accent }}>
                          BIRTHDATE / AGE
                        </Typography>
                        <ToggleButtonGroup
                          size="small"
                          value={identityForm.dobMode}
                          exclusive
                          onChange={(_, val) => val && setIdentityForm(prev => ({ ...prev, dobMode: val }))}
                          sx={{ ml: 'auto', height: 22 }}
                        >
                          <ToggleButton value="exact"
                            sx={{ fontSize: '0.6rem', fontWeight: 900, px: 1.5, borderRadius: 0 }}>
                            EXACT
                          </ToggleButton>
                          <ToggleButton value="approximate"
                            sx={{ fontSize: '0.6rem', fontWeight: 900, px: 1.5, borderRadius: 0 }}>
                            EST.
                          </ToggleButton>
                          <ToggleButton value="unknown"
                            sx={{ fontSize: '0.6rem', fontWeight: 900, px: 1.5, borderRadius: 0 }}>
                            UNK.
                          </ToggleButton>
                        </ToggleButtonGroup>
                      </Box>
                      {identityForm.dobMode === 'exact' && (
                        <TextField size="small" type="date" fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={identityForm.dob}
                          onChange={e => setIdentityForm(prev => ({ ...prev, dob: e.target.value }))}
                          inputProps={{ style: { fontWeight: 900, fontSize: '0.8rem' } }}
                          sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                        />
                      )}
                      {identityForm.dobMode === 'approximate' && (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField size="small" label="YRS" type="number" fullWidth
                            value={identityForm.estYears}
                            onChange={e => setIdentityForm(prev => ({ ...prev, estYears: e.target.value }))}
                            inputProps={{ style: { fontWeight: 900 }, min: 0 }}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                          />
                          <TextField size="small" label="MO" type="number" fullWidth
                            value={identityForm.estMonths}
                            onChange={e => setIdentityForm(prev => ({ ...prev, estMonths: e.target.value }))}
                            inputProps={{ style: { fontWeight: 900 }, min: 0, max: 11 }}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                          />
                        </Box>
                      )}
                      {identityForm.dobMode === 'unknown' && (
                        <Typography variant="caption" sx={{ color: COLORS.accentWarm, fontStyle: 'italic', fontWeight: 800, fontSize: '0.65rem' }}>
                          Age will be determined during exam.
                        </Typography>
                      )}
                    </Box>
                  </Grid>

                  {/* Microchip */}
                  <Grid item xs={2}>
                    <TextField size="small" label="MICROCHIP" variant="outlined" fullWidth
                      value={identityForm.microchip}
                      onChange={e => setIdentityForm(prev => ({ ...prev, microchip: e.target.value }))}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    />
                  </Grid>

                  {/* Allergy tag array */}
                  <Grid item xs={5}>
                    <Box sx={{
                      p: 1, border: '1.2px solid',
                      borderColor: identityForm.showAllergyInput ? COLORS.danger : COLORS.borderInput,
                      bgcolor: 'white',
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                 mb: identityForm.showAllergyInput ? 0.5 : 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <WarningAmberIcon sx={{
                            color: identityForm.showAllergyInput ? COLORS.danger : COLORS.borderInput,
                            fontSize: 16
                          }} />
                          <Typography sx={{
                            fontWeight: 900, fontSize: '0.65rem',
                            color: identityForm.showAllergyInput ? COLORS.danger : COLORS.textMuted
                          }}>
                            ALLERGIES
                          </Typography>
                        </Box>
                        <Switch size="small" color="error"
                          checked={identityForm.showAllergyInput}
                          onChange={e => setIdentityForm(prev => ({
                            ...prev,
                            showAllergyInput: e.target.checked,
                            allergyArray: e.target.checked ? prev.allergyArray : [],
                          }))}
                        />
                      </Box>
                      {identityForm.showAllergyInput && (
                        <>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                            {identityForm.allergyArray.map((allergy, ai) => (
                              <Chip key={ai} label={allergy.toUpperCase()} size="small"
                                onDelete={() => setIdentityForm(prev => ({
                                  ...prev,
                                  allergyArray: prev.allergyArray.filter((_, i) => i !== ai),
                                }))}
                                sx={{
                                  bgcolor: COLORS.danger, color: 'white', fontWeight: 900,
                                  fontSize: '0.6rem', height: 20, borderRadius: 0,
                                  '& .MuiChip-deleteIcon': { color: 'white!important', opacity: 0.8 },
                                }}
                              />
                            ))}
                            {identityForm.allergyArray.length === 0 && (
                              <Typography variant="caption" sx={{
                                color: COLORS.danger, fontStyle: 'italic', fontWeight: 800, fontSize: '0.6rem'
                              }}>
                                No allergens added...
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <TextField fullWidth size="small" placeholder="Type allergy (e.g. Chicken)"
                              value={identityForm.currentAllergyInput}
                              onChange={e => setIdentityForm(prev => ({
                                ...prev, currentAllergyInput: e.target.value,
                              }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && identityForm.currentAllergyInput.trim()) {
                                  e.preventDefault();
                                  setIdentityForm(prev => ({
                                    ...prev,
                                    allergyArray: [...prev.allergyArray, prev.currentAllergyInput.trim()],
                                    currentAllergyInput: '',
                                  }));
                                }
                              }}
                              inputProps={{ style: { fontWeight: 900, fontSize: '0.8rem' } }}
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                            />
                            <Button variant="contained" color="error" size="small"
                              disabled={!identityForm.currentAllergyInput.trim()}
                              onClick={() => setIdentityForm(prev => ({
                                ...prev,
                                allergyArray: [...prev.allergyArray, prev.currentAllergyInput.trim()],
                                currentAllergyInput: '',
                              }))}
                              sx={{ fontWeight: 900, minWidth: 32, borderRadius: 0, px: 1 }}>
                              +
                            </Button>
                          </Box>
                        </>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Collapse>

          {/* --- ALERTS --- */}

          {/* A3 — Draft SOAP Recovery Banner
              Shown when a recent (< 24h) draft exists on an active clinical appointment.
              The vet must explicitly RESUME or DISCARD — the draft never silently hydrates. */}
          {draftBannerState && (
            <Box
              sx={{
                flexShrink: 0,
                mx: 2,
                mt: 1.5,
                mb: 1,
                p: 2,
                bgcolor: COLORS.kpiOrangeBg,
                border: `2px solid ${COLORS.warning}`,
                borderLeft: `6px solid ${COLORS.warning}`,
                // Neubrutalist solid offset shadow — no blur, espresso offset block
                boxShadow: `4px 4px 0 ${COLORS.brand}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              {/* Header row: icon + title + metadata */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <WarningAmberIcon sx={{ color: COLORS.warning, fontSize: 22, flexShrink: 0 }} />
                <Typography sx={{ ...TYPE.label, color: COLORS.brand, fontSize: '0.78rem' }}>
                  UNSAVED DRAFT FOUND
                </Typography>
                <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontSize: '0.72rem', ml: 'auto', whiteSpace: 'nowrap' }}>
                  saved {formatRelativeTime(draftBannerState.savedAt)} by {draftBannerState.savedByName}
                </Typography>
              </Box>

              {/* Draft preview — Subjective snippet + one-line vitals summary */}
              <Box sx={{ pl: 3.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {draftBannerState.draft?.subjective && (
                  <Typography sx={{ ...TYPE.body, color: COLORS.textSecondary, fontStyle: 'italic', fontSize: '0.8rem' }}>
                    Subjective: &ldquo;{truncate(draftBannerState.draft.subjective, 140)}&rdquo;
                  </Typography>
                )}
                {(draftBannerState.draft?.objTemp || draftBannerState.draft?.objHR || draftBannerState.draft?.objRR) && (
                  <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    Vitals:&nbsp;
                    {[
                      draftBannerState.draft.objTemp && `T ${draftBannerState.draft.objTemp}\u00B0C`,
                      draftBannerState.draft.objHR && `HR ${draftBannerState.draft.objHR}`,
                      draftBannerState.draft.objRR && `RR ${draftBannerState.draft.objRR}`,
                    ].filter(Boolean).join(' \u00B7 ')}
                  </Typography>
                )}
              </Box>

              {/* Action row */}
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 0.5 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setDiscardConfirmOpen(true)}
                  sx={{
                    fontWeight: 900,
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    color: COLORS.danger,
                    borderColor: COLORS.danger,
                    borderRadius: 0,
                    px: 2,
                    '&:hover': { bgcolor: COLORS.kpiRedBg },
                  }}
                >
                  DISCARD DRAFT
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleResumeDraft}
                  sx={{
                    fontWeight: 900,
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    bgcolor: COLORS.medical,
                    color: '#FFF',
                    borderRadius: 0,
                    // Neubrutalist offset shadow on the primary action button
                    boxShadow: `2px 2px 0 ${COLORS.brand}`,
                    px: 2,
                    '&:hover': { bgcolor: '#0D47A1', boxShadow: `2px 2px 0 ${COLORS.brand}` },
                  }}
                >
                  RESUME EDITING
                </Button>
              </Box>
            </Box>
          )}

          {/* A3 — Discard Draft Confirmation Dialog */}
          <Dialog
            open={discardConfirmOpen}
            onClose={() => setDiscardConfirmOpen(false)}
            PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.danger}` } }}
          >
            <DialogTitle sx={{ ...TYPE.heading, color: COLORS.danger, fontWeight: 900, textTransform: 'uppercase', pb: 0 }}>
              Discard Draft?
            </DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
              <DialogContentText sx={{ ...TYPE.body, color: COLORS.textPrimary }}>
                Discard unsaved notes from <strong>{draftBannerState?.savedByName}</strong> saved{' '}
                {formatRelativeTime(draftBannerState?.savedAt)}? This cannot be undone and the draft
                will be permanently removed from the appointment record.
              </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
              <Button
                onClick={() => setDiscardConfirmOpen(false)}
                sx={{ fontWeight: 800, color: COLORS.textSecondary, borderRadius: 0 }}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await handleDiscardDraft();
                  setDiscardConfirmOpen(false);
                }}
                sx={{
                  fontWeight: 900,
                  color: '#FFF',
                  bgcolor: COLORS.danger,
                  borderRadius: 0,
                  '&:hover': { bgcolor: '#B71C1C' },
                }}
              >
                Discard Permanently
              </Button>
            </DialogActions>
          </Dialog>

          {lockedServices.has('medical') && (
            <Alert severity="success" icon={<ShieldIcon/>}
              sx={{ fontWeight: 900, py: 0.5, fontSize: '0.75rem', flexShrink: 0 }}>
              This clinical record is SIGNED and LOCKED.
            </Alert>
          )}

          {/* --- 2x2 SOAP GRID (fills remaining space) --- */}
          {/* T4.158: Intake notes removed from SoapGrid — subjective is now pre-populated instead */}
          <SoapGrid
            soapData={soapData}
            updateSoap={updateSoap}
            setFullscreenField={setFullscreenField}
            getTriageLevel={getTriageLevel}
            renderHistoricalLabel={renderHistoricalLabel}
            runAssistiveDiagnosis={runAssistiveDiagnosis}
            assistiveText={assistiveText}
            diagnosticOpen={diagnosticOpen}
            setDiagnosticOpen={setDiagnosticOpen}
            SoapQuadrant={SoapQuadrant}
            VitalsGrid={VitalsGrid}
            DiagnosticBridge={DiagnosticBridge}
            showVaccineForm={showVaccineForm}
            vaccineFormNode={vaccineFormJSX}
            labResultsNode={labResultsJSX}
            showDraftSave={!lockedServices.has('medical')}
            draftSaveNode={draftSaveJSX}
            followUpNode={followUpJSX}
            canToggleVaccine={!showVaccineForm && !isRecordLocked}
            onManualVaccineToggle={() => setManualVaccineOverride(true)}
            vaccineProducts={vaccineProducts}
            onAddVaccineProduct={handleAddVaccineProduct}
            llmEnabled={llmConfig.enabled && !!llmConfig.workerUrl}
            llmLoading={llmLoading}
            llmMessages={llmMessages}
            onAskAI={runLlmDiagnosis}
            onResetAndAskAI={handleResetAndAskAI}
            onToggleAIPanel={handleToggleAIPanel}
            isAIPanelOpen={isAIDrawerOpen}
            onMarkAllNormal={() => applyTemplate('wnl')}
            disabled={lockedServices.has('medical')}
            diagnosisCatalog={diagnosisCatalog}
            patientSpecies={patient?.petSpecies || ''}
            onAddCustomDiagnosis={() => setAddCustomDxOpen(true)}
          />
        </Box>

        {/* === SIDEBAR (RIGHT) === */}
        <Box sx={{ flex: 2.5, display: 'flex', flexDirection: 'column', bgcolor: '#FAF8F5', overflow: 'hidden' }}>
          {/* Scrollable area: search, cart, service progress */}
          <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 3 }}>
            <Stack spacing={3}>
                <Paper ref={treatmentRef} sx={{ ...glassStyle, p: 3, borderLeft: `8px solid ${COLORS.accent}` }}>
                    <Typography variant="h6" sx={{ fontWeight: 1000, color: COLORS.brand, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ReceiptLongIcon sx={{ color: COLORS.accent }} /> Services &amp; Items
                    </Typography>

                    {/* 🧬 PHASE 3: STOCK GUARD & CLINICAL ALERTS */}
                    {!isRecordLocked && (
                        <Autocomplete
                            id="inventory-search"
                            options={autocompleteOptions}
                            groupBy={(option) => option.category}
                            getOptionLabel={(option) => option.label || ''}
                            getOptionDisabled={(option) => option.isOut === true && option.inventoryCategory !== 'vaccine'}
                            onChange={(event, newValue) => handleAddRx(newValue)}
                            renderOption={(props, option) => (
                                <Box component="li" {...props} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', py: 1 }}>
                                    <Box>
                                        <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: option.isOut ? COLORS.textMuted : 'inherit', display: 'flex', alignItems: 'center' }}>
                                            {option.itemName || option.name}
                                            {option.isMedicine && <MedicationIcon sx={{ fontSize: 14, color: '#D32F2F', ml: 1 }} />}
                                            {/* T4.117: Vaccine indicator — distinct visual for vaccine-category products */}
                                            {option.inventoryCategory === 'vaccine' && <VaccinesIcon sx={{ fontSize: 14, color: COLORS.success, ml: 0.5 }} />}
                                        </Typography>
                                        {option.stock !== undefined && (
                                            <Typography variant="caption" sx={{ color: option.isOut ? '#D32F2F' : (option.isLow ? '#EF6C00' : COLORS.textMuted), fontWeight: 800 }}>
                                                {option.isOut ? 'EXHAUSTED' : (option.isLow ? `LOW STOCK: ${option.stock - (option.reserved || 0)} left` : `${option.stock - (option.reserved || 0)} available`)}
                                            </Typography>
                                        )}
                                    </Box>
                                    {option.isLow && !option.isOut && <Chip label="LOW" size="small" color="warning" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 1000 }} />}
                                    {option.isOut && <Chip label="OUT" size="small" color="error" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 1000 }} />}
                                </Box>
                            )}
                            renderInput={(params) => (
                                <TextField 
                                    {...params} 
                                    variant="outlined" 
                                    size="small" 
                                    placeholder="Search Inventory / Services..." 
                                    sx={{ 
                                        mb: 2, 
                                        '& .MuiOutlinedInput-root': { 
                                            borderRadius: 2, 
                                            bgcolor: 'white',
                                            fontWeight: 900
                                        } 
                                    }} 
                                />
                            )}
                            sx={{ width: '100%' }}
                        />
                    )}

                    {/* ═══ T4.127: SERVICES PANEL ═══ */}
                    {(() => {
                      const serviceItems = treatmentCart.filter(rx => rx.type === 'service');
                      if (serviceItems.length === 0) return null;
                      return (
                        <Paper sx={{ p: 2, borderRadius: 0, border: `2px solid ${COLORS.sky}`, bgcolor: '#F8FCFF', mt: 1 }}>
                          <Typography sx={{ fontWeight: 1000, fontSize: '0.75rem', color: COLORS.sky, letterSpacing: '0.08em', mb: 1.5 }}>
                            SERVICES ({serviceItems.length})
                          </Typography>
                          <Stack spacing={1}>
                            {serviceItems.map((rx) => {
                              const cartIdx = treatmentCart.indexOf(rx);
                              const status = serviceProgress[rx.id] || 'pending';
                              const progressColors = {
                                pending: { bg: '#9E9E9E', label: 'PENDING' },
                                'in-progress': { bg: COLORS.warning, label: 'IN PROGRESS' },
                                completed: { bg: COLORS.success, label: 'COMPLETED' },
                              };
                              const pc = progressColors[status] || progressColors.pending;
                              const isToggleable = !isRecordLocked && status !== 'completed';

                              return (
                                <Box
                                  key={rx.id || cartIdx}
                                  sx={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    p: 1.5, bgcolor: 'white', border: `1px solid ${COLORS.borderLight}`, borderRadius: 0,
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                                    {!isRecordLocked && !rx.isBase && (
                                      <IconButton size="small" onClick={() => handleRemoveRx(cartIdx)} sx={{ p: 0.25 }}>
                                        <CloseIcon sx={{ fontSize: 12, color: COLORS.danger }} />
                                      </IconButton>
                                    )}
                                    <Typography sx={{ fontWeight: 900, fontSize: '0.8rem', color: COLORS.brand, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {rx.name}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                                    <Typography sx={{ fontWeight: 900, fontSize: '0.8rem', color: COLORS.brand }}>
                                      ₱{(rx.price * rx.qty).toLocaleString()}
                                    </Typography>
                                    <Chip
                                      label={pc.label}
                                      size="small"
                                      onClick={() => isToggleable && handleToggleServiceProgress(rx.id)}
                                      sx={{
                                        bgcolor: pc.bg, color: '#FFF', fontWeight: 900, fontSize: '0.6rem',
                                        height: 22, borderRadius: 0, cursor: isToggleable ? 'pointer' : 'default',
                                        '&:hover': isToggleable ? { opacity: 0.85 } : {},
                                      }}
                                    />
                                  </Box>
                                </Box>
                              );
                            })}
                          </Stack>
                          {/* Per-panel subtotal */}
                          <Box sx={{ mt: 1.5, pt: 1, borderTop: `1px solid ${COLORS.borderLight}`, display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontWeight: 800, fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase' }}>Services</Typography>
                            <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: COLORS.brand }}>
                              ₱{serviceItems.reduce((sum, rx) => sum + (rx.price * rx.qty), 0).toLocaleString()}
                            </Typography>
                          </Box>
                        </Paper>
                      );
                    })()}

                    {/* ═══ T4.127: ITEMS & MEDICATIONS PANEL ═══ */}
                    {(() => {
                      const productItems = treatmentCart.filter(rx => rx.type === 'product');
                      if (productItems.length === 0) return null;
                      return (
                        <Paper sx={{ p: 2, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: '#FBF9F7', mt: 1 }}>
                          <Typography sx={{ fontWeight: 1000, fontSize: '0.75rem', color: COLORS.accent, letterSpacing: '0.08em', mb: 1.5 }}>
                            ITEMS & MEDICATIONS ({productItems.length})
                          </Typography>
                          <Stack spacing={2}>
                            {productItems.map((rx) => {
                              const cartIdx = treatmentCart.indexOf(rx);
                              return (
                                <Box key={rx.id || cartIdx} sx={{ bgcolor: 'white', p: 2, borderRadius: 0, border: `1px solid ${COLORS.borderLight}` }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.85rem', color: COLORS.brand }}>{rx.name}</Typography>
                                    {!isRecordLocked && (
                                      <IconButton size="small" onClick={() => handleRemoveRx(cartIdx)}>
                                        <CloseIcon sx={{ fontSize: 14, color: '#D32F2F' }} />
                                      </IconButton>
                                    )}
                                  </Box>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#F5F5F5', borderRadius: 0, px: 0.5 }}>
                                      <IconButton size="small" onClick={() => handleUpdateQty(cartIdx, -1)} sx={{ p: 0.5 }}>
                                        <ContentCutIcon sx={{ fontSize: 14, rotate: '90deg' }} />
                                      </IconButton>
                                      <Typography sx={{ fontWeight: 1000, fontSize: '0.85rem' }}>{rx.qty}</Typography>
                                      <IconButton size="small" onClick={() => handleUpdateQty(cartIdx, 1)} sx={{ p: 0.5 }}>
                                        <AddCircleIcon sx={{ fontSize: 14, color: COLORS.brand }} />
                                      </IconButton>
                                    </Box>
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.9rem', color: COLORS.brand }}>₱{(rx.price * rx.qty).toLocaleString()}</Typography>
                                  </Box>

                                  {/* Drug sig fields (always visible) — structured inputs replace the
                                      free-text field so dose/frequency/duration/route are machine-readable
                                      and the instructions string stays derived (never manually edited). */}
                                  {(rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) === 'medicine' && (
                                    <Box sx={{ mt: 1, p: 1, bgcolor: COLORS.rxBg, border: `1px solid ${COLORS.rxBorder}`, borderRadius: 0 }}>
                                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <TextField
                                          size="small" label="Dose" placeholder="1"
                                          value={rx.sig?.dose || ''}
                                          onChange={(e) => handleUpdateSigField(cartIdx, 'dose', e.target.value)}
                                          disabled={isRecordLocked}
                                          sx={{ width: 60, '& .MuiInputBase-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 700 } }}
                                        />
                                        <TextField
                                          size="small" label="Unit" placeholder="Capsule"
                                          value={rx.sig?.unit || rx.unit || ''}
                                          onChange={(e) => handleUpdateSigField(cartIdx, 'unit', e.target.value)}
                                          disabled={isRecordLocked}
                                          sx={{ width: 80, '& .MuiInputBase-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 700 } }}
                                        />
                                        <TextField
                                          select size="small" label="Frequency"
                                          value={rx.sig?.frequency || 'SID'}
                                          onChange={(e) => handleUpdateSigField(cartIdx, 'frequency', e.target.value)}
                                          disabled={isRecordLocked}
                                          sx={{ width: 90, '& .MuiInputBase-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 700 } }}
                                        >
                                          <MenuItem value="SID">SID (1×/day)</MenuItem>
                                          <MenuItem value="BID">BID (2×/day)</MenuItem>
                                          <MenuItem value="TID">TID (3×/day)</MenuItem>
                                          <MenuItem value="QID">QID (4×/day)</MenuItem>
                                          <MenuItem value="EOD">EOD (every other)</MenuItem>
                                          <MenuItem value="PRN">PRN (as needed)</MenuItem>
                                        </TextField>
                                        <TextField
                                          size="small" label="Days" placeholder="7" type="number"
                                          value={rx.sig?.duration || ''}
                                          onChange={(e) => handleUpdateSigField(cartIdx, 'duration', e.target.value)}
                                          disabled={isRecordLocked}
                                          sx={{ width: 60, '& .MuiInputBase-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 700 } }}
                                          inputProps={{ min: 1 }}
                                        />
                                        <TextField
                                          select size="small" label="Route"
                                          value={rx.sig?.route || 'PO'}
                                          onChange={(e) => handleUpdateSigField(cartIdx, 'route', e.target.value)}
                                          disabled={isRecordLocked}
                                          sx={{ width: 80, '& .MuiInputBase-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 700 } }}
                                        >
                                          <MenuItem value="PO">PO (oral)</MenuItem>
                                          <MenuItem value="SQ">SQ (subcut)</MenuItem>
                                          <MenuItem value="IM">IM (muscle)</MenuItem>
                                          <MenuItem value="IV">IV (vein)</MenuItem>
                                          <MenuItem value="TOP">Topical</MenuItem>
                                          <MenuItem value="OPH">Ophthalmic</MenuItem>
                                          <MenuItem value="OT">Otic (ear)</MenuItem>
                                        </TextField>
                                      </Box>
                                      {/* Auto-generated instructions preview — read-only, derived from structured fields above */}
                                      <Typography sx={{ mt: 0.75, fontSize: '0.7rem', fontWeight: 700, color: COLORS.rxText, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <MedicationIcon sx={{ fontSize: 12 }} />
                                        {buildInstructionsFromSig(rx.sig)}
                                      </Typography>
                                    </Box>
                                  )}

                                  {/* Non-drug collapsible instructions — collapsed by default to keep
                                      sidebar compact for items that don't need dosing notes. */}
                                  {(rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) !== 'medicine' && (
                                    <>
                                      <Typography
                                        onClick={() => !isRecordLocked && handleUpdateRxField(cartIdx, '_showInstructions', !rx._showInstructions)}
                                        sx={{
                                          mt: 0.75, fontSize: '0.65rem', fontWeight: 800,
                                          color: rx.instructions ? COLORS.rxText : COLORS.textMuted,
                                          cursor: isRecordLocked ? 'default' : 'pointer',
                                          fontFamily: FONT, letterSpacing: '0.05em', textTransform: 'uppercase',
                                          '&:hover': !isRecordLocked ? { color: COLORS.accent } : {},
                                        }}
                                      >
                                        {rx._showInstructions ? 'HIDE INSTRUCTIONS' : (rx.instructions ? `INSTRUCTIONS: ${rx.instructions}` : '+ ADD INSTRUCTIONS')}
                                      </Typography>
                                      <Collapse in={!!rx._showInstructions}>
                                        <TextField
                                          size="small" fullWidth
                                          placeholder="Optional usage notes"
                                          value={rx.instructions || ''}
                                          onChange={(e) => handleUpdateRxSig(cartIdx, e.target.value)}
                                          disabled={isRecordLocked}
                                          sx={{
                                            mt: 0.5,
                                            '& .MuiInputBase-root': {
                                              fontSize: '0.75rem', fontWeight: 700, fontFamily: FONT,
                                              borderRadius: 0, bgcolor: COLORS.formBg, border: `1px solid ${COLORS.borderLight}`,
                                            },
                                            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                          }}
                                        />
                                      </Collapse>
                                    </>
                                  )}

                                  {/* T4.117: No-stock-deduction audit badge — client-supplied vaccine scenario. */}
                                  {rx.noStockDeduction && (
                                    <Alert
                                      severity="warning"
                                      sx={{ py: 0, px: 1, mt: 0.5, fontSize: '0.6rem', fontWeight: 700, borderRadius: 0, '& .MuiAlert-icon': { fontSize: 14 } }}
                                    >
                                      No stock deduction — client-supplied vaccine
                                    </Alert>
                                  )}

                                </Box>
                              );
                            })}
                          </Stack>
                          {/* Per-panel subtotal */}
                          <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${COLORS.borderLight}`, display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontWeight: 800, fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase' }}>Items</Typography>
                            <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: COLORS.brand }}>
                              ₱{productItems.reduce((sum, rx) => sum + (rx.price * rx.qty), 0).toLocaleString()}
                            </Typography>
                          </Box>
                        </Paper>
                      );
                    })()}

                    {/* T4.127: GRAND TOTAL — spans both panels */}
                    {treatmentCart.length > 0 && (
                      <Box sx={{ pt: 2, borderTop: `3px solid ${COLORS.brand}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 1000, color: COLORS.brand, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          TOTAL
                        </Typography>
                        <Typography sx={{ fontWeight: 1000, color: COLORS.brand, fontSize: '1.3rem' }}>
                          ₱{treatmentCart.reduce((sum, item) => sum + (item.price * item.qty), 0).toLocaleString()}
                        </Typography>
                      </Box>
                    )}
                </Paper>

            </Stack>
          </Box>

          {/* T4.121: General SOAP Attachments — editable when unlocked, read-only when sealed */}

          {/* Editable attachment list — hidden from view after sign-off */}
          {!isRecordLocked && !lockedServices.has('medical') && (
            <Paper sx={{ ...glassStyle, p: 2, mx: 3, mb: 2 }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachFileIcon sx={{ fontSize: 14 }} />
                ATTACHMENTS ({soapAttachments.length})
              </Typography>

              <Stack spacing={1}>
                {soapAttachments.map((att, idx) => (
                  <Box
                    key={idx}
                    sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, bgcolor: COLORS.formBg, border: `1px solid ${COLORS.borderLight}` }}
                  >
                    {/* Thumbnail for images; PDF icon for documents */}
                    {att.preview ? (
                      <Box
                        component="img"
                        src={att.preview}
                        sx={{ width: 48, height: 48, objectFit: 'cover', border: `1px solid ${COLORS.borderLight}`, flexShrink: 0 }}
                      />
                    ) : (
                      <PictureAsPdfIcon sx={{ fontSize: 40, color: COLORS.danger, flexShrink: 0 }} />
                    )}

                    {/* Editable label */}
                    <TextField
                      size="small"
                      value={att.label}
                      onChange={(e) => {
                        const updated = [...soapAttachments];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setSoapAttachments(updated);
                      }}
                      placeholder="Label (e.g., Wound photo left ear)"
                      sx={{ flex: 2, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.8rem' } }}
                    />

                    {/* Type classification dropdown */}
                    <TextField
                      size="small"
                      select
                      value={att.type}
                      onChange={(e) => {
                        const updated = [...soapAttachments];
                        updated[idx] = { ...updated[idx], type: e.target.value };
                        setSoapAttachments(updated);
                      }}
                      sx={{ width: 140, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.8rem' } }}
                    >
                      <MenuItem value="lab-report">Lab Report</MenuItem>
                      <MenuItem value="clinical-photo">Clinical Photo</MenuItem>
                      <MenuItem value="referral">Referral</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </TextField>

                    {/* Client visibility toggle — default OFF (patient safety invariant) */}
                    <Tooltip title={att.clientVisible ? 'Visible to pet owner' : 'Hidden from pet owner'}>
                      <IconButton
                        size="small"
                        onClick={() => {
                          const updated = [...soapAttachments];
                          updated[idx] = { ...updated[idx], clientVisible: !updated[idx].clientVisible };
                          setSoapAttachments(updated);
                        }}
                        sx={{ color: att.clientVisible ? COLORS.success : COLORS.textMuted }}
                      >
                        {att.clientVisible
                          ? <VisibilityIcon sx={{ fontSize: 18 }} />
                          : <VisibilityOffIcon sx={{ fontSize: 18 }} />
                        }
                      </IconButton>
                    </Tooltip>

                    {/* Remove attachment */}
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveAttachment(idx)}
                      sx={{ color: COLORS.danger }}
                    >
                      <DeleteIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Box>
                ))}
              </Stack>

              <Button
                size="small"
                variant="text"
                onClick={() => fileInputRef.current?.click()}
                startIcon={<AttachFileIcon />}
                sx={{ mt: 1, fontWeight: 900, fontSize: '0.65rem', textTransform: 'uppercase', color: COLORS.medical }}
              >
                + Attach File
              </Button>
              {/* Hidden file input — opened programmatically via fileInputRef */}
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/jpeg,image/png,application/pdf"
                onChange={handleAttachFile}
              />
            </Paper>
          )}

          {/* Read-only sealed attachment display.
              Amendment 1: reads savedAttachments (from medical_records doc),
              NOT patient.attachments (patient is the appointment doc — has no attachments). */}
          {(isRecordLocked || lockedServices.has('medical')) && savedAttachments.length > 0 && (
            <Paper sx={{ ...glassStyle, p: 2, mx: 3, mb: 2 }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachFileIcon sx={{ fontSize: 14 }} />
                ATTACHMENTS ({savedAttachments.length})
              </Typography>
              <Stack spacing={0.5}>
                {savedAttachments.map((file, i) => (
                  <Typography
                    key={i}
                    component="a"
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      fontFamily: FONT, ...TYPE.body, color: COLORS.medical,
                      textDecoration: 'underline', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 0.5,
                    }}
                  >
                    {file.mimeType?.startsWith('image/')
                      ? <PhotoCameraIcon sx={{ fontSize: 14 }} />
                      : <PictureAsPdfIcon sx={{ fontSize: 14 }} />
                    }
                    {file.label || file.fileName || `Attachment ${i + 1}`}
                    {file.clientVisible && (
                      <Chip
                        label="Shared"
                        size="small"
                        sx={{ height: 16, fontSize: '0.5rem', fontWeight: 900, borderRadius: 0, bgcolor: '#E8F5E9', color: COLORS.success, ml: 0.5 }}
                      />
                    )}
                  </Typography>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Pinned bottom: sign-off / sealed section */}
          <Box sx={{ flexShrink: 0, p: 3, pt: 2, borderTop: `1px solid ${COLORS.borderLight}`, borderRadius: 0 }}>
                    {!isRecordLocked && !lockedServices.has('medical') ? (
                        <Stack spacing={2}>
                            {/* Staff-initiated record lock — two-step commit guard.
                                Clicking this arms the sign-off button; the vet confirms by clicking Sign & Send. */}
                            <Button variant="outlined" fullWidth size="large" onClick={() => setOwnerSignature(`consent_witnessed_${Date.now()}`)} startIcon={<HistoryEduIcon />} sx={{ fontWeight: 1000, borderRadius: 3, py: 1.5 }}>{ownerSignature ? "RECORD LOCKED ✅" : "LOCK CLINICAL RECORD"}</Button>
                            <Button variant="contained" fullWidth size="large" onClick={handleSaveConsult} disabled={loading || !ownerSignature} sx={{ fontWeight: 1000, borderRadius: 3, py: 2, bgcolor: COLORS.brand, textTransform: 'uppercase' }}>{loading ? "PROCESSING..." : saveBtnText}</Button>
                        </Stack>
                    ) : (
                        <Box sx={{ p: 3, bgcolor: '#E8F5E9', borderRadius: 0, border: '2px dashed #2E7D32', textAlign: 'center' }}>
                            <Typography variant="h6" fontWeight={1000} color="#2E7D32">RECORD SEALED</Typography>

                            {/* T3.118: Amendment via shared dialog */}
                            <Button
                                size="small"
                                onClick={() => setAmendDialogOpen(true)}
                                sx={{ mt: 1.5, fontWeight: 900, color: COLORS.success, borderColor: COLORS.success, borderRadius: 0, fontSize: '0.72rem' }}
                                variant="outlined"
                            >
                                Add Amendment
                            </Button>

                            {/* T3.124: Re-route button for reverted sealed records.
                                Only shown when the appointment was reverted back to a
                                pre-cashier status after the record was already sealed — so the
                                clinician can push it forward without re-signing. */}
                            {!['dispensing', 'billing', 'completed', 'carried-over', 'cancelled', 'no-show'].includes(patient.status) && (
                                <Button
                                    variant="contained"
                                    fullWidth
                                    size="small"
                                    onClick={handleRerouteSealed}
                                    disabled={loading}
                                    sx={{
                                        mt: 1.5,
                                        fontWeight: 900,
                                        borderRadius: 0,
                                        bgcolor: COLORS.warning,
                                        color: 'white',
                                        fontSize: '0.72rem',
                                        textTransform: 'uppercase',
                                        '&:hover': { bgcolor: '#BF360C' },
                                    }}
                                >
                                    {loading ? 'RE-ROUTING...' : 'RE-ROUTE TO CASHIER'}
                                </Button>
                            )}
                        </Box>
                    )}
          </Box>
        </Box>
      </Box>

      <AmendmentDialog
        open={amendDialogOpen}
        onClose={() => setAmendDialogOpen(false)}
        appointmentId={patient?.id}
        onSuccess={() => {
          setAmendDialogOpen(false);
          showToast("Amendment saved.", "success");
        }}
      />

      {/* 🧘 THE ZEN MODE FOCUS OVERLAY (CLINICAL CONCENTRATION) ── */}
      <Dialog 
        fullScreen open={!!fullscreenField} onClose={() => setFullscreenField(null)} 
        TransitionComponent={Transition} PaperProps={{ sx: { bgcolor: 'rgba(253, 252, 251, 0.98)', backdropFilter: 'blur(20px)' } }}
      >
        <AppBar elevation={0} sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: COLORS.banner, borderBottom: `1px solid ${COLORS.bannerBorder}`, py: 1 }}>
          <Toolbar>
            <IconButton edge="start" color="inherit" onClick={() => setFullscreenField(null)} aria-label="close"><CloseIcon sx={{ color: COLORS.textMuted }} /></IconButton>
            <Box sx={{ ml: 2, flex: 1 }}>
                <Typography sx={{ fontFamily: FONT, fontSize: '1.2rem', fontWeight: 1000, color: COLORS.brand, textTransform: 'uppercase', letterSpacing: 1.5, lineHeight: 1 }}>
                  {patient?.petName || 'UNKNOWN PATIENT'}
                </Typography>
                <Typography component="div" sx={{ fontFamily: FONT, fontSize: '0.68rem', fontWeight: 900, color: COLORS.brand, textTransform: 'uppercase', mt: 0.5, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 1 }}>
                    {patient?.petSpecies} • {patient?.petBreed || 'MIXED'} • {patient?.petGender || '??'} • {calculateAge(patient?.petBirthdate || petDetails?.dob)} • {soapData.objWeight || patient.petWeight ? `${soapData.objWeight || patient.petWeight} KG` : 'WEIGH REQUIRED'} • {patient?.petIsNeutered ? 'FIXED' : 'INTACT'}
                    {(() => { const a = patient?.petAllergies || patient?.allergies || ''; return a.trim().length > 0 && a.toUpperCase() !== 'NONE'; })() ? (
                        <Box component="span" sx={{ bgcolor: '#D32F2F', color: 'white', px: 0.8, py: 0.1, borderRadius: 0.5, fontSize: '0.55rem', fontWeight: 1000, ml: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            ⚠️ {(patient?.petAllergies || patient?.allergies || '').toUpperCase()} ALERT
                        </Box>
                    ) : (
                        <Box component="span" sx={{ opacity: 0.5, fontSize: '0.55rem', fontWeight: 1000, ml: 1 }}>
                            ● NO ALLERGIES
                        </Box>
                    )}
                </Typography>
            </Box>
            <Button 
              autoFocus 
              variant="outlined" 
              onClick={() => setFullscreenField(null)} 
              sx={{ fontWeight: 1000, color: COLORS.brand, borderColor: COLORS.brand, borderRadius: 2 }}
            >
              EXIT {fullscreenField?.includes('obj') ? 'OBJECTIVE' : fullscreenField?.toUpperCase()}
            </Button>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 10, maxWidth: 1200, mx: 'auto', width: '100%' }}>
          <Typography variant="h3" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.brand, mb: 4, opacity: 0.5 }}>
            {fullscreenField?.includes('obj') ? 'OBJECTIVE' : fullscreenField?.toUpperCase()}
          </Typography>

          {/* Show vitals grid + structured exam checklist when Zen-expanding the Objective section */}
          {fullscreenField === 'objectiveNotes' && (
            <>
              <VitalsGrid
                soapData={soapData}
                updateSoap={updateSoap}
                getTriageLevel={getTriageLevel}
                renderHistoricalLabel={renderHistoricalLabel}
              />
              <PhysicalExamChecklist
                examData={soapData.objectiveExam}
                onChange={(updated) => updateSoap('objectiveExam', updated)}
                onMarkAllNormal={() => applyTemplate('wnl')}
                disabled={lockedServices.has('medical')}
              />
              {labResultsJSX}
            </>
          )}

          {/* Show diagnostic bridge when Zen-expanding the Assessment section */}
          {/* T4.110: Zen Focus Assessment — buttons only; clicking opens the AI drawer overlay */}
          {fullscreenField === 'assessment' && (
            <DiagnosticBridge
              soapData={soapData}
              llmEnabled={llmConfig.enabled && !!llmConfig.workerUrl}
              llmLoading={llmLoading}
              llmMessages={llmMessages}
              onAnalyze={() => { runAssistiveDiagnosis(); setDiagnosticOpen(true); }}
              onAskAI={runLlmDiagnosis}
              onResetAndAskAI={handleResetAndAskAI}
              onToggleAIPanel={handleToggleAIPanel}
              isAIPanelOpen={isAIDrawerOpen}
            />
          )}

          {fullscreenField !== 'objectiveNotes' && (
            <TextField
              autoFocus multiline fullWidth variant="standard"
              placeholder={ZEN_PLACEHOLDERS[fullscreenField] || "Enter clinical notes..."}
              value={soapData[fullscreenField] || ''}
              onChange={(e) => updateSoap(fullscreenField, e.target.value)}
              InputProps={{
                disableUnderline: true,
                sx: { fontSize: '2.5rem', fontFamily: FONT, fontWeight: 500, lineHeight: 1.4, color: COLORS.brand }
              }}
            />
          )}
        </Box>
      </Dialog>

      {/* 🏛️ THE 'GOD-VIEW' UNIFIED CLINICAL COMMAND CENTER ── */}
      <Dialog 
        fullScreen open={isUnifiedZen} onClose={() => setIsUnifiedZen(false)} 
        TransitionComponent={Transition} PaperProps={{ sx: { bgcolor: '#FDFCFB', display: 'flex', flexDirection: 'column' } }}
      >
        {/* --- 🆕 LEGACY IMMERSION HEADER --- */}
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)', bgcolor: 'white', flexShrink: 0 }}>
            <Box>
                <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.brand, letterSpacing: -1, lineHeight: 1, mb: 0.5 }}>
                    {patient?.petName?.toUpperCase() || 'UNKNOWN PATIENT'}
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.brand, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                    {patient?.petSpecies} • {patient?.petBreed || 'MIXED BREED'} • {patient?.petGender || 'UNKNOWN'} • {calculateAge(patient?.petBirthdate || petDetails?.dob)} • {soapData.objWeight || patient.petWeight ? `${soapData.objWeight || patient.petWeight} KG` : 'WEIGH REQUIRED'} • {patient?.petIsNeutered ? 'FIXED' : 'INTACT'} • {patient?.color || patient?.petColor || petDetails?.color || 'N/A'}
                    {(() => { const a = patient?.petAllergies || patient?.allergies || ''; return a && a.trim().length > 0 && a.toUpperCase() !== 'NONE'; })() ? (
                        <Box component="span" sx={{ bgcolor: '#D32F2F', color: 'white', px: 1, py: 0.2, borderRadius: 0, fontSize: '0.6rem', fontWeight: 1000, ml: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            ⚠️ ALLERGY ALERT: {(patient?.petAllergies || patient?.allergies || '').toUpperCase()}
                        </Box>
                    ) : (
                        <Box component="span" sx={{ opacity: 0.5, fontSize: '0.6rem', fontWeight: 1000, ml: 1 }}>
                            ● NO ALLERGIES DISCLOSED
                        </Box>
                    )}
                </Typography>
            </Box>
            <Button 
                variant="contained" 
                onClick={() => setIsUnifiedZen(false)}
                sx={{ bgcolor: '#3E2723', color: 'white', borderRadius: 50, px: 4, py: 1, fontWeight: 1000, '&:hover': { bgcolor: '#2D1D1B' } }}
            >
                EXIT GOD-VIEW
            </Button>
        </Box>

        {/* T4.110: God View 3-column layout — SOAP grid (flex 7) + AI panel (flex 3).
            AI panel is always visible, no close button (variant='column'). */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'row', bgcolor: '#FFF' }}>
          {/* Left ~70%: SOAP Grid */}
          <Box sx={{ flex: 7, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* T4.158: Intake notes removed — subjective is now pre-populated from patient notes */}
            <SoapGrid
              soapData={soapData}
              updateSoap={updateSoap}
              setFullscreenField={setFullscreenField}
              getTriageLevel={getTriageLevel}
              renderHistoricalLabel={renderHistoricalLabel}
              runAssistiveDiagnosis={runAssistiveDiagnosis}
              assistiveText={assistiveText}
              diagnosticOpen={diagnosticOpen}
              setDiagnosticOpen={setDiagnosticOpen}
              SoapQuadrant={SoapQuadrant}
              VitalsGrid={VitalsGrid}
              DiagnosticBridge={DiagnosticBridge}
              showVaccineForm={showVaccineForm}
              vaccineFormNode={vaccineFormJSX}
              labResultsNode={labResultsJSX}
              showDraftSave={!lockedServices.has('medical')}
              draftSaveNode={draftSaveJSX}
              followUpNode={followUpJSX}
              canToggleVaccine={!showVaccineForm && !isRecordLocked}
              onManualVaccineToggle={() => setManualVaccineOverride(true)}
              vaccineProducts={vaccineProducts}
              onAddVaccineProduct={handleAddVaccineProduct}
              llmEnabled={llmConfig.enabled && !!llmConfig.workerUrl}
              llmLoading={llmLoading}
              llmMessages={llmMessages}
              onAskAI={runLlmDiagnosis}
              onResetAndAskAI={handleResetAndAskAI}
              onToggleAIPanel={() => {}}
              isAIPanelOpen={true}
              onMarkAllNormal={() => applyTemplate('wnl')}
              disabled={lockedServices.has('medical')}
              diagnosisCatalog={diagnosisCatalog}
              patientSpecies={patient?.petSpecies || ''}
              onAddCustomDiagnosis={() => setAddCustomDxOpen(true)}
            />
          </Box>

          {/* Right ~30%: Persistent AI Panel — always visible, no close button */}
          <Box sx={{
            flex: 3,
            minWidth: 280,
            maxWidth: 460,
            borderLeft: `3px solid ${COLORS.grooming}`,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#FDFCFB',
          }}>
            <ClinicalAIPanel
              variant="column"
              soapData={soapData}
              assistiveText={assistiveText}
              diagnosticOpen={diagnosticOpen}
              onAnalyze={() => { runAssistiveDiagnosis(); setDiagnosticOpen(true); }}
              onDismissRuleBased={() => setDiagnosticOpen(false)}
              llmEnabled={llmConfig.enabled && !!llmConfig.workerUrl}
              llmLoading={llmLoading}
              llmMessages={llmMessages}
              llmError={llmError}
              llmFollowUpInput={llmFollowUpInput}
              onAskAI={runLlmDiagnosis}
              onLlmFollowUpChange={setLlmFollowUpInput}
              onLlmFollowUp={handleLlmFollowUp}
              onResetAndAskAI={handleResetAndAskAI}
              onRetry={handleLlmRetry}
              onClose={null}
              petName={patient?.petName}
            />
          </Box>
        </Box>
      </Dialog>

      {/* Draft-save toast — non-blocking feedback for save success/error */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast(prev => ({ ...prev, open: false }))}
          sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold', boxShadow: 3 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>

      {/* T4.110: AI Clinical Reasoning Drawer — right-anchored overlay (default view).
          Temporary variant means it renders above content without pushing layout.
          EMRDrawer and AI Drawer are mutually exclusive in practice — no z-index conflict. */}
      <Drawer
        anchor="right"
        open={isAIDrawerOpen}
        onClose={() => setIsAIDrawerOpen(false)}
        variant="temporary"
        sx={{ zIndex: 1400 }}
        PaperProps={{
          sx: {
            width: 420,
            borderRadius: 0,
            border: `3px solid ${COLORS.grooming}`,
            borderRight: 'none',
            boxShadow: `-6px 0 0 ${COLORS.grooming}`,
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <ClinicalAIPanel
          variant="drawer"
          soapData={soapData}
          assistiveText={assistiveText}
          diagnosticOpen={diagnosticOpen}
          onAnalyze={() => { runAssistiveDiagnosis(); setDiagnosticOpen(true); }}
          onDismissRuleBased={() => setDiagnosticOpen(false)}
          llmEnabled={llmConfig.enabled && !!llmConfig.workerUrl}
          llmLoading={llmLoading}
          llmMessages={llmMessages}
          llmError={llmError}
          llmFollowUpInput={llmFollowUpInput}
          onAskAI={runLlmDiagnosis}
          onLlmFollowUpChange={setLlmFollowUpInput}
          onLlmFollowUp={handleLlmFollowUp}
          onResetAndAskAI={handleResetAndAskAI}
          onRetry={handleLlmRetry}
          onClose={() => setIsAIDrawerOpen(false)}
          petName={patient?.petName}
        />
      </Drawer>

      {/* T3.1: EMR History slide-over — read-only review of pet's full medical records */}
      <EMRDrawer
        open={emrOpen}
        onClose={() => setEmrOpen(false)}
        history={history}
        petName={patient?.petName}
        petSpecies={patient?.petSpecies}
        appointmentId={patient?.id}
      />

      <Dialog
        open={Boolean(signOffConfirm)}
        onClose={() => setSignOffConfirm(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 0,
            border: `2px solid ${COLORS.accent}`,
            boxShadow: `8px 8px 0px ${COLORS.accent}`,
          },
        }}
      >
        {signOffConfirm && (
          <>
            <DialogTitle sx={{
              bgcolor: COLORS.cream,
              color: COLORS.brand,
              fontWeight: 900,
              fontFamily: FONT,
              fontSize: '1rem',
              textTransform: 'uppercase',
              letterSpacing: 1,
              borderBottom: `2px solid ${COLORS.accent}`,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}>
              <WarningAmberIcon sx={{ color: '#ED6C02' }} />
              {signOffConfirm.title}
            </DialogTitle>
            <DialogContent sx={{ pt: 2.5, pb: 2, bgcolor: COLORS.formBg }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: COLORS.brand, mb: 1.5 }}>
                {signOffConfirm.message}
              </Typography>
              {signOffConfirm.warnings.length > 0 && (
                <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
                  {signOffConfirm.warnings.map((w, i) => (
                    <Typography component="li" key={i} sx={{ fontSize: '0.85rem', color: COLORS.accent, mb: 0.5, fontWeight: 600 }}>
                      {w}
                    </Typography>
                  ))}
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ p: 2, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
              <Button
                onClick={signOffConfirm.onConfirm}
                sx={{
                  fontWeight: 900,
                  color: COLORS.accent,
                  border: `2px solid ${COLORS.accent}`,
                  borderRadius: 0,
                  fontFamily: FONT,
                  px: 2.5,
                  fontSize: '0.75rem',
                  '&:hover': { bgcolor: 'rgba(93, 64, 55, 0.05)' },
                }}
              >
                Sign Off Anyway
              </Button>
              <Button
                onClick={() => setSignOffConfirm(null)}
                variant="contained"
                sx={{
                  fontWeight: 900,
                  borderRadius: 0,
                  fontFamily: FONT,
                  px: 3,
                  fontSize: '0.75rem',
                  bgcolor: COLORS.cta,
                  border: `2px solid ${COLORS.ctaHover}`,
                  boxShadow: '4px 4px 0px rgba(216,67,21,0.2)',
                  '&:hover': { bgcolor: COLORS.ctaHover, boxShadow: '2px 2px 0px rgba(216,67,21,0.2)' },
                }}
              >
                Go Back and Complete
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Unsaved notes close confirmation */}
      <Dialog open={closeConfirmOpen} onClose={() => setCloseConfirmOpen(false)}
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.accent}`, boxShadow: `6px 6px 0px ${COLORS.accent}` } }}>
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '1rem', color: COLORS.brand, bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`, textTransform: 'uppercase', letterSpacing: 1 }}>
          Unsaved Clinical Notes
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, pb: 2, bgcolor: COLORS.formBg }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: COLORS.brand }}>
            You have unsaved clinical notes. Use "Save Draft" in the Plan section to preserve them.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
          <Button onClick={() => { setCloseConfirmOpen(false); doClose(); }}
            sx={{ fontWeight: 900, color: COLORS.danger, border: `2px solid ${COLORS.danger}`, borderRadius: 0, fontFamily: FONT, px: 2.5, fontSize: '0.75rem' }}>
            Discard & Close
          </Button>
          <Button onClick={() => setCloseConfirmOpen(false)} variant="contained"
            sx={{ fontWeight: 900, borderRadius: 0, fontFamily: FONT, px: 3, fontSize: '0.75rem', bgcolor: COLORS.cta, border: `2px solid ${COLORS.ctaHover}`, '&:hover': { bgcolor: COLORS.ctaHover } }}>
            Keep Editing
          </Button>
        </DialogActions>
      </Dialog>

      {/* Allergen safety warning */}
      <Dialog open={!!allergenConfirm} onClose={() => setAllergenConfirm(null)}
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.danger}`, boxShadow: `6px 6px 0px ${COLORS.danger}` } }}>
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '1rem', color: COLORS.danger, bgcolor: '#FFEBEE', borderBottom: `2px solid ${COLORS.danger}`, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon sx={{ color: COLORS.danger }} /> Allergen Match Detected
        </DialogTitle>
        {allergenConfirm && (
          <DialogContent sx={{ pt: 2.5, pb: 2, bgcolor: COLORS.formBg }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: COLORS.brand, mb: 1 }}>
              Product: {allergenConfirm.productName}
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', color: COLORS.danger, fontWeight: 800, mb: 0.5 }}>
              Matching allergen(s): {allergenConfirm.matchingTags}
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', color: COLORS.accent, mb: 1 }}>
              Patient allergies: {allergenConfirm.patientAllergies}
            </Typography>
            <Typography sx={{ fontSize: '0.8rem', color: COLORS.textSecondary, fontStyle: 'italic' }}>
              This product contains an allergen flagged for this patient.
            </Typography>
          </DialogContent>
        )}
        <DialogActions sx={{ p: 2, bgcolor: '#FFEBEE', borderTop: `2px solid ${COLORS.danger}` }}>
          <Button onClick={() => setAllergenConfirm(null)}
            sx={{ fontWeight: 900, borderRadius: 0, fontFamily: FONT, px: 3, fontSize: '0.75rem', bgcolor: COLORS.cta, color: 'white', border: `2px solid ${COLORS.ctaHover}`, '&:hover': { bgcolor: COLORS.ctaHover } }}>
            Cancel
          </Button>
          <Button onClick={allergenConfirm?.onConfirm}
            sx={{ fontWeight: 900, color: COLORS.danger, border: `2px solid ${COLORS.danger}`, borderRadius: 0, fontFamily: FONT, px: 2.5, fontSize: '0.75rem' }}>
            Add Anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
