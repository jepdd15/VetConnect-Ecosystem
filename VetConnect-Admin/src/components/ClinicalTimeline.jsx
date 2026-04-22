import React from 'react';
import { Box, Typography, Stack, Chip } from '@mui/material';
import { COLORS, FONT, TYPE } from '../theme/designTokens';

/**
 * T2.111 — ClinicalTimeline
 *
 * Shared component that renders a chronological list of pulse events with
 * status-change icons, timestamps, and staff attribution. Used by:
 *   - EndOfDayModal audit cards
 *   - Queue audit review panel
 *   - Records audit popover / forensic timeline
 *
 * @prop {Array}  pulse        - clinicalPulse array from Firestore (unsorted OK — component sorts).
 * @prop {number} [maxItems]   - Optionally cap displayed events (default: unlimited).
 * @prop {boolean} [compact]   - When true, uses smaller typography and tighter spacing.
 */
export function ClinicalTimeline({ pulse = [], maxItems, compact = false }) {
  const sorted = [...pulse]
    .sort((a, b) => {
      const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
      const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
      return ta - tb;
    })
    .slice(0, maxItems ?? pulse.length);

  if (sorted.length === 0) {
    return (
      <Typography sx={{ fontSize: compact ? '0.65rem' : '0.75rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
        No pulse events recorded.
      </Typography>
    );
  }

  return (
    <Stack spacing={compact ? 0.5 : 1}>
      {sorted.map((event, idx) => {
        const ts = event.timestamp?.toDate
          ? event.timestamp.toDate()
          : new Date(event.timestamp || 0);

        const timeStr = ts.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
        const dateStr = ts.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
        const isStatusChange = event.type === 'STATUS_CHANGE';
        const dotColor = isStatusChange ? COLORS.accent : COLORS.textSecondary;

        return (
          <Box
            key={event.eventId || idx}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: compact ? 0.75 : 1,
            }}
          >
            {/* Timeline dot */}
            <Box
              sx={{
                width: compact ? 6 : 8,
                height: compact ? 6 : 8,
                borderRadius: '50%',
                bgcolor: dotColor,
                mt: compact ? 0.6 : 0.7,
                flexShrink: 0,
              }}
            />

            <Box sx={{ flex: 1, minWidth: 0 }}>
              {/* Event type chip + timestamp */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <Chip
                  label={event.type || 'EVENT'}
                  size="small"
                  sx={{
                    height: compact ? 14 : 16,
                    fontSize: compact ? '0.5rem' : '0.58rem',
                    fontWeight: 900,
                    fontFamily: FONT,
                    bgcolor: isStatusChange ? COLORS.accent : '#E0E0E0',
                    color: isStatusChange ? '#FFF' : COLORS.brand,
                    borderRadius: 0,
                    px: 0.5,
                    letterSpacing: 0.4,
                  }}
                />
                {isStatusChange && event.toStatus && (
                  <Typography sx={{ fontSize: compact ? '0.6rem' : '0.68rem', fontWeight: 900, color: COLORS.brand }}>
                    → {event.toStatus.toUpperCase()}
                  </Typography>
                )}
                <Typography sx={{ fontSize: compact ? '0.55rem' : '0.62rem', color: COLORS.textMuted, ml: 'auto', whiteSpace: 'nowrap' }}>
                  {dateStr} {timeStr}
                </Typography>
              </Box>

              {/* Staff attribution */}
              {event.staffName && (
                <Typography sx={{ fontSize: compact ? '0.55rem' : '0.62rem', color: COLORS.textSecondary, mt: 0.25 }}>
                  {event.staffName}
                  {event.note ? ` — ${event.note}` : ''}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
