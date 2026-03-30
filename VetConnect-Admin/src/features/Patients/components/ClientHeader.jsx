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

export default function ClientHeader({ client, balance, isEditing, onEdit, onCancel, onSave }) {
  const hasDebt = balance > 0;

  return (
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
                  <Chip label={client.clientTag || 'Regular'} size="small" color={client.clientTag==='VIP'?'warning':client.clientTag==='Bad Payer'?'error':'default'} variant={client.clientTag==='Regular' ? 'outlined' : 'filled'} sx={{fontFamily: FONT, fontWeight: 'bold', height: 22, fontSize: '0.7rem'}} />
                  {client.seniorId && <Chip label="SC/PWD" size="small" sx={{fontFamily: FONT, fontWeight: 'bold', height: 22, fontSize: '0.7rem', bgcolor: COLORS.kpiPurpleBg, color: COLORS.grooming}} />}
                </Box>

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
                      Client Since: {client.createdAt ? new Date(client.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
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
              <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit} sx={{fontFamily: FONT, borderColor: COLORS.border, color: COLORS.textSecondary, '&:hover':{borderColor: COLORS.accentWarm, color: COLORS.accentWarm, bgcolor: COLORS.panelBg}, bgcolor: COLORS.cardBg, fontWeight: 'bold', py: 1, px: 2}}>
                  Edit Profile
              </Button>
              )}
          </Box>
        </Box>
    </Box>
  );
}