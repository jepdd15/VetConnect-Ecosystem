import { MaterialIcons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { db } from "../../firebaseConfig";
import { useClinicContact } from "../hooks/useClinicContact";
import { safeDate, formatDisplayDate } from "../utils/helpers";
import { COLORS } from '../theme/mobileTokens';
import SparkLine from '../components/SparkLine';

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

const FILTER_OPTIONS = ['All', 'Medical', 'Grooming', 'Vaccination'];

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

export default function PetHistoryScreen({ route, navigation }) {
  const { petId, petName } = route.params;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  // T3.95: Case-day metadata derived from appointment documents
  const [caseDayMap, setCaseDayMap] = useState({});
  // T3.94: Search and filter state
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const { clinicPhone, clinicName } = useClinicContact();

  // Records that carry vaccination data — used to gate the passport button and
  // to build the passport document. Derived; no extra Firestore read needed.
  const vaccineRecords = useMemo(
    () => history.filter(
      (r) => r.vaccineAdministrations?.length > 0 || r.vaccineData
    ),
    [history],
  );



  // T3.94: Derived list after applying type filter and search text.
  // history is always the source of truth; filteredHistory is read-only derived state.
  const filteredHistory = useMemo(() => {
    let result = history;

    if (activeFilter !== 'All') {
      result = result.filter(r => {
        const svcLower = (r.serviceType || '').toLowerCase();
        const typeLower = (r.recordType || '').toLowerCase();
        const filterLower = activeFilter.toLowerCase();
        if (filterLower === 'vaccination') {
          return r.vaccineAdministrations?.length > 0 || !!r.vaccineData;
        }
        return svcLower.includes(filterLower) || typeLower.includes(filterLower);
      });
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      result = result.filter(r =>
        (r.diagnosis || '').toLowerCase().includes(q) ||
        (r.serviceType || '').toLowerCase().includes(q) ||
        (r.vetName || '').toLowerCase().includes(q) ||
        (r.treatment || '').toLowerCase().includes(q) ||
        (r.serviceNames || []).some(n => n.toLowerCase().includes(q))
      );
    }

    return result;
  }, [history, activeFilter, searchText]);

  // T3.97: Aggregate prescription frequency across all history records.
  // Sorted descending by count so the most-prescribed medications appear first.
  const prescriptionFrequency = useMemo(() => {
    const rxMap = new Map();
    (history || []).forEach(r => {
      (r.prescriptions || []).forEach(rx => {
        if (!rx.name) return;
        const existing = rxMap.get(rx.name);
        if (existing) {
          existing.count += 1;
        } else {
          rxMap.set(rx.name, {
            name: rx.name,
            count: 1,
            lastInstructions: rx.instructions || '',
          });
        }
      });
    });
    return Array.from(rxMap.values()).sort((a, b) => b.count - a.count);
  }, [history]);

  // T3.93: Derive chart-ready arrays for each vital sign.
  // History is newest-first from Firestore — reverse for left-to-right time axis.
  const vitalsChartData = useMemo(() => {
    const sorted = [...history].reverse();
    const extract = (field) =>
      sorted
        .filter(r => r.vitals?.[field] != null && r.vitals[field] !== '')
        .map(r => ({ label: formatDisplayDate(r.date), value: parseFloat(r.vitals[field]) }))
        .filter(d => !isNaN(d.value));
    return {
      weight: extract('weight'),
      temp: extract('temp'),
      hr: extract('hr'),
    };
  }, [history]);

  // T3.93: Collapsible state for the vitals trends card.
  const [trendsExpanded, setTrendsExpanded] = useState(false);
  // T3.97: Collapsible state for the prescription frequency card.
  const [rxFreqExpanded, setRxFreqExpanded] = useState(false);

  const listHeader = useMemo(() => {
    const hasTrends = vitalsChartData.weight.length >= 2 ||
      vitalsChartData.temp.length >= 2 ||
      vitalsChartData.hr.length >= 2;
    const hasRx = prescriptionFrequency.length > 0;
    if (!hasTrends && !hasRx) return null;
    return (
      <View>
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
            {trendsExpanded && (
              <View style={styles.trendsBody}>
                {vitalsChartData.weight.length >= 2 && (
                  <View style={styles.trendRow}>
                    <Text style={styles.trendLabel}>WEIGHT</Text>
                    <SparkLine data={vitalsChartData.weight} lineColor={COLORS.info} unit="kg" />
                  </View>
                )}
                {vitalsChartData.temp.length >= 2 && (
                  <View style={styles.trendRow}>
                    <Text style={styles.trendLabel}>TEMPERATURE</Text>
                    <SparkLine data={vitalsChartData.temp} lineColor={COLORS.danger} unit="°C" />
                  </View>
                )}
                {vitalsChartData.hr.length >= 2 && (
                  <View style={styles.trendRow}>
                    <Text style={styles.trendLabel}>HEART RATE</Text>
                    <SparkLine data={vitalsChartData.hr} lineColor={COLORS.success} unit="bpm" />
                  </View>
                )}
              </View>
            )}
          </View>
        )}
        {hasRx && (
          <View style={styles.rxFreqCard}>
            <TouchableOpacity
              style={styles.rxFreqHeader}
              onPress={() => setRxFreqExpanded(prev => !prev)}
            >
              <Text style={styles.rxFreqTitle}>
                Frequently Prescribed ({prescriptionFrequency.length})
              </Text>
              <MaterialIcons
                name={rxFreqExpanded ? 'expand-less' : 'expand-more'}
                size={20}
                color={COLORS.accent}
              />
            </TouchableOpacity>
            {rxFreqExpanded && (
              <View style={styles.rxFreqBody}>
                {prescriptionFrequency.slice(0, 10).map((rx, i) => (
                  <View key={i} style={styles.rxFreqRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rxFreqName}>{rx.name}</Text>
                      {rx.lastInstructions ? (
                        <Text style={styles.rxFreqSig}>{rx.lastInstructions}</Text>
                      ) : null}
                    </View>
                    <View style={styles.rxFreqCountBadge}>
                      <Text style={styles.rxFreqCountText}>{rx.count}x</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  }, [vitalsChartData, trendsExpanded, prescriptionFrequency, rxFreqExpanded]);

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

  useEffect(() => {
    const q = query(
      collection(db, "medical_records"),
      where("petId", "==", petId),
      orderBy("date", "desc"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // THE ARCHITECTURAL FIX: We no longer do N+1 Queries!
        // We expect 'prescriptions' and 'serviceType' to live natively on this document.
        records.push({
          id: docSnap.id,
          ...data,
          prescriptions: (data.prescriptions || []).map(({ price, cost, unitPrice, ...rx }) => rx),
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
    });

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

    let rxHtml = '';
    if (record.prescriptions && record.prescriptions.length > 0 && !dsMeds.length) {
      rxHtml = `<h3>Prescribed Medications</h3><ul>${record.prescriptions.map((rx) =>
        `<li><b>${esc(rx.name)}</b>: ${esc(rx.instructions || "Use as directed")}</li>`
      ).join("")}</ul>`;
    }

    const nextVisitRaw = record.dischargeSummary?.nextVisit || record.nextVisit;
    const nextVisitStr = nextVisitRaw
      ? formatDisplayDate(nextVisitRaw, { month: 'long', day: 'numeric', year: 'numeric' }, null)
      : null;

    const htmlContent = `
      <html>
        <body style="font-family: Helvetica, Arial, sans-serif; padding: 40px; color: #333;">
          <h1 style="color: #8B4513; text-align: center; border-bottom: 2px solid #8B4513; padding-bottom: 10px;">Starbarks Veterinary Clinic</h1>
          <h2 style="text-align: center; margin-top: 0;">Visit Summary</h2>
          <table style="width: 100%; margin-bottom: 30px;">
            <tr><td><b>Patient:</b> ${esc(petName)}</td><td style="text-align: right;"><b>Date:</b> ${esc(dateStr)}</td></tr>
            <tr><td><b>Service:</b> ${esc(record.serviceType)}</td><td style="text-align: right;"><b>Attending Vet:</b> ${esc(record.vetName || "Staff")}</td></tr>
          </table>
          ${record.vitals ? `<h3>Vitals</h3>
          <p>
            <b>Weight:</b> ${esc(record.vitals?.weight || "-")} kg &nbsp;&nbsp; | &nbsp;&nbsp;
            <b>Temp:</b> ${esc(record.vitals?.temp || "-")} &deg;C &nbsp;&nbsp; | &nbsp;&nbsp;
            <b>Heart Rate:</b> ${esc(record.vitals?.hr || "-")} bpm
            ${record.vitals?.rr ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>RR:</b> ${esc(record.vitals.rr)} br/min` : ''}
            ${record.vitals?.crt ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>CRT:</b> ${esc(record.vitals.crt)} sec` : ''}
            ${record.vitals?.bcs ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>BCS:</b> ${esc(record.vitals.bcs)}/9` : ''}
            ${record.vitals?.pain ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>Pain:</b> ${esc(record.vitals.pain)}/10` : ''}
          </p>` : ''}
          ${dsDiagnosis ? `<h3>Diagnosis</h3><p>${esc(dsDiagnosis)}</p>` : ''}
          ${record.patientStatus ? `<p><b>Status:</b> ${esc(record.patientStatus)}</p>` : ''}
          ${hasDischarge && dsInstructions ? `<h3>Going-Home Instructions</h3><p>${esc(dsInstructions).replace(/\n/g, '<br/>')}</p>` : ''}
          ${rxHtmlFromDischarge || rxHtml}
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

    // Semantic Theme Colors
    const themeColor = isGrooming ? "#9C27B0" : COLORS.info;
    const themeBg = isGrooming ? "#F3E5F5" : "#E3F2FD";

    const coerceVital = (v) => {
      if (v == null) return '';
      const s = typeof v === 'number' || typeof v === 'string' ? String(v).trim() : '';
      return s;
    };
    const weightStr = coerceVital(item.vitals?.weight);
    const tempStr = coerceVital(item.vitals?.temp);
    const hrStr = coerceVital(item.vitals?.hr);
    // T3.88: Extended vitals — RR, CRT, BCS, Pain
    const rrStr = coerceVital(item.vitals?.rr);
    const crtStr = coerceVital(item.vitals?.crt);
    const bcsStr = coerceVital(item.vitals?.bcs);
    const painStr = coerceVital(item.vitals?.pain);
    const hasWeight = weightStr !== '';
    const hasTemp = tempStr !== '';
    const hasHR = hrStr !== '';
    const hasRR = rrStr !== '';
    const hasCRT = crtStr !== '';
    const hasBCS = bcsStr !== '';
    const hasPain = painStr !== '';
    const hasVitals = hasWeight || hasTemp || hasHR || hasRR || hasCRT || hasBCS || hasPain;

    const statusColors = getStatusColors(item.patientStatus);

    return (
      <>
        {/* T3.96: Year section header — shown when year changes between consecutive records */}
        {showYearHeader && recYear && (
          <View style={styles.yearHeader}>
            <View style={styles.yearLine} />
            <Text style={styles.yearText}>{recYear}</Text>
            <View style={styles.yearLine} />
          </View>
        )}
        <View style={styles.timelineRow}>
        <View style={styles.timelineGraphic}>
          <View style={[styles.dot, { backgroundColor: themeColor }]} />
          <View style={styles.line} />
        </View>

        <View style={styles.recordCard}>
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
            </View>
            <View style={styles.vetBadge}>
              <MaterialIcons name="person" size={14} color={COLORS.accent} />
              <Text style={styles.vetText}>
                {item.vetName || "Clinic Staff"}
              </Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            {/* T2.8 Path B: raw SOAP subjective/objective/plan hidden from client view.
                Diagnosis is shown from the top-level field; instructions from dischargeSummary. */}

            {/* T3.70: Show intake context (client's own notes + triage summary) — safe to show to client */}
            {(item.intakeContext?.clientNotes || item.intakeContext?.staffNotes) && (
              <View style={{ backgroundColor: '#FAF9F7', borderWidth: 1, borderColor: '#EDE7E0', padding: 12, marginBottom: 10 }}>
                <Text style={{ fontWeight: '900', fontSize: 10, color: '#8D6E63', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                  INTAKE NOTES
                </Text>
                {item.intakeContext.clientNotes ? (
                  <Text style={{ fontSize: 13, color: COLORS.info, fontWeight: '700', marginBottom: 2 }}>
                    CLIENT: {item.intakeContext.clientNotes}
                  </Text>
                ) : null}
                {item.intakeContext.staffNotes ? (
                  <Text style={{ fontSize: 13, color: COLORS.warning, fontWeight: '700' }}>
                    STAFF TRIAGE: {item.intakeContext.staffNotes}
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.diagnosisContainer}>
              {item.patientStatus && !isGrooming && (
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: statusColors.bg,
                      borderColor: statusColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.statusText, { color: statusColors.text }]}
                  >
                    {item.patientStatus.toUpperCase()}
                  </Text>
                </View>
              )}
              <Text
                style={[
                  styles.diagnosisText,
                  { color: isGrooming ? "#7B1FA2" : "#3E2723" },
                ]}
              >
                {item.diagnosis ||
                  (isGrooming ? "Grooming Services" : "Consultation")}
              </Text>
            </View>

            {/* T3.89: SOAP Assessment — shown when no discharge summary exists and assessment differs from diagnosis */}
            {!item.dischargeSummary && item.soap?.assessment && item.soap.assessment !== item.diagnosis && (
              <View style={styles.assessmentBox}>
                <Text style={styles.assessmentLabel}>CLINICAL ASSESSMENT</Text>
                <Text style={styles.assessmentText}>{item.soap.assessment}</Text>
              </View>
            )}

            {!isGrooming && hasVitals && (
              <View style={styles.vitalsBox}>
                {hasWeight && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>WEIGHT</Text>
                    <Text style={styles.vitalValue}>{weightStr} kg</Text>
                  </View>
                )}
                {hasTemp && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>TEMP</Text>
                    <Text style={styles.vitalValue}>{tempStr} °C</Text>
                  </View>
                )}
                {hasHR && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>HR</Text>
                    <Text style={styles.vitalValue}>{hrStr} bpm</Text>
                  </View>
                )}
                {/* T3.88: Extended vitals */}
                {hasRR && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>RR</Text>
                    <Text style={styles.vitalValue}>{rrStr} br/min</Text>
                  </View>
                )}
                {hasCRT && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>CRT</Text>
                    <Text style={styles.vitalValue}>{crtStr} sec</Text>
                  </View>
                )}
                {hasBCS && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>BCS</Text>
                    <Text style={styles.vitalValue}>{bcsStr} /9</Text>
                  </View>
                )}
                {hasPain && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>PAIN</Text>
                    <Text style={styles.vitalValue}>{painStr} /10</Text>
                  </View>
                )}
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

            {item.prescriptions && item.prescriptions.length > 0 && (
              <View style={styles.rxBox}>
                <Text style={styles.rxTitle}>💊 Prescribed Medications:</Text>
                {item.prescriptions.map((rx, idx) => (
                  <View key={idx} style={styles.rxItem}>
                    <Text style={styles.rxName}>• {rx.name}</Text>
                    <Text style={styles.rxSig}>
                      Sig: {rx.instructions || "Use as directed"}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {item.attachments && item.attachments.length > 0 && (
              <View style={styles.attachmentBox}>
                <Text style={styles.attachmentTitle}>
                  📎 Lab Results & Files:
                </Text>
                <View style={styles.attachmentList}>
                  {item.attachments.map((file, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.attachmentChip}
                      onPress={() => handleOpenAttachment(file.url || file)}
                    >
                      <Text style={styles.attachmentChipText}>
                        📄 {file.name || `Attachment ${idx + 1}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* DISCHARGE SUMMARY — polished as "Going-Home Instructions" */}
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
                    <Text style={styles.dischargeHeader}>GOING-HOME INSTRUCTIONS</Text>
                    {ds.patientStatus && (
                      <Text style={styles.dischargeStatusPill}>{ds.patientStatus}</Text>
                    )}
                  </View>

                  {ds.diagnosis && (
                    <View style={styles.dischargeTldrBlock}>
                      <Text style={styles.dischargeTldrLabel}>TL;DR</Text>
                      <Text style={styles.dischargeTldrText}>{ds.diagnosis}</Text>
                    </View>
                  )}

                  {doThisItems.length > 0 && (
                    <View style={styles.dischargeSection}>
                      <Text style={styles.dischargeSectionLabel}>✓ Do this</Text>
                      {doThisItems.map((line, i) => (
                        <Text key={i} style={styles.dischargeBullet}>• {line}</Text>
                      ))}
                    </View>
                  )}

                  {ds.medications && ds.medications.length > 0 && (
                    <View style={styles.dischargeSection}>
                      <Text style={styles.dischargeSectionLabel}>💊 Medications</Text>
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

                  {nextVisitStr && (
                    <View style={styles.dischargeNextVisit}>
                      <Text style={styles.dischargeNextVisitIcon}>📅</Text>
                      <Text style={styles.dischargeNextVisitText}>
                        Follow up <Text style={styles.dischargeNextVisitDate}>{nextVisitStr}</Text>
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.dischargeCallBtn, !clinicPhone && { backgroundColor: '#BDBDBD' }]}
                    onPress={() => {
                      if (!clinicPhone) return;
                      Linking.openURL(`tel:${clinicPhone}`);
                    }}
                    disabled={!clinicPhone}
                  >
                    <Text style={styles.dischargeCallBtnText}>📞 Call us</Text>
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
                <Text style={styles.vaccineHeader}>💉 VACCINATION RECORD</Text>
                {(item.vaccineAdministrations || (item.vaccineData ? [item.vaccineData] : [])).map((vax, vIdx) => (
                  <View key={vIdx} style={vIdx > 0 ? { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#C8E6C9' } : undefined}>
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
                        <Text style={styles.vaccineDueText}>⏰ Next dose due {vax.dueDate}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* LAB RESULTS */}
            {item.labResults?.length > 0 && (
              <View style={styles.labCard}>
                <Text style={styles.labHeader}>🔬 LAB RESULTS</Text>
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
                  return (
                    <View key={i} style={styles.labRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.labTestName}>{lab.testName}</Text>
                        <Text style={styles.labResult}>{lab.result}</Text>
                      </View>
                      <Text style={[styles.labStatusPill, { color: statusColor, backgroundColor: statusBg }]}>
                        {statusKey.toUpperCase()}
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
                    return (
                      <View key={idx} style={styles.amendmentEntry}>
                        {amend.reason ? (
                          <Text style={styles.amendmentReason}>Reason: {amend.reason}</Text>
                        ) : null}
                        <Text style={styles.amendmentText}>{amend.text}</Text>
                        <Text style={styles.amendmentMeta}>
                          {amend.vetName || 'Clinician'}
                          {ts ? ` — ${ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            )}
          </View>

          {item.nextVisit && (
            <View style={styles.reminderBanner}>
              <MaterialIcons name="event" size={16} color={COLORS.danger} />
              <Text style={styles.reminderText}>
                NEXT VISIT DUE:{" "}
                {safeDate(item.nextVisit, { month: "long", day: "numeric", year: "numeric" }, "an upcoming date")}
              </Text>
            </View>
          )}

          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={styles.pdfBtn}
              onPress={() => generatePDF(item)}
            >
              <MaterialIcons name="picture-as-pdf" size={18} color={COLORS.accent} />
              <Text style={styles.pdfBtnText}>Download Visit Summary</Text>
            </TouchableOpacity>
          </View>
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
        <Text style={styles.headerTitle}>{petName}&apos;s Chart</Text>
        <View style={{ width: 40 }} /> {/* Spacer for centering */}
      </View>

      {/* Vaccination passport button — only visible when the pet has vaccine records */}
      {!loading && vaccineRecords.length > 0 && (
        <View style={styles.passportStrip}>
          <View style={styles.passportShadow} />
          <TouchableOpacity
            style={styles.passportBtn}
            onPress={handleDownloadPassport}
            activeOpacity={0.85}
          >
            <MaterialIcons name="verified" size={18} color={COLORS.cream} />
            <Text style={styles.passportBtnText}>Download Vaccination Passport</Text>
          </TouchableOpacity>
        </View>
      )}

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
          </View>
          <View style={styles.filterChipRow}>
            {FILTER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[styles.filterChip, activeFilter === opt && styles.filterChipActive]}
                onPress={() => setActiveFilter(opt)}
              >
                <Text style={[styles.filterChipText, activeFilter === opt && styles.filterChipTextActive]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.accent}
            style={{ marginTop: 50 }}
          />
        ) : (
          <FlatList
            data={filteredHistory}
            keyExtractor={(item) => item.id}
            renderItem={renderRecord}
            contentContainerStyle={{ padding: 20, paddingBottom: 150 }}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={{ fontSize: 60, marginBottom: 10 }}>📂</Text>
                <Text style={styles.emptyText}>No medical records found.</Text>
                <Text style={styles.emptySub}>
                  Visit summaries and lab results will appear here after a
                  consultation.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  container: { flex: 1, backgroundColor: "#FAFAFA" },

  headerBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.cream,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    elevation: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitle: {
    color: COLORS.brand,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  timelineRow: { flexDirection: "row", marginBottom: 25 },
  timelineGraphic: { width: 30, alignItems: "center" },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: COLORS.white,
    zIndex: 2,
    marginTop: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  line: {
    position: "absolute",
    top: 25,
    bottom: -25,
    width: 2,
    backgroundColor: "#E0E0E0",
    zIndex: 1,
  },

  recordCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    elevation: 3,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  dateText: { fontWeight: "900", fontSize: 16, marginBottom: 2 },
  serviceText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  vetBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFEBE9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  vetText: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: "bold",
    marginLeft: 4,
  },

  cardBody: { padding: 15 },

  diagnosisContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  diagnosisText: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 5,
    lineHeight: 24,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  vitalsBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    gap: 8,
  },
  vitalItem: { alignItems: "center", minWidth: 60 },
  vitalLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: "900",
    marginBottom: 4,
  },
  vitalValue: { fontSize: 15, color: COLORS.textPrimary, fontWeight: "800" },

  planBox: {
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: 15,
  },
  planLabel: {
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  planText: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 22, fontWeight: "500" },

  rxBox: {
    backgroundColor: "#FFF3E0",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#FFE0B2",
  },
  rxTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.warning,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  rxItem: { marginBottom: 8 },
  rxName: { fontSize: 15, fontWeight: "800", color: COLORS.brand },
  rxSig: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: "italic",
    marginLeft: 10,
    marginTop: 2,
  },

  attachmentBox: { marginBottom: 10 },
  attachmentTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.info,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  attachmentList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  attachmentChip: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#90CAF9",
  },
  attachmentChipText: { color: COLORS.info, fontSize: 12, fontWeight: "bold" },

  reminderBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFEBEE",
    padding: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#FFCDD2",
  },
  reminderText: { color: COLORS.danger, fontWeight: "900", fontSize: 13 },

  cardFooter: { padding: 15, backgroundColor: "#FAFAFA" },
  pdfBtn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  pdfBtnText: { color: COLORS.accent, fontWeight: "900", fontSize: 14 },

  emptyContainer: {
    alignItems: "center",
    marginTop: 100,
    paddingHorizontal: 40,
  },
  emptyText: {
    color: COLORS.accent,
    fontWeight: "900",
    fontSize: 22,
    textAlign: "center",
  },
  emptySub: {
    color: COLORS.textMuted,
    fontStyle: "italic",
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
  },

  // --- Discharge card (B4) ---
  dischargeCard: {
    marginTop: 14,
    padding: 16,
    backgroundColor: "#F1F8E9",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#C5E1A5",
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  dischargeHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dischargeHeader: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.success,
    letterSpacing: 1.2,
  },
  dischargeStatusPill: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1B5E20",
    backgroundColor: "#DCEDC8",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    overflow: "hidden",
  },
  dischargeTldrBlock: {
    marginBottom: 12,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  dischargeTldrLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.accent,
    letterSpacing: 1,
    marginBottom: 2,
  },
  dischargeTldrText: {
    fontSize: 15,
    color: COLORS.brand,
    fontWeight: "600",
    lineHeight: 20,
  },
  dischargeSection: {
    marginBottom: 12,
  },
  dischargeSectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.success,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  dischargeBullet: {
    fontSize: 14,
    color: COLORS.brand,
    lineHeight: 20,
    marginLeft: 6,
    marginBottom: 3,
  },
  dischargeMedRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  dischargeMedName: {
    fontSize: 14,
    fontWeight: "800",
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
    backgroundColor: "#FFF3E0",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FFCC80",
  },
  dischargeNextVisitIcon: {
    fontSize: 18,
    marginRight: 8,
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
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  dischargeCallBtnText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  dischargeFollowUpBtn: {
    backgroundColor: "#FFF3E0",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#FFCC80",
  },
  dischargeFollowUpBtnText: {
    color: COLORS.warning,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  dischargeSignature: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: "italic",
    textAlign: "right",
    marginTop: 4,
  },

  // --- Vaccine card (B4) ---
  vaccineCard: {
    marginTop: 12,
    padding: 14,
    backgroundColor: COLORS.cream,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFE0B2",
  },
  vaccineHeader: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.warning,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  vaccineName: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.brand,
    marginBottom: 10,
  },
  vaccineGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  vaccineCell: {
    backgroundColor: "white",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    minWidth: 70,
  },
  vaccineCellLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  vaccineCellValue: {
    fontSize: 12,
    color: COLORS.brand,
    fontWeight: "700",
  },
  vaccineDueBanner: {
    backgroundColor: "#FFEBEE",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  vaccineDueText: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: "800",
    textAlign: "center",
  },

  // --- Vaccination passport action strip ---
  passportStrip: {
    // Neubrutalist offset-shadow wrapper. The shadow view sits behind the button.
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
  },
  passportShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  passportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
  },
  passportBtnText: {
    color: COLORS.cream,
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // --- Lab results card (B4) ---
  labCard: {
    marginTop: 12,
    padding: 14,
    backgroundColor: "#E3F2FD",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BBDEFB",
  },
  labHeader: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.info,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  labRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  labTestName: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.brand,
  },
  labResult: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  labStatusPill: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
    textTransform: "uppercase",
  },

  // T3.81: Service chips
  serviceChip: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
    backgroundColor: '#FFF3E0',
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
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
    marginBottom: 15,
    borderRadius: 0,
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
    borderColor: '#FFE0B2',
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

  // T3.94: Search + filter bar
  searchFilterBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.cream,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
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
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
    backgroundColor: COLORS.white,
  },
  filterChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.brand,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChipTextActive: {
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
    borderTopColor: '#E0E0E0',
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
    borderTopColor: '#E0E0E0',
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
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FFE0B2',
    borderRadius: 0,
  },
  rxFreqCountText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.warning,
  },
});
