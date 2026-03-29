import React from 'react';
import { Box, Typography, Avatar, Chip, Button, Stack, Divider } from '@mui/material';

// Icons
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelIcon from '@mui/icons-material/Cancel';

export default function ClientHeader({ client, balance, isEditing, onEdit, onCancel, onSave }) {
  const hasDebt = balance > 0;

  return (
    // THE FIX: Stripped the <Paper> component. Used a pure <Box> with zero margin/padding to make it perfectly flush.
    <Box sx={{ 
        px: 4, py: 2.5, 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        bgcolor: isEditing ? 'rgba(227, 242, 253, 0.95)' : 'white', 
        borderBottom: isEditing ? '3px solid #2196F3' : '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
    }}>
        
        {/* LEFT SIDE: HIGH DENSITY IDENTITY */}
        <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'center', flex: 1 }}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: '#5D4037', fontSize: 28, fontWeight: '900', boxShadow: 2 }}>
              {client.fullName ? client.fullName[0].toUpperCase() : '?'}
            </Avatar>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {/* Row 1: Name and Tags */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Typography variant="h5" fontWeight="900" color="#3E2723" sx={{ letterSpacing: -0.5, lineHeight: 1 }}>
                      {client.fullName}
                  </Typography>
                  <Chip label={client.clientTag || 'Regular'} size="small" color={client.clientTag==='VIP'?'warning':client.clientTag==='Bad Payer'?'error':'default'} variant={client.clientTag==='Regular' ? 'outlined' : 'filled'} sx={{fontWeight: 'bold', height: 22, fontSize: '0.7rem'}} />
                  {client.seniorId && <Chip label="SC/PWD" size="small" color="secondary" sx={{fontWeight: 'bold', height: 22, fontSize: '0.7rem'}} />}
                </Box>

                {/* Row 2: Contacts */}
                {!isEditing && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, color: '#555', mt: 0.5 }}>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: '600' }}>
                      <PhoneIcon sx={{fontSize: 16, color: '#1565C0'}}/> {client.phone}
                    </Typography>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <EmailIcon sx={{fontSize: 16, color: '#888'}}/> {client.email || 'No email provided'}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" sx={{ ml: 1, fontStyle: 'italic', borderLeft: '1px solid #ccc', pl: 2.5 }}>
                      Client Since: {client.createdAt ? new Date(client.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </Typography>
                  </Box>
                )}
            </Box>
        </Box>
        
        {/* RIGHT SIDE: INTEGRATED FINANCIALS & ACTIONS */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px dashed #ccc', pl: 4 }}>
          
          <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="textSecondary" fontWeight="bold" sx={{ display: 'block', mb: -0.5, textTransform: 'uppercase' }}>Total Outstanding</Typography>
              <Typography variant="h5" color={hasDebt ? "#D32F2F" : "#2E7D32"} fontWeight="900" sx={{ letterSpacing: -0.5 }}>
                  ₱{balance.toFixed(2)}
              </Typography>
              {hasDebt ? (
                  <Typography variant="caption" color="error" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                      <WarningAmberIcon sx={{fontSize: 16}}/> Payment Due
                  </Typography>
              ) : (
                  <Typography variant="caption" color="success.main" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                      <CheckCircleOutlineIcon sx={{fontSize: 16}}/> Good Standing
                  </Typography>
              )}
          </Box>

          <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

          <Box>
              {isEditing ? (
              <Stack direction="row" spacing={1}>
                  <Button variant="contained" color="success" onClick={onSave} sx={{fontWeight: 'bold', py: 1}} startIcon={<SaveIcon />}>Save</Button>
                  <Button variant="outlined" color="error" onClick={onCancel} sx={{fontWeight: 'bold', py: 1}} startIcon={<CancelIcon />}>Cancel</Button>
              </Stack>
              ) : (
              <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit} sx={{borderColor: '#ccc', color: '#555', '&:hover':{borderColor: '#8B4513', color: '#8B4513', bgcolor: '#FFF8E1'}, bgcolor: 'white', fontWeight: 'bold', py: 1, px: 2}}>
                  Edit Profile
              </Button>
              )}
          </Box>
        </Box>
    </Box>
  );
}