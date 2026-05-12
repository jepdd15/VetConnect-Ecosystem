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
  setDoc,
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
import { safeDate, formatDisplayDate, calculateAge } from "../utils/helpers";
import { resolveDepartmentForRecord } from '../utils/resolveDepartmentForRecord';
import { COLORS, SHADOW, SPACING, FONTS } from '../theme/mobileTokens';
import { LineChart as GiftedLineChart } from 'react-native-gifted-charts';
import VitalsZoomModal from '../components/VitalsZoomModal';
import LabZoomModal from '../components/LabZoomModal';
import PetHistoryAISheet from '../components/PetHistoryAISheet';
import VaccinationStatusCard from '../components/VaccinationStatusCard';
import { buildPetOwnerPrompt } from '../utils/buildPetOwnerPrompt';
import { resolveVitals } from '../utils/resolveVitals';
import { generateVisitPDF } from '../utils/generateVisitPDF';
import { getNormalRange } from '../utils/speciesVitalRanges';
import { fetchVaccineCatalog, buildVaccinationStatus } from '../utils/vaccineHelpers';

// ---------------------------------------------------------------------------
// Enable LayoutAnimation on Android (required for Hermes/React Native)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---------------------------------------------------------------------------
// Layout constants
const SCREEN_W = Dimensions.get('window').width;

// ---------------------------------------------------------------------------
// T4.194 Item 10: Vaccine urgency sort order — overdue first, unknown last
const URGENCY_ORDER = { overdue: 0, due_soon: 1, unknown: 2, current: 3 };

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
  current:    { borderColor: '#2E7D32', badgeBg: '#E8F5E9', badgeColor: '#2E7D32', label: 'CURRENT' },
  'due-soon': { borderColor: '#E65100', badgeBg: '#FFF8E1', badgeColor: '#E65100', label: 'DUE SOON' },
  overdue:    { borderColor: '#D32F2F', badgeBg: '#FFEBEE', badgeColor: '#D32F2F', label: 'OVERDUE' },
  incomplete: { borderColor: '#E65100', badgeBg: '#FFF3E0', badgeColor: '#E65100', label: 'INCOMPLETE' },
};

/**
 * Produces a print-ready HTML string for a pet's vaccination passport.
 *
 * @param {object} params
 * @param {string} params.petName      - Pet's display name
 * @param {string} params.ownerName    - Owner's display name
 * @param {string} params.clinicName   - Clinic name for the header/certification block
 * @param {string} params.clinicPhone  - Clinic phone for certification block
 * @param {string} params.clinicAddress - Clinic address for certification block
 * @param {object} params.petDetails   - Pet profile fields (species, breed, age, weight, color, microchip, gender)
 * @param {Array}  params.vaccineRecords - Array of medical_record documents that contain
 *                                         vaccineAdministrations or vaccineData
 */
