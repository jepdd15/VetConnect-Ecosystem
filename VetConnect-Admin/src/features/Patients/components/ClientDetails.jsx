import React from 'react';
import { Box, Typography, Paper, IconButton, Button, TextField, MenuItem, Divider, Switch } from '@mui/material';
import Grid from '@mui/material/Grid';

// Icons
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import CakeIcon from '@mui/icons-material/Cake';
import HomeIcon from '@mui/icons-material/Home';
import GroupIcon from '@mui/icons-material/Group';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

// --- THE UPGRADED LEDGER ROW ---
const LedgerRow = ({ label, value, isEditing, onChange, select, children, type="text", extra, isLast }) => (
  <Box sx={{ py: 2, px: 4 }}>
    <Grid container spacing={2} alignItems={isEditing ? "center" : "flex-start"}>
      {/* THE FIX: Replaced 'item xs={...}' with 'size={{ xs: ... }}' */}
      <Grid size={{ xs: 12, sm: 4, md: 3 }}>
        <Typography variant="caption" sx={{ color: '#757575', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', pt: isEditing && type !== 'switch' ? 0.5 : 0 }}>
          {label}
        </Typography>
      </Grid>
      {/* THE FIX: Replaced 'item xs={...}' with 'size={{ xs: ... }}' */}
      <Grid size={{ xs: 12, sm: 8, md: 9 }}>
        {isEditing ? (
          type === 'switch' ? (
             <Switch checked={!!value} onChange={(e) => onChange(e.target.checked)} color="primary" />
          ) : (
            <TextField 
              select={select} fullWidth size="small" value={value || ''} 
              onChange={(e) => onChange(e.target.value)} type={type} variant="outlined" 
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 1 } }} 
            >
              {children}
            </TextField>
          )
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 24 }}>
            <Typography variant="body1" sx={{ color: type === 'switch' ? (value ? '#2E7D32' : '#D32F2F') : '#212121', fontWeight: type === 'switch' ? 'bold' : '500' }}>
              {type === 'switch' ? (value ? 'Opted In (Subscribed)' : 'Opted Out') : (value || <Typography component="span" fontStyle="italic" color="textSecondary">Not provided</Typography>)}
            </Typography>
            {extra && <Typography variant="body2" color="textSecondary" fontStyle="italic">({extra})</Typography>}
          </Box>
        )}
      </Grid>
    </Grid>
    {!isLast && <Divider sx={{ mt: 2, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.06)' }} />}
  </Box>
);

export default function ClientDetails({ editForm, setEditForm, isEditing, calculateAge }) {
  
  const handleRepChange = (idx, field, val) => {
    const reps =[...(editForm.emergencyContacts || [])];
    reps[idx][field] = val;
    setEditForm({ ...editForm, emergencyContacts: reps });
  };

  return (
    // THE FIX: Removed p: 4 to allow edge-to-edge rendering!
    <Box sx={{ bgcolor: 'transparent', pb: 10 }}>
      
      {/* --- SECTION 1: PERSONAL INFORMATION --- */}
      {/* THE FIX: Removed borderRadius, margins, and external borders. It is now a flush stripe. */}
      <Paper square elevation={0} sx={{ mb: 2, bgcolor: 'white', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <Box sx={{ bgcolor: 'rgba(21, 101, 192, 0.05)', px: 4, py: 2, borderLeft: '6px solid #1565C0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <Typography variant="subtitle2" color="#1565C0" fontWeight="900" sx={{textTransform: 'uppercase', letterSpacing: 1}}>Personal Information</Typography>
        </Box>
        <Box sx={{ py: 1 }}>
            <LedgerRow label="Full Name" value={editForm.fullName} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, fullName: val})} />
            <LedgerRow label="Date of Birth" type="date" value={editForm.dob} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, dob: val})} extra={!isEditing && calculateAge(editForm.dob)} />
            <LedgerRow label="Gender" select value={editForm.gender} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, gender: val})} isLast={true}>
                <MenuItem value="Male">Male</MenuItem>
                <MenuItem value="Female">Female</MenuItem>
                <MenuItem value="Decline">Decline to state</MenuItem>
            </LedgerRow>
        </Box>
      </Paper>

      {/* --- SECTION 2: CONTACT & ADDRESS --- */}
      <Paper square elevation={0} sx={{ mb: 2, bgcolor: 'white', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <Box sx={{ bgcolor: 'rgba(139, 69, 19, 0.05)', px: 4, py: 2, borderLeft: '6px solid #8B4513', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <Typography variant="subtitle2" color="#8B4513" fontWeight="900" sx={{textTransform: 'uppercase', letterSpacing: 1}}>Contact & Address</Typography>
        </Box>
        <Box sx={{ py: 1 }}>
            <LedgerRow label="Primary Phone" value={editForm.phone} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, phone: val})} />
            <LedgerRow label="Street / Barangay" value={editForm.address} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, address: val})} />
            <LedgerRow label="City / Municipality" value={editForm.city} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, city: val})} isLast={true} />
        </Box>
      </Paper>

      {/* --- SECTION 3: BILLING & PREFERENCES --- */}
      <Paper square elevation={0} sx={{ mb: 2, bgcolor: 'white', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <Box sx={{ bgcolor: 'rgba(46, 125, 50, 0.05)', px: 4, py: 2, borderLeft: '6px solid #2E7D32', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <Typography variant="subtitle2" color="#2E7D32" fontWeight="900" sx={{textTransform: 'uppercase', letterSpacing: 1}}>Billing & Account Preferences</Typography>
        </Box>
        <Box sx={{ py: 1 }}>
            <LedgerRow label="Senior Citizen / PWD ID" value={editForm.seniorId} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, seniorId: val})} extra="Used for automatic POS discounts" />
            <LedgerRow label="Marketing Promos" type="switch" value={editForm.allowPromos} isEditing={isEditing} onChange={(val)=>setEditForm({...editForm, allowPromos: val})} isLast={true} />
        </Box>
      </Paper>

      {/* --- SECTION 4: AUTHORIZED REPRESENTATIVES --- */}
      <Paper square elevation={0} sx={{ bgcolor: 'white', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <Box sx={{ bgcolor: 'rgba(211, 47, 47, 0.05)', px: 4, py: 2, borderLeft: '6px solid #D32F2F', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" color="#D32F2F" fontWeight="900" sx={{textTransform: 'uppercase', letterSpacing: 1}}>Authorized Representatives</Typography>
          {isEditing && (
             <Button size="small" variant="contained" color="error" startIcon={<AddCircleOutlineIcon/>} onClick={()=>setEditForm({...editForm, emergencyContacts:[...(editForm.emergencyContacts || []), {name:'', phone:'', relation:''}]})} sx={{fontWeight: 'bold', boxShadow: 0}}>
               Add Contact
             </Button>
          )}
        </Box>
        <Box sx={{ px: 4, py: 2 }}>
          {editForm.emergencyContacts && editForm.emergencyContacts.length > 0 ? (
            editForm.emergencyContacts.map((rep, i) => (
              <Box key={i} sx={{ py: 2, position: 'relative' }}>
                <Typography variant="caption" fontWeight="bold" color="textSecondary" sx={{ mb: 1.5, display: 'block' }}>CONTACT #{i + 1}</Typography>
                
                <Grid container spacing={2} alignItems="center">
                  {/* THE FIX: Replaced 'item xs={...}' with 'size={{ xs: ... }}' */}
                  <Grid size={{ xs: 12, md: 4 }}><TextField label="Name" fullWidth size="small" value={rep.name} onChange={(e)=>handleRepChange(i, 'name', e.target.value)} disabled={!isEditing} sx={{ '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: '#212121' } }} /></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><TextField label="Phone" fullWidth size="small" value={rep.phone} onChange={(e)=>handleRepChange(i, 'phone', e.target.value)} disabled={!isEditing} sx={{ '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: '#212121' } }} /></Grid>
                  <Grid size={{ xs: 12, md: isEditing ? 3 : 4 }}><TextField label="Relation" fullWidth size="small" value={rep.relation} onChange={(e)=>handleRepChange(i, 'relation', e.target.value)} disabled={!isEditing} sx={{ '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: '#212121' } }} /></Grid>
                  
                  {isEditing && (
                    <Grid size={{ xs: 12, md: 1 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <IconButton color="error" onClick={()=>{const r=[...editForm.emergencyContacts]; r.splice(i,1); setEditForm({...editForm, emergencyContacts:r})}}>
                            <DeleteIcon />
                        </IconButton>
                    </Grid>
                  )}
                </Grid>
                {i !== editForm.emergencyContacts.length - 1 && <Divider sx={{ mt: 3, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.06)' }} />}
              </Box>
            ))
          ) : (
            <Box sx={{ py: 4, textAlign: 'center' }}>
                <VerifiedUserIcon sx={{ fontSize: 40, color: '#D32F2F', opacity: 0.2, mb: 1 }} />
                <Typography variant="body2" color="textSecondary" fontStyle="italic">No authorized emergency contacts on file.</Typography>
            </Box>
          )}
        </Box>
      </Paper>
      
    </Box>
  );
}