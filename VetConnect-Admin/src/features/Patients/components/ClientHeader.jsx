import React from 'react';
import { Box, Typography, Paper, Avatar, Chip, Button, Stack, Divider } from '@mui/material';

// Icons
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

export default function ClientHeader({ client, balance, isEditing, onEdit, onCancel, onSave }) {
  const hasDebt = balance > 0;

  return (
    // THE UX FIX: Compressed Padding (p: 2 instead of p: 4), integrated Alert
    <Box sx={{ px: 3, pt: 2, pb: 0, bgcolor: 'transparent' }}>
      
      <Paper sx={{ 
          p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          bgcolor: isEditing ? 'rgba(227, 242, 253, 0.85)' : 'rgba(255, 255, 255, 0.7)', 
          backdropFilter: 'blur(12px)',
          border: isEditing ? '2px solid #2196F3' : '1px solid rgba(0,0,0,0.08)', 
          borderRadius: 2, boxShadow: '0 4px 15px rgba(0,0,0,0.03)' 
      }}>
          
          {/* LEFT SIDE: HIGH DENSITY IDENTITY */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flex: 1 }}>
              {/* Shrunk Avatar from 90 to 56 */}
              <Avatar sx={{ width: 56, height: 56, bgcolor: '#5D4037', fontSize: 24, fontWeight: 'bold', boxShadow: 1 }}>
                {client.fullName ? client.fullName[0] : '?'}
              </Avatar>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  
                  {/* Row 1: Name and Tags on ONE line */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                    <Typography variant="h5" fontWeight="900" color="#3E2723" sx={{ letterSpacing: -0.5, lineHeight: 1 }}>
                        {client.fullName}
                    </Typography>
                    <Chip label={client.clientTag || 'Regular'} size="small" color={client.clientTag==='VIP'?'warning':client.clientTag==='Bad Payer'?'error':'default'} variant={client.clientTag==='Regular' ? 'outlined' : 'filled'} sx={{fontWeight: 'bold', height: 20, fontSize: '0.65rem'}} />
                    {client.seniorId && <Chip label="SC/PWD" size="small" color="secondary" sx={{fontWeight: 'bold', height: 20, fontSize: '0.65rem'}} />}
                  </Box>

                  {/* Row 2: Contacts on ONE line */}
                  {!isEditing && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: '#555' }}>
                      <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: '600' }}>
                        <PhoneIcon sx={{fontSize: 14, color: '#1565C0'}}/> {client.phone}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <EmailIcon sx={{fontSize: 14, color: '#888'}}/> {client.email || 'No email'}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ ml: 1, fontStyle: 'italic', borderLeft: '1px solid #ccc', pl: 2 }}>
                        Since: {client.createdAt ? new Date(client.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                      </Typography>
                    </Box>
                  )}
              </Box>
          </Box>
          
          {/* RIGHT SIDE: INTEGRATED FINANCIALS & ACTIONS */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, borderLeft: '1px dashed #ccc', pl: 3 }}>
            
            {/* Integrated Balance - No more jumping UI! */}
            <Box sx={{ textAlign: 'right' }}>
                <Typography variant="caption" color="textSecondary" fontWeight="bold" sx={{ display: 'block', mb: -0.5 }}>Total Outstanding</Typography>
                <Typography variant="h6" color={hasDebt ? "#D32F2F" : "#2E7D32"} fontWeight="900">
                    ₱{balance.toFixed(2)}
                </Typography>
                {hasDebt ? (
                    <Typography variant="caption" color="error" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                        <WarningAmberIcon sx={{fontSize: 14}}/> Payment Due
                    </Typography>
                ) : (
                    <Typography variant="caption" color="success.main" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                        <CheckCircleOutlineIcon sx={{fontSize: 14}}/> Good Standing
                    </Typography>
                )}
            </Box>

            <Divider orientation="vertical" flexItem sx={{ my: 1 }} />

            {/* Actions */}
            <Box>
                {isEditing ? (
                <Stack direction="column" spacing={1}>
                    <Button variant="contained" color="success" size="small" onClick={onSave} sx={{fontWeight: 'bold', fontSize: '0.7rem', py: 0.2}} startIcon={<SaveIcon fontSize="small"/>}>Save</Button>
                    <Button variant="outlined" color="error" size="small" onClick={onCancel} sx={{fontWeight: 'bold', fontSize: '0.7rem', py: 0.2}} startIcon={<CancelIcon fontSize="small"/>}>Cancel</Button>
                </Stack>
                ) : (
                <Button variant="outlined" startIcon={<EditIcon />} size="small" onClick={onEdit} sx={{borderColor: '#ccc', color: '#555', '&:hover':{borderColor: '#8B4513', color: '#8B4513'}, bgcolor: 'white', fontWeight: 'bold'}}>
                    Edit Profile
                </Button>
                )}
            </Box>
          </Box>
      </Paper>
    </Box>
  );
}