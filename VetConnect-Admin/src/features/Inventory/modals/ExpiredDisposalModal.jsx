import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, CircularProgress, Divider, Chip,
} from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { FONT, COLORS } from '../../../theme/designTokens';

/**
 * ExpiredDisposalModal
 *
 * Presents a full per-product / per-batch breakdown of all expired inventory
 * batches before the user commits to an irreversible bulk disposal.
 *
 * Props:
 *   open          - boolean, controls Dialog visibility
 *   onClose       - () => void, called when Cancel is clicked or dialog dismissed
 *   expiredItems  - array from findExpiredBatches(), may be empty
 *   onDispose     - async (expiredItems) => void, called on confirm; errors propagate as thrown exceptions
 */
export default function ExpiredDisposalModal({ open, onClose, expiredItems, onDispose }) {
  const [disposing, setDisposing] = useState(false);

  const totalProducts = expiredItems.length;
  const totalBatches  = expiredItems.reduce((sum, item) => sum + item.expiredBatches.length, 0);
  const totalUnits    = expiredItems.reduce((sum, item) => sum + item.totalExpiredQty, 0);

  const isEmpty = totalProducts === 0;

  const handleDispose = async () => {
    setDisposing(true);
    try {
      await onDispose(expiredItems);
      // onClose is called by the parent's handleDispose after success toast
    } catch (err) {
      // Parent's handleDispose catches this and shows the error toast
      throw err;
    } finally {
      setDisposing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={disposing ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 0,
          border: `2px solid ${COLORS.accent}`,
          boxShadow: '8px 8px 0px rgba(93,64,55,0.1)',
        },
      }}
    >
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <DialogTitle
        sx={{
          bgcolor: isEmpty ? COLORS.cream : COLORS.dangerSurface,
          color: isEmpty ? COLORS.brand : COLORS.danger,
          fontWeight: 900,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontFamily: FONT,
          textTransform: 'uppercase',
          letterSpacing: 1,
          borderBottom: `2px solid ${COLORS.accent}`,
        }}
      >
        <DeleteSweepIcon />
        EXPIRED BATCH DISPOSAL
      </DialogTitle>

      {/* ── CONTENT ────────────────────────────────────────────── */}
      <DialogContent
        sx={{
          p: 0,
          bgcolor: COLORS.formBg,
          minHeight: 200,
          maxHeight: 480,
          overflow: 'auto',
        }}
      >
        {isEmpty ? (
          /* All-clear state — shown when no expired batches exist */
          <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: COLORS.success, mb: 2 }} />
            <Typography
              variant="h6"
              sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand, mb: 1 }}
            >
              NO EXPIRED BATCHES FOUND
            </Typography>
            <Typography variant="body2" color="textSecondary">
              All batch expiry dates are current. Nothing to dispose.
            </Typography>
          </Box>
        ) : (
          <>
            {/* Warning banner */}
            <Box
              sx={{
                px: 3,
                py: 2,
                bgcolor: COLORS.warningSurface,
                borderBottom: `1px solid ${COLORS.warning}`,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <WarningAmberIcon sx={{ color: COLORS.warning, flexShrink: 0 }} />
              <Typography variant="body2" fontWeight="bold" color={COLORS.accent}>
                The following expired batches will be permanently removed from stock.
                This action cannot be undone.
              </Typography>
            </Box>

            {/* Per-product breakdown */}
            {expiredItems.map((item, idx) => (
              <Box key={item.id}>
                <Box sx={{ px: 3, py: 2 }}>
                  {/* Product header row */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand }}
                    >
                      {item.itemName}
                    </Typography>
                    <Chip
                      label={`-${item.totalExpiredQty} units`}
                      size="small"
                      sx={{
                        bgcolor: COLORS.dangerSurface,
                        color: COLORS.danger,
                        fontWeight: 900,
                        fontSize: '0.7rem',
                        borderRadius: 0,
                      }}
                    />
                  </Box>

                  {/* Stock impact summary */}
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{ display: 'block', mb: 1 }}
                  >
                    Current stock: {item.currentStock} | After disposal:{' '}
                    {item.currentStock - item.totalExpiredQty}
                    {item.reserved > 0 && ` | Reserved: ${item.reserved}`}
                  </Typography>

                  {/* Per-batch detail rows */}
                  {item.expiredBatches.map((batch, bIdx) => (
                    <Box
                      key={bIdx}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        ml: 2,
                        mb: 0.5,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: COLORS.danger,
                          fontWeight: 'bold',
                          fontSize: '0.72rem',
                        }}
                      >
                        {batch.batchNumber || 'Unnamed batch'}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Expired: {batch.expiryDate} | Qty: {batch.qty}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {idx < expiredItems.length - 1 && <Divider />}
              </Box>
            ))}

            {/* Summary footer chips */}
            <Box
              sx={{
                px: 3,
                py: 2,
                bgcolor: COLORS.cream,
                borderTop: `2px solid ${COLORS.accent}`,
                display: 'flex',
                gap: 2,
                justifyContent: 'center',
              }}
            >
              <Chip
                label={`${totalProducts} product${totalProducts !== 1 ? 's' : ''}`}
                size="small"
                sx={{
                  fontWeight: 900,
                  fontSize: '0.7rem',
                  borderRadius: 0,
                  bgcolor: COLORS.panelBg,
                }}
              />
              <Chip
                label={`${totalBatches} batch${totalBatches !== 1 ? 'es' : ''}`}
                size="small"
                sx={{
                  fontWeight: 900,
                  fontSize: '0.7rem',
                  borderRadius: 0,
                  bgcolor: COLORS.panelBg,
                }}
              />
              <Chip
                label={`${totalUnits} total units`}
                size="small"
                sx={{
                  fontWeight: 900,
                  fontSize: '0.7rem',
                  borderRadius: 0,
                  bgcolor: COLORS.dangerSurface,
                  color: COLORS.danger,
                }}
              />
            </Box>
          </>
        )}
      </DialogContent>

      {/* ── ACTIONS ────────────────────────────────────────────── */}
      <DialogActions
        sx={{
          p: 2.5,
          bgcolor: COLORS.cream,
          borderTop: `2px solid ${COLORS.accent}`,
          gap: 1,
        }}
      >
        <Button
          onClick={onClose}
          disabled={disposing}
          variant="outlined"
          sx={{
            fontFamily: FONT,
            fontWeight: 900,
            borderRadius: 0,
            flex: 1,
            border: `2px solid ${COLORS.accent}`,
            color: COLORS.accent,
          }}
        >
          CANCEL
        </Button>

        {!isEmpty && (
          <Button
            onClick={handleDispose}
            disabled={disposing}
            variant="contained"
            color="error"
            sx={{
              fontFamily: FONT,
              fontWeight: 900,
              borderRadius: 0,
              flex: 1,
              boxShadow: '4px 4px 0px rgba(211,47,47,0.2)',
              border: `2px solid ${COLORS.dangerHover}`,
            }}
          >
            {disposing && (
              <CircularProgress size={20} sx={{ color: '#fff', mr: 1 }} />
            )}
            {disposing ? 'DISPOSING...' : `DISPOSE ALL EXPIRED (${totalUnits})`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
