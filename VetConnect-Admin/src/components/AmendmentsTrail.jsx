/**
 * AmendmentsTrail.jsx — T4.243 Phase 3a staff-facing amendments trail.
 *
 * Shared by PatientDashboard (record card) and EMRDrawer. Renders the append-only
 * version history of a signed medical record: current values stay as the card
 * headline (with <AmendedChip/>), this component shows the expandable trail beneath —
 * per-field Added/Changed/Removed diffs for new revisions, a best-effort block for
 * legacy AmendmentDialog entries, and the frozen original baseline at the bottom.
 *
 * All shape detection / sorting / formatting lives in utils/amendmentDisplay.js so the
 * print builder (printInternalRecord.js) renders the identical data.
 */
import React, { useState } from 'react';
import { Box, Typography, Stack, Chip, Collapse, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LockIcon from '@mui/icons-material/Lock';
import { COLORS, FONT } from '../theme/designTokens';
import {
  CHANGE_META,
  classifyAmendments,
  isNewEntry,
  amendmentAuthorName,
  kindChipLabel,
  entryDate,
  formatDiffValue,
  snapshotSummary,
} from '../utils/amendmentDisplay';

const fmtDate = (d) =>
  d ? `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';

const toneColor = (tone) =>
  tone === 'added' ? COLORS.success : tone === 'removed' ? COLORS.danger : COLORS.warning;

/** 🟠 AMENDED chip for the record headline. Render when the record has any revision/legacy amendment. */
export function AmendedChip({ sx }) {
  return (
    <Chip
      label="🟠 AMENDED"
      size="small"
      sx={{
        height: 18, borderRadius: 0, fontFamily: FONT, fontWeight: 900, fontSize: '0.58rem',
        letterSpacing: 0.5, bgcolor: COLORS.warningSurface, color: COLORS.warning,
        border: `1px solid ${COLORS.warning}`, ...sx,
      }}
    />
  );
}

/** One per-field diff line: "+ Added / ✎ Changed / − Removed   Label: before → after". */
function DiffLine({ d }) {
  const meta = CHANGE_META[d.changeType] || CHANGE_META.changed;
  const color = toneColor(meta.tone);
  const before = formatDiffValue(d.fieldKey, d.before);
  const after = formatDiffValue(d.fieldKey, d.after);
  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline' }}>
      <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.66rem', color, minWidth: 70, flexShrink: 0, textTransform: 'uppercase' }}>
        {meta.symbol} {meta.label}
      </Typography>
      <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textPrimary, lineHeight: 1.4 }}>
        <b>{d.fieldLabel}:</b>{' '}
        {d.changeType === 'changed' ? (
          <>
            <span style={{ color: COLORS.textMuted, textDecoration: 'line-through' }}>{before}</span>
            {' → '}
            <span>{after}</span>
          </>
        ) : d.changeType === 'removed' ? (
          <span style={{ color: COLORS.textMuted, textDecoration: 'line-through' }}>{before}</span>
        ) : (
          <span>{after}</span>
        )}
      </Typography>
    </Box>
  );
}

/** A NEW full-snapshot revision entry. */
function NewEntryCard({ entry }) {
  const chip = kindChipLabel(entry);
  const isAddition = entry.kind === 'addition';
  return (
    <Box sx={{
      bgcolor: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${COLORS.warning}`,
      borderRadius: 0, boxShadow: `3px 3px 0 ${COLORS.brand}`, p: 1.5,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontFamily: FONT, fontSize: '0.74rem', fontWeight: 900, color: COLORS.textPrimary }}>
          Amendment {entry.revisionNumber}
        </Typography>
        <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', color: COLORS.textMuted }}>
          {fmtDate(entryDate(entry))} · {amendmentAuthorName(entry)}
        </Typography>
        {chip && (
          <Chip
            label={chip}
            size="small"
            sx={{
              height: 16, borderRadius: 0, fontFamily: FONT, fontWeight: 900, fontSize: '0.52rem', ml: 'auto',
              bgcolor: isAddition ? COLORS.successSurface : COLORS.warningSurface,
              color: isAddition ? COLORS.success : COLORS.warning,
              border: `1px solid ${isAddition ? COLORS.success : COLORS.warning}`,
            }}
          />
        )}
      </Box>
      {entry.reason && (
        <Typography sx={{ fontFamily: FONT, fontSize: '0.74rem', fontStyle: 'italic', color: COLORS.textSecondary, mb: 0.75 }}>
          Reason: “{entry.reason}”
        </Typography>
      )}
      <Stack spacing={0.4}>
        {(entry.diff || []).map((d, i) => <DiffLine key={i} d={d} />)}
      </Stack>
    </Box>
  );
}

