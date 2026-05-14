import React, { useState, useEffect, useMemo } from 'react';
import {
  Drawer, Box, Typography, IconButton, Chip, Divider,
  Collapse, Stack, Paper, TextField, InputAdornment,
  CircularProgress, Tooltip, Button, Menu, MenuItem, Checkbox,
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
  FilterList as FilterListIcon,
  FilterListOff as FilterListOffIcon,
  Pets as PetsIcon,
  Person as PersonIcon,
  Today as TodayIcon,
  CalendarMonth as CalendarIcon,
  Female as FemaleIcon,
  Male as MaleIcon,
  Scale as ScaleIcon,
  WarningAmber as WarningIcon,
  Biotech as BiotechIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
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

const calculatePetAge = (dob) => {
  if (!dob) return '—';
  try {
    const birthDate = dob.toDate ? dob.toDate() : dob.seconds ? new Date(dob.seconds * 1000) : new Date(dob);
    if (isNaN(birthDate.getTime())) return '—';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 0) return '—';
    if (age === 0) {
      const mo = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24 * 30.44));
      return mo > 0 ? `${mo}mo` : 'Newborn';
    }
    return `${age}y`;
  } catch {
    return '—';
  }
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
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: hasO ? resolveObjectiveText(record) : '— No objective exam —' }}>
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
  const [petData, setPetData] = useState(null);
  const [ownerData, setOwnerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilters, setTypeFilters] = useState(['all']);
  const [staffFilters, setStaffFilters] = useState(['all']);
  const [labFilters, setLabFilters] = useState(['all']);
  const [diagnosisFilters, setDiagnosisFilters] = useState(['all']);
  
  // Date Range Hub States
  const [dateRangeType, setDateRangeType] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [departments, setDepartments] = useState([]);
  const [staffList, setStaffList] = useState([]);
  
  const [deptAnchorEl, setDeptAnchorEl] = useState(null);
  const [staffAnchorEl, setStaffAnchorEl] = useState(null);
  const [dateAnchorEl, setDateAnchorEl] = useState(null);
  const [labAnchorEl, setLabAnchorEl] = useState(null);
  const [diagnosisAnchorEl, setDiagnosisAnchorEl] = useState(null);

  const handleDeptClick = (e) => { e.stopPropagation(); setDeptAnchorEl(e.currentTarget); };
  const handleDeptClose = () => setDeptAnchorEl(null);

  const handleStaffClick = (e) => { e.stopPropagation(); setStaffAnchorEl(e.currentTarget); };
  const handleStaffClose = () => setStaffAnchorEl(null);

  const handleDateClick = (e) => { e.stopPropagation(); setDateAnchorEl(e.currentTarget); };
  const handleDateClose = () => setDateAnchorEl(null);

  const handleLabClick = (e) => { e.stopPropagation(); setLabAnchorEl(e.currentTarget); };
  const handleLabClose = () => setLabAnchorEl(null);

  const handleDiagnosisClick = (e) => { e.stopPropagation(); setDiagnosisAnchorEl(e.currentTarget); };
  const handleDiagnosisClose = () => setDiagnosisAnchorEl(null);

  const toggleTypeFilter = (key) => {
    if (key === 'all') {
      setTypeFilters(['all']);
    } else {
      const newFilters = typeFilters.includes(key)
        ? typeFilters.filter(f => f !== key)
        : [...typeFilters.filter(f => f !== 'all'), key];
      setTypeFilters(newFilters.length === 0 ? ['all'] : newFilters);
    }
  };

  const toggleStaffFilter = (key) => {
    if (key === 'all') {
      setStaffFilters(['all']);
    } else {
      const newFilters = staffFilters.includes(key)
        ? staffFilters.filter(f => f !== key)
        : [...staffFilters.filter(f => f !== 'all'), key];
      setStaffFilters(newFilters.length === 0 ? ['all'] : newFilters);
    }
  };

  const toggleLabFilter = (key) => {
    if (key === 'all') {
      setLabFilters(['all']);
    } else {
      const newFilters = labFilters.includes(key)
        ? labFilters.filter(f => f !== key)
        : [...labFilters.filter(f => f !== 'all'), key];
      setLabFilters(newFilters.length === 0 ? ['all'] : newFilters);
    }
  };

  const toggleDiagnosisFilter = (key) => {
    if (key === 'all') {
      setDiagnosisFilters(['all']);
    } else {
      const newFilters = diagnosisFilters.includes(key)
        ? diagnosisFilters.filter(f => f !== key)
        : [...diagnosisFilters.filter(f => f !== 'all'), key];
      setDiagnosisFilters(newFilters.length === 0 ? ['all'] : newFilters);
    }
  };

  const handleClearAll = () => {
    setSearchText('');
    setTypeFilters(['all']);
    setStaffFilters(['all']);
    setLabFilters(['all']);
    setDiagnosisFilters(['all']);
    setDateRangeType('all');
    setCustomStart('');
    setCustomEnd('');
  };

  const hasActiveFilters = useMemo(() => {
    return searchText.trim() !== '' ||
           !typeFilters.includes('all') ||
           !staffFilters.includes('all') ||
           !labFilters.includes('all') ||
           !diagnosisFilters.includes('all') ||
           dateRangeType !== 'all';
  }, [searchText, typeFilters, staffFilters, labFilters, diagnosisFilters, dateRangeType]);

  useEffect(() => {
    if (!open) return;

    // Fetch Pet & Owner Profile for Header Context
    if (petId) {
      getDoc(doc(db, 'pets', petId)).then(snap => {
        if (snap.exists()) {
          const p = { id: snap.id, ...snap.data() };
          setPetData(p);
          if (p.ownerId && p.ownerId !== 'WALK_IN_USER') {
            getDoc(doc(db, 'users', p.ownerId)).then(osnap => {
              if (osnap.exists()) setOwnerData({ id: osnap.id, ...osnap.data() });
            });
          }
        }
      });
    }

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

  useEffect(() => {
    getDocs(collection(db, 'departments'))
      .then(snap => setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});

    const staffQuery = query(
      collection(db, "users"),
      where("role", "in", ["veterinarian", "staff", "admin", "groomer"])
    );
    getDocs(staffQuery).then(snap => {
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => !u.disabled));
    });
  }, []);

  useEffect(() => {
    if (!open) {
      handleClearAll();
      setFetchedRecords([]);
      setPetData(null);
      setOwnerData(null);
      setDeptAnchorEl(null);
      setStaffAnchorEl(null);
      setDateAnchorEl(null);
      setLabAnchorEl(null);
      setDiagnosisAnchorEl(null);
    }
  }, [open]);

  const records = historyProp.length > 0 ? historyProp : fetchedRecords;

  // Dynamic discovery of unique lab tests present in this pet's history
  const availableLabTests = useMemo(() => {
    const tests = new Set();
    records.forEach(r => {
      if (r.labResults?.length > 0) {
        r.labResults.forEach(l => {
          if (l.testName) tests.add(l.testName.toUpperCase());
        });
      }
    });
    return Array.from(tests).sort();
  }, [records]);

  // Dynamic discovery of unique diagnoses present in this pet's history
  const availableDiagnoses = useMemo(() => {
    const dxs = new Set();
    records.forEach(r => {
      if (r.diagnoses?.length > 0) {
        r.diagnoses.forEach(d => { if (d.name) dxs.add(d.name.toUpperCase()); });
      } else if (r.diagnosis || r.assessment) {
        dxs.add((r.diagnosis || r.assessment).toUpperCase());
      }
    });
    return Array.from(dxs).sort();
  }, [records]);

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

  const filteredRecords = useMemo(() => {
    let result = searchFiltered;

    // Department / Category Filter
    if (!typeFilters.includes('all')) {
      result = result.filter(r => {
        const hasVax = r.vaccineAdministrations?.length > 0 || !!r.vaccineData;
        const sType = (r.serviceType || r.primaryService || r.department || '').toLowerCase();
        return typeFilters.some(f => {
          if (f === 'vaccination') return hasVax;
          return sType.includes(f);
        });
      });
    }

    // Staff / Clinician Filter
    if (!staffFilters.includes('all')) {
      result = result.filter(r => {
        const vetName = (r.vetName || '').toLowerCase();
        const attributions = (r.serviceAttribution || []).map(a => a.staffName?.toLowerCase());
        return staffFilters.some(f => {
          const filterName = f.toLowerCase();
          return vetName.includes(filterName) || attributions.some(attr => attr?.includes(filterName));
        });
      });
    }

    // Diagnosis Filter
    if (!diagnosisFilters.includes('all')) {
      result = result.filter(r => {
        const recordDxs = [
          ...(r.diagnoses?.map(d => d.name.toUpperCase()) || []),
          (r.diagnosis || r.assessment || '').toUpperCase()
        ].filter(Boolean);
        return diagnosisFilters.some(f => recordDxs.includes(f.toUpperCase()));
      });
    }

    // Lab Test Filter
    if (!labFilters.includes('all')) {
      result = result.filter(r => {
        if (!r.labResults || r.labResults.length === 0) return false;
        const recordTests = r.labResults.map(l => l.testName?.toUpperCase());
        return labFilters.some(f => recordTests.includes(f.toUpperCase()));
      });
    }

    // Temporal Hub Filtering Logic
    if (dateRangeType !== 'all') {
      const now = new Date();
      let start = null;
      let end = null;

      if (dateRangeType === 'today') {
        start = new Date(now.setHours(0,0,0,0));
        end = new Date(now.setHours(23,59,59,999));
      } else if (dateRangeType === '30d') {
        start = new Date();
        start.setDate(now.getDate() - 30);
      } else if (dateRangeType === '6mo') {
        start = new Date();
        start.setMonth(now.getMonth() - 6);
      } else if (dateRangeType === '1yr') {
        start = new Date();
        start.setFullYear(now.getFullYear() - 1);
      } else if (dateRangeType === 'custom') {
        if (customStart) start = new Date(customStart);
        if (customEnd) {
          end = new Date(customEnd);
          end.setHours(23,59,59,999);
        }
      }

      result = result.filter(r => {
        const d = resolveRecordDate(r);
        if (isNaN(d.getTime())) return false;
        const afterStart = start ? d >= start : true;
        const beforeEnd = end ? d <= end : true;
        return afterStart && beforeEnd;
      });
    }

    return result;
  }, [searchFiltered, typeFilters, staffFilters, diagnosisFilters, labFilters, dateRangeType, customStart, customEnd]);

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

  const getDateLabel = () => {
    if (dateRangeType === 'all') return 'ALL TIME';
    if (dateRangeType === 'today') return 'TODAY';
    if (dateRangeType === '30d') return 'LAST 30D';
    if (dateRangeType === '6mo') return '6 MONTHS';
    if (dateRangeType === '1yr') return '1 YEAR';
    if (dateRangeType === 'custom') {
      if (customStart && customEnd) return `${customStart.split('-').slice(1).join('/')} - ${customEnd.split('-').slice(1).join('/')}`;
      return 'CUSTOM RANGE';
    }
    return 'DATE RANGE';
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
          width: '45vw',
          minWidth: 500,
          maxWidth: 800,
          borderRadius: 0,
          border: `3px solid ${COLORS.brand}`,
          borderRight: 'none',
          boxShadow: `-6px 0 0 ${COLORS.brand}`,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header — Unified Forensic Patient Banner */}
      <Box
        sx={{
          flexShrink: 0,
          px: 3, py: 2,
          bgcolor: COLORS.brand,
          borderBottom: `3px solid ${COLORS.brand}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
          {/* Top Row: Identity */}
          <Box>
            <Tooltip title={`SYSTEM ID: ${petId || 'NEW'}`} arrow>
              <Typography sx={{ fontWeight: 900, fontSize: '1.3rem', textTransform: 'uppercase', letterSpacing: 1.5, color: '#FFF8E1', fontFamily: FONT, lineHeight: 1.1, cursor: 'help' }}>
                {petName?.toUpperCase() || 'UNKNOWN PATIENT'}
              </Typography>
            </Tooltip>
            <Tooltip title={`OWNER: ${ownerData?.fullName?.toUpperCase() || 'UNKNOWN'} | PHONE: ${ownerData?.phone || '—'} | EMAIL: ${ownerData?.email || '—'}`} arrow>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: '#A5D6A7', textTransform: 'uppercase', mt: 0.25, cursor: 'help' }}>
                {ownerData?.fullName?.toUpperCase() || petData?.ownerName?.toUpperCase() || 'UNKNOWN OWNER'}
                {ownerData?.phone && ` · ${ownerData.phone}`}
              </Typography>
            </Tooltip>
          </Box>

          {/* Right: Records & Action Cluster */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ textAlign: 'right', mr: 1 }}>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 900, color: '#FFF8E1', fontFamily: FONT, lineHeight: 1 }}>
                {records.length}
              </Typography>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 900, color: '#D7CCC8', letterSpacing: 1.5 }}>
                RECORDS
              </Typography>
            </Box>
            <Box sx={{ width: '2px', height: 32, bgcolor: 'rgba(255,255,255,0.1)' }} />
            <Tooltip title="Print Full EMR">
              <span>
                <IconButton onClick={handlePrintFullEMR} size="small" disabled={records.length === 0} sx={{ color: '#FFF8E1', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                  <PrintIcon sx={{ fontSize: 24 }} />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton onClick={onClose} size="small" sx={{ color: '#FFF8E1', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
              <CloseIcon sx={{ fontSize: 26 }} />
            </IconButton>
          </Box>
        </Box>

        {/* Bottom Row: Clinical Metadata (1:1 Parity with Dashboard) */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 3, rowGap: 1, pt: 1, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          
          {/* Species & Breed */}
          <Box>
            <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: '#D7CCC8', textTransform: 'uppercase', letterSpacing: 1 }}>SPECIES / BREED</Typography>
            <Tooltip title={`LINEAGE: ${petSpecies?.toUpperCase() || '—'} · ${petData?.breed?.toUpperCase() || 'UNKNOWN BREED'}`} arrow>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: 'white', textTransform: 'uppercase', cursor: 'help' }}>
                {petSpecies?.toUpperCase() || petData?.species?.toUpperCase() || '—'}
                {` · ${petData?.breed?.toUpperCase() || 'UNKNOWN BREED'}`}
              </Typography>
            </Tooltip>
          </Box>

          {/* Sex & Status */}
          <Box>
            <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: '#D7CCC8', textTransform: 'uppercase', letterSpacing: 1 }}>SEX & STATUS</Typography>
            <Tooltip title={(() => {
              const gender = petData?.gender || petData?.sex;
              const isNeutered = petData?.isNeutered || petData?.spayed || petData?.neutered;
              return `REPRODUCTIVE STATUS: ${gender?.toUpperCase() || 'UNKNOWN'} (${isNeutered ? (gender === 'Female' ? 'SPAYED' : 'NEUTERED') : 'INTACT'})`;
            })()} arrow>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                {(() => {
                  const gender = petData?.gender || petData?.sex;
                  const isNeutered = petData?.isNeutered || petData?.spayed || petData?.neutered;
                  if (gender === 'Female') return <><FemaleIcon sx={{ fontSize: 13, color: '#F48FB1' }} /> {`FEMALE (${isNeutered ? 'SPAYED' : 'INTACT'})`}</>;
                  if (gender === 'Male') return <><MaleIcon sx={{ fontSize: 13, color: '#90CAF9' }} /> {`MALE (${isNeutered ? 'NEUTERED' : 'INTACT'})`}</>;
                  return '—';
                })()}
              </Typography>
            </Tooltip>
          </Box>

          {/* Age */}
          <Box>
            <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: '#D7CCC8', textTransform: 'uppercase', letterSpacing: 1 }}>CURRENT AGE</Typography>
            <Tooltip title={`DATE OF BIRTH: ${formatDate(petData?.dob || petData?.birthDate)}`} arrow>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: '#FFF8E1', cursor: 'help' }}>
                {calculatePetAge(petData?.dob || petData?.birthDate).toUpperCase()}
              </Typography>
            </Tooltip>
          </Box>

          {/* Weight */}
          <Box>
            <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: '#D7CCC8', textTransform: 'uppercase', letterSpacing: 1 }}>WEIGHT</Typography>
            <Tooltip title={`LAST RECORDED WEIGHT: ${petData?.lastWeight || '—'} KG`} arrow>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: 'white', cursor: 'help' }}>
                {petData?.lastWeight ? `${petData.lastWeight} KG` : '—'}
              </Typography>
            </Tooltip>
          </Box>

          {/* Allergies */}
          <Box>
            <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: '#D7CCC8', textTransform: 'uppercase', letterSpacing: 1 }}>ALLERGIES</Typography>
            {(() => {
              const allg = (petData?.petAllergies || petData?.allergies || '').trim();
              const hasA = allg.length > 0 && !['None', 'None recorded', 'none', 'nka'].includes(allg.toLowerCase());
              if (hasA) {
                return (
                  <Tooltip title={`CONTRAINDICATIONS: ${allg.toUpperCase()}`} arrow>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: COLORS.surgery, px: 1, py: 0.25, cursor: 'help' }}>
                      <ShieldIcon sx={{ fontSize: 12, color: 'white' }} />
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>{allg}</Typography>
                    </Box>
                  </Tooltip>
                );
              }
              return (
                <Tooltip title="SAFETY CONFIRMATION: NO KNOWN ALLERGIES" arrow>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 900, color: '#A5D6A7', cursor: 'help' }}>NKA</Typography>
                </Tooltip>
              );
            })()}
          </Box>
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2, minHeight: 0 }}>

        {/* UNIFIED SEARCH & FILTER HUB */}
        <Box sx={{
          border: `2px solid ${COLORS.brand}`,
          bgcolor: COLORS.surfaceHover,
          mb: 3,
          '&:focus-within': { borderColor: COLORS.accent },
          transition: 'all 0.15s ease',
          position: 'relative',
          zIndex: 1,
        }}>
          {/* Search Input */}
          <TextField
            placeholder="SEARCH CLINICAL RECORDS..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            size="small"
            fullWidth
            autoComplete="off"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 20, color: COLORS.brand }} />
                </InputAdornment>
              ),
              sx: {
                '& fieldset': { border: 'none' },
                fontFamily: FONT,
                fontSize: '0.85rem',
                fontWeight: 800,
                color: COLORS.brand,
                letterSpacing: 1,
                cursor: 'text',
                '& ::placeholder': { color: `${COLORS.brand}99`, opacity: 1 }
              }
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                padding: '6px 12px',
              }
            }}
          />

          <Divider sx={{ borderColor: COLORS.brand, borderWidth: 1 }} />

          {/* Integrated Filter Hub */}
          <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap', bgcolor: COLORS.cream }}>
            
            {/* Dept Multi-Select */}
            <Button
              onClick={handleDeptClick}
              endIcon={<FilterListIcon sx={{ fontSize: 16 }} />}
              sx={{
                height: 36, px: 2,
                bgcolor: typeFilters.includes('all') ? 'white' : COLORS.brand,
                color: typeFilters.includes('all') ? COLORS.brand : 'white',
                border: `2px solid ${COLORS.brand}`,
                boxShadow: `2px 2px 0 ${COLORS.brand}`,
                borderRadius: 0, fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem',
                letterSpacing: 1,
                '&:hover': { bgcolor: typeFilters.includes('all') ? COLORS.borderLight : COLORS.accent, boxShadow: 'none', transform: 'translate(1px, 1px)' }
              }}
            >
              {typeFilters.includes('all') ? 'DEPTS' : `${typeFilters.length} DEPTS`}
            </Button>

            {/* Staff Multi-Select */}
            <Button
              onClick={handleStaffClick}
              endIcon={<PersonIcon sx={{ fontSize: 16 }} />}
              sx={{
                height: 36, px: 2,
                bgcolor: staffFilters.includes('all') ? 'white' : COLORS.brand,
                color: staffFilters.includes('all') ? COLORS.brand : 'white',
                border: `2px solid ${COLORS.brand}`,
                boxShadow: `2px 2px 0 ${COLORS.brand}`,
                borderRadius: 0, fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem',
                letterSpacing: 1,
                '&:hover': { bgcolor: staffFilters.includes('all') ? COLORS.borderLight : COLORS.accent, boxShadow: 'none', transform: 'translate(1px, 1px)' }
              }}
            >
              {staffFilters.includes('all') ? 'STAFF' : `${staffFilters.length} STAFF`}
            </Button>

            {/* Diagnosis Multi-Select */}
            <Button
              onClick={handleDiagnosisClick}
              endIcon={<AssignmentIcon sx={{ fontSize: 16 }} />}
              sx={{
                height: 36, px: 2,
                bgcolor: diagnosisFilters.includes('all') ? 'white' : COLORS.brand,
                color: diagnosisFilters.includes('all') ? COLORS.brand : 'white',
                border: `2px solid ${COLORS.brand}`,
                boxShadow: `2px 2px 0 ${COLORS.brand}`,
                borderRadius: 0, fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem',
                letterSpacing: 1,
                '&:hover': { bgcolor: diagnosisFilters.includes('all') ? COLORS.borderLight : COLORS.accent, boxShadow: 'none', transform: 'translate(1px, 1px)' }
              }}
            >
              {diagnosisFilters.includes('all') ? 'DIAGNOSIS' : `${diagnosisFilters.length} DX`}
            </Button>

            {/* Lab Multi-Select */}
            <Button
              onClick={handleLabClick}
              endIcon={<BiotechIcon sx={{ fontSize: 16 }} />}
              sx={{
                height: 36, px: 2,
                bgcolor: labFilters.includes('all') ? 'white' : COLORS.info,
                color: labFilters.includes('all') ? COLORS.info : 'white',
                border: `2px solid ${labFilters.includes('all') ? COLORS.brand : COLORS.info}`,
                boxShadow: `2px 2px 0 ${labFilters.includes('all') ? COLORS.brand : COLORS.info}`,
                borderRadius: 0, fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem',
                letterSpacing: 1,
                '&:hover': { bgcolor: labFilters.includes('all') ? COLORS.borderLight : COLORS.info, boxShadow: 'none', transform: 'translate(1px, 1px)' }
              }}
            >
              {labFilters.includes('all') ? 'LABS' : `${labFilters.length} LABS`}
            </Button>

            {/* Date Range Hub */}
            <Button
              onClick={handleDateClick}
              endIcon={<CalendarIcon sx={{ fontSize: 16 }} />}
              sx={{
                height: 36, px: 2,
                bgcolor: dateRangeType === 'all' ? 'white' : COLORS.medical,
                color: dateRangeType === 'all' ? COLORS.medical : 'white',
                border: `2px solid ${dateRangeType === 'all' ? COLORS.brand : COLORS.medical}`,
                boxShadow: `2px 2px 0 ${dateRangeType === 'all' ? COLORS.brand : COLORS.medical}`,
                borderRadius: 0, fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem',
                letterSpacing: 1,
                '&:hover': { bgcolor: dateRangeType === 'all' ? COLORS.borderLight : COLORS.medical, boxShadow: 'none', transform: 'translate(1px, 1px)' }
              }}
            >
              {getDateLabel()}
            </Button>

            {/* Atomic Reset Button */}
            {hasActiveFilters && (
              <Button
                onClick={handleClearAll}
                startIcon={<FilterListOffIcon sx={{ fontSize: 16 }} />}
                sx={{
                  height: 36, px: 2,
                  bgcolor: COLORS.danger,
                  color: 'white',
                  border: `2px solid ${COLORS.brand}`,
                  boxShadow: `2px 2px 0 ${COLORS.brand}`,
                  borderRadius: 0, fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem',
                  letterSpacing: 1,
                  '&:hover': { bgcolor: COLORS.danger, opacity: 0.85, boxShadow: 'none', transform: 'translate(1px, 1px)' }
                }}
              >
                CLEAR
              </Button>
            )}

            <Typography sx={{
              ml: 'auto', fontSize: '0.65rem', fontWeight: 900, color: COLORS.brand,
              fontFamily: FONT, letterSpacing: 1, opacity: 1
            }}>
              {filteredRecords.length} REC
            </Typography>
          </Box>
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

      {/* Dept Menu */}
      <Menu
        anchorEl={deptAnchorEl}
        open={Boolean(deptAnchorEl)}
        onClose={handleDeptClose}
        sx={{ zIndex: 3000 }}
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: 0, border: `2px solid ${COLORS.brand}`,
            mt: 0.5, boxShadow: `4px 4px 0 ${COLORS.brand}`,
            minWidth: 200,
          }
        }}
      >
        <MenuItem 
          onClick={() => toggleTypeFilter('all')}
          sx={{ py: 0.5, px: 1.5, bgcolor: typeFilters.includes('all') ? `${COLORS.brand}12` : 'transparent' }}
        >
          <Checkbox size="small" checked={typeFilters.includes('all')} sx={{ p: 0.5, color: COLORS.brand }} />
          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.brand }}>ALL DEPARTMENTS</Typography>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        {[
          ...departments.map(d => ({ key: d.name.toLowerCase(), label: d.name.toUpperCase() })),
          { key: 'vaccination', label: 'VACCINATION' },
        ].map(f => (
          <MenuItem 
            key={f.key} 
            onClick={() => toggleTypeFilter(f.key)}
            sx={{ py: 0.5, px: 1.5 }}
          >
            <Checkbox size="small" checked={typeFilters.includes(f.key)} sx={{ p: 0.5, color: COLORS.brand }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: COLORS.textPrimary }}>{f.label}</Typography>
          </MenuItem>
        ))}
      </Menu>

      {/* Staff Menu */}
      <Menu
        anchorEl={staffAnchorEl}
        open={Boolean(staffAnchorEl)}
        onClose={handleStaffClose}
        sx={{ zIndex: 3000 }}
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: 0, border: `2px solid ${COLORS.brand}`,
            mt: 0.5, boxShadow: `4px 4px 0 ${COLORS.brand}`,
            minWidth: 200,
          }
        }}
      >
        <MenuItem 
          onClick={() => toggleStaffFilter('all')}
          sx={{ py: 0.5, px: 1.5, bgcolor: staffFilters.includes('all') ? `${COLORS.brand}12` : 'transparent' }}
        >
          <Checkbox size="small" checked={staffFilters.includes('all')} sx={{ p: 0.5, color: COLORS.brand }} />
          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.brand }}>ALL STAFF</Typography>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        {staffList.map(s => (
          <MenuItem 
            key={s.id} 
            onClick={() => toggleStaffFilter(s.fullName)}
            sx={{ py: 0.5, px: 1.5 }}
          >
            <Checkbox size="small" checked={staffFilters.includes(s.fullName)} sx={{ p: 0.5, color: COLORS.brand }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: COLORS.textPrimary }}>{s.fullName.toUpperCase()}</Typography>
          </MenuItem>
        ))}
      </Menu>

      {/* Diagnosis Menu */}
      <Menu
        anchorEl={diagnosisAnchorEl}
        open={Boolean(diagnosisAnchorEl)}
        onClose={handleDiagnosisClose}
        sx={{ zIndex: 3000 }}
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: 0, border: `2px solid ${COLORS.brand}`,
            mt: 0.5, boxShadow: `4px 4px 0 ${COLORS.brand}`,
            minWidth: 240, maxHeight: 400
          }
        }}
      >
        <MenuItem 
          onClick={() => toggleDiagnosisFilter('all')}
          sx={{ py: 0.5, px: 1.5, bgcolor: diagnosisFilters.includes('all') ? `${COLORS.brand}12` : 'transparent' }}
        >
          <Checkbox size="small" checked={diagnosisFilters.includes('all')} sx={{ p: 0.5, color: COLORS.brand }} />
          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.brand }}>ALL PATHOLOGIES</Typography>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        {availableDiagnoses.length === 0 ? (
          <MenuItem disabled sx={{ py: 1, px: 1.5 }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, fontStyle: 'italic' }}>NO DIAGNOSES IN HISTORY</Typography>
          </MenuItem>
        ) : (
          availableDiagnoses.map(t => (
            <MenuItem 
              key={t} 
              onClick={() => toggleDiagnosisFilter(t)}
              sx={{ py: 0.5, px: 1.5 }}
            >
              <Checkbox size="small" checked={diagnosisFilters.includes(t)} sx={{ p: 0.5, color: COLORS.brand }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: COLORS.textPrimary }}>{t}</Typography>
            </MenuItem>
          ))
        )}
      </Menu>

      {/* Lab Menu */}
      <Menu
        anchorEl={labAnchorEl}
        open={Boolean(labAnchorEl)}
        onClose={handleLabClose}
        sx={{ zIndex: 3000 }}
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: 0, border: `2px solid ${COLORS.info}`,
            mt: 0.5, boxShadow: `4px 4px 0 ${COLORS.info}`,
            minWidth: 220,
          }
        }}
      >
        <MenuItem 
          onClick={() => toggleLabFilter('all')}
          sx={{ py: 0.5, px: 1.5, bgcolor: labFilters.includes('all') ? `${COLORS.info}12` : 'transparent' }}
        >
          <Checkbox size="small" checked={labFilters.includes('all')} sx={{ p: 0.5, color: COLORS.info }} />
          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.info }}>ALL DIAGNOSTICS</Typography>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        {availableLabTests.length === 0 ? (
          <MenuItem disabled sx={{ py: 1, px: 1.5 }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, fontStyle: 'italic' }}>NO LAB DATA IN HISTORY</Typography>
          </MenuItem>
        ) : (
          availableLabTests.map(t => (
            <MenuItem 
              key={t} 
              onClick={() => toggleLabFilter(t)}
              sx={{ py: 0.5, px: 1.5 }}
            >
              <Checkbox size="small" checked={labFilters.includes(t)} sx={{ p: 0.5, color: COLORS.info }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: COLORS.textPrimary }}>{t}</Typography>
            </MenuItem>
          ))
        )}
      </Menu>

      {/* Temporal Hub Menu */}
      <Menu
        anchorEl={dateAnchorEl}
        open={Boolean(dateAnchorEl)}
        onClose={handleDateClose}
        sx={{ zIndex: 3000 }}
        disableScrollLock
        PaperProps={{
          sx: {
            borderRadius: 0, border: `2px solid ${COLORS.brand}`,
            mt: 0.5, boxShadow: `4px 4px 0 ${COLORS.brand}`,
            minWidth: 260, p: 1
          }
        }}
      >
        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, mb: 1.5, letterSpacing: 1 }}>PRESET RANGES</Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button variant="outlined" size="small" onClick={() => { setDateRangeType('all'); handleDateClose(); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>ALL</Button>
          <Button variant="outlined" size="small" onClick={() => { setDateRangeType('today'); handleDateClose(); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>TODAY</Button>
          <Button variant="outlined" size="small" onClick={() => { setDateRangeType('30d'); handleDateClose(); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>30D</Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          <Button variant="outlined" size="small" onClick={() => { setDateRangeType('6mo'); handleDateClose(); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>6 MO</Button>
          <Button variant="outlined" size="small" onClick={() => { setDateRangeType('1yr'); handleDateClose(); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>1 YR</Button>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, mb: 1.5, letterSpacing: 1 }}>CUSTOM RANGE</Typography>
        <Stack spacing={1.5}>
          <Box>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, color: COLORS.brand, mb: 0.5 }}>START DATE</Typography>
            <TextField 
              type="date" 
              size="small" 
              fullWidth 
              value={customStart}
              onChange={(e) => { setCustomStart(e.target.value); setDateRangeType('custom'); }}
              InputProps={{ sx: { borderRadius: 0, fontFamily: FONT, fontSize: '0.75rem' } }} 
            />
          </Box>
          <Box>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, color: COLORS.brand, mb: 0.5 }}>END DATE</Typography>
            <TextField 
              type="date" 
              size="small" 
              fullWidth 
              value={customEnd}
              onChange={(e) => { setCustomEnd(e.target.value); setDateRangeType('custom'); }}
              InputProps={{ sx: { borderRadius: 0, fontFamily: FONT, fontSize: '0.75rem' } }} 
            />
          </Box>
          <Button 
            fullWidth 
            variant="contained" 
            onClick={handleDateClose}
            sx={{ bgcolor: COLORS.brand, borderRadius: 0, fontFamily: FONT, fontSize: '0.7rem', fontWeight: 900, mt: 1 }}
          >
            APPLY RANGE
          </Button>
        </Stack>
      </Menu>
    </Drawer>
  );
}
