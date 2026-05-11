import React from 'react';
import { Box, Typography, Avatar, Chip, Button, Stack, Divider } from '@mui/material';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

// Icons
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelIcon from '@mui/icons-material/Cancel';
import UpdateIcon from '@mui/icons-material/Update';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import GppBadIcon from '@mui/icons-material/GppBad';

/**
 * Returns true when the client has explicitly withdrawn consent via the mobile
 * app (consentVersion cleared to null alongside deletionRequested).  A plain
 * deletionRequested without a cleared consentVersion is a different flow —
 * shown as a generic erasure button without the consent-withdrawn banner.
 */
function isConsentWithdrawal(client) {
  return client.deletionRequested === true && (client.consentVersion === null || client.consentVersion === undefined);
}

export default function ClientHeader({ client, balance, isEditing, onEdit, onCancel, onSave, engagementKPIs, onProcessErasure }) {
  const hasDebt = balance > 0;

  // T2.133: Contact freshness — compute days since last profile update.
  // Falls back to createdAt when updatedAt is absent (legacy records).
  const profileTimestamp = client.updatedAt?.seconds
    ? new Date(client.updatedAt.seconds * 1000)
    : (client.createdAt?.seconds ? new Date(client.createdAt.seconds * 1000) : null);
  const daysSinceUpdate = profileTimestamp
    ? Math.floor((Date.now() - profileTimestamp.getTime()) / 86400000)
    : null;
  const isStaleProfile = daysSinceUpdate !== null && daysSinceUpdate > 90;

  const showConsentWithdrawalBanner = isConsentWithdrawal(client);

  return (
    <>
    <Box sx={{
        px: 4, py: 2.5,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        bgcolor: isEditing ? 'rgba(239, 235, 233, 0.95)' : COLORS.cardBg,
        borderBottom: isEditing ? `3px solid ${COLORS.accent}` : `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
    }}>
        
        {/* LEFT SIDE: HIGH DENSITY IDENTITY */}
        <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'center', flex: 1 }}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: COLORS.accent, fontFamily: FONT, fontSize: 28, fontWeight: 900, boxShadow: 2 }}>
              {client.fullName ? client.fullName[0].toUpperCase() : '?'}
            </Avatar>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {/* Row 1: Name and Tags */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Typography variant="h5" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textPrimary, letterSpacing: -0.5, lineHeight: 1 }}>
                      {client.fullName}
                  </Typography>
                  {client.seniorId && <Chip label="SC/PWD" size="small" sx={{fontFamily: FONT, fontWeight: 'bold', height: 22, fontSize: '0.7rem', bgcolor: COLORS.kpiPurpleBg, color: COLORS.grooming}} />}
                  {/* T4.208: Referral chip — dual-read referral object with legacy scalar fallbacks */}
                  {(() => {
                    const refSource = client.referral?.source || client.referralSource || '';
                    const refPerson = client.referral?.referredBy || client.referredBy || '';
                    if (!refSource && !refPerson) return null;
                    let label = '';
                    if (refPerson && refSource) label = `Ref: ${refPerson} · ${refSource}`;
                    else if (refPerson) label = `Ref: ${refPerson}`;
                    else label = refSource;
                    return (
                      <Chip label={label} size="small" variant="outlined"
                        sx={{ fontFamily: FONT, fontWeight: 'bold', height: 22, fontSize: '0.7rem', borderColor: COLORS.accentLight, color: COLORS.accentLight }} />
                    );
                  })()}
                </Box>

                {/* T2.134: Engagement KPIs row */}
                {!isEditing && engagementKPIs && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mt: 0.25, mb: 0.25 }}>
                    <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <TrendingUpIcon sx={{ fontSize: 13 }} />
                      {engagementKPIs.totalVisits} visit{engagementKPIs.totalVisits !== 1 ? 's' : ''}
                    </Typography>
                    {engagementKPIs.lastVisitDate && (
                      <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted }}>
                        Last: {engagementKPIs.lastVisitDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Typography>
                    )}
                    {engagementKPIs.avgDaysBetween != null && (
                      <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted }}>
                        ~{engagementKPIs.avgDaysBetween}d between visits
                      </Typography>
                    )}
                    {engagementKPIs.noShowCount > 0 && (
                      <Chip
                        icon={<EventBusyIcon sx={{ fontSize: '12px !important' }} />}
                        label={`${engagementKPIs.noShowCount} no-show${engagementKPIs.noShowCount > 1 ? 's' : ''} (${engagementKPIs.totalAppointments ? Math.round((engagementKPIs.noShowCount / engagementKPIs.totalAppointments) * 100) : 0}%)`}
                        size="small"
                        sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.65rem', height: 20, bgcolor: COLORS.dangerSurface, color: COLORS.danger, border: '1px solid #EF9A9A' }}
                      />
                    )}
                  </Box>
                )}

                {/* Row 2: Contacts */}
                {!isEditing && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, color: COLORS.textSecondary, mt: 0.5 }}>
                    <Typography variant="body2" sx={{ fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
                      <PhoneIcon sx={{fontSize: 16, color: COLORS.accent}}/> {client.phone}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 0.5, color: COLORS.textMuted }}>
                      <EmailIcon sx={{fontSize: 16, color: COLORS.textMuted}}/> {client.email || 'No email provided'}
                    </Typography>
                    <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, ml: 1, fontStyle: 'italic', borderLeft: `1px solid ${COLORS.border}`, pl: 2.5 }}>
                      Client Since: {client.createdAt ? new Date(client.createdAt?.seconds ? client.createdAt.seconds * 1000 : client.createdAt).toLocaleDateString() : 'N/A'}
                    </Typography>
                  </Box>
                )}

                {/* T2.133: Stale contact info banner */}
                {isStaleProfile && !isEditing && (
                  <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    bgcolor: COLORS.cream, px: 2, py: 0.5,
                    border: `1px solid #FFE082`, mt: 0.5,
                  }}>
                    <UpdateIcon sx={{ fontSize: 14, color: '#F57F17' }} />
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: '#F57F17', fontWeight: 600 }}>
                      Contact info last updated {daysSinceUpdate}d ago — please confirm details are current.
                    </Typography>
                  </Box>
                )}
            </Box>
        </Box>
        
        {/* RIGHT SIDE: INTEGRATED FINANCIALS & ACTIONS */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: `1px dashed ${COLORS.border}`, pl: 4 }}>
          
          <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, display: 'block', mb: -0.5 }}>Total Outstanding</Typography>
              <Typography variant="h5" sx={{ fontFamily: FONT, color: hasDebt ? COLORS.danger : COLORS.success, fontWeight: 900, letterSpacing: -0.5 }}>
                  ₱{balance.toFixed(2)}
              </Typography>
              {hasDebt ? (
                  <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.danger, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                      <WarningAmberIcon sx={{fontSize: 16}}/> Payment Due
                  </Typography>
              ) : (
                  <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.success, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                      <CheckCircleOutlineIcon sx={{fontSize: 16}}/> Good Standing
                  </Typography>
              )}
          </Box>

          <Divider orientation="vertical" flexItem sx={{ my: 1, borderColor: COLORS.borderLight }} />

          <Box>
              {isEditing ? (
              <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={onSave} sx={{ fontFamily: FONT, fontWeight: 'bold', py: 1, bgcolor: COLORS.success, '&:hover': { bgcolor: '#1B5E20' } }} startIcon={<SaveIcon />}>Save</Button>
                  <Button variant="outlined" onClick={onCancel} sx={{ fontFamily: FONT, fontWeight: 'bold', py: 1, color: COLORS.danger, borderColor: COLORS.danger }} startIcon={<CancelIcon />}>Cancel</Button>
              </Stack>
              ) : (
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit} sx={{fontFamily: FONT, borderColor: COLORS.border, color: COLORS.textSecondary, '&:hover':{borderColor: COLORS.accentWarm, color: COLORS.accentWarm, bgcolor: COLORS.panelBg}, bgcolor: COLORS.cardBg, fontWeight: 'bold', py: 1, px: 2}}>
                    Edit Profile
                </Button>
                {/* RA 10173: Generic deletion-request erasure button.
                    Suppressed when the consent-withdrawal banner is shown —
                    that banner carries its own "Process Erasure" button. */}
                {client.deletionRequested && !showConsentWithdrawalBanner && (
                  <Button
                    variant="contained"
                    startIcon={<DeleteForeverIcon />}
                    onClick={onProcessErasure}
                    sx={{
                      fontFamily: FONT,
                      fontWeight: 'bold',
                      py: 1,
                      px: 2,
                      borderRadius: 0,
                      bgcolor: COLORS.danger,
                      color: '#fff',
                      boxShadow: `3px 3px 0px ${COLORS.dangerHover}`,
                      '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: 'none' },
                    }}
                  >
                    Process Erasure
                  </Button>
                )}
              </Stack>
              )}
          </Box>
        </Box>
    </Box>

    {/* RA 10173 §18 — Consent Withdrawal Banner (Step 6.2)
        Shown when the client explicitly withdrew consent via the mobile app.
        Takes priority: the generic deletionRequested button is hidden above. */}
    {showConsentWithdrawalBanner && (
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 4,
        py: 1.5,
        bgcolor: COLORS.dangerSurface,
        borderBottom: `2px solid ${COLORS.danger}`,
        borderLeft: `4px solid ${COLORS.danger}`,
        gap: 2,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <GppBadIcon sx={{ color: COLORS.danger, fontSize: 22 }} />
          <Box>
            <Typography sx={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: '0.75rem',
              color: COLORS.danger,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              lineHeight: 1.2,
            }}>
              Consent Withdrawn
            </Typography>
            <Typography sx={{
              fontFamily: FONT,
              ...TYPE.meta,
              color: COLORS.danger,
              mt: 0.25,
            }}>
              This client has exercised their RA 10173 right to withdraw consent. Process data erasure within 30 days.
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<DeleteForeverIcon />}
          onClick={onProcessErasure}
          size="small"
          sx={{
            fontFamily: FONT,
            fontWeight: 800,
            borderRadius: 0,
            bgcolor: COLORS.danger,
            color: '#fff',
            flexShrink: 0,
            boxShadow: `3px 3px 0px ${COLORS.dangerHover}`,
            '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: 'none' },
          }}
        >
          Process Erasure
        </Button>
      </Box>
    )}
    </>
  );
}