import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Grid, Box, Typography, Checkbox, FormControlLabel, MenuItem } from '@mui/material';
import { collection, addDoc, doc, setDoc, Timestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import { isValidPHPhone } from '../../../utils/phoneValidation';
import { useUser } from '../../../context/UserContext';

// Icons
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SaveIcon from '@mui/icons-material/Save';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import GavelIcon from '@mui/icons-material/Gavel';

export default function NewClientModal({ open, onClose }) {
  const { profile } = useUser();
  const [form, setForm] = useState({
    fullName: '', phone: '', email: '',
    address: '', city: '',
  });
  const [referral, setReferral] = useState({ source: '', referredBy: '' });

  const REFERRAL_SOURCES = ['Walk-by', 'Facebook', 'Google', 'Referral', 'Returning', 'Vet Referral', 'Other'];
  const REFERRAL_NEEDS_NAME = ['Referral', 'Vet Referral'];
  const [emergencyContacts, setEmergencyContacts] = useState([{ name: '', phone: '', relation: '' }]);
  const updateEC = (idx, field, val) => setEmergencyContacts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));
  const addEC = () => setEmergencyContacts(prev => [...prev, { name: '', phone: '', relation: '' }]);
  const removeEC = (idx) => setEmergencyContacts(prev => prev.filter((_, i) => i !== idx));
  const [dpaConsent, setDpaConsent] = useState(false);
  const [waiverConsent, setWaiverConsent] = useState(false);
  const [allowPromos, setAllowPromos] = useState(false);
  const [preferredComm, setPreferredComm] = useState('SMS');
  const [dpaPolicy, setDpaPolicy] = useState(null);
  const [waiverPolicy, setWaiverPolicy] = useState(null);
  const [viewingPolicy, setViewingPolicy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState([]);
  const [showDupeWarning, setShowDupeWarning] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [dpaSnap, waiverSnap] = await Promise.all([
          getDocs(query(collection(db, 'consent_versions'), where('type', '==', 'dpa'), where('status', '==', 'active'), limit(1))),
          getDocs(query(collection(db, 'consent_versions'), where('type', '==', 'waiver'), where('status', '==', 'active'), limit(1))),
        ]);
        if (!dpaSnap.empty) {
          const d = dpaSnap.docs[0];
          setDpaPolicy({ versionNumber: d.data().versionNumber, versionDocId: d.id, title: d.data().title, bodyText: d.data().bodyText || '' });
        }
        if (!waiverSnap.empty) {
          const w = waiverSnap.docs[0];
          setWaiverPolicy({ versionNumber: w.data().versionNumber, versionDocId: w.id, title: w.data().title, bodyText: w.data().bodyText || '' });
        }
      } catch (err) {
        console.warn('[NewClientModal] Failed to fetch consent policies:', err.message);
      }
    })();
  }, [open]);

  const resetForms = () => {
    setForm({ fullName: '', phone: '', email: '', address: '', city: '' });
    setReferral({ source: '', referredBy: '' });
    setEmergencyContacts([{ name: '', phone: '', relation: '' }]);
    setDpaConsent(false);
    setWaiverConsent(false);
    setAllowPromos(false);
    setPreferredComm('SMS');
    setError('');
    setDuplicates([]);
    setShowDupeWarning(false);
  };

  const handleSave = async (forceCreate = false) => {
    // Validation
    if (!form.fullName.trim()) { setError('Client name is required.'); return; }
    if (!form.phone.trim()) { setError('Phone number is required.'); return; }

    for (let i = 0; i < emergencyContacts.length; i++) {
      const c = emergencyContacts[i];
      if (c.name?.trim() && !c.phone?.trim()) {
        setError(`Emergency contact #${i + 1}: phone is required when name is provided.`);
        return;
      }
      if (c.phone?.trim() && !isValidPHPhone(c.phone)) {
        setError(`Emergency contact #${i + 1}: phone must be a valid PH number (09XXXXXXXXX).`);
        return;
      }
    }

    // Duplicate phone check — skip if staff already confirmed via override
    if (!forceCreate) {
      setSaving(true);
      try {
        const phoneQ = query(
          collection(db, 'users'),
          where('phone', '==', form.phone.trim()),
          where('role', '==', 'pet_owner'),
        );
        const phoneSnap = await getDocs(phoneQ);
        if (!phoneSnap.empty) {
          setDuplicates(phoneSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          setShowDupeWarning(true);
          setSaving(false);
          return;
        }
      } catch (err) {
        setSaving(false);
        setError('Phone check failed: ' + err.message);
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      // 1. Create the owner document
      const ownerPayload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        referral: { source: referral.source || null, referredBy: referral.referredBy || null },
        referralSource: referral.source || null,
        referredBy: referral.referredBy || null,
        role: 'pet_owner',
        accountStatus: 'admin_registered',   // no Firebase Auth account — guest-client pattern
        staffNotes: [],
        emergencyContacts: emergencyContacts.filter((c, i) => i === 0 || c.name?.trim() || c.phone?.trim()),
        emergencyName: emergencyContacts[0]?.name?.trim() || null,
        emergencyPhone: emergencyContacts[0]?.phone?.trim() || null,
        allowPromos,
        preferredComm: allowPromos ? preferredComm : 'SMS',
        ...(dpaPolicy && dpaConsent ? {
          consentVersion: dpaPolicy.versionNumber,
          consentGrantedAt: Timestamp.now(),
          dpaConsent: true,
        } : {}),
        ...(waiverPolicy && waiverConsent ? {
          waiverVersion: waiverPolicy.versionNumber,
          waiverGrantedAt: Timestamp.now(),
          waiverSigned: true,
        } : {}),
        createdAt: Timestamp.now(),
      };
      const ownerRef = await addDoc(collection(db, 'users'), ownerPayload);
      const now = Timestamp.now();
      const witnessedBy = profile?.fullName || profile?.email || 'Staff';

      if (dpaPolicy && dpaConsent) {
        await setDoc(doc(collection(db, 'users', ownerRef.id, 'consent_records')), {
          consentType: 'dpa',
          versionNumber: dpaPolicy.versionNumber,
          versionDocId: dpaPolicy.versionDocId,
          action: 'granted',
          signatureType: 'checkbox',
          signatureData: null,
          grantedAt: now,
          grantedVia: 'admin-registration',
          deviceInfo: 'admin-dashboard',
          adminNote: `Consent witnessed by ${witnessedBy} during client registration.`,
        });
      }
      if (waiverPolicy && waiverConsent) {
        await setDoc(doc(collection(db, 'users', ownerRef.id, 'consent_records')), {
          consentType: 'waiver',
          versionNumber: waiverPolicy.versionNumber,
          versionDocId: waiverPolicy.versionDocId,
          action: 'granted',
          signatureType: 'checkbox',
          signatureData: null,
          grantedAt: now,
          grantedVia: 'admin-registration',
          deviceInfo: 'admin-dashboard',
          adminNote: `Waiver witnessed by ${witnessedBy} during client registration.`,
        });
      }

      resetForms();
      onClose(true); // true = saved
    } catch (err) {
      console.error('Error creating client:', err);
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => { resetForms(); onClose(false); }} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, overflow: 'hidden' } }}>
      <DialogTitle sx={{ bgcolor: COLORS.cream, color: COLORS.brand, fontFamily: FONT, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `2px solid ${COLORS.accent}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>
        <PersonAddIcon /> Register New Client
      </DialogTitle>
      <DialogContent sx={{ bgcolor: COLORS.cardBg, p: 3 }}>
        <Box sx={{ mt: 1 }}>
          {/* OWNER INFO */}
          <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.accent, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5 }}>
            Client Information
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField autoFocus label="Full Name" fullWidth size="small" required
                value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})}
                error={!!error && !form.fullName.trim()} helperText={!form.fullName.trim() && error ? 'Required' : ''}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Phone Number" fullWidth size="small" required
                value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})}
                error={!!error && !form.phone.trim()} helperText={!form.phone.trim() && error ? 'Required' : ''}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Email (Optional)" fullWidth size="small"
                value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Street / Barangay (Optional)" fullWidth size="small"
                value={form.address} onChange={(e) => setForm({...form, address: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="City / Municipality (Optional)" fullWidth size="small"
                value={form.city} onChange={(e) => setForm({...form, city: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }} />
            </Grid>
            {/* T4.208: Referral source — structured chip selector */}
            <Grid size={{ xs: 12, md: REFERRAL_NEEDS_NAME.includes(referral.source) ? 6 : 12 }}>
              <TextField
                label="How did they hear about us? (Optional)"
                fullWidth size="small" select
                value={referral.source}
                onChange={(e) => {
                  const src = e.target.value;
                  setReferral({ source: src, referredBy: REFERRAL_NEEDS_NAME.includes(src) ? referral.referredBy : '' });
                }}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }}
              >
                <MenuItem value="">— None —</MenuItem>
                {REFERRAL_SOURCES.map(src => (
                  <MenuItem key={src} value={src} sx={{ fontWeight: 700 }}>{src}</MenuItem>
                ))}
              </TextField>
            </Grid>
            {REFERRAL_NEEDS_NAME.includes(referral.source) && (
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Referred by (name)"
                  fullWidth size="small"
                  placeholder="Name of referring client or vet"
                  value={referral.referredBy}
                  onChange={(e) => setReferral(prev => ({ ...prev, referredBy: e.target.value }))}
                  sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }}
                />
              </Grid>
            )}
          </Grid>

          {/* EMERGENCY CONTACT (Optional) */}
          <Box sx={{ my: 2.5, borderTop: `2px solid ${COLORS.borderLight}` }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <ContactPhoneIcon sx={{ fontSize: 16, color: COLORS.accent }} />
            <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.accent, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Emergency Contacts (Optional)
            </Typography>
          </Box>
          {emergencyContacts.map((ec, idx) => (
            <Box key={idx} sx={{ mb: idx < emergencyContacts.length - 1 ? 2 : 0 }}>
              {idx > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 800, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                    Contact #{idx + 1}
                  </Typography>
                  <Button size="small" onClick={() => removeEC(idx)}
                    sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.6rem', color: COLORS.danger, borderRadius: 0, textTransform: 'uppercase', minWidth: 0 }}>
                    Remove
                  </Button>
                </Box>
              )}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 5 }}>
                  <TextField label={idx === 0 ? 'Emergency Contact Name' : 'Name'} fullWidth size="small"
                    value={ec.name} onChange={(e) => updateEC(idx, 'name', e.target.value)}
                    sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField label="Phone" fullWidth size="small"
                    value={ec.phone} onChange={(e) => updateEC(idx, 'phone', e.target.value)}
                    helperText="09XXXXXXXXX"
                    sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }} />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField label="Relation" fullWidth size="small" select
                    value={ec.relation} onChange={(e) => updateEC(idx, 'relation', e.target.value)}
                    sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }}>
                    <MenuItem value="">—</MenuItem>
                    {['Spouse', 'Parent', 'Sibling', 'Child', 'Relative', 'Friend', 'Caretaker', 'Other'].map(r => (
                      <MenuItem key={r} value={r} sx={{ fontWeight: 700 }}>{r}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
            </Box>
          ))}
          <Button size="small" onClick={addEC}
            sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.7rem', color: COLORS.sky, borderRadius: 0, textTransform: 'uppercase', letterSpacing: 0.5, mt: 1 }}>
            + Add Another Contact
          </Button>

          {/* LEGAL CONSENT */}
          {(dpaPolicy || waiverPolicy) && (
            <>
              <Box sx={{ my: 2.5, borderTop: `2px solid ${COLORS.borderLight}` }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <GavelIcon sx={{ fontSize: 16, color: COLORS.accent }} />
                <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.accent, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Legal Consent
                </Typography>
              </Box>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, mb: 1, fontStyle: 'italic' }}>
                Staff witnesses client consent during registration. Formal signed consent can be recorded later via the client profile.
              </Typography>
              {dpaPolicy && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.5 }}>
                  <FormControlLabel
                    control={<Checkbox checked={dpaConsent} onChange={(e) => setDpaConsent(e.target.checked)} sx={{ color: COLORS.sky, '&.Mui-checked': { color: COLORS.sky }, p: 0.5 }} />}
                    label={<Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 600, color: COLORS.textPrimary }}>Client agrees to the Data Privacy Policy (RA 10173)</Typography>}
                    sx={{ ml: 0, flex: 1 }}
                  />
                  <Button size="small" onClick={() => setViewingPolicy(dpaPolicy)}
                    sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem', color: COLORS.sky, borderRadius: 0, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', mt: 0.25 }}>
                    View Policy
                  </Button>
                </Box>
              )}
              {waiverPolicy && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.5 }}>
                  <FormControlLabel
                    control={<Checkbox checked={waiverConsent} onChange={(e) => setWaiverConsent(e.target.checked)} sx={{ color: COLORS.sky, '&.Mui-checked': { color: COLORS.sky }, p: 0.5 }} />}
                    label={<Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 600, color: COLORS.textPrimary }}>Client agrees to the Liability Waiver</Typography>}
                    sx={{ ml: 0, flex: 1 }}
                  />
                  <Button size="small" onClick={() => setViewingPolicy(waiverPolicy)}
                    sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem', color: COLORS.sky, borderRadius: 0, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', mt: 0.25 }}>
                    View Waiver
                  </Button>
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.5 }}>
                <FormControlLabel
                  control={<Checkbox checked={allowPromos} onChange={(e) => setAllowPromos(e.target.checked)} sx={{ color: COLORS.sky, '&.Mui-checked': { color: COLORS.sky }, p: 0.5 }} />}
                  label={<Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 600, color: COLORS.textPrimary }}>Client agrees to receive SMS or email promos and announcements</Typography>}
                  sx={{ ml: 0, flex: 1 }}
                />
              </Box>
              {allowPromos && (
                <Box sx={{ ml: 4, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 800, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                    Preferred:
                  </Typography>
                  <TextField select size="small" value={preferredComm} onChange={(e) => setPreferredComm(e.target.value)}
                    sx={{ width: 120, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0, fontSize: '0.8rem' } }}>
                    <MenuItem value="SMS" sx={{ fontWeight: 700 }}>SMS</MenuItem>
                    <MenuItem value="Email" sx={{ fontWeight: 700 }}>Email</MenuItem>
                  </TextField>
                </Box>
              )}
              {!dpaConsent && !waiverConsent && (
                <Box sx={{ bgcolor: COLORS.kpiBlueBg, border: `1px solid ${COLORS.kpiBlueBorder}`, borderRadius: 0, px: 2, py: 1, mt: 1 }}>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.info }}>
                    Consent is optional during registration. Use "Record Consent" on the client profile for formal signed consent if needed.
                  </Typography>
                </Box>
              )}
            </>
          )}

          {error && form.fullName.trim() && form.phone.trim() && (
            <Typography sx={{ fontFamily: FONT, color: COLORS.danger, fontSize: '0.8rem', mt: 2, fontWeight: 600 }}>{error}</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}`, gap: 1 }}>
        <Button onClick={() => { resetForms(); onClose(false); }} sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textMuted, borderRadius: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cancel</Button>
        <Button onClick={() => handleSave(false)} variant="contained" disabled={saving} startIcon={<SaveIcon />}
          sx={{ fontFamily: FONT, fontWeight: 900, bgcolor: COLORS.accent, borderRadius: 0, border: `2px solid ${COLORS.brand}`, px: 3, textTransform: 'uppercase', letterSpacing: 0.5, boxShadow: `4px 4px 0px ${COLORS.brand}22`, '&:hover': { bgcolor: COLORS.brand } }}>
          {saving ? 'Registering...' : 'Register Client'}
        </Button>
      </DialogActions>

      {/* Duplicate Phone Warning */}
      <Dialog open={showDupeWarning} onClose={() => setShowDupeWarning(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 0 } }}>
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.warning }}>
          Possible Duplicate Client
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', mb: 2 }}>
            A client with phone number <strong>{form.phone}</strong> already exists:
          </Typography>
          {duplicates.map(d => (
            <Box key={d.id} sx={{ p: 1.5, mb: 1, bgcolor: COLORS.surfaceAlt, border: `1px solid ${COLORS.borderLight}` }}>
              <Typography sx={{ fontFamily: FONT, fontWeight: 700 }}>{d.fullName}</Typography>
              <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted }}>{d.phone}</Typography>
            </Box>
          ))}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setShowDupeWarning(false)} sx={{ fontFamily: FONT, color: COLORS.textMuted }}>
            Go Back
          </Button>
          <Button
            variant="contained"
            onClick={() => { setShowDupeWarning(false); handleSave(true); }}
            sx={{ fontFamily: FONT, bgcolor: COLORS.warning, fontWeight: 'bold', '&:hover': { bgcolor: COLORS.ctaHover } }}
          >
            Create Anyway
          </Button>
        </DialogActions>
      </Dialog>

      {/* Policy Viewer Dialog */}
      <Dialog open={!!viewingPolicy} onClose={() => setViewingPolicy(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, overflow: 'hidden' } }}>
        <DialogTitle sx={{ bgcolor: COLORS.cream, color: COLORS.brand, fontFamily: FONT, fontWeight: 900, borderBottom: `2px solid ${COLORS.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GavelIcon sx={{ fontSize: 20 }} />
            <span>{viewingPolicy?.title || 'Policy'}</span>
          </Box>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700, color: COLORS.textMuted }}>
            Version {viewingPolicy?.versionNumber || '—'}
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: COLORS.cardBg, p: 3, maxHeight: '60vh' }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textPrimary, lineHeight: 1.8, whiteSpace: 'pre-line', mt: 1 }}>
            {viewingPolicy?.bodyText || 'Policy text not available.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
          <Button onClick={() => setViewingPolicy(null)} variant="contained"
            sx={{ fontFamily: FONT, fontWeight: 900, bgcolor: COLORS.accent, borderRadius: 0, border: `2px solid ${COLORS.brand}`, px: 4, textTransform: 'uppercase', letterSpacing: 0.5, '&:hover': { bgcolor: COLORS.brand } }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