/** A LEGACY AmendmentDialog entry (retired creation path, still displayed). */
function LegacyEntryCard({ entry }) {
  const soapPairs = [
    { key: 'subjective', label: 'S' },
    { key: 'objective', label: 'O' },
    { key: 'assessment', label: 'A' },
    { key: 'plan', label: 'P' },
  ].filter(({ key }) => entry.soap?.[key]);
  const vitalsList = entry.vitals
    ? [
        { label: 'Wt', val: entry.vitals.weight ? `${entry.vitals.weight} kg` : null },
        { label: 'Temp', val: entry.vitals.temp ? `${entry.vitals.temp} °C` : null },
        { label: 'HR', val: entry.vitals.hr ? `${entry.vitals.hr} bpm` : null },
        { label: 'RR', val: entry.vitals.rr ? `${entry.vitals.rr} rpm` : null },
        { label: 'CRT', val: entry.vitals.crt ? `${entry.vitals.crt}s` : null },
        { label: 'BCS', val: entry.vitals.bcs ? `${entry.vitals.bcs}/9` : null },
        { label: 'Pain', val: entry.vitals.pain ? `${entry.vitals.pain}/4` : null },
      ].filter((e) => e.val)
    : [];
  return (
    <Box sx={{ bgcolor: COLORS.cream, borderLeft: `4px solid ${COLORS.warning}`, borderRadius: 0, p: 1.5 }}>
      {entry.reason && (
        <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700, color: COLORS.warning, textTransform: 'uppercase', mb: 0.5 }}>
          Reason: {entry.reason}
        </Typography>
      )}
      <Stack spacing={0.5}>
        {soapPairs.map(({ key, label }) => (
          <Box key={key}>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase' }}>{label}</Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textPrimary, whiteSpace: 'pre-wrap' }}>{entry.soap[key]}</Typography>
          </Box>
        ))}
        {entry.text && (
          <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textPrimary, whiteSpace: 'pre-wrap' }}>{entry.text}</Typography>
        )}
      </Stack>
      {vitalsList.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
          {vitalsList.map(({ label, val }) => (
            <Box key={label} sx={{ px: 0.75, py: 0.4, bgcolor: COLORS.warningSurface, border: `1px solid ${COLORS.warning}`, minWidth: 48, textAlign: 'center' }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.55rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase' }}>{label}</Typography>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 700, color: COLORS.textPrimary }}>{val}</Typography>
            </Box>
          ))}
        </Box>
      )}
      {entry.addedMedications?.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase', mb: 0.25 }}>Added Medications</Typography>
          {entry.addedMedications.map((med, i) => (
            <Typography key={i} sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textPrimary }}>
              {med.name}{med.qty ? ` x${med.qty}` : ''}{med.instructions ? ` — ${med.instructions}` : ''}
            </Typography>
          ))}
        </Box>
      )}
      <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', color: COLORS.textMuted, mt: 0.5 }}>
        {amendmentAuthorName(entry)}{entryDate(entry) ? ` — ${fmtDate(entryDate(entry))}` : ''}
      </Typography>
    </Box>
  );
}

/** The frozen original baseline — muted, locked, never edited. */
function OriginalBlock({ entry }) {
  const summary = snapshotSummary(entry.snapshot);
  return (
    <Box sx={{ bgcolor: COLORS.warningSurface, border: `1px dashed ${COLORS.textMuted}`, borderRadius: 0, p: 1.5, opacity: 0.95 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: summary.length ? 0.5 : 0 }}>
        <LockIcon sx={{ fontSize: 13, color: COLORS.textMuted }} />
        <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', fontWeight: 900, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Original · signed {fmtDate(entryDate(entry))} · {amendmentAuthorName(entry)} · frozen
        </Typography>
      </Box>
      {summary.map((s, i) => (
        <Typography key={i} sx={{ fontFamily: FONT, fontSize: '0.74rem', color: COLORS.textSecondary }}>
          <b>{s.label}:</b> {s.value}
        </Typography>
      ))}
    </Box>
  );
}

export default function AmendmentsTrail({ amendments, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { original, trail, count } = classifyAmendments(amendments);

  // Nothing to show (no revisions/legacy entries). The lone-original case can't occur
  // (the baseline is only created alongside a revision), but guard anyway.
  if (count === 0) return null;

  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px dashed ${COLORS.borderLight}` }}>
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', userSelect: 'none' }}
      >
        <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase', letterSpacing: 1 }}>
          ✎ Amendments ({count})
        </Typography>
        <IconButton size="small" sx={{ ml: 'auto', p: 0.25, color: COLORS.warning }} aria-label={expanded ? 'Collapse amendments' : 'Expand amendments'}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Box>
      <Collapse in={expanded} timeout={150}>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {trail.map((entry, i) => (
            isNewEntry(entry)
              ? <NewEntryCard key={i} entry={entry} />
              : <LegacyEntryCard key={i} entry={entry} />
          ))}
          {original && <OriginalBlock entry={original} />}
        </Stack>
      </Collapse>
    </Box>
  );
}
