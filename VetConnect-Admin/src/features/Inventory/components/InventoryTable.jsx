import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Typography, Chip, Tooltip, Box, Menu, MenuItem, ListItemIcon, Divider } from '@mui/material';

import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExposureIcon from '@mui/icons-material/Exposure'; 
import MoreVertIcon from '@mui/icons-material/MoreVert';
import HistoryIcon from '@mui/icons-material/History';
import FactCheckIcon from '@mui/icons-material/FactCheck';

export default function InventoryTable({ data, onEdit, onAdjust, onDelete, glassStyle }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedActionItem, setSelectedActionItem] = useState(null);

  const handleOpenMenu = (event, item) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedActionItem(item);
  };
  const handleCloseMenu = () => setAnchorEl(null);
  
  const headerSx = { fontWeight: 'bold', color: '#5D4037', bgcolor: 'rgba(255, 255, 255, 0.4)', fontSize: '1.05rem', borderBottom: '1px solid rgba(255, 255, 255, 0.5)' };

  return (
    <TableContainer component={Paper} sx={{ ...glassStyle, height: 'calc(100vh - 180px)', overflow: 'auto' }}>
      <Table stickyHeader size="small" sx={{ bgcolor: 'transparent' }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...headerSx, pl: 3 }}>Product Name</TableCell>
            <TableCell sx={headerSx}>Category</TableCell>
            <TableCell sx={{ ...headerSx }} align="center">Stock Level</TableCell>
            <TableCell sx={{ ...headerSx }} align="right">Retail Price</TableCell>
            <TableCell sx={{ ...headerSx }} align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        
        <TableBody>
          {(data ||[]).map((row) => {
            const currentStock = row.stock || 0;
            const minStock = row.minStock || 10;
            const isLow = currentStock <= minStock;

            return (
              <TableRow 
                key={row.id} 
                hover 
                sx={{ 
                  bgcolor: isLow ? 'rgba(255, 253, 231, 0.7)' : 'transparent', // THEME FIX
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.6)' },
                  '& > td': { borderBottom: '1px solid rgba(224, 224, 224, 0.5)' }
                }}
              >
                <TableCell sx={{ pl: 3 }}><Typography variant="body2" fontWeight="bold" color="#3E2723">{row.itemName}</Typography></TableCell>
                <TableCell><Chip label={row.category} size="small" variant="outlined" /></TableCell>
                <TableCell align="center"><Chip label={currentStock} size="small" color={isLow ? 'error' : 'success'} variant={isLow ? 'filled' : 'outlined'} sx={{ fontWeight: 'bold' }} /></TableCell>
                <TableCell align="right"><Typography variant="body2" fontWeight="bold" color="#2E7D32">₱{parseFloat(row.price || 0).toFixed(2)}</Typography></TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={(e) => handleOpenMenu(e, row)}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
          
          {(!data || data.length === 0) && (
            <TableRow><TableCell colSpan={5} align="center" sx={{ py: 10, color: '#888', fontStyle: 'italic', border: 'none' }}>No items found. Click "Add Item" to start.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
      
      {/* THEME FIX: Enterprise 3-dot Menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleCloseMenu}>
        <MenuItem onClick={() => { onAdjust(selectedActionItem); handleCloseMenu(); }}><ListItemIcon><ExposureIcon fontSize="small" color="primary"/></ListItemIcon>Adjust Stock</MenuItem>
        <MenuItem onClick={() => { onEdit(selectedActionItem); handleCloseMenu(); }}><ListItemIcon><EditIcon fontSize="small" color="secondary"/></ListItemIcon>Edit Details</MenuItem>
        <Divider />
        <MenuItem onClick={() => { onDelete(selectedActionItem); handleCloseMenu(); }} sx={{color:'error.main'}}><ListItemIcon><DeleteIcon fontSize="small" color="error"/></ListItemIcon>Delete</MenuItem>
      </Menu>
    </TableContainer>
  );
}