import React, { useState } from 'react';
import {
  Box, Typography, Button, Stack,
  ToggleButton, ToggleButtonGroup,
  Select, MenuItem, TextField, Collapse,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { COLORS, FONT, TYPE } from '../theme/designTokens';
import {
  BODY_SYSTEMS,
  DENTAL_GRADES,
  HYDRATION_OPTIONS,
  MEMBRANE_OPTIONS,
  createDefaultExam,
} from '../utils/examUtils';

// ── Shared sx overrides to enforce zero border-radius design system ──────────

const toggleButtonGroupSx = {
  '& .MuiToggleButton-root': {
    borderRadius: 0,
    fontFamily: FONT,
    fontSize: '0.65rem',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    px: 1.5,
    py: 0.25,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.textSecondary,
    '&.Mui-selected': { color: '#FFFFFF', fontWeight: 900 },
    '&.Mui-disabled': { opacity: 0.45 },
  },
};

const normalSelectedSx = {
  '&.Mui-selected': { bgcolor: COLORS.success, '&:hover': { bgcolor: COLORS.success } },
};

const abnormalSelectedSx = {
  '&.Mui-selected': { bgcolor: COLORS.danger, '&:hover': { bgcolor: COLORS.danger } },
};

const selectSx = {
  borderRadius: 0,
  fontFamily: FONT,
  fontSize: '0.75rem',
  '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 },
  '& .MuiSelect-select': { py: 0.75, px: 1 },
};

const notesFieldSx = {
  mt: 0.5,
  ml: 2,
  '& .MuiInputBase-root': { borderRadius: 0, fontFamily: FONT, fontSize: '0.8rem' },
  '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 },
};

/**
 * PhysicalExamChecklist
 *
 * Structured physical exam UI for the O quadrant of the SOAP workspace (T4.115).
 * Replaces the free-text objectiveNotes TextField with a system-by-system toggle
 * checklist plus categorical selects for dental, hydration, and mucous membranes.
 *
 * Fully controlled: state lives in the parent (ClinicalWorkspace) via examData + onChange.
 *
 * @prop {object}   examData       - The objectiveExam structured object
 * @prop {function} onChange       - (updatedExam) => void — called on any field change
 * @prop {function} onMarkAllNormal - Callback to reset all fields to defaults (WNL template)
 * @prop {boolean}  [disabled]     - When true, all inputs are read-only
 */
export default function PhysicalExamChecklist({
  examData,
  onChange,
  onMarkAllNormal,
  disabled = false,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Defensive fallback: if examData is missing or malformed, use defaults
  const exam = examData || createDefaultExam();

  const handleSystemToggle = (index, newStatus) => {
    if (!newStatus) return; // MUI exclusive ToggleButtonGroup can fire null on re-click — ignore
    const updatedSystems = exam.systems.map((sys, i) =>
      i === index
        ? { ...sys, status: newStatus, notes: newStatus === 'normal' ? '' : sys.notes }
        : sys
    );
    onChange({ ...exam, systems: updatedSystems });
  };

  const handleSystemNotes = (index, notes) => {
    const updatedSystems = exam.systems.map((sys, i) =>
      i === index ? { ...sys, notes } : sys
    );
    onChange({ ...exam, systems: updatedSystems });
  };

  const handleDentalChange = (e) => {
    onChange({ ...exam, dental: { grade: e.target.value } });
  };

  const handleHydrationChange = (e) => {
    onChange({ ...exam, hydration: { status: e.target.value } });
  };

  const handleMucousMembranesChange = (e) => {
    onChange({ ...exam, mucousMembranes: { status: e.target.value } });
  };

  const handleGeneralNotesChange = (e) => {
    onChange({ ...exam, generalNotes: e.target.value });
  };

  return (
    <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0, pt: 0.5 }}>

      {/* All Systems Normal — top-right anchor */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button
          size="small"
          onClick={() => setConfirmOpen(true)}
          disabled={disabled}
          sx={{
            borderRadius: 0,
            fontFamily: FONT,
            fontSize: '0.6rem',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: COLORS.success,
            border: `1px solid ${COLORS.success}`,
            px: 1.5,
            py: 0.25,
            '&:hover': { bgcolor: COLORS.success, color: '#FFFFFF' },
            '&.Mui-disabled': { opacity: 0.4 },
          }}
        >
          All Systems Normal
        </Button>
      </Box>

      {/* Body System Rows */}
      {(exam.systems || []).map((sys, index) => (
        <Box key={sys.name}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.4 }}>
            <Typography sx={{ ...TYPE.bodyBold, color: COLORS.brand, fontSize: '0.8rem', minWidth: 140 }}>
              {sys.name}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={sys.status}
              onChange={(_, newVal) => handleSystemToggle(index, newVal)}
              disabled={disabled}
              sx={toggleButtonGroupSx}
            >
              <ToggleButton value="normal" sx={normalSelectedSx}>
                Normal
              </ToggleButton>
              <ToggleButton value="abnormal" sx={abnormalSelectedSx}>
                Abnormal
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Abnormal findings field — slides in below the row */}
          <Collapse in={sys.status === 'abnormal'} unmountOnExit>
            <TextField
              size="small"
              multiline
              rows={1}
              fullWidth
              variant="outlined"
              placeholder="Describe findings..."
              value={sys.notes || ''}
              onChange={(e) => handleSystemNotes(index, e.target.value)}
              disabled={disabled}
              sx={notesFieldSx}
            />
          </Collapse>
        </Box>
      ))}

      {/* Special Fields Row: Dental / Hydration / Mucous Membranes */}
      <Stack direction="row" spacing={1.5} sx={{ mt: 1.5, mb: 1 }} flexWrap="wrap" useFlexGap>

        <Box sx={{ flex: 1, minWidth: 120 }}>
          <Typography sx={{ ...TYPE.label, color: COLORS.textMuted, mb: 0.25 }}>
            Dental Grade
          </Typography>
          <Select
            size="small"
            fullWidth
            value={exam.dental?.grade ?? 0}
            onChange={handleDentalChange}
            disabled={disabled}
            sx={selectSx}
          >
            {DENTAL_GRADES.map(opt => (
              <MenuItem key={opt.value} value={opt.value} sx={{ fontFamily: FONT, fontSize: '0.78rem' }}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box sx={{ flex: 1, minWidth: 120 }}>
          <Typography sx={{ ...TYPE.label, color: COLORS.textMuted, mb: 0.25 }}>
            Hydration
          </Typography>
          <Select
            size="small"
            fullWidth
            value={exam.hydration?.status || 'normal'}
            onChange={handleHydrationChange}
            disabled={disabled}
            sx={selectSx}
          >
            {HYDRATION_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value} sx={{ fontFamily: FONT, fontSize: '0.78rem' }}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box sx={{ flex: 1, minWidth: 120 }}>
          <Typography sx={{ ...TYPE.label, color: COLORS.textMuted, mb: 0.25 }}>
            Mucous Membranes
          </Typography>
          <Select
            size="small"
            fullWidth
            value={exam.mucousMembranes?.status || 'pink-moist'}
            onChange={handleMucousMembranesChange}
            disabled={disabled}
            sx={selectSx}
          >
            {MEMBRANE_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value} sx={{ fontFamily: FONT, fontSize: '0.78rem' }}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </Box>

      </Stack>

      {/* General Notes — free-text catch-all */}
      <Box sx={{ mt: 0.5 }}>
        <Typography sx={{ ...TYPE.label, color: COLORS.textMuted, mb: 0.25 }}>
          General Notes
        </Typography>
        <TextField
          multiline
          rows={2}
          fullWidth
          variant="standard"
          placeholder="Additional findings or observations not covered above..."
          value={exam.generalNotes || ''}
          onChange={handleGeneralNotesChange}
          disabled={disabled}
          InputProps={{
            disableUnderline: false,
            sx: { fontFamily: FONT, fontSize: '0.875rem', color: COLORS.brand, lineHeight: 1.6 },
          }}
        />
      </Box>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 0,
            border: `2px solid ${COLORS.accent}`,
            boxShadow: `8px 8px 0px ${COLORS.accent}`,
          },
        }}
      >
        <DialogTitle sx={{
          bgcolor: COLORS.cream,
          color: COLORS.brand,
          fontWeight: 900,
          fontFamily: FONT,
          fontSize: '0.95rem',
          textTransform: 'uppercase',
          letterSpacing: 1,
          borderBottom: `2px solid ${COLORS.accent}`,
        }}>
          Confirm All Systems Normal
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, pb: 2, bgcolor: COLORS.formBg }}>
          <Typography sx={{ fontSize: '0.85rem', color: COLORS.brand, fontWeight: 600 }}>
            This will set all body systems to normal. Any existing exam findings will be overwritten.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
          <Button
            onClick={() => setConfirmOpen(false)}
            sx={{
              fontWeight: 900,
              color: COLORS.accent,
              border: `2px solid ${COLORS.accent}`,
              borderRadius: 0,
              fontFamily: FONT,
              px: 2.5,
              fontSize: '0.75rem',
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => { onMarkAllNormal(); setConfirmOpen(false); }}
            variant="contained"
            sx={{
              fontWeight: 900,
              borderRadius: 0,
              fontFamily: FONT,
              px: 3,
              fontSize: '0.75rem',
              bgcolor: COLORS.cta,
              border: `2px solid ${COLORS.ctaHover}`,
              boxShadow: '4px 4px 0px rgba(216,67,21,0.2)',
              '&:hover': { bgcolor: COLORS.ctaHover },
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
