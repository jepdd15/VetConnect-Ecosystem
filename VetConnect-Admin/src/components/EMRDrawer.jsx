import React, { useState, useEffect, useMemo } from 'react';
import {
  Drawer, Box, Typography, IconButton, Chip, Divider,
  Collapse, Stack, Paper, TextField, InputAdornment,
  CircularProgress, Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Search as SearchIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FONT, COLORS, TYPE } from '../theme/designTokens';
import { resolveVitals } from '../utils/resolveVitals';
import { resolveObjectiveText, hasExamData, examSummaryLine } from '../utils/examUtils';
import { openPrintWindow, PRINT_STYLES, formatPrintDate, esc } from '../utils/printUtils';
import {
  renderVitalsSection,
  renderPrescriptionsSection,
  renderVaccineSection,
  renderLabResultsSection,
  renderDischargeSection,
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

const STATUS_CHIP_COLORS = {
  completed: { bg: '#E8F5E9', color: COLORS.success, label: 'COMPLETED' },
  'in-consult': { bg: '#E3F2FD', color: COLORS.medical, label: 'IN-CONSULT' },
  dispensing: { bg: '#FFF3E0', color: COLORS.warning, label: 'DISPENSING' },
  billing: { bg: '#F3E5F5', color: '#6A1B9A', label: 'BILLING' },
};

const StatusChip = ({ status }) => {
  const cfg = STATUS_CHIP_COLORS[status] || { bg: '#F5F5F5', color: COLORS.textMuted, label: (status || 'N/A').toUpperCase() };
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        height: 18, fontSize: '0.55rem', fontWeight: 900,
        borderRadius: 0, bgcolor: cfg.bg, color: cfg.color,
        border: `1px solid ${cfg.color}`,
      }}
    />
  );
};

// ─── Single expanded record card ─────────────────────────────────────────────

