import React, { useState, useMemo } from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, IconButton, Typography, Chip, Box, Tooltip, TableSortLabel 
} from '@mui/material';

import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExposureIcon from '@mui/icons-material/Exposure'; 
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HistoryIcon from '@mui/icons-material/History';

export default function InventoryTable({ data, onEdit, onAdjust, onDelete, onLog, glassStyle }) {
  
// ── Expiry Status Helper ─────────────────────────────────────────────────
const getExpiryStatus = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + 'T00:00:00'); // avoid timezone shift
  const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
  const formatted = expiry.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  if (daysUntil < 0)   return { label: '⚠ EXPIRED',       color: '#D32F2F', bg: '#FFEBEE' };
  if (daysUntil <= 30) return { label: `Exp: ${formatted}`, color: '#E65100', bg: '#FFF3E0' };
  if (daysUntil <= 90) return { label: `Exp: ${formatted}`, color: '#7B1FA2', bg: '#F3E8FF' };
  return null; // No badge needed for items expiring far in the future
};
  
  // Sorting State
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('itemName');
  
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const calculateMargin = (cost, retail) => {
    if (!cost || !retail || cost >= retail) return 0;
    return (((retail - cost) / retail) * 100);
  };

  const sortedData = useMemo(() => {
    const sortable = [...(data || [])];
    sortable.sort((a, b) => {
      let aVal = a[orderBy] !== undefined ? a[orderBy] : '';
      let bVal = b[orderBy] !== undefined ? b[orderBy] : '';

      // Margin is a derived custom value
      if (orderBy === 'margin') {
        aVal = calculateMargin(Number(a.costPrice) || 0, Number(a.price) || 0);
        bVal = calculateMargin(Number(b.costPrice) || 0, Number(b.price) || 0);
      } 
      else if (orderBy === 'stock' || orderBy === 'costPrice' || orderBy === 'price') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      } 
      else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
    return sortable;
  }, [data, order, orderBy]);

  const headerSx = { 
    fontWeight: '900', color: '#757575', bgcolor: 'rgba(255, 255, 255, 0.8)', 
    fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, 
    borderBottom: '2px solid rgba(0,0,0,0.06)' 
  };

  const SortableHeader = ({ id, label, align = "left", pl }) => (
    <TableCell sx={{ ...headerSx, pl }} align={align} sortDirection={orderBy === id ? order : false}>
       <TableSortLabel
           active={orderBy === id}
           direction={orderBy === id ? order : 'asc'}
           onClick={() => handleRequestSort(id)}
           sx={{ '&.MuiTableSortLabel-active': { color: '#3E2723' }, '& .MuiTableSortLabel-icon': { color: '#D84315 !important' } }}
       >
         {label}
       </TableSortLabel>
    </TableCell>
  );

  return (
    <TableContainer component={Paper} sx={{ ...glassStyle, height: 'calc(100vh - 280px)', overflow: 'auto', borderRadius: 3 }}>
      <Table stickyHeader size="medium" sx={{ bgcolor: 'transparent' }}>
        <TableHead>
          <TableRow>
            <SortableHeader id="itemName" label="Product Name" pl={3} />
            <SortableHeader id="category" label="Category" />
            <TableCell sx={{ ...headerSx }} align="center">Status</TableCell>
            <SortableHeader id="stock" label="Stock Level" align="center" />
            <SortableHeader id="reserved" label="Reserved" align="center" />
            <SortableHeader id="costPrice" label="Cost Price" align="right" />
            <SortableHeader id="price" label="Retail Price" align="right" />
            <SortableHeader id="margin" label="Margin" align="right" />
            <TableCell sx={{ ...headerSx }} align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        
        <TableBody>
          {sortedData.map((row) => {
            const currentStock = Number(row.stock) || 0;
            const minStock = Number(row.minStock) || 10;
            const cost = Number(row.costPrice) || 0;
            const retail = Number(row.price) || 0;
            const marginValue = calculateMargin(cost, retail);
            const margin = marginValue.toFixed(0);
            
            let statusColor = 'success';
            let statusLabel = 'Healthy';
            let rowBg = 'transparent';

            if (currentStock <= 0) {
              statusColor = 'error';
              statusLabel = 'Out of Stock';
              rowBg = 'rgba(211, 47, 47, 0.04)';
            } else if (currentStock <= minStock) {
              statusColor = 'warning';
              statusLabel = 'Low Stock';
              rowBg = 'rgba(230, 81, 0, 0.04)';
            }

            return (
              <TableRow 
                key={row.id} 
                hover 
                sx={{ 
                  bgcolor: rowBg,
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.6)' },
                  '& > td': { borderBottom: '1px solid rgba(0, 0, 0, 0.04)', py: 1.5 }
                }}
              >
                <TableCell sx={{ pl: 3 }}>
                   <Typography variant="body2" fontWeight="bold" color="#3E2723">
                     {row.itemName} 
                     {row.dosage && <Typography component="span" variant="caption" color="textSecondary" sx={{ ml: 0.5, fontWeight: 'bold' }}>({row.dosage})</Typography>}
                   </Typography>
                   {row.sku && <Typography variant="caption" color="#9E9E9E" sx={{ display: 'block', fontSize: '0.65rem' }}>SKU: {row.sku}</Typography>}
                   {/* Expiry Badge */}
                   {(() => {
                     const exp = getExpiryStatus(row.expiryDate);
                     if (!exp) return null;
                     return (
                       <Typography
                         variant="caption"
                         sx={{
                           display: 'inline-block', mt: 0.4,
                           px: 0.8, py: 0.2, borderRadius: 1,
                           bgcolor: exp.bg, color: exp.color,
                           fontWeight: '900', fontSize: '0.62rem', letterSpacing: 0.3,
                         }}
                       >
                         {exp.label}
                       </Typography>
                     );
                   })()}
                </TableCell>
                
                <TableCell>
                   <Chip label={(row.category || '').toUpperCase()} size="small" variant="outlined" sx={{ fontWeight: 'bold', fontSize: '0.65rem' }} />
                   {row.location && (
                       <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5, fontSize: '0.65rem', fontWeight: 'bold' }}>
                          📍 {row.location}
                       </Typography>
                   )}
                </TableCell>
                
                <TableCell align="center">
                   <Chip 
                     icon={currentStock <= minStock ? <WarningAmberIcon sx={{ fontSize: '14px !important' }} /> : undefined}
                     label={statusLabel} 
                     size="small" 
                     color={statusColor} 
                     variant={currentStock <= 0 ? 'filled' : 'outlined'} 
                     sx={{ fontWeight: '900', letterSpacing: 0.5, borderRadius: 1 }} 
                   />
                </TableCell>
                
                <TableCell align="center">
                   <Typography variant="body2" sx={{ fontWeight: '900', color: currentStock <= minStock ? '#D32F2F' : '#212121' }}>
                       {currentStock}
                       {row.unit && <Typography component="span" variant="caption" color="textSecondary" sx={{ ml: 0.5 }}>{row.unit}</Typography>}
                   </Typography>
                   <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 'bold', fontSize: '0.65rem' }}>
                      Sellable: {currentStock - (row.reserved || 0)}
                   </Typography>
                </TableCell>

                <TableCell align="center">
                   <Typography variant="body2" sx={{ fontWeight: '900', color: (row.reserved || 0) > 0 ? '#E65100' : '#757575' }}>
                       {row.reserved || 0}
                   </Typography>
                </TableCell>

                <TableCell align="right">
                   <Typography variant="body2" color="textSecondary">₱{cost.toFixed(2)}</Typography>
                </TableCell>
                
                <TableCell align="right">
                   <Typography variant="body2" fontWeight="bold" color="#2E7D32">₱{retail.toFixed(2)}</Typography>
                </TableCell>
                
                <TableCell align="right">
                   <Box sx={{ display: 'inline-flex', alignItems: 'center', bgcolor: marginValue >= 40 ? '#E8F5E9' : '#F5F5F5', px: 1, py: 0.5, borderRadius: 1 }}>
                     <Typography variant="caption" sx={{ fontWeight: 'bold', color: marginValue >= 40 ? '#2E7D32' : '#757575' }}>
                       {marginValue > 0 ? `${margin}%` : 'N/A'}
                     </Typography>
                   </Box>
                </TableCell>
                
                <TableCell align="center">
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                    <Tooltip title="View Audit Ledger" arrow>
                      <IconButton size="small" onClick={() => onLog(row)} sx={{ color: '#424242', bgcolor: 'rgba(0, 0, 0, 0.04)', '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.1)' } }}>
                        <HistoryIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    
                    <Tooltip title="Adjust Stock Level" arrow>
                      <IconButton size="small" onClick={() => onAdjust(row)} sx={{ color: '#1976D2', bgcolor: 'rgba(25, 118, 210, 0.08)', '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.2)' } }}>
                        <ExposureIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    
                    <Tooltip title="Edit Product Details" arrow>
                      <IconButton size="small" onClick={() => onEdit(row)} sx={{ color: '#F57C00', bgcolor: 'rgba(245, 124, 0, 0.08)', '&:hover': { bgcolor: 'rgba(245, 124, 0, 0.2)' } }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    
                    <Tooltip title="Delete Item" arrow>
                      <IconButton size="small" onClick={() => onDelete(row.id, row.itemName)} sx={{ color: '#D32F2F', bgcolor: 'rgba(211, 47, 47, 0.08)', '&:hover': { bgcolor: 'rgba(211, 47, 47, 0.2)' } }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
          
          {(!sortedData || sortedData.length === 0) && (
            <TableRow><TableCell colSpan={8} align="center" sx={{ py: 10, color: '#888', fontStyle: 'italic', border: 'none' }}>No items found. Adjust filters or click "Add Item" to start.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}