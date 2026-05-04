import React from 'react';
import { Box, Chip, Paper, List, ListItem, ListItemIcon, ListItemText, Avatar, TextField, InputAdornment, Button, Typography, ListItemButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

const PatientDirectory = React.memo(function PatientDirectory({ owners, selectedId, onSelect, onNewClient, onSearchChange, searchText }) {
  return (
    <Paper square sx={{ width: 320, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${COLORS.border}`, bgcolor: COLORS.surfaceAlt, zIndex: 1, boxShadow: '2px 0 5px rgba(0,0,0,0.02)' }}>
      <Box sx={{ p: 2.5, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.cardBg }}>
         <Button variant="contained" startIcon={<PersonAddIcon />} fullWidth sx={{ mb: 2, bgcolor: COLORS.sky, '&:hover': { bgcolor: COLORS.skyHover }, fontFamily: FONT, fontWeight: 'bold', py: 1.5, boxShadow: '4px 4px 0px rgba(58, 190, 249, 0.15)', borderRadius: 0 }} onClick={onNewClient}>
             New Client
         </Button>
         <TextField variant="outlined" fullWidth placeholder="Search owner, pet, or phone..." size="small" value={searchText} onChange={onSearchChange} sx={{bgcolor: COLORS.surface, '& fieldset': {borderColor: COLORS.borderInput}, borderRadius: 0}} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: COLORS.textMuted }}/></InputAdornment>, spellCheck: 'false', style: { fontFamily: FONT } }} />
      </Box>
      <List sx={{ overflowY: 'auto', flex: 1, p: 0 }}>
        {(!owners || owners.length === 0) ? (
          <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
            <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.textMuted, fontStyle: 'italic' }}>
              {searchText ? 'No clients match your search.' : 'No clients registered yet.'}
            </Typography>
          </Box>
        ) : (
          owners.map((owner) => (
            <ListItem key={owner.id} disablePadding>
              <ListItemButton selected={selectedId === owner.id} onClick={() => onSelect(owner)} sx={{ borderBottom: `1px solid ${COLORS.borderLight}`, '&.Mui-selected': { bgcolor: COLORS.panelBg, borderLeft: `4px solid ${COLORS.accent}` } }}>
                <ListItemIcon>
                    <Avatar sx={{ bgcolor: selectedId === owner.id ? COLORS.accent : COLORS.borderInput, color: selectedId === owner.id ? 'white' : COLORS.textMuted, fontFamily: FONT, fontWeight: 'bold' }}>{owner.fullName ? owner.fullName[0] : '?'}</Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontFamily={FONT} fontWeight="bold" color={selectedId === owner.id ? COLORS.textPrimary : COLORS.textSecondary} noWrap>{owner.fullName}</Typography>
                          {owner.clientTag === 'VIP' && <Typography variant="caption">🌟</Typography>}
                          {owner.clientTag === 'Bad Payer' && <Typography variant="caption">⚠️</Typography>}
                          {/* T4.147: Denormalized outstanding balance indicator — zero extra queries */}
                          {owner.hasOutstandingBalance === true && (
                            <Chip
                              label="₱"
                              size="small"
                              sx={{
                                height: 16,
                                width: 20,
                                fontSize: '0.55rem',
                                fontWeight: 900,
                                borderRadius: 0,
                                p: 0,
                                bgcolor: COLORS.warningSurface,
                                color: COLORS.warning,
                                border: `1px solid ${COLORS.warning}`,
                              }}
                            />
                          )}
                      </Box>
                  }
                  secondary={<Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted }}>{owner.phone}</Typography>}
                />
              </ListItemButton>
            </ListItem>
          ))
        )}
      </List>
    </Paper>
  );
});

export default PatientDirectory;