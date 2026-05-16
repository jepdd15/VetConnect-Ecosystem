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
         <Button 
           variant="contained" 
           startIcon={<PersonAddIcon />} 
           fullWidth 
           sx={{ 
             mb: 2, 
             bgcolor: COLORS.accent, 
             '&:hover': { bgcolor: COLORS.accentHover }, 
             fontFamily: FONT, 
             fontWeight: 900, 
             textTransform: 'uppercase',
             py: 1.5, 
             boxShadow: `4px 4px 0px rgba(121, 85, 72, 0.2)`, 
             borderRadius: 0 
           }} 
           onClick={onNewClient}
         >
             NEW CLIENT
         </Button>
         <TextField variant="outlined" fullWidth placeholder="Search owner, pet, or phone..." size="small" value={searchText} onChange={onSearchChange} sx={{bgcolor: COLORS.surface, '& fieldset': {borderColor: COLORS.borderInput}, borderRadius: 0}} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: COLORS.textMuted }}/></InputAdornment>, spellCheck: 'false', style: { fontFamily: FONT } }} />
      </Box>
      <List sx={{ overflowY: 'auto', flex: 1, p: 2, bgcolor: COLORS.surfaceAlt }}>
        {(!owners || owners.length === 0) ? (
          <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
            <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.textMuted, fontStyle: 'italic' }}>
              {searchText ? 'No clients match your search.' : 'No clients registered yet.'}
            </Typography>
          </Box>
        ) : (
          owners.map((owner, idx) => (
            <ListItem key={owner.id} disablePadding sx={{ mb: 2 }}>
              <ListItemButton 
                selected={selectedId === owner.id} 
                onClick={() => onSelect(owner)} 
                sx={{ 
                  bgcolor: selectedId === owner.id ? COLORS.accent : '#FDFCF0', // Aged Paper
                  border: `2px solid ${COLORS.textPrimary}`,
                  borderRadius: 0,
                  transition: 'all 0.1s',
                  transform: selectedId === owner.id ? 'translate(-2px, -2px)' : `rotate(${idx % 2 === 0 ? 0.5 : -0.5}deg)`, // Organic Tilt
                  boxShadow: selectedId === owner.id ? `4px 4px 0px ${COLORS.textPrimary}` : 'none',
                  position: 'relative',
                  '&.Mui-selected': { 
                    bgcolor: COLORS.accent, 
                    color: 'white',
                    boxShadow: `4px 4px 0px ${COLORS.textPrimary}`,
                    '&:hover': { bgcolor: COLORS.accentHover }
                  },
                  '&:hover': { 
                    bgcolor: selectedId === owner.id ? COLORS.accentHover : '#F9F7F2',
                    boxShadow: `4px 4px 0px ${COLORS.textPrimary}`,
                    transform: 'translate(-2px, -2px)'
                  },
                  p: 1.5
                }}
              >
                {/* Binder Hole */}
                <Box 
                  sx={{ 
                    position: 'absolute', 
                    top: 8, 
                    left: 8, 
                    width: 6, 
                    height: 6, 
                    borderRadius: '50%', 
                    border: `1px solid ${COLORS.textPrimary}`, 
                    bgcolor: COLORS.surfaceAlt,
                    zIndex: 2
                  }} 
                />

                <ListItemIcon sx={{ minWidth: 56 }}>
                    <Avatar 
                      sx={{ 
                        borderRadius: 0,
                        border: `2px solid ${COLORS.textPrimary}`,
                        bgcolor: selectedId === owner.id ? 'white' : COLORS.borderInput, 
                        color: selectedId === owner.id ? COLORS.accent : COLORS.textMuted, 
                        fontFamily: FONT, 
                        fontWeight: 900,
                        width: 40,
                        height: 40
                      }}
                    >
                      {owner.fullName ? owner.fullName[0].toUpperCase() : '?'}
                    </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography 
                            sx={{ 
                              fontFamily: FONT, 
                              fontWeight: 900, 
                              textTransform: 'uppercase',
                              fontSize: '0.85rem',
                              color: selectedId === owner.id ? 'white' : COLORS.textPrimary 
                            }} 
                            noWrap
                          >
                            {owner.fullName}
                          </Typography>
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
                  secondary={
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        fontFamily: FONT, 
                        fontWeight: 700,
                        color: selectedId === owner.id ? 'rgba(255,255,255,0.8)' : COLORS.textMuted 
                      }}
                    >
                      {owner.phone}
                    </Typography>
                  }
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