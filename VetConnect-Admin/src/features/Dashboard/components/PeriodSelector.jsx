import React from 'react';
import { Box, Chip } from '@mui/material';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

const PERIODS = [
  { key: 'today',   label: 'Today' },
  { key: 'week',    label: 'This Week' },
  { key: 'month',   label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year',    label: 'This Year' },
];

/**
 * A row of MUI Chips that allows the user to select a time period.
 *
 * Active chip: cream background, Espresso border, 2px offset shadow.
 * All chips use borderRadius: 0 (neubrutalism).
 *
 * The Operations tab does not render this component — it is hardcoded to
 * "Today". Other tabs pass the current period and an onChange callback.
 *
 * @param {string}   value           - Currently selected period key
 * @param {function} onChange        - Callback with the new period key
 * @param {string[]} disabledPeriods - Period keys to disable (e.g. ['today'])
 */
export default function PeriodSelector({ value, onChange, disabledPeriods = [] }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {PERIODS.map(p => {
        const isActive = value === p.key;
        const isDisabled = disabledPeriods.includes(p.key);

        return (
          <Chip
            key={p.key}
            label={p.label}
            size="small"
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(p.key)}
            sx={{
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.65rem',
              borderRadius: 0,
              border: `2px solid ${isActive ? COLORS.accent : COLORS.border}`,
              bgcolor: isActive ? COLORS.cream : COLORS.cardBg,
              color: isActive ? COLORS.accent : COLORS.textSecondary,
              fontWeight: isActive ? 900 : TYPE.label.fontWeight,
              boxShadow: isActive ? `2px 2px 0px ${COLORS.accent}` : 'none',
              '&:hover': {
                bgcolor: isActive ? COLORS.cream : COLORS.surfaceHover,
                border: `2px solid ${COLORS.accent}`,
              },
              '& .MuiChip-label': { px: 1.5 },
            }}
          />
        );
      })}
    </Box>
  );
}
