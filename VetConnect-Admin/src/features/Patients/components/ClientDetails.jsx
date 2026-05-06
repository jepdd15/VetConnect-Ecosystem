import React, { useState } from 'react';
import {
  Box, Typography, IconButton, Button, TextField, MenuItem, Divider, Switch,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
} from '@mui/material';
import Grid from '@mui/material/Grid';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

// Icons
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import GppGoodIcon from '@mui/icons-material/GppGood';
import GppBadIcon from '@mui/icons-material/GppBad';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';

// Consent hooks, constants, and dialog
import { useConsentPolicy } from '../../../hooks/useConsentPolicy';
import { CONSENT_TYPES } from '../../../utils/consentConstants';
import ConsentRecordDialog from '../modals/ConsentRecordDialog';

// ---------------------------------------------------------------------------
// Consent Status Card
// ---------------------------------------------------------------------------

/**
 * Renders a rich consent status card for a single consent type (DPA or Waiver).
 *
 * Four states:
 *   - consented + current        → green chip with version/date + view signature button
 *   - consented + outdated       → orange chip with version delta note + re-consent nudge
 *   - not consented              → red chip + "Record Consent" button
 *   - admin_registered + no consent → neutral muted chip (no mobile account, admin-record path only)
 */
function ConsentStatusCard({ label, clientId, clientName, clientVersion, clientGrantedAt, activeVersion, activeVersionDocId, consentType, accountStatus, onConsentRecorded }) {
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : null);
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isAdminRegistered = accountStatus === 'admin_registered';
  const hasConsent = clientVersion != null;
  const isOutdated = hasConsent && activeVersion != null && clientVersion < activeVersion;
  const isCurrent = hasConsent && !isOutdated;

  // Admin-registered clients with no consent yet get a neutral "pending" chip instead
  // of the red NO CONSENT chip — they have no mobile account so the mobile consent gate
  // is not applicable; the admin "Record Consent" button is their only path.
  const isPendingNoAccount = isAdminRegistered && !hasConsent;

  let chipLabel = '';
  let chipBg = '';
  let chipTextColor = COLORS.cardBg;
  let chipIcon = null;

  if (isCurrent) {
    chipLabel = `${label} v${clientVersion} — Signed ${formatDate(clientGrantedAt)}`;
    chipBg = COLORS.success;
    chipIcon = <GppGoodIcon sx={{ fontSize: '0.85rem !important', color: `${COLORS.cardBg} !important` }} />;
  } else if (isOutdated) {
    chipLabel = `${label} v${clientVersion} — Needs re-consent (current: v${activeVersion})`;
    chipBg = COLORS.warning;
    chipIcon = <GppMaybeIcon sx={{ fontSize: '0.85rem !important', color: `${COLORS.cardBg} !important` }} />;
  } else if (isPendingNoAccount) {
    chipLabel = `Pending — No mobile account`;
    chipBg = COLORS.accentLight;
    chipIcon = <GppMaybeIcon sx={{ fontSize: '0.85rem !important', color: `${COLORS.cardBg} !important` }} />;
  } else {
    chipLabel = `NO ${label.toUpperCase()} CONSENT`;
    chipBg = COLORS.danger;
    chipIcon = <GppBadIcon sx={{ fontSize: '0.85rem !important', color: `${COLORS.cardBg} !important` }} />;
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      <Chip
        icon={chipIcon}
        label={chipLabel}
        size="small"
        sx={{
          bgcolor: chipBg,
          color: chipTextColor,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: '0.72rem',
          borderRadius: 0,
          height: 24,
          '& .MuiChip-label': { px: 1 },
          '& .MuiChip-icon': { ml: 0.75 },
        }}
      />

      {/* View signature button — only when a signature might exist */}
      {hasConsent && (
        <Tooltip title="View consent record details">
          <IconButton
            size="small"
            onClick={() => setSigDialogOpen(true)}
            sx={{
              color: COLORS.textMuted,
              width: 22,
              height: 22,
              '&:hover': { color: COLORS.accent, bgcolor: COLORS.panelBg },
            }}
          >
            <VisibilityIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}

      {/* Record Consent button — only when no consent or outdated */}
      {(!hasConsent || isOutdated) && (
        <Button
          size="small"
          variant="outlined"
          onClick={() => setRecordDialogOpen(true)}
          sx={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: '0.68rem',
            textTransform: 'none',
            borderRadius: 0,
            color: COLORS.accent,
            borderColor: COLORS.border,
            py: 0.25,
            px: 1,
            '&:hover': { borderColor: COLORS.accentLight, bgcolor: COLORS.panelBg },
          }}
        >
          Record Consent
        </Button>
      )}

      {/* ── Consent record info dialog ── */}
      <Dialog
        open={sigDialogOpen}
        onClose={() => setSigDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0 } }}
      >
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.brand, bgcolor: COLORS.cream, borderBottom: `1px solid ${COLORS.border}` }}>
          {label} Consent — v{clientVersion}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary }}>
            Signed: <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>{formatDate(clientGrantedAt)}</span>
          </Typography>
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Version: <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>v{clientVersion}</span>
            {isOutdated && (
              <span style={{ color: COLORS.warning, marginLeft: 8 }}>
                (Current policy: v{activeVersion} — re-consent required)
              </span>
            )}
          </Typography>
          <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted, mt: 1.5, fontStyle: 'italic' }}>
            View full signature history and details in the Consent Audit Log below.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button onClick={() => setSigDialogOpen(false)} sx={{ fontFamily: FONT, fontWeight: 700, textTransform: 'none', color: COLORS.textSecondary }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── ConsentRecordDialog — record consent on behalf of client ── */}
      <ConsentRecordDialog
        open={recordDialogOpen}
        onClose={() => setRecordDialogOpen(false)}
        clientId={clientId}
        clientName={clientName}
        consentType={consentType}
        activeVersion={activeVersion}
        activeVersionDocId={activeVersionDocId}
        onSuccess={onConsentRecorded}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// DataField — vertical stack, ultra-high density Enterprise Layout
