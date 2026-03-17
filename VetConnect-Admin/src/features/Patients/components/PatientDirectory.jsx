import React from 'react';
import { Box, Paper, List, ListItem, ListItemIcon, ListItemText, Avatar, TextField, InputAdornment, Button, Typography, ListItemButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

export default function PatientDirectory({ owners, selectedId, onSelect, onNewClient, onSearchChange, searchText }) {
  return (
    <Paper square sx={{ width: 320, display: 'flex', flexDirection: 'column', borderRight: '1px solid #E0E0E0', bgcolor: '#FAFAFA', zIndex: 1, boxShadow: '2px 0 5px rgba(0,0,0,0.02)' }}>
      <Box sx={{ p: 2.5, borderBottom: '1px solid #E0E0E0', bgcolor: 'white' }}>
         <Button variant="contained" startIcon={<PersonAddIcon />} fullWidth sx={{ mb: 2, bgcolor: '#8B4513', '&:hover': {bgcolor: '#5D4037'}, fontWeight:'bold', py: 1.5, boxShadow: '0 4px 12px rgba(139,69,19,0.2)' }} onClick={onNewClient}>
             New Client
         </Button>
         <TextField fullWidth placeholder="Search name or phone..." size="small" value={searchText} onChange={onSearchChange} sx={{bgcolor: '#F5F5F5', '& fieldset': {borderColor: '#e0e0e0'}}} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon color="disabled"/></InputAdornment>, spellCheck: 'false' }} />
      </Box>
      <List sx={{ overflowY: 'auto', flex: 1, p: 0 }}>
        {owners.map((owner) => (
          <ListItem key={owner.id} disablePadding>
            <ListItemButton selected={selectedId === owner.id} onClick={() => onSelect(owner)} sx={{ borderBottom: '1px solid #F5F5F5', '&.Mui-selected': { bgcolor: '#EFEBE9', borderLeft: '4px solid #8B4513' } }}>
              <ListItemIcon>
                  <Avatar sx={{ bgcolor: selectedId === owner.id ? '#8B4513' : '#E0E0E0', color: selectedId === owner.id ? 'white' : '#777', fontWeight: 'bold' }}>{owner.fullName ? owner.fullName[0] : '?'}</Avatar>
              </ListItemIcon>
              <ListItemText 
                primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight="bold" color={selectedId === owner.id ? '#3E2723' : '#555'} noWrap>{owner.fullName}</Typography>
                        {owner.clientTag === 'VIP' && <Typography variant="caption">🌟</Typography>}
                        {owner.clientTag === 'Bad Payer' && <Typography variant="caption">⚠️</Typography>}
                    </Box>
                } 
                secondary={<Typography variant="caption" color="textSecondary">{owner.phone}</Typography>} 
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}