import React, { useState } from 'react';
import {
  Drawer, Box, Typography, IconButton, Chip, Divider,
  Collapse, Stack, Paper,
} from '@mui/material';
import { Close as CloseIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { FONT, COLORS } from '../theme/designTokens';

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

// ─── Sub-section blocks ──────────────────────────────────────────────────────

const SectionBlock = ({ label, children }) => (
  <Box sx={{ mb: 1.5 }}>
    <Typography sx={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: COLORS.textMuted, mb: 0.5 }}>
      {label}
    </Typography>
    {children}
  </Box>
);

const SoapText = ({ value }) => (
  <Typography sx={{ fontSize: '0.8rem', fontFamily: FONT, color: COLORS.brand, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
    {value || '—'}
  </Typography>
);

const VitalsRow = ({ vitals }) => {
  const v = vitals?.vitals || vitals;
  const entries = [
    { label: 'Wt', val: (v.weight ?? v.objWeight) ? `${v.weight ?? v.objWeight} kg` : null },
    { label: 'Temp', val: (v.temp ?? v.objTemp) ? `${v.temp ?? v.objTemp} °C` : null },
    { label: 'HR', val: (v.hr ?? v.objHR) ? `${v.hr ?? v.objHR} bpm` : null },
    { label: 'RR', val: (v.rr ?? v.objRR) ? `${v.rr ?? v.objRR} rpm` : null },
    { label: 'CRT', val: (v.crt ?? v.objCRT) ? `${v.crt ?? v.objCRT}s` : null },
    { label: 'BCS', val: v.bcs ? `${v.bcs}/9` : null },
    { label: 'Pain', val: (v.pain ?? v.painScale) != null && (v.pain ?? v.painScale) !== '' ? `${v.pain ?? v.painScale}/4` : null },
  ].filter(e => e.val !== null);

  if (entries.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {entries.map(({ label, val }) => (
        <Box key={label} sx={{ px: 1, py: 0.5, bgcolor: '#EFF6FF', border: `1px solid #93C5FD`, minWidth: 56, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: COLORS.medical, textTransform: 'uppercase' }}>{label}</Typography>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: COLORS.brand, fontFamily: 'monospace' }}>{val}</Typography>
        </Box>
      ))}
    </Box>
  );
};

// ─── Single expanded record card ─────────────────────────────────────────────