// ---------------------------------------------------------------------------

// Vertical Stack DataField for ultra-high density Enterprise Layout
const DataField = ({ label, value, isEditing, onChange, select, children, type="text", extra, width={ xs: 12, sm: 6, md: 3 } }) => (
  <Grid size={width} sx={{ mb: isEditing ? 2 : 2.5 }}>
    <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, display: 'block', lineHeight: 1.2, mb: 0.5 }}>
      {label}
    </Typography>
    {isEditing ? (
      <Box>
        {type === 'switch' ? (
           <Switch checked={!!value} onChange={(e) => onChange(e.target.checked)} color="primary" size="small" sx={{ ml: -1 }} />
        ) : (
          <TextField 
            select={select} fullWidth size="small" value={value || ''} 
            onChange={(e) => onChange(e.target.value)} type={type} variant="outlined" 
            sx={{ bgcolor: COLORS.formBg, '& .MuiOutlinedInput-root': { borderRadius: 0, fontFamily: FONT } }} 
          >
            {children}
          </TextField>
        )}
        {extra && type !== 'switch' && <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, display: 'block', mt: 0.5, fontStyle: 'italic' }}>{extra}</Typography>}
      </Box>
    ) : (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, minHeight: 20 }}>
        <Typography variant="body2" sx={{ 
            fontFamily: FONT,
            color: type === 'switch' ? (value ? COLORS.success : COLORS.danger) : (label === 'Account Standing' ? (value === 'Good Standing' ? COLORS.success : COLORS.danger) : COLORS.textPrimary), 
            fontWeight: type === 'switch' || label === 'Account Standing' ? 900 : 600,
            fontSize: '0.85rem'
        }}>
          {type === 'switch' ? (value ? 'YES' : 'NO') : (value || <Typography component="span" variant="caption" sx={{ fontFamily: FONT, fontStyle: 'italic', color: COLORS.textMuted }}>Not provided</Typography>)}
        </Typography>
        {extra && <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, fontStyle: 'italic' }}>({extra})</Typography>}
      </Box>
    )}
  </Grid>
);

// Unified warm brown section headers
const SectionHeader = ({ title }) => (
  <Box sx={{ mt: 3, mb: 2 }}>
    <Typography variant="subtitle2" sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, fontSize: '0.8rem' }}>
      {title}
    </Typography>
    <Divider sx={{ mt: 0.5, borderColor: COLORS.border }} />
  </Box>
);

