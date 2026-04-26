/**
 * DateRangePicker — Forensic report date range controls.
 *
 * Two native <input type="date"> elements styled with neubrutalism tokens
 * (zero border-radius, solid Espresso border, cream background), plus a
 * "Generate Report" button with loading state.
 *
 * Design decisions:
 * - Exports raw YYYY-MM-DD strings. The consuming hook (useForensicReportData)
 *   converts them to Manila-midnight Timestamps — the picker stays timezone-agnostic.
 * - Defaults to last 30 days (endDate = today, startDate = today - 30).
 * - Shows an orange warning when the selected range exceeds 365 days.
 *   This is advisory only — it does not block generation.
 *
 * @param {string}   startDate      - Controlled YYYY-MM-DD string
 * @param {string}   endDate        - Controlled YYYY-MM-DD string
 * @param {function} onStartChange  - Called with new YYYY-MM-DD string
 * @param {function} onEndChange    - Called with new YYYY-MM-DD string
 * @param {function} onGenerate     - Called with no args when the button is clicked
 * @param {boolean}  loading        - Disables the button while fetching
 */

import React, { useMemo } from 'react';
import { Box, Button, Typography } from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

const DATE_INPUT_SX = {
  fontFamily: FONT,
  fontSize: '0.8rem',
  fontWeight: 700,
  color: COLORS.textPrimary,
  bgcolor: COLORS.cream,
  border: `2px solid ${COLORS.accent}`,
  borderRadius: 0,
  px: 1.5,
  py: 0.75,
  outline: 'none',
  cursor: 'pointer',
  boxShadow: `2px 2px 0px ${COLORS.accent}`,
  '&:focus': {
    borderColor: COLORS.brand,
    boxShadow: `2px 2px 0px ${COLORS.brand}`,
  },
};

/** Formats a Date to YYYY-MM-DD in Manila timezone for <input type="date"> value binding. */
function toDateInputValue(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Returns true if the range in days exceeds 365. */
function exceedsOneYear(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return false;
  const start = new Date(`${startDateStr}T00:00:00+08:00`);
  const end   = new Date(`${endDateStr}T00:00:00+08:00`);
  const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return diffDays > 365;
}

export default function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onGenerate,
  loading = false,
}) {
  const isLargeRange = useMemo(
    () => exceedsOneYear(startDate, endDate),
    [startDate, endDate],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
      {/* Date inputs row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontSize: '0.6rem' }}>
            FROM
          </Typography>
          <Box
            component="input"
            type="date"
            value={startDate}
            max={endDate}
            onChange={e => onStartChange(e.target.value)}
            sx={DATE_INPUT_SX}
          />
        </Box>

        <Typography sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, mt: 1.5 }}>
          &mdash;
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontSize: '0.6rem' }}>
            TO
          </Typography>
          <Box
            component="input"
            type="date"
            value={endDate}
            min={startDate}
            max={toDateInputValue(new Date())}
            onChange={e => onEndChange(e.target.value)}
            sx={DATE_INPUT_SX}
          />
        </Box>

        {/* Generate button */}
        <Button
          onClick={onGenerate}
          disabled={loading || !startDate || !endDate}
          startIcon={<AssessmentIcon />}
          sx={{
            fontFamily: FONT,
            ...TYPE.label,
            fontSize: '0.65rem',
            fontWeight: 900,
            color: COLORS.cream,
            bgcolor: COLORS.accent,
            border: `2px solid ${COLORS.brand}`,
            borderRadius: 0,
            px: 2,
            py: 0.75,
            mt: 1.5,
            boxShadow: `3px 3px 0px ${COLORS.brand}`,
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
            '&:hover': {
              bgcolor: COLORS.brand,
              transform: 'translate(1px, 1px)',
              boxShadow: `1px 1px 0px ${COLORS.brand}`,
            },
            '&.Mui-disabled': {
              color: COLORS.textMuted,
              bgcolor: COLORS.surface,
              borderColor: COLORS.border,
              boxShadow: 'none',
            },
          }}
        >
          {loading ? 'GENERATING...' : 'GENERATE REPORT'}
        </Button>
      </Box>

      {/* Large range warning — advisory, non-blocking */}
      {isLargeRange && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.5,
          py: 0.5,
          bgcolor: COLORS.warningSurface,
          border: `1.5px solid ${COLORS.warning}`,
          borderRadius: 0,
        }}>
          <WarningAmberIcon sx={{ fontSize: 14, color: COLORS.warning }} />
          <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.warning }}>
            Range exceeds 365 days. Report may be capped at 500 records.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
