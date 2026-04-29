import React, { useState, useEffect, useRef, useMemo } from 'react';
import './ClinicalWorkspace.css';
import { resolveTieredPrice } from '../utils/resolveTieredPrice';
import { buildVaccineKeywords } from '../utils/vaccineConstants';
import { useVaccineCatalog } from '../hooks/useVaccineCatalog';
import { ZEN_PLACEHOLDERS } from '../utils/soapConstants';
import {
  Dialog, Slide, AppBar, Toolbar, IconButton, Typography, Button,
  Box, Paper, Avatar, Chip, TextField, MenuItem,
  Grid, // MUI v6 Grid
  Stack, Collapse, Tooltip, InputBase, Switch,
  Autocomplete, Alert, Snackbar, CircularProgress,
  DialogTitle, DialogContent, DialogContentText, DialogActions,
  Drawer,
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
  NavigateBefore as NavigateBeforeIcon,
  NavigateNext as NavigateNextIcon,
  Pets as PetsIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';
import { doc, collection, Timestamp, addDoc, updateDoc, getDoc, query, where, orderBy, getDocs, arrayUnion, writeBatch, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useInventory } from '../features/Inventory/hooks/useInventory';
import { calculatePulseMetrics, makePulseEventId, createPulseEvent } from '../utils/pulseUtils';
import { useClinicSettings } from '../hooks/useClinicSettings';
import { useUser } from '../context/UserContext';
import { chatWithHistory, buildUserMessage, DEFAULT_CLINICAL_SYSTEM_PROMPT } from '../utils/llmService';
import { sendPushNotification } from '../utils/sendPushNotification';

// Design Tokens
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import SoapGrid from './SoapGrid';
import ClinicalAIPanel from './ClinicalAIPanel';
import EMRDrawer from './EMRDrawer';
import { ServiceProgressCard } from './ServiceProgressCard';
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
    { label: 'WT (kg)',     value: soapData.objWeight,  field: 'objWeight',  icon: '\u2696\uFE0F', status: 'normal' },
    { label: 'TEMP (\u00B0C)', value: soapData.objTemp, field: 'objTemp',    icon: '\uD83C\uDF21\uFE0F', status: getTriageLevel('temp', soapData.objTemp) },
    { label: 'HR (bpm)',    value: soapData.objHR,      field: 'objHR',      icon: '\u2764\uFE0F', status: getTriageLevel('hr', soapData.objHR) },
    { label: 'RR (rpm)',    value: soapData.objRR,      field: 'objRR',      icon: '\uD83E\uDEC1', status: getTriageLevel('rr', soapData.objRR) },
    { label: 'CRT (sec)',   value: soapData.objCRT,     field: 'objCRT',     icon: '\u23F1\uFE0F', status: getTriageLevel('crt', soapData.objCRT) },
    { label: 'BCS (1-9)',   value: soapData.bcs,        field: 'bcs',        icon: '\uD83D\uDC3E', status: 'normal' },
    { label: 'PAIN (0-10)', value: soapData.painScale,  field: 'painScale',  icon: '\uD83E\uDE79', status: getTriageLevel('pain', soapData.painScale) },
  ];

  const triageColor = (status) =>
    status === 'critical' ? '#D32F2F' :
    status === 'warning'  ? '#FF8F00' :
    COLORS.brand;

  const triageBorder = (status) =>
    status === 'critical' ? '2px solid #D32F2F' :
    status === 'warning'  ? '2px solid #FF8F00' :
    '2px solid rgba(0,0,0,0.1)';

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
              onChange={(e) => updateSoap(v.field, e.target.value)}
              inputProps={{ 'aria-label': v.label }}
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

