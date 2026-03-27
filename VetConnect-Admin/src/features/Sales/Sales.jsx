import React, { useState, useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, Chip, IconButton, Tooltip, 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Checkbox, FormControlLabel,
  InputAdornment, TextField, Divider, Alert, Switch, TableSortLabel, FormControl, Select, MenuItem, Stack
} from '@mui/material';
import Grid from '@mui/material/Grid'; // Standard MUI v6 Grid

import { useSalesData } from './hooks/useSalesData';
import EodSummary from './components/EodSummary';

// Icons
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FilterListIcon from '@mui/icons-material/FilterList';

export default function Sales() {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  
  // THE BRAIN: Hook handles all database fetching and refund transactions
  const { sales, loading, eodTotals, processRefundTransaction } = useSalesData(filterDate);

  // --- UI STATES ---
  const [searchText, setSearchText] = useState('');
  const [filterMethod, setFilterMethod] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  
  // --- NATIVE SORTING STATES ---
  const [order, setOrder] = useState('desc');
  const[orderBy, setOrderBy] = useState('jsDate');

  const [openRefund, setOpenRefund] = useState(false);
  const[selectedSale, setSelectedSale] = useState(null);
  const [restock, setRestock] = useState(true);

  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', 
    border: '1px solid rgba(255, 255, 255, 0.9)', boxShadow: '0 12px 40px 0 rgba(139, 69, 19, 0.05)', borderRadius: 4, 
  };

  // --- SORTING & FILTERING ENGINE ---
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const processedSales = useMemo(() => {
    // 1. Filter
    let list = sales.filter(s => {
      const matchSearch = (s.petName || '').toLowerCase().includes(searchText.toLowerCase()) || 
                          (s.ownerName || '').toLowerCase().includes(searchText.toLowerCase()) ||
                          s.id.toLowerCase().includes(searchText.toLowerCase());
      const matchMethod = filterMethod === 'All' || s.paymentMethod === filterMethod;
      const matchStatus = filterStatus === 'All' || (filterStatus === 'Paid' ? s.status !== 'refunded' : s.status === 'refunded');
      return matchSearch && matchMethod && matchStatus;
    });

    // 2. Sort
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

  // --- HANDLERS ---
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

  // --- THE UI UPGRADE: Perfect Vertical Centering and Native Sorting ---
  const columns =[
    { 
      field: 'jsDate', flex: 1.2, minWidth: 160, sortable: false, disableColumnMenu: true,
      renderHeader: () => (<TableSortLabel active={orderBy === 'jsDate'} direction={orderBy === 'jsDate' ? order : 'asc'} onClick={() => handleRequestSort('jsDate')} sx={{fontWeight: 'bold', color: '#5D4037'}}>Date & Time</TableSortLabel>),
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 1 }}>
            <Typography variant="body2" fontWeight="900" color="#3E2723" sx={{ lineHeight: 1.2 }}>{p.value ? p.value.toLocaleDateString() : 'N/A'}</Typography>
            <Typography variant="caption" color="textSecondary" fontWeight="600" sx={{ mt: 0.2 }}>{p.value ? p.value.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</Typography>
        </Box>
      ) 
    },
    { 
      field: 'id', headerName: 'Receipt #', width: 130, sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="caption" fontFamily="monospace" fontWeight="bold" sx={{ color: '#1565C0', bgcolor: '#E3F2FD', px: 1.2, py: 0.5, borderRadius: 1.5, border: '1px solid #BBDEFB', letterSpacing: 0.5 }}>{p.value.slice(0,8).toUpperCase()}</Typography>
        </Box>
      ) 
    },
    { 
      field: 'petName', flex: 1.5, minWidth: 200, sortable: false, disableColumnMenu: true,
      renderHeader: () => (<TableSortLabel active={orderBy === 'petName'} direction={orderBy === 'petName' ? order : 'asc'} onClick={() => handleRequestSort('petName')} sx={{fontWeight: 'bold', color: '#5D4037'}}>Patient & Owner</TableSortLabel>),
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 1 }}>
            <Typography variant="body1" fontWeight="900" color="#3E2723" sx={{ lineHeight: 1.1 }}>{p.value}</Typography>
            <Typography variant="caption" color="textSecondary" fontWeight="600" sx={{ mt: 0.5 }}>{p.row.ownerName}</Typography>
        </Box>
      ) 
    },
    { 
      field: 'items', headerName: 'Items Purchased', flex: 1.5, minWidth: 250, sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 1 }}>
            <Typography variant="caption" color="textSecondary" fontWeight="500" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3 }}>
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
                <Chip icon={icon} label={p.value} size="small" sx={{ bgcolor: 'white', color: color, border: `1px solid ${color}40`, fontWeight: '900', boxShadow: 1, '& .MuiChip-icon': { color: color } }} />
            </Box>
        );
      }
    },
    { 
      field: 'total', width: 130, sortable: false, disableColumnMenu: true,
      renderHeader: () => (<TableSortLabel active={orderBy === 'total'} direction={orderBy === 'total' ? order : 'asc'} onClick={() => handleRequestSort('total')} sx={{fontWeight: 'bold', color: '#5D4037'}}>Total Paid</TableSortLabel>),
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body1" fontWeight="900" color={p.row.status === 'refunded' ? 'textSecondary' : '#2E7D32'} sx={{ textDecoration: p.row.status === 'refunded' ? 'line-through' : 'none' }}>
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
                <Chip label={isRefunded ? "REFUNDED" : "PAID"} color={isRefunded ? "error" : "success"} size="small" variant={isRefunded ? "outlined" : "filled"} sx={{ fontWeight: '900', letterSpacing: 0.5, boxShadow: isRefunded ? 0 : 2 }} />
            </Box>
          ); 
      } 
    },
    {
      field: 'actions', headerName: 'Actions', width: 100, align: 'center', headerAlign: 'center', sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Tooltip title="Reprint Receipt">
                <IconButton color="primary" size="small" onClick={() => handleReprint(p.row)} sx={{ bgcolor: '#E3F2FD', '&:hover': { bgcolor: '#BBDEFB' } }}>
                    <PrintIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            {p.row.status !== 'refunded' && (
                <Tooltip title="Process Refund">
                    <IconButton color="error" size="small" onClick={() => handleOpenRefund(p.row)} sx={{ bgcolor: '#FFEBEE', '&:hover': { bgcolor: '#FFCDD2' } }}>
                        <SettingsBackupRestoreIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
      )
    }
  ];

  return (
    <Box>
      {/* 1. THE MACRO-HEADER & FILTER PILLS */}
      <Paper sx={{ ...glassStyle, p: { xs: 2, md: 3 }, mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        
        {/* Top Row: Title & Controls */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          {/* THE FIX: Icon and Subtitle are GONE! */}
          <Typography variant="h5" sx={{ fontWeight: '900', color: '#5D4037', textTransform: 'uppercase', letterSpacing: 1 }}>
            Transaction Ledger
          </Typography>
          
          {/* THE FIX: Filter Pills are now visually grouped! */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField variant="outlined" size="small" placeholder="Search..." value={searchText} onChange={(e) => setSearchText(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{color: '#888'}}/></InputAdornment> }} sx={{ width: 240, bgcolor: 'white', borderRadius: 2 }} />
              <TextField type="date" size="small" label="Audit Date" InputLabelProps={{ shrink: true }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small"/></InputAdornment> }} sx={{ bgcolor: 'white', borderRadius: 1, minWidth: 160 }} />
              <FormControl size="small" sx={{ minWidth: 130, bgcolor: 'white', borderRadius: 1 }}>
                  <Select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} displayEmpty sx={{ fontWeight: 'bold', color: '#555' }}>
                      <MenuItem value="All">All Methods</MenuItem>
                      <MenuItem value="Cash">💵 Cash</MenuItem>
                      <MenuItem value="GCash">📱 GCash</MenuItem>
                      <MenuItem value="Card">💳 Card</MenuItem>
                  </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120, bgcolor: 'white', borderRadius: 1 }}>
                  <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} displayEmpty sx={{ fontWeight: 'bold', color: '#555' }}>
                      <MenuItem value="All">All Statuses</MenuItem>
                      <MenuItem value="Paid">✅ Paid</MenuItem>
                      <MenuItem value="Refunded">🚫 Refunded</MenuItem>
                  </Select>
              </FormControl>
          </Box>
        </Box>

        <Divider sx={{ borderStyle: 'dashed', borderColor: 'rgba(139, 69, 19, 0.2)' }} />

        {/* Bottom Row: The Metric Bar (Unchanged) */}
        <EodSummary totals={eodTotals} />
      </Paper>

      {/* 2. TRANSACTION TABLE WITH NATIVE SORTING & CURVE FIX */}
      <Paper sx={{ ...glassStyle, height: 'calc(100vh - 280px)', minHeight: 400, width: '100%', overflow: 'hidden' }}>
        <DataGrid 
            loading={loading} rows={processedSales} columns={columns} disableRowSelectionOnClick rowHeight={70}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} pageSizeOptions={[10, 25, 50, 100]}
            sx={{ 
                border: 'none', 
                bgcolor: 'transparent',
                // THE FIX: The 'Curve Fix' for perfect Glassmorphism
                '& .MuiDataGrid-main': { borderRadius: 4 },
                // THE FIX: The 'Breathing Room' padding
                '& .MuiDataGrid-columnHeaders': { bgcolor: 'rgba(255, 255, 255, 0.4)', color: '#5D4037', fontWeight: 'bold', fontSize: '0.95rem', borderBottom: '2px solid #D7CCC8', px: 2 }, 
                // THE FIX: The 'Separator Killer'
                '& .MuiDataGrid-columnSeparator': { display: 'none' },
                '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)', px: 2 },
                '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(255,255,255,0.4)' }
            }} 
        />
      </Paper>

      {/* REFUND MODAL */}
      <Dialog open={openRefund} onClose={() => setOpenRefund(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 }}}>
        <DialogTitle sx={{ bgcolor: '#D32F2F', color: 'white', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsBackupRestoreIcon /> Authorize Transaction Reversal
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: '#FAFAFA' }}>
          <Alert severity="warning" sx={{ mb: 3, fontWeight: 'bold', border: '1px solid #F57C00' }}>
            You are about to permanently refund ₱{selectedSale?.total?.toFixed(2)} to {selectedSale?.ownerName}.
          </Alert>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'white', mb: 3, borderRadius: 2 }}>
            <Typography variant="caption" fontWeight="900" color="textSecondary" display="block" sx={{ mb: 1, borderBottom: '1px solid #eee', pb: 1 }}>ITEMS TO REVERSE:</Typography>
            {selectedSale?.items?.map((item, i) => <Typography key={i} variant="body2" fontWeight="bold" sx={{ mt: 0.5, color: '#333' }}>• {item.qty}x {item.name} (₱{(item.price * item.qty).toFixed(2)})</Typography>)}
          </Paper>
          <FormControlLabel control={<Switch checked={restock} onChange={(e) => setRestock(e.target.checked)} color="success" />} label={<Box><Typography variant="body2" fontWeight="bold" color="#2E7D32">Restock physical products?</Typography><Typography variant="caption" color="textSecondary">Uncheck this if the items were opened/damaged and cannot be resold.</Typography></Box>} />
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid #E0E0E0', bgcolor: 'white' }}>
          <Button onClick={() => setOpenRefund(false)} sx={{ fontWeight: 'bold', color: '#555', px: 3, mr: 'auto' }}>Cancel</Button>
          <Button onClick={executeRefund} variant="contained" color="error" startIcon={<SettingsBackupRestoreIcon />} sx={{ fontWeight: '900', px: 4, py: 1.5, borderRadius: 2, boxShadow: 3 }}>
            Confirm Refund
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}