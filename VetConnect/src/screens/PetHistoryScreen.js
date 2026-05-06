import { MaterialIcons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View
} from "react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  State,
  TapGestureHandler,
} from 'react-native-gesture-handler';
import { auth, db } from "../../firebaseConfig";
import { useNetwork } from "../context/NetworkContext";
import { useClinicContact } from "../hooks/useClinicContact";
import { safeDate, formatDisplayDate } from "../utils/helpers";
import { resolveDepartmentForRecord } from '../utils/resolveDepartmentForRecord';
import { COLORS, SHADOW, SPACING } from '../theme/mobileTokens';
import SparkLine from '../components/SparkLine';
import VitalsZoomModal from '../components/VitalsZoomModal';
import LabZoomModal from '../components/LabZoomModal';
import PetHistoryAISheet from '../components/PetHistoryAISheet';
import VaccinationStatusCard from '../components/VaccinationStatusCard';
import { buildPetOwnerPrompt } from '../utils/buildPetOwnerPrompt';
import { resolveVitals } from '../utils/resolveVitals';
import { getNormalRange } from '../utils/speciesVitalRanges';
import { fetchVaccineCatalog, buildVaccinationStatus } from '../utils/vaccineHelpers';

// ---------------------------------------------------------------------------
// Enable LayoutAnimation on Android (required for Hermes/React Native)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---------------------------------------------------------------------------
// VACCINATION PASSPORT — HTML TEMPLATE
// Self-contained: no imports from admin utils. Mirrors the admin passport
// template structure (cover, status cards, history table, certification block).
// ---------------------------------------------------------------------------

/**
 * Escapes a value for safe embedding in an HTML attribute or text node.
 * Prevents XSS from dynamic data (pet names, vet names, lot numbers, etc.).
 */
function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolves a Firestore Timestamp, seconds-epoch object, Date, or date string
 * to a JS Date. Returns null if the input is not a recognisable date value.
 */
