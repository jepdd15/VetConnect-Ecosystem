import React, { useState, useEffect, useMemo } from 'react';
import {
  Drawer, Box, Typography, IconButton, Chip, Divider,
  Collapse, Stack, Paper, TextField, InputAdornment,
  CircularProgress, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Search as SearchIcon,
  Print as PrintIcon,
  Science as ScienceIcon,
  Shield as ShieldIcon,
  Vaccines as VaccinesIcon,
  AttachFile as AttachFileIcon,
} from '@mui/icons-material';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FONT, COLORS, TYPE, STATUS_COLORS } from '../theme/designTokens';
import { resolveVitals } from '../utils/resolveVitals';
import { resolveObjectiveText, hasExamData, examSummaryLine } from '../utils/examUtils';
import { openPrintWindow, UNIFIED_PRINT_STYLES, formatPrintDate, esc } from '../utils/printUtils';
import {
  renderVitalsSection,
  renderPrescriptionsSection,
  renderVaccineSection,
  renderLabResultsSection,
  renderDischargeSection,
  renderExamSection,
  renderServicesSection,
} from '../utils/printVisitSummary';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDate = (val) => {
  if (!val) return '—';
  try {
    const d = val?.toDate ? val.toDate() : new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
};

const resolveRecordDate = (record) => {
  const raw = record.createdAt || record.date;
  if (!raw) return new Date(NaN);
  return raw?.toDate ? raw.toDate() : new Date(raw);
};

const StatusChip = ({ status }) => {
  const color = STATUS_COLORS[status] || COLORS.textMuted;
  return (
    <Chip
      label={(status || 'N/A').toUpperCase().replace(/-/g, ' ')}
      size="small"
      sx={{
        height: 18, fontSize: '0.55rem', fontWeight: 900,
        borderRadius: 0, bgcolor: `${color}18`, color,
        border: `1px solid ${color}`,
      }}
    />
  );
};

// ─── Single expanded record card ─────────────────────────────────────────────

const RecordCard = ({ record, appointmentId }) => {
  const [expanded, setExpanded] = useState(false);

  const isCurrentVisit = !!(appointmentId && record.appointmentId === appointmentId);
  const dateStr = formatDate(record.createdAt || record.date);
  const hasS = record.soap?.subjective || record.subjective;
  const hasO = hasExamData(record.objectiveExam) || record.soap?.objectiveNotes || record.soap?.objective || record.objectiveNotes;
  const hasT = record.treatment || record.soap?.plan || record.plan;
  const rv = resolveVitals(record);
  const hasV = rv.weight || rv.temp || rv.hr || rv.rr != null || rv.crt != null || rv.bcs != null || rv.pain != null;
  const hasRx = (record.dispensedProducts || record.prescriptions)?.length > 0;

  return (
    <Box sx={{ mb: 1 }}>
      {/* Header Row — High-Density Clinical Command Center */}
      <Box 
        onClick={() => setExpanded(prev => !prev)} 
        sx={{
          display: 'flex', alignItems: 'center', gap: 2, py: 1.5, px: 2,
          bgcolor: expanded ? COLORS.cardBg : 'transparent',
          borderRadius: 0,
          border: expanded ? `1px solid ${COLORS.border}` : '1px solid transparent',
          borderBottom: expanded ? 'none' : '1px solid transparent',
          cursor: 'pointer', transition: 'all 0.15s ease',
          '&:hover': { bgcolor: expanded ? COLORS.cardBg : COLORS.borderLight },
        }}
      >
        {/* FORENSIC METADATA STRIP */}
        <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 800, color: COLORS.textPrimary, minWidth: 100, flexShrink: 0 }}>
          {dateStr.toUpperCase()}
        </Typography>

        <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 700, color: COLORS.textSecondary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {record.vetName || 'ATTENDING CLINICIAN'}
        </Typography>

        {/* Case-day badge */}
        {record.caseDay && (
          <Box sx={{ 
            px: 1, py: 0.25, 
            bgcolor: record.caseDay === 1 ? COLORS.chipBlueBg : COLORS.warningSurface,
            border: `1px solid ${record.caseDay === 1 ? COLORS.medical : COLORS.warning}`,
            flexShrink: 0 
          }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 900, color: record.caseDay === 1 ? COLORS.medical : COLORS.warning, textTransform: 'uppercase' }}>
              DAY {record.caseDay}
            </Typography>
          </Box>
        )}

        {/* Expand Icon */}
        <Box sx={{ color: COLORS.accent }}>{expanded ? <ExpandLessIcon sx={{ fontSize: 20 }}/> : <ExpandMoreIcon sx={{ fontSize: 20 }}/>}</Box>
      </Box>

      {/* Expanded Body — Clinical Command Center */}
      <Collapse in={expanded} timeout={200}>
        <Box sx={{ 
          bgcolor: COLORS.cardBg, px: 3, pb: 3, pt: 2, 
          border: `1px solid ${COLORS.border}`,
          borderTop: `1px solid ${COLORS.borderLight}`,
          borderRadius: 0 
        }}>
          
          {/* Services & Staff Memo */}
          <Box sx={{ mb: 2.5 }}>
            {(() => {
              const svcNames = [...(record.serviceNames?.length > 0 ? record.serviceNames : [record.serviceType || record.recordType || 'medical'])].sort();
              const servicesText = svcNames.join(', ').toUpperCase();
              
              const attrs = (record.serviceAttribution || []).filter(a => a.staffName);
              const uniquePerformers = [...new Set(attrs.map(a => a.staffName))];
              const staffText = uniquePerformers.length > 0 
                ? uniquePerformers.join(', ').toUpperCase() 
                : `${record.vetName || 'ATTENDING CLINICIAN'} (ATTENDING)`;

              return (
                <Stack spacing={0.5}>
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, width: 70, letterSpacing: 1 }}>SERVICES</Typography>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 700, color: COLORS.textPrimary, flex: 1 }}>{servicesText}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, width: 70, letterSpacing: 1 }}>STAFF</Typography>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 700, color: COLORS.textPrimary, flex: 1 }}>{staffText}</Typography>
                  </Box>
                </Stack>
              );
            })()}
          </Box>

          {/* Vitals Stream */}
          {hasV && (
            <Box sx={{ py: 1.5, borderTop: `1px dashed ${COLORS.border}`, borderBottom: `1px dashed ${COLORS.border}`, mb: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {[
                { label: 'WT',   value: rv.weight, unit: 'kg' },
                { label: 'TEMP', value: rv.temp,   unit: '°C' },
                { label: 'HR',   value: rv.hr,     unit: 'bpm' },
                { label: 'RR',   value: rv.rr,     unit: 'br/m' },
                { label: 'CRT',  value: rv.crt,    unit: 's' },
                { label: 'BCS',  value: rv.bcs,    unit: '/9' },
                { label: 'PAIN', value: rv.pain,   unit: '/10' },
              ].filter(v => v.value != null && v.value !== '').map(({ label, value, unit }) => (
                <Box key={label} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted }}>{label}</Typography>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', fontWeight: 800, color: COLORS.textPrimary }}>
                    {value}<span style={{ fontSize: '0.7rem', fontWeight: 600, color: COLORS.textMuted, marginLeft: 2 }}>{unit}</span>
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* MAIN CLINICAL GRID (6:6) */}
          <Grid container spacing={4}>
            {/* LEFT COLUMN: HISTORY & EXAM */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Stack spacing={3}>
                {/* Subjective */}
                <Box>
                  <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.textPrimary, mb: 1, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>S — SUBJECTIVE</Typography>
                  <Box sx={{ height: 200, overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.border, borderRadius: 0 } }}>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: hasS ? COLORS.textPrimary : COLORS.textMuted, fontStyle: hasS ? 'normal' : 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {hasS ? (record.soap?.subjective || record.subjective) : '— No subjective notes —'}
                    </Typography>
                  </Box>
                </Box>
                
                {/* Objective */}
                <Box>
                  <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.textPrimary, mb: 1, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>O — OBJECTIVE</Typography>
                  <Box sx={{ height: 200, overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.border, borderRadius: 0 } }}>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: hasO ? COLORS.textPrimary : COLORS.textMuted, fontStyle: hasO ? 'normal' : 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {hasO ? resolveObjectiveText(record) : '— No objective exam —'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </Grid>

            {/* RIGHT COLUMN: ASSESSMENT & PLAN */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Stack spacing={3}>
                {/* Assessment */}
                <Box>
                  <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.textPrimary, mb: 1, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>A — ASSESSMENT</Typography>
                  <Box sx={{ height: 200, overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.border, borderRadius: 0 } }}>
                    {(record.diagnoses?.length > 0) ? (
                      <Stack spacing={1} sx={{ mb: 1.5 }}>
                        {record.diagnoses.map((dx, i) => (
                          <Box key={dx.catalogId || i}>
                            <Typography sx={{ fontFamily: FONT, fontSize: '1.05rem', fontWeight: 900, color: COLORS.textPrimary, lineHeight: 1.2 }}>
                              • {dx.name.toUpperCase()}
                              {dx.severity && (
                                <Typography component="span" sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 900, color: COLORS.warning, ml: 1, textTransform: 'uppercase' }}>
                                  [{dx.severity}]
                                </Typography>
                              )}
                            </Typography>
                            {dx.notes && <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textPrimary, fontStyle: 'italic', ml: 2, mt: 0.25, opacity: 0.85 }}>{dx.notes}</Typography>}
                          </Box>
                        ))}
                      </Stack>
                    ) : (record.diagnosis || record.assessment) ? (
                      <Typography sx={{ fontFamily: FONT, fontSize: '1.05rem', fontWeight: 900, color: COLORS.textPrimary, mb: 1 }}>
                        {(record.diagnosis || record.assessment).toUpperCase()}
                      </Typography>
                    ) : null}
                    {(record.assessmentNotes || record.soap?.assessment) && (
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: COLORS.textPrimary, whiteSpace: 'pre-wrap', fontStyle: 'italic', lineHeight: 1.6 }}>
                        {record.assessmentNotes || record.soap?.assessment}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Plan */}
                <Box>
                  <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.textPrimary, mb: 1, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>P — PLAN</Typography>
                  <Box sx={{ height: 200, overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.border, borderRadius: 0 } }}>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: hasT ? COLORS.textPrimary : COLORS.textMuted, fontStyle: hasT ? 'normal' : 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {hasT ? (record.treatment || record.soap?.plan || record.plan) : '— No clinical plan —'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </Grid>
          </Grid>

          {/* DIAGNOSTIC FINDINGS (LABS) */}
          {record.labResults?.length > 0 && (
            <Box sx={{ mt: 4, pt: 3, borderTop: `1px solid ${COLORS.border}` }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.info, mb: 2, textTransform: 'uppercase', letterSpacing: 1.2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ScienceIcon sx={{ fontSize: 14 }} /> LAB RESULTS ({record.labResults.length})
              </Typography>
              
              <TableContainer component={Paper} sx={{ borderRadius: 0, border: `1px solid ${COLORS.border}`, boxShadow: 'none' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: COLORS.brand }}>
                    <TableRow>
                      <TableCell sx={{ color: 'white', fontWeight: 900, fontSize: '0.65rem', py: 1 }}>TEST NAME</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 900, fontSize: '0.65rem', py: 1 }}>RESULT</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 900, fontSize: '0.65rem', py: 1 }}>STATUS</TableCell>
                      <TableCell sx={{ color: 'white', fontWeight: 900, fontSize: '0.65rem', py: 1 }}>NOTES</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {record.labResults.map((lab, i) => {
                      const labStatus = (lab.status || 'normal').toLowerCase();
                      const statusColor = labStatus === 'critical' ? COLORS.danger : labStatus === 'abnormal' ? COLORS.warning : COLORS.success;
                      return (
                        <TableRow key={i} sx={{ '&:nth-of-type(even)': { bgcolor: '#FAF8F5' } }}>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 900, color: COLORS.brand }}>{lab.testName.toUpperCase()}</Typography>
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 900, color: COLORS.textPrimary }}>
                            {lab.result}{lab.unit ? ` ${lab.unit}` : ''}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'inline-block', px: 1, py: 0.25, bgcolor: `${statusColor}12`, border: `1px solid ${statusColor}` }}>
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.55rem', fontWeight: 900, color: statusColor }}>{labStatus.toUpperCase()}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textSecondary, fontStyle: 'italic' }}>{lab.notes || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* LOGISTICS & DISPENSING */}
          {hasRx && (
            <Box sx={{ mt: 4, pt: 3, borderTop: `1px solid ${COLORS.border}` }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.accent, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.accent}`, width: 'fit-content', pb: 0.5 }}>
                ITEMS
              </Typography>
              {(() => {
                const allRx = record.dispensedProducts || record.prescriptions || [];
                const resolvePC = (rx) => rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
                const groups = [
                  { label: 'MEDICATIONS', items: allRx.filter(rx => resolvePC(rx) === 'medicine'), color: COLORS.brand },
                  { label: 'MEDICAL SUPPLIES', items: allRx.filter(rx => resolvePC(rx) === 'medical_supply'), color: COLORS.brand },
                  { label: 'RETAIL & OTHER', items: allRx.filter(rx => !['medicine', 'medical_supply'].includes(resolvePC(rx))), color: COLORS.brand },
                ];
                return (
                  <Stack spacing={2.5}>
                    {groups.filter(g => g.items.length > 0).map((g, gi) => (
                      <Box key={gi}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.9rem', fontWeight: 900, color: g.color, mb: 1, borderBottom: `1px solid ${g.color}33`, pb: 0.5, width: 'fit-content' }}>
                          {g.label}
                        </Typography>
                        <Stack spacing={1}>
                          {g.items.map((it, ii) => (
                            <Box key={ii} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 800, color: COLORS.textPrimary, minWidth: 150 }}>
                                • {it.name.toUpperCase()} {it.qty ? `[x${it.qty}]` : ''}
                              </Typography>
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textSecondary, flex: 1 }}>
                                {it.instructions || '—'}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                );
              })()}
            </Box>
          )}

          {/* DISCHARGE SUMMARY (1:1 Parity) */}
          {record.dischargeSummary && (
            <Box sx={{ mt: 5, pt: 4, borderTop: `2px dashed ${COLORS.border}`, bgcolor: `${COLORS.cream}33`, mx: -3, px: 3 }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.brand, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>
                DISCHARGE NOTES
              </Typography>
              
              <Stack spacing={4}>
                <Box>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: COLORS.textPrimary, lineHeight: 1.6 }}>
                    {record.dischargeSummary.instructions || 'No discharge notes recorded for this visit.'}
                  </Typography>
                </Box>

                <Box sx={{ mt: 2, pt: 2, borderTop: `1px dashed ${COLORS.border}` }}>
                  <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.brand, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>
                    NEXT STEPS
                  </Typography>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: COLORS.textPrimary }}>
                    Recheck in: <strong>{record.dischargeSummary.recheckIn || 'As Needed'}</strong>
                  </Typography>
                </Box>

                <Box sx={{ alignSelf: 'flex-end', textAlign: 'right', minWidth: 250 }}>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700, color: COLORS.textMuted, fontStyle: 'italic', mb: 1 }}>SIGNED BY</Typography>
                  <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.brand }}>
                    {record.dischargeSummary.vetName?.toUpperCase() || 'ATTENDING VETERINARIAN'}
                  </Typography>
                  <Box sx={{ height: 1.5, bgcolor: COLORS.brand, mt: 1, mb: 0.5, width: '100%' }} />
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, letterSpacing: 1.5 }}>ATTENDING VETERINARIAN</Typography>
                </Box>
              </Stack>
            </Box>
          )}

          {/* ATTACHMENTS (1:1 Parity) */}
          {record.attachments?.length > 0 && (
            <Box sx={{ mt: 4, pt: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 800, color: COLORS.textMuted, mb: 0.5, width: '100%', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachFileIcon sx={{ fontSize: 13 }} />
                ATTACHMENTS ({record.attachments.length})
              </Typography>
              {record.attachments.map((file, i) => {
                const isImage = file.mimeType?.startsWith('image/');
                return (
                  <Box
                    key={i}
                    component="a"
                    href={file.url || file}
                    target="_blank"
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                      bgcolor: COLORS.panelBg, border: `1px solid ${COLORS.border}`,
                      textDecoration: 'none', cursor: 'pointer',
                      '&:hover': { bgcolor: COLORS.borderLight },
                    }}
                  >
                    {isImage ? <PetsIcon sx={{ fontSize: 16, color: COLORS.brand }} /> : <PictureAsPdfIcon sx={{ fontSize: 16, color: COLORS.danger }} />}
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: COLORS.brand }}>
                      {file.label || file.fileName || `FILE_${i + 1}`}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* AMENDMENTS AUDIT */}
          {record.amendments?.length > 0 && (
            <Box sx={{ mt: 4, pt: 3, borderTop: `1px dashed ${COLORS.border}` }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.warning, mb: 1.5, textTransform: 'uppercase', letterSpacing: 1.2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ShieldIcon sx={{ fontSize: 14 }} /> AMENDMENTS ({record.amendments.length})
              </Typography>
              <Stack spacing={1.5}>
                {record.amendments.map((am, i) => (
                  <Box key={i} sx={{ pl: 2, borderLeft: `3px solid ${COLORS.warning}`, bgcolor: COLORS.warningSurface, py: 1, px: 1.5 }}>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: COLORS.textPrimary }}>{am.text || am.soap?.subjective || 'Clinical Amendment'}</Typography>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, mt: 0.5 }}>
                      BY: {(am.vetName || am.author || 'CLINICIAN').toUpperCase()} — {formatDate(am.timestamp || am.date)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Main drawer ─────────────────────────────────────────────────────────────

/**
 * EMRDrawer — right-anchored slide-over showing a pet's complete medical history.
 *
 * Supports two access modes:
 * - ClinicalWorkspace mode: `history` prop pre-loaded, `appointmentId` for highlight
 * - Queue mode: `petId` prop triggers a one-shot getDocs fetch on open
 *
 * @prop {boolean}  open
 * @prop {function} onClose
 * @prop {Array}    history       - Pre-loaded records array (ClinicalWorkspace path)
 * @prop {string}   petName
 * @prop {string}   petSpecies
 * @prop {string}   [appointmentId] - Highlights the matching record as "CURRENT VISIT"
 * @prop {string}   [petId]       - Triggers independent fetch when history is empty (Queue path)
 */
export default function EMRDrawer({
  open,
  onClose,
  history: historyProp = [],
  petName,
  petSpecies,
  appointmentId,
  petId,
}) {
  const [fetchedRecords, setFetchedRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [departments, setDepartments] = useState([]);

  // Fetch records from Firestore when petId is provided but no pre-loaded history
  useEffect(() => {
    if (!open) return;
    if (historyProp.length === 0 && petId) {
      setLoading(true);
      const q = query(
        collection(db, 'medical_records'),
        where('petId', '==', petId),
        orderBy('date', 'desc')
      );
      getDocs(q)
        .then(snap => {
          setFetchedRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        })
        .catch((err) => {
          console.error('[EMRDrawer] petId fetch failed:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [open, petId, historyProp.length]);

  // Fetch departments for dynamic filter chips
  useEffect(() => {
    getDocs(collection(db, 'departments'))
      .then(snap => setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);

  // Reset all filter state when drawer closes
  useEffect(() => {
    if (!open) {
      setSearchText('');
      setTypeFilter('all');
      setDateRange('all');
      setFetchedRecords([]);
    }
  }, [open]);

  // Unified record source: prop-loaded takes precedence over fetched
  const records = historyProp.length > 0 ? historyProp : fetchedRecords;

  // Step 1: keyword search across clinical content fields
  const searchFiltered = useMemo(() => {
    if (!searchText.trim()) return records;
    const q = searchText.toLowerCase().trim();
    return records.filter(r =>
      (r.diagnoses?.map(d => d.name).join(' ') || r.diagnosis || r.assessment || '').toLowerCase().includes(q) ||
      (r.subjective || '').toLowerCase().includes(q) ||
      (r.plan || r.soap?.plan || '').toLowerCase().includes(q) ||
      (r.vetName || '').toLowerCase().includes(q) ||
      (r.dispensedProducts || r.prescriptions || []).some(rx => (rx.name || '').toLowerCase().includes(q)) ||
      (r.serviceType || r.primaryService || '').toLowerCase().includes(q)
    );
  }, [records, searchText]);

  // Step 2: type + date range filters applied on top of search
  const filteredRecords = useMemo(() => {
    let result = searchFiltered;

    if (typeFilter !== 'all') {
      result = result.filter(r => {
        const hasVax = r.vaccineAdministrations?.length > 0 || !!r.vaccineData;
        if (typeFilter === 'vaccination') return hasVax;
        const sType = (r.serviceType || r.primaryService || r.department || '').toLowerCase();
        return sType.includes(typeFilter);
      });
    }

    if (dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (dateRange === '6mo') cutoff.setMonth(now.getMonth() - 6);
      else if (dateRange === '1yr') cutoff.setFullYear(now.getFullYear() - 1);
      result = result.filter(r => {
        const d = resolveRecordDate(r);
        return !isNaN(d.getTime()) && d >= cutoff;
      });
    }

    return result;
  }, [searchFiltered, typeFilter, dateRange]);

  const handlePrintFullEMR = () => {
    if (records.length === 0) return;

    let lastYear = null;
    const recordsHtml = records.map(rec => {
      const d = resolveRecordDate(rec);
      const year = !isNaN(d.getTime()) ? d.getFullYear() : null;
      const pageBreak = lastYear !== null && year !== lastYear ? 'style="page-break-before: always;"' : '';
      lastYear = year;

      const rv = resolveVitals(rec);
      const diagnosis = rec.diagnoses?.length > 0
        ? rec.diagnoses.map(dx => dx.severity ? `${dx.name} (${dx.severity})` : dx.name).join('; ')
        : (rec.diagnosis || rec.assessment || '—');
      const dateStr = formatPrintDate(rec.date || rec.createdAt);
      const vetName = esc(rec.vetName || 'Unknown');
      const serviceType = esc(rec.serviceType || rec.primaryService || '');

      return `
        <div ${pageBreak}>
          <div class="section-anchor" style="border-bottom: 2px solid #1A1A1A; font-size: 14px; padding-bottom: 8px; margin-bottom: 16px;">
            ${dateStr} — ${esc(diagnosis)}
          </div>
          <div class="memo-grid" style="border-top: none; padding-top: 0;">
            <div class="memo-row">
              <div class="memo-label">Service</div>
              <div class="memo-value">${serviceType}</div>
              <div class="memo-label">Attending</div>
              <div class="memo-value">Dr. ${vetName}</div>
            </div>
          </div>

          <div class="section-anchor">Clinical Notes</div>
          ${rec.subjective ? `
            <div style="margin-bottom: 12px;">
              <span style="font-size: 10px; font-weight: 900; color: #888; text-transform: uppercase;">Subjective</span>
              <p class="content-text">${esc(rec.subjective)}</p>
            </div>
          ` : ''}

          ${renderExamSection(rec)}

          ${renderVitalsSection(rv)}
          ${renderPrescriptionsSection(rec.dispensedProducts || rec.prescriptions)}
          ${(rec.vaccineAdministrations?.length > 0
            ? rec.vaccineAdministrations.map(v => renderVaccineSection(v)).join('')
            : renderVaccineSection(rec.vaccineData))}
          ${renderLabResultsSection(rec.labResults)}
          ${renderServicesSection(rec)}
          ${renderDischargeSection(rec.dischargeSummary, rec.soap?.prognosis)}
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Full EMR — ${esc(petName || 'Patient')}</title>
  <style>${UNIFIED_PRINT_STYLES}</style>
</head>
<body>
  <div class="clinic-header">
    <p class="doc-title">Complete Medical Record</p>
    <p class="clinic-address">${esc(petName || 'Unknown Patient')}${petSpecies ? ' · ' + esc(petSpecies) : ''} · ${records.length} record${records.length !== 1 ? 's' : ''}</p>
  </div>
  ${recordsHtml}
  <div class="footer">
    Generated on ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })} · Full EMR Export
  </div>