const RecordCard = ({ record }) => {
  const [expanded, setExpanded] = useState(false);

  const diagnosis = record.assessment || record.diagnosis || 'No diagnosis recorded';
  const vetName = record.vetName || 'Unknown';
  const serviceType = record.serviceType || record.primaryService || '';
  const recordDate = formatDate(record.createdAt || record.date);
  const status = record.status || 'completed';

  const hasSoap = record.subjective || record.objectiveNotes || record.assessment || record.plan;
  const rv = record.vitals || {};
  const hasVitals = rv.weight || rv.temp || rv.hr || rv.rr || rv.crt || rv.bcs || (rv.pain != null && rv.pain !== '')
    || record.objWeight || record.objTemp || record.objHR || record.objRR || record.objCRT || record.bcs || (record.painScale != null);
  const prescriptionList = record.dispensedProducts || record.prescriptions || [];
  const hasPrescriptions = prescriptionList.length > 0;
  const hasDischargeSummary = Boolean(record.dischargeSummary);
  const hasVaccines = record.vaccineAdministrations?.length > 0 || record.vaccineData?.vaccineName;
  const hasLabResults = record.labResults?.length > 0;
  const hasAmendments = record.amendments?.length > 0;
  const hasCaseDay = record.caseDay != null;

  return (
    <Paper
      elevation={0}
      sx={{
        border: `2px solid ${COLORS.brand}`,
        boxShadow: expanded ? `4px 4px 0 ${COLORS.brand}` : `2px 2px 0 ${COLORS.accent}`,
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
          <Typography sx={{ fontWeight: 900, fontSize: '0.75rem', fontFamily: FONT, color: expanded ? '#FFF8E1' : COLORS.brand, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {diagnosis}
          </Typography>
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
              <Chip label={`DAY ${record.caseDay}`} size="small" sx={{ height: 16, fontSize: '0.5rem', fontWeight: 900, borderRadius: 0, bgcolor: COLORS.accent, color: 'white' }} />
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

            {/* Vitals */}
            {hasVitals && (
              <SectionBlock label="Vitals">
                <VitalsRow vitals={record} />
              </SectionBlock>
            )}

            {/* SOAP */}
            {hasSoap && (
              <SectionBlock label="SOAP Notes">
                <Stack spacing={1}>
                  {record.subjective && (
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', fontWeight: 900, color: COLORS.medical, textTransform: 'uppercase', mb: 0.25 }}>S — Subjective</Typography>
                      <SoapText value={record.subjective} />
                    </Box>
                  )}
                  {record.objectiveNotes && (
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', fontWeight: 900, color: COLORS.medical, textTransform: 'uppercase', mb: 0.25 }}>O — Objective</Typography>
                      <SoapText value={record.objectiveNotes} />
                    </Box>
                  )}
                  {record.assessment && (
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', fontWeight: 900, color: COLORS.success, textTransform: 'uppercase', mb: 0.25 }}>A — Assessment</Typography>
                      <SoapText value={record.assessment} />
                    </Box>
                  )}
                  {record.plan && (
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', fontWeight: 900, color: COLORS.accent, textTransform: 'uppercase', mb: 0.25 }}>P — Plan</Typography>
                      <SoapText value={record.plan} />
                    </Box>
                  )}
                </Stack>
              </SectionBlock>
            )}

            {/* Prescriptions */}
            {hasPrescriptions && (
              <SectionBlock label={`Prescriptions (${prescriptionList.length})`}>
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
              </SectionBlock>
            )}

            {/* Discharge summary */}
            {hasDischargeSummary && (
              <SectionBlock label="Discharge Summary">
                <SoapText value={record.dischargeSummary} />
              </SectionBlock>
            )}

            {/* Vaccine administrations */}
            {hasVaccines && (
              <SectionBlock label="Vaccines Administered">
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
              </SectionBlock>
            )}

            {/* Lab results */}
            {hasLabResults && (
              <SectionBlock label={`Lab Results (${record.labResults.length})`}>
                <Stack spacing={0.5}>
                  {record.labResults.map((lab, i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 0.75, bgcolor: COLORS.kpiBlueBg, border: `1px solid ${COLORS.kpiBlueBorder}` }}>
                      <Box>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: COLORS.brand, fontFamily: FONT }}>{lab.testName}</Typography>
                        {lab.result && <Typography sx={{ fontSize: '0.65rem', color: COLORS.textSecondary }}>{lab.result}</Typography>}
                        {lab.notes && <Typography sx={{ fontSize: '0.6rem', color: COLORS.textMuted, fontStyle: 'italic' }}>{lab.notes}</Typography>}
                      </Box>
                      {lab.status && (
                        <Chip label={lab.status.toUpperCase()} size="small" sx={{ height: 16, fontSize: '0.5rem', fontWeight: 900, borderRadius: 0 }} />
                      )}
                    </Box>
                  ))}
                </Stack>
              </SectionBlock>
            )}

            {/* Amendments — T3.99: branch on type === 'structured'; fix vetName/author + timestamp/createdAt fallbacks */}
            {hasAmendments && (
              <SectionBlock label={`Amendments (${record.amendments.length})`}>
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

                          {/* Mini SOAP grid — only non-empty fields */}
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
                                <SoapText value={am.soap[key]} />
                              </Box>
                            ))}
                          </Stack>

                          {/* Vitals row — reuse VitalsRow sub-component */}
                          {am.vitals && Object.values(am.vitals).some(v => v) && (
                            <Box sx={{ mt: 0.5 }}>
                              <VitalsRow vitals={am.vitals} />
                            </Box>
                          )}

                          {/* Added medications */}
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

                    // Legacy text blob — fixed field name fallbacks, rendering unchanged
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
              </SectionBlock>
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
 * Read-only. Zero new Firestore reads — the `history` array is passed from
 * ClinicalWorkspace state which is populated on workspace mount.
 *
 * @prop {boolean}  open
 * @prop {function} onClose
 * @prop {Array}    history      - Array of medical_record documents, newest-first
 * @prop {string}   petName
 * @prop {string}   petSpecies
 */
export default function EMRDrawer({ open, onClose, history = [], petName, petSpecies }) {
  const sorted = history;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="temporary"
      PaperProps={{
        sx: {
          width: '55vw',
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
              {sorted.length} record{sorted.length !== 1 ? 's' : ''}
            </span>
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: '#FFF8E1', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
        {sorted.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography sx={{ fontSize: '0.85rem', fontStyle: 'italic', color: COLORS.textMuted, fontFamily: FONT }}>
              No previous records on file
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted, mt: 1 }}>
              Records will appear here after the first sign-off.
            </Typography>
          </Box>
        ) : (
          sorted.map((record) => (
            <RecordCard key={record.id} record={record} />
          ))
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