function resolveDate(rawDate) {
  if (!rawDate) return null;
  if (typeof rawDate.toDate === 'function') return rawDate.toDate();
  if (rawDate.seconds != null) return new Date(rawDate.seconds * 1000);
  if (rawDate instanceof Date) return rawDate;
  const parsed = new Date(rawDate);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Formats a JS Date as "Month D, YYYY" (e.g. "April 1, 2025"). */
function fmtDate(date) {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Derives the current status of a single vaccine administration based on its
 * due date relative to today. Returns one of: 'current' | 'due-soon' | 'overdue'.
 *
 * "Due soon" means the due date is within the next 30 days.
 */
function resolveVaccineStatus(dueDate) {
  const due = resolveDate(dueDate);
  if (!due) return 'current';
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  if (due < now) return 'overdue';
  if (due < thirtyDaysFromNow) return 'due-soon';
  return 'current';
}


const VACCINE_STATUS_STYLES = {
  current:   { borderColor: '#2E7D32', badgeBg: '#E8F5E9', badgeColor: '#2E7D32', label: 'CURRENT' },
  'due-soon': { borderColor: '#E65100', badgeBg: '#FFF8E1', badgeColor: '#E65100', label: 'DUE SOON' },
  overdue:   { borderColor: '#D32F2F', badgeBg: '#FFEBEE', badgeColor: '#D32F2F', label: 'OVERDUE' },
};

/**
 * Produces a print-ready HTML string for a pet's vaccination passport.
 *
 * @param {object} params
 * @param {string} params.petName      - Pet's display name
 * @param {string} params.ownerName    - Owner's display name (may be empty)
 * @param {string} params.clinicName   - Clinic name for the header/certification block
 * @param {Array}  params.vaccineRecords - Array of medical_record documents that contain
 *                                         vaccineAdministrations or vaccineData
 */
function generateMobileVaccinationPassport({ petName, ownerName, clinicName, vaccineRecords }) {
  const today = fmtDate(new Date());
  const safeClinic = escHtml(clinicName || 'Starbarks Veterinary Clinic');
  const safePet = escHtml(petName);
  const safeOwner = escHtml(ownerName || 'Pet Owner');

  // Flatten all administrations from all records into a single array, newest first.
  // Each entry carries the parent record's date and vetName for the history table.
  const allAdministrations = vaccineRecords.flatMap((record) => {
    const recordDate = resolveDate(record.date);
    const vetName = record.vetName || 'Clinic Staff';
    const admins = record.vaccineAdministrations?.length > 0
      ? record.vaccineAdministrations
      : (record.vaccineData ? [record.vaccineData] : []);
    return admins.map((vax) => ({ ...vax, recordDate, vetName }));
  });

  // Build the "current status" summary: keep only the most recent entry per
  // vaccine name (array is already newest-first due to orderBy('date','desc')).
  const seenVaccines = new Set();
  const latestByVaccine = allAdministrations.filter((vax) => {
    const key = (vax.vaccineName || 'Unknown').toLowerCase();
    if (seenVaccines.has(key)) return false;
    seenVaccines.add(key);
    return true;
  });

  // --- STATUS CARDS (one per unique vaccine, colour-coded by due-date status) ---
  const statusCardsHtml = latestByVaccine.map((vax) => {
    const status = resolveVaccineStatus(vax.dueDate);
    const st = VACCINE_STATUS_STYLES[status];
    const administered = fmtDate(vax.recordDate);
    const dueDate = fmtDate(resolveDate(vax.dueDate));

    return `
      <div class="vaccine-card" style="border-left:4px solid ${st.borderColor}">
        <div class="vaccine-card-header">
          <strong>${escHtml(vax.vaccineName || 'Unknown Vaccine')}</strong>
          <span class="status-badge" style="background:${st.badgeBg};color:${st.badgeColor}">${st.label}</span>
        </div>
        <div class="vaccine-card-meta">Last administered: <strong>${escHtml(administered)}</strong> by ${escHtml(vax.vetName || 'Clinic Staff')}</div>
        ${vax.manufacturer ? `<div class="vaccine-card-meta">Manufacturer: ${escHtml(vax.manufacturer)}${vax.lotNumber ? ` &nbsp;|&nbsp; Lot: ${escHtml(vax.lotNumber)}` : ''}</div>` : ''}
        <div class="vaccine-card-meta">Next due: <strong>${escHtml(dueDate)}</strong></div>
      </div>`;
  }).join('');

  // --- HISTORY TABLE (all administrations, newest first) ---
  const historyRowsHtml = allAdministrations.map((vax) => {
    const administered = fmtDate(vax.recordDate);
    const dueDate = fmtDate(resolveDate(vax.dueDate));
    return `
      <tr>
        <td>${escHtml(administered)}</td>
        <td><strong>${escHtml(vax.vaccineName || 'Unknown')}</strong></td>
        <td>${escHtml(vax.manufacturer || '—')}</td>
        <td>${escHtml(vax.lotNumber || '—')}</td>
        <td>${escHtml(vax.routeOfAdmin || '—')}</td>
        <td>${escHtml(vax.vetName || 'Clinic Staff')}</td>
        <td>${escHtml(dueDate)}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vaccination Passport — ${safePet}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Helvetica, Arial, sans-serif;
      font-size: 12px;
      color: #3E2723;
      background: #FFFFFF;
      padding: 40px;
    }

    /* ---- COVER SECTION ---- */
    .cover {
      text-align: center;
      padding-bottom: 28px;
      border-bottom: 3px solid #3E2723;
      margin-bottom: 28px;
    }
    .clinic-name {
      font-size: 22px;
      font-weight: 900;
      color: #3E2723;
      text-transform: uppercase;
      letter-spacing: 3px;
    }
    .passport-title {
      font-size: 28px;
      font-weight: 900;
      color: #3E2723;
      text-transform: uppercase;
      letter-spacing: 4px;
      margin: 14px 0 6px;
    }
    .passport-subtitle {
      font-size: 12px;
      color: #8D6E63;
      letter-spacing: 1px;
      margin-bottom: 20px;
    }
    .cover-info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 16px;
      text-align: left;
    }
    .cover-field {
      padding: 10px 14px;
      border: 2px solid #3E2723;
      background: #FFF8E1;
    }
    .cover-field-label {
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #8D6E63;
      margin-bottom: 3px;
    }
    .cover-field-value {
      font-size: 14px;
      font-weight: 900;
      color: #3E2723;
    }
    .doc-date {
      font-size: 10px;
      color: #8D6E63;
      margin-top: 14px;
    }

    /* ---- SECTION HEADERS ---- */
    .section-title {
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #3E2723;
      padding-bottom: 6px;
      border-bottom: 2px solid #3E2723;
      margin-bottom: 14px;
    }

    /* ---- VACCINE STATUS CARDS ---- */
    .vaccine-card {
      padding: 12px 16px;
      margin-bottom: 10px;
      border: 1px solid #E0E0E0;
      page-break-inside: avoid;
    }
    .vaccine-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .vaccine-card-meta {
      font-size: 11px;
      color: #5D4037;
      margin-top: 3px;
    }

    /* ---- HISTORY TABLE ---- */
    .section { margin-bottom: 28px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    th {
      background: #3E2723;
      color: #FFF8E1;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 6px 8px;
      text-align: left;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #E0E0E0;
      vertical-align: top;
    }
    tr:nth-child(even) td { background: #FAFAFA; }

    /* ---- CERTIFICATION BLOCK ---- */
    .certification-block {
      margin-top: 36px;
      padding: 20px;
      border: 2px solid #3E2723;
      page-break-before: always;
    }
    .certification-text {
      font-size: 11px;
      color: #5D4037;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .signature-row {
      display: flex;
      gap: 40px;
      margin-bottom: 16px;
    }
    .signature-item { flex: 1; }
    .signature-line {
      border-bottom: 2px solid #3E2723;
      height: 40px;
      margin-bottom: 4px;
    }
    .signature-label {
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #8D6E63;
    }
    .certification-footer {
      font-size: 9px;
      color: #9E9E9E;
      border-top: 1px solid #E0E0E0;
      padding-top: 10px;
      margin-top: 10px;
    }

    @media print {
      body { padding: 20px; }
      .vaccine-card { page-break-inside: avoid; }
      .certification-block { page-break-before: always; }
    }
  </style>
</head>
<body>

  <!-- COVER SECTION -->
  <div class="cover">
    <div class="clinic-name">${safeClinic}</div>
    <div class="passport-title">Vaccination Passport</div>
    <div class="passport-subtitle">Official Veterinary Immunization Record</div>
    <div class="cover-info-grid">
      <div class="cover-field">
        <div class="cover-field-label">Patient Name</div>
        <div class="cover-field-value">${safePet}</div>
      </div>
      <div class="cover-field">
        <div class="cover-field-label">Owner</div>
        <div class="cover-field-value">${safeOwner}</div>
      </div>
    </div>
    <div class="doc-date">Document generated: ${escHtml(today)}</div>
  </div>

  <!-- CURRENT VACCINE STATUS -->
  <div class="section">
    <div class="section-title">Current Vaccine Status</div>
    ${latestByVaccine.length > 0 ? statusCardsHtml : '<p style="color:#8D6E63;font-style:italic">No vaccination records found.</p>'}
  </div>

  <!-- VACCINATION HISTORY TABLE -->
  <div class="section">
    <div class="section-title">Complete Vaccination History</div>
    ${allAdministrations.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Vaccine</th>
          <th>Manufacturer</th>
          <th>Lot #</th>
          <th>Route</th>
          <th>Administered By</th>
          <th>Next Due</th>
        </tr>
      </thead>
      <tbody>
        ${historyRowsHtml}
      </tbody>
    </table>` : '<p style="color:#8D6E63;font-style:italic">No history records found.</p>'}
  </div>

  <!-- CERTIFICATION BLOCK -->
  <div class="certification-block">
    <div class="section-title">Veterinarian Certification</div>
    <p class="certification-text">
      I certify that the vaccinations listed in this document were administered to the patient
      identified herein in accordance with accepted veterinary standards of care. This record
      is accurate and complete to the best of my knowledge.
    </p>
    <div class="signature-row">
      <div class="signature-item">
        <div class="signature-line"></div>
        <div class="signature-label">Veterinarian Signature</div>
      </div>
      <div class="signature-item">
        <div class="signature-line"></div>
        <div class="signature-label">License Number</div>
      </div>
      <div class="signature-item">
        <div class="signature-line"></div>
        <div class="signature-label">Date</div>
      </div>
    </div>
    <div class="certification-footer">
      This document was generated by VetConnect and serves as an official vaccination record
      from ${safeClinic}. For verification, contact the clinic directly.
    </div>
  </div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// T4.113: Vitals chart configuration registry.
// Maps each vital key to its display metadata. refKey drives the species-normal
// reference band — null means no universal range exists for that vital.
// ---------------------------------------------------------------------------

const VITALS_CONFIG = {
  weight: { label: 'Weight Trend',     unit: 'kg',  color: COLORS.info,    refKey: null    },
  temp:   { label: 'Temperature',      unit: '°C',  color: COLORS.danger,  refKey: 'temp'  },
  hr:     { label: 'Heart Rate',       unit: 'bpm', color: COLORS.success, refKey: 'hr'    },
  rr:     { label: 'Respiratory Rate', unit: 'bpm', color: '#7B1FA2',      refKey: 'rr'    },
  crt:    { label: 'Capillary Refill', unit: 's',   color: '#00838F',      refKey: 'crt'   },
  bcs:    { label: 'Body Condition',   unit: '/9',  color: '#EF6C00',      refKey: 'bcs'   },
  pain:   { label: 'Pain Score',       unit: '/10', color: COLORS.danger,  refKey: null    },
};

/**
 * Fixed Y-axis domains for vitals that have a canonical bounded scale.
 * Vitals not listed here use auto-domain (derived from the actual data range).
 * These values match the scoring systems used in clinical practice.
 */
const VITAL_Y_DOMAINS = {
  pain: { min: 0, max: 10 },
  bcs:  { min: 1, max: 9  },
  crt:  { min: 0, max: 5  },
};

/**
 * Renders a delta annotation for a vitals sparkline data array.
 * Shows the change between the last two readings in neutral muted colour —
 * direction should not be interpreted as good or bad without vet advice.
 *
 * @param {{ label: string, value: number }[]} data
 * @param {string} unit - Unit string including any leading space (e.g. ' kg').
 * @returns {React.ReactElement | null}
 */
function renderDelta(data, unit) {
  if (data.length < 2) return null;
  const prev = data[data.length - 2].value;
  const curr = data[data.length - 1].value;
  const diff = curr - prev;
  if (diff === 0) return null;
  const arrow     = diff > 0 ? '↑' : '↓';
  const sign      = diff > 0 ? '+' : '';
  const formatted = Number(diff.toFixed(1));
  return (
    <Text style={deltaTextStyle}>
      {arrow} {sign}{formatted}{unit} since last visit
    </Text>
  );
}

// Defined outside StyleSheet.create so renderDelta (a module-level function)
// can reference it without accessing the component's styles object.
const deltaTextStyle = {
  fontSize: 10,
  color: COLORS.textMuted,
  marginTop: 2,
  letterSpacing: 0.3,
};

// ---------------------------------------------------------------------------

export default function PetHistoryScreen({ route, navigation }) {
  const { petId, petName } = route.params;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  // T4.155 Day 3: Pull-to-refresh — visual affordance (data auto-refreshes via onSnapshot)
  const [refreshing, setRefreshing] = useState(false);
  // T3.95: Case-day metadata derived from appointment documents
  const [caseDayMap, setCaseDayMap] = useState({});
  // T3.94: Search and filter state
  const [searchText, setSearchText] = useState('');
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pendingFilters, setPendingFilters] = useState(new Set());
  // T4.107: Departments — one-shot fetch for dynamic filter chips
  const [departments, setDepartments] = useState([]);
  const { clinicPhone, clinicName } = useClinicContact();
  const { isConnected } = useNetwork();

  // T4.97: AI Pet History Assistant — pet doc, worker URL, and sheet visibility
  const [petDoc, setPetDoc]               = useState(null);
  const [workerUrl, setWorkerUrl]         = useState('');
  const [aiSheetVisible, setAiSheetVisible] = useState(false);

  // T4.118: Vaccine catalog — one-shot fetch from inventory, falls back to defaults.
  const [vaccineCatalog, setVaccineCatalog] = useState([]);

  // Records that carry vaccination data — used to gate the passport button and
  // to build the passport document. Derived; no extra Firestore read needed.
  const vaccineRecords = useMemo(
    () => history.filter(
      (r) => r.vaccineAdministrations?.length > 0 || r.vaccineData
    ),
    [history],
  );

  // T4.107: Dynamic filter options — department names from Firestore, with
  // 'Vaccination' pinned at the end as a special cross-department filter.
  // Falls back to hardcoded values while the fetch is in-flight or if it fails.
  const filterOptions = useMemo(() => {
    if (!departments.length) return ['All', 'medical', 'grooming', 'Vaccination'];
    return ['All', ...departments.map(d => d.name), 'Vaccination'];
  }, [departments]);

  // T4.107: One-shot departments fetch — sufficient since departments rarely
  // change mid-session. Mirrors the LLM config fetch pattern from T4.97.
  useEffect(() => {
    getDocs(collection(db, 'departments'))
      .then(snap => {
        const depts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setDepartments(depts);
      })
      .catch(err => console.warn('[PetHistoryScreen] departments fetch skipped:', err.message));
  }, []);

  // T4.107: Defensive reset — if any active filters no longer exist in the
  // updated options (e.g., after a successful departments fetch), clear them.
  useEffect(() => {
    if (activeFilters.size > 0) {
      const validOptions = new Set(filterOptions.filter(o => o !== 'All'));
      const cleaned = new Set([...activeFilters].filter(f => validOptions.has(f)));
      if (cleaned.size !== activeFilters.size) {
        setActiveFilters(cleaned);
      }
    }
  }, [filterOptions]);

  // T4.97: One-shot fetch for pet profile — provides species/breed/age/allergies to the AI prompt.
  // Falls back gracefully if the doc is missing; the AI just gets less context.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'pets', petId));
        if (!cancelled && snap.exists()) {
          setPetDoc({ id: snap.id, ...snap.data() });
        }
      } catch {
        // Non-critical — AI prompt falls back to { name: petName }
      }
    })();
    return () => { cancelled = true; };
  }, [petId]);

  // T4.118: One-shot vaccine catalog fetch — uses inventory products or falls back
  // to DEFAULT_VACCINE_CATALOG. Not a real-time listener; catalog changes mid-session
  // are irrelevant for a pet owner.
  useEffect(() => {
    let cancelled = false;
    fetchVaccineCatalog().then(catalog => {
      if (!cancelled) setVaccineCatalog(catalog);
    });
    return () => { cancelled = true; };
  }, []);

  // T4.97: One-shot fetch for the Cloudflare Worker URL from clinic_settings.
  // The FAB is hidden when workerUrl is empty, so this doubles as a feature gate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'clinic_settings', 'llm_config'));
        if (!cancelled && snap.exists()) {
          const data = snap.data();
          if (data.enabled && data.workerUrl) {
            setWorkerUrl(data.workerUrl);
          }
        }
      } catch {
        // Non-critical — FAB stays hidden
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // T4.97: Memoized AI system prompt. Rebuilds only when pet data or records change.
  // Deliberately omits SOAP subjective/objective/plan (clinical-only notes).
  const aiSystemPrompt = useMemo(
    () =>
      buildPetOwnerPrompt({
        pet: petDoc || { name: petName },
        records: history,
        vaccinations: vaccineRecords,
      }),
    [petDoc, petName, history, vaccineRecords],
  );

  // T3.94: Derived list after applying type filter and search text.
  // history is always the source of truth; filteredHistory is read-only derived state.
  const filteredHistory = useMemo(() => {
    let result = history;

    if (activeFilters.size > 0) {
      result = result.filter(r => {
        const dept = resolveDepartmentForRecord(r, departments);
        const isVax = r.vaccineAdministrations?.length > 0 || !!r.vaccineData;
        return activeFilters.has(dept) || (isVax && activeFilters.has('Vaccination'));
      });
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      result = result.filter(r =>
        (r.diagnoses?.map(d => d.name).join(' ') || r.diagnosis || '').toLowerCase().includes(q) ||
        (r.serviceType || '').toLowerCase().includes(q) ||
        (r.vetName || '').toLowerCase().includes(q) ||
        (r.treatment || '').toLowerCase().includes(q) ||
        (r.serviceNames || []).some(n => n.toLowerCase().includes(q))
      );
    }

    return result;
  }, [history, activeFilters, searchText, departments]);

  const departmentCounts = useMemo(() => {
    const counts = new Map();
    history.forEach(r => {
      const dept = resolveDepartmentForRecord(r, departments);
      counts.set(dept, (counts.get(dept) || 0) + 1);
      if (r.vaccineAdministrations?.length > 0 || r.vaccineData) {
        counts.set('Vaccination', (counts.get('Vaccination') || 0) + 1);
      }
    });
    return counts;
  }, [history, departments]);

  // T4.122: Active/historical prescription split — matches admin PatientDashboard pattern.
  // Active = prescribed in last 90 days OR pinned by the vet. Historical = older, not pinned.
  // Read-only: pet owners cannot pin/unpin (that's a vet action on the admin dashboard).
  const { activeRx, historicalRx } = useMemo(() => {
    const rxMap = new Map();
    const sortedHistory = [...(history || [])].sort((a, b) => {
      const aMs = a.date?.seconds ? a.date.seconds * 1000 : 0;
      const bMs = b.date?.seconds ? b.date.seconds * 1000 : 0;
      return aMs - bMs; // oldest first so lastDate = final write
    });
    sortedHistory.forEach(r => {
      (r.dispensedProducts || r.prescriptions || []).forEach(rx => {
        if (!rx.name) return;
        const pc = rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
        if (pc !== 'medicine') return;
        const ms = r.date?.seconds ? r.date.seconds * 1000 : 0;
        const dateStr = ms
          ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '';
        const shortDate = ms
          ? new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : '';
        const existing = rxMap.get(rx.name);
        if (existing) {
          existing.count += 1;
          existing.lastDate = dateStr;
          existing.lastRawMs = ms;
          existing.lastShort = shortDate;
          existing.lastInstructions = rx.instructions || existing.lastInstructions;
        } else {
          rxMap.set(rx.name, {
            name: rx.name,
            count: 1,
            lastDate: dateStr,
            firstDate: dateStr,
            firstShort: shortDate,
            lastShort: shortDate,
            lastRawMs: ms,
            lastInstructions: rx.instructions || '',
          });
        }
      });
    });

    const all = Array.from(rxMap.values()).sort((a, b) => b.count - a.count);
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const pinned = petDoc?.pinnedMedications || [];

    const active = [];
    const historical = [];
    all.forEach(rx => {
      const isRecent = (now - rx.lastRawMs) <= NINETY_DAYS_MS;
      const isPinned = pinned.includes(rx.name);
      if (isRecent || isPinned) {
        active.push({ ...rx, isPinned });
      } else {
        historical.push({ ...rx, isPinned: false });
      }
    });

    return { activeRx: active, historicalRx: historical };
  }, [history, petDoc?.pinnedMedications]);

  // T4.123: Aggregated lab results — latest per test with trend context.
  // Mirrors admin PatientDashboard aggregatedLabResults useMemo.
  // Walk records oldest → newest so the final Map entry per test = most recent.
  const { labSummary, labTimeline, labUniqueTests } = useMemo(() => {
    const testMap = new Map(); // testName -> latest entry with previous context
    const sortedHistory = [...(history || [])].sort((a, b) => {
      const aMs = a.date?.seconds ? a.date.seconds * 1000 : 0;
      const bMs = b.date?.seconds ? b.date.seconds * 1000 : 0;
      return aMs - bMs;
    });
    const timelineEntries = [];

    sortedHistory.forEach(r => {
      const ms = r.date?.seconds ? r.date.seconds * 1000 : 0;
      const dateStr = ms
        ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      (r.labResults || []).forEach(lab => {
        if (!lab.testName) return;
        const numericResult = parseFloat(lab.result);
        // Timeline entry (for zoom modal)
        timelineEntries.push({
          testName: lab.testName,
          result: lab.result,
          numericResult: isNaN(numericResult) ? null : numericResult,
          status: lab.status || 'normal',
          unit: lab.unit || '',
          referenceRange: lab.referenceRange || null,
          resultType: lab.resultType || (isNaN(numericResult) ? 'descriptive' : 'numeric'),
          date: dateStr,
          ms,
        });
        // Summary aggregation (latest per test)
        const existing = testMap.get(lab.testName);
        if (existing) {
          testMap.set(lab.testName, {
            testName: lab.testName,
            result: lab.result,
            numericResult: isNaN(numericResult) ? null : numericResult,
            status: lab.status || 'normal',
            date: dateStr,
            previousResult: existing.result,
            previousNumeric: existing.numericResult,
            previousDate: existing.date,
            referenceRange: lab.referenceRange || existing.referenceRange || null,
            unit: lab.unit || existing.unit || '',
            resultType: lab.resultType || existing.resultType || null,
            count: existing.count + 1,
          });
        } else {
          testMap.set(lab.testName, {
            testName: lab.testName,
            result: lab.result,
            numericResult: isNaN(numericResult) ? null : numericResult,
            status: lab.status || 'normal',
            date: dateStr,
            previousResult: null,
            previousNumeric: null,
            previousDate: null,
            referenceRange: lab.referenceRange || null,
            unit: lab.unit || '',
            resultType: lab.resultType || null,
            count: 1,
          });
        }
      });
    });

    const summary = Array.from(testMap.values());
    const timeline = timelineEntries.sort((a, b) => b.ms - a.ms); // newest first
    const uniqueTests = [...new Set(timeline.map(e => e.testName))].sort();
    return { labSummary: summary, labTimeline: timeline, labUniqueTests: uniqueTests };
  }, [history]);

  // T3.93 / T4.113: Derive chart-ready arrays for all 7 vital signs.
  // History is newest-first from Firestore — reverse for left-to-right time axis.
  // T3.133: Resolve amendments once per record so amended vitals appear in trends.
  const vitalsChartData = useMemo(() => {
    const sorted = [...history].reverse();
    const resolved = sorted.map(r => ({ ...r, _rv: resolveVitals(r) }));
    const extract = (field) =>
      resolved
        .filter(r => r._rv[field] != null && r._rv[field] !== '')
        .map(r => ({ label: formatDisplayDate(r.date), value: parseFloat(r._rv[field]) }))
        .filter(d => !isNaN(d.value));
    return {
      weight: extract('weight'),
      temp:   extract('temp'),
      hr:     extract('hr'),
      rr:     extract('rr'),
      crt:    extract('crt'),
      bcs:    extract('bcs'),
      pain:   extract('pain'),
    };
  }, [history]);

  // T4.113: Pet species for species-normal reference bands.
  // petDoc is fetched in a one-shot useEffect above. Defaults to 'Canine' while
  // the doc is loading or if species is absent — canine is the safe fallback.
  const petSpecies = petDoc?.species || 'Canine';

  // T3.93: Collapsible state for the vitals trends card.
  const [trendsExpanded, setTrendsExpanded] = useState(false);
  // T4.122: Collapsible state for the medications card (active/historical split).
  const [rxExpanded, setRxExpanded] = useState(false);
  const [showHistoricalRx, setShowHistoricalRx] = useState(false);
  // T4.113: Zoom modal state — tracks which vital key is currently expanded.
  const [vitalsZoom, setVitalsZoom] = useState({ open: false, key: null });
  // T4.123: Lab results summary card — collapsible + zoom modal state.
  const [labExpanded, setLabExpanded] = useState(false);
  const [labZoom, setLabZoom] = useState({ open: false, testName: null });
  // T4.124: Full-screen image lightbox state.
  const [lightbox, setLightbox] = useState({ open: false, url: null });

  // ---------------------------------------------------------------------------
  // T4.155: Collapsible records — expand/collapse state management
  // ---------------------------------------------------------------------------

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  // Auto-expand the latest record when filtered history first populates
  useEffect(() => {
    if (filteredHistory.length > 0 && expandedIds.size === 0 && !allExpanded) {
      setExpandedIds(new Set([filteredHistory[0].id]));
    }
    // Intentional: only run when filteredHistory changes identity (new data loaded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHistory]);

  const toggleRecord = useCallback((id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (allExpanded) {
      // Collapse all: keep only the latest record expanded
      setExpandedIds(new Set(filteredHistory.length > 0 ? [filteredHistory[0].id] : []));
      setAllExpanded(false);
    } else {
      setExpandedIds(new Set(filteredHistory.map(r => r.id)));
      setAllExpanded(true);
    }
  }, [allExpanded, filteredHistory]);

  // T4.155 Day 3: Pull-to-refresh handler.
  // The onSnapshot listener already keeps data fresh. This provides the visual
  // affordance users expect — spinner shows briefly then auto-dismisses.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // ---------------------------------------------------------------------------
  // T4.155: Month picker — horizontal chip strip above FlatList
  // ---------------------------------------------------------------------------

  const flatListRef = useRef(null);
  const monthPickerRef = useRef(null);

  // Derive unique months from filteredHistory (newest-first order preserved)
  const months = useMemo(() => {
    const seen = new Map();
    filteredHistory.forEach((r, idx) => {
      const d = r.date?.toDate ? r.date.toDate()
        : r.date?.seconds ? new Date(r.date.seconds * 1000)
        : null;
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          firstIndex: idx,
        });
      }
    });
    return Array.from(seen.values());
  }, [filteredHistory]);

  const [activeMonth, setActiveMonth] = useState('');

  // Sync activeMonth to first month when months list changes
  useEffect(() => {
    if (months.length > 0 && !activeMonth) {
      setActiveMonth(months[0].key);
    }
  }, [months, activeMonth]);

  const years = useMemo(() => {
    const yearSet = new Set();
    months.forEach(m => yearSet.add(m.key.split('-')[0]));
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [months]);

  const [selectedYear, setSelectedYear] = useState('');
  const selectedYearRef = useRef('');

  useEffect(() => {
    selectedYearRef.current = selectedYear;
  }, [selectedYear]);

  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      setSelectedYear(years[0]);
    }
  }, [years, selectedYear]);

  const visibleMonths = useMemo(() => {
    if (!selectedYear) return months;
    return months.filter(m => m.key.startsWith(selectedYear));
  }, [months, selectedYear]);

  const scrollToMonth = useCallback((monthKey, firstIndex) => {
    setActiveMonth(monthKey);
    flatListRef.current?.scrollToIndex({
      index: firstIndex,
      animated: true,
      viewOffset: 50,
    });
  }, []);

  // Must be in useRef to prevent FlatList from remounting on re-render
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 30 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (!viewableItems || viewableItems.length === 0) return;
    const firstVisible = viewableItems[0]?.item;
    if (!firstVisible) return;
    const d = firstVisible.date?.toDate ? firstVisible.date.toDate()
      : firstVisible.date?.seconds ? new Date(firstVisible.date.seconds * 1000)
      : null;
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setActiveMonth(key);
    const yearPart = key.split('-')[0];
    if (yearPart !== selectedYearRef.current) {
      setSelectedYear(yearPart);
    }
  }).current;


  // ---------------------------------------------------------------------------
  // T4.124: Animated values for lightbox pinch-to-zoom and pan gesture tracking.
  const lightboxScale = useRef(new Animated.Value(1)).current;
  const lightboxTranslateX = useRef(new Animated.Value(0)).current;
  const lightboxTranslateY = useRef(new Animated.Value(0)).current;
  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);

  // T4.118: Vaccination status derived from history + vaccine catalog + species.
  // buildVaccinationStatus also performs keyword-fallback against legacy SOAP records.
  const { statuses: vaccinationStatuses, completeness: vaccineCompleteness } = useMemo(
    () => buildVaccinationStatus(history, vaccineCatalog, petSpecies),
    [history, vaccineCatalog, petSpecies],
  );

  // ---------------------------------------------------------------------------
  // T4.155 Day 2: Pet Health Snapshot strip — collapsible summary above header cards
  const [snapshotCollapsed, setSnapshotCollapsed] = useState(false);

  // Latest vitals from the most-recent record (history is newest-first)
  const latestVitals = useMemo(() => {
    if (!history.length) return null;
    const rv = resolveVitals(history[0]);
    if (!rv.weight && !rv.temp && !rv.hr) return null;
    return rv;
  }, [history]);

  // Active medications from the most-recent record (drugs only, cap at 5)
  const latestActiveMeds = useMemo(() => {
    if (!history.length) return [];
    const latest = history[0];
    const products = latest.dispensedProducts || latest.prescriptions || [];
    return products.filter(rx =>
      (rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail')) === 'medicine'
    ).slice(0, 5);
  }, [history]);

  /** Generates the vaccination passport PDF and opens the OS share sheet. */
  const handleDownloadPassport = async () => {
    try {
      const html = generateMobileVaccinationPassport({
        petName,
        ownerName: '',        // PetHistoryScreen has no owner profile in scope;
                              // the passport will show 'Pet Owner' as a safe default.
        clinicName: clinicName || 'Starbarks Veterinary Clinic',
        vaccineRecords,
      });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
      });
    } catch (error) {
      Alert.alert('Error generating passport', error.message);
    }
  };

  const listHeader = useMemo(() => {
    // T4.113: Card shows when any vital has at least 1 reading (was >= 2).
    // SparkLine handles the 1-point graceful fallback internally.
    const hasTrends = Object.values(vitalsChartData).some(arr => arr.length >= 1);
    const hasRx = activeRx.length > 0 || historicalRx.length > 0;
    // T4.118: Show the header whenever there are species-relevant catalog vaccines
    // OR the pet already has vaccine records (even if catalog is still loading).
    const hasVaxStatus = vaccinationStatuses.length > 0 || vaccineRecords.length > 0;
    const hasLabs = labSummary.length > 0;
    if (!hasTrends && !hasRx && !hasVaxStatus && !hasLabs) return null;
    return (
      <View>
        {/* T4.155 Day 2: Pet Health Snapshot — collapsible strip showing latest vitals, meds, vaccination % */}
        {(latestVitals || latestActiveMeds.length > 0 || vaccineCompleteness) && (
          <View style={styles.snapshotCard}>
            <View style={styles.snapshotShadow} />
            <View style={styles.snapshotInner}>
              <TouchableOpacity
                style={styles.snapshotHeader}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSnapshotCollapsed(prev => !prev);
                }}
              >
                <Text style={styles.snapshotTitle}>PET HEALTH SNAPSHOT</Text>
                <MaterialIcons
                  name={snapshotCollapsed ? 'expand-more' : 'expand-less'}
                  size={20}
                  color={COLORS.accent}
                />
              </TouchableOpacity>

              {!snapshotCollapsed && (
                <View style={styles.snapshotBody}>
                  {/* Section 1: Latest Vitals */}
                  {latestVitals && (
                    <View style={styles.snapshotSection}>
                      <Text style={styles.snapshotSectionLabel}>LATEST VITALS</Text>
                      <View style={styles.snapshotVitalsRow}>
                        {latestVitals.weight != null && latestVitals.weight !== '' && (
                          <View style={styles.snapshotVitalChip}>
                            <Text style={styles.snapshotVitalLabel}>WEIGHT</Text>
                            <Text style={styles.snapshotVitalValue}>{latestVitals.weight} kg</Text>
                          </View>
                        )}
                        {latestVitals.temp != null && latestVitals.temp !== '' && (
                          <View style={styles.snapshotVitalChip}>
                            <Text style={styles.snapshotVitalLabel}>TEMP</Text>
                            <Text style={styles.snapshotVitalValue}>{latestVitals.temp} °C</Text>
                          </View>
                        )}
                        {latestVitals.hr != null && latestVitals.hr !== '' && (
                          <View style={styles.snapshotVitalChip}>
                            <Text style={styles.snapshotVitalLabel}>HR</Text>
                            <Text style={styles.snapshotVitalValue}>{latestVitals.hr} bpm</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Section 2: Active Medications */}
                  <View style={styles.snapshotSection}>
                    <Text style={styles.snapshotSectionLabel}>ACTIVE MEDICATIONS</Text>
                    {latestActiveMeds.length > 0 ? (
                      latestActiveMeds.map((med, i) => (
                        <View key={i} style={styles.snapshotMedRow}>
                          <Text style={styles.snapshotMedName}>{med.name}</Text>
                          {med.instructions && (
                            <Text style={styles.snapshotMedSig}>{med.instructions}</Text>
                          )}
                        </View>
                      ))
                    ) : (
                      <Text style={styles.snapshotEmptyText}>No active medications</Text>
                    )}
                  </View>

                  {/* Section 3: Vaccination Completeness */}
                  {vaccineCompleteness && (
                    <View style={styles.snapshotSection}>
                      <Text style={styles.snapshotSectionLabel}>VACCINATION STATUS</Text>
                      <View style={styles.snapshotVaxRow}>
                        <Text style={styles.snapshotVaxText}>
                          {vaccineCompleteness.administered}/{vaccineCompleteness.total} current ({vaccineCompleteness.percentage}%)
                        </Text>
                        <View style={styles.snapshotProgressTrack}>
                          <View style={[styles.snapshotProgressFill, {
                            width: `${vaccineCompleteness.percentage}%`,
                            backgroundColor: vaccineCompleteness.percentage >= 75 ? COLORS.success
                              : vaccineCompleteness.percentage >= 50 ? COLORS.warning
                              : COLORS.danger,
                          }]} />
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {hasTrends && (
          <View style={styles.trendsCard}>
            <TouchableOpacity
              style={styles.trendsHeader}
              onPress={() => setTrendsExpanded(prev => !prev)}
            >
              <Text style={styles.trendsTitle}>VITALS TRENDS</Text>
              <MaterialIcons
                name={trendsExpanded ? 'expand-less' : 'expand-more'}
                size={20}
                color={COLORS.accent}
              />
            </TouchableOpacity>

            {/* T4.113: All 7 vitals rendered via config map — replaces 3 hardcoded blocks */}
            {trendsExpanded && (
              <View style={styles.trendsBody}>
                {Object.entries(VITALS_CONFIG).map(([key, cfg]) => {
                  const chartData = vitalsChartData[key];
                  if (!chartData || chartData.length < 1) return null;
                  const range = cfg.refKey
                    ? getNormalRange(cfg.refKey, petSpecies)
                    : null;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.trendRow}
                      onPress={() => setVitalsZoom({ open: true, key })}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.trendLabel}>{cfg.label.toUpperCase()}</Text>
                      <SparkLine
                        data={chartData}
                        lineColor={cfg.color}
                        unit={cfg.unit}
                        normalRange={range}
                        showDateLabels
                      />
                      {renderDelta(chartData, ` ${cfg.unit}`)}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
        {/* T4.118: Vaccination status card — between VITALS TRENDS and Rx Frequency */}
        {hasVaxStatus && (
          <VaccinationStatusCard
            statuses={vaccinationStatuses}
            completeness={vaccineCompleteness}
            petName={petName}
            petId={petId}
            history={history}
            catalog={vaccineCatalog}
            navigation={navigation}
            onDownloadPassport={handleDownloadPassport}
            hasVaccineRecords={vaccineRecords.length > 0}
          />
        )}
        {hasRx && (
          <View style={styles.rxFreqCard}>
            <TouchableOpacity
              style={styles.rxFreqHeader}
              onPress={() => setRxExpanded(prev => !prev)}
            >
              <Text style={styles.rxFreqTitle}>
                YOUR PET'S MEDICATIONS ({activeRx.length + historicalRx.length})
              </Text>
              <MaterialIcons
                name={rxExpanded ? 'expand-less' : 'expand-more'}
                size={20}
                color={COLORS.accent}
              />
            </TouchableOpacity>
            {rxExpanded && (
              <View style={styles.rxFreqBody}>
                {/* Active Medications */}
                {activeRx.length > 0 && (
                  <View>
                    <Text style={styles.rxSectionLabel}>ACTIVE MEDICATIONS</Text>
                    {activeRx.map((rx, i) => (
                      <View key={i} style={styles.rxFreqRow}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.rxFreqName}>{rx.name}</Text>
                            {rx.isPinned && (
                              <Text style={{ fontSize: 11, color: COLORS.warning }}>📌</Text>
                            )}
                          </View>
                          {rx.lastInstructions ? (
                            <Text style={styles.rxFreqSig}>{rx.lastInstructions}</Text>
                          ) : null}
                          <Text style={styles.rxTenure}>
                            {rx.firstShort !== rx.lastShort
                              ? `${rx.firstShort} → ${rx.lastShort}`
                              : rx.lastDate}
                          </Text>
                          {rx.isPinned && (
                            <Text style={styles.rxPinnedNote}>
                              Ongoing — last prescribed {Math.round((Date.now() - rx.lastRawMs) / 86400000)}d ago
                            </Text>
                          )}
                        </View>
                        <View style={styles.rxFreqCountBadge}>
                          <Text style={styles.rxFreqCountText}>{rx.count}x</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {activeRx.length === 0 && (
                  <Text style={styles.rxEmptyText}>No active medications</Text>
                )}

                {/* Historical Medications — collapsed by default */}
                {historicalRx.length > 0 && (
                  <View style={styles.rxHistoricalSection}>
                    <TouchableOpacity
                      style={styles.rxHistoricalToggle}
                      onPress={() => setShowHistoricalRx(prev => !prev)}
                    >
                      <Text style={styles.rxHistoricalToggleText}>
                        {showHistoricalRx ? 'Hide' : 'Show'} {historicalRx.length} older
                      </Text>
                      <MaterialIcons
                        name={showHistoricalRx ? 'expand-less' : 'expand-more'}
                        size={16}
                        color={COLORS.textMuted}
                      />
                    </TouchableOpacity>
                    {showHistoricalRx && (
                      <View style={{ gap: 10, marginTop: 8 }}>
                        {historicalRx.map((rx, i) => (
                          <View key={i} style={[styles.rxFreqRow, { opacity: 0.65 }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rxFreqName}>{rx.name}</Text>
                              <Text style={styles.rxTenure}>
                                {rx.firstShort !== rx.lastShort
                                  ? `${rx.firstShort} → ${rx.lastShort}`
                                  : rx.lastDate}
                              </Text>
                            </View>
                            <View style={[styles.rxFreqCountBadge, styles.rxHistoricalBadge]}>
                              <Text style={[styles.rxFreqCountText, { color: COLORS.textMuted }]}>{rx.count}x</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
        {/* T4.123: Aggregated lab results summary — collapsible, one row per unique test */}
        {hasLabs && (
          <View style={styles.labSummaryCard}>
            <TouchableOpacity
              style={styles.labSummaryHeader}
              onPress={() => setLabExpanded(prev => !prev)}
            >
              <Text style={styles.labSummaryTitle}>
                YOUR PET'S TEST RESULTS ({labSummary.length})
              </Text>
              <MaterialIcons
                name={labExpanded ? 'expand-less' : 'expand-more'}
                size={20}
                color={COLORS.accent}
              />
            </TouchableOpacity>
            {labExpanded && (
              <View style={styles.labSummaryBody}>
                {labSummary.map((lab, i) => {
                  const statusKey = (lab.status || 'normal').toLowerCase();
                  const statusColor =
                    statusKey === 'critical' ? COLORS.danger :
                    statusKey === 'abnormal' ? COLORS.warning :
                    COLORS.success;
                  const statusBg =
                    statusKey === 'critical' ? '#FFEBEE' :
                    statusKey === 'abnormal' ? '#FFF3E0' :
                    '#E8F5E9';
                  // Amendment 1: positive-negative tests show NEGATIVE/POSITIVE/CRITICAL
                  const chipLabel = lab.resultType === 'positive-negative'
                    ? (statusKey === 'normal' ? 'NEGATIVE' : statusKey === 'critical' ? 'CRITICAL' : 'POSITIVE')
                    : statusKey.toUpperCase();

                  // Trend arrow — only for numeric results with a previous numeric value.
                  // null (not '') so the JSX expression renders nothing when there is no trend.
                  let trendArrow = null;
                  if (lab.numericResult != null && lab.previousNumeric != null) {
                    const diff = lab.numericResult - lab.previousNumeric;
                    if (diff > 0) trendArrow = ' ↑';
                    else if (diff < 0) trendArrow = ' ↓';
                    else trendArrow = ' →';
                  }

                  // Species-resolved reference range display
                  const refDisplay = (() => {
                    const range = lab.referenceRange;
                    if (!range) return null;
                    const speciesKey = petSpecies.toLowerCase().includes('cat') ? 'feline' : 'canine';
                    const resolved = range[speciesKey] || range;
                    if (Array.isArray(resolved) && resolved.length === 2) {
                      return `ref: ${resolved[0]} – ${resolved[1]}${lab.unit ? ` ${lab.unit}` : ''}`;
                    }
                    return null;
                  })();

                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.labSummaryRow}
                      onPress={() => setLabZoom({ open: true, testName: lab.testName })}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.labSummaryTestName}>{lab.testName}</Text>
                        <Text style={styles.labSummaryResult}>
                          {lab.result}{lab.unit ? ` ${lab.unit}` : null}{trendArrow}
                          {lab.previousResult ? ` from ${lab.previousResult}` : null}
                        </Text>
                        {refDisplay && (
                          <Text style={styles.labSummaryRef}>{refDisplay}</Text>
                        )}
                        <Text style={styles.labSummaryDate}>{lab.date}</Text>
                      </View>
                      <Text style={[styles.labSummaryStatusPill, { color: statusColor, backgroundColor: statusBg }]}>
                        {chipLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vitalsChartData, trendsExpanded, activeRx, historicalRx, showHistoricalRx, rxExpanded,
      petSpecies, vaccinationStatuses, vaccineCompleteness, vaccineRecords, vaccineCatalog,
      clinicName, labSummary, labExpanded,
      snapshotCollapsed, latestVitals, latestActiveMeds]);

  useEffect(() => {
    const q = query(
      collection(db, "medical_records"),
      where("petId", "==", petId),
      orderBy("date", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // THE ARCHITECTURAL FIX: We no longer do N+1 Queries!
          // We expect 'prescriptions' and 'serviceType' to live natively on this document.
          records.push({
            id: docSnap.id,
            ...data,
            prescriptions: (data.dispensedProducts || data.prescriptions || []).map(({ price, cost, unitPrice, ...rx }) => rx),
            dischargeSummary: data.dischargeSummary ? {
              ...data.dischargeSummary,
              medications: (data.dischargeSummary.medications || []).map(({ price, cost, unitPrice, ...m }) => m),
            } : undefined,
            serviceType:
              data.serviceType ||
              (data.recordType === "grooming" ? "Grooming" : "Clinical Visit"),
          });
        });
        setHistory(records);
        setLoading(false);
      },
      (error) => {
        console.warn("[PetHistoryScreen] Records listener error:", error.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [petId]);

  // T3.95: Batch-read appointment docs for records that have an appointmentId.
  // Only populates entries where caseDay > 1 (Day 1 is the default, not a badge).
  useEffect(() => {
    if (!history.length) return;
    const recordsWithAppt = history.filter(r => r.appointmentId);
    if (!recordsWithAppt.length) return;

    const fetchCaseDays = async () => {
      const cdMap = {};
      await Promise.all(recordsWithAppt.map(async (rec) => {
        try {
          const apptSnap = await getDoc(doc(db, 'appointments', rec.appointmentId));
          if (apptSnap.exists()) {
            const caseDay = apptSnap.data().caseDay || 1;
            if (caseDay > 1) {
              cdMap[rec.id] = caseDay;
            }
          }
        } catch {
          // Silently skip — missing appointment doc should not break the screen
        }
      }));
      setCaseDayMap(cdMap);
    };
    fetchCaseDays();
  }, [history]);

  // --- PDF GENERATOR ---
  const generatePDF = async (record) => {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const dateStr = formatDisplayDate(record.date);

    const hasDischarge = !!record.dischargeSummary;
    const dsInstructions = record.dischargeSummary?.instructions || '';
    const dsDiagnosis = record.dischargeSummary?.diagnosis || record.diagnosis || '';
    const dsMeds = record.dischargeSummary?.medications || [];

    const rxHtmlFromDischarge = dsMeds.length > 0
      ? `<h3>Medications</h3><ul>${dsMeds.map((med) =>
          `<li><b>${esc(med.name)}</b> x${esc(med.qty || 1)}: ${esc(med.instructions || 'Use as directed')}</li>`
        ).join('')}</ul>`
      : '';

    const dsSupplies = record.dischargeSummary?.supplies || [];
    const suppliesHtmlFromDischarge = dsSupplies.length > 0
      ? `<h3>Take-Home Supplies</h3><ul>${dsSupplies.map((sup) =>
          `<li><b>${esc(sup.name)}</b> x${esc(sup.qty || 1)}${sup.instructions ? `: ${esc(sup.instructions)}` : ''}</li>`
        ).join('')}</ul>`
      : '';

    let rxHtml = '';
    if (record.prescriptions && record.prescriptions.length > 0 && !dsMeds.length) {
      const medications = record.prescriptions.filter(rx =>
        (rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) === 'medicine'
      );
      const nonDrugItems = record.prescriptions.filter(rx =>
        (rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) !== 'medicine'
      );
      rxHtml = [
        medications.length > 0
          ? `<h3>Prescribed Medications</h3><ul>${medications.map((rx) =>
              `<li><b>${esc(rx.name)}${rx.qty ? ` x${esc(rx.qty)}` : ''}</b>: ${esc(rx.instructions || "Use as directed")}</li>`
            ).join("")}</ul>`
          : '',
        nonDrugItems.length > 0
          ? `<h3>Other Items</h3><ul>${nonDrugItems.map((rx) =>
              `<li><b>${esc(rx.name)}${rx.qty ? ` x${esc(rx.qty)}` : ''}</b>: ${esc(rx.instructions || "Use as directed")}</li>`
            ).join("")}</ul>`
          : '',
      ].join('');
    }

    const nextVisitRaw = record.dischargeSummary?.nextVisit || record.nextVisit;
    const nextVisitStr = nextVisitRaw
      ? formatDisplayDate(nextVisitRaw, { month: 'long', day: 'numeric', year: 'numeric' }, null)
      : null;

    // T3.133: Resolve amendments so the PDF reflects the latest amended vitals.
    const pdfVitals = resolveVitals(record);
    const hasAnyVital = Object.values(pdfVitals).some(v => v != null && v !== '');

    const htmlContent = `
      <html>
        <body style="font-family: Helvetica, Arial, sans-serif; padding: 40px; color: #333;">
          <h1 style="color: #8B4513; text-align: center; border-bottom: 2px solid #8B4513; padding-bottom: 10px;">Starbarks Veterinary Clinic</h1>
          <h2 style="text-align: center; margin-top: 0;">Visit Summary</h2>
          <table style="width: 100%; margin-bottom: 30px;">
            <tr><td><b>Patient:</b> ${esc(petName)}</td><td style="text-align: right;"><b>Date:</b> ${esc(dateStr)}</td></tr>
            <tr><td><b>Service:</b> ${esc(record.serviceType)}</td><td style="text-align: right;"><b>Attending Vet:</b> ${esc(record.vetName || "Staff")}</td></tr>
          </table>
          ${hasAnyVital ? `<h3>Vitals</h3>
          <p>
            <b>Weight:</b> ${esc(pdfVitals.weight || "-")} kg &nbsp;&nbsp; | &nbsp;&nbsp;
            <b>Temp:</b> ${esc(pdfVitals.temp || "-")} &deg;C &nbsp;&nbsp; | &nbsp;&nbsp;
            <b>Heart Rate:</b> ${esc(pdfVitals.hr || "-")} bpm
            ${pdfVitals.rr ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>RR:</b> ${esc(pdfVitals.rr)} br/min` : ''}
            ${pdfVitals.crt ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>CRT:</b> ${esc(pdfVitals.crt)} sec` : ''}
            ${pdfVitals.bcs ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>BCS:</b> ${esc(pdfVitals.bcs)}/9` : ''}
            ${pdfVitals.pain ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>Pain:</b> ${esc(pdfVitals.pain)}/10` : ''}
          </p>` : ''}
          ${dsDiagnosis ? `<h3>Diagnosis</h3><p>${esc(dsDiagnosis)}</p>` : ''}
          ${record.patientStatus ? `<p><b>Status:</b> ${esc(record.patientStatus)}</p>` : ''}
          ${hasDischarge && dsInstructions ? `<h3>Discharge Notes</h3><p>${esc(dsInstructions).replace(/\n/g, '<br/>')}</p>` : ''}
          ${hasDischarge ? rxHtmlFromDischarge + suppliesHtmlFromDischarge : rxHtml}
          ${nextVisitStr ? `<h3 style="color: #D32F2F;">Next Follow-Up Due: ${esc(nextVisitStr)}</h3>` : ""}
          <hr style="margin-top: 50px;" />
          <p style="text-align: center; font-size: 12px; color: #888;">This is an electronically generated visit summary and does not require a physical signature.</p>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, {
        UTI: ".pdf",
        mimeType: "application/pdf",
      });
    } catch (error) {
      Alert.alert("Error generating PDF", error.message);
    }
  };

  const handleOpenAttachment = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Cannot open this file."),
    );
  };

  // T4.124: Resets all animated values and closes the lightbox.
  const closeLightbox = () => {
    setLightbox({ open: false, url: null });
    lightboxScale.setValue(1);
    lightboxTranslateX.setValue(0);
    lightboxTranslateX.setOffset(0);
    lightboxTranslateY.setValue(0);
    lightboxTranslateY.setOffset(0);
    lastScale.current = 1;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
  };

  // T4.124: Pinch gesture — offset-based to prevent snap-to-1x on second pinch.
  const onPinchEvent = ({ nativeEvent }) => {
    const newScale = Math.min(4, Math.max(1, lastScale.current * nativeEvent.scale));
    lightboxScale.setValue(newScale);
  };

  const onPinchStateChange = (event) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current = Math.min(4, Math.max(1, lastScale.current * event.nativeEvent.scale));
      lightboxScale.setValue(lastScale.current);
    }
  };

  // T4.124: Double-tap toggles between 1x and 2.5x zoom.
  const onDoubleTap = (event) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      if (lastScale.current > 1) {
        lastScale.current = 1;
        lastTranslateX.current = 0;
        lastTranslateY.current = 0;
        Animated.parallel([
          Animated.spring(lightboxScale, { toValue: 1, useNativeDriver: true }),
          Animated.spring(lightboxTranslateX, { toValue: 0, useNativeDriver: true }),
          Animated.spring(lightboxTranslateY, { toValue: 0, useNativeDriver: true }),
        ]).start();
      } else {
        lastScale.current = 2.5;
        Animated.spring(lightboxScale, { toValue: 2.5, useNativeDriver: true }).start();
      }
    }
  };

  // T4.124: Pan gesture — accumulates offset so next drag starts from current position.
  const onPanEvent = Animated.event(
    [{ nativeEvent: { translationX: lightboxTranslateX, translationY: lightboxTranslateY } }],
    { useNativeDriver: true },
  );

  const onPanStateChange = (event) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastTranslateX.current += event.nativeEvent.translationX;
      lastTranslateY.current += event.nativeEvent.translationY;
      lightboxTranslateX.setOffset(lastTranslateX.current);
      lightboxTranslateX.setValue(0);
      lightboxTranslateY.setOffset(lastTranslateY.current);
      lightboxTranslateY.setValue(0);
    }
  };

  const getStatusColors = (status) => {
    if (!status) return { bg: "#E8F5E9", border: "#A5D6A7", text: "#2E7D32" };
    const s = status.toLowerCase();
    if (s.includes("critical"))
      return { bg: "#FFEBEE", border: "#EF9A9A", text: "#C62828" };
    if (s.includes("guarded"))
      return { bg: "#FFF3E0", border: "#FFCC80", text: "#E65100" };
    return { bg: "#E8F5E9", border: "#A5D6A7", text: "#2E7D32" };
  };

  const renderRecord = ({ item, index }) => {
    const isExpanded = allExpanded || expandedIds.has(item.id);
    const visitDate = formatDisplayDate(item.date);
    const isGrooming =
      item.recordType === "grooming" ||
      item.serviceType?.toLowerCase().includes("grooming");

    // T3.96: Compute whether this record opens a new year section.
    // Compares against filteredHistory[index - 1] so year dividers stay
    // correct after search/filter narrows the list (T3.94).
    const recDate = resolveDate(item.date);
    const recYear = recDate?.getFullYear();
    const prevItem = filteredHistory[index - 1];
    const prevDate = prevItem ? resolveDate(prevItem.date) : null;
    const prevYear = prevDate?.getFullYear();
    const showYearHeader = index === 0 || recYear !== prevYear;

    // Semantic Theme Colors — tokens only, no inline hex
    const themeColor = isGrooming ? COLORS.accentLight : COLORS.info;
    const themeBg = COLORS.cream;

    // Collapsed header: primary diagnosis label
    const diagnosisLabel = item.diagnoses?.[0]?.name || item.diagnosis ||
      (isGrooming ? 'Grooming' : 'Consultation');

    const coerceVital = (v) => {
      if (v == null) return '';
      const s = typeof v === 'number' || typeof v === 'string' ? String(v).trim() : '';
      return s;
    };
    // T3.133: Resolve amendments once per record so amended values are displayed.
    const rv = resolveVitals(item);
    const weightStr = coerceVital(rv.weight);
    const tempStr = coerceVital(rv.temp);
    const hrStr = coerceVital(rv.hr);
    // T3.88: Extended vitals — RR, CRT, BCS, Pain
    const rrStr = coerceVital(rv.rr);
    const crtStr = coerceVital(rv.crt);
    const bcsStr = coerceVital(rv.bcs);
    const painStr = coerceVital(rv.pain);
    const statusColors = getStatusColors(item.patientStatus);

    return (
      <>
        {/* T3.96 / T4.155: Year section header — shown when year changes between consecutive records */}
        {showYearHeader && recYear && (
          <View style={styles.yearHeader}>
            <View style={styles.yearLine} />
            <Text style={styles.yearText}>{recYear}</Text>
            <View style={styles.yearLine} />
          </View>
        )}
        <View style={styles.timelineRow}>
          {/* T4.155: Dot timeline left edge */}
          <View style={styles.timelineGraphic}>
            <TouchableOpacity
              onPress={() => toggleRecord(item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.dotTouchable}
            >
              <View style={[styles.dot, isExpanded ? styles.dotActive : styles.dotDefault]} />
            </TouchableOpacity>
            <View style={styles.line} />
          </View>

          {/* T4.155: Record card with collapsed header + expanded body */}
          <View style={styles.recordCardWrapper}>
            <View style={styles.recordCardShadow} />
            <TouchableOpacity
              style={styles.recordCard}
              onPress={() => toggleRecord(item.id)}
              activeOpacity={0.9}
            >
              {/* COLLAPSED HEADER — always visible */}
              <View style={styles.collapsedHeader}>
                <Text style={styles.collapsedDate}>{visitDate}</Text>
                <Text style={styles.collapsedVet} numberOfLines={1}>
                  {item.vetName || 'Staff'}
                </Text>
                <MaterialIcons
                  name={isExpanded ? 'expand-less' : 'expand-more'}
                  size={18}
                  color={COLORS.accent}
                />
              </View>

              {/* EXPANDED BODY — only when expanded */}
              {isExpanded && (
              <View style={styles.cardBody}>
                {/* Service chips + vet badge in expanded view */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dateText, { color: themeColor }]}>
                      {visitDate}
                    </Text>
                    {/* T3.81: Per-service chips — falls back to [serviceType] for legacy records */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                      {(item.serviceNames?.length > 0 ? item.serviceNames : [item.serviceType]).map((svcName, si) => (
                        <View key={si} style={styles.serviceChip}>
                          <Text style={[styles.serviceChipText, { color: themeColor }]}>{svcName}</Text>
                        </View>
                      ))}
                      {/* T3.95: Case-day badge for multi-day cases */}
                      {caseDayMap[item.id] && (
                        <View style={styles.caseDayBadge}>
                          <Text style={styles.caseDayText}>Day {caseDayMap[item.id]}</Text>
                        </View>
                      )}
                    </View>
                    {/* serviceAttribution: which vet(s) performed each service */}
                    {item.serviceAttribution?.length > 0 && (() => {
                      const attrs = item.serviceAttribution.filter(a => a.staffName);
                      if (attrs.length === 0) return null;
                      const uniqueNames = [...new Set(attrs.map(a => a.staffName))];
                      if (uniqueNames.length === 1) {
                        return (
                          <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, fontStyle: 'italic', marginTop: 2 }}>
                            Performed by: {uniqueNames[0]}
                          </Text>
                        );
                      }
                      return attrs.map((a, ai) => (
                        <Text key={ai} style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, fontStyle: 'italic', marginTop: ai === 0 ? 2 : 1 }}>
                          by {a.staffName}
                        </Text>
                      ));
                    })()}
                  </View>
                  <View style={styles.vetBadge}>
                    <MaterialIcons name="person" size={14} color={COLORS.accent} />
                    <Text style={styles.vetText}>
                      {item.vetName || "Clinic Staff"}
                    </Text>
                  </View>
                </View>
            {!isGrooming && (item.diagnoses?.length > 0 || item.diagnosis) && (
              <View style={styles.diagnosisHero}>
                {(item.diagnoses?.length > 0
                  ? item.diagnoses
                  : [{ name: item.diagnosis }]
                ).map((dx, i) => (
                  <View key={i} style={i > 0 ? { marginTop: 4 } : undefined}>
                    <Text style={styles.diagnosisHeroText}>
                      {dx.name}{dx.severity ? ` (${dx.severity.toUpperCase()})` : ''}
                    </Text>
                    {dx.notes ? (
                      <Text style={styles.diagnosisHeroNotes}>{dx.notes}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {!isGrooming && (item.patientStatus || item.soap?.prognosis) && (
              <View style={styles.statusPrognosisRow}>
                {item.patientStatus && (
                  <Text style={[styles.statusPrognosisText, { color: statusColors.text }]}>
                    {item.patientStatus.toUpperCase()}
                  </Text>
                )}
                {item.patientStatus && item.soap?.prognosis && (
                  <Text style={styles.statusPrognosisDot}>{' · '}</Text>
                )}
                {item.soap?.prognosis && (
                  <Text style={styles.statusPrognosisText}>
                    PROGNOSIS: {item.soap.prognosis.toUpperCase()}
                  </Text>
                )}
              </View>
            )}

            {!isGrooming && item.soap?.subjective && (
              <View style={styles.reasonForVisitBox}>
                <Text style={styles.reasonForVisitLabel}>REASON FOR VISIT</Text>
                <Text style={styles.reasonForVisitText}>{item.soap.subjective}</Text>
              </View>
            )}

            {(item.intakeContext?.clientNotes || item.intakeContext?.staffNotes) && (
              <View style={styles.intakeContextBox}>
                <Text style={styles.intakeContextLabel}>INTAKE NOTES</Text>
                {item.intakeContext.clientNotes ? (
                  <Text style={styles.intakeClientText}>
                    CLIENT: {item.intakeContext.clientNotes}
                  </Text>
                ) : null}
                {item.intakeContext.staffNotes ? (
                  <Text style={styles.intakeStaffText}>
                    STAFF TRIAGE: {item.intakeContext.staffNotes}
                  </Text>
                ) : null}
              </View>
            )}

            {!item.dischargeSummary && !!(item.assessmentNotes || (item.soap?.assessment && item.soap.assessment !== item.diagnosis)) && (
              <View style={styles.assessmentBox}>
                <Text style={styles.assessmentLabel}>VET&apos;S NOTES</Text>
                <Text style={styles.assessmentText}>{item.assessmentNotes || item.soap?.assessment}</Text>
              </View>
            )}

            {!isGrooming && (
              <View style={styles.vitalsGrid}>
                {[
                  { label: 'WEIGHT', value: weightStr, unit: 'kg' },
                  { label: 'TEMP', value: tempStr, unit: '°C' },
                  { label: 'HR', value: hrStr, unit: 'bpm' },
                  { label: 'RR', value: rrStr, unit: 'br/min' },
                  { label: 'CRT', value: crtStr, unit: 'sec' },
                  { label: 'BCS', value: bcsStr, unit: '/9' },
                  { label: 'PAIN', value: painStr, unit: '/10' },
                ].map((v, i) => (
                  <View key={i} style={styles.vitalsGridItem}>
                    <Text style={styles.vitalsGridLabel}>{v.label}</Text>
                    {v.value ? (
                      <Text style={styles.vitalsGridValue}>{v.value} {v.unit}</Text>
                    ) : (
                      <Text style={styles.vitalsGridMissing}>not taken</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* T2.8: Show discharge instructions (client-safe) instead of raw SOAP plan */}
            {!item.dischargeSummary && (
              <View
                style={[
                  styles.planBox,
                  { borderLeftColor: themeColor, backgroundColor: themeBg },
                ]}
              >
                <Text style={[styles.planLabel, { color: themeColor }]}>
                  {isGrooming ? "GROOMING NOTES:" : "INSTRUCTIONS:"}
                </Text>
                <Text style={styles.planText}>
                  {isGrooming
                    ? (item.treatment || "No grooming notes recorded.")
                    : "Visit summary not yet available for this record."}
                </Text>
              </View>
            )}

            {!item.dischargeSummary && item.prescriptions?.filter(rx =>
              (rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail')) === 'medicine'
            ).length > 0 && (
              <View style={styles.rxBox}>
                <Text style={styles.rxTitle}>PRESCRIBED MEDICATIONS</Text>
                {item.prescriptions.filter(rx =>
                  (rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail')) === 'medicine'
                ).map((rx, idx) => (
                  <View key={idx} style={styles.rxItem}>
                    <Text style={styles.rxName}>
                      {rx.name}{rx.qty ? ` x${rx.qty}` : ''}
                    </Text>
                    <Text style={styles.rxSig}>
                      {rx.instructions || "Use as directed"}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {!item.dischargeSummary && item.prescriptions?.filter(rx => {
              const pc = rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
              return pc !== 'medicine';
            }).length > 0 && (
              <View style={styles.rxBox}>
                <Text style={styles.rxTitle}>OTHER ITEMS</Text>
                {item.prescriptions.filter(rx => {
                  const pc = rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
                  return pc !== 'medicine';
                }).map((rx, idx) => (
                  <View key={idx} style={styles.rxItem}>
                    <Text style={styles.rxName}>
                      {rx.name}{rx.qty ? ` x${rx.qty}` : ''}
                    </Text>
                    <Text style={styles.rxSig}>
                      {rx.instructions || ""}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {(() => {
              // Safety invariant: pet owners only see attachments explicitly
              // shared by the vet. Strict === true check — undefined and false
              // must both be excluded.
              const visibleAttachments = (item.attachments || []).filter(
                a => a.clientVisible === true
              );
              return visibleAttachments.length > 0 && (
                <View style={styles.attachmentBox}>
                  <Text style={styles.attachmentTitle}>
                    Documents &amp; Photos
                  </Text>
                  <View style={styles.attachmentList}>
                    {visibleAttachments.map((file, idx) => {
                      const isImage = file.mimeType?.startsWith('image/');
                      const uploadDate = file.uploadedAt
                        ? (file.uploadedAt.toDate
                            ? file.uploadedAt.toDate()
                            : new Date(file.uploadedAt))
                        : null;
                      if (isImage) {
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={styles.attachmentChip}
                            onPress={() => setLightbox({ open: true, url: file.url })}
                          >
                            <Image
                              source={{ uri: file.url }}
                              style={styles.attachmentThumbnail}
                              resizeMode="cover"
                            />
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={styles.attachmentChipText}>
                                {file.label || file.fileName || `Photo ${idx + 1}`}
                              </Text>
                              {uploadDate && (
                                <Text style={styles.attachmentDate}>
                                  {uploadDate.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={styles.attachmentChip}
                          onPress={() => handleOpenAttachment(file.url || file)}
                        >
                          <MaterialIcons name="description" size={24} color={COLORS.info} style={{ marginRight: 8 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.attachmentChipText}>
                              {file.label || file.fileName || `Document ${idx + 1}`}
                            </Text>
                            {uploadDate && (
                              <Text style={styles.attachmentDate}>
                                {uploadDate.toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })()}

            {item.dischargeSummary && (() => {
              const ds = item.dischargeSummary;
              const doThisItems = (ds.instructions || '')
                .split('\n')
                .map(s => s.trim())
                .filter(Boolean);
              const nextVisitStr = ds.nextVisit
                ? formatDisplayDate(ds.nextVisit, { weekday: 'long', month: 'long', day: 'numeric' }, null)
                : null;
              const nextVisitDate = ds.nextVisit
                ? (typeof ds.nextVisit?.toDate === 'function' ? ds.nextVisit.toDate()
                   : ds.nextVisit?.seconds != null ? new Date(ds.nextVisit.seconds * 1000)
                   : ds.nextVisit instanceof Date ? ds.nextVisit
                   : new Date(ds.nextVisit))
                : null;

              return (
                <View style={styles.dischargeCard}>
                  <View style={styles.dischargeHeaderRow}>
                    <MaterialIcons name="assignment" size={14} color={COLORS.accent} />
                    <Text style={styles.dischargeHeader}>DISCHARGE NOTES</Text>
                    {ds.patientStatus && (
                      <Text style={styles.dischargeStatusPill}>{ds.patientStatus}</Text>
                    )}
                  </View>

                  {doThisItems.length > 0 && (
                    <View style={styles.dischargeSection}>
                      <Text style={styles.dischargeSectionLabel}>DO THIS</Text>
                      {doThisItems.map((line, i) => (
                        <Text key={i} style={styles.dischargeBullet}>• {line}</Text>
                      ))}
                    </View>
                  )}

                  {ds.medications && ds.medications.length > 0 && (
                    <View style={styles.dischargeSection}>
                      <Text style={styles.dischargeSectionLabel}>MEDICATIONS</Text>
                      {ds.medications.map((med, i) => (
                        <View key={i} style={styles.dischargeMedRow}>
                          <Text style={styles.dischargeMedName}>{med.name}</Text>
                          <Text style={styles.dischargeMedMeta}>
                            ×{med.qty || 1} — {med.instructions || 'Use as directed'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {ds.supplies && ds.supplies.length > 0 && (
                    <View style={styles.dischargeSection}>
                      <Text style={styles.dischargeSectionLabel}>TAKE-HOME SUPPLIES</Text>
                      {ds.supplies.map((sup, i) => (
                        <View key={i} style={styles.dischargeMedRow}>
                          <Text style={styles.dischargeMedName}>{sup.name}</Text>
                          <Text style={styles.dischargeMedMeta}>
                            x{sup.qty || 1}{sup.instructions ? ` — ${sup.instructions}` : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* T4.155 Day 2: Gap 4 — recheck interval from ClinicalWorkspace discharge form */}
                  {ds.recheckIn && (
                    <View style={styles.dischargeRecheckRow}>
                      <MaterialIcons name="replay" size={14} color={COLORS.accent} />
                      <Text style={styles.dischargeRecheckText}>Recheck in: {ds.recheckIn}</Text>
                    </View>
                  )}

                  {nextVisitStr && (
                    <View style={styles.dischargeNextVisit}>
                      <MaterialIcons name="event" size={14} color={COLORS.warning} />
                      <Text style={styles.dischargeNextVisitText}>
                        Follow up <Text style={styles.dischargeNextVisitDate}>{nextVisitStr}</Text>
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.dischargeCallBtn, !clinicPhone && styles.dischargeCallBtnDisabled]}
                    onPress={() => {
                      if (!clinicPhone) return;
                      Linking.openURL(`tel:${clinicPhone}`);
                    }}
                    disabled={!clinicPhone}
                  >
                    <MaterialIcons name="phone" size={14} color={COLORS.white} />
                    <Text style={styles.dischargeCallBtnText}>Call Us</Text>
                  </TouchableOpacity>

                  {nextVisitDate && (
                    <TouchableOpacity
                      style={styles.dischargeFollowUpBtn}
                      onPress={() => navigation.navigate('BookAppointment', {
                        prefillPetId: petId,
                        prefillServiceType: item.serviceType || null,
                        prefillDate: nextVisitDate.toISOString(),
                        prefillDateMatchType: 'exact',
                        prefillTargetDate: nextVisitDate.toISOString(),
                        fromFollowUp: true,
                      })}
                    >
                      <Text style={styles.dischargeFollowUpBtnText}>Book Follow-Up</Text>
                    </TouchableOpacity>
                  )}

                  {ds.vetName && (
                    <Text style={styles.dischargeSignature}>Signed by {ds.vetName}</Text>
                  )}
                </View>
              );
            })()}

            {/* VACCINATION RECORD — supports multi-vaccine via vaccineAdministrations[] with legacy fallback */}
            {(item.vaccineAdministrations?.length > 0 || item.vaccineData) && (
              <View style={styles.vaccineCard}>
                <Text style={styles.vaccineHeader}>VACCINATION RECORD</Text>
                {(item.vaccineAdministrations || (item.vaccineData ? [item.vaccineData] : [])).map((vax, vIdx) => (
                  <View key={vIdx} style={vIdx > 0 ? styles.vaccineEntryDivider : undefined}>
                    <Text style={styles.vaccineName}>{vax.vaccineName}</Text>
                    <View style={styles.vaccineGrid}>
                      {vax.manufacturer && (
                        <View style={styles.vaccineCell}>
                          <Text style={styles.vaccineCellLabel}>MFR</Text>
                          <Text style={styles.vaccineCellValue}>{vax.manufacturer}</Text>
                        </View>
                      )}
                      {vax.lotNumber && (
                        <View style={styles.vaccineCell}>
                          <Text style={styles.vaccineCellLabel}>LOT</Text>
                          <Text style={styles.vaccineCellValue}>{vax.lotNumber}</Text>
                        </View>
                      )}
                      {vax.routeOfAdmin && (
                        <View style={styles.vaccineCell}>
                          <Text style={styles.vaccineCellLabel}>ROUTE</Text>
                          <Text style={styles.vaccineCellValue}>{vax.routeOfAdmin}</Text>
                        </View>
                      )}
                      {vax.siteOfInjection && (
                        <View style={styles.vaccineCell}>
                          <Text style={styles.vaccineCellLabel}>SITE</Text>
                          <Text style={styles.vaccineCellValue}>{vax.siteOfInjection}</Text>
                        </View>
                      )}
                    </View>
                    {vax.dueDate && (
                      <View style={styles.vaccineDueBanner}>
                        <Text style={styles.vaccineDueText}>Next dose due {vax.dueDate}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* LAB RESULTS */}
            {item.labResults?.length > 0 && (
              <View style={styles.labCard}>
                <Text style={styles.labHeader}>LAB RESULTS</Text>
                {item.labResults.map((lab, i) => {
                  const statusKey = (lab.status || 'normal').toLowerCase();
                  const statusColor =
                    statusKey === 'critical' ? COLORS.danger :
                    statusKey === 'abnormal' ? COLORS.warning :
                    COLORS.success;
                  const statusBg =
                    statusKey === 'critical' ? '#FFEBEE' :
                    statusKey === 'abnormal' ? '#FFF3E0' :
                    '#E8F5E9';

                  // Amendment 1: derive display label from resultType for positive-negative tests
                  const chipLabel = lab.resultType === 'positive-negative'
                    ? (statusKey === 'normal' ? 'NEGATIVE' : statusKey === 'critical' ? 'CRITICAL' : 'POSITIVE')
                    : statusKey.toUpperCase();

                  // Species-resolved reference range — petSpecies is available in component scope
                  const refRangeNode = (() => {
                    const range = lab.referenceRange || null;
                    if (!range) return null;
                    const speciesKey = petSpecies.toLowerCase().includes('cat') ? 'feline' : 'canine';
                    const resolved = range[speciesKey] || range;
                    if (Array.isArray(resolved) && resolved.length === 2) {
                      return (
                        <Text style={styles.labRefRange}>
                          {`Ref: ${resolved[0]} – ${resolved[1]}${lab.unit ? ` ${lab.unit}` : ''}`}
                        </Text>
                      );
                    }
                    return null;
                  })();

                  return (
                    <View key={i} style={styles.labRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.labTestName}>{lab.testName}</Text>
                        <Text style={styles.labResult}>
                          {lab.result}{lab.unit ? ` ${lab.unit}` : ''}
                        </Text>
                        {refRangeNode}
                        {/* T4.155 Day 2: Gap 5 — lab notes */}
                        {lab.notes ? (
                          <Text style={styles.labNotes}>{lab.notes}</Text>
                        ) : null}
                        {/* T4.155 Day 2: Gap 6 — lab attachment URL */}
                        {lab.attachmentUrl ? (
                          <TouchableOpacity
                            style={styles.labAttachmentLink}
                            onPress={() => Linking.openURL(lab.attachmentUrl).catch(() =>
                              Alert.alert('Error', 'Cannot open this attachment.')
                            )}
                          >
                            <MaterialIcons name="attach-file" size={12} color={COLORS.sky} />
                            <Text style={styles.labAttachmentText}>View attachment</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={[styles.labStatusPill, { color: statusColor, backgroundColor: statusBg }]}>
                        {chipLabel}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* T3.90: Amendments history */}
            {item.amendments?.length > 0 && (
              <View style={styles.amendmentCard}>
                <Text style={styles.amendmentHeader}>AMENDMENTS ({item.amendments.length})</Text>
                {[...item.amendments]
                  .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
                  .map((amend, idx) => {
                    const ts = amend.timestamp?.toDate
                      ? amend.timestamp.toDate()
                      : (amend.timestamp?.seconds ? new Date(amend.timestamp.seconds * 1000) : null);
                    const metaLine = `${amend.vetName || 'Clinician'}${ts ? ` — ${ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`;

                    // T3.99: Structured amendment — render mini SOAP card with orange theme
                    if (amend.type === 'structured') {
                      return (
                        <View key={idx} style={styles.amendmentEntry}>
                          <Text style={styles.amendmentReason}>AMENDMENT: {amend.reason}</Text>

                          {/* SOAP fields — only non-empty ones */}
                          {[
                            { key: 'subjective', label: 'S' },
                            { key: 'objective',  label: 'O' },
                            { key: 'assessment', label: 'A' },
                            { key: 'plan',       label: 'P' },
                          ].filter(({ key }) => amend.soap?.[key]).map(({ key, label }) => (
                            <View key={key} style={styles.amendSoapRow}>
                              <Text style={styles.amendSoapLabel}>{label}</Text>
                              <Text style={styles.amendmentText}>{amend.soap[key]}</Text>
                            </View>
                          ))}

                          {/* Vitals row — only if any field is non-empty */}
                          {amend.vitals && Object.values(amend.vitals).some(v => v) ? (
                            <View style={styles.amendVitalsRow}>
                              {[
                                { label: 'Wt',   val: amend.vitals.weight ? `${amend.vitals.weight} kg` : null },
                                { label: 'Temp', val: amend.vitals.temp   ? `${amend.vitals.temp} °C`   : null },
                                { label: 'HR',   val: amend.vitals.hr     ? `${amend.vitals.hr} bpm`    : null },
                                { label: 'RR',   val: amend.vitals.rr     ? `${amend.vitals.rr} rpm`    : null },
                                { label: 'CRT',  val: amend.vitals.crt    ? `${amend.vitals.crt}s`      : null },
                                { label: 'BCS',  val: amend.vitals.bcs    ? `${amend.vitals.bcs}/9`     : null },
                                { label: 'Pain', val: amend.vitals.pain   ? `${amend.vitals.pain}/4`    : null },
                              ].filter(e => e.val).map(({ label, val }) => (
                                <Text key={label} style={styles.amendVitalChip}>{label}: {val}</Text>
                              ))}
                            </View>
                          ) : null}

                          {/* Added medications */}
                          {amend.addedMedications?.length > 0 ? (
                            <View style={{ marginTop: 4 }}>
                              <Text style={styles.amendSoapLabel}>ADDED MEDICATIONS</Text>
                              {amend.addedMedications.map((med, j) => (
                                <Text key={j} style={styles.amendmentText}>
                                  {med.name}{med.qty ? ` x${med.qty}` : ''}{med.instructions ? ` — ${med.instructions}` : ''}
                                </Text>
                              ))}
                            </View>
                          ) : null}

                          <Text style={styles.amendmentMeta}>{metaLine}</Text>
                        </View>
                      );
                    }

                    // Legacy text blob — unchanged rendering
                    return (
                      <View key={idx} style={styles.amendmentEntry}>
                        {amend.reason ? (
                          <Text style={styles.amendmentReason}>Reason: {amend.reason}</Text>
                        ) : null}
                        <Text style={styles.amendmentText}>{amend.text}</Text>
                        <Text style={styles.amendmentMeta}>{metaLine}</Text>
                      </View>
                    );
                  })}
              </View>
            )}

            {item.nextVisit && (
              <View style={styles.reminderBanner}>
                <MaterialIcons name="event" size={16} color={COLORS.danger} />
                <Text style={styles.reminderText}>
                  NEXT VISIT DUE:{" "}
                  {safeDate(item.nextVisit, { month: "long", day: "numeric", year: "numeric" }, "an upcoming date")}
                </Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => generatePDF(item)}>
                <MaterialIcons name="picture-as-pdf" size={16} color={COLORS.accent} />
                <Text style={styles.actionBtnText}>Visit Summary</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => generatePDF(item)}>
                <MaterialIcons name="share" size={16} color={COLORS.accent} />
                <Text style={styles.actionBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
          )}
        </TouchableOpacity>
        </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerBox}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back-ios" size={20} color={COLORS.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{petName.toUpperCase()}&apos;S CHART</Text>
        <Text style={styles.recordCountHeader}>
          {filteredHistory.length} RECORD{filteredHistory.length !== 1 ? 'S' : ''}
        </Text>
      </View>

      {/* T3.94: Search + filter bar — shown once records have loaded */}
      {!loading && history.length > 0 && (
        <View style={styles.searchFilterBar}>
          <View style={styles.searchInputWrapper}>
            <MaterialIcons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search records..."
              placeholderTextColor={COLORS.placeholder}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <MaterialIcons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            <View style={styles.searchDivider} />
            <TouchableOpacity onPress={toggleAll} style={styles.expandToggleInSearch}>
              <MaterialIcons
                name={allExpanded ? 'unfold-less' : 'unfold-more'}
                size={18}
                color={COLORS.accent}
              />
            </TouchableOpacity>
            <View style={styles.searchDivider} />
            <TouchableOpacity
              style={styles.filterIconBtn}
              onPress={() => { setPendingFilters(new Set(activeFilters)); setFilterSheetOpen(true); }}
            >
              <MaterialIcons name="filter-list" size={20} color={COLORS.accent} />
              {activeFilters.size > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilters.size}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

        </View>
      )}

      <View style={styles.container}>
        {loading ? (
          !isConnected ? (
            <View style={styles.offlineContainer}>
              <MaterialIcons name="wifi-off" size={48} color={COLORS.textMuted} />
              <Text style={styles.offlineTitle}>NO INTERNET CONNECTION</Text>
              <Text style={styles.offlineSub}>
                Connect to the internet to load medical records.
              </Text>
            </View>
          ) : (
            /* T4.155 Day 3: Loading skeleton — mimics 4 collapsed record cards */
            <View style={styles.skeletonContainer}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={styles.skeletonRow}>
                  <View style={styles.skeletonDot} />
                  <View style={styles.skeletonCard}>
                    <View style={styles.skeletonLine1} />
                    <View style={styles.skeletonLine2} />
                  </View>
                </View>
              ))}
            </View>
          )
        ) : (
          <>
            {/* T4.155: Month picker horizontal strip — only when 2+ months present */}
            {months.length > 1 && (
              <>
                {years.length >= 2 && (
                  <View style={styles.yearDropdownRow}>
                    {years.map(y => (
                      <TouchableOpacity
                        key={y}
                        style={[styles.yearChip, selectedYear === y && styles.yearChipActive]}
                        onPress={() => {
                          setSelectedYear(y);
                          const firstVisible = months.find(m => m.key.startsWith(y));
                          if (firstVisible) setActiveMonth(firstVisible.key);
                        }}
                      >
                        <Text style={[styles.yearChipText, selectedYear === y && styles.yearChipTextActive]}>
                          {y}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <ScrollView
                  ref={monthPickerRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.monthPickerStrip}
                  contentContainerStyle={styles.monthPickerContent}
                >
                  {visibleMonths.map(m => (
                    <TouchableOpacity
                      key={m.key}
                      style={[
                        styles.monthChip,
                        activeMonth === m.key && styles.monthChipActive,
                      ]}
                      onPress={() => scrollToMonth(m.key, m.firstIndex)}
                    >
                      <Text style={[
                        styles.monthChipText,
                        activeMonth === m.key && styles.monthChipTextActive,
                      ]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <FlatList
              ref={flatListRef}
              data={filteredHistory}
              keyExtractor={(item) => item.id}
              renderItem={renderRecord}
              contentContainerStyle={{ padding: 20, paddingBottom: 150 }}
              ListHeaderComponent={listHeader}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={COLORS.sky}
                  colors={[COLORS.sky]}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="folder-open" size={48} color={COLORS.textMuted} />
                  <Text style={styles.emptyText}>NO MEDICAL RECORDS</Text>
                  <Text style={styles.emptySub}>
                    Visit summaries and lab results will appear here after a
                    consultation.
                  </Text>
                </View>
              }
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              onScrollToIndexFailed={(info) => {
                flatListRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
              }}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          </>
        )}
      </View>

      {/* T4.97: Floating AI button — feature-gated on workerUrl and records present */}
      {!!workerUrl && !loading && history.length > 0 && (
        <TouchableOpacity
          style={styles.aiFab}
          activeOpacity={0.85}
          onPress={() => setAiSheetVisible(true)}
        >
          <View style={styles.aiFabShadow} />
          <View style={styles.aiFabInner}>
            <MaterialIcons name="auto-awesome" size={20} color={COLORS.cream} />
            <Text style={styles.aiFabText}>Ask AI</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* T4.97: AI Pet History bottom sheet */}
      <PetHistoryAISheet
        visible={aiSheetVisible}
        onClose={() => setAiSheetVisible(false)}
        petName={petName}
        systemPrompt={aiSystemPrompt}
        workerUrl={workerUrl}
        userId={auth.currentUser?.uid || 'anonymous'}
      />

      {/* T4.113: Vitals zoom modal — slide-up full-width chart for the tapped vital */}
      <VitalsZoomModal
        visible={vitalsZoom.open}
        onClose={() => setVitalsZoom({ open: false, key: null })}
        vitalLabel={vitalsZoom.key ? VITALS_CONFIG[vitalsZoom.key].label : ''}
        data={vitalsZoom.key ? vitalsChartData[vitalsZoom.key] : []}
        unit={vitalsZoom.key ? VITALS_CONFIG[vitalsZoom.key].unit : ''}
        lineColor={vitalsZoom.key ? VITALS_CONFIG[vitalsZoom.key].color : COLORS.info}
        normalRange={
          vitalsZoom.key && VITALS_CONFIG[vitalsZoom.key]?.refKey
            ? getNormalRange(VITALS_CONFIG[vitalsZoom.key].refKey, petSpecies)
            : null
        }
        yDomain={vitalsZoom.key ? (VITAL_Y_DOMAINS[vitalsZoom.key] ?? null) : null}
        petName={petName}
      />
      {/* T4.123: Lab results zoom modal — test selector + SparkLine chart + chronological list */}
      <LabZoomModal
        visible={labZoom.open}
        onClose={() => setLabZoom({ open: false, testName: null })}
        petName={petName}
        petSpecies={petSpecies}
        initialTest={labZoom.testName}
        timeline={labTimeline}
        uniqueTests={labUniqueTests}
      />

      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <TouchableOpacity style={styles.filterOverlay} activeOpacity={1} onPress={() => setFilterSheetOpen(false)}>
          <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>FILTER BY DEPARTMENT</Text>
            <ScrollView style={styles.filterSheetScroll}>
              {filterOptions.filter(o => o !== 'All').map(opt => {
                const isChecked = pendingFilters.has(opt);
                const count = departmentCounts.get(opt) || 0;
                return (
                  <TouchableOpacity key={opt} style={styles.filterSheetRow} onPress={() => {
                    setPendingFilters(prev => {
                      const next = new Set(prev);
                      if (next.has(opt)) next.delete(opt); else next.add(opt);
                      return next;
                    });
                  }}>
                    <MaterialIcons name={isChecked ? 'check-box' : 'check-box-outline-blank'} size={22} color={isChecked ? COLORS.sky : COLORS.textMuted} />
                    <Text style={styles.filterSheetLabel}>{opt}</Text>
                    <Text style={styles.filterSheetCount}>({count})</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.filterSheetActions}>
              <TouchableOpacity onPress={() => setPendingFilters(new Set())} style={styles.filterSheetClearBtn}>
                <Text style={styles.filterSheetClearText}>CLEAR ALL</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setActiveFilters(new Set(pendingFilters)); setFilterSheetOpen(false); }} style={styles.filterSheetApplyBtn}>
                <Text style={styles.filterSheetApplyText}>APPLY FILTER</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* T4.124: Full-screen image lightbox — pinch-to-zoom, double-tap to toggle, pan when zoomed */}
      <Modal
        visible={lightbox.open}
        transparent
        animationType="fade"
        onRequestClose={closeLightbox}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.lightboxOverlay}>
            <TouchableOpacity
              style={styles.lightboxClose}
              onPress={closeLightbox}
            >
              <MaterialIcons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <PinchGestureHandler
              onGestureEvent={onPinchEvent}
              onHandlerStateChange={onPinchStateChange}
            >
              <Animated.View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <TapGestureHandler numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
                  <Animated.View>
                    <PanGestureHandler
                      onGestureEvent={onPanEvent}
                      onHandlerStateChange={onPanStateChange}
                      minDist={10}
                    >
                      <Animated.Image
                        source={{ uri: lightbox.url }}
                        style={[
                          styles.lightboxImage,
                          {
                            transform: [
                              { scale: lightboxScale },
                              { translateX: lightboxTranslateX },
                              { translateY: lightboxTranslateY },
                            ],
                          },
                        ]}
                        resizeMode="contain"
                      />
                    </PanGestureHandler>
                  </Animated.View>
                </TapGestureHandler>
              </Animated.View>
            </PinchGestureHandler>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  container: { flex: 1, backgroundColor: COLORS.cream },

  // --- Header ---
  headerBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.cream,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.brand,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    flex: 1,
    marginLeft: 12,
  },
  recordCountHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1,
  },

  // --- Offline state ---
  offlineContainer: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 40,
  },
  offlineTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  offlineSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },

  // --- T4.155: Timeline row + dot timeline ---
  timelineRow: { flexDirection: "row", marginBottom: 16 },
  timelineGraphic: { width: 20, alignItems: "center" },
  dotTouchable: { zIndex: 2, marginTop: 18 },
  dot: { zIndex: 2 },
  dotDefault: {
    width: 8,
    height: 8,
    backgroundColor: COLORS.sky,
    borderRadius: 4,  // Exception: dots are circles by convention
  },
  dotActive: {
    width: 12,
    height: 12,
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.sky,
    borderRadius: 6,  // Exception: dots are circles
  },
  line: {
    position: "absolute",
    top: 0,
    bottom: -16,
    left: 9,
    width: 3,
    backgroundColor: COLORS.sky,
    zIndex: 1,
  },

  // --- T4.155: Record card with neubrutalist offset shadow ---
  recordCardWrapper: {
    flex: 1,
    position: 'relative',
    marginLeft: 8,
  },
  recordCardShadow: {
    ...SHADOW.record,
  },
  recordCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    overflow: "hidden",
  },

  // --- T4.155: Collapsed header row ---
  collapsedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 50,
    gap: 6,
  },
  collapsedDate: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    minWidth: 55,
  },
  collapsedVet: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: COLORS.cream,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dateText: { fontWeight: "900", fontSize: 14, marginBottom: 2, color: COLORS.accent },
  serviceText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  vetBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.cream,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  vetText: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: "bold",
    marginLeft: 4,
  },

  cardBody: { padding: 12 },

  // --- Intake context ---
  intakeContextBox: {
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12,
    marginBottom: 10,
    borderRadius: 0,
  },
  intakeContextLabel: {
    fontWeight: '900',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  intakeClientText: {
    fontSize: 13,
    color: COLORS.info,
    fontWeight: '700',
    marginBottom: 2,
  },
  intakeStaffText: {
    fontSize: 13,
    color: COLORS.warning,
    fontWeight: '700',
  },

  // --- Diagnosis hero ---
  diagnosisHero: { marginBottom: 12 },
  diagnosisHeroText: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.brand,
    lineHeight: 26,
  },
  diagnosisHeroNotes: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // --- Status + Prognosis merged line ---
  statusPrognosisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  statusPrognosisText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusPrognosisDot: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // --- Reason for visit ---
  reasonForVisitBox: {
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12,
    marginBottom: 12,
    borderRadius: 0,
  },
  reasonForVisitLabel: {
    fontWeight: '900',
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  reasonForVisitText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },

  // --- Vitals grid ---
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  vitalsGridItem: {
    alignItems: 'center',
    minWidth: 70,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
    backgroundColor: COLORS.cream,
  },
  vitalsGridLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  vitalsGridValue: { fontSize: 15, fontWeight: '900', color: COLORS.brand },
  vitalsGridMissing: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  planBox: {
    padding: 12,
    borderRadius: 0,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  planLabel: {
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planText: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 22, fontWeight: "500" },

  rxBox: {
    backgroundColor: COLORS.cream,
    padding: 12,
    borderRadius: 0,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  rxTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.warning,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  rxItem: { marginBottom: 8 },
  rxName: { fontSize: 14, fontWeight: "900", color: COLORS.brand },
  rxSig: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: "italic",
    marginLeft: 8,
    marginTop: 2,
  },

  attachmentBox: { marginBottom: 10 },
  attachmentTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.accent,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  attachmentList: { flexDirection: "column", gap: 8 },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.cream,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  attachmentChipText: { color: COLORS.info, fontSize: 12, fontWeight: "bold" },
  attachmentThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  attachmentDate: { fontSize: 10, color: COLORS.textMuted, marginTop: 1 },

  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
    borderRadius: 0,
  },
  lightboxImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.7,
  },

  reminderBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.cream,
    padding: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.danger,
  },
  reminderText: { color: COLORS.danger, fontWeight: "900", fontSize: 13 },

  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    backgroundColor: COLORS.white,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyText: {
    color: COLORS.brand,
    fontWeight: "900",
    fontSize: 18,
    textAlign: "center",
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  emptySub: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  // --- T4.155 Day 3: Loading skeleton ---
  skeletonContainer: {
    padding: 20,
    gap: 16,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skeletonDot: {
    width: 8,
    height: 8,
    backgroundColor: COLORS.borderLight,
    borderRadius: 4,
    marginTop: 18,
  },
  skeletonCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
    padding: 14,
    gap: 8,
  },
  skeletonLine1: {
    height: 12,
    backgroundColor: COLORS.borderLight,
    borderRadius: 0,
    width: '70%',
  },
  skeletonLine2: {
    height: 10,
    backgroundColor: COLORS.borderLight,
    borderRadius: 0,
    width: '40%',
  },

  // --- Discharge card (B4) ---
  dischargeCard: {
    marginTop: 12,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: COLORS.cream,
    borderRadius: 0,
  },
  dischargeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  dischargeHeader: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flex: 1,
  },
  dischargeStatusPill: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.success,
    backgroundColor: COLORS.cream,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  dischargeSection: {
    marginBottom: 10,
  },
  dischargeSectionLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.textMuted,
    marginBottom: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dischargeBullet: {
    fontSize: 14,
    color: COLORS.brand,
    lineHeight: 20,
    marginLeft: 6,
    marginBottom: 3,
  },
  dischargeMedRow: {
    backgroundColor: COLORS.white,
    borderRadius: 0,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  dischargeMedName: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.brand,
  },
  dischargeMedMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  dischargeNextVisit: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.cream,
    padding: 10,
    borderRadius: 0,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.warning,
    gap: 6,
  },
  dischargeNextVisitText: {
    fontSize: 13,
    color: COLORS.accent,
    flex: 1,
  },
  dischargeNextVisitDate: {
    fontWeight: "900",
    color: COLORS.warning,
  },
  dischargeCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 0,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  dischargeCallBtnDisabled: {
    backgroundColor: COLORS.borderLight,
    borderColor: COLORS.borderLight,
  },
  dischargeCallBtnText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dischargeFollowUpBtn: {
    backgroundColor: COLORS.cream,
    paddingVertical: 12,
    borderRadius: 0,
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 2,
    borderColor: COLORS.warning,
  },
  dischargeFollowUpBtnText: {
    color: COLORS.warning,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dischargeSignature: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: "italic",
    textAlign: "right",
    marginTop: 4,
  },
  // T4.155 Day 2: Gap 4 — recheck interval
  dischargeRecheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
  },
  dischargeRecheckText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },

  // --- Vaccine card (B4) ---
  vaccineCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: COLORS.cream,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  vaccineEntryDivider: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  vaccineHeader: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.warning,
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  vaccineName: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.brand,
    marginBottom: 8,
  },
  vaccineGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  vaccineCell: {
    backgroundColor: COLORS.white,
    borderRadius: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    minWidth: 70,
  },
  vaccineCellLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 1,
    textTransform: 'uppercase',
  },
  vaccineCellValue: {
    fontSize: 12,
    color: COLORS.brand,
    fontWeight: "700",
  },
  vaccineDueBanner: {
    backgroundColor: COLORS.cream,
    padding: 8,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  vaccineDueText: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: "900",
    textAlign: "center",
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // --- Lab results card (B4) ---
  labCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: COLORS.cream,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.info,
  },
  labHeader: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.info,
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  labRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 10,
    borderRadius: 0,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  labTestName: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.brand,
  },
  labResult: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  labRefRange: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  labStatusPill: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
    overflow: "hidden",
    textTransform: "uppercase",
  },
  // T4.155 Day 2: Gap 5 — lab notes
  labNotes: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  // T4.155 Day 2: Gap 6 — lab attachment link
  labAttachmentLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  labAttachmentText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.sky,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // T4.123: Lab summary card (collapsible, same pattern as trendsCard / rxFreqCard)
  labSummaryCard: {
    marginBottom: 20,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
  },
  labSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  labSummaryTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  labSummaryBody: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    padding: 14,
    gap: 10,
  },
  labSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    padding: 10,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  labSummaryTestName: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.brand,
  },
  labSummaryResult: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  labSummaryRef: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  labSummaryDate: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  labSummaryStatusPill: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },

  // T3.81: Service chips
  serviceChip: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
  },
  serviceChipText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // T3.95: Case-day badge
  caseDayBadge: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 0,
  },
  caseDayText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // T3.89: SOAP Assessment block
  assessmentBox: {
    padding: 12,
    backgroundColor: COLORS.cream,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
    marginBottom: 12,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  assessmentLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.success,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  assessmentText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },

  // T3.90: Amendments history
  amendmentCard: {
    marginTop: 12,
    padding: 14,
    backgroundColor: COLORS.cream,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  amendmentHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.warning,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  amendmentEntry: {
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    marginBottom: 10,
    paddingVertical: 6,
  },
  amendmentReason: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.warning,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  amendmentText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  amendmentMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // T3.99: Structured amendment sub-components
  amendSoapRow: {
    marginBottom: 4,
  },
  amendSoapLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  amendVitalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    padding: 8,
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 0,
  },
  amendVitalChip: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.warning,
  },

  // T3.96: Year section dividers
  yearHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  yearLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  yearText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // T4.97: Floating "Ask AI" action button
  aiFab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    zIndex: 100,
  },
  aiFabShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  aiFabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.sky,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,   // Neubrutalism
  },
  aiFabText: {
    color: COLORS.cream,
    fontWeight: '900',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // T3.94: Search + filter bar
  searchFilterBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.cream,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    padding: 0,
  },
  searchDivider: {
    width: 1,
    height: 18,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 4,
  },
  expandToggleInSearch: {
    padding: 4,
  },
  filterIconBtn: {
    padding: 4,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.danger,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.white,
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: COLORS.cream,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
    paddingBottom: 30,
    maxHeight: '60%',
  },
  filterSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.borderLight,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  filterSheetTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  filterSheetScroll: {
    paddingHorizontal: 20,
  },
  filterSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  filterSheetLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.brand,
  },
  filterSheetCount: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  filterSheetActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  filterSheetClearBtn: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  filterSheetClearText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterSheetApplyBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: COLORS.sky,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    alignItems: 'center',
  },
  filterSheetApplyText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.cream,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // T4.155: Month picker horizontal strip
  monthPickerStrip: {
    backgroundColor: COLORS.cream,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: 8,
  },
  monthPickerContent: {
    paddingHorizontal: SPACING.screenPadding,
    gap: 8,
  },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
    backgroundColor: COLORS.white,
  },
  monthChipActive: {
    backgroundColor: COLORS.sky,
    borderColor: COLORS.brand,
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monthChipTextActive: {
    color: COLORS.brand,
  },

  yearDropdownRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: 6,
    backgroundColor: COLORS.cream,
  },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
    backgroundColor: COLORS.white,
  },
  yearChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.brand,
  },
  yearChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  yearChipTextActive: {
    color: COLORS.cream,
  },

  // T3.93: Vitals Trends collapsible card
  trendsCard: {
    marginBottom: 16,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
  },
  trendsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  trendsTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  trendsBody: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    padding: 14,
    gap: 16,
  },
  trendRow: {
    gap: 4,
  },
  trendLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  // T4.113: Delta annotation below each sparkline
  deltaText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    letterSpacing: 0.3,
  },

  // T3.97: Prescription Frequency collapsible card
  rxFreqCard: {
    marginBottom: 20,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
  },
  rxFreqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  rxFreqTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rxFreqBody: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    padding: 14,
    gap: 10,
  },
  rxFreqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rxFreqName: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.brand,
  },
  rxFreqSig: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 1,
  },
  rxFreqCountBadge: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 0,
  },
  rxFreqCountText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.warning,
  },
  rxSectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  rxTenure: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  rxPinnedNote: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 1,
  },
  rxEmptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  rxHistoricalSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  rxHistoricalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rxHistoricalToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  rxHistoricalBadge: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.borderLight,
  },

  // T4.155 Day 2: Pet Health Snapshot strip
  snapshotCard: {
    marginBottom: 16,
    position: 'relative',
  },
  snapshotShadow: {
    ...SHADOW.card,
  },
  snapshotInner: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
  },
  snapshotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  snapshotTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  snapshotBody: {
    padding: 14,
    paddingTop: 0,
    gap: 14,
  },
  snapshotSection: {
    gap: 6,
  },
  snapshotSectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  snapshotVitalsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  snapshotVitalChip: {
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  snapshotVitalLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  snapshotVitalValue: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.brand,
    marginTop: 2,
  },
  snapshotMedRow: {
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.sky,
    paddingVertical: 2,
  },
  snapshotMedName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.brand,
  },
  snapshotMedSig: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  snapshotEmptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  snapshotVaxRow: {
    gap: 4,
  },
  snapshotVaxText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  snapshotProgressTrack: {
    height: 6,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    overflow: 'hidden',
  },
  snapshotProgressFill: {
    height: 6,
    borderRadius: 0,
  },
});