</body>
</html>`;

    openPrintWindow(html);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="temporary"
      sx={{ zIndex: 1400 }}
      PaperProps={{
        sx: {
          width: '35vw',
          minWidth: 400,
          maxWidth: 650,
          borderRadius: 0,
          border: `3px solid ${COLORS.brand}`,
          borderRight: 'none',
          boxShadow: `-6px 0 0 ${COLORS.brand}`,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          flexShrink: 0,
          px: 3, py: 2,
          bgcolor: COLORS.brand,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `3px solid ${COLORS.brand}`,
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 900, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: 1.5, color: '#FFF8E1', fontFamily: FONT }}>
            EMR HISTORY
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#D7CCC8', mt: 0.25 }}>
            {petName || 'Unknown Patient'}
            {petSpecies ? ` · ${petSpecies.toUpperCase()}` : ''}
            {' · '}
            <span style={{ color: '#A5D6A7' }}>
              {records.length} record{records.length !== 1 ? 's' : ''}
            </span>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Print Full EMR">
            <span>
              <IconButton
                onClick={handlePrintFullEMR}
                size="small"
                disabled={records.length === 0}
                sx={{ color: '#FFF8E1', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}
              >
                <PrintIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton onClick={onClose} size="small" sx={{ color: '#FFF8E1', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2, minHeight: 0 }}>

        {/* Search field */}
        <TextField
          placeholder="Search diagnosis, vet, plan..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          size="small"
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: COLORS.textMuted }} />
              </InputAdornment>
            ),
          }}
          sx={{
            mb: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: 0,
              fontFamily: FONT,
              fontSize: '0.8rem',
              bgcolor: COLORS.surfaceHover,
              '& fieldset': { borderColor: COLORS.border },
            },
          }}
        />

        {/* Filter chips */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5, alignItems: 'center' }}>
          {[
            { key: 'all', label: 'All' },
            ...departments.map(d => ({ key: d.name.toLowerCase(), label: d.name })),
            { key: 'vaccination', label: 'Vaccination' },
          ].map(f => (
            <Chip
              key={f.key}
              label={f.label}
              size="small"
              onClick={() => setTypeFilter(f.key)}
              sx={{
                height: 22, fontSize: '0.6rem', fontWeight: 900, borderRadius: 0, fontFamily: FONT,
                bgcolor: typeFilter === f.key ? COLORS.brand : COLORS.surfaceHover,
                color: typeFilter === f.key ? '#FFF8E1' : COLORS.accent,
                border: `1px solid ${typeFilter === f.key ? COLORS.brand : COLORS.border}`,
                cursor: 'pointer',
                '&:hover': { bgcolor: typeFilter === f.key ? COLORS.accent : COLORS.borderLight },
              }}
            />
          ))}
          <Box sx={{ width: '1px', height: 16, bgcolor: COLORS.border, mx: 0.5 }} />
          {[
            { key: 'all', label: 'All time' },
            { key: '6mo', label: '6 months' },
            { key: '1yr', label: '1 year' },
          ].map(f => (
            <Chip
              key={f.key}
              label={f.label}
              size="small"
              onClick={() => setDateRange(f.key)}
              sx={{
                height: 22, fontSize: '0.6rem', fontWeight: 900, borderRadius: 0, fontFamily: FONT,
                bgcolor: dateRange === f.key ? COLORS.medical : COLORS.surfaceHover,
                color: dateRange === f.key ? 'white' : COLORS.textMuted,
                border: `1px solid ${dateRange === f.key ? COLORS.medical : COLORS.border}`,
                cursor: 'pointer',
                '&:hover': { bgcolor: dateRange === f.key ? COLORS.info : COLORS.borderLight },
              }}
            />
          ))}
          <Typography sx={{
            ml: 'auto', fontSize: '0.6rem', fontWeight: 900, color: COLORS.textMuted,
            fontFamily: FONT, letterSpacing: 0.5,
          }}>
            {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
          </Typography>
        </Box>

        {/* Record list */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} sx={{ color: COLORS.accent }} />
          </Box>
        ) : filteredRecords.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography sx={{ fontSize: '0.85rem', fontStyle: 'italic', color: COLORS.textMuted, fontFamily: FONT }}>
              {records.length === 0 ? 'No previous records on file' : 'No records match your filters'}
            </Typography>
            {records.length === 0 && (
              <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted, mt: 1 }}>
                Records will appear here after the first sign-off.
              </Typography>
            )}
          </Box>
        ) : (
          (() => {
            let lastMonthKey = '';
            return filteredRecords.map((record) => {
              const d = resolveRecordDate(record);
              const monthKey = !isNaN(d.getTime())
                ? `${d.getFullYear()}-${d.getMonth()}`
                : 'unknown';
              const showHeader = monthKey !== lastMonthKey && monthKey !== 'unknown';
              lastMonthKey = monthKey;
              const monthLabel = !isNaN(d.getTime())
                ? d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }).toUpperCase()
                : '';
              return (
                <React.Fragment key={record.id}>
                  {showHeader && (
                    <Box sx={{
                      bgcolor: COLORS.cream, px: 2, py: 0.75, mb: 1, mt: 0.5,
                      border: `1px solid ${COLORS.border}`,
                    }}>
                      <Typography sx={{
                        fontSize: '0.65rem', fontWeight: 900, color: COLORS.accent,
                        textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FONT,
                      }}>
                        {monthLabel}
                      </Typography>
                    </Box>
                  )}
                  <RecordCard record={record} appointmentId={appointmentId} />
                </React.Fragment>
              );
            });
          })()
        )}
      </Box>

      {/* Footer */}
      <Box sx={{ flexShrink: 0, px: 3, py: 1.5, bgcolor: '#F5F0E8', borderTop: `2px solid ${COLORS.brand}` }}>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Read-only view · Changes must be made via amendment
        </Typography>
      </Box>
    </Drawer>
  );
}
