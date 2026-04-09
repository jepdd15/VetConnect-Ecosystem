import React, { useState, useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, Chip, IconButton, Tooltip, 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Checkbox, FormControlLabel,
  InputAdornment, TextField, Divider, Alert, Switch, TableSortLabel, FormControl, Select, MenuItem
} from '@mui/material';
import Grid from '@mui/material/Grid'; 

import { useSalesData } from './hooks/useSalesData';
import EodSummary from './components/EodSummary';

// Icons
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

// Design Tokens
import { FONT } from '../../theme/designTokens';

export default function Sales() {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  
  // THE BRAIN: Hook handles all database fetching and refund transactions
  const { sales, loading, eodTotals, processRefundTransaction } = useSalesData(filterDate);

  // --- UI STATES ---
  const [searchText, setSearchText] = useState('');
  const [filterMethod, setFilterMethod] = useState(['All']);
  const [filterStatus, setFilterStatus] = useState('All');
  
  // --- NATIVE SORTING STATES ---
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('jsDate');

  const [openRefund, setOpenRefund] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [restock, setRestock] = useState(true);

  const clinicalFlatStyle = {
    bgcolor: 'white',
    border: '2px solid #5D4037',
    borderRadius: 0,
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
  };

  // --- SORTING & FILTERING ENGINE ---
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const processedSales = useMemo(() => {
    let list = sales.filter(s => {
      const matchSearch = (s.petName || '').toLowerCase().includes(searchText.toLowerCase()) || 
                          (s.ownerName || '').toLowerCase().includes(searchText.toLowerCase()) ||
                          s.id.toLowerCase().includes(searchText.toLowerCase());
      const matchMethod = filterMethod.includes('All') || filterMethod.includes(s.paymentMethod);
      const matchStatus = filterStatus === 'All' || (filterStatus === 'Paid' ? s.status !== 'refunded' : s.status === 'refunded');
      return matchSearch && matchMethod && matchStatus;
    });

    list.sort((a, b) => {
        let valA, valB;
        switch (orderBy) {
            case 'jsDate':
                valA = a.jsDate ? a.jsDate.getTime() : 0;
                valB = b.jsDate ? b.jsDate.getTime() : 0;
                return order === 'asc' ? valA - valB : valB - valA;
            case 'petName':
                valA = a.petName || '';
                valB = b.petName || '';
                return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            case 'total':
                valA = parseFloat(a.total) || 0;
                valB = parseFloat(b.total) || 0;
                return order === 'asc' ? valA - valB : valB - valA;
            default:
                return 0;
        }
    });

    return list;
  }, [sales, searchText, filterMethod, filterStatus, order, orderBy]);

  const handleOpenRefund = (sale) => {
    setSelectedSale(sale); setRestock(true); setOpenRefund(true);
  };

  const executeRefund = async () => {
    try {
      await processRefundTransaction(selectedSale, restock);
      setOpenRefund(false); 
      alert("Refund Processed Successfully!");
    } catch (error) { 
      alert("Refund failed: " + error.message); 
    }
  };

  const handleReprint = (sale) => {
    const receiptDate = sale.jsDate ? sale.jsDate.toLocaleString() : new Date().toLocaleString();
    let itemsHTML = (sale.items ||[]).map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name} ${item.isDiscountable ? '' : '<span style="color:red; font-size:10px;">(No SC/PWD)</span>'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.qty}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">P${parseFloat(item.price).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">P${(parseFloat(item.price) * item.qty).toFixed(2)}</td>
      </tr>
    `).join('');

    const receiptContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #8B4513; padding-bottom: 10px; }
            .clinic-name { font-size: 24px; font-weight: bold; color: #5D4037; margin: 0; }
            .details { margin-bottom: 20px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background-color: #f5f5f5; padding: 10px; text-align: left; font-size: 14px; border-bottom: 2px solid #ddd; }
            .totals { width: 50%; float: right; border-top: 2px solid #8B4513; padding-top: 10px; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px; }
            .grand-total { font-weight: bold; font-size: 18px; margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px; }
            .footer { clear: both; text-align: center; margin-top: 50px; font-size: 12px; color: #777; }
            .reprint-badge { text-align: center; font-weight: bold; border: 2px dashed #999; padding: 5px; margin-bottom: 15px; color: #666; letter-spacing: 2px; }
          </style>
        </head>
        <body>
          <div class="reprint-badge">*** DUPLICATE RECEIPT (REPRINT) ***</div>
          <div class="header">
            <p class="clinic-name">🐾 Starbarks Veterinary Clinic</p>
            <p style="margin: 0; font-size: 12px; color: #666;">Santa Barbara, Pangasinan | Official Receipt</p>
          </div>
          <div class="details">
            <p><strong>Receipt #:</strong> ${sale.id.slice(0, 8).toUpperCase()}</p>
            <p><strong>Date:</strong> ${receiptDate}</p>
            <p><strong>Patient:</strong> ${sale.petName} (${sale.ownerName || 'Walk-In'})</p>
            <p><strong>Cashier:</strong> ${sale.cashier || 'System'}</p>
          </div>
          <table>
            <thead><tr><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>${itemsHTML}</tbody>
          </table>
          <div class="totals">
            <div class="total-row"><span>Subtotal:</span><span>P${parseFloat(sale.subtotal || 0).toFixed(2)}</span></div>
            ${sale.hasScPwdDiscount && parseFloat(sale.discount || 0) > 0 ? `<div class="total-row" style="color: #D32F2F;"><span>SC/PWD Discount (20%):</span><span>- P${parseFloat(sale.discount).toFixed(2)}</span></div>` : ''}
            <div class="total-row"><span>Less Deposit:</span><span>- P${parseFloat(sale.depositPaid || 0).toFixed(2)}</span></div>
            <div class="total-row grand-total"><span>BALANCE PAID:</span><span>P${parseFloat(sale.total || 0).toFixed(2)}</span></div>
            <div class="total-row" style="margin-top:5px; font-size:12px; color:#555;"><span>Payment Method:</span><span>${sale.paymentMethod || 'Cash'}</span></div>
          </div>
          <div class="footer">
            <p>Thank you for trusting Starbarks Veterinary Clinic with your pet's health!</p>
            <p>This document is a system-generated duplicate receipt.</p>
          </div>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
        printWindow.document.write(receiptContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
    } else {
        alert("⚠️ Pop-up blocked! Please allow pop-ups to print receipts.");
    }
  };

  const columns = [
    { 
      field: 'jsDate', flex: 1.2, minWidth: 160, sortable: false, disableColumnMenu: true,
      renderHeader: () => (<TableSortLabel active={orderBy === 'jsDate'} direction={orderBy === 'jsDate' ? order : 'asc'} onClick={() => handleRequestSort('jsDate')} sx={{fontWeight: '1000', color: '#5D4037', fontSize: '0.75rem'}}>DATE & TIME</TableSortLabel>),
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: '1000', color: '#3E2723', lineHeight: 1.2 }}>{p.value ? p.value.toLocaleDateString() : 'N/A'}</Typography>
            <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: '900', fontSize: '0.65rem', mt: 0.2 }}>{p.value ? p.value.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</Typography>
        </Box>
      ) 
    },
    { 
      field: 'id', headerName: 'Receipt #', width: 130, sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: '1000', color: '#1565C0', bgcolor: '#E3F2FD', px: 1.2, py: 0.5, borderRadius: 0, border: '1px solid #1565C0', letterSpacing: 0.5 }}>{p.value.slice(0,8).toUpperCase()}</Typography>
        </Box>
      ) 
    },
    { 
      field: 'petName', flex: 1.5, minWidth: 200, sortable: false, disableColumnMenu: true,
      renderHeader: () => (<TableSortLabel active={orderBy === 'petName'} direction={orderBy === 'petName' ? order : 'asc'} onClick={() => handleRequestSort('petName')} sx={{fontWeight: '1000', color: '#5D4037', fontSize: '0.75rem'}}>PATIENT & OWNER</TableSortLabel>),
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: '1000', color: '#3E2723', lineHeight: 1.1 }}>{p.value}</Typography>
            <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: '900', fontSize: '0.65rem', mt: 0.5 }}>{p.row.ownerName}</Typography>
        </Box>
      ) 
    },
    { 
      field: 'items', headerName: 'Items Purchased', flex: 1.5, minWidth: 250, sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 1 }}>
            <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: '900', fontSize: '0.65rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3 }}>
                {p.value ? p.value.map(i => `${i.qty}x ${i.name}`).join(', ') : 'N/A'}
            </Typography>
        </Box>
      ) 
    },
    { 
      field: 'paymentMethod', headerName: 'Method', width: 130, sortable: false, disableColumnMenu: true,
      renderCell: (p) => {
        let icon; let color;
        if(p.value === 'Cash') { icon = <AccountBalanceWalletIcon fontSize="small"/>; color = '#2E7D32'; }
        else if(p.value?.includes('GCash')) { icon = <PhoneIphoneIcon fontSize="small"/>; color = '#1565C0'; }
        else if(p.value === 'Card') { icon = <CreditCardIcon fontSize="small"/>; color = '#F57C00'; }
        else { icon = <AccountBalanceIcon fontSize="small"/>; color = '#6A1B9A'; }
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                <Chip icon={icon} label={p.value} size="small" sx={{ borderRadius: 0, bgcolor: 'white', color: color, border: `2px solid ${color}`, fontWeight: '1000', '& .MuiChip-icon': { color: color } }} />
            </Box>
        );
      }
    },
    { 
      field: 'total', width: 130, sortable: false, disableColumnMenu: true,
      renderHeader: () => (<TableSortLabel active={orderBy === 'total'} direction={orderBy === 'total' ? order : 'asc'} onClick={() => handleRequestSort('total')} sx={{fontWeight: '1000', color: '#5D4037', fontSize: '0.75rem'}}>TOTAL PAID</TableSortLabel>),
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body1" sx={{ fontWeight: '1000', color: p.row.status === 'refunded' ? 'textSecondary' : '#2E7D32', textDecoration: p.row.status === 'refunded' ? 'line-through' : 'none' }}>
                ₱{parseFloat(p.value||0).toFixed(2)}
            </Typography>
        </Box>
      ) 
    },
    { 
      field: 'status', headerName: 'Status', width: 120, align: 'center', headerAlign: 'center', sortable: false, disableColumnMenu: true,
      renderCell: (p) => { 
          const isRefunded = p.value === 'refunded'; 
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Chip label={isRefunded ? "REFUNDED" : "PAID"} color={isRefunded ? "error" : "success"} size="small" variant={isRefunded ? "outlined" : "filled"} sx={{ borderRadius: 0, fontWeight: '1000', border: isRefunded ? '2px solid' : 'none' }} />
            </Box>
          ); 
      } 
    },
    {
      field: 'actions', headerName: 'Actions', width: 100, align: 'center', headerAlign: 'center', sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Tooltip title="Reprint Receipt">
                <IconButton color="primary" size="small" onClick={() => handleReprint(p.row)} sx={{ border: '1px solid rgba(21, 101, 192, 0.3)', borderRadius: 1 }}>
                    <PrintIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            {p.row.status !== 'refunded' && (
                <Tooltip title="Process Refund">
                    <IconButton color="error" size="small" onClick={() => handleOpenRefund(p.row)} sx={{ border: '1px solid rgba(211, 47, 47, 0.3)', borderRadius: 1 }}>
                        <SettingsBackupRestoreIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
      )
    }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', bgcolor: '#FFF8E1' }}>
      
      {/* 1. FULL-BLEED COMMAND STRIP header */}
      <Box sx={{ flexShrink: 0, mb: 0 }}>
        <Paper elevation={0} sx={{ 
          p: 2.5, px: 4, display: 'flex', flexWrap: 'nowrap', gap: 2.5, alignItems: 'center',
          bgcolor: '#FFF8E1', borderBottom: '2px solid #5D4037', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0
        }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: '1000', color: '#5D4037', textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0, mr: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            Transaction Ledger
          </Typography>

          {/* Search */}
          <TextField 
            variant="standard" size="small" placeholder="SEARCH LEDGER..." 
            value={searchText} onChange={(e) => setSearchText(e.target.value)} 
            InputProps={{ 
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{color: '#5D4037', opacity: 0.6}}/></InputAdornment>,
              disableUnderline: true,
              style: { color: '#3E2723', fontWeight: '1000', fontSize: '0.85rem', fontFamily: 'Inter' }
            }} 
            sx={{ width: 220, bgcolor: 'rgba(93, 64, 55, 0.05)', border: '2px solid #5D403733', borderRadius: 0, px: 2, py: 0.5, flexShrink: 0 }} 
          />

          {/* Controls Grouped */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField 
              type="date" size="small" 
              value={filterDate} 
              onChange={(e) => setFilterDate(e.target.value)} 
              InputProps={{ 
                startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" sx={{ color: '#5D4037' }}/></InputAdornment>,
                sx: { borderRadius: 0, fontWeight: '1000', fontFamily: 'Inter', fontSize: '0.85rem' }
              }} 
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733', borderRadius: 0 }, minWidth: 170 }} 
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
                <Select 
                    multiple
                    value={filterMethod} 
                    onChange={(e) => {
                      const val = e.target.value;
                      // Logic: If 'All' was just added, clear others. If other added, remove 'All'.
                      const lastSelected = val[val.length - 1];
                      if (lastSelected === 'All') setFilterMethod(['All']);
                      else {
                        const filtered = val.filter(v => v !== 'All');
                        setFilterMethod(filtered.length === 0 ? ['All'] : filtered);
                      }
                    }} 
                    renderValue={(selected) => {
                      if (selected.includes('All')) return 'All Methods';
                      return selected.join(', ');
                    }}
                    displayEmpty 
                    sx={{ fontWeight: '1000', color: '#5D4037', bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733', borderRadius: 0 }, borderRadius: 0 }}
                >
                    <MenuItem value="All">All Methods (Reset)</MenuItem>
                    <MenuItem value="Cash">💵 Cash</MenuItem>
                    <MenuItem value="GCash">📱 GCash / Maya</MenuItem>
                    <MenuItem value="Card">💳 Card</MenuItem>
                </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 130 }}>
                <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} displayEmpty sx={{ fontWeight: '1000', color: '#5D4037', bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733' } }}>
                    <MenuItem value="All">All Statuses</MenuItem>
                    <MenuItem value="Paid">✅ Paid</MenuItem>
                    <MenuItem value="Refunded">🚫 Refunded</MenuItem>
                </Select>
            </FormControl>
          </Box>

          <Box sx={{ flexGrow: 1 }} />
          
          <Tooltip title="Print Detailed Report">
            <IconButton sx={{ bgcolor: 'white', border: '1px solid #5D403733', color: '#5D4037' }}>
              <PrintIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>
      </Box>

      {/* 2. FULL-BLEED ANALYTIC MOUNTING (KPIs) */}
      <Box sx={{ flexShrink: 0, mb: 0 }}>
        <Box sx={{ 
          p: 2, px: 4, bgcolor: 'white', borderBottom: '2px solid #5D4037', 
          borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0
        }}>
          <EodSummary totals={eodTotals} filterMethod={filterMethod} setFilterMethod={setFilterMethod} />
        </Box>
      </Box>

      {/* 3. FULL-BLEED TRANSACTION LEDGER (FLEX: 1) */}
      <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden', bgcolor: 'white' }}>
        <DataGrid 
            loading={loading} rows={processedSales} 
            columns={columns.map(c => ({
              ...c,
              headerClassName: 'forensic-header',
              headerName: (c.headerName || '').toUpperCase()
            }))} 
            disableRowSelectionOnClick rowHeight={80}
            hideFooter={true}
            sx={{ 
                border: 'none', 
                bgcolor: 'white',
                '& .forensic-header': {
                  bgcolor: '#FFF8E1 !important',
                  color: '#5D4037',
                  fontWeight: '1000 !important',
                  fontSize: '0.75rem',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  borderBottom: '2px solid #5D4037 !important',
                },
                '& .MuiDataGrid-columnSeparator': { display: 'none' },
                '& .MuiDataGrid-cell': { 
                  display: 'flex', 
                  alignItems: 'center', 
                  borderBottom: '1px solid rgba(93, 64, 55, 0.08)',
                  fontFamily: 'Inter, sans-serif'
                },
                '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(93, 64, 55, 0.04)' },
                '& .MuiDataGrid-virtualScroller': {
                  '&::-webkit-scrollbar': { width: '8px', height: '8px' },
                  '&::-webkit-scrollbar-track': { background: '#FFF8E1' },
                  '&::-webkit-scrollbar-thumb': { background: '#5D4037', borderRadius: '4px' },
                  '&::-webkit-scrollbar-thumb:hover': { background: '#3E2723' }
                }
            }} 
        />
      </Box>

      {/* REFUND MODAL */}
      <Dialog open={openRefund} onClose={() => setOpenRefund(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, border: '2px solid #D32F2F', boxShadow: '8px 8px 0px rgba(211, 47, 47, 0.1)' }}}>
        <DialogTitle sx={{ bgcolor: '#FFEBEE', color: '#D32F2F', fontWeight: '1000', display: 'flex', alignItems: 'center', gap: 1.5, py: 2, borderBottom: '2px solid #D32F2F', textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>
            <SettingsBackupRestoreIcon /> Authorize Transaction Reversal
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: '#FFF' }}>
          <Alert severity="warning" sx={{ mb: 3, fontWeight: '1000', border: '2px solid #F57C00', borderRadius: 0, bgcolor: '#FFF3E0' }}>
            You are about to permanently refund ₱{selectedSale?.total?.toFixed(2)} to {selectedSale?.ownerName}.
          </Alert>
          <Paper variant="outlined" sx={{ p: 2.5, bgcolor: '#FFF9F7', mb: 3, borderRadius: 0, border: '2px dashed #D7CCC8' }}>
            <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', display: 'block', mb: 1.5, borderBottom: '1px solid #D7CCC8', pb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>Items to Reverse:</Typography>
            {selectedSale?.items?.map((item, i) => <Typography key={i} variant="body2" sx={{ mt: 0.5, color: '#333', fontWeight: '900' }}>• {item.qty}x {item.name} (₱{(item.price * item.qty).toFixed(2)})</Typography>)}
          </Paper>
          <FormControlLabel control={<Switch checked={restock} onChange={(e) => setRestock(e.target.checked)} color="success" />} label={<Box><Typography variant="body2" sx={{ fontWeight: '1000', color: '#2E7D32' }}>Restock physical products?</Typography><Typography variant="caption" color="textSecondary">Uncheck this if the items were opened/damaged and cannot be resold.</Typography></Box>} />
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '2px solid #D32F2F', bgcolor: '#FFEBEE', justifyContent: 'space-between' }}>
          <Button onClick={() => setOpenRefund(false)} sx={{ fontWeight: '1000', color: '#555', px: 3, fontFamily: 'Inter, sans-serif' }}>CANCEL</Button>
          <Button 
            onClick={executeRefund} variant="contained" color="error" 
            startIcon={<SettingsBackupRestoreIcon />} 
            sx={{ 
                fontWeight: '1000', px: 4, py: 1.5, borderRadius: 0, 
                bgcolor: '#D32F2F', border: '2px solid #B71C1C',
                boxShadow: '4px 4px 0px rgba(211, 47, 47, 0.2)',
                '&:hover': { bgcolor: '#B71C1C', boxShadow: '2px 2px 0px rgba(211, 47, 47, 0.2)' },
                fontFamily: 'Inter, sans-serif'
            }}
          >
            CONFIRM REFUND
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}