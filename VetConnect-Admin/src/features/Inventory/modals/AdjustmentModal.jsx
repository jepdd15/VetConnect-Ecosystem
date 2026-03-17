import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Box, Typography, MenuItem, Select, FormControl, InputLabel, Paper, Grid, Alert } from '@mui/material';
import FactCheckIcon from '@mui/icons-material/FactCheck';

export default function AdjustmentModal({ open, onClose, item, type, execute, showToast }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [batchNum, setBatchNum] = useState('');
  const [expiry, setExpiry] = useState('');
  const [uom, setUom] = useState('base');
  const [targetBatch, setTargetBatch] = useState('auto');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setQty(''); setReason(''); setBatchNum(''); setExpiry(''); setTargetBatch('auto'); }
  }, [open]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await execute(item, type, qty, reason, batchNum, expiry, uom, targetBatch);
      showToast("Inventory updated successfully.", "success");
      onClose();
    } catch (e) {
      showToast(e.message || e, "error");
    } finally {
      setLoading(false);
    }
  };

  const variance = (type === 'reconcile' && qty !== '') ? (parseInt(qty) - (item?.stock || 0)) : 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: type === 'restock' ? '#2E7D32' : type === 'reconcile' ? '#5D4037' : type === 'internal_use' ? '#9C27B0' : '#D32F2F', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
        {type === 'reconcile' && <FactCheckIcon />}
        {type === 'restock' ? "Restock Inventory" : type === 'reconcile' ? "Audit / Reconcile Count" : type === 'internal_use' ? "Internal / Clinic Use" : "Report Wastage"}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3, pt: 3, bgcolor: '#FAFAFA' }}>
        <Paper variant="outlined" sx={{ mt: 1, mb: 3, p: 2, bgcolor: 'white', borderRadius: 2, borderLeft: type === 'reconcile' ? '4px solid #5D4037' : '4px solid #aaa' }}>
          <Typography variant="body1">Item: <b>{item?.itemName}</b></Typography>
          {type === 'reconcile' ? (
            <Typography sx={{ color: '#D32F2F', fontWeight: 'bold', mt: 1 }}>Current System Count: {item?.stock || 0} {item?.uomBase || 'units'}</Typography>
          ) : (
            <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>UOM: 1 {item?.uomPurchase || 'Bulk'} = {item?.conversionFactor || 1} {item?.uomBase || 'Units'}</Typography>
          )}
        </Paper>

        <Grid container spacing={2}>
          {type === 'restock' && (
            <Grid item xs={12}>
              <FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}>
                <InputLabel>Unit Type Received</InputLabel>
                <Select value={uom} label="Unit Type Received" onChange={e => setUom(e.target.value)}>
                  <MenuItem value="base">Individual {item?.uomBase || 'units'}</MenuItem>
                  <MenuItem value="purchase">Bulk {item?.uomPurchase || 'packs'}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          )}

          {((type === 'wastage' || type === 'internal_use') || (type === 'reconcile' && variance < 0)) && (
            <Grid item xs={12}>
              <FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}>
                <InputLabel>Target Batch for Deduction</InputLabel>
                <Select value={targetBatch} label="Target Batch for Deduction" onChange={e => setTargetBatch(e.target.value)}>
                  <MenuItem value="auto" sx={{ fontStyle: 'italic', fontWeight: 'bold', color: '#1565C0' }}>Auto-Select (FIFO - Oldest First)</MenuItem>
                  {item?.batches?.filter(b => b.qty > 0).map((b, i) => (
                    <MenuItem key={i} value={b.batchNumber}>Batch {b.batchNumber} (Available: {b.qty} {item?.uomBase || 'units'})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          <Grid item xs={12}>
            <TextField 
              autoFocus fullWidth size="small" type="number" sx={{ bgcolor: 'white' }}
              label={type === 'reconcile' ? `Actual Physical Count on Shelf (${item?.uomBase || 'units'})` : `Quantity (${uom === 'purchase' ? (item?.uomPurchase || 'bulk') : (item?.uomBase || 'units')})`} 
              value={qty} onChange={e => setQty(e.target.value)} 
            />
            {type === 'reconcile' && qty !== '' && (
               <Box sx={{ mt: 1.5, p: 1.5, bgcolor: variance === 0 ? '#E8F5E9' : '#FFEBEE', borderRadius: 1, border: '1px solid', borderColor: variance === 0 ? '#A5D6A7' : '#EF9A9A' }}>
                  <Typography variant="body2" fontWeight="bold" color={variance === 0 ? 'green' : 'error'}>
                    Variance: {variance > 0 ? '+' : ''}{variance} {variance === 0 ? '(Perfect Match)' : variance > 0 ? '(Extra Stock Found)' : '(Missing Stock)'}
                  </Typography>
               </Box>
            )}
            {type === 'restock' && uom === 'purchase' && qty && (
              <Typography variant="caption" sx={{color: 'green', fontWeight: 'bold', mt: 1, display: 'block'}}>
                ➜ Multiplying... Adding {qty * (item?.conversionFactor || 1)} {item?.uomBase || 'units'} to Database
              </Typography>
            )}
          </Grid>

          {(type === 'restock' || (type === 'reconcile' && variance > 0)) && (
            <>
              <Grid item xs={6}><TextField label="Batch #" fullWidth size="small" value={batchNum} onChange={e=>setBatchNum(e.target.value)} sx={{ bgcolor: 'white' }} helperText={type==='reconcile' ? 'Required for found stock' : ''}/></Grid>
              <Grid item xs={6}><TextField label="Expiry Date" type="date" fullWidth size="small" InputLabelProps={{shrink:true}} value={expiry} onChange={e=>setExpiry(e.target.value)} sx={{ bgcolor: 'white' }} /></Grid>
            </>
          )}

          <Grid item xs={12}>
            <TextField label={type === 'reconcile' ? "Auditor Name / Notes" : "Reason / Source / P.O. Number"} fullWidth size="small" value={reason} onChange={e=>setReason(e.target.value)} sx={{ bgcolor: 'white' }} />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ p: 2, bgcolor: '#EFEBE9' }}>
        <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037' }}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={loading} color={type==='restock'?'success': type==='reconcile'?'primary' : type==='internal_use'?'secondary':'error'} sx={{ fontWeight: 'bold', px: 3, bgcolor: type==='reconcile' ? '#5D4037' : undefined }}>
          {loading ? "Processing..." : type === 'reconcile' ? "Log Audit" : "Confirm Change"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}