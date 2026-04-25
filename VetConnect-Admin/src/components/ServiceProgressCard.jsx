import React from 'react';
import { Box, Paper, Typography, Stack, Chip } from '@mui/material';
import { COLORS } from '../theme/designTokens';

/**
 * T2.97 — ServiceProgressCard
 *
 * Shared component that renders the per-service progress list used during
 * an active clinical encounter. Extracted from ClinicalWorkspace so it can
 * be reused in EndOfDayModal and Records audit views.
 *
 * @prop {Array}    services        - The appointment's services[] array
 * @prop {Object}   serviceProgress - Map of { [serviceId]: 'pending' | 'in-progress' | 'completed' }
 * @prop {Function} [onToggle]      - Called with (serviceId) when a card is clicked. Omit for readOnly.
 * @prop {boolean}  [readOnly]      - When true, disables click interaction (default: false)
 * @prop {Object}   [sx]            - Optional MUI sx overrides for the outer Paper
 */
export function ServiceProgressCard({ services = [], serviceProgress = {}, onToggle, readOnly = false, sx = {} }) {
  const visibleServices = services.filter(svc => svc.id);

  if (visibleServices.length === 0) return null;

  const colorMap = {
    pending:     { bg: '#FFF8E1', border: COLORS.warning,  label: 'PENDING'     },
    'in-progress': { bg: '#E3F2FD', border: COLORS.medical,  label: 'IN PROGRESS' },
    completed:   { bg: COLORS.kpiGreenBg, border: COLORS.success, label: 'COMPLETED'   },
  };

  return (
    <Paper sx={{ p: 3, borderLeft: `8px solid ${COLORS.medical}`, borderRadius: 0, ...sx }}>
      <Typography sx={{ fontWeight: 1000, color: COLORS.brand, fontSize: '0.85rem', mb: 2 }}>
        SERVICE PROGRESS
      </Typography>
      <Stack spacing={1.5}>
        {visibleServices.map((svc) => {
          const status = serviceProgress[svc.id] || 'pending';
          const c = colorMap[status] || colorMap.pending;
          const isClickable = !readOnly && status !== 'completed';

          return (
            <Box
              key={svc.id}
              onClick={() => isClickable && onToggle?.(svc.id)}
              sx={{
                p: 1.5,
                bgcolor: c.bg,
                border: `2px solid ${c.border}`,
                borderRadius: 0,
                cursor: isClickable ? 'pointer' : 'default',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'all 0.15s',
                '&:hover': isClickable ? { opacity: 0.85 } : {},
              }}
            >
              <Typography sx={{ fontWeight: 900, fontSize: '0.75rem', color: COLORS.brand }}>
                {svc.name}
              </Typography>
              <Chip
                label={c.label}
                size="small"
                sx={{
                  bgcolor: c.border,
                  color: '#FFF',
                  fontWeight: 900,
                  fontSize: '0.6rem',
                  height: 20,
                  borderRadius: 0,
                }}
              />
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}