export default function ClientDetails({ editForm, setEditForm, isEditing, calculatePetAge, onConsentRecorded }) {
  // Step 5.1 (T3.5): Consent policy metadata for version comparison.
  // activeVersion lets us determine if the client's stored version is current or outdated.
  // activeVersionDocId is passed to ConsentRecordDialog so the record links to the correct version doc.
  const { activeVersion, versions } = useConsentPolicy();

  // Resolve per-type active version docs — DPA and Waiver evolve independently
  const activeDpaVersionDoc = versions.find(
    (v) => v.status === 'active' && v.type === CONSENT_TYPES.DPA
  );
  const activeWaiverVersionDoc = versions.find(
    (v) => v.status === 'active' && v.type === CONSENT_TYPES.WAIVER
  );
  const activeDpaVersionNumber = activeDpaVersionDoc?.versionNumber ?? null;
  const activeWaiverVersionNumber = activeWaiverVersionDoc?.versionNumber ?? null;

  const handleRepChange = (idx, field, val) => {
    const reps =[...(editForm.emergencyContacts || [])];
    reps[idx][field] = val;
    setEditForm({ ...editForm, emergencyContacts: reps });
  };

  return (
    <Box sx={{ p: 4, pb: 10, bgcolor: 'transparent', minHeight: '100%' }}>
      
      {/* SECTION: IDENTITY & DEMOGRAPHICS */}
      <SectionHeader title="Identity & Demographics" />
      <Grid container spacing={2}>
         <DataField label="Full Name" value={editForm.fullName} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, fullName: val})} />
         <DataField label="Date of Birth" type="date" value={editForm.dob} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, dob: val})} extra={!isEditing && calculatePetAge(editForm.dob)} />
         <DataField label="Gender" select value={editForm.gender} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, gender: val})}>
             <MenuItem value="Male">Male</MenuItem>
             <MenuItem value="Female">Female</MenuItem>
             <MenuItem value="Decline">Decline to state</MenuItem>
         </DataField>
         <DataField label="Account Standing" select value={editForm.accountStanding} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, accountStanding: val})}>
             <MenuItem value="Good Standing"><Box sx={{ color: COLORS.success, fontWeight: 'bold' }}>Good Standing</Box></MenuItem>
             <MenuItem value="Financial Warning"><Box sx={{ color: COLORS.warning, fontWeight: 'bold' }}>Financial Warning</Box></MenuItem>
             <MenuItem value="Banned / Do Not Service"><Box sx={{ color: COLORS.danger, fontWeight: 'bold' }}>Banned / Do Not Service</Box></MenuItem>
         </DataField>
      </Grid>

      {/* SECTION: GOVERNMENT VERIFICATION */}
      <SectionHeader title="Government Verification" />
      <Grid container spacing={2}>
         <DataField label="Gov ID Type" select value={editForm.govIdType} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, govIdType: val})}>
            <MenuItem value="Driver's License">Driver's License</MenuItem>
            <MenuItem value="Passport">Passport</MenuItem>
            <MenuItem value="PhilID">PhilID</MenuItem>
            <MenuItem value="Other">Other</MenuItem>
         </DataField>
         <DataField label="ID Number" value={editForm.govIdNumber} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, govIdNumber: val})} />
         <DataField label="Senior / PWD ID" value={editForm.seniorId} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, seniorId: val})} extra="For POS Discount Proof" />
      </Grid>

      {/* SECTION: CONTACT & ADDRESS */}
      <SectionHeader title="Contact & Address" />
      <Grid container spacing={2}>
         <DataField label="Primary Phone" value={editForm.phone} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, phone: val})} />
         <DataField label="Secondary Phone" value={editForm.secondaryPhone} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, secondaryPhone: val})} />
         <DataField label="Email Address" type="email" value={editForm.email} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, email: val})} />
         <DataField label="Street / Barangay" value={editForm.address} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, address: val})} width={{ xs: 12, sm: 12, md: 6 }} />
         <DataField label="City / Municipality" value={editForm.city} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, city: val})} />
      </Grid>

      {/* SECTION: MARKETING & PREFERENCES */}
      <SectionHeader title="Marketing & Preferences" />
      <Grid container spacing={2}>
         <DataField label="Lead Source" select value={editForm.referralSource} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, referralSource: val})}>
             <MenuItem value="Walk-in">Walk-in</MenuItem>
             <MenuItem value="Google">Google / Search</MenuItem>
             <MenuItem value="Social Media">Social Media</MenuItem>
             <MenuItem value="Referral">Client Referral</MenuItem>
         </DataField>
         {/* T2.136: Referred by — free-text name of referring client or source */}
         <DataField label="Referred By" value={editForm.referredBy} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, referredBy: val})} />
         <DataField label="Preferred Comm Method" select value={editForm.preferredComm} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, preferredComm: val})}>
             <MenuItem value="SMS">SMS / Text</MenuItem>
             <MenuItem value="Email">Email</MenuItem>
             <MenuItem value="Voice Call">Voice Call</MenuItem>
         </DataField>
         <DataField label="WhatsApp Opt-In" type="switch" value={editForm.whatsappOptIn} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, whatsappOptIn: val})} />
         <DataField label="Marketing Promos" type="switch" value={editForm.allowPromos} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, allowPromos: val})} />
      </Grid>

      {/* SECTION: LEGAL & COMPLIANCE */}
      {/* Step 5.1 (T3.5): Rich consent status cards replace bare boolean switches.
          ConsentStatusCard shows version, date, and status chip (green/orange/red),
          and provides a "Record Consent" action for walk-in or admin-registered clients. */}
      <SectionHeader title="Legal & Compliance" />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, display: 'block', lineHeight: 1.2, mb: 0.75 }}>
            DPA 2012 Consent
          </Typography>
          <ConsentStatusCard
            label="DPA"
            clientId={editForm.id}
            clientName={editForm.fullName}
            clientVersion={editForm.consentVersion}
            clientGrantedAt={editForm.consentGrantedAt}
            activeVersion={activeDpaVersionNumber}
            activeVersionDocId={activeDpaVersionDoc?.id || null}
            consentType={CONSENT_TYPES.DPA}
            accountStatus={editForm.accountStatus}
            onConsentRecorded={onConsentRecorded}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, display: 'block', lineHeight: 1.2, mb: 0.75 }}>
            Liability Waiver
          </Typography>
          <ConsentStatusCard
            label="Waiver"
            clientId={editForm.id}
            clientName={editForm.fullName}
            clientVersion={editForm.waiverVersion}
            clientGrantedAt={editForm.waiverGrantedAt}
            activeVersion={activeWaiverVersionNumber}
            activeVersionDocId={activeWaiverVersionDoc?.id || null}
            consentType={CONSENT_TYPES.WAIVER}
            accountStatus={editForm.accountStatus}
            onConsentRecorded={onConsentRecorded}
          />
        </Grid>
      </Grid>

      {/* SECTION: EMERGENCY CONTACTS */}
      <Box sx={{ mt: 3, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, fontSize: '0.8rem' }}>
            Authorized Representatives
          </Typography>
          <Divider sx={{ mt: 0.5, borderColor: COLORS.border }} />
        </Box>
        {isEditing && (
           <Button size="small" variant="text" startIcon={<AddCircleOutlineIcon/>} onClick={()=>setEditForm({...editForm, emergencyContacts:[...(editForm.emergencyContacts || []), {name:'', phone:'', relation:''}]})} sx={{fontFamily: FONT, fontWeight: 'bold', ml: 2, mt: -1, color: COLORS.cta}}>
             Add Contact
           </Button>
        )}
      </Box>

      {editForm.emergencyContacts && editForm.emergencyContacts.length > 0 ? (
        editForm.emergencyContacts.map((rep, i) => (
          <Box key={i} sx={{ py: 1, position: 'relative', bgcolor: COLORS.formBg, p: 2, borderRadius: 0, mb: 2, border: `1px solid ${COLORS.borderLight}` }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1, display: 'block' }}>REP #{i + 1}</Typography>
            
            <Grid container spacing={2} alignItems="center">
              <DataField label="Name" value={rep.name} isEditing={isEditing} onChange={(val)=>handleRepChange(i, 'name', val)} width={{ xs: 12, md: 4 }} />
              <DataField label="Phone" value={rep.phone} isEditing={isEditing} onChange={(val)=>handleRepChange(i, 'phone', val)} width={{ xs: 12, md: 3 }} />
              <DataField label="Relation" value={rep.relation} isEditing={isEditing} onChange={(val)=>handleRepChange(i, 'relation', val)} width={{ xs: 12, md: isEditing ? 4 : 5 }} />
              
              {isEditing && (
                <Grid size={{ xs: 12, md: 1 }} sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1 }}>
                    <IconButton size="small" sx={{ color: COLORS.danger }} onClick={()=>{const r=[...editForm.emergencyContacts]; r.splice(i,1); setEditForm({...editForm, emergencyContacts:r})}}>
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Grid>
              )}
            </Grid>
          </Box>
        ))
      ) : (
        <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.textMuted, fontStyle: 'italic', mt: 1 }}>No authorized emergency contacts on file.</Typography>
      )}

    </Box>
  );
}