const RecordCard = ({ record, appointmentId }) => {
  const [expanded, setExpanded] = useState(false);
  const [objExpanded, setObjExpanded] = useState(false);

  const isCurrentVisit = !!(appointmentId && record.appointmentId === appointmentId);
  const isDraft = isCurrentVisit && !record.signedOffAt;

  const diagnosis = record.diagnoses?.[0]?.name || record.assessment || record.diagnosis || 'No diagnosis recorded';
  const vetName = record.vetName || 'Unknown';
  const serviceType = record.serviceType || record.primaryService || '';
  const recordDate = formatDate(record.createdAt || record.date);
  const status = record.status || 'completed';

  const hasSoap = record.subjective || hasExamData(record.objectiveExam) || record.objectiveNotes
    || record.soap?.objectiveNotes || record.soap?.objective
    || record.diagnoses?.length > 0 || record.assessment || record.plan;

  const rv = resolveVitals(record);
  const prescriptionList = record.dispensedProducts || record.prescriptions || [];
  const hasPrescriptions = prescriptionList.length > 0;
  const hasDischargeSummary = record.dischargeSummary
    && (typeof record.dischargeSummary === 'string' || typeof record.dischargeSummary === 'object');
  const hasVaccines = record.vaccineAdministrations?.length > 0 || record.vaccineData?.vaccineName;
  const hasLabResults = record.labResults?.length > 0;
  const hasAmendments = record.amendments?.length > 0;
  const hasCaseDay = record.caseDay != null;

  const objText = resolveObjectiveText(record);
  const objSummary = hasExamData(record.objectiveExam) ? examSummaryLine(record.objectiveExam) : null;

  return (
    <Paper
      elevation={0}
      sx={{
        border: `2px solid ${isCurrentVisit ? COLORS.sky : COLORS.brand}`,
        boxShadow: expanded
          ? `4px 4px 0 ${isCurrentVisit ? COLORS.sky : COLORS.brand}`
          : `2px 2px 0 ${isCurrentVisit ? COLORS.skyHover : COLORS.accent}`,
        borderRadius: 0,
        mb: 1.5,
        overflow: 'hidden',
        transition: 'box-shadow 0.15s ease',
      }}
    >
      {/* Collapsed header — always visible */}
      <Box
        onClick={() => setExpanded(prev => !prev)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5,
          bgcolor: expanded ? COLORS.brand : '#FAFAFA',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.15s ease',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            {isCurrentVisit && (
              <Chip
                label="CURRENT VISIT"
                size="small"
                sx={{
                  height: 18, fontSize: '0.55rem', fontWeight: 900, borderRadius: 0,
                  bgcolor: COLORS.sky, color: 'white', flexShrink: 0,
                }}
              />
            )}
            <Typography sx={{
              fontWeight: 900, fontSize: '0.75rem', fontFamily: FONT,
              color: expanded ? '#FFF8E1' : COLORS.brand,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {diagnosis}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: expanded ? '#D7CCC8' : COLORS.textMuted }}>
              {recordDate}
            </Typography>
            {serviceType && (
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: expanded ? '#D7CCC8' : COLORS.textMuted }}>
                · {serviceType}
              </Typography>
            )}
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: expanded ? '#D7CCC8' : COLORS.textMuted }}>
              · Dr. {vetName}
            </Typography>
            {hasCaseDay && (
              <Chip
                label={`DAY ${record.caseDay}`}
                size="small"
                sx={{ height: 16, fontSize: '0.5rem', fontWeight: 900, borderRadius: 0, bgcolor: COLORS.accent, color: 'white' }}
              />
            )}
          </Box>
        </Box>
        <StatusChip status={status} />
        <ExpandMoreIcon sx={{
          fontSize: 18, color: expanded ? '#FFF8E1' : COLORS.brand,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }} />
      </Box>

      {/* Expanded detail panel */}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ p: 2, bgcolor: '#FEFEFE', borderTop: `1px solid ${COLORS.brand}` }}>
          <Stack spacing={2} divider={<Divider sx={{ borderColor: '#F0EDE8' }} />}>

            {/* Draft warning — shown when this is the active unsigned record */}
            {isDraft && (
              <Box sx={{
                bgcolor: COLORS.warningSurface, px: 1.5, py: 0.75,
                border: `1px solid ${COLORS.kpiOrangeBorder}`,
              }}>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700, color: COLORS.warning, fontStyle: 'italic' }}>
                  Draft in progress — not yet signed
                </Typography>
              </Box>
            )}

            {/* Vitals — 7 fields, always rendered when expanded, "not taken" for missing */}
            <Box sx={{ bgcolor: COLORS.vitalsBg, py: 1, px: 1.5, border: `1px solid ${COLORS.borderLight}` }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>Vitals</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {[
                  { label: 'Wt',   value: rv.weight, unit: 'kg' },
                  { label: 'Temp', value: rv.temp,   unit: '°C' },
                  { label: 'HR',   value: rv.hr,     unit: 'bpm' },
                  { label: 'RR',   value: rv.rr,     unit: 'br/min' },
                  { label: 'CRT',  value: rv.crt,    unit: 'sec' },
                  { label: 'BCS',  value: rv.bcs,    unit: '/9' },
                  { label: 'Pain', value: rv.pain,   unit: '/4' },
                ].map(({ label, value, unit }) => (
                  <Box key={label}>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>
                      {label}
                    </Typography>
                    {value != null && value !== '' ? (
                      <Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary, fontSize: '0.85rem' }}>
                        {value} <span style={{ fontSize: '0.65rem', fontWeight: 400, color: COLORS.textMuted }}>{unit}</span>
                      </Typography>
                    ) : (
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
                        not taken
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>

            {/* SOAP */}
            {hasSoap && (
              <Stack spacing={1.5}>

                {/* Subjective */}
                {record.subjective && (
                  <Box>
                    <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>
                      Subjective
                    </Typography>
                    <Typography sx={{
                      fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary,
                      pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {record.subjective}
                    </Typography>
                  </Box>
                )}

                {/* Objective — collapsible with examSummaryLine preview */}
                {objText && (
                  <Box>
                    <Box
                      onClick={(e) => { e.stopPropagation(); setObjExpanded(prev => !prev); }}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', mb: 0.5 }}
                    >
                      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted }}>Objective</Typography>
                      {!objExpanded && objSummary && (
                        <Typography sx={{
                          fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted,
                          fontStyle: 'italic', flex: 1, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          — {objSummary}
                        </Typography>
                      )}
                      <ExpandMoreIcon sx={{
                        fontSize: 14, color: COLORS.textMuted,
                        transform: objExpanded ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s',
                      }} />
                    </Box>
                    <Collapse in={objExpanded} timeout={150}>
                      <Typography sx={{
                        fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary,
                        whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`,
                      }}>
                        {objText}
                      </Typography>
                    </Collapse>
                  </Box>
                )}

                {/* Assessment — diagnosis hero */}
                {(record.diagnoses?.length > 0 || record.assessment || record.assessmentNotes) && (
                  <Box>
                    <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>Assessment</Typography>
                    {record.diagnoses?.length > 0 && (
                      <Stack spacing={0.75} sx={{ mb: 0.5, pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}` }}>
                        {record.diagnoses.map((dx, i) => (
                          <Box key={dx.catalogId || i}>
                            <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', fontWeight: 900, color: COLORS.textPrimary, lineHeight: 1.3 }}>
                              {dx.name}
                              {dx.severity && (
                                <Typography component="span" sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 700, color: COLORS.warning, ml: 1 }}>
                                  {dx.severity}
                                </Typography>
                              )}
                            </Typography>
                            {dx.notes && (
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, fontStyle: 'italic', mt: 0.25 }}>
                                {dx.notes}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    )}
                    {(record.assessmentNotes || (!record.diagnoses?.length && record.assessment)) && (
                      <Typography sx={{
                        fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary,
                        whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`,
                        fontSize: '0.8rem',
                      }}>
                        {record.assessmentNotes || record.assessment}
                      </Typography>
                    )}
                  </Box>
                )}

                {/* Plan */}
                {(record.plan || record.soap?.plan) && (
                  <Box>
                    <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>Plan</Typography>
                    <Typography sx={{
                      fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary,
                      whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`,
                    }}>
                      {record.plan || record.soap?.plan}
                    </Typography>
                  </Box>
                )}

              </Stack>
            )}

            {/* Prescriptions */}
            {hasPrescriptions && (
              <Box>
                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>
                  Prescriptions ({prescriptionList.length})
                </Typography>
                <Stack spacing={0.5}>
                  {prescriptionList.map((rx, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: COLORS.brand, minWidth: 16 }}>{i + 1}.</Typography>
                      <Box>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: COLORS.brand, fontFamily: FONT }}>{rx.name}</Typography>
                        {rx.qty && (
                          <Typography sx={{ fontSize: '0.65rem', color: COLORS.textMuted }}>
                            Qty: {rx.qty}{rx.instructions ? ` — ${rx.instructions}` : ''}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Discharge summary — cream section */}
            {hasDischargeSummary && (
              <Box sx={{ bgcolor: COLORS.cream, mx: -2, px: 2, py: 1.5 }}>
                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>
                  Discharge Notes
                </Typography>
                {typeof record.dischargeSummary === 'string' ? (
                  <Typography sx={{
                    fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary,
                    whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`,
                  }}>
                    {record.dischargeSummary}
                  </Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {record.dischargeSummary.patientStatus && (
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: FONT }}>
                        <strong>Patient Status:</strong> {record.dischargeSummary.patientStatus}
                      </Typography>
                    )}
                    {record.dischargeSummary.diagnosis && (
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: FONT }}>
                        <strong>Diagnosis:</strong> {record.dischargeSummary.diagnosis}
                      </Typography>
                    )}
                    {record.dischargeSummary.instructions && (
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: FONT, whiteSpace: 'pre-wrap' }}>
                        <strong>Instructions:</strong> {record.dischargeSummary.instructions}
                      </Typography>
                    )}
                    {record.dischargeSummary.medications?.length > 0 && (
                      <Box>
                        <Typography sx={{ fontSize: '0.75rem', fontFamily: FONT, fontWeight: 700 }}>
                          Medications:
                        </Typography>
                        {record.dischargeSummary.medications.map((med, i) => (
                          <Typography key={i} sx={{ fontSize: '0.7rem', fontFamily: FONT, pl: 1.5 }}>
                            {i + 1}. {med.name}{med.qty ? ` (×${med.qty})` : ''}{med.instructions ? ` — ${med.instructions}` : ''}
                          </Typography>
                        ))}
                      </Box>
                    )}
                    {record.dischargeSummary.recheckIn && (
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: FONT }}>
                        <strong>Recheck In:</strong> {record.dischargeSummary.recheckIn}
                      </Typography>
                    )}
                    {record.dischargeSummary.nextVisit && (
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: FONT }}>
                        <strong>Next Visit:</strong> {record.dischargeSummary.nextVisit}
                      </Typography>
                    )}
                    {record.dischargeSummary.vetName && (
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: FONT }}>
                        <strong>Attending Vet:</strong> {record.dischargeSummary.vetName}
                      </Typography>
                    )}
                  </Stack>
                )}
              </Box>
            )}

            {/* Vaccine administrations */}
            {hasVaccines && (
              <Box>
                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>
                  Vaccines Administered
                </Typography>
                <Stack spacing={0.75}>
                  {(record.vaccineAdministrations || (record.vaccineData ? [record.vaccineData] : [])).map((v, i) => (
                    <Box key={i} sx={{ px: 1.5, py: 1, bgcolor: COLORS.kpiGreenBg, border: `1px solid ${COLORS.kpiGreenBorder}` }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 900, color: COLORS.success, fontFamily: FONT }}>{v.vaccineName}</Typography>
                      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
                        {v.manufacturer && <Typography sx={{ fontSize: '0.6rem', color: COLORS.textSecondary }}>Mfr: {v.manufacturer}</Typography>}
                        {v.lotNumber && <Typography sx={{ fontSize: '0.6rem', color: COLORS.textSecondary }}>Lot: {v.lotNumber}</Typography>}
                        {v.routeOfAdmin && <Typography sx={{ fontSize: '0.6rem', color: COLORS.textSecondary }}>Route: {v.routeOfAdmin}</Typography>}
                        {v.siteOfInjection && <Typography sx={{ fontSize: '0.6rem', color: COLORS.textSecondary }}>Site: {v.siteOfInjection}</Typography>}
                        {v.dueDate && <Typography sx={{ fontSize: '0.6rem', color: COLORS.textSecondary }}>Due: {formatDate(v.dueDate)}</Typography>}
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Lab results */}
            {hasLabResults && (
              <Box>
                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>
                  Lab Results ({record.labResults.length})
                </Typography>
                <Stack spacing={0.5}>
                  {record.labResults.map((lab, i) => {
                    const statusKey = (lab.status || 'normal').toLowerCase();
                    const statusColors = {
                      normal:   { bgcolor: '#E8F5E9', color: COLORS.success },
                      abnormal: { bgcolor: COLORS.warningSurface, color: COLORS.warning },
                      critical: { bgcolor: COLORS.dangerSurface, color: COLORS.danger },
                    };
                    const sc = statusColors[statusKey] || statusColors.normal;

                    const chipLabel = lab.resultType === 'positive-negative'
                      ? (statusKey === 'normal' ? 'NEGATIVE' : statusKey === 'critical' ? 'CRITICAL' : 'POSITIVE')
                      : (lab.status || 'normal').toUpperCase();

                    const renderRefRange = () => {
                      const range = lab.referenceRange || null;
                      if (!range) return null;
                      if (typeof range === 'object' && !Array.isArray(range)) {
                        const parts = [];
                        if (range.canine) parts.push(`Dog: ${range.canine[0]}–${range.canine[1]}`);
                        if (range.feline) parts.push(`Cat: ${range.feline[0]}–${range.feline[1]}`);
                        if (!parts.length) return null;
                        return (
                          <Typography sx={{ fontSize: '0.55rem', color: COLORS.textMuted, fontFamily: FONT }}>
                            Ref: {parts.join(' | ')}
                          </Typography>
                        );
                      }
                      if (Array.isArray(range) && range.length === 2) {
                        return (
                          <Typography sx={{ fontSize: '0.55rem', color: COLORS.textMuted, fontFamily: FONT }}>
                            Ref: {range[0]}–{range[1]}
                          </Typography>
                        );
                      }
                      return null;
                    };

                    return (
                      <Box key={i} sx={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        px: 1.5, py: 0.75, bgcolor: COLORS.kpiBlueBg, border: `1px solid ${COLORS.kpiBlueBorder}`,
                      }}>
                        <Box>
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: COLORS.brand, fontFamily: FONT }}>
                            {lab.testName}
                          </Typography>
                          {lab.result && (
                            <Typography sx={{ fontSize: '0.65rem', color: COLORS.textSecondary }}>
                              {lab.result}{lab.unit ? ` ${lab.unit}` : ''}
                            </Typography>
                          )}
                          {renderRefRange()}
                          {lab.notes && (
                            <Typography sx={{ fontSize: '0.6rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
                              {lab.notes}
                            </Typography>
                          )}
                        </Box>
                        {lab.status && (
                          <Chip
                            label={chipLabel}
                            size="small"
                            sx={{ height: 16, fontSize: '0.5rem', fontWeight: 900, borderRadius: 0, bgcolor: sc.bgcolor, color: sc.color, flexShrink: 0 }}
                          />
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}

            {/* Attachments */}
            {record.attachments?.length > 0 && (
              <Box>
                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>
                  Attachments ({record.attachments.length})
                </Typography>
                <Stack spacing={0.5}>
                  {record.attachments.map((file, i) => {
                    const isImage = file.mimeType?.startsWith('image/');
                    return (
                      <Box
                        key={i}
                        component="a"
                        href={file.url || file}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5,
                          bgcolor: COLORS.kpiBlueBg, border: `1px solid ${COLORS.kpiBlueBorder}`,
                          textDecoration: 'none', cursor: 'pointer',
                          '&:hover': { bgcolor: COLORS.borderLight },
                        }}
                      >
                        {isImage ? (
                          <Box component="img" src={file.url || file} sx={{ width: 28, height: 28, objectFit: 'cover', border: `1px solid ${COLORS.border}`, flexShrink: 0 }} />
                        ) : (
                          <PictureAsPdfIcon sx={{ fontSize: 22, color: COLORS.danger, flexShrink: 0 }} />
                        )}
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: COLORS.medical, fontFamily: FONT, flex: 1 }}>
                          {file.label || file.fileName || `Attachment ${i + 1}`}
                        </Typography>
                        {file.clientVisible && (
                          <Chip label="Shared" size="small" sx={{ height: 14, fontSize: '0.45rem', fontWeight: 900, borderRadius: 0, bgcolor: '#E8F5E9', color: COLORS.success }} />
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}

            {/* Amendments */}
            {hasAmendments && (
              <Box>
                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>
                  Amendments ({record.amendments.length})
                </Typography>
                <Stack spacing={0.75}>
                  {record.amendments.map((am, i) => {
                    const authorName = am.vetName || am.author || 'Clinician';
                    const dateVal = am.timestamp || am.createdAt;

                    if (am.type === 'structured') {
                      return (
                        <Box key={i} sx={{ px: 1.5, py: 1, bgcolor: COLORS.kpiOrangeBg, border: `1px solid ${COLORS.kpiOrangeBorder}` }}>
                          <Typography sx={{ fontSize: '0.6rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase', mb: 0.5, fontFamily: FONT }}>
                            AMENDMENT: {am.reason}
                          </Typography>
                          <Stack spacing={0.25}>
                            {[
                              { key: 'subjective', label: 'S' },
                              { key: 'objective',  label: 'O' },
                              { key: 'assessment', label: 'A' },
                              { key: 'plan',       label: 'P' },
                            ].filter(({ key }) => am.soap?.[key]).map(({ key, label }) => (
                              <Box key={key}>
                                <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase' }}>
                                  {label}
                                </Typography>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.brand, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {am.soap[key]}
                                </Typography>
                              </Box>
                            ))}
                          </Stack>
                          {am.vitals && Object.values(am.vitals).some(v => v) && (
                            <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                              {Object.entries(am.vitals).filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                                <Box key={k}>
                                  <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>{k}</Typography>
                                  <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 700, color: COLORS.brand }}>{v}</Typography>
                                </Box>
                              ))}
                            </Box>
                          )}
                          {am.addedMedications?.length > 0 && (
                            <Box sx={{ mt: 0.5 }}>
                              <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase', mb: 0.25 }}>
                                Added Medications
                              </Typography>
                              {am.addedMedications.map((med, j) => (
                                <Typography key={j} sx={{ fontSize: '0.7rem', fontWeight: 700, color: COLORS.brand, fontFamily: FONT }}>
                                  {med.name}{med.qty ? ` x${med.qty}` : ''}{med.instructions ? ` — ${med.instructions}` : ''}
                                </Typography>
                              ))}
                            </Box>
                          )}
                          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
                            <Typography sx={{ fontSize: '0.6rem', color: COLORS.textMuted }}>By: {authorName}</Typography>
                            {dateVal && <Typography sx={{ fontSize: '0.6rem', color: COLORS.textMuted }}>{formatDate(dateVal)}</Typography>}
                          </Box>
                        </Box>
                      );
                    }

                    return (
                      <Box key={i} sx={{ px: 1.5, py: 1, bgcolor: COLORS.kpiOrangeBg, border: `1px solid ${COLORS.kpiOrangeBorder}` }}>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: COLORS.brand, fontFamily: FONT }}>{am.text}</Typography>
                        <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
                          {am.reason && <Typography sx={{ fontSize: '0.6rem', color: COLORS.textMuted }}>Reason: {am.reason}</Typography>}
                          <Typography sx={{ fontSize: '0.6rem', color: COLORS.textMuted }}>By: {authorName}</Typography>
                          {dateVal && <Typography sx={{ fontSize: '0.6rem', color: COLORS.textMuted }}>{formatDate(dateVal)}</Typography>}
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}

          </Stack>
        </Box>
      </Collapse>
    </Paper>
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
          <h2 style="margin-top:24px; border-bottom:2px solid #5D4037;">
            ${dateStr} — ${esc(diagnosis)}
          </h2>
          <div class="info-grid">
            <div><span class="label">Service:</span> <span class="value">${serviceType}</span></div>
            <div><span class="label">Vet:</span> <span class="value">${vetName}</span></div>
            <div><span class="label">Status:</span> <span class="value">${esc((rec.status || 'completed').toUpperCase())}</span></div>
          </div>
          <table>
            <thead><tr><th style="width:18%">Section</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td><strong>Subjective</strong></td><td style="white-space:pre-wrap">${esc(rec.subjective || rec.soap?.subjective || '—')}</td></tr>
              <tr><td><strong>Objective</strong></td><td style="white-space:pre-wrap">${esc(resolveObjectiveText(rec) || '—')}</td></tr>
              <tr><td><strong>Assessment</strong></td><td style="white-space:pre-wrap">${esc(diagnosis)}</td></tr>
              <tr><td><strong>Plan</strong></td><td style="white-space:pre-wrap">${esc(rec.plan || rec.soap?.plan || rec.treatment || '—')}</td></tr>
            </tbody>
          </table>
          ${renderVitalsSection(rv)}
          ${renderPrescriptionsSection(rec.dispensedProducts || rec.prescriptions)}
          ${(rec.vaccineAdministrations?.length > 0
            ? rec.vaccineAdministrations.map(v => renderVaccineSection(v)).join('')
            : renderVaccineSection(rec.vaccineData))}
          ${renderLabResultsSection(rec.labResults)}
          ${renderDischargeSection(rec.dischargeSummary)}
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Full EMR — ${esc(petName || 'Patient')}</title>
  <style>${PRINT_STYLES}</style>
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
