import React from 'react';
import { 
  Box, Typography, Paper, Avatar, Stack, Chip, Button, 
  Grid, // Standard Grid import
  Alert // Make sure Alert is imported for the A/R warning
} from '@mui/material';

// Icons
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import PaidIcon from '@mui/icons-material/Paid';

export default function ClientHeader({ client, balance, isEditing, onEdit, onCancel, onSave }) {
  return (
    <Box sx={{ p: 4, bgcolor: '#FAFAFA', borderBottom: '1px solid #E0E0E0' }}>
      
      {balance > 0 && (
          <Alert severity="error" icon={<PaidIcon fontSize="inherit" />} sx={{ mb: 3, fontWeight: 'bold', fontSize: '1rem', alignItems: 'center', border: '1px solid #EF9A9A', py: 0 }}>
              ATTENTION: This client has an Outstanding Balance of ₱{balance.toFixed(2)}. Check the Billing Ledger tab.
          </Alert>
      )}
      
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Typography variant="caption" color="textSecondary" fontStyle="italic">
              Client Since: {client.createdAt ? new Date(client.createdAt.seconds * 1000).toLocaleDateString() : 'Legacy Record'}
          </Typography>
      </Box>

      <Paper sx={{ p: 3, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', bgcolor: isEditing ? '#E3F2FD' : 'white', border: isEditing ? '2px solid #2196F3' : '1px solid #e0e0e0', borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
          <Box sx={{ display: 'flex', gap: 3, width: '100%' }}>
              <Avatar sx={{ width: 90, height: 90, bgcolor: '#5D4037', fontSize: 40, fontWeight: 'bold', boxShadow: 2 }}>{client.fullName[0]}</Avatar>
              <Box sx={{ flex: 1 }}>
                  <Typography variant="h3" fontWeight="bold" color="#3E2723" sx={{ letterSpacing: -0.5, mb: 1 }}>{client.fullName}</Typography>
                  <Stack direction="row" spacing={1}>
                     <Chip label="PET OWNER" size="small" sx={{ bgcolor: '#E0E0E0', color: '#555', fontWeight: 'bold', borderRadius: 1 }} />
                     <Chip label={client.clientTag || 'Regular'} size="small" color={client.clientTag==='VIP'?'warning':client.clientTag==='Bad Payer'?'error':'primary'} variant={client.clientTag==='Regular' ? 'outlined' : 'filled'} sx={{fontWeight: 'bold', borderRadius: 1}} />
                     {client.seniorId && <Chip label="SC/PWD" size="small" color="secondary" sx={{fontWeight: 'bold', borderRadius: 1}} />}
                  </Stack>
                  {!isEditing && (
                    // CORRECTED GRID SYNTAX
                    <Grid container spacing={2} sx={{ mt: 1, color: '#555' }}>
                      <Grid item xs={12} md={4} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PhoneIcon fontSize="small" color="disabled"/> 
                        <Typography variant="body2" fontWeight="bold">{client.phone}</Typography>
                      </Grid>
                      <Grid item xs={12} md={8} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <EmailIcon fontSize="small" color="disabled"/> 
                        <Typography variant="body2">{client.email || 'No email provided'}</Typography>
                      </Grid>
                    </Grid>
                  )}
              </Box>
              
              <Box sx={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '1px solid #eee', pl: 3, minWidth: 200 }}>
                <Box>
                    <Typography variant="overline" color="textSecondary" fontWeight="bold">Total Outstanding</Typography>
                    <Typography variant="h6" color={balance > 0 ? "#D32F2F" : "#2E7D32"} fontWeight="bold">₱{balance.toFixed(2)}</Typography>
                    {balance === 0 && <Typography variant="caption" color="success.main" fontWeight="bold">In Good Standing</Typography>}
                </Box>
                <Box sx={{ mt: 3 }}>
                  {isEditing ? (
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button variant="outlined" color="error" size="small" onClick={onCancel}>Cancel</Button>
                      <Button variant="contained" color="success" size="small" onClick={onSave} sx={{fontWeight: 'bold'}}>Save</Button>
                    </Stack>
                  ) : (
                    <Button variant="outlined" startIcon={<EditIcon />} size="small" onClick={onEdit} sx={{borderColor: '#ccc', color: '#555', '&:hover':{borderColor: '#8B4513', color: '#8B4513'}, bgcolor: 'white', width: '100%'}}>Edit Profile</Button>
                  )}
                </Box>
              </Box>
          </Box>
      </Paper>
    </Box>
  );
}