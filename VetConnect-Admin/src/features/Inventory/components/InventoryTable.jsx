import React, { useState } from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, IconButton, Typography, Box, Chip, Tooltip, Collapse, Button, 
  Stack, Menu, MenuItem, ListItemIcon, Divider 
} from '@mui/material';

// Icons
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import WarningIcon from '@mui/icons-material/Warning';
import AddCircleIcon from '@mui/icons-material/AddCircle'; 
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import GppBadIcon from '@mui/icons-material/GppBad';
import DeleteIcon from '@mui/icons-material/Delete';
import HistoryIcon from '@mui/icons-material/History';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import EditIcon from '@mui/icons-material/Edit';

// Note: No more direct Firebase imports needed in this component!

export default function InventoryTable({ data, getStockDetails, onEdit, onAdjust, onViewHistory, onDelete, showToast, requestConfirm }) {
  const [expandedRows, setExpandedRows] = useState({});
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedActionItem, setSelectedActionItem] = useState(null);

  const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  const handleOpenMenu = (e, item) => { e.stopPropagation(); setAnchorEl(e.currentTarget); setSelectedActionItem(item); };
  const handleCloseMenu = () => { setAnchorEl(null); };

  // Note: handleDiscardBatch has been moved to the main Inventory.jsx since it uses requestConfirm

  return (
    <TableContainer component={Paper} sx={{ height: 'calc(100vh - 240px)', overflow: 'auto', border: '1px solid #e0e0e0', boxShadow: 3, borderRadius: 3 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 40, bgcolor: '#EFEBE9' }} />
            <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: '#EFEBE9' }}>Item Details</TableCell>
            <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: '#EFEBE9' }}>Stock Level</TableCell>
            <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: '#EFEBE9' }}>Financials</TableCell>
            <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: '#EFEBE9', align: 'center' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row) => {
            const { active, expired } = getStockDetails(row);
            const isLow = active <= (row.minStock || 10);
            const isExpanded = expandedRows[row.id];

            return (
              <React.Fragment key={row.id}>
                <TableRow hover onClick={() => toggleRow(row.id)} sx={{ cursor: 'pointer', bgcolor: isLow ? '#FFFDE7' : 'white' }}>
                  <TableCell>
                    <IconButton size="small">{isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}</IconButton>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                        {row.itemName} {row.isRxOnly && <Chip label="Rx" size="small" color="error" sx={{ height: 16, fontSize: '0.6rem' }} />}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">{row.category} {row.sku && `• SKU: ${row.sku}`}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                        <Chip label={`${active} ${row.uomBase || 'units'}`} size="small" color={isLow ? "error" : "success"} />
                        {expired > 0 && <Chip label={`${expired} Expired`} size="small" variant="outlined" color="error" />}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" display="block">Cost: ₱{row.costPrice}</Typography>
                    <Typography variant="body2" fontWeight="bold" color="green">Retail: ₱{row.price}</Typography>
                  </TableCell>
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" color="primary" onClick={() => onAdjust(row, 'restock')}><AddCircleIcon /></IconButton>
                    <IconButton size="small" color="secondary" onClick={() => onAdjust(row, 'internal_use')}><MedicalServicesIcon /></IconButton>
                    <IconButton size="small" onClick={(e) => handleOpenMenu(e, row)}><MoreVertIcon /></IconButton>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} style={{ paddingBottom: 0, paddingTop: 0 }}>
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ margin: 2, p: 2, bgcolor: '#FAFAFA', borderRadius: 2, borderLeft: '4px solid #8B4513' }}>
                        <Typography variant="caption" fontWeight="bold">BATCH LOG (FIFO)</Typography>
                        <Table size="small">
                            <TableBody>
                                {row.batches?.map((b, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Typography variant="caption">#{b.batchNumber}</Typography></TableCell>
                                        <TableCell><Typography variant="caption">Exp: {b.expiryDate}</Typography></TableCell>
                                        <TableCell><Typography variant="caption">{b.qty} left</Typography></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleCloseMenu}>
        <MenuItem onClick={() => { onAdjust(selectedActionItem, 'reconcile'); handleCloseMenu(); }}><ListItemIcon><FactCheckIcon fontSize="small"/></ListItemIcon>Reconcile Count</MenuItem>
        <MenuItem onClick={() => { onAdjust(selectedActionItem, 'wastage'); handleCloseMenu(); }} sx={{color:'warning.main'}}><ListItemIcon><RemoveCircleIcon fontSize="small" color="warning"/></ListItemIcon>Wastage</MenuItem>
        <MenuItem onClick={() => { onViewHistory(selectedActionItem); handleCloseMenu(); }}><ListItemIcon><HistoryIcon fontSize="small"/></ListItemIcon>View History</MenuItem>
        <Divider/>
        <MenuItem onClick={() => { onEdit(selectedActionItem); handleCloseMenu(); }}><ListItemIcon><EditIcon fontSize="small"/></ListItemIcon>Edit Product</MenuItem>
        <MenuItem onClick={() => { onDelete(selectedActionItem); handleCloseMenu(); }} sx={{color:'error.main'}}><ListItemIcon><DeleteIcon fontSize="small" color="error"/></ListItemIcon>Delete</MenuItem>
      </Menu>
    </TableContainer>
  );
}