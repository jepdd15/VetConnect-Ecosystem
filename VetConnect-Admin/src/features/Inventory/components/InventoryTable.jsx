import React, { useState, useMemo, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Typography, Chip, Box, Tooltip, TableSortLabel, TablePagination,
  CircularProgress
} from '@mui/material';

import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExposureIcon from '@mui/icons-material/Exposure';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HistoryIcon from '@mui/icons-material/History';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import { FONT, COLORS } from '../../../theme/designTokens';
import { formatDosage } from '../../../constants/dosageUnits';

export default function InventoryTable({ data, loading, onEdit, onAdjust, onDelete, onLog, showArchived, onRestore }) {
  
  const clinicalFlatStyle = {
    background: COLORS.cardBg,
    border: 0,
    boxShadow: 'none',
    borderRadius: 0,
  };
  
// ── Expiry Status Helper ─────────────────────────────────────────────────
const getExpiryStatus = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + 'T00:00:00'); // avoid timezone shift
  const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
  const formatted = expiry.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  if (daysUntil < 0)   return { label: '⚠ EXPIRED',       color: COLORS.danger,   bg: COLORS.dangerSurface };
  if (daysUntil <= 30) return { label: `Exp: ${formatted}`, color: COLORS.warning,  bg: COLORS.warningSurface };
  if (daysUntil <= 90) return { label: `Exp: ${formatted}`, color: COLORS.grooming, bg: COLORS.kpiPurpleBg };
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

  // Pagination State
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => { setPage(0); }, [data]);

  // T2.172: Return null when data is missing so we can distinguish "N/A" from 0%
  const calculateMargin = (cost, retail) => {
    if (!cost || !retail) return null;
    return (((retail - cost) / retail) * 100);
  };

  const sortedData = useMemo(() => {
    const sortable = [...(data || [])];
    sortable.sort((a, b) => {
      let aVal = a[orderBy] !== undefined ? a[orderBy] : '';
      let bVal = b[orderBy] !== undefined ? b[orderBy] : '';

      // Margin is a derived custom value — treat null (missing cost/price) as -Infinity for sorting
      if (orderBy === 'margin') {
        aVal = calculateMargin(Number(a.costPrice) || 0, Number(a.price) || 0) ?? -Infinity;
        bVal = calculateMargin(Number(b.costPrice) || 0, Number(b.price) || 0) ?? -Infinity;
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

  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const headerSx = {
    fontWeight: 900, color: COLORS.accent, bgcolor: COLORS.cream,
    fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1,
    borderBottom: `2px solid ${COLORS.accent}`,
  };

  const SortableHeader = ({ id, label, align = "left", pl }) => (
    <TableCell sx={{ ...headerSx, pl }} align={align} sortDirection={orderBy === id ? order : false}>
       <TableSortLabel
           active={orderBy === id}
           direction={orderBy === id ? order : 'asc'}
           onClick={() => handleRequestSort(id)}
           sx={{ '&.MuiTableSortLabel-active': { color: COLORS.brand }, '& .MuiTableSortLabel-icon': { color: `${COLORS.cta} !important` } }}
       >
         {label}
       </TableSortLabel>
    </TableCell>
  );

  return (
    <Paper elevation={0} sx={{ ...clinicalFlatStyle, flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <TableContainer sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        '&::-webkit-scrollbar': { width: '8px', height: '8px' },
        '&::-webkit-scrollbar-track': { background: COLORS.cream },
        '&::-webkit-scrollbar-thumb': { background: COLORS.accent, borderRadius: 0 },
        '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand }
    }}>
      <Table stickyHeader size="small" sx={{ minWidth: 1100, bgcolor: COLORS.cardBg }}>
        <TableHead>
          <TableRow>
            <SortableHeader id="itemName" label="PRODUCT NAME" pl={3} />
            <SortableHeader id="category" label="CATEGORY" />
            <TableCell sx={{ ...headerSx, bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`, fontWeight: 900, color: COLORS.accent }} align="center">STATUS</TableCell>
            <SortableHeader id="stock" label="STOCK LEVEL" align="center" />
            <SortableHeader id="reserved" label="RESERVED" align="center" />
            <SortableHeader id="costPrice" label="COST" align="right" />
            <SortableHeader id="price" label="RETAIL" align="right" />
            <SortableHeader id="margin" label="MARGIN" align="right" />
            <TableCell sx={{ ...headerSx, bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`, fontWeight: 900, color: COLORS.accent }} align="center">ACTIONS</TableCell>
          </TableRow>
        </TableHead>
        
        <TableBody>
          {paginatedData.map((row) => {
            const currentStock = Number(row.stock) || 0;
            const minStock = Number(row.minStock) || 10;
            const cost = Number(row.costPrice) || 0;
            const retail = Number(row.price) || 0;
            const marginValue = calculateMargin(cost, retail);
            const margin = marginValue !== null ? marginValue.toFixed(0) : null;
            
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
                   <Typography variant="body2" fontWeight="bold" color={COLORS.brand}>
                     {row.itemName} 
                     {(formatDosage(row.dosageValue, row.dosageUnit, row.dosageUnitCustom) || row.dosage) && <Typography component="span" variant="caption" color="textSecondary" sx={{ ml: 0.5, fontWeight: 'bold' }}>({formatDosage(row.dosageValue, row.dosageUnit, row.dosageUnitCustom) || row.dosage})</Typography>}
                   </Typography>
                   {row.sku && <Typography variant="caption" color="#9E9E9E" sx={{ display: 'block', fontSize: '0.65rem' }}>SKU: {row.sku}</Typography>}  {/* keep #9E9E9E — neutral disabled text */}
                   {/* Expiry Badge */}
                   {(() => {
                     const exp = getExpiryStatus(row.expiryDate);
                     if (!exp) return null;
                     return (
                       <Typography
                         variant="caption"
                         sx={{
                           display: 'inline-block', mt: 0.4,
                           px: 0.8, py: 0.2, borderRadius: 0,
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
                     sx={{ fontWeight: '900', letterSpacing: 0.5, borderRadius: 0 }}
                   />
                </TableCell>
                
                {/* T2.165: Batch tooltip shows FIFO breakdown when batches exist */}
                <TableCell align="center">
                  <Tooltip
                    arrow
                    title={
                      row.batches?.length > 0 ? (
                        <Box sx={{ p: 0.5 }}>
                          <Typography variant="caption" fontWeight="900" sx={{ display: 'block', mb: 0.5 }}>
                            BATCH BREAKDOWN
                          </Typography>
                          {row.batches.map((b, i) => (
                            <Typography key={i} variant="caption" sx={{ display: 'block', lineHeight: 1.6 }}>
                              {b.batchNumber || `Batch ${i + 1}`}: {b.qty} {row.unit || 'units'}
                              {b.expiryDate ? ` (Exp: ${typeof b.expiryDate === 'string' ? b.expiryDate : b.expiryDate?.toDate?.()?.toISOString().slice(0, 10) || 'N/A'})` : ''}
                            </Typography>
                          ))}
                        </Box>
                      ) : 'No batch data'
                    }
                    placement="right"
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: '900', color: currentStock <= minStock ? COLORS.danger : COLORS.monitorBg, cursor: row.batches?.length ? 'help' : 'default' }}>
                          {currentStock}
                          {row.unit && <Typography component="span" variant="caption" color="textSecondary" sx={{ ml: 0.5 }}>{row.unit}</Typography>}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 'bold', fontSize: '0.65rem' }}>
                        Sellable: {currentStock - (row.reserved || 0)}
                        {row.batches?.length > 0 && ` | ${row.batches.length} batch${row.batches.length > 1 ? 'es' : ''}`}
                      </Typography>
                    </Box>
                  </Tooltip>
                </TableCell>

                <TableCell align="center">
                   <Typography variant="body2" sx={{ fontWeight: '900', color: (row.reserved || 0) > 0 ? COLORS.warning : '#757575' }}>
                       {row.reserved || 0}
                   </Typography>
                </TableCell>

                <TableCell align="right">
                   <Typography variant="body2" color="textSecondary">₱{cost.toFixed(2)}</Typography>
                </TableCell>
                
                <TableCell align="right">
                   <Typography variant="body2" fontWeight="bold" color={COLORS.success}>₱{retail.toFixed(2)}</Typography>
                </TableCell>
                
                {/* T2.172: Show negative margins in red; null means cost or price is missing */}
                <TableCell align="right">
                   <Box sx={{ display: 'inline-flex', alignItems: 'center', bgcolor: marginValue === null ? COLORS.tableHeaderBg : marginValue >= 40 ? COLORS.kpiGreenBg : marginValue < 0 ? COLORS.dangerSurface : COLORS.warningSurface, px: 1, py: 0.5, borderRadius: 0 }}>
                     <Typography variant="caption" sx={{ fontWeight: 'bold', color: marginValue === null ? '#757575' : marginValue >= 40 ? COLORS.success : marginValue < 0 ? COLORS.danger : COLORS.warning }}>
                       {marginValue === null ? 'N/A' : `${margin}%`}
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

                    {!showArchived && (
                      <Tooltip title="Adjust Stock Level" arrow>
                        <IconButton size="small" onClick={() => onAdjust(row)} sx={{ color: '#1976D2', bgcolor: 'rgba(25, 118, 210, 0.08)', '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.2)' } }}>
                          <ExposureIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}

                    {!showArchived && (
                      <Tooltip title="Edit Product Details" arrow>
                        <IconButton size="small" onClick={() => onEdit(row)} sx={{ color: '#F57C00', bgcolor: 'rgba(245, 124, 0, 0.08)', '&:hover': { bgcolor: 'rgba(245, 124, 0, 0.2)' } }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}

                    {showArchived ? (
                      <Tooltip title="Restore Product" arrow>
                        <IconButton size="small" onClick={() => onRestore(row.id, row.itemName)} sx={{ color: COLORS.success, bgcolor: 'rgba(46, 125, 50, 0.08)', '&:hover': { bgcolor: 'rgba(46, 125, 50, 0.2)' } }}>
                          <UnarchiveIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Delete Item" arrow>
                        <IconButton size="small" onClick={() => onDelete(row.id, row.itemName)} sx={{ color: COLORS.danger, bgcolor: 'rgba(211, 47, 47, 0.08)', '&:hover': { bgcolor: 'rgba(211, 47, 47, 0.2)' } }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
          
          {loading && (
            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 10, border: 'none' }}>
              <CircularProgress size={32} sx={{ color: COLORS.accent }} />
              <Typography variant="body2" color="textSecondary" fontWeight="bold" sx={{ mt: 1.5 }}>Loading inventory...</Typography>
            </TableCell></TableRow>
          )}
          {!loading && (!sortedData || sortedData.length === 0) && (
            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 10, color: '#888', fontStyle: 'italic', border: 'none' }}>No items found. Adjust filters or click "Add Item" to start.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
      <TablePagination
        component="div"
        count={sortedData.length}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 25, 50, 100]}
        sx={{
          flexShrink: 0,
          borderTop: `2px solid ${COLORS.accent}`,
          bgcolor: COLORS.cream,
          '& .MuiTablePagination-toolbar': { fontFamily: FONT, fontWeight: 900 },
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
            fontFamily: FONT, fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase'
          }
        }}
      />
    </Paper>
  );
}