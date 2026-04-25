import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
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
 * @param {number|null}         delta    - Period-over-period % change (null = no indicator)
 * @param {React.ReactNode}     insight  - Contextual insight text (Day 4 engine)
 */
export default function KPICard({
  title,
  value,
  icon,
  variant = 'neutral',
  subtitle,
  onClick,
  compact = false,
  delta,
  insight,
  goalTarget = undefined,  // T2.337: numeric monthly target for progress bar
  goalValue = undefined,   // T2.337: raw numeric value when `value` is a formatted string
  historicalContext = undefined, // T2.339: { min, avg, max } for hover tooltip
}) {
  const colorMap = {
    blue:    { bg: COLORS.kpiBlueBg,   border: COLORS.kpiBlueBorder,   text: COLORS.info },
    green:   { bg: COLORS.kpiGreenBg,  border: COLORS.kpiGreenBorder,  text: COLORS.success },
    orange:  { bg: COLORS.kpiOrangeBg, border: COLORS.kpiOrangeBorder, text: COLORS.warning },
    red:     { bg: COLORS.kpiRedBg,    border: COLORS.kpiRedBorder,    text: COLORS.danger },
    purple:  { bg: COLORS.kpiPurpleBg, border: COLORS.kpiPurpleBorder, text: COLORS.kpiPurpleText },
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

        {/* Value + inline delta indicator — wrapped in Tooltip for historical context */}
        <Tooltip
          title={
            historicalContext
              ? `6-mo range: min ${historicalContext.min.toLocaleString()} / avg ${historicalContext.avg.toLocaleString()} / max ${historicalContext.max.toLocaleString()}`
              : ''
          }
          arrow
          disableHoverListener={!historicalContext}
          slotProps={{
            tooltip: {
              sx: {
                fontFamily: FONT,
                fontSize: '0.65rem',
                fontWeight: 700,
                bgcolor: COLORS.brand,
                border: `1px solid ${COLORS.accent}`,
                borderRadius: 0,
                boxShadow: `2px 2px 0px ${COLORS.accent}`,
                '& .MuiTooltip-arrow': { color: COLORS.brand },
              },
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography sx={{
              fontFamily: FONT,
              fontWeight: 1000,
              color: c.text,
              fontSize: compact ? '1.2rem' : '1.5rem',
              lineHeight: 1.2,
            }}>
              {value}
            </Typography>

            {delta != null && (
              <Typography
                component="span"
                sx={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  lineHeight: 1,
                  color: delta > 0 ? COLORS.success
                    : delta < 0 ? COLORS.danger
                    : COLORS.textMuted,
                }}
              >
                {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'}
                {' '}
                {delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : '0%'}
              </Typography>
            )}
          </Box>
        </Tooltip>

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

        {/* Insight slot — contextual text from the Day 4 engine */}
        {insight && (
          <Box sx={{
            mt: 0.5,
            px: 1,
            py: 0.25,
            bgcolor: `${COLORS.info}10`,
            border: `1px solid ${COLORS.info}30`,
            borderRadius: 0,
          }}>
            <Typography sx={{
              fontFamily: FONT,
              fontSize: '0.58rem',
              fontWeight: 700,
              color: COLORS.info,
              lineHeight: 1.3,
            }}>
              {insight}
            </Typography>
          </Box>
        )}

        {/* Goal progress bar (T2.337) — renders when goalTarget > 0 */}
        {goalTarget > 0 && (() => {
          const numericVal = typeof goalValue === 'number' ? goalValue
            : typeof value === 'number' ? value : null;
          if (numericVal == null) return null;
          const pct = Math.min(100, Math.round((numericVal / goalTarget) * 100));
          return (
            <Box sx={{ mt: 0.75, width: '100%' }}>
              <Box sx={{
                height: 6,
                bgcolor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 0,
                overflow: 'hidden',
              }}>
                <Box sx={{
                  height: '100%',
                  width: `${pct}%`,
                  bgcolor: pct >= 100 ? COLORS.success : c.text,
                  transition: 'width 0.4s ease',
                }} />
              </Box>
              <Typography sx={{
                fontFamily: FONT,
                fontSize: '0.55rem',
                fontWeight: 700,
                color: pct >= 100 ? COLORS.success : COLORS.textMuted,
                mt: 0.25,
              }}>
                {pct}% of {goalTarget.toLocaleString()} goal
              </Typography>
            </Box>
          );
        })()}
      </Box>
    </Box>
  );
}