export default function ClinicalWorkspace({ open, onClose, patient, inventoryList, servicesList, departments, vetsList, groupAppointments = [], onSwitchPatient }) {
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

  const [soapData, setSoapData] = useState({
    subjective: '', objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '', bcs: 5, painScale: 0, objectiveNotes: '',
    assessment: '', prognosis: 'Good', plan: '', recheckIn: '1 Week', patientStatus: 'Stable', nextVisit: ''
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

  // T3.118: Amendment dialog state — inline form extracted to shared AmendmentDialog
  const [amendDialogOpen, setAmendDialogOpen] = useState(false);

  // C1: Structured vaccine administration records — array for multi-vaccine-per-visit
  const [vaccineAdministrations, setVaccineAdministrations] = useState([{ ...EMPTY_VAX }]);
  // T3.2: Manual override — lets the vet show the vaccine form on non-vaccination visits
  const [manualVaccineOverride, setManualVaccineOverride] = useState(false);
  // T3.1: EMR slide-over drawer state
  const [emrOpen, setEmrOpen] = useState(false);

  // Phase 3 — Group navigation: confirmation dialog when switching pets with unsaved SOAP data.
  // pendingSwitchTarget holds the appointment row the vet clicked; the dialog prompts Save/Discard/Cancel.
  const [pendingSwitchTarget, setPendingSwitchTarget] = useState(null);

  // C3: Lab results — array of { testName, result, status, notes }
  const [labResults, setLabResults] = useState([]);

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

  // Keep refs in sync so the unmount cleanup always sees the latest values
  useEffect(() => { treatmentCartRef.current = treatmentCart; }, [treatmentCart]);
  useEffect(() => { isRecordLockedRef.current = isRecordLocked; }, [isRecordLocked]);

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
            // T3.70: Subjective starts empty — intake context is shown in the read-only
            // context box above this field (via intakeClientNotes/intakeStaffNotes props).
            subjective: '',
            objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '2',
            bcs: 5, painScale: 0,
            objectiveNotes: '', assessment: '', prognosis: 'Good', recheckIn: '1 Week',
            patientStatus: 'Stable', plan: '', nextVisit: '',
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
              objCRT: draft.objCRT || '2',
              bcs: draft.bcs ?? 5,
              painScale: draft.painScale ?? 0,
              objectiveNotes: draft.objectiveNotes || '',
              assessment: draft.assessment || '',
              prognosis: draft.prognosis || 'Good',
              patientStatus: draft.patientStatus || 'Stable',
              plan: draft.plan || '',
              recheckIn: draft.recheckIn || '1 Week',
              nextVisit: draft.nextVisit || '',
            });
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
                price: resolvedPrice, qty: 1, isDrug: false, isBase: true,
                isDiscountable: svcDef?.isScPwdEligible !== false,
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
                    isBase: false, isAutoBundled: true, instructions: ''
                });
                // Track the first linked vaccine product for auto-fill below
                if (!firstVaccineLinkedItem && linkedInv.batches?.length > 0) {
                    const isVaccineProduct = vaccineKeywords.some(kw =>
                        (linkedInv.itemName || '').toLowerCase().includes(kw)
                    );
                    if (isVaccineProduct) firstVaccineLinkedItem = linkedInv;
                }
            });
        });

        // T2.474 / T2.22: Pre-fill vaccine form from the first linked vaccine product's FIFO batch.
        const isVax = vaccineKeywords.some(kw =>
            (patient?.services || []).some(s => (s.name || '').toLowerCase().includes(kw))
        );
        if (isVax && firstVaccineLinkedItem) {
            const batch = firstVaccineLinkedItem.batches[0];
            setVaccineAdministrations(prev => {
                const updated = [...prev];
                if (updated[0]) {
                    updated[0] = {
                        ...updated[0],
                        manufacturer: updated[0].manufacturer || firstVaccineLinkedItem.manufacturer || '',
                        lotNumber: updated[0].lotNumber || batch.batchNumber || batch.lotNumber || '',
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
  
  const handleCloseRequest = () => {
    const doClose = () => {
      // Use refs (not state) to avoid stale closure captures. hasReleasedRef prevents
      // double-release when this runs before the unmount cleanup fires.
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

    if (isDirty) {
      if (window.confirm("You have unsaved clinical notes. Use 'Save Draft' in the Plan section to preserve them.\n\nClose anyway and discard changes?")) doClose();
    } else {
      doClose();
    }
  };

  const updateSoap = (field, value) => { setSoapData(prev => ({ ...prev, [field]: value })); setIsDirty(true); };

  const applyTemplate = (type) => {
    switch (type) {
      case 'wnl': {
        // Inject species-appropriate baseline vitals alongside full-body WNL notes
        const isDog = (patient?.petSpecies === 'Canine' || patient?.petSpecies === 'Dog');
        setSoapData(prev => ({
          ...prev,
          objectiveNotes: "MM: Pink/Moist, CRT <2s\nHydration: Normal\nResp Effort: Normal\nAbdomen: Soft/Non-painful\nDental: Grade 0 (No calc/gingivitis)\n\nGeneral Appearance: WNL\nEENT: WNL\nCardiovascular: WNL\nRespiratory: WNL\nGastrointestinal: WNL\nMusculoskeletal: WNL\nIntegumentary (Skin): WNL\nLymph Nodes: WNL\nNeurological: WNL\nUrogenital: WNL",
          objTemp: isDog ? '38.5' : '38.6',
          objHR: isDog ? '100' : '140',
          objRR: isDog ? '20' : '24',
          objCRT: '<2',
          bcs: 5,
          painScale: 0,
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
    const combinedNotes = (soapData.subjective + " " + soapData.objectiveNotes).toLowerCase();
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
    objective: soapData.objectiveNotes || '',
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

  /** Opens or closes the AI side panel (drawer in default view, no-op in God View). */
  const handleToggleAIPanel = (open) => setIsAIDrawerOpen(open);

  // --- 3. TREATMENT PLAN LOGIC (THE BRIDGE) ---
  const handleAddRx = async (item) => {
    if (!item) return;

    // Block out-of-stock products
    if (item.stock !== undefined) {
        const netAvailable = (item.stock || 0) - (item.reserved || 0);
        if (netAvailable <= 0) {
            return alert("This product is out of stock and cannot be added.");
        }
    }

    // T2.175: Allergen safety check — warn if any of the product's allergenTags match a word
    // in the patient's petAllergies string. Case-insensitive word-boundary match.
    if (item.allergenTags && item.allergenTags.length > 0) {
      const patientAllergies = (patient?.petAllergies || patient?.allergies || '').toLowerCase();
      if (patientAllergies.length > 0 && patientAllergies !== 'none') {
        const matchingTags = item.allergenTags.filter(tag => {
          const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`\\b${escaped}\\b`, 'i').test(patientAllergies);
        });
        if (matchingTags.length > 0) {
          const proceed = window.confirm(
            `ALLERGEN MATCH DETECTED\n\n` +
            `Product: ${item.itemName || item.name}\n` +
            `Matching allergen(s): ${matchingTags.join(', ')}\n` +
            `Patient allergies: ${patient?.petAllergies || patient?.allergies}\n\n` +
            `This product contains an allergen flagged for this patient. ` +
            `Add anyway?`
          );
          if (!proceed) return;
        }
      }
    }

    const isMedicine = !!item.isMedicine; // 🩺 THE FORENSIC FLAG

    // Deduplicate: if item already in cart, increment qty instead of adding duplicate
    const existingIdx = treatmentCart.findIndex(rx => rx.id === item.id);
    if (existingIdx >= 0) {
        handleUpdateQty(existingIdx, 1);
        return;
    }

    const itemObj = {
      type: item.stock !== undefined ? 'product' : 'service',
      id: item.id,
      name: item.itemName || item.name,
      price: item.stock !== undefined
          ? (item.price || 0)
          : resolveTieredPrice(item, parseFloat(soapData.objWeight) || (patient?.petWeight ? parseFloat(patient.petWeight) : null)),
      qty: 1,
      isDrug: isMedicine,
      isDispensed: false, // Default to Clinic Admin
      sig: { dose: '1', frequency: 'SID', duration: '1', unit: item.unit || 'unit', route: 'SQ' },
      instructions: ''
    };

    // Step 4 (T3.110): Auto-populate instructions for drug items from sig defaults.
    // Gives the vet a readable starting point (e.g. "1 unit once daily for 1 day (SQ)")
    // that they can overwrite before signing off.
    if (isMedicine) {
      const s = itemObj.sig;
      const freqMap = {
        SID: 'once daily',
        BID: 'twice daily',
        TID: 'three times daily',
        QID: 'four times daily',
        EOD: 'every other day',
        PRN: 'as needed',
      };
      itemObj.instructions = `${s.dose} ${s.unit} ${freqMap[s.frequency] || s.frequency} for ${s.duration} day${s.duration !== '1' ? 's' : ''} (${s.route})`;
    }

    setTreatmentCart(prev => [...prev, itemObj]);
    setIsDirty(true);

    // T2.22: If this is a vaccine product with batch data, auto-fill a new vaccine
    // administration row with manufacturer and lot number from the FIFO batch.
    if (itemObj.type === 'product' && item.batches?.length > 0) {
        const isVaccineItem = vaccineKeywords.some(kw =>
            (item.itemName || item.name || '').toLowerCase().includes(kw)
        );
        if (isVaccineItem) {
            const batch = item.batches[0];
            setVaccineAdministrations(prev => {
                // Find an unfilled row first; if all filled, append a new one
                const emptyIdx = prev.findIndex(v => !v.vaccineName);
                const updated = [...prev];
                if (emptyIdx >= 0) {
                    updated[emptyIdx] = {
                        ...updated[emptyIdx],
                        manufacturer: updated[emptyIdx].manufacturer || item.manufacturer || '',
                        lotNumber: updated[emptyIdx].lotNumber || batch.batchNumber || batch.lotNumber || '',
                    };
                } else {
                    updated.push({
                        ...EMPTY_VAX,
                        manufacturer: item.manufacturer || '',
                        lotNumber: batch.batchNumber || batch.lotNumber || '',
                    });
                }
                return updated;
            });
        }
    }

    // --- SOFT-RESERVE TRIGGER ---
    if (itemObj.type === 'product' && reserveStock) {
        try {
            await reserveStock(itemObj.id, 1);
        } catch (e) {
            console.error(`[ClinicalWorkspace] Stock reservation failed for ${itemObj.name}:`, e);
            alert(`Warning: Could not reserve stock for ${itemObj.name}. The item was added but may not be available at checkout.`);
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
      const newServices = (patient.services || []).map(s => ({
        ...s,
        serviceStatus: s.id === svcId ? next : (serviceProgress[s.id] ?? s.serviceStatus ?? 'pending'),
        // T2.107: Record precise timestamps when a service starts and completes.
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
   * Detects if the current visit is vaccine-related by matching booked service names
   * against a known set of vaccine keywords. Drives conditional rendering of the
   * structured Vaccine Details form in the Plan quadrant.
   */
  /** Derives keyword list from the live Firestore catalog so admin-added vaccines are detected. */
  const vaccineKeywords = useMemo(() => buildVaccineKeywords(vaccineCatalog), [vaccineCatalog]);

  // T2.29: Uses services[] array exclusively — no longer reads legacy primaryService string.
  const isVaccinationVisit = useMemo(() => {
    const serviceNames = (patient?.services || []).map(s => (s.name || '').toLowerCase()).join(' ');
    return vaccineKeywords.some(kw => serviceNames.includes(kw));
  }, [patient, vaccineKeywords]);

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

  const hasDrugsInCart = treatmentCart.some(item => item.isDrug);
  const nextRouteStatus = hasDrugsInCart ? "dispensing" : "billing";
  const saveBtnText = hasDrugsInCart ? "Sign & Send to Pharmacy" : "Sign & Send to Cashier";

  const handleSaveConsult = async () => {
    if (isSavingRef.current) return;

    if (lockedServices.has('medical')) {
        return alert("This clinical record has already been signed off. No duplicate records can be created.");
    }

    if (!soapData.assessment || !soapData.plan) {
        return alert("Assessment and Plan are required for legal medical documentation.");
    }
    if (treatmentCart.length === 0) {
        if (!window.confirm("Services & Items is empty. This will create a consult-only record with no billable items.\n\nProceed?")) return;
    }

    // T2.96: Warn if not all services are marked completed
    const incompleteServices = (patient.services || []).filter(svc => svc.id).filter(svc => {
        const status = serviceProgress[svc.id] || 'pending';
        return status !== 'completed';
    });
    if (incompleteServices.length > 0) {
        const names = incompleteServices.map(s => s.name).join(', ');
        if (!window.confirm(
            `INCOMPLETE SERVICES\n\nThe following services have not been marked as completed:\n${names}\n\nProceed with sign-off anyway? The clinical record will be finalized regardless.`
        )) {
            return;
        }
    }

    const dischargeRequired = treatmentCart
        .filter(item => item.isBase && item.type === 'service')
        .some(item => {
            const svcDef = (servicesList || []).find(s => s.id === item.id);
            return svcDef?.dischargePolicy === 'required';
        });

    if (dischargeRequired && soapData.plan.trim().length === 0) {
        return alert("Discharge instructions (Plan field) are required for this visit. At least one booked service has a mandatory discharge policy.");
    }

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
      // Group-visit pet switching (onSwitchPatient) can load siblings that haven't started
      // consult yet. Without this guard, sign-off would skip the arrived→in-consult
      // transition — corrupting statusHistory, pulse timeline, timeStarted, and consult
      // duration metrics. Uses fresh server-side status (not stale patient prop).
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
                visitGroupId: patient.visitGroupId,
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
        diagnosis: soapData.assessment || "Clinical Visit",
        treatment: soapData.plan,
        soap: {
            subjective: soapData.subjective,
            objective: soapData.objectiveNotes,
            assessment: soapData.assessment,
            prognosis: soapData.prognosis,
            plan: soapData.plan,
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
                price: item.price,
                isDrug: !!item.isDrug,
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
            diagnosis: soapData.assessment || 'Clinical Visit',
            instructions: soapData.plan || '',
            medications: treatmentCart
                .filter(item => item.isDrug)
                .map(item => ({
                    name: item.name,
                    qty: item.qty,
                    instructions: item.instructions || 'Use as directed',
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
            labResults: labResults.filter(l => l.testName).map(l => ({
                testName: l.testName,
                result: l.result,
                status: l.status,
                notes: l.notes || '',
            }))
        } : {}),
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
              notes: `Follow-up from visit on ${new Date().toLocaleDateString()}. Diagnosis: ${soapData.assessment || 'N/A'}. Recheck: ${soapData.recheckIn || 'N/A'}.`,
              isFollowUp: true,
              parentAppointmentId: patient.id,
              parentRecordId: recordRef.id,
              parentDiagnosis: soapData.assessment || 'N/A',
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
        visitGroupId: patient.visitGroupId,
        sentBy: vetName,
      });

      // Set ref SYNCHRONOUSLY so unmount cleanup sees it immediately, before React
      // schedules the state update and re-render that follows.
      isRecordLockedRef.current = true;
      setIsRecordLocked(true);
      setLoading(false);
      setIsDirty(false);
      onClose();
      alert(`✅ ENCOUNTER FINALIZED!\n\nClinical record signed by ${vetName}.\nPatient moved to ${hasDrugsInCart ? 'PHARMACY' : 'CHECKOUT'}.\nTotal: ₱${visitTotal.toLocaleString()}`);
    } catch (error) {
        console.error('[ClinicalWorkspace.handleSaveConsult]:', error.message);
        isSavingRef.current = false;
        setLoading(false);
        alert("🚨 Critical Save Error: " + error.message);
    }
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
            objWeight: soapData.objWeight,
            objTemp: soapData.objTemp,
            objHR: soapData.objHR,
            objRR: soapData.objRR,
            objCRT: soapData.objCRT,
            bcs: soapData.bcs,
            painScale: soapData.painScale,
            assessment: soapData.assessment,
            prognosis: soapData.prognosis,
            plan: soapData.plan,
            recheckIn: soapData.recheckIn,
            patientStatus: soapData.patientStatus,
            nextVisit: soapData.nextVisit,
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
      objCRT: d.objCRT || '2',
      bcs: d.bcs ?? 5,
      painScale: d.painScale ?? 0,
      objectiveNotes: d.objectiveNotes || '',
      assessment: d.assessment || '',
      prognosis: d.prognosis || 'Good',
      patientStatus: d.patientStatus || 'Stable',
      plan: d.plan || '',
      recheckIn: d.recheckIn || '1 Week',
      nextVisit: d.nextVisit || '',
    });
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


  // --- Phase 3: Group Navigation Handlers ---

  /**
   * Requests a pet switch. If there are unsaved SOAP changes (isDirty), opens the
   * confirmation dialog so the vet can choose to Save, Discard, or Cancel.
   * If the current record is clean, switches immediately.
   */
  const handleRequestPetSwitch = (targetAppointment) => {
    if (!onSwitchPatient || targetAppointment.id === patient?.id) return;
    if (isDirty) {
      setPendingSwitchTarget(targetAppointment);
    } else {
      onSwitchPatient(targetAppointment);
    }
  };

  /** Save current draft, then switch to the pending target. */
  const handleSaveThenSwitch = async () => {
    const saved = await handleSaveDraft();
    if (!saved) return;
    const target = pendingSwitchTarget;
    setPendingSwitchTarget(null);
    if (target && onSwitchPatient) onSwitchPatient(target);
  };

  /** Discard dirty state and switch immediately. */
  const handleDiscardThenSwitch = () => {
    const target = pendingSwitchTarget;
    setPendingSwitchTarget(null);
    setIsDirty(false);
    if (target && onSwitchPatient) onSwitchPatient(target);
  };

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
        category: 'Pharmacy/Products',
        isLow: netAvailable <= 5,
        isOut: netAvailable <= 0,
      };
    }),
    ...(servicesList || []).filter(s => !s.isArchived).map(s => ({
      ...s,
      label: s.name,
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

  const labResultsJSX = (
    <Box sx={{ mb: 2, flexShrink: 0 }}>
      <Button size="small" variant="text"
        onClick={() => setLabResults(prev => [...prev, { testName: '', result: '', status: 'normal', notes: '' }])}
        sx={{ fontWeight: 900, fontSize: '0.65rem', textTransform: 'uppercase', color: '#1565C0', mb: 1 }}>
        + Add Lab Result
      </Button>
      {labResults.map((lab, idx) => (
        <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField size="small" placeholder="Test Name" value={lab.testName}
            onChange={(e) => {
              const updated = [...labResults];
              updated[idx] = { ...updated[idx], testName: e.target.value };
              setLabResults(updated);
            }}
            sx={{ flex: 2, bgcolor: 'white' }} />
          <TextField size="small" placeholder="Result" value={lab.result}
            onChange={(e) => {
              const updated = [...labResults];
              updated[idx] = { ...updated[idx], result: e.target.value };
              setLabResults(updated);
            }}
            sx={{ flex: 2, bgcolor: 'white' }} />
          <TextField size="small" select value={lab.status}
            onChange={(e) => {
              const updated = [...labResults];
              updated[idx] = { ...updated[idx], status: e.target.value };
              setLabResults(updated);
            }}
            sx={{ flex: 1, bgcolor: 'white' }}>
            <MenuItem value="normal">Normal</MenuItem>
            <MenuItem value="abnormal">Abnormal</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
          </TextField>
          <IconButton size="small"
            onClick={() => setLabResults(prev => prev.filter((_, i) => i !== idx))}
            sx={{ color: '#D32F2F' }}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      ))}
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
      const hasDispensableItems = treatmentCart.some(item => item.isDrug);
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
        visitGroupId: patient.visitGroupId,
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

            {/* Service Chips */}
            {(patient?.services || []).slice(0, 3).map((svc, i) => (
              <Chip key={i} label={svc.name || svc.serviceName || 'Service'}
                size="small" sx={{ height: 20, fontSize: '0.58rem', fontWeight: 1000 }} />
            ))}

            {/* Allergy — unified read: petAllergies (canonical) || allergies (legacy) */}
            {(() => {
              const allergyVal = patient?.petAllergies || patient?.allergies || '';
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
                  ? `Rebooked after ${patient.noShowCount} no-show${patient.noShowCount > 1 ? 's' : ''} in the last ${clinicSettings.noShowLinkWindowDays || 30} days`
                  : `${patient.noShowCount} no-show${patient.noShowCount > 1 ? 's' : ''} recorded in the last ${clinicSettings.noShowLinkWindowDays || 30} days`
                }
              >
                <Chip
                  label={`${patient.noShowCount} NO-SHOW${patient.noShowCount > 1 ? 'S' : ''} (${clinicSettings.noShowLinkWindowDays || 30}D)`}
                  size="small"
                  sx={{
                    height: 20, fontSize: '0.56rem', fontWeight: 1000,
                    bgcolor: '#F57C00', color: 'white', cursor: 'help',
                  }}
                />
              </Tooltip>
            )}

            {/* WNL Button */}
            <Button size="small" variant="text" onClick={() => applyTemplate('wnl')}
              sx={{ fontSize: '0.65rem', fontWeight: 800, color: COLORS.brand, minWidth: 'auto', px: 1 }}>
              WNL
            </Button>

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

          {/* --- PHASE 3: MULTI-PET GROUP NAVIGATION BAR ---
              Rendered only when this appointment belongs to a visit group (groupAppointments.length > 1).
              Shows all sibling pets as clickable chips. Clicking a different pet triggers dirty-state
              checking before calling onSwitchPatient. Arrow buttons allow cycling through the group. */}
          {groupAppointments.length > 1 && (() => {
            const currentIdx = groupAppointments.findIndex(a => a.id === patient?.id);
            const safeIdx = currentIdx < 0 ? 0 : currentIdx;

            /** Returns a readable status label for the small status chips. */
            const petStatusLabel = (status) => {
              const map = {
                confirmed: 'CONFIRMED', arrived: 'ARRIVED', 'in-consult': 'IN-CONSULT',
                dispensing: 'DISPENSING', billing: 'BILLING', completed: 'DONE', pending: 'PENDING',
              };
              return map[status] || (status || 'UNKNOWN').toUpperCase();
            };

            /** Returns a background color for the pet status chip. */
            const petStatusBg = (status) => {
              if (status === 'in-consult') return COLORS.medical || '#1565C0';
              if (status === 'arrived') return COLORS.success || '#2E7D32';
              if (status === 'completed') return COLORS.textMuted || '#757575';
              if (status === 'billing') return COLORS.accentWarm || '#E65100';
              if (status === 'dispensing') return '#6A1B9A';
              return COLORS.brand;
            };

            return (
              <Box sx={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 0.75,
                bgcolor: '#F3F0EC',
                borderBottom: `2px solid ${COLORS.border}`,
                overflowX: 'auto',
                minHeight: 44,
              }}>
                {/* Prev arrow */}
                <Tooltip title="Previous Pet">
                  <span>
                    <IconButton
                      size="small"
                      disabled={safeIdx === 0}
                      onClick={() => handleRequestPetSwitch(groupAppointments[safeIdx - 1])}
                      sx={{ color: COLORS.brand, p: 0.25 }}
                    >
                      <NavigateBeforeIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>

                {/* Pet chips */}
                {groupAppointments.map((appt, idx) => {
                  const isCurrent = appt.id === patient?.id;
                  return (
                    <Box
                      key={appt.id}
                      onClick={() => handleRequestPetSwitch(appt)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 1.25,
                        py: 0.4,
                        cursor: isCurrent ? 'default' : 'pointer',
                        bgcolor: isCurrent ? COLORS.accent : 'transparent',
                        border: `2px solid ${isCurrent ? COLORS.accent : COLORS.border}`,
                        borderRadius: 0,
                        boxShadow: isCurrent ? `2px 2px 0 ${COLORS.brand}` : 'none',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                        '&:hover': isCurrent ? {} : { bgcolor: 'rgba(58,190,249,0.12)' },
                      }}
                    >
                      <PetsIcon sx={{ fontSize: 12, color: isCurrent ? '#fff' : COLORS.brand }} />
                      <Typography sx={{
                        fontFamily: FONT,
                        fontSize: '0.72rem',
                        fontWeight: 900,
                        color: isCurrent ? '#fff' : COLORS.brand,
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                        whiteSpace: 'nowrap',
                      }}>
                        {appt.petName || `Pet ${idx + 1}`}
                      </Typography>
                      <Box sx={{
                        ml: 0.5,
                        px: 0.6,
                        py: 0.1,
                        bgcolor: petStatusBg(appt.status),
                        borderRadius: 0,
                      }}>
                        <Typography sx={{
                          fontFamily: FONT,
                          fontSize: '0.55rem',
                          fontWeight: 1000,
                          color: '#fff',
                          letterSpacing: 0.5,
                        }}>
                          {petStatusLabel(appt.status)}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}

                {/* Next arrow */}
                <Tooltip title="Next Pet">
                  <span>
                    <IconButton
                      size="small"
                      disabled={safeIdx === groupAppointments.length - 1}
                      onClick={() => handleRequestPetSwitch(groupAppointments[safeIdx + 1])}
                      sx={{ color: COLORS.brand, p: 0.25 }}
                    >
                      <NavigateNextIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>

                {/* Group progress label */}
                <Typography sx={{
                  ml: 'auto',
                  fontFamily: FONT,
                  fontSize: '0.65rem',
                  fontWeight: 900,
                  color: COLORS.textMuted,
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  Pet {safeIdx + 1} of {groupAppointments.length}
                </Typography>
              </Box>
            );
          })()}

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
          {/* T3.70: Compute intake notes with dual-read fallback for legacy appointments */}
          {(() => {
            const rawClientNotes = patient?.clientNotes || (!patient?.staffNotes ? patient?.notes : '') || '';
            const filteredClientNotes = (
              rawClientNotes === 'Walk-in client' ||
              rawClientNotes.includes('QUICK ADMIT')
            ) ? '' : rawClientNotes;
            const intakeStaffNotes = patient?.staffNotes || '';

            return (
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
                intakeClientNotes={filteredClientNotes}
                intakeStaffNotes={intakeStaffNotes}
                llmEnabled={llmConfig.enabled && !!llmConfig.workerUrl}
                llmLoading={llmLoading}
                llmMessages={llmMessages}
                onAskAI={runLlmDiagnosis}
                onResetAndAskAI={handleResetAndAskAI}
                onToggleAIPanel={handleToggleAIPanel}
                isAIPanelOpen={isAIDrawerOpen}
              />
            );
          })()}
        </Box>

        {/* === SIDEBAR (RIGHT) === */}
        <Box sx={{ flex: 2.5, overflowY: 'auto', p: 3, bgcolor: '#FAF8F5' }}>
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
                            getOptionDisabled={(option) => option.isOut === true}
                            onChange={(event, newValue) => handleAddRx(newValue)}
                            renderOption={(props, option) => (
                                <Box component="li" {...props} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', py: 1 }}>
                                    <Box>
                                        <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: option.isOut ? COLORS.textMuted : 'inherit', display: 'flex', alignItems: 'center' }}>
                                            {option.itemName || option.name}
                                            {option.isMedicine && <MedicationIcon sx={{ fontSize: 14, color: '#D32F2F', ml: 1 }} />}
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

                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {treatmentCart.map((rx, idx) => (
                            <Box key={idx} sx={{ bgcolor: 'white', p: 2, borderRadius: 2, border: `1px solid ${COLORS.borderLight}` }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.85rem', color: COLORS.brand }}>{rx.name}</Typography>
                                    <IconButton size="small" onClick={()=>handleRemoveRx(idx)}><CloseIcon sx={{ fontSize: 14, color: '#D32F2F' }}/></IconButton>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#F5F5F5', borderRadius: 1.5, px: 0.5 }}>
                                        <IconButton size="small" onClick={() => handleUpdateQty(idx, -1)} sx={{ p: 0.5 }}><ContentCutIcon sx={{ fontSize: 14, rotate: '90deg' }} /></IconButton>
                                        <Typography sx={{ fontWeight: 1000, fontSize: '0.85rem' }}>{rx.qty}</Typography>
                                        <IconButton size="small" onClick={() => handleUpdateQty(idx, 1)} sx={{ p: 0.5 }}><AddCircleIcon sx={{ fontSize: 14, color: COLORS.brand }} /></IconButton>
                                    </Box>
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.9rem', color: COLORS.brand }}>₱{(rx.price * rx.qty).toLocaleString()}</Typography>
                                </Box>

                                {/* Step 1 (T3.110): Always-visible dosing instructions for drug items.
                                    Clinical safety: every prescription must have explicit instructions
                                    before the record is signed off — "Use as directed" is inadequate. */}
                                {rx.isDrug && (
                                    <TextField
                                        size="small"
                                        fullWidth
                                        multiline
                                        minRows={1}
                                        maxRows={3}
                                        placeholder="e.g., 1 tab twice daily for 7 days"
                                        value={rx.instructions || ''}
                                        onChange={(e) => handleUpdateRxSig(idx, e.target.value)}
                                        disabled={isRecordLocked}
                                        sx={{
                                            mt: 1,
                                            '& .MuiInputBase-root': {
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                fontFamily: FONT,
                                                borderRadius: 0,
                                                bgcolor: COLORS.rxBg,
                                                border: `1px solid ${COLORS.rxBorder}`,
                                            },
                                            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                        }}
                                        InputProps={{
                                            startAdornment: (
                                                <MedicationIcon sx={{ fontSize: 14, color: COLORS.rxText, mr: 0.5, mt: 0.25 }} />
                                            ),
                                        }}
                                    />
                                )}

                                {/* Step 2 (T3.110): Collapsible instructions for non-drug items.
                                    Collapsed by default to keep sidebar compact — most non-drug
                                    items (shampoos, collars, etc.) don't need dosing notes. */}
                                {!rx.isDrug && (
                                    <>
                                        <Typography
                                            onClick={() => !isRecordLocked && handleUpdateRxField(idx, '_showInstructions', !rx._showInstructions)}
                                            sx={{
                                                mt: 0.75,
                                                fontSize: '0.65rem',
                                                fontWeight: 800,
                                                color: rx.instructions ? COLORS.rxText : COLORS.textMuted,
                                                cursor: isRecordLocked ? 'default' : 'pointer',
                                                fontFamily: FONT,
                                                letterSpacing: '0.05em',
                                                textTransform: 'uppercase',
                                                '&:hover': !isRecordLocked ? { color: COLORS.accent } : {},
                                            }}
                                        >
                                            {rx._showInstructions
                                                ? 'HIDE INSTRUCTIONS'
                                                : (rx.instructions ? `INSTRUCTIONS: ${rx.instructions}` : '+ ADD INSTRUCTIONS')}
                                        </Typography>
                                        <Collapse in={!!rx._showInstructions}>
                                            <TextField
                                                size="small"
                                                fullWidth
                                                placeholder="Optional usage notes"
                                                value={rx.instructions || ''}
                                                onChange={(e) => handleUpdateRxSig(idx, e.target.value)}
                                                disabled={isRecordLocked}
                                                sx={{
                                                    mt: 0.5,
                                                    '& .MuiInputBase-root': {
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        fontFamily: FONT,
                                                        borderRadius: 0,
                                                        bgcolor: COLORS.formBg,
                                                        border: `1px solid ${COLORS.borderLight}`,
                                                    },
                                                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                                }}
                                            />
                                        </Collapse>
                                    </>
                                )}

                                {rx.isBase && (
                                    <TextField
                                        size="small" select fullWidth
                                        value={serviceAttribution[rx.id]?.staffId || ''}
                                        onChange={(e) => {
                                            const vet = (vetsList || []).find(v => v.id === e.target.value);
                                            setServiceAttribution(prev => ({
                                                ...prev,
                                                [rx.id]: { staffId: e.target.value, staffName: vet?.fullName || 'Unknown' },
                                            }));
                                        }}
                                        sx={{ mt: 1, '& .MuiInputBase-root': { fontSize: '0.72rem', fontWeight: 800 } }}
                                        label="Performed By"
                                    >
                                        <MenuItem value="" sx={{ fontSize: '0.8rem', fontStyle: 'italic', color: COLORS.textMuted }}>
                                            — Unassigned —
                                        </MenuItem>
                                        {(vetsList || []).map(v => (
                                            <MenuItem key={v.id} value={v.id} sx={{ fontSize: '0.8rem' }}>
                                                {v.fullName}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                )}
                            </Box>
                        ))}
                    </Stack>
                    
                    {/* DYNAMIC TOTAL CALCULATOR */}
                    {treatmentCart.length > 0 && (
                        <Box sx={{ mt: 3, pt: 2, borderTop: `2px solid ${COLORS.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ fontWeight: 1000, color: COLORS.textMuted, fontSize: '0.75rem', textTransform: 'uppercase' }}>Subtotal</Typography>
                            <Typography sx={{ fontWeight: 1000, color: COLORS.brand, fontSize: '1.2rem' }}>
                                ₱{treatmentCart.reduce((sum, item) => sum + (item.price * item.qty), 0).toLocaleString()}
                            </Typography>
                        </Box>
                    )}
                </Paper>

                {/* T2.97: Per-Service Progress — rendered via shared ServiceProgressCard */}
                {!isRecordLocked && (
                    <ServiceProgressCard
                        services={patient?.services || []}
                        serviceProgress={serviceProgress}
                        onToggle={handleToggleServiceProgress}
                        sx={{ ...glassStyle }}
                    />
                )}

                <Box sx={{ pt: 2 }}>
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
            </Stack>
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
        <AppBar elevation={0} sx={{ position: 'relative', bgcolor: COLORS.banner, borderBottom: `1px solid ${COLORS.bannerBorder}`, py: 1 }}>
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

          {/* Show vitals grid when Zen-expanding the Objective section */}
          {fullscreenField === 'objectiveNotes' && (
            <VitalsGrid
              soapData={soapData}
              updateSoap={updateSoap}
              getTriageLevel={getTriageLevel}
              renderHistoricalLabel={renderHistoricalLabel}
            />
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
          <Box sx={{ flex: 7, minWidth: 0, overflow: 'hidden' }}>
            {/* T3.70: God-View also receives intake context for the read-only context box */}
            {(() => {
              const rawClientNotes = patient?.clientNotes || (!patient?.staffNotes ? patient?.notes : '') || '';
              const filteredClientNotes = (
                rawClientNotes === 'Walk-in client' ||
                rawClientNotes.includes('QUICK ADMIT')
              ) ? '' : rawClientNotes;
              const intakeStaffNotes = patient?.staffNotes || '';

              return (
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
                  intakeClientNotes={filteredClientNotes}
                  intakeStaffNotes={intakeStaffNotes}
                  llmEnabled={llmConfig.enabled && !!llmConfig.workerUrl}
                  llmLoading={llmLoading}
                  llmMessages={llmMessages}
                  onAskAI={runLlmDiagnosis}
                  onResetAndAskAI={handleResetAndAskAI}
                  onToggleAIPanel={() => {}}
                  isAIPanelOpen={true}
                />
              );
            })()}
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
      />

      {/* Phase 3 — Pet-switch confirmation dialog.
          Shown when the vet clicks a sibling pet chip while isDirty (unsaved SOAP data).
          Options: Save (persists draft then switches), Discard (clears dirty, switches), Cancel (stays). */}
      <Dialog
        open={!!pendingSwitchTarget}
        onClose={() => setPendingSwitchTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}`, boxShadow: `6px 6px 0 ${COLORS.brand}` } }}
      >
        <DialogTitle sx={{
          fontFamily: FONT, fontWeight: 900, fontSize: '1rem',
          bgcolor: COLORS.kpiOrangeBg, borderBottom: `2px solid ${COLORS.brand}`,
          display: 'flex', alignItems: 'center', gap: 1,
        }}>
          <WarningAmberIcon sx={{ color: COLORS.warning, fontSize: 20 }} />
          UNSAVED CHANGES
        </DialogTitle>
        <DialogContent sx={{ pt: 2, pb: 1 }}>
          <DialogContentText sx={{ fontFamily: FONT, fontSize: '0.9rem', color: COLORS.brand, fontWeight: 600 }}>
            You have unsaved SOAP changes for <strong>{patient?.petName}</strong>.
            What would you like to do before switching to <strong>{pendingSwitchTarget?.petName}</strong>?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2, gap: 1, justifyContent: 'flex-end', bgcolor: COLORS.panelBg }}>
          <Button
            onClick={() => setPendingSwitchTarget(null)}
            sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textMuted, borderRadius: 0 }}
          >
            CANCEL
          </Button>
          <Button
            onClick={handleDiscardThenSwitch}
            variant="outlined"
            color="error"
            sx={{ fontFamily: FONT, fontWeight: 900, borderRadius: 0, borderWidth: 2 }}
          >
            DISCARD
          </Button>
          <Button
            onClick={handleSaveThenSwitch}
            variant="contained"
            disabled={loading}
            sx={{
              fontFamily: FONT, fontWeight: 900, borderRadius: 0,
              bgcolor: COLORS.accent, color: '#fff',
              boxShadow: `3px 3px 0 ${COLORS.brand}`,
              '&:hover': { bgcolor: COLORS.accentDark || COLORS.accent },
            }}
          >
            {loading ? 'SAVING...' : 'SAVE & SWITCH'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
