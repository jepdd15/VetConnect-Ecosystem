import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Box, Typography, Paper, Button, TextField, MenuItem, 
  Chip, IconButton, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, FormControl, InputLabel, Select,
  FormControlLabel, Switch, Alert, Divider, ListSubheader, InputAdornment
} from '@mui/material';

// --- ALL REQUIRED ICONS ---
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import PaidIcon from '@mui/icons-material/Paid';
import SaveIcon from '@mui/icons-material/Save';
import MedicationIcon from '@mui/icons-material/Medication';
import DescriptionIcon from '@mui/icons-material/Description'; 
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'; 
import MedicalServicesIcon from '@mui/icons-material/MedicalServices'; // THIS WAS MISSING!

import { doc, getDoc, collection, runTransaction, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function POSModal({ open, onClose, patient, inventoryList, servicesList }) {
  const [cart, setCart] = useState([]);
  const [selectedItemVal, setSelectedItemVal] = useState(''); 
  const [paymentMethod, setPaymentMethod] = useState('Cash'); 
  const [applyScPwd, setApplyScPwd] = useState(false); 
  const [hasScId, setHasScId] = useState(false); 
  const [loading, setLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');

  // --- NEW: BARCODE SCANNER STATE ---
  const [barcodeInput, setBarcodeInput] = useState('');

  const[openRxOverride, setOpenRxOverride] = useState(false);
  const [pendingRxItem, setPendingRxItem] = useState(null);
  const [extVetName, setExtVetName] = useState('');
  const[extClinicName, setExtClinicName] = useState('');

  useEffect(() => {
    const initPOS = async () => {
      if (open && patient) {
        let initialCart =[];
        if (patient.prescribedItems && patient.prescribedItems.length > 0) {
            initialCart = patient.prescribedItems.map(item => ({ ...item, isPrescribed: item.isBase ? false : true }));
        } else {
            initialCart =[{ type: 'service', id: 'svc_fee', name: patient.serviceType, price: patient.servicePrice || 0, qty: 1, isBase: true, isDiscountable: true }]; 
        }
        setCart(initialCart); setSelectedItemVal(''); setPaymentMethod('Cash'); setBarcodeInput('');
        setDepositAmount(patient.depositPaid ? patient.depositPaid.toString() : '');

        let foundId = false;
        try {
            if (patient.ownerId && patient.ownerId !== 'WALK_IN_USER') {
                const userDoc = await getDoc(doc(db, "users", patient.ownerId));
                if (userDoc.exists() && userDoc.data().seniorId) foundId = true;
            }
        } catch (e) { console.error(e); }
        setHasScId(foundId); setApplyScPwd(foundId); 
      }
    };
    initPOS();
  }, [open, patient]);

  // --- CORE ADD LOGIC (Shared by Dropdown and Scanner) ---
  const processProductToCart = (p) => {
      if (p.stock < 1) return alert("Out of Stock!"); 
      
      // 🚨 THE RX INTERCEPT 🚨
      if (p.isRxOnly) {
        setPendingRxItem(p);
        setOpenRxOverride(true); 
        return; 
      }
      pushToCartArray({ type: 'product', id: p.id, name: p.itemName, price: p.price, qty: 1, isDiscountable: p.category === 'Medicine' || p.category === 'Vaccine' });
  };

  const pushToCartArray = (newItem) => {
    const existingIndex = cart.findIndex(c => c.id === newItem.id && !c.isExternalRx);
    if (existingIndex >= 0) {
        updateCartQty(existingIndex, 1);
    } else {
        setCart(prev =>[...prev, newItem]); 
    }
  };

  // --- UI TRIGGERS ---
  const handleDropdownAdd = () => { 
    if (!selectedItemVal) return; 
    const[type, id] = selectedItemVal.split('|');
    if (type === 'product') {
      const p = inventoryList.find(i => i.id === id);
      if (p) processProductToCart(p);
    } else if (type === 'service') {
      const s = servicesList.find(i => i.id === id);
      if (s) pushToCartArray({ type: 'service', id: s.id, name: s.name, price: s.price, qty: 1, isDiscountable: true });
    }
    setSelectedItemVal(''); 
  };

  // --- NEW: SCANNER TRIGGER ---
  const handleBarcodeSubmit = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = barcodeInput.trim();
      if (!code) return;

      const foundItem = inventoryList.find(i => i.sku === code);
      if (foundItem) {
          processProductToCart(foundItem);
      } else {
          alert(`Barcode [${code}] not found in inventory.`);
      }
      setBarcodeInput(''); // Clear instantly for next scan
    }
  };

  const handleExternalRxApprove = () => {
    if (!extVetName || !extClinicName) return alert("You must record the prescribing Vet and Clinic.");
    pushToCartArray({ type: 'product', id: pendingRxItem.id, name: pendingRxItem.itemName, price: pendingRxItem.price, qty: 1, isDiscountable: true, isExternalRx: true, externalVet: extVetName, externalClinic: extClinicName });
    setOpenRxOverride(false); setPendingRxItem(null); setExtVetName(''); setExtClinicName('');
  };
  
  const updateCartQty = (index, delta) => {
    const newCart = [...cart];
    const newQty = newCart[index].qty + delta;
    if (newQty < 1) return; 
    if (newCart[index].type === 'product') {
        const invItem = inventoryList.find(i => i.id === newCart[index].id);
        if (invItem && newQty > invItem.stock) return alert(`Only ${invItem.stock} in stock!`);
    }
    newCart[index].qty = newQty;
    setCart(newCart);
  };

  const removeFromCart = (index) => { 
    const item = cart[index];
    if (item.isBase) return;
    if (item.isPrescribed && !window.confirm(`⚠️ WARNING: The Veterinarian explicitly prescribed [${item.name}]. Are you sure you want to remove it?`)) return;
    const newCart = [...cart]; newCart.splice(index, 1); setCart(newCart); 
  };

  const calculateFinancials = () => {
    let subtotal = 0; let vatExemptTotal = 0; let discountAmount = 0;
    cart.forEach(item => {
      const itemTotal = item.price * item.qty;
      subtotal += itemTotal;
      if (applyScPwd && item.isDiscountable) {
        const itemVatExempt = itemTotal / 1.12;
        vatExemptTotal += itemVatExempt;
        discountAmount += itemVatExempt * 0.20;
      }
    });
    const finalTotal = subtotal - discountAmount; 
    const deposit = parseFloat(depositAmount) || 0;
    const balanceDue = finalTotal - deposit;
    return { subtotal: subtotal.toFixed(2), vatExempt: applyScPwd && discountAmount > 0 ? vatExemptTotal.toFixed(2) : "0.00", discount: discountAmount.toFixed(2), total: finalTotal.toFixed(2), deposit: deposit.toFixed(2), balanceDue: balanceDue > 0 ? balanceDue.toFixed(2) : "0.00" };
  };
  const financials = calculateFinancials();

  const handleSaveDraft = async () => {
    setLoading(true);
    try { await updateDoc(doc(db, "appointments", patient.id), { prescribedItems: cart, depositPaid: parseFloat(depositAmount) || 0 }); alert("Invoice Draft Saved."); onClose(); } 
    catch (e) { alert("Error: " + e.message); } finally { setLoading(false); }
  };

  const handleCheckout = async () => { 
    setLoading(true);
    try { 
      await runTransaction(db, async (transaction) => { 
        for (const item of cart) { 
          if (item.type === 'product') { 
            const itemRef = doc(db, "inventory", item.id); const itemDoc = await transaction.get(itemRef); 
            if (!itemDoc.exists()) throw `Product not found`; 
            const data = itemDoc.data(); let currentStock = data.stock || 0; let batches = data.batches ||[]; 
            if (currentStock < item.qty) throw `Not enough stock`; 
            batches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)); 
            const today = new Date(); today.setHours(0,0,0,0); batches = batches.filter(b => new Date(b.expiryDate) >= today); 
            const sellableStock = batches.reduce((sum, b) => sum + b.qty, 0); 
            if (sellableStock < item.qty) throw `Not enough UNEXPIRED stock for ${item.name}.`; 
            let remainingToDeduct = item.qty; let batchesUsed =[]; 
            batches = batches.map(b => { if (remainingToDeduct <= 0) return b; let amountTaken = 0; if (b.qty >= remainingToDeduct) { amountTaken = remainingToDeduct; b.qty -= remainingToDeduct; remainingToDeduct = 0; } else { amountTaken = b.qty; remainingToDeduct -= b.qty; b.qty = 0; } if (amountTaken > 0) batchesUsed.push(`${b.batchNumber} (-${amountTaken})`); return b; }); 
            batches = batches.filter(b => b.qty > 0); 
            transaction.update(itemRef, { stock: currentStock - item.qty, batches: batches }); 
            const logRef = doc(collection(db, "inventory_logs")); const externalNote = item.isExternalRx ? `[Ext Rx: ${item.externalVet}]` : '';
            transaction.set(logRef, { itemId: item.id, itemName: item.name, type: 'sale', quantity: item.qty, reason: `Sold to ${patient.petName} ${externalNote}`, oldStock: currentStock, newStock: currentStock - item.qty, batchInfo: `FIFO: ${batchesUsed.join(', ')}`, user: "POS System", timestamp: Timestamp.now() }); 
          } 
        } 
        const saleRef = doc(collection(db, "sales")); 
        transaction.set(saleRef, { appointmentId: patient.id, petName: patient.petName, ownerName: patient.ownerName || 'Walk-In', items: cart, subtotal: parseFloat(financials.subtotal), discount: parseFloat(financials.discount), depositPaid: parseFloat(financials.deposit), total: parseFloat(financials.total), paymentMethod: paymentMethod, hasScPwdDiscount: applyScPwd, date: Timestamp.now(), cashier: "Admin" }); 
        const apptRef = doc(db, "appointments", patient.id); 
        transaction.update(apptRef, { status: 'completed', timeCompleted: Timestamp.now() }); 
      }); 
      onClose(); alert(`Transaction Complete! Collected: ₱${financials.balanceDue}`); 
    } catch (error) { alert("Checkout Failed: " + error.message); } finally { setLoading(false); }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ bgcolor: '#2E7D32', color: 'white', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight="bold">Checkout: {patient?.petName}</Typography>
          <Chip label={patient?.ownerName || 'Walk-In'} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
        </DialogTitle>
        
        <DialogContent dividers sx={{ bgcolor: '#F5F5F5', display: 'flex', gap: 3 }}>
          {/* LEFT: CART ITEMS */}
          <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
            
            {/* NEW: BARCODE SCANNER BAR */}
            <Box sx={{ mb: 2 }}>
              <TextField 
                autoFocus 
                fullWidth 
                placeholder="Scan Barcode / SKU here..." 
                value={barcodeInput} 
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeSubmit} // Listens for the Enter key from the USB scanner
                InputProps={{ 
                  startAdornment: <InputAdornment position="start"><QrCodeScannerIcon color="primary" /></InputAdornment>, 
                  spellCheck: 'false' 
                }} 
                sx={{ bgcolor: '#E3F2FD', '& fieldset': { borderColor: '#90CAF9', borderWidth: 2 } }} 
              />
            </Box>

            <Divider sx={{ mb: 2 }}>OR MANUAL ENTRY</Divider>

            <Box sx={{ display: 'flex', gap: 1, mb: 3, alignItems: 'center' }}>
              <FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}>
                  <InputLabel>Select Item / Service</InputLabel>
                  <Select value={selectedItemVal} label="Select Item / Service" onChange={(e) => setSelectedItemVal(e.target.value)}>
                      <ListSubheader sx={{fontWeight:'bold', bgcolor:'#EFEBE9'}}>Clinic Services (Add-ons)</ListSubheader>
                      {servicesList.filter(s => s.name !== patient?.serviceType).map((s) => (
                        <MenuItem key={`service|${s.id}`} value={`service|${s.id}`}>
                           <MedicalServicesIcon fontSize="small" sx={{mr:1, color:'#1565C0'}}/> {s.name} (+₱{s.price})
                        </MenuItem>
                      ))}
                      <ListSubheader sx={{fontWeight:'bold', bgcolor:'#EFEBE9'}}>Inventory Products</ListSubheader>
                      {inventoryList.map((item) => (
                        <MenuItem key={`product|${item.id}`} value={`product|${item.id}`} disabled={item.stock < 1}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <span>
                              <MedicationIcon fontSize="small" sx={{mr:1, color:'#8B4513', verticalAlign:'middle'}}/> 
                              {item.itemName} 
                              {item.isRxOnly && <Typography component="span" color="error" variant="caption" sx={{ ml: 1, fontWeight: 'bold' }}>(Rx Only)</Typography>}
                            </span>
                            <Box><Chip label={`Stock: ${item.stock}`} size="small" color={item.stock < 5 ? "error" : "default"} sx={{mr:1}}/><b>₱{item.price}</b></Box>
                          </Box>
                        </MenuItem>
                      ))}
                  </Select>
              </FormControl>
              <Button variant="contained" onClick={handleDropdownAdd} startIcon={<AddShoppingCartIcon />} sx={{ bgcolor: '#2E7D32', height: 40 }}>Add</Button>
            </Box>

            {/* CART TABLE */}
            <TableContainer component={Paper} variant="outlined" sx={{ flexGrow: 1 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#EFEBE9' }}>
                  <TableRow><TableCell>Item</TableCell><TableCell align="center">Qty</TableCell><TableCell align="right">Price</TableCell><TableCell align="right">Total</TableCell><TableCell align="center"></TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {cart.map((item, index) => (
                    <TableRow key={index} sx={{ bgcolor: item.isBase ? '#E3F2FD' : 'white' }}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {item.isPrescribed && <Tooltip title="Prescribed by Vet"><MedicationIcon fontSize="small" color="warning" sx={{verticalAlign:'middle', mr:0.5}}/></Tooltip>}
                          {item.name}
                        </Typography>
                        {item.isBase && <Typography variant="caption" color="primary" display="block">Base Service</Typography>}
                        {item.isExternalRx && <Typography variant="caption" color="secondary" display="block"><DescriptionIcon fontSize="inherit"/> Ext Rx: {item.externalVet}</Typography>}
                        {!item.isDiscountable && <Typography variant="caption" color="error" display="block">No SC/PWD</Typography>}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {!item.isBase && <IconButton size="small" onClick={() => updateCartQty(index, -1)}><Typography fontWeight="bold">-</Typography></IconButton>}
                          <Typography sx={{ mx: 1, fontWeight: 'bold' }}>{item.qty}</Typography>
                          {!item.isBase && <IconButton size="small" onClick={() => updateCartQty(index, 1)}><Typography fontWeight="bold">+</Typography></IconButton>}
                        </Box>
                      </TableCell>
                      <TableCell align="right">₱{item.price}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>₱{(item.price * item.qty).toFixed(2)}</TableCell>
                      <TableCell align="center">
                        {!item.isBase && ( <IconButton color="error" size="small" onClick={() => removeFromCart(index)}><RemoveCircleIcon fontSize="small"/></IconButton> )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* RIGHT: BILLING & PAYMENT (Same as before) */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
             <Paper variant="outlined" sx={{ p: 2, bgcolor: 'white' }}>
                <Typography variant="subtitle2" fontWeight="bold" color="textSecondary" gutterBottom>DISCOUNTS</Typography>
                {hasScId && <Alert severity="info" icon={false} sx={{ py: 0, px: 1, mb: 1, '& .MuiAlert-message': { p: 0.5, fontSize: '0.75rem' } }}>Senior/PWD ID found.</Alert>}
                <FormControlLabel control={<Switch checked={applyScPwd} onChange={(e) => setApplyScPwd(e.target.checked)} color="secondary" />} label={<Typography variant="body2" fontWeight="bold">Apply SC/PWD</Typography>} />
                <Typography variant="caption" color="textSecondary" display="block">Applies only to eligible medical services & meds.</Typography>
             </Paper>

             <Paper variant="outlined" sx={{ p: 2, bgcolor: '#FAFAFA' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="body2" color="textSecondary">Subtotal:</Typography><Typography variant="body2" fontWeight="bold">₱{financials.subtotal}</Typography></Box>
                {applyScPwd && parseFloat(financials.discount) > 0 && (
                  <><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="body2" color="textSecondary">Eligible VAT Exempt:</Typography><Typography variant="body2">₱{financials.vatExempt}</Typography></Box><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="body2" color="error">SC/PWD Discount:</Typography><Typography variant="body2" color="error" fontWeight="bold">- ₱{financials.discount}</Typography></Box></>
                )}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 2 }}><Typography variant="body1" fontWeight="bold" color="#333">GRAND TOTAL:</Typography><Typography variant="h6" fontWeight="bold" color="#333">₱{financials.total}</Typography></Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}><Typography variant="body2" color="textSecondary">Less: Deposit Paid</Typography><TextField size="small" type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} InputProps={{ startAdornment: <Typography sx={{mr: 0.5, color: '#aaa'}}>₱</Typography> }} sx={{ width: 100, bgcolor: 'white' }} /></Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}><Typography variant="h6" fontWeight="bold" color="#333">BALANCE DUE:</Typography><Typography variant="h5" fontWeight="bold" color="#2E7D32">₱{financials.balanceDue}</Typography></Box>
             </Paper>

             <Paper variant="outlined" sx={{ p: 2, bgcolor: 'white' }}>
                <Typography variant="subtitle2" fontWeight="bold" color="textSecondary" gutterBottom>PAYMENT METHOD</Typography>
                <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                  <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <MenuItem value="Cash">💵 Cash</MenuItem>
                    <MenuItem value="GCash">📱 GCash / Maya</MenuItem>
                    <MenuItem value="Card">💳 Credit / Debit Card</MenuItem>
                    <MenuItem value="Bank Transfer">🏦 Bank Transfer</MenuItem>
                  </Select>
                </FormControl>
             </Paper>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#EFEBE9', display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={onClose} color="inherit" sx={{ fontWeight: 'bold' }}>Cancel</Button>
          <Box sx={{ display: 'flex', gap: 2 }}>
              <Button onClick={handleSaveDraft} disabled={loading} variant="outlined" color="primary" startIcon={<SaveIcon />}>Save Invoice Draft</Button>
              <Button onClick={handleCheckout} disabled={loading} variant="contained" color="success" size="large" startIcon={<PaidIcon />} sx={{ px: 4, fontWeight: 'bold' }}>Settle Balance (₱{financials.balanceDue})</Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* 🚨 EXTERNAL RX OVERRIDE MODAL */}
      <Dialog open={openRxOverride} onClose={() => setOpenRxOverride(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#D32F2F', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <DescriptionIcon /> External Prescription Override
        </DialogTitle>
        <DialogContent sx={{ p: 3, bgcolor: '#FAFAFA' }}>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight="bold">You are attempting to sell a Prescription-Only (Rx) medication over the counter.</Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
              By law, you must record the external Veterinarian and Clinic that issued the prescription to dispense <b>{pendingRxItem?.itemName}</b> without an internal consultation.
            </Typography>
          </Alert>
          <TextField autoFocus fullWidth label="Prescribing Veterinarian Name" placeholder="e.g. Dr. Juan Dela Cruz" value={extVetName} onChange={(e) => setExtVetName(e.target.value)} sx={{ mb: 2, bgcolor: 'white' }} />
          <TextField fullWidth label="External Clinic Name" placeholder="e.g. ABC Animal Hospital" value={extClinicName} onChange={(e) => setExtClinicName(e.target.value)} sx={{ bgcolor: 'white' }} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenRxOverride(false)} sx={{ color: '#555', fontWeight: 'bold' }}>Cancel Sale</Button>
          <Button onClick={handleExternalRxApprove} variant="contained" color="error" sx={{ fontWeight: 'bold' }}>Authorize & Add to Cart</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}