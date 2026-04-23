import React from 'react';
import { Box, Typography } from '@mui/material';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

/**
 * Shared KPI display card for the Dashboard feature.
 *
 * Follows Modern Clinical Neubrutalism: zero border-radius, solid offset
 * shadow, and hover snap interaction. The `variant` prop maps to the KPI
 * color token families defined in designTokens.js.
 *
 * @param {string}              title    - Uppercase metric label
 * @param {string|number}       value    - The metric value to display
 * @param {React.ReactNode}     icon     - Optional MUI icon element
 * @param {'blue'|'green'|'orange'|'red'|'purple'|'neutral'} variant
 * @param {string}              subtitle - Optional secondary line
 * @param {function}            onClick  - Optional click handler (makes card interactive)
 * @param {boolean}             compact  - Smaller padding for dense grid layouts
 */
export default function KPICard({
  title,
  value,
  icon,
  variant = 'neutral',
  subtitle,
  onClick,
  compact = false,
}) {
  const colorMap = {
    blue:    { bg: COLORS.kpiBlueBg,   border: COLORS.kpiBlueBorder,   text: COLORS.info },
    green:   { bg: COLORS.kpiGreenBg,  border: COLORS.kpiGreenBorder,  text: COLORS.success },
    orange:  { bg: COLORS.kpiOrangeBg, border: COLORS.kpiOrangeBorder, text: COLORS.warning },
    red:     { bg: COLORS.kpiRedBg,    border: COLORS.kpiRedBorder,    text: COLORS.danger },
    purple:  { bg: COLORS.kpiPurpleBg, border: COLORS.kpiPurpleBorder, text: '#6A1B9A' },
    neutral: { bg: COLORS.cardBg,      border: COLORS.border,          text: COLORS.textPrimary },
  };

  const c = colorMap[variant] || colorMap.neutral;

  return (
    <Box
      onClick={onClick}
      sx={{
        p: compact ? 1.5 : 2,
        px: compact ? 2 : 2.5,
        bgcolor: c.bg,
        border: `2px solid ${c.border}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${c.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
        '&:hover': onClick ? {
          transform: 'translate(2px, 2px)',
          boxShadow: `1px 1px 0px ${c.border}`,
        } : {},
        height: '100%',
      }}
    >
      {icon && (
        <Box sx={{
          width: 40,
          height: 40,
          borderRadius: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: `${c.text}15`,
          color: c.text,
          border: `1px solid ${c.text}30`,
          flexShrink: 0,
        }}>
          {icon}
        </Box>
      )}

      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontFamily: FONT,
          ...TYPE.label,
          color: COLORS.textMuted,
          fontSize: '0.65rem',
        }}>
          {title}
        </Typography>

        <Typography sx={{
          fontFamily: FONT,
          fontWeight: 1000,
          color: c.text,
          fontSize: compact ? '1.2rem' : '1.5rem',
          lineHeight: 1.2,
        }}>
          {value}
        </Typography>

        {subtitle && (
          <Typography sx={{
            fontFamily: FONT,
            ...TYPE.tiny,
            color: COLORS.textMuted,
            mt: 0.25,
          }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