function generateMobileVaccinationPassport({ petName, ownerName, clinicName, clinicPhone, clinicAddress, petDetails, vaccineRecords, vaccineCatalog }) {
  const today = fmtDate(new Date());
  const safeClinic = escHtml(clinicName || 'Starbarks Veterinary Clinic');
  const safePet = escHtml(petName);
  const safeOwner = escHtml(ownerName || 'Pet Owner');
  const safePhone = escHtml(clinicPhone || '');
  const safeAddress = escHtml(clinicAddress || '');
  const pet = petDetails || {};

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

  // Pre-compute dosesGiven per vaccine name by counting distinct doseNumbers
  // across ALL records (not just the latest per vaccine).
  const dosesGivenByVaccine = new Map();
  allAdministrations.forEach((vax) => {
    const key = (vax.vaccineName || '').toLowerCase();
    if (!key) return;
    if (!dosesGivenByVaccine.has(key)) dosesGivenByVaccine.set(key, new Set());
    if (vax.doseNumber) dosesGivenByVaccine.get(key).add(vax.doseNumber);
  });

  // --- STATUS CARDS (one per unique vaccine, colour-coded by due-date status) ---
  const statusCardsHtml = latestByVaccine.map((vax) => {
    const catalogEntry = Array.isArray(vaccineCatalog)
      ? vaccineCatalog.find(v => v.name?.toLowerCase() === (vax.vaccineName || '').toLowerCase()
          || (v.keywords || []).some(kw => (vax.vaccineName || '').toLowerCase().includes(kw)))
      : null;
    const dosesRequired = catalogEntry?.doses || 1;
    const doseNumberSet = dosesGivenByVaccine.get((vax.vaccineName || '').toLowerCase()) || new Set();
    const dosesGiven = doseNumberSet.size > 0 ? doseNumberSet.size : (dosesRequired > 1 ? 0 : 1);
    const isIncomplete = dosesRequired > 1 && dosesGiven < dosesRequired;

    const status = isIncomplete ? 'incomplete' : resolveVaccineStatus(vax.dueDate);
    const stKey = isIncomplete ? 'incomplete' : status;
    const st = VACCINE_STATUS_STYLES[stKey] || VACCINE_STATUS_STYLES.incomplete;
    const administered = fmtDate(vax.recordDate);
    const dueDate = fmtDate(resolveDate(vax.dueDate));

    const doseDots = dosesRequired > 1
      ? `<div class="vaccine-card-meta" style="margin-top:4px;">
           ${Array.from({ length: dosesRequired }, (_, i) =>
             `<span style="color:${i < dosesGiven ? '#2E7D32' : '#BDBDBD'};font-size:13px;">${i < dosesGiven ? '●' : '○'}</span>`
           ).join(' ')}
           <span style="font-size:10px;font-weight:700;color:#5D4037;margin-left:4px;">Dose ${dosesGiven}/${dosesRequired}</span>
         </div>`
      : '';

    return `
      <div class="vaccine-card" style="border-left:4px solid ${st.borderColor}">
        <div class="vaccine-card-header">
          <strong>${escHtml(vax.vaccineName || 'Unknown Vaccine')}</strong>
          <span class="status-badge" style="background:${st.badgeBg};color:${st.badgeColor}">${st.label}</span>
        </div>
        <div class="vaccine-card-meta">Last administered: <strong>${escHtml(administered)}</strong> by ${escHtml(vax.vetName || 'Clinic Staff')}</div>
        ${vax.manufacturer ? `<div class="vaccine-card-meta">Manufacturer: ${escHtml(vax.manufacturer)}${vax.lotNumber ? ` &nbsp;|&nbsp; Lot: ${escHtml(vax.lotNumber)}` : ''}</div>` : ''}
        <div class="vaccine-card-meta">Next due: <strong>${escHtml(dueDate)}</strong></div>
        ${doseDots}
      </div>`;
  }).join('');

  // --- HISTORY TABLE (all administrations, newest first) ---
  const historyRowsHtml = allAdministrations.map((vax) => {
    const administered = fmtDate(vax.recordDate);
    const dueDate = fmtDate(resolveDate(vax.dueDate));
    const doseFmt = vax.doseNumber ? `Dose ${vax.doseNumber}` : '—';
    return `
      <tr>
        <td>${escHtml(administered)}</td>
        <td><strong>${escHtml(vax.vaccineName || 'Unknown')}</strong></td>
        <td>${escHtml(doseFmt)}</td>
        <td>${escHtml(vax.manufacturer || '—')}</td>
        <td>${escHtml(vax.lotNumber || '—')}</td>
        <td>${escHtml(vax.routeOfAdmin || '—')}</td>
        <td>${escHtml(vax.vetName || 'Clinic Staff')}</td>
        <td>${escHtml(dueDate)}</td>
      </tr>`;
  }).join('');

  // --- PENDING DOSE ROWS for incomplete multi-dose series ---
  const pendingRowsHtml = latestByVaccine.flatMap((vax) => {
    const catalogEntry = Array.isArray(vaccineCatalog)
      ? vaccineCatalog.find(v => v.name?.toLowerCase() === (vax.vaccineName || '').toLowerCase()
          || (v.keywords || []).some(kw => (vax.vaccineName || '').toLowerCase().includes(kw)))
      : null;
    const dosesRequired = catalogEntry?.doses || 1;
    if (dosesRequired <= 1) return [];
    const doseNumberSet = dosesGivenByVaccine.get((vax.vaccineName || '').toLowerCase()) || new Set();
    const dosesGiven = doseNumberSet.size > 0 ? doseNumberSet.size : 0;
    if (dosesGiven >= dosesRequired) return [];
    return Array.from({ length: dosesRequired - dosesGiven }, (_, i) => {
      const pendingDoseNum = dosesGiven + 1 + i;
      return `
        <tr style="color:#9E9E9E; font-style:italic;">
          <td>—</td>
          <td><strong>${escHtml(vax.vaccineName || 'Unknown')}</strong></td>
          <td>Dose ${pendingDoseNum}/${dosesRequired}</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td><em>pending</em></td>
        </tr>`;
    });
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
      <div class="cover-field">
        <div class="cover-field-label">Species / Breed</div>
        <div class="cover-field-value">${escHtml(pet.species || 'N/A')} — ${escHtml(pet.breed || 'N/A')}</div>
      </div>
      <div class="cover-field">
        <div class="cover-field-label">Sex / Age</div>
        <div class="cover-field-value">${escHtml(pet.gender || 'N/A')}${pet.isNeutered ? ' (Desexed)' : ''} — ${escHtml(pet.age || 'N/A')}</div>
      </div>
      <div class="cover-field">
        <div class="cover-field-label">Weight</div>
        <div class="cover-field-value">${pet.weight ? escHtml(pet.weight + ' kg') : 'N/A'}</div>
      </div>
      <div class="cover-field">
        <div class="cover-field-label">Color / Markings</div>
        <div class="cover-field-value">${escHtml(pet.color || 'N/A')}</div>
      </div>
      ${pet.microchip ? `<div class="cover-field" style="grid-column:1/3">
        <div class="cover-field-label">Microchip ID</div>
        <div class="cover-field-value">${escHtml(pet.microchip)}</div>
      </div>` : ''}
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
          <th>Dose</th>
          <th>Manufacturer</th>
          <th>Lot #</th>
          <th>Route</th>
          <th>Administered By</th>
          <th>Next Due</th>
        </tr>
      </thead>
      <tbody>
        ${historyRowsHtml}${pendingRowsHtml}
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
      from ${safeClinic}.${safePhone ? ` Tel: ${safePhone}.` : ''}${safeAddress ? ` Address: ${safeAddress}.` : ''}
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
  rr:     { label: 'Respiratory Rate', unit: 'brpm', color: '#7B1FA2',      refKey: 'rr'    },
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

// ---------------------------------------------------------------------------
// Vitals that use a BulletGauge (discrete/bounded) vs. a LineChart (continuous).
// Keys must match VITALS_CONFIG and vitalsChartData property names.
// ---------------------------------------------------------------------------
const LINE_VITAL_KEYS   = ['weight', 'temp', 'hr', 'rr'];
const BULLET_VITAL_KEYS = ['crt', 'bcs', 'pain'];

/**
 * Zone configurations for each bullet vital.
 * start/end are inclusive boundary values on the stated scale.
 * Colors are drawn from COLORS tokens; opacity is applied at render time.
 */
const BULLET_VITALS = {
  crt: {
    title: 'CAPILLARY REFILL',
    min: 0, max: 5, unit: 's',
    zones: [
      { start: 0,   end: 0.9, color: COLORS.warning, label: 'FAST'    },
      { start: 1,   end: 2,   color: COLORS.success,  label: 'NORMAL'  },
      { start: 2.1, end: 5,   color: COLORS.danger,   label: 'DELAYED' },
    ],
  },
  bcs: {
    title: 'BODY CONDITION (BCS)',
    min: 1, max: 9, unit: '/9',
    zones: [
      { start: 1, end: 3, color: COLORS.warning, label: 'UNDERWEIGHT' },
      { start: 4, end: 5, color: COLORS.success,  label: 'IDEAL'       },
      { start: 6, end: 9, color: COLORS.warning, label: 'OVERWEIGHT'  },
    ],
  },
  pain: {
    title: 'PAIN SCORE',
    min: 0, max: 10, unit: '/10',
    zones: [
      { start: 0, end: 2,  color: COLORS.success,  label: 'NONE'     },
      { start: 3, end: 5,  color: COLORS.warning, label: 'MILD-MOD' },
      { start: 6, end: 10, color: COLORS.danger,   label: 'SEVERE'   },
    ],
  },
};

// Defined outside StyleSheet.create so renderEnhancedDelta (a module-level function)
// can reference it without accessing the component's styles object.
const deltaTextStyle = {
  fontSize: 10,
  color: COLORS.textMuted,
  marginTop: 2,
  letterSpacing: 0.3,
};

// ---------------------------------------------------------------------------
// T4.194 Item 4: Normal/Abnormal status label for vitals with a reference range.
// Returns null for weight and pain (no universal range).
// ---------------------------------------------------------------------------
/**
 * @param {string} key - VITALS_CONFIG key
 * @param {{ label: string, value: number }[]} chartData
 * @param {string} petSpecies
 * @returns {{ isNormal: boolean, label: string } | null}
 */
function getVitalStatusLabel(key, chartData, petSpecies) {
  const cfg = VITALS_CONFIG[key];
  if (!cfg.refKey || !chartData || chartData.length === 0) return null;
  const latest = chartData[chartData.length - 1].value;
  const range = getNormalRange(cfg.refKey, petSpecies);
  if (!range) return null;
  const isNormal = latest >= range.low && latest <= range.high;
  return { isNormal, label: isNormal ? 'Normal' : 'Abnormal' };
}

// ---------------------------------------------------------------------------
// T4.194 Item 6: Plain-language interpretation sentence for each vital.
// Species-aware for rangeable vitals; shows delta for weight/pain.
// ---------------------------------------------------------------------------
/**
 * @param {string} key - VITALS_CONFIG key
 * @param {{ label: string, value: number }[]} chartData
 * @param {string} petSpecies
 * @returns {string | null}
 */
function getVitalInterpretation(key, chartData, petSpecies) {
  const cfg = VITALS_CONFIG[key];
  if (!chartData || chartData.length === 0) return null;
  const latest = chartData[chartData.length - 1].value;
  const speciesLabel = petSpecies?.toLowerCase?.().startsWith('f') ? 'felines' : 'canines';

  if (cfg.refKey) {
    const range = getNormalRange(cfg.refKey, petSpecies);
    if (range) {
      const isNormal = latest >= range.low && latest <= range.high;
      if (isNormal) {
        return `${cfg.label}: ${latest}${cfg.unit} — Within normal range for ${speciesLabel}`;
      }
      const direction = latest < range.low ? 'below' : 'above';
      return `${cfg.label}: ${latest}${cfg.unit} — ${direction} normal range for ${speciesLabel}`;
    }
  }

  // Weight / Pain — no universal range, show delta instead
  if (chartData.length >= 2) {
    const prev = chartData[chartData.length - 2].value;
    const diff = latest - prev;
    if (diff === 0) return `${cfg.label}: ${latest}${cfg.unit} — No change since last visit`;
    const sign = diff > 0 ? '+' : '';
    return `${cfg.label}: ${latest}${cfg.unit} — ${sign}${Number(diff.toFixed(1))}${cfg.unit} since last visit`;
  }

  return `${cfg.label}: ${latest}${cfg.unit}`;
}

// ---------------------------------------------------------------------------
// T4.194 Item 7: Enhanced delta with trend direction coloring.
// Green = moving toward normal range midpoint. Red = moving away. Neutral for weight/pain.
// ---------------------------------------------------------------------------
/**
 * @param {string} key - VITALS_CONFIG key
 * @param {{ label: string, value: number }[]} data
 * @param {string} unit
 * @param {string} petSpecies
 * @returns {React.ReactElement | null}
 */
function renderEnhancedDelta(key, data, unit, petSpecies) {
  if (data.length < 2) return null;
  const prev = data[data.length - 2].value;
  const curr = data[data.length - 1].value;
  const diff = curr - prev;
  if (diff === 0) return null;

  const arrow     = diff > 0 ? '↑' : '↓';
  const sign      = diff > 0 ? '+' : '';
  const formatted = Number(diff.toFixed(1));

  const cfg = VITALS_CONFIG[key];
  let arrowColor = COLORS.textMuted; // Default: neutral for weight/pain

  if (cfg.refKey) {
    const range = getNormalRange(cfg.refKey, petSpecies);
    if (range) {
      const midpoint  = (range.low + range.high) / 2;
      const prevDist  = Math.abs(prev - midpoint);
      const currDist  = Math.abs(curr - midpoint);
      // Moving toward midpoint = improving (green), moving away = worsening (red)
      arrowColor = currDist < prevDist ? COLORS.success : COLORS.danger;
    }
  }

  return (
    <Text style={[deltaTextStyle, { color: arrowColor }]}>
      {arrow} {sign}{formatted}{unit} since last visit
    </Text>
  );
}

// ---------------------------------------------------------------------------

export default function PetHistoryScreen({ route, navigation }) {
  const { petId, petName } = route.params;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  // T4.155 Day 3: Pull-to-refresh — visual affordance (data auto-refreshes via onSnapshot)
  const [refreshing, setRefreshing] = useState(false);
  // T3.95: Case-day metadata derived from appointment documents
  const [caseDayMap, setCaseDayMap] = useState({});
  // T4.203: Per-record services array keyed by record ID, sourced from appointment docs.
  // Populated alongside caseDayMap in the same batch fetch — no extra Firestore reads.
  const [appointmentServicesMap, setAppointmentServicesMap] = useState({});
  // T3.94: Search and filter state
  const [searchText, setSearchText] = useState('');
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pendingFilters, setPendingFilters] = useState(new Set());
  // T4.107: Departments — one-shot fetch for dynamic filter chips
  const [departments, setDepartments] = useState([]);
  const { clinicPhone, clinicName, clinicAddress } = useClinicContact();
  const { isConnected } = useNetwork();

  // T4.194: Tabbed layout — persists within screen session
  const [activeTab, setActiveTab] = useState('records');

  const TAB_CONFIG = [
    { key: 'records',  label: 'RECORDS'  },
    { key: 'vitals',   label: 'VITALS'   },
    { key: 'vaccines', label: 'VACCINES' },
    { key: 'overview', label: 'OVERVIEW' },
  ];

  // T4.97: AI Pet History Assistant — pet doc, worker URL, and sheet visibility
  const [petDoc, setPetDoc]               = useState(null);
  const [workerUrl, setWorkerUrl]         = useState('');
  const [aiSheetVisible, setAiSheetVisible] = useState(false);

  // T4.13: Active conditions count + list for OVERVIEW tab display.
  // Read-only on mobile — fetched once on mount, no mutations.
  const [activeConditionsCount, setActiveConditionsCount] = useState(0);
  const [activeConditionsList, setActiveConditionsList]   = useState([]);

  // T4.118: Vaccine catalog — one-shot fetch from inventory, falls back to defaults.
  const [vaccineCatalog, setVaccineCatalog] = useState([]);

  // T4.194 Item 18: Per-vaccine push reminder preferences — Set of disabled vaccine IDs.
  // Fetched from vaccine_preferences/{petId} (ROOT collection). Default: all enabled (empty set).
  const [disabledVaccines, setDisabledVaccines] = useState(new Set());

  // T4.194 Item 19: Services price map — name→price Map for cost estimates.
  // One-shot fetch; silently empty if Firestore rules block client access.
  const [servicesPriceMap, setServicesPriceMap] = useState(new Map());

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

  // T4.13: One-shot fetch for the pet's active problem list.
  // getDocs (not onSnapshot) — mobile is read-only; no mutations are possible here.
  // Failures are non-blocking: conditions card simply shows zero.
  useEffect(() => {
    if (!petId) return;
    let cancelled = false;
    (async () => {
      try {
        const probSnap = await getDocs(
          query(
            collection(db, 'pets', petId, 'problems'),
            where('status', 'in', ['active', 'monitoring']),
            orderBy('diagnosedAt', 'desc'),
          )
        );
        if (!cancelled) {
          const problems = probSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setActiveConditionsCount(problems.length);
          setActiveConditionsList(problems);
        }
      } catch (err) {
        // Non-blocking — conditions card defaults to zero / empty
        console.warn('[PetHistoryScreen] Failed to fetch problem list:', err?.message);
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

  // T4.194 Item 18: Fetch vaccine reminder preferences for this pet.
  // Path: vaccine_preferences/{petId} — ROOT collection (public read rule).
  // Non-critical: if the doc doesn't exist or rules block it, we default to all-enabled.
  useEffect(() => {
    if (!petId) return;
    let cancelled = false;
    getDoc(doc(db, 'vaccine_preferences', petId))
      .then(snap => {
        if (cancelled) return;
        if (snap.exists()) {
          const disabled = snap.data().disabledVaccines || [];
          setDisabledVaccines(new Set(disabled));
        }
      })
      .catch(() => {
        // Non-critical — defaults to all reminders enabled
      });
    return () => { cancelled = true; };
  }, [petId]);

  // T4.194 Item 19: One-shot services fetch for vaccination cost estimates.
  // Silently empty if Firestore rules block client-side access (staff-only collection).
  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'services'))
      .then(snap => {
        if (cancelled) return;
        const map = new Map();
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.price) map.set((data.name || '').toLowerCase(), data.price);
        });
        setServicesPriceMap(map);
      })
      .catch(() => {
        // Silent fallback — cost estimates hidden when collection is unreadable
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
        .map(r => ({ label: formatDisplayDate(r.date, { month: 'short', day: 'numeric' }), value: parseFloat(r._rv[field]) }))
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

  // T4.194 Item 9: Anomaly warning flag for VITALS tab badge.
  // Returns true when any rangeable vital's latest reading is outside species-normal.
  const hasVitalsAnomaly = useMemo(() => {
    for (const [key, cfg] of Object.entries(VITALS_CONFIG)) {
      if (!cfg.refKey) continue; // Skip weight, pain — no universal range
      const data = vitalsChartData[key];
      if (!data || data.length === 0) continue;
      const latest = data[data.length - 1].value;
      const range = getNormalRange(cfg.refKey, petSpecies);
      if (range && (latest < range.low || latest > range.high)) return true;
    }
    return false;
  }, [vitalsChartData, petSpecies]);

  // T4.194 Item 20: Next recheck date — first record in history carrying a recheckIn value.
  const nextRecheck = useMemo(() => {
    for (const r of history) {
      if (r.dischargeSummary?.recheckIn) return r.dischargeSummary.recheckIn;
    }
    return null;
  }, [history]);

  // T4.113: Zoom modal state — tracks which vital key is currently expanded.
  const [vitalsZoom, setVitalsZoom] = useState({ open: false, key: null });
  // T4.123: Lab results zoom modal state.
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

  // T4.194 Item 10: Vaccine urgency sort — overdue first, then due_soon, unknown, current.
  // Sorted copy so the original vaccinationStatuses array is not mutated.
  const sortedStatuses = useMemo(
    () => [...vaccinationStatuses].sort(
      (a, b) => (URGENCY_ORDER[a.status] ?? 3) - (URGENCY_ORDER[b.status] ?? 3)
    ),
    [vaccinationStatuses],
  );

  // ---------------------------------------------------------------------------


  // Latest vitals from the most-recent record (history is newest-first)
  const latestVitals = useMemo(() => {
    if (!history.length) return null;
    const rv = resolveVitals(history[0]);
    if (!rv.weight && !rv.temp && !rv.hr) return null;
    return rv;
  }, [history]);

  /** Generates the vaccination passport PDF and opens the OS share sheet. */
  const handleDownloadPassport = async () => {
    try {
      let ownerFullName = '';
      try {
        const uid = auth.currentUser?.uid;
        if (uid) {
          const ownerSnap = await getDoc(doc(db, 'users', uid));
          if (ownerSnap.exists()) ownerFullName = ownerSnap.data().fullName || '';
        }
      } catch (_) { /* non-blocking — falls back to 'Pet Owner' */ }

      const html = generateMobileVaccinationPassport({
        petName,
        ownerName: ownerFullName,
        clinicName: clinicName || 'Starbarks Veterinary Clinic',
        clinicPhone: clinicPhone || '',
        clinicAddress: clinicAddress || '',
        petDetails: petDoc ? {
          species: petDoc.species,
          breed: petDoc.breed,
          gender: petDoc.gender,
          isNeutered: petDoc.isNeutered,
          age: calculateAge(petDoc.dob),
          weight: petDoc.lastWeight || petDoc.weight,
          color: petDoc.color,
          microchip: petDoc.microchipNumber || petDoc.microchip,
        } : null,
        vaccineRecords,
        vaccineCatalog,
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

  /**
   * T4.194 Item 18: Toggles a per-vaccine push reminder preference.
   * Optimistically updates local state, then persists to Firestore.
   * Writes { disabledVaccines: [...] } with merge:true so other fields are preserved.
   */
  const handleToggleReminder = useCallback((vaccineId, enabled) => {
    setDisabledVaccines(prev => {
      const next = new Set(prev);
      if (enabled) {
        next.delete(vaccineId);
      } else {
        next.add(vaccineId);
      }

      if (petId) {
        const prefRef = doc(db, 'vaccine_preferences', petId);
        setDoc(prefRef, { disabledVaccines: [...next] }, { merge: true })
          .catch(err => console.warn('[PetHistoryScreen.handleToggleReminder]:', err.message));
      }

      return next;
    });
  }, [petId]);

  // T4.194 Item 1d: listHeader useMemo deleted.
  // Health cards (snapshot, vitals, vaccines, meds, labs) now live in tab conditionals.
  // FlatList ListHeaderComponent prop removed — RECORDS tab is a clean record list.

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
      const svcMap = {};
      await Promise.all(recordsWithAppt.map(async (rec) => {
        try {
          const apptSnap = await getDoc(doc(db, 'appointments', rec.appointmentId));
          if (apptSnap.exists()) {
            const apptData = apptSnap.data();
            const caseDay = apptData.caseDay || 1;
            if (caseDay > 1) {
              cdMap[rec.id] = caseDay;
            }
            // T4.203: Capture services[] for the visit PDF per-service breakdown.
            // Only store when the appointment has 2+ services (single-service visits
            // don't need the breakdown section — matches generateVisitPDF guard).
            if (Array.isArray(apptData.services) && apptData.services.length >= 2) {
              svcMap[rec.id] = apptData.services;
            }
          }
        } catch {
          // Silently skip — missing appointment doc should not break the screen
        }
      }));
      setCaseDayMap(cdMap);
      setAppointmentServicesMap(svcMap);
    };
    fetchCaseDays();
  }, [history]);

  // --- PDF GENERATOR ---
  // T4.203: Services array from the linked appointment doc powers the per-service
  // breakdown section in the PDF. Undefined for single-service visits — generateVisitPDF
  // skips the section gracefully when services is undefined or has fewer than 2 entries.
  const generatePDF = (record) =>
    generateVisitPDF({
      record,
      petName,
      services: appointmentServicesMap[record.id],
    });

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
        <View style={{ marginBottom: 16 }}>
          {/* Record card — full width (timeline bar removed) */}
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
              <View style={[styles.cardBody, { backgroundColor: COLORS.white }]}>
                {/* Service chips + case day */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {(item.serviceNames?.length > 0 ? item.serviceNames : [item.serviceType]).map((svcName, si) => (
                    <View key={si} style={styles.serviceChip}>
                      <Text style={[styles.serviceChipText, { color: themeColor }]}>{svcName}</Text>
                    </View>
                  ))}
                  {caseDayMap[item.id] && (
                    <View style={styles.caseDayBadge}>
                      <Text style={styles.caseDayText}>Day {caseDayMap[item.id]}</Text>
                    </View>
                  )}
                </View>

                {/* Service attribution */}
                {item.serviceAttribution?.length > 0 && (() => {
                  const attrs = item.serviceAttribution.filter(a => a.staffName);
                  if (attrs.length === 0) return null;
                  const uniqueNames = [...new Set(attrs.map(a => a.staffName))];
                  return (
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 8 }}>
                      Performed by: {uniqueNames.join(', ')}
                    </Text>
                  );
                })()}

                {/* Section divider: CLINICAL NOTES */}
                <View style={{ borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginBottom: 10, paddingTop: 8 }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: COLORS.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Clinical Notes</Text>
                </View>
            {!isGrooming && (item.diagnoses?.length > 0 || item.diagnosis) && (() => {
              const dxList = item.diagnoses?.length > 0
                ? item.diagnoses
                : [{ name: item.diagnosis }];
              const isMultiple = dxList.length > 1;
              return (
                <View style={styles.diagnosisHero}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: COLORS.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
                    {isMultiple ? 'Diagnoses' : 'Diagnosis'}
                  </Text>
                  {dxList.map((dx, i) => (
                    <View key={i} style={isMultiple ? { flexDirection: 'row', marginTop: i > 0 ? 6 : 0 } : { marginTop: i > 0 ? 4 : 0 }}>
                      {isMultiple && (
                        <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.brand, marginRight: 8, lineHeight: 26 }}>•</Text>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.diagnosisHeroText}>
                          {dx.name}{dx.severity ? ` (${dx.severity.toUpperCase()})` : ''}
                        </Text>
                        {dx.notes ? (
                          <Text style={styles.diagnosisHeroNotes}>{dx.notes}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}

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
              <View>
                <View style={{ borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginBottom: 8, paddingTop: 8 }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: COLORS.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Vitals</Text>
                </View>
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
              const _rawNextVisitDate = ds.nextVisit
                ? (typeof ds.nextVisit?.toDate === 'function' ? ds.nextVisit.toDate()
                   : ds.nextVisit?.seconds != null ? new Date(ds.nextVisit.seconds * 1000)
                   : ds.nextVisit instanceof Date ? ds.nextVisit
                   : new Date(ds.nextVisit))
                : null;
              // Guard: "TBD" strings and other non-date values produce Invalid Date
              const nextVisitDate = (_rawNextVisitDate instanceof Date && !isNaN(_rawNextVisitDate.getTime()))
                ? _rawNextVisitDate
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
                    <View style={{ marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.borderLight }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, fontStyle: 'italic' }}>Signed by</Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.brand, marginTop: 2 }}>{ds.vetName}</Text>
                      <View style={{ marginTop: 6, borderBottomWidth: 1, borderBottomColor: COLORS.brand, width: 150 }} />
                      <Text style={{ fontSize: 8, fontWeight: '700', color: COLORS.textMuted, marginTop: 2, letterSpacing: 0.5 }}>ATTENDING VETERINARIAN</Text>
                    </View>
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
                    <Text style={styles.vaccineName}>{vax.vaccineName}{vax.doseNumber ? ` (Dose ${vax.doseNumber}${vax.totalDoses ? `/${vax.totalDoses}` : ''})` : ''}</Text>
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
                                { label: 'Pain', val: amend.vitals.pain   ? `${amend.vitals.pain}/10`   : null },
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

            {/* T4.13: Problem list update annotation — shows when this visit
                 triggered problem list changes. Written by proceedWithSave()
                 into the medical record's problemListChanges array. */}
            {item.problemListChanges?.length > 0 && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: COLORS.warningBg,
                paddingHorizontal: 10,
                paddingVertical: 6,
                marginTop: 8,
                borderLeftWidth: 3,
                borderLeftColor: COLORS.warning,
              }}>
                <MaterialIcons name="playlist-add-check" size={14} color={COLORS.warning} />
                <Text style={{
                  fontFamily: FONTS.bold,
                  fontSize: 10,
                  color: COLORS.warning,
                  marginLeft: 6,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}>
                  Problem List Updated
                </Text>
                <Text style={{
                  fontFamily: FONTS.regular,
                  fontSize: 10,
                  color: COLORS.textMuted,
                  marginLeft: 8,
                  flex: 1,
                  flexWrap: 'wrap',
                }}>
                  {item.problemListChanges.map((c) => {
                    if (c.type === 'added') return `+1 ${c.name}`;
                    if (c.type === 'resolved') return `${c.name} resolved`;
                    if (c.type === 'severity_updated') return `${c.name} ${c.from} → ${c.to}`;
                    return '';
                  }).filter(Boolean).join(' · ')}
                </Text>
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
          <MaterialIcons name="arrow-back-ios" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{(petName || 'PET').toUpperCase()}&apos;S CHART</Text>
        <Text style={styles.recordCountHeader}>
          {filteredHistory.length} RECORD{filteredHistory.length !== 1 ? 'S' : ''}
        </Text>
      </View>

      {/* T4.194: Search + filter bar — RECORDS tab only */}
      {!loading && history.length > 0 && activeTab === 'records' && (
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

      {/* T4.194: Tab bar — renders below search bar once records are loaded */}
      {!loading && history.length > 0 && (
        <View style={styles.tabBar}>
          {TAB_CONFIG.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <View style={styles.tabLabelRow}>
                <Text style={[
                  styles.tabLabel,
                  activeTab === tab.key && styles.tabLabelActive,
                  tab.key === 'vitals' && hasVitalsAnomaly && styles.tabLabelDanger,
                ]}>
                  {tab.label}
                </Text>
                {tab.key === 'vitals' && hasVitalsAnomaly && (
                  <View style={styles.tabWarningDot} />
                )}
              </View>
            </TouchableOpacity>
          ))}
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
            {/* ================================================================
                T4.194: Tab-conditional content rendering
                RECORDS tab: year/month picker + FlatList (unmounts on other tabs)
                VITALS  tab: ScrollView with 7 enhanced vital sparklines
                VACCINES tab: ScrollView with VaccinationStatusCard
                OVERVIEW tab: ScrollView with snapshot + meds + labs
                ================================================================ */}

            {/* ---- RECORDS TAB -------------------------------------------- */}
            {activeTab === 'records' && (
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

            {/* ---- VITALS TAB --------------------------------------------- */}
            {activeTab === 'vitals' && (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.tabScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.tabSectionTitle}>VITAL SIGNS</Text>

                {/* ---- Continuous vitals: LineChart (weight, temp, hr, rr) ---- */}
                {LINE_VITAL_KEYS.map((key) => {
                  const cfg       = VITALS_CONFIG[key];
                  const chartData = vitalsChartData[key];
                  if (!chartData || chartData.length < 1) return null;
                  const range = cfg.refKey ? getNormalRange(cfg.refKey, petSpecies) : null;
                  const statusLabel    = getVitalStatusLabel(key, chartData, petSpecies);
                  const interpretation = getVitalInterpretation(key, chartData, petSpecies);
                  const minVal         = Math.min(...chartData.map(d => d.value));
                  const maxVal         = Math.max(...chartData.map(d => d.value));

                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.vitalTabCard}
                      onPress={() => setVitalsZoom({ open: true, key })}
                      activeOpacity={0.7}
                    >
                      {/* Card header: label + status badge */}
                      <View style={styles.vitalTabCardHeader}>
                        <Text style={styles.vitalTabLabel}>{cfg.label.toUpperCase()}</Text>
                        {statusLabel && (
                          <Text style={[
                            styles.vitalStatusBadge,
                            { color: statusLabel.isNormal ? COLORS.success : COLORS.danger },
                          ]}>
                            {statusLabel.label}
                          </Text>
                        )}
                      </View>

                      {/* Vitals trend chart — react-native-gifted-charts LineChart */}
                      {chartData.length >= 2 ? (
                        (() => {
                          const hexToRgba = (hex, op) => {
                            const r = parseInt(hex.slice(1, 3), 16);
                            const g = parseInt(hex.slice(3, 5), 16);
                            const b = parseInt(hex.slice(5, 7), 16);
                            return `rgba(${r},${g},${b},${op})`;
                          };
                          const vitalHex = cfg.color || '#3ABEF9';
                          return (
                            <GiftedLineChart
                              data={chartData.map((d, i) => ({
                                value: d.value,
                                label: i % Math.ceil(chartData.length / 5) === 0
                                  ? (d.label ?? '') : '',
                                dataPointColor: range
                                  ? (d.value >= range.low && d.value <= range.high
                                      ? COLORS.success : COLORS.danger)
                                  : vitalHex,
                              }))}
                              width={SCREEN_W - 80}
                              height={180}
                              initialSpacing={15}
                              overflowTop={20}
                              curved
                              thickness={2}
                              yAxisLabelWidth={55}
                              formatYLabel={v => `${parseFloat(v).toFixed(1)}${cfg.unit || ''}`}
                              yAxisTextStyle={{ fontSize: 10, color: COLORS.accent }}
                              xAxisLabelTextStyle={{ fontSize: 9, color: COLORS.accentLight }}
                              dataPointsRadius={5}
                              rulesType="solid"
                              rulesColor="rgba(0,0,0,0.05)"
                              xAxisColor={COLORS.borderLight}
                              yAxisColor={COLORS.borderLight}
                            />
                          );
                        })()
                      ) : chartData.length === 1 ? (
                        <View style={{ paddingVertical: 4 }}>
                          <Text style={{ fontSize: 18, fontWeight: '900', color: cfg.color }}>
                            {chartData[0].value}{cfg.unit}
                          </Text>
                          <Text style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 2 }}>
                            1 reading · {chartData[0].label}
                          </Text>
                        </View>
                      ) : null}

                      {renderEnhancedDelta(key, chartData, ` ${cfg.unit}`, petSpecies)}

                      {interpretation && (
                        <Text style={styles.vitalInterpretation}>{interpretation}</Text>
                      )}

                      {chartData.length >= 2 && (
                        <Text style={styles.vitalRangeStrip}>
                          Range: {minVal}{cfg.unit} – {maxVal}{cfg.unit} across {chartData.length} visits
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}

                {/* ---- Discrete vitals: LineChart with fixed Y-domain + straight lines (crt, bcs, pain) ---------- */}
                {BULLET_VITAL_KEYS.map((key) => {
                  const cfg        = VITALS_CONFIG[key];
                  const bulletCfg  = BULLET_VITALS[key];
                  const chartData  = vitalsChartData[key];
                  if (!chartData || chartData.length < 1) return null;
                  const statusLabel    = getVitalStatusLabel(key, chartData, petSpecies);
                  const interpretation = getVitalInterpretation(key, chartData, petSpecies);
                  const range = cfg.refKey ? getNormalRange(cfg.refKey, petSpecies) : null;

                  if (chartData.length === 1) {
                    return (
                      <View key={key} style={styles.vitalTabCard}>
                        <Text style={styles.trendLabel}>{cfg.label.toUpperCase()}</Text>
                        <Text style={{ fontSize: 13, color: COLORS.accent, marginTop: 4 }}>
                          {chartData[0].value}{cfg.unit} · 1 reading
                        </Text>
                        {statusLabel && (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: statusLabel.isNormal ? COLORS.success : COLORS.danger, marginTop: 2 }}>
                            {statusLabel.label}
                          </Text>
                        )}
                      </View>
                    );
                  }

                  const hexToRgba = (hex, opacity) => {
                    const r = parseInt(hex.slice(1, 3), 16);
                    const g = parseInt(hex.slice(3, 5), 16);
                    const b = parseInt(hex.slice(5, 7), 16);
                    return `rgba(${r},${g},${b},${opacity})`;
                  };
                  const vitalColor = cfg.color || COLORS.sky;

                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.vitalTabCard}
                      onPress={() => setVitalsZoom({ open: true, key })}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={styles.trendLabel}>{cfg.label.toUpperCase()}</Text>
                        {statusLabel && (
                          <Text style={{ fontSize: 11, fontWeight: '900', color: statusLabel.isNormal ? COLORS.success : COLORS.danger }}>
                            {statusLabel.label}
                          </Text>
                        )}
                      </View>
                      <GiftedLineChart
                        data={chartData.map((d, i) => ({
                          value: d.value,
                          label: chartData.length > 5
                            ? (i % Math.ceil(chartData.length / 5) === 0 ? d.label : '')
                            : d.label,
                          dataPointColor: range
                            ? (d.value >= range.low && d.value <= range.high
                                ? COLORS.success : COLORS.danger)
                            : vitalColor,
                        }))}
                        width={SCREEN_W - 80}
                        height={160}
                        initialSpacing={15}
                        overflowTop={20}
                        color={vitalColor}
                        thickness={2}
                        yAxisLabelWidth={45}
                        stepValue={key === 'pain' ? 2 : 1}
                        roundToDigits={0}
                        maxValue={bulletCfg.max}
                        minValue={bulletCfg.min}
                        formatYLabel={val => `${parseFloat(val).toFixed(0)}${cfg.unit}`}
                        yAxisTextStyle={{ fontSize: 10, color: COLORS.accent }}
                        xAxisLabelTextStyle={{ fontSize: 9, color: COLORS.accentLight }}
                        dataPointsRadius={5}
                        rulesType="solid"
                        rulesColor="rgba(0,0,0,0.05)"
                        xAxisColor={COLORS.borderLight}
                        yAxisColor={COLORS.borderLight}
                      />
                      {renderEnhancedDelta(key, chartData, ` ${cfg.unit}`, petSpecies)}
                      {interpretation && (
                        <Text style={styles.vitalInterpretation}>{interpretation}</Text>
                      )}
                      {chartData.length >= 2 && (() => {
                        const vals = chartData.map(d => d.value);
                        const minVal = Math.min(...vals);
                        const maxVal = Math.max(...vals);
                        return (
                          <Text style={styles.vitalRangeStrip}>
                            Range: {minVal}{cfg.unit} – {maxVal}{cfg.unit} across {chartData.length} visits
                          </Text>
                        );
                      })()}
                    </TouchableOpacity>
                  );
                })}

                {Object.values(vitalsChartData).every(arr => arr.length === 0) && (
                  <View style={styles.tabEmptyContainer}>
                    <MaterialIcons name="monitor-heart" size={48} color={COLORS.textMuted} />
                    <Text style={styles.tabEmptyText}>NO VITALS RECORDED</Text>
                    <Text style={styles.tabEmptySub}>
                      Vitals will appear here after a veterinary consultation.
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            {/* ---- VACCINES TAB ------------------------------------------- */}
            {activeTab === 'vaccines' && (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.tabScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* T4.194 Item 17: Passport button promoted to tab top */}
                {vaccineRecords.length > 0 && (
                  <TouchableOpacity
                    style={styles.passportHeaderBtn}
                    onPress={handleDownloadPassport}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="verified" size={16} color={COLORS.accent} />
                    <Text style={styles.passportHeaderBtnText}>DOWNLOAD VACCINATION PASSPORT</Text>
                  </TouchableOpacity>
                )}
                <VaccinationStatusCard
                  statuses={sortedStatuses}
                  completeness={vaccineCompleteness}
                  petName={petName}
                  petId={petId}
                  history={history}
                  catalog={vaccineCatalog}
                  navigation={navigation}
                  vaccinePreferences={disabledVaccines}
                  onToggleReminder={handleToggleReminder}
                  servicesPriceMap={servicesPriceMap}
                />
                {vaccinationStatuses.length === 0 && vaccineRecords.length === 0 && (
                  <View style={styles.tabEmptyContainer}>
                    <MaterialIcons name="vaccines" size={48} color={COLORS.textMuted} />
                    <Text style={styles.tabEmptyText}>NO VACCINATION RECORDS</Text>
                    <Text style={styles.tabEmptySub}>
                      Vaccination history will appear here after a vaccination visit.
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            {/* ---- OVERVIEW TAB ------------------------------------------- */}
            {activeTab === 'overview' && (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.tabScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.tabSectionTitle}>AT A GLANCE</Text>

                {/* Latest Vitals Chips */}
                {latestVitals && (
                  <View style={styles.overviewCard}>
                    <Text style={styles.overviewCardTitle}>LATEST VITALS</Text>
                    <View style={styles.overviewChipRow}>
                      {latestVitals.weight != null && latestVitals.weight !== '' && (
                        <View style={styles.overviewChip}>
                          <Text style={styles.overviewChipLabel}>WEIGHT</Text>
                          <Text style={styles.overviewChipValue}>{latestVitals.weight} kg</Text>
                        </View>
                      )}
                      {latestVitals.temp != null && latestVitals.temp !== '' && (
                        <View style={styles.overviewChip}>
                          <Text style={styles.overviewChipLabel}>TEMP</Text>
                          <Text style={styles.overviewChipValue}>{latestVitals.temp} °C</Text>
                        </View>
                      )}
                      {latestVitals.hr != null && latestVitals.hr !== '' && (
                        <View style={styles.overviewChip}>
                          <Text style={styles.overviewChipLabel}>HR</Text>
                          <Text style={styles.overviewChipValue}>{latestVitals.hr} bpm</Text>
                        </View>
                      )}
                      {latestVitals.rr != null && latestVitals.rr !== '' && (
                        <View style={styles.overviewChip}>
                          <Text style={styles.overviewChipLabel}>RR</Text>
                          <Text style={styles.overviewChipValue}>{latestVitals.rr} brpm</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* T4.13: Active Conditions — read-only display of the pet's problem list. */}
                <View style={styles.overviewCard}>
                  <Text style={styles.overviewCardTitle}>
                    CONDITIONS ({activeConditionsCount} active)
                  </Text>
                  {activeConditionsList.length > 0 ? (
                    activeConditionsList.map((cond, i) => (
                      <Text key={i} style={styles.overviewMedText}>
                        {'•'} {cond.name}{cond.severity ? ` (${cond.severity})` : ''}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.overviewEmptyText}>No active conditions</Text>
                  )}
                </View>

                {/* Active Medications */}
                <View style={styles.overviewCard}>
                  <Text style={styles.overviewCardTitle}>
                    ACTIVE MEDICATIONS ({activeRx.length})
                  </Text>
                  {activeRx.length > 0 ? (
                    activeRx.slice(0, 3).map((rx, i) => (
                      <Text key={i} style={styles.overviewMedText}>• {rx.name}</Text>
                    ))
                  ) : (
                    <Text style={styles.overviewEmptyText}>No active medications</Text>
                  )}
                  {activeRx.length > 3 && (
                    <Text style={styles.overviewMoreText}>+{activeRx.length - 3} more</Text>
                  )}
                </View>

                {/* Vaccine Completeness */}
                {vaccineCompleteness && (
                  <View style={styles.overviewCard}>
                    <Text style={styles.overviewCardTitle}>VACCINATION STATUS</Text>
                    <Text style={styles.overviewStatText}>
                      {vaccineCompleteness.administered}/{vaccineCompleteness.total} current ({vaccineCompleteness.percentage}%)
                    </Text>
                    <View style={styles.overviewProgressTrack}>
                      <View style={[styles.overviewProgressFill, {
                        width: `${vaccineCompleteness.percentage}%`,
                        backgroundColor: vaccineCompleteness.percentage >= 75 ? COLORS.success
                          : vaccineCompleteness.percentage >= 50 ? COLORS.warning
                          : COLORS.danger,
                      }]} />
                    </View>
                  </View>
                )}

                {/* Last Visit + Next Recheck */}
                <View style={styles.overviewCard}>
                  <Text style={styles.overviewCardTitle}>VISIT SUMMARY</Text>
                  <View style={styles.overviewRow}>
                    <Text style={styles.overviewLabel}>Last visit:</Text>
                    <Text style={styles.overviewValue}>
                      {history.length > 0 ? formatDisplayDate(history[0].date) : 'No visits'}
                    </Text>
                  </View>
                  {nextRecheck && (
                    <View style={styles.overviewRow}>
                      <Text style={styles.overviewLabel}>Next recheck:</Text>
                      <Text style={styles.overviewValue}>{nextRecheck}</Text>
                    </View>
                  )}
                </View>

                {/* Lab Results Summary */}
                {labSummary.length > 0 && (
                  <View style={styles.overviewCard}>
                    <Text style={styles.overviewCardTitle}>
                      TEST RESULTS ({labSummary.length})
                    </Text>
                    {labSummary.filter(l => (l.status || 'normal') !== 'normal').slice(0, 3).map((lab, i) => (
                      <Text key={i} style={[styles.overviewLabText, {
                        color: (lab.status || '').toLowerCase() === 'critical' ? COLORS.danger : COLORS.warning,
                      }]}>
                        {lab.testName}: {lab.result} — {(lab.status || 'abnormal').toUpperCase()}
                      </Text>
                    ))}
                    {labSummary.every(l => (l.status || 'normal') === 'normal') && (
                      <Text style={styles.overviewNormalText}>All results within normal range</Text>
                    )}
                  </View>
                )}

                {/* Medications full list — active + historical */}
                {(activeRx.length > 0 || historicalRx.length > 0) && (
                  <View style={styles.overviewCard}>
                    <Text style={styles.overviewCardTitle}>
                      ALL MEDICATIONS ({activeRx.length + historicalRx.length})
                    </Text>
                    {activeRx.length > 0 && (
                      <>
                        <Text style={styles.overviewSubLabel}>ACTIVE</Text>
                        {activeRx.map((rx, i) => (
                          <View key={i} style={styles.overviewMedRow}>
                            <Text style={styles.overviewMedName}>{rx.name}</Text>
                            {rx.lastInstructions ? (
                              <Text style={styles.overviewMedSig}>{rx.lastInstructions}</Text>
                            ) : null}
                            <Text style={styles.overviewMedTenure}>
                              {rx.firstShort !== rx.lastShort
                                ? `${rx.firstShort} → ${rx.lastShort}`
                                : rx.lastDate}
                            </Text>
                          </View>
                        ))}
                      </>
                    )}
                    {historicalRx.length > 0 && (
                      <>
                        <Text style={[styles.overviewSubLabel, { marginTop: 10 }]}>HISTORICAL</Text>
                        {historicalRx.map((rx, i) => (
                          <View key={i} style={[styles.overviewMedRow, { opacity: 0.65 }]}>
                            <Text style={styles.overviewMedName}>{rx.name}</Text>
                            <Text style={styles.overviewMedTenure}>
                              {rx.firstShort !== rx.lastShort
                                ? `${rx.firstShort} → ${rx.lastShort}`
                                : rx.lastDate}
                            </Text>
                          </View>
                        ))}
                      </>
                    )}
                  </View>
                )}
              </ScrollView>
            )}
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
  safeArea: { flex: 1, backgroundColor: COLORS.brand, paddingTop: Platform.OS === 'android' ? 30 : 0 },
  container: { flex: 1, backgroundColor: COLORS.cream },

  // --- Header ---
  headerBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.brand,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: COLORS.cream,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
    flex: 1,
    flex: 1,
    marginLeft: 12,
  },
  recordCountHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: `${COLORS.cream}99`,
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
    borderLeftWidth: 3,
    borderLeftColor: COLORS.sky,
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
  trendLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  // ---------------------------------------------------------------------------
  // T4.194: Tab bar styles
  // ---------------------------------------------------------------------------
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: COLORS.sky,
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
  },
  tabLabelActive: {
    color: COLORS.sky,
  },
  tabLabelDanger: {
    color: COLORS.danger,
  },
  tabWarningDot: {
    width: 6,
    height: 6,
    borderRadius: 3, // Exception: dots are circles
    backgroundColor: COLORS.danger,
  },

  // ---------------------------------------------------------------------------
  // T4.194: Shared tab content layout
  // ---------------------------------------------------------------------------
  tabScrollContent: {
    padding: 16,
    paddingBottom: 150,
    gap: 12,
  },
  tabSectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  tabEmptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 40,
  },
  tabEmptyText: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  tabEmptySub: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },

  // ---------------------------------------------------------------------------
  // T4.194 Items 2-8: VITALS tab — enhanced vital sparkline cards
  // ---------------------------------------------------------------------------
  vitalTabCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    padding: 14,
    gap: 6,
  },
  vitalTabCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vitalTabLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  vitalStatusBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  vitalInterpretation: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  vitalRangeStrip: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    letterSpacing: 0.3,
  },

  // ---------------------------------------------------------------------------
  // T4.194 Item 17: Passport button promoted to VACCINES tab header
  // ---------------------------------------------------------------------------
  passportHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  passportHeaderBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // ---------------------------------------------------------------------------
  // T4.194 Item 20: OVERVIEW tab cards
  // ---------------------------------------------------------------------------
  overviewCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    padding: 14,
    gap: 6,
  },
  overviewCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  overviewChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  overviewChip: {
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  overviewChipLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  overviewChipValue: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.brand,
    marginTop: 2,
  },
  overviewMedText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  overviewEmptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  overviewMoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.sky,
    marginTop: 2,
  },
  overviewStatText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  overviewProgressTrack: {
    height: 6,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 0,
    overflow: 'hidden',
  },
  overviewProgressFill: {
    height: 6,
    borderRadius: 0,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overviewLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  overviewValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.brand,
  },
  overviewLabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  overviewNormalText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  overviewSubLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  overviewMedRow: {
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.sky,
    paddingVertical: 2,
    gap: 2,
  },
  overviewMedName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.brand,
  },
  overviewMedSig: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  overviewMedTenure: {
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
});
