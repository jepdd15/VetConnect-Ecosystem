import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  TextField,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

// Hooks
import { useErasureEngine } from '../hooks/useErasureEngine';
import { useUser } from '../../../context/UserContext';

// Icons
import PersonIcon from '@mui/icons-material/Person';
import PetsIcon from '@mui/icons-material/Pets';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ReceiptIcon from '@mui/icons-material/Receipt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

const CONFIRM_KEYWORD = 'ERASE';

/**
 * ErasureConfirmationDialog
 *
 * Presents a summary of all affected records for a given client and requires
 * the admin to type "ERASE" before the irreversible anonymization can proceed.
 *
 * Implements RA 10173 Section 18 — Right to Erasure. The scope preview
 * ensures the data controller representative sees the full extent of the
 * erasure action before confirming.
 *
 * @param {object}  props
 * @param {boolean} props.open        - Controls dialog visibility
 * @param {Function} props.onClose    - Called on cancel or after successful erasure
 * @param {string}  props.userId      - Firestore UID of the client to be erased
 * @param {string}  props.userName    - Display name of the client (pre-anonymization)
 * @param {Date|null} props.requestDate - When the client submitted the deletion request
 * @param {Function} props.onSuccess  - Called with a success message after erasure completes
 */
export default function ErasureConfirmationDialog({
  open,
  onClose,
  userId,
  userName,
  requestDate,
  onSuccess,
}) {
  const { user, profile } = useUser();
  const { scanForErasure, executeErasure, scanning, executing, error } = useErasureEngine();

  const [scanResult, setScanResult] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [localError, setLocalError] = useState(null);

  // Keep a stable ref to the scan result so executeErasure can use the most
  // recent snapshot without stale-closure issues.
  const scanResultRef = useRef(null);

  // This component is conditionally mounted by Patients.jsx ({erasureTarget && ...}),
  // so it always starts with fresh state. We only need to trigger the scan on mount.
  useEffect(() => {
    if (!userId) return;

    scanForErasure(userId)
      .then((result) => {
        setScanResult(result);
        scanResultRef.current = result;
      })
      .catch((err) => {
        setLocalError(`Scan failed: ${err.message}`);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isConfirmEnabled =
    confirmText.trim() === CONFIRM_KEYWORD && scanResult !== null && !executing;

  const handleConfirm = async () => {
    if (!isConfirmEnabled) return;

    const adminUid = user?.uid ?? 'unknown';
    const adminName = profile?.fullName ?? profile?.email ?? 'Unknown Admin';

    try {
      await executeErasure(userId, adminUid, scanResultRef.current, adminName);
      onSuccess(`Erasure complete. ${scanResult.totalDocuments} document(s) anonymized.`);
    } catch {
      // Error is already set in the hook state; we just surface it via localError
      // so it appears inline instead of being swallowed.
      setLocalError(`Erasure failed. Check browser console for details.`);
    }
  };

  const handleClose = () => {
    if (executing) return; // Prevent closing while a batch write is in progress
    onClose();
  };

  const formattedRequestDate = requestDate
    ? new Date(requestDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const displayError = localError || error;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 0,
          border: `2px solid ${COLORS.danger}`,
          boxShadow: `6px 6px 0px ${COLORS.danger}`,
          fontFamily: FONT,
        },
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <DialogTitle
        sx={{
          bgcolor: COLORS.dangerSurface,
          borderBottom: `2px solid ${COLORS.danger}`,
          px: 3,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <DeleteForeverIcon sx={{ color: COLORS.danger, fontSize: 28 }} />
        <Box>
          <Typography
            sx={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: '1rem',
              color: COLORS.danger,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            RA 10173 Data Erasure
          </Typography>
          <Typography
            sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textSecondary }}
          >
            Client:{' '}
            <strong style={{ color: COLORS.textPrimary }}>{userName}</strong>
            {formattedRequestDate && (
              <> &nbsp;·&nbsp; Requested: {formattedRequestDate}</>
            )}
          </Typography>
        </Box>
      </DialogTitle>

      {/* ── Body ───────────────────────────────────────────────── */}
      <DialogContent sx={{ bgcolor: COLORS.cardBg, px: 3, py: 2.5 }}>

        {/* Affected records section */}
        <Typography
          sx={{ ...TYPE.label, fontFamily: FONT, color: COLORS.textMuted, mb: 1 }}
        >
          Affected Records
        </Typography>

        {scanning ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
            <CircularProgress size={20} sx={{ color: COLORS.accent }} />
            <Typography sx={{ fontFamily: FONT, fontSize: '0.875rem', color: COLORS.textMuted }}>
              Scanning Firestore collections…
            </Typography>
          </Box>
        ) : scanResult ? (
          <>
            <List dense disablePadding>
              <AffectedRow
                icon={<PersonIcon sx={{ fontSize: 18, color: COLORS.accentLight }} />}
                label="User profile"
                count={1}
              />
              <AffectedRow
                icon={<PetsIcon sx={{ fontSize: 18, color: COLORS.accentLight }} />}
                label="Pet profile"
                count={scanResult.petCount}
              />
              <AffectedRow
                icon={<CalendarTodayIcon sx={{ fontSize: 18, color: COLORS.accentLight }} />}
                label="Appointment"
                count={scanResult.appointmentCount}
              />
              <AffectedRow
                icon={<MedicalServicesIcon sx={{ fontSize: 18, color: COLORS.accentLight }} />}
                label="Medical record"
                count={scanResult.recordCount}
              />
              <AffectedRow
                icon={<ReceiptIcon sx={{ fontSize: 18, color: COLORS.accentLight }} />}
                label="Sales transaction"
                count={scanResult.saleCount}
              />
            </List>

            <Divider sx={{ my: 1.5, borderColor: COLORS.borderLight }} />

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                bgcolor: COLORS.panelBg,
                border: `1px solid ${COLORS.border}`,
                px: 2,
                py: 1,
              }}
            >
              <Typography
                sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.8rem', color: COLORS.textPrimary, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                Total Documents
              </Typography>
              <Typography
                sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '1.1rem', color: COLORS.danger }}
              >
                {scanResult.totalDocuments}
              </Typography>
            </Box>
          </>
        ) : displayError ? null : (
          <Typography
            sx={{ fontFamily: FONT, fontSize: '0.875rem', color: COLORS.textMuted }}
          >
            Waiting for scan results…
          </Typography>
        )}

        {/* Irreversibility warning */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
            bgcolor: COLORS.dangerSurface,
            border: `1px solid #EF9A9A`,
            px: 2,
            py: 1.5,
            mt: 2,
          }}
        >
          <WarningAmberIcon sx={{ color: COLORS.danger, fontSize: 20, mt: 0.15 }} />
          <Box>
            <Typography
              sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.8rem', color: COLORS.danger, textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              This action is IRREVERSIBLE
            </Typography>
            <Typography
              sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textSecondary, mt: 0.5, lineHeight: 1.6 }}
            >
              Clinical data, financial records, and operational history will be
              preserved, but all personal identifiers will be permanently overwritten
              and cannot be recovered.
            </Typography>
          </Box>
        </Box>

        {/* AMENDMENT 4: SOAP disclaimer */}
        <Box
          sx={{
            bgcolor: COLORS.warningSurface,
            border: `1px solid ${COLORS.kpiOrangeBorder}`,
            px: 2,
            py: 1.5,
            mt: 1.5,
          }}
        >
          <Typography
            sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.warning, lineHeight: 1.6 }}
          >
            <strong>Note:</strong> Free-text clinical notes (SOAP — Subjective, Objective, Assessment,
            Plan) may contain incidental name references written by veterinary staff.
            These are preserved for continuity of care and are not automatically scrubbed
            under RA 10173 §13(d).
          </Typography>
        </Box>

        {/* AMENDMENT 2: Type-to-confirm */}
        <Box sx={{ mt: 2.5 }}>
          <Typography
            sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}
          >
            Type <strong style={{ color: COLORS.danger }}>{CONFIRM_KEYWORD}</strong> to confirm
          </Typography>
          <TextField
            fullWidth
            variant="outlined"
            placeholder={CONFIRM_KEYWORD}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={executing || !scanResult}
            inputProps={{ style: { fontFamily: FONT, fontWeight: 700, letterSpacing: '0.1em' } }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 0,
                '& fieldset': { borderColor: COLORS.border },
                '&:hover fieldset': { borderColor: COLORS.danger },
                '&.Mui-focused fieldset': { borderColor: COLORS.danger },
              },
            }}
          />
        </Box>

        {/* Error display */}
        {displayError && (
          <Box
            sx={{
              bgcolor: COLORS.dangerSurface,
              border: `1px solid ${COLORS.danger}`,
              px: 2,
              py: 1,
              mt: 1.5,
            }}
          >
            <Typography
              sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.danger, fontWeight: 600 }}
            >
              {displayError}
            </Typography>
          </Box>
        )}
      </DialogContent>

      {/* ── Actions ────────────────────────────────────────────── */}
      <DialogActions
        sx={{
          bgcolor: COLORS.panelBg,
          borderTop: `1px solid ${COLORS.border}`,
          px: 3,
          py: 2,
          gap: 1,
        }}
      >
        <Button
          variant="outlined"
          onClick={handleClose}
          disabled={executing}
          sx={{
            fontFamily: FONT,
            fontWeight: 700,
            borderRadius: 0,
            borderColor: COLORS.border,
            color: COLORS.textSecondary,
            '&:hover': { borderColor: COLORS.accent, color: COLORS.accent },
          }}
        >
          Cancel
        </Button>

        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!isConfirmEnabled}
          startIcon={
            executing
              ? <CircularProgress size={16} sx={{ color: '#fff' }} />
              : <DeleteForeverIcon />
          }
          sx={{
            fontFamily: FONT,
            fontWeight: 900,
            borderRadius: 0,
            bgcolor: COLORS.danger,
            color: '#fff',
            letterSpacing: '0.05em',
            boxShadow: `3px 3px 0px ${COLORS.dangerHover}`,
            '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: 'none' },
            '&.Mui-disabled': { bgcolor: '#EF9A9A', color: '#fff' },
          }}
        >
          {executing ? 'Erasing…' : 'Confirm Erasure'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-component — not exported
// ---------------------------------------------------------------------------

/**
 * A single row in the affected-records list.
 * Pluralises the label for counts > 1.
 */
function AffectedRow({ icon, label, count }) {
  return (
    <ListItem disablePadding sx={{ py: 0.25 }}>
      <ListItemIcon sx={{ minWidth: 28 }}>{icon}</ListItemIcon>
      <ListItemText
        primary={
          <Typography sx={{ fontFamily: FONT, fontSize: '0.875rem', color: COLORS.textSecondary }}>
            {count}{' '}
            <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>
              {label}{count !== 1 ? 's' : ''}
            </span>
          </Typography>
        }
      />
    </ListItem>
  );
}
