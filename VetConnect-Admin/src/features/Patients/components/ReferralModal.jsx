import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, FormControl, Select, MenuItem,
  InputLabel, Stack,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';

import { FONT, COLORS } from '../../../theme/designTokens';
import { generateReferralReportHTML } from '../../../utils/printReferralReport';
import { openPrintWindow } from '../../../utils/printUtils';

/**
 * Ephemeral form modal for generating a veterinary referral report.
 *
 * Referral data is NOT written to Firestore — this is a print-only workflow.
 * The modal collects the referred-to clinic/doctor, reason, urgency, and a
 * clinical summary (pre-filled from the latest medical record), then opens
 * the referral letter in a print window.
 *
 * @param {object}   props
 * @param {boolean}  props.open          Controls dialog visibility
 * @param {function} props.onClose       Called on cancel or after printing
 * @param {object}   props.pet           Pet Firestore document
 * @param {object}   props.owner         Owner user document
 * @param {Array}    props.history       Full medical record history (desc order)
 * @param {string}   props.clinicName    From useClinicSettings()
 * @param {string}   props.clinicAddress From useClinicSettings()
 */
export default function ReferralModal({
  open,
  onClose,
  pet,
  owner,
  history,
  clinicName,
  clinicAddress,
}) {
  const latestRecord = history?.[0] || null;

  // Pre-fill clinical summary from the latest record's assessment + diagnosis.
  const buildInitialSummary = () => {
    if (!latestRecord) return '';
    const parts = [latestRecord.diagnosis, latestRecord.soap?.assessment].filter(Boolean);
    return parts.join('\n\n');
  };

  const [form, setForm] = useState({
    referredToClinic: '',
    referredToDoctor: '',
    referralReason: '',
    urgency: 'Routine',
    clinicalSummary: buildInitialSummary(),
  });

  useEffect(() => {
    if (open) {
      const parts = [latestRecord?.diagnosis, latestRecord?.soap?.assessment].filter(Boolean);
      setForm({
        referredToClinic: '',
        referredToDoctor: '',
        referralReason: '',
        urgency: 'Routine',
        clinicalSummary: parts.join('\n\n'),
      });
    }
  }, [open]);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handlePrint = () => {
    const html = generateReferralReportHTML({
      pet,
      owner,
      form,
      latestRecord,
      referringVet: latestRecord?.vetName || 'Attending Clinician',
      clinicName,
      clinicAddress,
    });
    openPrintWindow(html);
    onClose();
  };

  const isSubmittable = form.referredToClinic.trim() && form.referralReason.trim();

  const inputSx = { '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } };
  const labelSx = { fontFamily: FONT };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 0, border: `2px solid ${COLORS.accent}` },
      }}
    >
      <DialogTitle
        sx={{
          fontFamily: FONT,
          fontWeight: 800,
          color: COLORS.brand,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          borderBottom: `1px solid ${COLORS.borderLight}`,
          pb: 1.5,
        }}
      >
        Generate Referral Report
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5 }}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Referred To (Clinic / Hospital) *"
            required
            fullWidth
            size="small"
            value={form.referredToClinic}
            onChange={e => update('referredToClinic', e.target.value)}
            InputLabelProps={{ sx: labelSx }}
            sx={inputSx}
          />

          <TextField
            label="Referred To (Doctor)"
            fullWidth
            size="small"
            value={form.referredToDoctor}
            onChange={e => update('referredToDoctor', e.target.value)}
            helperText="Optional — leave blank to address to 'Attending Veterinarian'"
            FormHelperTextProps={{ sx: { fontFamily: FONT, fontSize: '0.7rem' } }}
            InputLabelProps={{ sx: labelSx }}
            sx={inputSx}
          />

          <FormControl fullWidth size="small">
            <InputLabel sx={labelSx}>Urgency</InputLabel>
            <Select
              value={form.urgency}
              label="Urgency"
              onChange={e => update('urgency', e.target.value)}
              sx={{ fontFamily: FONT, borderRadius: 0 }}
            >
              <MenuItem value="Routine" sx={{ fontFamily: FONT }}>Routine</MenuItem>
              <MenuItem value="Urgent" sx={{ fontFamily: FONT }}>Urgent</MenuItem>
              <MenuItem value="Emergency" sx={{ fontFamily: FONT }}>Emergency</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Reason for Referral *"
            required
            fullWidth
            multiline
            rows={3}
            size="small"
            value={form.referralReason}
            onChange={e => update('referralReason', e.target.value)}
            InputLabelProps={{ sx: labelSx }}
            sx={inputSx}
          />

          <TextField
            label="Clinical Summary"
            fullWidth
            multiline
            rows={4}
            size="small"
            value={form.clinicalSummary}
            onChange={e => update('clinicalSummary', e.target.value)}
            helperText="Pre-filled from the latest record's assessment — edit as needed."
            FormHelperTextProps={{ sx: { fontFamily: FONT, fontSize: '0.7rem' } }}
            InputLabelProps={{ sx: labelSx }}
            sx={inputSx}
          />
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          pb: 2,
          pt: 1.5,
          gap: 1,
          borderTop: `1px solid ${COLORS.borderLight}`,
        }}
      >
        <Button
          onClick={onClose}
          sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textMuted }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          disabled={!isSubmittable}
          sx={{
            fontFamily: FONT,
            fontWeight: 700,
            bgcolor: COLORS.accent,
            borderRadius: 0,
            '&:hover': { bgcolor: COLORS.brand },
            '&.Mui-disabled': { bgcolor: COLORS.borderLight, color: COLORS.textMuted },
          }}
        >
          Print Referral
        </Button>
      </DialogActions>
    </Dialog>
  );
}
