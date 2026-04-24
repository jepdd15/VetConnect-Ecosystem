import React from 'react';
import { Box, Typography, IconButton, Button, TextField, MenuItem, Divider, Switch } from '@mui/material';
import Grid from '@mui/material/Grid';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

// Icons
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

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
            sx={{ bgcolor: COLORS.formBg, '& .MuiOutlinedInput-root': { borderRadius: 1, fontFamily: FONT } }} 
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

export default function ClientDetails({ editForm, setEditForm, isEditing, calculatePetAge }) {
  
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
         <DataField label="Client Tag" select value={editForm.clientTag} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, clientTag: val})}>
             <MenuItem value="VIP">VIP</MenuItem>
             <MenuItem value="Regular">Regular</MenuItem>
             <MenuItem value="New">New</MenuItem>
             <MenuItem value="Rescue/Shelter">Rescue / Shelter</MenuItem>
         </DataField>
         <DataField label="Lead Source" select value={editForm.referralSource} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, referralSource: val})}>
             <MenuItem value="Walk-in">Walk-in</MenuItem>
             <MenuItem value="Google">Google / Search</MenuItem>
             <MenuItem value="Social Media">Social Media</MenuItem>
             <MenuItem value="Referral">Client Referral</MenuItem>
         </DataField>
         <DataField label="Preferred Comm Method" select value={editForm.preferredComm} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, preferredComm: val})}>
             <MenuItem value="SMS">SMS / Text</MenuItem>
             <MenuItem value="Email">Email</MenuItem>
             <MenuItem value="Voice Call">Voice Call</MenuItem>
         </DataField>
         <DataField label="WhatsApp Opt-In" type="switch" value={editForm.whatsappOptIn} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, whatsappOptIn: val})} />
         <DataField label="Marketing Promos" type="switch" value={editForm.allowPromos} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, allowPromos: val})} />
      </Grid>

      {/* SECTION: LEGAL & COMPLIANCE */}
      <SectionHeader title="Legal & Compliance" />
      <Grid container spacing={2}>
         <DataField label="DPA 2012 Consent" type="switch" value={editForm.dpaConsent} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, dpaConsent: val})} extra="Signed Data Privacy Act" />
         <DataField label="Liability Waiver" type="switch" value={editForm.waiverSigned} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, waiverSigned: val})} extra="Physical signature on file" />
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
          <Box key={i} sx={{ py: 1, position: 'relative', bgcolor: COLORS.formBg, p: 2, borderRadius: 2, mb: 2, border: `1px solid ${COLORS.borderLight}` }}>
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