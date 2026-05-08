import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

/**
 * CSS-only horizontal bar visualization for proportional data.
 *
 * Uses no charting library — just flexbox with percentage widths.
 * Empty state shows "NO DATA" instead of an invisible bar.
 * Legend dots are square (borderRadius: 0) to match neubrutalism.
 *
 * @param {Array<{label: string, value: number, color: string}>} segments
 * @param {number}  height     - Bar height in px (default 28)
 * @param {boolean} showLabels - Show count labels inside segments >= 8% wide
 * @param {boolean} showLegend - Show labeled color swatches below the bar
 */
export default function HorizontalBar({
  segments = [],
  height = 28,
  showLabels = true,
  showLegend = false,
}) {
  const total = segments.reduce((sum, s) => sum + (s.value || 0), 0);

  if (total === 0) {
    return (
      <Box sx={{
        height,
        bgcolor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Typography sx={{ ...TYPE.tiny, color: COLORS.textMuted, fontFamily: FONT }}>
          NO DATA
        </Typography>
      </Box>
    );
  }

  const nonZeroSegments = segments.filter(s => s.value > 0);

  return (
    <Box>
      <Box sx={{
        display: 'flex',
        height,
        overflow: 'hidden',
        border: `2px solid ${COLORS.accent}`,
        borderRadius: 0,
      }}>
        {nonZeroSegments.map((seg, i) => {
          const pct = ((seg.value / total) * 100).toFixed(1);
          return (
            <Tooltip key={i} title={`${seg.label}: ${seg.value} (${pct}%)`} arrow>
              <Box sx={{
                width: `${pct}%`,
                bgcolor: seg.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: seg.value > 0 ? 4 : 0,
                transition: 'width 0.3s ease',
              }}>
                {showLabels && parseFloat(pct) > 8 && (
                  <Typography sx={{
                    ...TYPE.tiny,
                    fontFamily: FONT,
                    color: '#fff',
                    fontSize: '0.6rem',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}>
                    {seg.value}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {showLegend && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
          {nonZeroSegments.map((seg, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{
                width: 10,
                height: 10,
                bgcolor: seg.color,
                borderRadius: 0,
                border: `1px solid ${COLORS.accent}`,
              }} />
              <Typography sx={{
                ...TYPE.tiny,
                fontFamily: FONT,
                color: COLORS.textSecondary,
              }}>
                {seg.label} ({typeof seg.value === 'number' ? seg.value.toLocaleString() : seg.value})
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
