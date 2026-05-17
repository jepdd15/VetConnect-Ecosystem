import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Paper, Button, TextField, MenuItem,
  Chip, IconButton, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, FormControl, InputLabel, Select,
  FormControlLabel, Switch, Alert, Divider, ListSubheader, InputAdornment, Tooltip,
  ToggleButtonGroup, ToggleButton, Popover, Autocomplete, Snackbar,
} from '@mui/material';

// --- ALL REQUIRED ICONS ---
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import PaidIcon from '@mui/icons-material/Paid';
import PrintIcon from '@mui/icons-material/Print';
import SaveIcon from '@mui/icons-material/Save';
import MedicationIcon from '@mui/icons-material/Medication';
import DescriptionIcon from '@mui/icons-material/Description';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import PetsIcon from '@mui/icons-material/Pets';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';

import { doc, getDoc, collection, runTransaction, Timestamp, updateDoc, increment, arrayUnion, getDocs, query, where } from 'firebase/firestore';
import { buildPaymentDocPayload } from '../utils/paymentUtils';
import { isRefNumberRequired, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../constants/paymentMethods';
import { COLORS, FONT } from '../theme/designTokens';
import { db } from '../firebaseConfig';
import { useUser } from '../context/UserContext';
import { useClinicSettings } from '../hooks/useClinicSettings';
import { resolveTieredPrice } from '../utils/resolveTieredPrice';
import { makePulseEventId } from '../utils/pulseUtils';
import { sendPushNotification } from '../utils/sendPushNotification';
import { printViaIframe, downloadHtmlAsFile, emailReceiptToOwner } from '../utils/receiptUtils';
import { computeSingleOwnerBalanceReminder } from '../utils/computeBalanceReminderQueue';
import { formatDosage } from '../constants/dosageUnits';

// T4.149: Mandatory reason options for custom bill discounts — enforces audit accountability.
const DISCOUNT_REASONS = [
  'Loyalty',
  'First Visit',
  'Promo',
  'Vet Discretion',
  'Clinic Error',
  'Other',
];

/**
 * Escapes HTML special characters to prevent XSS in print templates.
 */
const esc = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

export default function POSModal({ open, onClose, patient, inventoryList, servicesList, isDayClosed = false, closingData = null }) {
  const isRetailMode = !patient;
  const { profile } = useUser();
  const clinicSettings = useClinicSettings();
  const [cart, setCart] = useState([]);
  // T4.150: Multi-tender state — array of { method, amount, amountTendered, referenceNumber }.
  // Default: one Cash tender for the full balance. Replaces single paymentMethod + amountTendered.
  // T4.237: referenceNumber added — required for GCash/Maya/Bank/Check tenders (D3).
  const [paymentTenders, setPaymentTenders] = useState([
    { method: 'cash', amount: '', amountTendered: '', referenceNumber: '' }
  ]);
  const [applyScPwd, setApplyScPwd] = useState(false);
  const[hasScId, setHasScId] = useState(false);
  const [loading, setLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'error' });
  const showToast = (message, severity = 'error') => setToast({ open: true, message, severity });
  const [confirmRemove, setConfirmRemove] = useState(null);

  // T4.149: Custom discount system.
  // Per-item discounts stored as an object keyed by cart index: { type: '%' | '₱', value: number }
  const [itemDiscounts, setItemDiscounts] = useState({});
  // Transaction-level bill discount
  const [billDiscountType, setBillDiscountType] = useState('%');    // '%' or '₱'
  const [billDiscountValue, setBillDiscountValue] = useState('');
  const [billDiscountReason, setBillDiscountReason] = useState('');
  // Per-item discount popover state
  const [discountAnchorEl, setDiscountAnchorEl] = useState(null);
  const [discountEditIndex, setDiscountEditIndex] = useState(null);
  const [editDiscType, setEditDiscType] = useState('%');
  const [editDiscValue, setEditDiscValue] = useState('');

  const [openRxOverride, setOpenRxOverride] = useState(false);
  const[pendingRxItem, setPendingRxItem] = useState(null);
  const [extVetName, setExtVetName] = useState('');
  const [extClinicName, setExtClinicName] = useState('');

  // T4.151/T4.152: Checkout success overlay state — replaces window.confirm.
  // { receiptHTML: string, total: string } when checkout completes, null otherwise.
  const [checkoutSuccess, setCheckoutSuccess] = useState(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [emailFeedback, setEmailFeedback] = useState('');

  const [showCustomerNudge, setShowCustomerNudge] = useState(false);
  const [linkedClient, setLinkedClient] = useState(null);
  const [clientOptions, setClientOptions] = useState([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);

  // T4.150: Derive the legacy paymentMethod (largest tender by amount) for backward compat.
  const primaryPaymentMethod = useMemo(() => {
    if (paymentTenders.length === 0) return 'cash';
    if (paymentTenders.length === 1) return paymentTenders[0].method;
    const sorted = [...paymentTenders].sort((a, b) =>
      (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0)
    );
    return sorted[0].method;
  }, [paymentTenders]);

  // T4.150: Tender CRUD helpers.
  const updateTender = (index, field, value) => {
    const currentBalance = parseFloat(financials?.balanceDue) || 0;
    setPaymentTenders(prev => {
      const next = [...prev];
      if (field === 'method' && value !== 'cash') {
        next[index] = { ...next[index], [field]: value, amountTendered: '' };
      } else {
        next[index] = { ...next[index], [field]: value };
      }

      if (field === 'amount' && next.length > 1 && index !== next.length - 1) {
        const otherSum = next.reduce((sum, t, i) =>
          i === next.length - 1 ? sum : sum + (parseFloat(t.amount) || 0), 0
        );
        const leftover = Math.max(0, currentBalance - otherSum);
        next[next.length - 1] = {
          ...next[next.length - 1],
          amount: leftover > 0 ? leftover.toFixed(2) : '',
        };
      }
      return next;
    });
  };

  const addTender = () => {
    // Pick first unused method, defaulting to GCash.
    const usedMethods = new Set(paymentTenders.map(t => t.method));
    const available = PAYMENT_METHODS.find(m => !usedMethods.has(m)) || 'gcash';
    setPaymentTenders(prev => [...prev, { method: available, amount: '', amountTendered: '', referenceNumber: '' }]);
  };

  const removeTender = (index) => {
    if (paymentTenders.length <= 1) return; // Minimum 1 row
    setPaymentTenders(prev => prev.filter((_, i) => i !== index));
  };

  // --- 1. INITIALIZATION & AUTO-BUNDLE ENGINE ---

  /**
   * Builds the cart items for an appointment.
   *
   * @param {object} appt - The appointment row (from rows state, already in memory).
   * @returns {Array} Array of cart item objects.
   */
  const buildCartForAppointment = (appt) => {
    const prefix = '';
    const items = [];

    const apptItems = appt.encounterItems || appt.prescribedItems;
    if (apptItems && apptItems.length > 0) {
      // T3.39: Build a lookup map from pharmacy's dispensingChecklist (written by
      // DispensingVerificationDialog on confirm). Keyed by item ID (with name fallback)
      // so partial dispensing quantities override the prescribed quantities in the POS cart.
      const checklistMap = new Map();
      if (appt.dispensingChecklist && appt.dispensingChecklist.length > 0) {
        appt.dispensingChecklist.forEach(ci => checklistMap.set(ci.id || ci.name, ci));
      }

      apptItems.forEach(item => {
        const ci = checklistMap.get(item.id || item.name);
        // Products with a dispensingChecklist entry use the verified dispensed qty.
        // Items dispensed at qty=0 are excluded from the cart entirely.
        const effectiveQty = (ci && item.type === 'product' && ci.qty !== undefined)
          ? ci.qty
          : item.qty;

        if (item.type === 'product' && effectiveQty === 0) return;

        items.push({
          ...item,
          qty: effectiveQty,
          name: `${prefix}${item.name}`,
          isPrescribed: item.isBase ? false : true,
          _sourceAppointmentId: appt.id,
          _sourcePetName: appt.petName,
        });
      });
    } else {
      const bookedServices = appt.services && appt.services.length > 0
        ? appt.services
        : [{ id: 'svc_fee', name: appt.serviceType || 'Service', price: appt.servicePrice || 0 }];

      bookedServices.forEach(svc => {
        const svcDef = servicesList.find(s => s.id === svc.id);
        const petWeight = appt.petWeight ? parseFloat(appt.petWeight) : null;
        const price = svcDef
          ? (resolveTieredPrice(svcDef, petWeight) || svcDef.price || svc.price || 0)
          : (svc.price ?? 0);

        // T4.Forensic: Flag items that are not in the official catalog
        const isUnverified = !svcDef && svc.id !== 'svc_fee';

        items.push({
          type: 'service',
          id: svc.id || `svc_${svc.name}`,
          name: `${prefix}${svc.name}`,
          price,
          qty: 1,
          isBase: true,
          isDiscountable: svcDef?.isScPwdEligible !== false,
          isUnverified,
          _sourceAppointmentId: appt.id,
          _sourcePetName: appt.petName,
        });

        if (svcDef) {
          const linkedIds = svcDef.linkedProducts
            || (svcDef.linkedProduct ? [svcDef.linkedProduct] : []);
          linkedIds.forEach(productId => {
            const linkedInv = inventoryList.find(i => i.id === productId);
            if (linkedInv) {
              items.push({
                type: 'product',
                id: linkedInv.id,
                name: `${prefix}${linkedInv.itemName}`,
                price: linkedInv.price,
                qty: 1,
                isDiscountable: !!linkedInv.isMedicine,
                isAutoBundled: true,
                isBase: false,
                _sourceAppointmentId: appt.id,
                _sourcePetName: appt.petName,
              });
            }
          });
        }
      });
    }

    return items;
  };

  useEffect(() => {
    const initPOS = async () => {
      if (checkoutSuccess) return;
      if (open && patient) {
        const initialCart = buildCartForAppointment(patient);

        setCart(initialCart); setPaymentTenders([{ method: 'cash', amount: '', amountTendered: '', referenceNumber: '' }]);
        setDepositAmount(patient.depositPaid ? patient.depositPaid.toString() : '');
        setItemDiscounts({}); setBillDiscountType('%'); setBillDiscountValue(''); setBillDiscountReason('');
        // T4.151/T4.152: Reset success overlay state on every modal open.
        setCheckoutSuccess(null); setCheckoutError(''); setEmailFeedback('');

        let foundId = false;
        try {
            if (patient.ownerId && patient.ownerId !== 'WALK_IN_USER' && patient.ownerId !== 'UNKNOWN') {
                const userDoc = await getDoc(doc(db, "users", patient.ownerId));
                if (userDoc.exists() && userDoc.data().seniorId) foundId = true;
            }
        } catch (e) { console.error(e); }
        setHasScId(foundId); setApplyScPwd(foundId);
      }

      if (open && isRetailMode) {
        setCart([]); setPaymentTenders([{ method: 'cash', amount: '', amountTendered: '', referenceNumber: '' }]);
        setDepositAmount('');
        setItemDiscounts({}); setBillDiscountType('%'); setBillDiscountValue(''); setBillDiscountReason('');
        setCheckoutSuccess(null); setCheckoutError(''); setEmailFeedback('');
        setHasScId(false); setApplyScPwd(false);
        setLinkedClient(null); setShowCustomerNudge(false);
      }
    };
    initPOS();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open, patient, servicesList, inventoryList]);

  // --- 2. THE RX COMPLIANCE ENGINE ---
  const processProductToCart = (p) => {
      if (p.stock < 1) return showToast("Out of stock!");
      if (p.isRxOnly) {
        setPendingRxItem(p); setOpenRxOverride(true); return; 
      }
      pushToCartArray({ type: 'product', id: p.id, name: p.itemName, price: p.price, qty: 1, isDiscountable: !!p.isMedicine });
  };

  const pushToCartArray = (newItem) => {
    const existingIndex = cart.findIndex(c => c.id === newItem.id && !c.isExternalRx);
    if (existingIndex >= 0) {
      updateCartQty(existingIndex, 1);
      return;
    }

    // C2: POS Audit Trail — tag cashier-added (non-prescribed) items with provenance
    const taggedItem = newItem.isPrescribed ? newItem : {
      ...newItem,
      addedBy: 'cashier',
      addedByName: profile?.fullName || 'POS Cashier',
      addedAt: new Date().toISOString(),
    };

    setCart(prev => [...prev, taggedItem]);
  };

  const handleExternalRxApprove = () => {
    if (!extVetName || !extClinicName) return showToast("You must record the prescribing Vet and Clinic.");
    pushToCartArray({ type: 'product', id: pendingRxItem.id, name: pendingRxItem.itemName, price: pendingRxItem.price, qty: 1, isDiscountable: true, isExternalRx: true, externalVet: extVetName, externalClinic: extClinicName });
    setOpenRxOverride(false); setPendingRxItem(null); setExtVetName(''); setExtClinicName('');
  };
  
  const updateCartQty = (index, delta) => {
    const newCart = [...cart];
    const newQty = newCart[index].qty + delta;
    if (newQty < 1) return; 
    if (newCart[index].type === 'product') {
        const invItem = inventoryList.find(i => i.id === newCart[index].id);
        if (invItem && newQty > invItem.stock) return showToast(`Only ${invItem.stock} in stock!`);
    }
    newCart[index].qty = newQty;
    setCart(newCart);
  };

  const removeFromCart = (index) => {
    const item = cart[index];
    if (item.isBase) return;
    if (item.isPrescribed) { setConfirmRemove({ index, name: item.name }); return; }
    const newCart = [...cart]; newCart.splice(index, 1); setCart(newCart);
    // T4.149: Re-index item discounts — shift indices above the removed item down by 1.
    setItemDiscounts(prev => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = parseInt(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
        // i === index is the removed item — discard its discount
      });
      return next;
    });
  };

  // --- 3. BIR-COMPLIANT FINANCIAL MATH ---
  /**
   * Two-layer discount engine:
   * 1. SC/PWD (government-mandated, 20% VAT-exempt) — exclusive with custom discounts.
   * 2. Custom per-item + bill discount (clinic-discretionary) — exclusive with SC/PWD.
   * Order of operations: per-item discounts → subtotal → bill discount → deposit → balance.
   */
  const calculateFinancials = () => {
    let subtotal = 0;
    let vatExemptTotal = 0;
    let scPwdDiscount = 0;
    let totalItemDiscounts = 0;

    cart.forEach((item, idx) => {
      const lineTotal = item.price * item.qty;

      if (applyScPwd && item.isDiscountable) {
        // SC/PWD path — no custom discounts allowed on the same transaction.
        const itemVatExempt = lineTotal / 1.12;
        vatExemptTotal += itemVatExempt;
        scPwdDiscount += itemVatExempt * 0.20;
        subtotal += lineTotal;
      } else {
        // Custom per-item discount path (ignored when SC/PWD is active).
        const disc = itemDiscounts[idx];
        if (!applyScPwd && disc && disc.value > 0) {
          const itemDisc = disc.type === '%'
            ? lineTotal * (Math.min(disc.value, 100) / 100)
            : Math.min(disc.value, lineTotal);
          totalItemDiscounts += itemDisc;
        }
        subtotal += lineTotal;
      }
    });

    // Transaction-level bill discount — only when SC/PWD is off.
    let billDisc = 0;
    const afterItems = subtotal - (applyScPwd ? scPwdDiscount : totalItemDiscounts);
    if (!applyScPwd && billDiscountValue) {
      const val = parseFloat(billDiscountValue) || 0;
      billDisc = billDiscountType === '%'
        ? afterItems * (Math.min(val, 100) / 100)
        : Math.min(val, afterItems);
    }

    const totalDiscount = applyScPwd ? scPwdDiscount : (totalItemDiscounts + billDisc);
    const finalTotal = subtotal - totalDiscount;
    const deposit = parseFloat(depositAmount) || 0;
    const balanceDue = Math.max(0, finalTotal - deposit);

    return {
      subtotal: subtotal.toFixed(2),
      vatExempt: applyScPwd && scPwdDiscount > 0 ? vatExemptTotal.toFixed(2) : '0.00',
      discount: totalDiscount.toFixed(2),
      scPwdDiscount: scPwdDiscount.toFixed(2),
      itemDiscounts: totalItemDiscounts.toFixed(2),
      billDiscount: billDisc.toFixed(2),
      afterItemDiscounts: (subtotal - totalItemDiscounts).toFixed(2),
      total: finalTotal.toFixed(2),
      deposit: deposit.toFixed(2),
      balanceDue: balanceDue.toFixed(2),
    };
  };
  const financials = calculateFinancials();

  // T4.150: Multi-tender derived values.
  // Total amount allocated across all tender rows.
  // Empty amount on a single-tender row means "full balance" — zero extra clicks for the 90% case.
  const balanceDueNum = parseFloat(financials.balanceDue) || 0;
  const totalTendered = useMemo(() =>
    paymentTenders.reduce((sum, t) => {
      const amt = parseFloat(t.amount);
      if (isNaN(amt) && paymentTenders.length === 1) return sum + balanceDueNum;
      return sum + (amt || 0);
    }, 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [paymentTenders, balanceDueNum]);
  const remaining = Math.max(0, balanceDueNum - totalTendered);

  // Per-Cash-tender insufficiency: true if any Cash tender has amountTendered < its amount.
  const anyCashInsufficient = paymentTenders.some(t =>
    t.method === 'cash'
    && t.amountTendered !== ''
    && (parseFloat(t.amountTendered) || 0) < (parseFloat(t.amount) || balanceDueNum)
  );

  // Helper: compute change due for a single Cash tender row.
  const getChangeDue = (tender) => {
    if (tender.method !== 'cash') return 0;
    const tendered = parseFloat(tender.amountTendered) || 0;
    const amt = parseFloat(tender.amount) || balanceDueNum;
    return Math.max(0, tendered - amt);
  };

  // --- 4. PDF RECEIPT GENERATOR ---
  const generateReceiptHTML = (transactionId, receiptNumber) => {
    const today = new Date().toLocaleString();

    const itemsHTML = cart.map(item => {
      const strength = formatDosage(item.dosageValue, item.dosageUnit, item.dosageUnitCustom) || item.dosage || '';
      return `
      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
        <div style="flex: 1; padding-right: 10px;">
          <div style="font-weight: 700;">${esc(item.name)} ${strength ? `(${esc(strength)})` : ''} ${item.isDiscountable ? '' : '<span style="color:#d32f2f; font-size:10px;">(No SC/PWD)</span>'}</div>
          <div style="color: #666;">${item.qty} x ₱${item.price.toFixed(2)}</div>
        </div>
        <div style="font-weight: 900; text-align: right; font-family: 'JetBrains Mono', monospace;">
          ₱${(item.price * item.qty).toFixed(2)}
        </div>
      </div>
    `; }).join('');

    const patientLabel = `${patient.petName} (${patient.ownerName || 'Walk-In'})`;

    const tenderSection = (() => {
      return paymentTenders.map(t => {
        const amt = parseFloat(t.amount) || balanceDueNum;
        const label = PAYMENT_METHOD_LABELS[t.method] || t.method;
        let line = `<div class="total-row"><span>${esc(label)}:</span><span>₱${amt.toFixed(2)}</span></div>`;
        if (t.method === 'cash' && t.amountTendered && parseFloat(t.amountTendered) > 0) {
          const tendered = parseFloat(t.amountTendered);
          const change = Math.max(0, tendered - amt);
          line += `<div class="total-row sub-row"><span>&nbsp;&nbsp;Tendered:</span><span>₱${tendered.toFixed(2)}</span></div>`;
          line += `<div class="total-row sub-row change"><span>&nbsp;&nbsp;Change:</span><span>₱${change.toFixed(2)}</span></div>`;
        }
        return line;
      }).join('');
    })();

    return `
      <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
            body { font-family: 'Inter', sans-serif; color: #111; line-height: 1.4; margin: 0; padding: 20px; display: flex; justify-content: center; background-color: #f0f0f0; }
            .receipt-container { width: 100%; max-width: 380px; background-color: #fff; padding: 30px 20px; border: 3px solid #111; box-sizing: border-box; }
            .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px dashed #111; }
            .clinic-name { font-size: 20px; font-weight: 900; color: #111; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: -0.5px; }
            .clinic-meta { margin: 0; font-size: 11px; color: #444; font-weight: 700; text-transform: uppercase; }
            .meta-section { margin-bottom: 20px; font-size: 12px; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; border-bottom: 2px dashed #111; padding-bottom: 15px; }
            .meta-label { font-weight: 900; color: #555; text-transform: uppercase; }
            .meta-value { font-family: 'JetBrains Mono', monospace; font-weight: 700; text-align: right; }
            .items-section { margin-bottom: 15px; border-bottom: 2px dashed #111; padding-bottom: 10px; min-height: 100px; }
            .totals-section { font-size: 13px; font-family: 'JetBrains Mono', monospace; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-weight: 400; }
            .total-row.bold { font-weight: 700; }
            .total-row.discount { color: #d32f2f; }
            .sub-row { font-size: 11px; color: #555; }
            .sub-row.change { font-weight: 700; color: #111; }
            .grand-total { font-weight: 900; font-size: 18px; margin-top: 10px; border-top: 2px solid #111; padding-top: 10px; font-family: 'Inter', sans-serif; display: flex; justify-content: space-between; align-items: flex-end; }
            .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #111; font-weight: 700; border-top: 2px dashed #111; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <p class="clinic-name">${esc(clinicSettings.clinicName)}</p>
              <p class="clinic-meta">${esc(clinicSettings.clinicAddress)}</p>
              <div style="display: flex; justify-content: center; gap: 10px;">
                ${clinicSettings.clinicPhone ? `<p class="clinic-meta">T: ${esc(clinicSettings.clinicPhone)}</p>` : ''}
                ${clinicSettings.clinicEmail ? `<p class="clinic-meta">E: ${esc(clinicSettings.clinicEmail)}</p>` : ''}
              </div>
              ${clinicSettings.clinicTIN ? `<p class="clinic-meta">TIN: ${esc(clinicSettings.clinicTIN)}</p>` : ''}
              <p class="clinic-meta" style="margin-top: 8px;">OFFICIAL RECEIPT</p>
            </div>
            
            <div class="meta-section">
              <span class="meta-label">RCPT #:</span> <span class="meta-value">${esc(receiptNumber || transactionId.slice(0, 8).toUpperCase())}</span>
              <span class="meta-label">DATE:</span> <span class="meta-value">${esc(today)}</span>
              <span class="meta-label">CUST:</span> <span class="meta-value" style="font-family: 'Inter', sans-serif; text-transform: uppercase;">${esc(patientLabel)}</span>
              <span class="meta-label">CSHR:</span> <span class="meta-value" style="font-family: 'Inter', sans-serif; text-transform: uppercase;">${esc(profile?.fullName || 'POS Cashier')}</span>
            </div>

            <div class="items-section">
              ${itemsHTML}
            </div>

            <div class="totals-section">
              <div class="total-row"><span>SUBTOTAL</span><span>₱${financials.subtotal}</span></div>
              ${applyScPwd && parseFloat(financials.discount) > 0 ? `
                <div class="total-row"><span>VAT EXEMPT</span><span>₱${financials.vatExempt}</span></div>
                <div class="total-row discount"><span>SC/PWD DISC</span><span>- ₱${financials.discount}</span></div>
              ` : ''}
              ${!applyScPwd && parseFloat(financials.itemDiscounts) > 0 ? `<div class="total-row discount"><span>ITEM DISC</span><span>- ₱${financials.itemDiscounts}</span></div>` : ''}
              ${!applyScPwd && parseFloat(financials.billDiscount) > 0 ? `<div class="total-row discount"><span>BILL DISC</span><span>- ₱${financials.billDiscount}</span></div>` : ''}
              <div class="total-row"><span>LESS DEPOSIT</span><span>- ₱${financials.deposit}</span></div>
              
              <div class="grand-total">
                <span>BALANCE PAID</span>
                <span>₱${financials.balanceDue}</span>
              </div>
              
              <div style="margin-top: 15px;">
                <div class="total-row bold" style="margin-bottom: 5px;"><span>PAYMENT (${paymentTenders.length > 1 ? 'SPLIT' : primaryPaymentMethod.toUpperCase()}):</span><span></span></div>
                ${tenderSection}
              </div>
            </div>

            <div class="footer">
              <p style="margin: 0 0 5px 0;">THANK YOU FOR TRUSTING</p>
              <p style="margin: 0 0 15px 0; font-weight: 900; text-transform: uppercase;">${esc(clinicSettings.clinicName)}</p>
              <p style="margin: 0; font-size: 9px; color: #666; font-family: 'JetBrains Mono', monospace;">SYSTEM GENERATED RECEIPT</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const generateRetailReceiptHTML = (transactionId, receiptNumber, clientInfo) => {
    const today = new Date().toLocaleString();
    const itemsHTML = cart.map(item => {
      const strength = formatDosage(item.dosageValue, item.dosageUnit, item.dosageUnitCustom) || item.dosage || '';
      return `
      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
        <div style="flex: 1; padding-right: 10px;">
          <div style="font-weight: 700;">${esc(item.name)} ${strength ? `(${esc(strength)})` : ''}</div>
          <div style="color: #666;">${item.qty} x ₱${item.price.toFixed(2)}</div>
        </div>
        <div style="font-weight: 900; text-align: right; font-family: 'JetBrains Mono', monospace;">
          ₱${(item.price * item.qty).toFixed(2)}
        </div>
      </div>
    `; }).join('');

    const customerLabel = clientInfo?.fullName
      ? `${clientInfo.fullName}${clientInfo.phone ? ` (${clientInfo.phone})` : ''}`
      : 'Counter Sale (Walk-In)';

    const tenderSection = (() => {
      return paymentTenders.map(t => {
        const amt = parseFloat(t.amount) || balanceDueNum;
        const label = PAYMENT_METHOD_LABELS[t.method] || t.method;
        let line = `<div class="total-row"><span>${esc(label)}:</span><span>₱${amt.toFixed(2)}</span></div>`;
        if (t.method === 'cash' && t.amountTendered && parseFloat(t.amountTendered) > 0) {
          const tendered = parseFloat(t.amountTendered);
          const change = Math.max(0, tendered - amt);
          line += `<div class="total-row sub-row"><span>&nbsp;&nbsp;Tendered:</span><span>₱${tendered.toFixed(2)}</span></div>`;
          line += `<div class="total-row sub-row change"><span>&nbsp;&nbsp;Change:</span><span>₱${change.toFixed(2)}</span></div>`;
        }
        return line;
      }).join('');
    })();

    return `
      <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
            body { font-family: 'Inter', sans-serif; color: #111; line-height: 1.4; margin: 0; padding: 20px; display: flex; justify-content: center; background-color: #f0f0f0; }
            .receipt-container { width: 100%; max-width: 380px; background-color: #fff; padding: 30px 20px; border: 3px solid #111; box-sizing: border-box; }
            .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px dashed #111; }
            .clinic-name { font-size: 20px; font-weight: 900; color: #111; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: -0.5px; }
            .clinic-meta { margin: 0; font-size: 11px; color: #444; font-weight: 700; text-transform: uppercase; }
            .retail-badge { text-align: center; font-weight: 900; border: 2px solid #3ABEF9; padding: 8px; margin-bottom: 15px; color: #3ABEF9; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; }
            .meta-section { margin-bottom: 20px; font-size: 12px; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; border-bottom: 2px dashed #111; padding-bottom: 15px; }
            .meta-label { font-weight: 900; color: #555; text-transform: uppercase; }
            .meta-value { font-family: 'JetBrains Mono', monospace; font-weight: 700; text-align: right; }
            .items-section { margin-bottom: 15px; border-bottom: 2px dashed #111; padding-bottom: 10px; min-height: 100px; }
            .totals-section { font-size: 13px; font-family: 'JetBrains Mono', monospace; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-weight: 400; }
            .total-row.bold { font-weight: 700; }
            .total-row.discount { color: #d32f2f; }
            .sub-row { font-size: 11px; color: #555; }
            .sub-row.change { font-weight: 700; color: #111; }
            .grand-total { font-weight: 900; font-size: 18px; margin-top: 10px; border-top: 2px solid #111; padding-top: 10px; font-family: 'Inter', sans-serif; display: flex; justify-content: space-between; align-items: flex-end; }
            .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #111; font-weight: 700; border-top: 2px dashed #111; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="retail-badge">RETAIL SALE</div>
            <div class="header">
              <p class="clinic-name">${esc(clinicSettings.clinicName)}</p>
              <p class="clinic-meta">${esc(clinicSettings.clinicAddress)}</p>
              <div style="display: flex; justify-content: center; gap: 10px;">
                ${clinicSettings.clinicPhone ? `<p class="clinic-meta">T: ${esc(clinicSettings.clinicPhone)}</p>` : ''}
                ${clinicSettings.clinicEmail ? `<p class="clinic-meta">E: ${esc(clinicSettings.clinicEmail)}</p>` : ''}
              </div>
              ${clinicSettings.clinicTIN ? `<p class="clinic-meta">TIN: ${esc(clinicSettings.clinicTIN)}</p>` : ''}
              <p class="clinic-meta" style="margin-top: 8px;">OFFICIAL RECEIPT</p>
            </div>
            
            <div class="meta-section">
              <span class="meta-label">RCPT #:</span> <span class="meta-value">${esc(receiptNumber || transactionId.slice(0, 8).toUpperCase())}</span>
              <span class="meta-label">DATE:</span> <span class="meta-value">${esc(today)}</span>
              <span class="meta-label">CUST:</span> <span class="meta-value" style="font-family: 'Inter', sans-serif; text-transform: uppercase;">${esc(customerLabel)}</span>
              <span class="meta-label">CSHR:</span> <span class="meta-value" style="font-family: 'Inter', sans-serif; text-transform: uppercase;">${esc(profile?.fullName || 'POS Cashier')}</span>
            </div>

            <div class="items-section">
              ${itemsHTML}
            </div>

            <div class="totals-section">
              <div class="total-row"><span>SUBTOTAL</span><span>₱${financials.subtotal}</span></div>
              ${applyScPwd && parseFloat(financials.discount) > 0 ? `
                <div class="total-row"><span>VAT EXEMPT</span><span>₱${financials.vatExempt}</span></div>
                <div class="total-row discount"><span>SC/PWD DISC</span><span>- ₱${financials.discount}</span></div>
              ` : ''}
              ${!applyScPwd && parseFloat(financials.itemDiscounts) > 0 ? `<div class="total-row discount"><span>ITEM DISC</span><span>- ₱${financials.itemDiscounts}</span></div>` : ''}
              ${!applyScPwd && parseFloat(financials.billDiscount) > 0 ? `<div class="total-row discount"><span>BILL DISC</span><span>- ₱${financials.billDiscount}</span></div>` : ''}
              
              <div class="grand-total">
                <span>TOTAL PAID</span>
                <span>₱${financials.balanceDue}</span>
              </div>
              
              <div style="margin-top: 15px;">
                <div class="total-row bold" style="margin-bottom: 5px;"><span>PAYMENT (${paymentTenders.length > 1 ? 'SPLIT' : primaryPaymentMethod.toUpperCase()}):</span><span></span></div>
                ${tenderSection}
              </div>
            </div>

            <div class="footer">
              <p style="margin: 0 0 5px 0;">THANK YOU FOR YOUR PURCHASE</p>
              <p style="margin: 0 0 15px 0; font-weight: 900; text-transform: uppercase;">${esc(clinicSettings.clinicName)}</p>
              <p style="margin: 0; font-size: 9px; color: #666; font-family: 'JetBrains Mono', monospace;">SYSTEM GENERATED RECEIPT</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    try {
      const apptRef = doc(db, "appointments", patient.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(apptRef);
        if (!snap.exists()) throw new Error("Appointment not found.");
        const data = snap.data();

        // Optimistic lock: reject the write if another session has already committed
        // a newer version of encounterItems since this modal was opened.
        const serverVersion = (data.encounterItemsVersion || data.prescribedItemsVersion)?.toMillis?.() || 0;
        const localVersion = (patient.encounterItemsVersion || patient.prescribedItemsVersion)?.toMillis?.() || 0;
        if (serverVersion > 0 && localVersion > 0 && serverVersion !== localVersion) {
          throw new Error("The Treatment Plan was modified by another user. Please reload and try again.");
        }

        transaction.update(apptRef, {
          encounterItems: cart,
          depositPaid: parseFloat(depositAmount) || 0,
          encounterItemsVersion: Timestamp.now()
        });
      });
      showToast("Invoice draft saved.", "success");
      onClose();
    } catch (e) {
      console.error("[POSModal] Draft save error:", e);
      showToast("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- 5. ATOMIC CHECKOUT TRANSACTION ---

  /**
   * Pure FIFO batch deduction — takes an immutable sorted batch array + qty,
   * returns { newBatches, batchesUsed, batchSource } without mutating inputs.
   * Assumes batches are already sorted by expiryDate (ascending) and filtered for unexpired.
   */
  const computeFifoBatchDeduction = (sortedBatches, qtyToDeduct) => {
    const batchesUsed = [];
    const batchSource = [];
    let remainingToDeduct = qtyToDeduct;

    const newBatches = sortedBatches.map(b => {
      if (remainingToDeduct <= 0) return { ...b };
      let amountTaken = 0;
      const newQty = b.qty >= remainingToDeduct
        ? (amountTaken = remainingToDeduct, b.qty - remainingToDeduct)
        : (amountTaken = b.qty, 0);
      remainingToDeduct -= amountTaken;
      if (amountTaken > 0) {
        batchesUsed.push(`${b.batchNumber} (-${amountTaken})`);
        batchSource.push({ batchNumber: b.batchNumber, expiryDate: b.expiryDate, qtyFromBatch: amountTaken });
      }
      return { ...b, qty: newQty };
    }).filter(b => b.qty > 0);

    return { newBatches, batchesUsed, batchSource };
  };

  /**
   * PHASE 1 — Read all inventory documents for product cart items.
   * Returns Map<itemId, { ref: DocumentReference, data: DocumentData }>
   * Zero writes issued. Safe to call before any transaction writes.
   */
  const readInventoryDocs = async (transaction, cartItems) => {
    const inventoryMap = new Map();
    for (const item of cartItems) {
      if (item.type !== 'product') continue;
      const itemRef = doc(db, "inventory", item.id);
      const itemDoc = await transaction.get(itemRef);
      if (!itemDoc.exists()) throw new Error(`Product ${item.name} not found`);
      inventoryMap.set(item.id, { ref: itemRef, data: itemDoc.data() });
    }
    return inventoryMap;
  };

  /**
   * PHASE 2 — Compute all inventory deduction payloads from collected data.
   * Pure computation — zero Firestore reads or writes.
   * Returns { updatePayloads, logEntries, batchSourceMap }
   *
   * updatePayloads: array of { ref, payload } for transaction.update()
   * logEntries: array of { data } for transaction.set() on new inventory_logs docs
   * batchSourceMap: { [itemId]: batchSource[] } for sale doc annotation
   */
  const computeInventoryDeductions = (cartItems, inventoryMap, patientLabel) => {
    const updatePayloads = [];
    const logEntries = [];
    const batchSourceMap = {};

    for (const item of cartItems) {
      if (item.type !== 'product') continue;
      const entry = inventoryMap.get(item.id);
      if (!entry) throw new Error(`Product ${item.name} not found in inventory data`);
      const { ref, data } = entry;

      const currentStock = data.stock || 0;
      if (currentStock < item.qty) throw new Error(`Not enough stock for ${item.name}`);

      let batchesUsed = [];
      let batchSource = [];
      let newBatches = null;

      if (data.batches && data.batches.length > 0) {
        const sorted = [...data.batches].sort(
          (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
        );
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const unexpired = sorted.filter(b => new Date(b.expiryDate) >= today);
        const sellableStock = unexpired.reduce((sum, b) => sum + b.qty, 0);
        if (sellableStock < item.qty) {
          throw new Error(`Not enough UNEXPIRED stock for ${item.name}.`);
        }

        const result = computeFifoBatchDeduction(unexpired, item.qty);
        newBatches = result.newBatches;
        batchesUsed = result.batchesUsed;
        batchSource = result.batchSource;
        batchSourceMap[item.id] = batchSource;
      } else {
        if (data.expiryDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expiry = new Date(data.expiryDate + 'T00:00:00');
          if (expiry < today) throw new Error(`${item.name} is EXPIRED and cannot be sold.`);
        }
        batchesUsed.push(`flat-stock (-${item.qty})`);
      }

      const updatePayload = {
        stock: currentStock - item.qty,
        // T2.16: Unconditionally decrement reserved for all product sales.
        reserved: Math.max(0, (data.reserved || 0) - item.qty),
      };
      if (data.batches && data.batches.length > 0) {
        updatePayload.batches = newBatches;
      }
      updatePayloads.push({ ref, payload: updatePayload });

      const externalNote = item.isExternalRx ? `[Ext Rx: ${item.externalVet}]` : '';
      logEntries.push({
        data: {
          itemId: item.id,
          itemName: item.name,
          action: "SOLD",
          amountChange: -(item.qty),
          reason: `POS Sale to ${patientLabel}${externalNote ? ` ${externalNote}` : ''} | Old: ${currentStock} → New: ${currentStock - item.qty}${batchesUsed.length ? ` | FIFO: ${batchesUsed.join(', ')}` : ''}`,
          userId: profile?.id || "pos_system",
          userName: profile?.fullName || "POS System",
          timestamp: Timestamp.now(),
        },
      });
    }

    return { updatePayloads, logEntries, batchSourceMap };
  };

  /**
   * PHASE 3 — Apply all inventory writes: stock updates + log entries.
   * Must be called AFTER all transaction reads are complete.
   */
  const writeInventoryUpdates = (transaction, updatePayloads, logEntries) => {
    for (const { ref, payload } of updatePayloads) {
      transaction.update(ref, payload);
    }
    for (const entry of logEntries) {
      const logRef = doc(collection(db, "inventory_logs"));
      transaction.set(logRef, entry.data);
    }
  };

  const searchClients = async (searchText) => {
    if (!searchText || searchText.length < 2) { setClientOptions([]); return; }
    setClientSearchLoading(true);
    try {
      const q = query(collection(db, 'users'), where('role', 'in', ['client', 'pet_owner']));
      const snap = await getDocs(q);
      const results = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u =>
          (u.fullName || '').toLowerCase().includes(searchText.toLowerCase()) ||
          (u.phone || '').includes(searchText)
        )
        .slice(0, 10);
      setClientOptions(results);
    } catch (e) {
      console.error('[POSModal] Client search error:', e);
      setClientOptions([]);
    } finally {
      setClientSearchLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.some(i => i.isUnverified)) {
      showToast("Strict Catalog Enforcement: Unverified services detected. Please select valid services from the catalog.", "error");
      return;
    }
    setLoading(true);
    try {
      const checkoutCorrelationId = `CHK-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // T4.153: Hoisted receipt number — assigned inside the transaction, read outside for receipt HTML.
      let checkoutReceiptNumber = '';

      const transactionId = await runTransaction(db, async (transaction) => {
        // ==============================
        // PHASE 1 — ALL READS (no writes)
        // ==============================

        // 1a. Appointment doc read — needed for statusHistory in Phase 3 writes.
        const individualApptDoc = await transaction.get(doc(db, "appointments", patient.id));

        // 1b. All inventory reads for product cart items.
        const inventoryMap = await readInventoryDocs(transaction, cart);

        // 1c. Receipt counter read (T4.153: atomic sequential number — must be inside transaction).
        const counterRef = doc(db, 'counters', 'receipt_sequence');
        const counterSnap = await transaction.get(counterRef);

        // ==============================
        // PHASE 2 — ALL COMPUTATIONS (no Firestore)
        // ==============================

        // 2a. Compute inventory deductions from collected data.
        const patientLabel = `${patient.petName} (${patient.ownerName || 'Walk-In'})`;
        const { updatePayloads, logEntries, batchSourceMap } =
          computeInventoryDeductions(cart, inventoryMap, patientLabel);

        // 2b. Compute receipt number from counter snapshot.
        let nextSeq;
        if (!counterSnap.exists()) {
          nextSeq = 1;
        } else {
          nextSeq = (counterSnap.data().value || 0) + 1;
        }
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const receiptNumber = `OR-${dateStr}-${String(nextSeq).padStart(4, '0')}`;
        checkoutReceiptNumber = receiptNumber;

        // 2c. T4.149: Compute custom discount audit fields (captured from financials at checkout time).
        const customDiscountAuditFields = {
          customDiscountTotal: applyScPwd ? 0 : parseFloat(financials.itemDiscounts) + parseFloat(financials.billDiscount),
          itemDiscountsTotal: applyScPwd ? 0 : parseFloat(financials.itemDiscounts),
          billDiscountAmount: applyScPwd ? 0 : parseFloat(financials.billDiscount),
          billDiscountType: !applyScPwd && parseFloat(billDiscountValue) > 0 ? billDiscountType : null,
          billDiscountValue: !applyScPwd && parseFloat(billDiscountValue) > 0 ? parseFloat(billDiscountValue) : null,
          billDiscountReason: !applyScPwd && billDiscountReason ? billDiscountReason : null,
          itemDiscountDetails: !applyScPwd && Object.keys(itemDiscounts).length > 0
            ? Object.entries(itemDiscounts).map(([idx, d]) => ({
                itemIndex: parseInt(idx),
                itemName: cart[parseInt(idx)]?.name || 'Unknown',
                type: d.type,
                value: d.value,
                savedAmount: d.type === '%'
                  ? (cart[parseInt(idx)]?.price * cart[parseInt(idx)]?.qty * Math.min(d.value, 100) / 100)
                  : Math.min(d.value, (cart[parseInt(idx)]?.price || 0) * (cart[parseInt(idx)]?.qty || 1)),
              }))
            : [],
          discountedBy: (!applyScPwd && (parseFloat(billDiscountValue) > 0 || Object.keys(itemDiscounts).length > 0))
            ? (profile?.fullName || 'POS Cashier')
            : null,
        };

        // 2d. T4.150: Cash audit fields — aggregate across all Cash tenders for backward compat.
        const cashTenders = paymentTenders.filter(t => t.method === 'cash' && t.amountTendered !== '');
        const totalCashTendered = cashTenders.reduce((s, t) => s + (parseFloat(t.amountTendered) || 0), 0);
        const totalCashChange = cashTenders.reduce((s, t) => s + getChangeDue(t), 0);
        const cashAuditFields = {
          amountTendered: cashTenders.length > 0 ? totalCashTendered : null,
          changeDue: cashTenders.length > 0 ? totalCashChange : null,
        };

        // 2e. Assemble sale doc payload and appointment update payloads.
        const saleRef = doc(collection(db, "sales"));
        let salePayload;
        let appointmentUpdateFn; // deferred write — called in Phase 3

        {
          const freshApptData = individualApptDoc.data();

          salePayload = {
            saleType: 'clinical',
            receiptNumber,
            checkoutCorrelationId,
            appointmentId: patient.id,
            ownerId: patient.ownerId || null,
            petName: patient.petName,
            ownerName: patient.ownerName || 'Walk-In',
            items: cart.map(ci =>
              ci.type === 'product' && batchSourceMap[ci.id]
                ? { ...ci, batchSource: batchSourceMap[ci.id] }
                : ci
            ),
            subtotal: parseFloat(financials.subtotal),
            discount: parseFloat(financials.discount),
            depositPaid: parseFloat(financials.deposit),
            total: parseFloat(financials.total),
            paymentMethod: primaryPaymentMethod,  // Legacy compat: largest tender
            paymentTenders: paymentTenders.map(t => ({
              method: t.method,
              amount: parseFloat(t.amount) || (paymentTenders.length === 1 ? balanceDueNum : 0),
              ...(t.method === 'cash' && t.amountTendered ? {
                amountTendered: parseFloat(t.amountTendered),
                changeDue: getChangeDue(t),
              } : {}),
            })),
            hasScPwdDiscount: applyScPwd,
            date: Timestamp.now(),
            cashier: profile?.fullName || 'POS Cashier',
            cashierId: profile?.id || null,
            status: 'paid',
            // C2: POS Audit Trail — summary flags for forensic reporting
            prescribedItemCount: cart.filter(i => i.isPrescribed).length,
            cashierAddedItemCount: cart.filter(i => i.addedBy === 'cashier').length,
            hasUnprescribedAdditions: cart.some(i => i.addedBy === 'cashier'),
            hasUnverifiedItems: cart.some(i => i.isUnverified),
            unverifiedItemCount: cart.filter(i => i.isUnverified).length,
            ...cashAuditFields,
            ...customDiscountAuditFields,
            // T4.151: Tag post-close sales for audit visibility.
            ...(isDayClosed ? { postClose: true, dayClosedAt: closingData?.closedAt || null } : {}),
          };

          appointmentUpdateFn = (transaction) => {
            const apptRef = doc(db, "appointments", patient.id);
            transaction.update(apptRef, {
              checkoutCorrelationId,
              status: 'completed',
              statusHistory: [...(freshApptData.statusHistory || []), freshApptData.status || 'billing'],
              timeCompleted: Timestamp.now(),
              balanceRemaining: parseFloat(financials.balanceDue),
              clinicalPulse: arrayUnion({
                eventId: makePulseEventId('checkout'),
                type: 'CHECKOUT_COMPLETED',
                timestamp: Timestamp.now(),
                staffId: profile?.id || 'pos_system',
                staffName: profile?.fullName || 'POS Cashier',
                note: `Checkout: ₱${financials.total} via ${paymentTenders.length > 1 ? 'split (' + paymentTenders.map(t => t.method).join('+') + ')' : primaryPaymentMethod}`,
              }),
            });
          };
        }

        // ==============================
        // PHASE 3 — ALL WRITES
        // ==============================

        // 3a. Inventory stock deductions + audit logs.
        writeInventoryUpdates(transaction, updatePayloads, logEntries);

        // 3b. Receipt counter write (T4.153: first-ever receipt bootstraps the counter doc).
        if (!counterSnap.exists()) {
          transaction.set(counterRef, { value: 1 });
        } else {
          transaction.update(counterRef, { value: nextSeq });
        }

        // 3c. Sale document.
        transaction.set(saleRef, salePayload);

        // 3d. T4.237: Write one payment doc per tender inside the same transaction.
        // Each doc is immutable (Firestore rules: update/delete blocked). Corrections
        // via reversal pattern (negative-amount doc with reversalOf FK) — see Day 2.
        for (const t of paymentTenders) {
          const tenderAmount = parseFloat(t.amount) || (paymentTenders.length === 1 ? balanceDueNum : 0);
          if (tenderAmount <= 0) continue;
          const paymentRef = doc(collection(db, 'payments'));
          transaction.set(paymentRef, buildPaymentDocPayload({
            saleId: saleRef.id,
            ownerId: patient.ownerId || null,
            amount: tenderAmount,
            method: t.method.toLowerCase(),
            referenceNumber: t.referenceNumber || null,
            note: null,
            collectedBy: profile?.fullName || 'POS Cashier',
            collectedByUid: profile?.id || null,
            reversalOf: null,
          }));
        }

        // 3e. Appointment status updates (completed + clinicalPulse).
        appointmentUpdateFn(transaction);

        // T2.101: outstandingBalance is now computed from sales (sum of balanceRemaining),
        // not a Firestore counter. This block intentionally removed.

        return saleRef.id;
      });

      // T4.147: Set hasOutstandingBalance flag on the owner doc when a partial payment is recorded.
      // Fire-and-forget — advisory only, never used for financial calculations.
      const checkoutBalance = parseFloat(financials.balanceDue || 0);
      if (checkoutBalance > 0 && patient.ownerId && patient.ownerId !== 'WALK_IN_USER' && !String(patient.ownerId).includes('GUEST_')) {
        updateDoc(doc(db, 'users', patient.ownerId), { hasOutstandingBalance: true }).catch(() => {});
      }

      // T4.204: Piggyback balance reminder queue recompute after every clinical checkout.
      // Fire-and-forget — never blocks checkout completion or the receipt overlay.
      if (patient.ownerId && patient.ownerId !== 'WALK_IN_USER' && !String(patient.ownerId).includes('GUEST_')) {
        computeSingleOwnerBalanceReminder(patient.ownerId, {
          ownerName:  patient.ownerName  || '',
          ownerEmail: patient.ownerEmail || '',
          ownerPhone: patient.ownerPhone || '',
          pushToken:  patient.expoPushToken || null,
        }).catch(() => {});
      }

      // T4.90: Push notification — checkout complete
      const posCashierName = profile?.fullName || 'POS Cashier';
      sendPushNotification({
        ownerId: patient.ownerId,
        status: 'completed',
        petName: patient.petName,
        appointmentId: patient.id,
        sentBy: posCashierName,
      });

      const receiptContent = generateReceiptHTML(transactionId, checkoutReceiptNumber);

      // T4.151: If day is closed, increment post-close counters on the closing doc.
      // Fire-and-forget — never blocks checkout completion.
      if (isDayClosed && closingData?.id) {
        updateDoc(doc(db, 'daily_closings', closingData.id), {
          postCloseCount: increment(1),
          postCloseTotal: increment(parseFloat(financials.total) || 0),
        }).catch(() => {});
      }

      // T4.152: Show success overlay instead of window.confirm.
      // The overlay provides Print / Download / Email actions. onClose() fires when user dismisses.
      setCheckoutSuccess({ receiptHTML: receiptContent, total: financials.balanceDue, receiptNumber: checkoutReceiptNumber });
    } catch (error) {
      console.error('[POSModal.handleCheckout]:', error);
      setCheckoutSuccess(null);
      setCheckoutError(`Checkout failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRetailCheckout = async (clientInfo) => {
    if (cart.some(i => i.isUnverified)) {
      showToast("Strict Catalog Enforcement: Unverified items detected. Please select valid products from the inventory.", "error");
      return;
    }
    setLoading(true);
    try {
      let checkoutReceiptNumber = '';

      const transactionId = await runTransaction(db, async (transaction) => {
        const patientLabel = clientInfo?.fullName || 'Counter Sale';

        const inventoryMap = await readInventoryDocs(transaction, cart);
        const counterRef = doc(db, 'counters', 'receipt_sequence');
        const counterSnap = await transaction.get(counterRef);

        const { updatePayloads, logEntries, batchSourceMap } =
          computeInventoryDeductions(cart, inventoryMap, patientLabel);

        let nextSeq;
        if (!counterSnap.exists()) { nextSeq = 1; }
        else { nextSeq = (counterSnap.data().value || 0) + 1; }
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const receiptNumber = `OR-${dateStr}-${String(nextSeq).padStart(4, '0')}`;
        checkoutReceiptNumber = receiptNumber;

        const customDiscountAuditFields = {
          customDiscountTotal: applyScPwd ? 0 : parseFloat(financials.itemDiscounts) + parseFloat(financials.billDiscount),
          itemDiscountsTotal: applyScPwd ? 0 : parseFloat(financials.itemDiscounts),
          billDiscountAmount: applyScPwd ? 0 : parseFloat(financials.billDiscount),
          billDiscountType: !applyScPwd && parseFloat(billDiscountValue) > 0 ? billDiscountType : null,
          billDiscountValue: !applyScPwd && parseFloat(billDiscountValue) > 0 ? parseFloat(billDiscountValue) : null,
          billDiscountReason: !applyScPwd && billDiscountReason ? billDiscountReason : null,
          itemDiscountDetails: !applyScPwd && Object.keys(itemDiscounts).length > 0
            ? Object.entries(itemDiscounts).map(([idx, d]) => ({
                itemIndex: parseInt(idx),
                itemName: cart[parseInt(idx)]?.name || 'Unknown',
                type: d.type,
                value: d.value,
                savedAmount: d.type === '%'
                  ? (cart[parseInt(idx)]?.price * cart[parseInt(idx)]?.qty * Math.min(d.value, 100) / 100)
                  : Math.min(d.value, (cart[parseInt(idx)]?.price || 0) * (cart[parseInt(idx)]?.qty || 1)),
              }))
            : [],
          discountedBy: (!applyScPwd && (parseFloat(billDiscountValue) > 0 || Object.keys(itemDiscounts).length > 0))
            ? (profile?.fullName || 'POS Cashier')
            : null,
        };

        const cashTenders = paymentTenders.filter(t => t.method === 'cash' && t.amountTendered !== '');
        const totalCashTendered = cashTenders.reduce((s, t) => s + (parseFloat(t.amountTendered) || 0), 0);
        const totalCashChange = cashTenders.reduce((s, t) => s + getChangeDue(t), 0);
        const cashAuditFields = {
          amountTendered: cashTenders.length > 0 ? totalCashTendered : null,
          changeDue: cashTenders.length > 0 ? totalCashChange : null,
        };

        const saleRef = doc(collection(db, 'sales'));
        const salePayload = {
          saleType: 'retail',
          receiptNumber,
          appointmentId: null,
          ownerId: clientInfo?.id || null,
          ownerName: clientInfo?.fullName || 'Counter Sale',
          petName: null,
          petId: null,
          items: cart.map(ci =>
            ci.type === 'product' && batchSourceMap[ci.id]
              ? { ...ci, batchSource: batchSourceMap[ci.id] }
              : ci
          ),
          subtotal: parseFloat(financials.subtotal),
          discount: parseFloat(financials.discount),
          depositPaid: parseFloat(financials.deposit),
          total: parseFloat(financials.total),
          paymentMethod: primaryPaymentMethod,
          paymentTenders: paymentTenders.map(t => ({
            method: t.method,
            amount: parseFloat(t.amount) || (paymentTenders.length === 1 ? balanceDueNum : 0),
            ...(t.method === 'cash' && t.amountTendered ? {
              amountTendered: parseFloat(t.amountTendered),
              changeDue: getChangeDue(t),
            } : {}),
          })),
          hasScPwdDiscount: applyScPwd,
          date: Timestamp.now(),
          cashier: profile?.fullName || 'POS Cashier',
          cashierId: profile?.id || null,
          status: 'paid',
          prescribedItemCount: 0,
          cashierAddedItemCount: cart.length,
          hasUnprescribedAdditions: true,
          ...cashAuditFields,
          ...customDiscountAuditFields,
          ...(isDayClosed ? { postClose: true, dayClosedAt: closingData?.closedAt || null } : {}),
        };

        writeInventoryUpdates(transaction, updatePayloads, logEntries);
        if (!counterSnap.exists()) { transaction.set(counterRef, { value: 1 }); }
        else { transaction.update(counterRef, { value: nextSeq }); }
        transaction.set(saleRef, salePayload);

        // T4.237: Write one payment doc per tender inside the same transaction (retail path).
        for (const t of paymentTenders) {
          const tenderAmount = parseFloat(t.amount) || (paymentTenders.length === 1 ? balanceDueNum : 0);
          if (tenderAmount <= 0) continue;
          const paymentRef = doc(collection(db, 'payments'));
          transaction.set(paymentRef, buildPaymentDocPayload({
            saleId: saleRef.id,
            ownerId: clientInfo?.id || null,
            amount: tenderAmount,
            method: t.method.toLowerCase(),
            referenceNumber: t.referenceNumber || null,
            note: null,
            collectedBy: profile?.fullName || 'POS Cashier',
            collectedByUid: profile?.id || null,
            reversalOf: null,
          }));
        }

        return saleRef.id;
      });

      if (isDayClosed && closingData?.id) {
        updateDoc(doc(db, 'daily_closings', closingData.id), {
          postCloseCount: increment(1),
          postCloseTotal: increment(parseFloat(financials.total) || 0),
        }).catch(() => {});
      }

      // T4.204: Piggyback balance reminder queue recompute after every retail checkout.
      // Fire-and-forget — only runs when the sale is linked to a registered client.
      if (clientInfo?.id) {
        computeSingleOwnerBalanceReminder(clientInfo.id, {
          ownerName:  clientInfo.fullName || '',
          ownerEmail: clientInfo.email    || '',
          ownerPhone: clientInfo.phone    || '',
          pushToken:  null,
        }).catch(() => {});
      }

      const receiptContent = generateRetailReceiptHTML(transactionId, checkoutReceiptNumber, clientInfo);
      setCheckoutSuccess({ receiptHTML: receiptContent, total: financials.balanceDue, receiptNumber: checkoutReceiptNumber });
    } catch (error) {
      console.error('[POSModal.handleRetailCheckout]:', error);
      setCheckoutSuccess(null);
      setCheckoutError(`Checkout failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // T4.152: Receipt delivery handlers — wired to the checkout success overlay.

  const handlePrintReceipt = (html) => {
    printViaIframe(html);
  };

  const handleDownloadReceipt = (html) => {
    // Extract receipt number from the HTML for a meaningful filename.
    const match = html.match(/Receipt #:<\/strong>\s*([^<]+)/);
    const receiptNum = match?.[1]?.trim() || 'receipt';
    downloadHtmlAsFile(html, `${receiptNum}.html`);
  };

  const handleEmailReceipt = async (html) => {
    const match = html.match(/Receipt #:<\/strong>\s*([^<]+)/);
    const receiptNum = match?.[1]?.trim() || '';
    const result = await emailReceiptToOwner({
      html,
      ownerId: patient?.ownerId,
      receiptNumber: receiptNum,
      clinicName: clinicSettings.clinicName,
    });
    setEmailFeedback(result.message);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth sx={{ '& .MuiDialog-paper': { position: 'relative', borderRadius: 0, border: `2px solid ${COLORS.brand}` } }}>
        <DialogTitle sx={{ bgcolor: COLORS.success, color: COLORS.cardBg, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2 }}>
          <Typography component="span" variant="h6" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isRetailMode ? <ShoppingCartIcon /> : <PaidIcon />}
            {isRetailMode ? 'Retail Sale' : `Checkout: ${patient?.petName}`}
          </Typography>
          {!isRetailMode && (
            <Chip label={patient?.ownerName || 'Walk-In'} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: COLORS.cardBg, fontWeight: 'bold', borderRadius: 0 }} />
          )}
          {isRetailMode && linkedClient && (
            <Chip label={linkedClient.fullName} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: COLORS.cardBg, fontWeight: 'bold', borderRadius: 0 }} />
          )}
        </DialogTitle>
        
        <DialogContent dividers sx={{ bgcolor: COLORS.surfaceHover, display: 'flex', flexDirection: 'column', gap: 0, p: 0, position: 'relative' }}>

          {/* T4.151: Post-close warning banner — shown when the day has been closed */}
          {isDayClosed && (
            <Alert
              severity="warning"
              sx={{
                mx: 3, mt: 2, borderRadius: 0,
                border: `2px solid ${COLORS.amber}`,
                fontWeight: 800,
                bgcolor: COLORS.warningSurface,
              }}
            >
              Day was closed at{' '}
              {closingData?.closedAt?.toDate?.()
                ? closingData.closedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'unknown time'}
              . This transaction will be flagged as post-close.
            </Alert>
          )}

          {/* T4.152: Checkout success overlay — replaces window.confirm.
              Rendered above all content. User picks a receipt action then closes. */}
          {checkoutSuccess && (
            <Box sx={{
              position: 'absolute', inset: 0, bgcolor: 'rgba(255,255,255,0.97)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', zIndex: 10, gap: 3, p: 4,
            }}>
              <Typography variant="h4" sx={{ fontWeight: 900, color: COLORS.success, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 1 }}>
                TRANSACTION COMPLETE
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 900, color: COLORS.brand, fontFamily: FONT }}>
                Collected: ₱{checkoutSuccess.total}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                  variant="contained"
                  startIcon={<PrintIcon />}
                  onClick={() => handlePrintReceipt(checkoutSuccess.receiptHTML)}
                  sx={{ bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, px: 3, '&:hover': { bgcolor: COLORS.skyHover || COLORS.sky } }}
                >
                  PRINT
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => handleDownloadReceipt(checkoutSuccess.receiptHTML)}
                  sx={{ fontWeight: 900, borderRadius: 0, px: 3, borderColor: COLORS.accent, color: COLORS.accent, borderWidth: 2 }}
                >
                  DOWNLOAD PDF
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => handleEmailReceipt(checkoutSuccess.receiptHTML)}
                  sx={{ fontWeight: 900, borderRadius: 0, px: 3, borderColor: COLORS.success, color: COLORS.success, borderWidth: 2 }}
                >
                  EMAIL RECEIPT
                </Button>
              </Box>
              {emailFeedback && (
                <Typography variant="body2" sx={{ mt: 1, fontWeight: 700, color: emailFeedback.includes('emailed') ? COLORS.success : COLORS.warning }}>
                  {emailFeedback}
                </Typography>
              )}
              <Button
                onClick={() => { setCheckoutSuccess(null); onClose(); }}
                sx={{ mt: 2, fontWeight: 800, color: COLORS.textMuted, fontFamily: FONT }}
              >
                CLOSE
              </Button>
            </Box>
          )}

          {/* Main content area — flex row matching original layout */}
          <Box sx={{ display: 'flex', gap: 3, p: 3, flex: 1 }}>
          {/* LEFT: CART ITEMS */}
          <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
            
            <Box sx={{ mb: 3 }}>
              <Autocomplete
                size="small"
                options={[
                  ...(!isRetailMode ? servicesList.filter(s => s.name !== patient?.serviceType).map(s => ({ ...s, _type: 'service', _category: 'Clinic Services', _label: s.name, _stock: null, _price: s.price })) : []),
                  ...inventoryList
                    .sort((a, b) => {
                      if ((a.stock > 0) !== (b.stock > 0)) return b.stock > 0 ? 1 : -1;
                      return (a.category || '').localeCompare(b.category || '');
                    })
                    .map(item => ({
                      ...item,
                      _type: 'product',
                      _category: (item.category || 'Other').charAt(0).toUpperCase() + (item.category || 'other').slice(1),
                      _label: item.itemName,
                      _stock: item.stock,
                      _price: item.price,
                    })),
                ]}
                groupBy={(opt) => opt._category}
                getOptionLabel={(opt) => opt._label || ''}
                getOptionDisabled={(opt) => opt._type === 'product' && (opt._stock ?? 0) < 1}
                onChange={(_, opt) => {
                  if (!opt) return;
                  if (opt._type === 'product') {
                    const p = inventoryList.find(i => i.id === opt.id);
                    if (p) processProductToCart(p);
                  } else if (opt._type === 'service') {
                    const s = servicesList.find(i => i.id === opt.id);
                    if (s) pushToCartArray({ type: 'service', id: s.id, name: s.name, price: s.price, qty: 1, isDiscountable: s.isScPwdEligible !== false });
                  }
                }}
                value={null}
                blurOnSelect
                renderOption={(props, opt) => (
                  <li {...props} key={`${opt._type}|${opt.id}`}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', opacity: opt._type === 'product' && (opt._stock ?? 0) < 1 ? 0.4 : 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {opt._type === 'service'
                          ? <MedicalServicesIcon fontSize="small" sx={{ color: COLORS.medical }} />
                          : <MedicationIcon fontSize="small" sx={{ color: COLORS.accentWarm }} />
                        }
                        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{opt._label}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {opt._type === 'product' && (
                          <Chip
                            label={`Stock: ${opt._stock ?? 0}`}
                            size="small"
                            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 900, borderRadius: 0, bgcolor: (opt._stock ?? 0) < 1 ? COLORS.dangerSurface : (opt._stock ?? 0) < 5 ? COLORS.warningSurface : COLORS.kpiGreenBg, color: (opt._stock ?? 0) < 1 ? COLORS.danger : (opt._stock ?? 0) < 5 ? COLORS.warning : COLORS.success }}
                          />
                        )}
                        <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', minWidth: 60, textAlign: 'right' }}>₱{opt._price}</Typography>
                      </Box>
                    </Box>
                  </li>
                )}
                renderGroup={(params) => (
                  <li key={params.key}>
                    <Typography sx={{ fontWeight: 1000, fontSize: '0.7rem', color: COLORS.accent, bgcolor: COLORS.panelBg, px: 2, py: 0.75, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {params.group}
                    </Typography>
                    <ul style={{ padding: 0 }}>{params.children}</ul>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={isRetailMode ? 'Add Product' : 'Add Item / Service'}
                    placeholder="Search by name..."
                    sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                  />
                )}
                sx={{ '& .MuiAutocomplete-listbox': { maxHeight: 350 } }}
                noOptionsText="No matching items"
              />
            </Box>

            {/* CART TABLE */}
            <TableContainer component={Paper} variant="outlined" sx={{ flexGrow: 1, borderRadius: 0 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: COLORS.panelBg }}>
                  <TableRow><TableCell sx={{fontWeight:'bold'}}>Item</TableCell><TableCell align="center" sx={{fontWeight:'bold'}}>Qty</TableCell><TableCell align="right" sx={{fontWeight:'bold'}}>Price</TableCell><TableCell align="right" sx={{fontWeight:'bold'}}>Total</TableCell><TableCell align="center"></TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {cart.map((item, index) => (
                    <TableRow key={index} sx={{ bgcolor: item.isBase ? COLORS.chipBlueBg : COLORS.cardBg }}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {item.isPrescribed && <Tooltip title="Prescribed by Vet"><MedicationIcon fontSize="small" color="warning" sx={{verticalAlign:'middle', mr:0.5}}/></Tooltip>}
                          {item.name}
                        </Typography>
                        {item.isBase && <Typography variant="caption" color="primary" fontWeight="bold" display="block">Base Service</Typography>}
                        {item.isUnverified && <Typography variant="caption" color="error" sx={{ fontWeight: 900, display: 'block', textTransform: 'uppercase', fontSize: '0.65rem' }}>⚠️ Unverified Item (Legacy/Manual)</Typography>}
                        {item.isAutoBundled && <Typography variant="caption" color="textSecondary" fontWeight="bold" display="block">Auto-Bundled Supply</Typography>}
                        {item.isExternalRx && <Typography variant="caption" color="secondary" fontWeight="bold" display="block"><DescriptionIcon fontSize="inherit"/> Ext Rx: {item.externalVet}</Typography>}
                        {!item.isDiscountable && <Typography variant="caption" color="error" fontWeight="bold" display="block">No SC/PWD Applied</Typography>}
                        {/* T4.149: Per-item discount chip — shows saved amount inline */}
                        {itemDiscounts[index] && !applyScPwd && (
                          <Typography variant="caption" fontWeight="bold" display="block" sx={{ color: COLORS.amber }}>
                            Disc: {itemDiscounts[index].type === '%' ? `${itemDiscounts[index].value}%` : `₱${itemDiscounts[index].value}`}
                            {' '}(-₱{(itemDiscounts[index].type === '%'
                              ? (item.price * item.qty * Math.min(itemDiscounts[index].value, 100) / 100)
                              : Math.min(itemDiscounts[index].value, item.price * item.qty)
                            ).toFixed(2)})
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {!item.isBase && <IconButton size="small" onClick={() => updateCartQty(index, -1)}><Typography fontWeight="bold">-</Typography></IconButton>}
                          <Typography sx={{ mx: 1, fontWeight: 'bold' }}>{item.qty}</Typography>
                          {!item.isBase && <IconButton size="small" onClick={() => updateCartQty(index, 1)}><Typography fontWeight="bold">+</Typography></IconButton>}
                        </Box>
                      </TableCell>
                      <TableCell align="right">₱{item.price}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: '900' }}>₱{(item.price * item.qty).toFixed(2)}</TableCell>
                      <TableCell align="center">
                        {/* T4.149: Per-item discount button — opens amber Popover for % or ₱ discount */}
                        {!item.isBase && !applyScPwd && (
                          <Tooltip title="Item Discount">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                const existing = itemDiscounts[index];
                                setEditDiscType(existing?.type || '%');
                                setEditDiscValue(existing?.value?.toString() || '');
                                setDiscountEditIndex(index);
                                setDiscountAnchorEl(e.currentTarget);
                              }}
                              sx={{
                                border: `1px solid ${itemDiscounts[index] ? COLORS.amber : COLORS.border}`,
                                borderRadius: 0,
                                color: itemDiscounts[index] ? COLORS.amber : COLORS.textMuted,
                                bgcolor: itemDiscounts[index] ? COLORS.warningSurface : 'transparent',
                                mr: 0.5,
                                fontSize: '0.6rem',
                                fontWeight: 900,
                                width: 28,
                                height: 28,
                              }}
                            >
                              %
                            </IconButton>
                          </Tooltip>
                        )}
                        {!item.isBase && ( <IconButton color="error" size="small" onClick={() => removeFromCart(index)}><RemoveCircleIcon fontSize="small"/></IconButton> )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* RIGHT: BILLING & PAYMENT */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
             <Paper variant="outlined" sx={{ p: 2, bgcolor: COLORS.cardBg, borderRadius: 0 }}>
                <Typography variant="subtitle2" fontWeight="900" color="textSecondary" gutterBottom>DISCOUNTS (RA 9994)</Typography>
                {hasScId && <Alert severity="info" icon={false} sx={{ py: 0, px: 1, mb: 1, '& .MuiAlert-message': { p: 0.5, fontSize: '0.75rem', fontWeight: 'bold' } }}>Verified Senior/PWD ID found.</Alert>}
                <FormControlLabel
                  control={
                    <Switch
                      checked={applyScPwd}
                      onChange={(e) => {
                        setApplyScPwd(e.target.checked);
                        // T4.149: Clear all custom discounts when enabling SC/PWD — they are mutually exclusive.
                        if (e.target.checked) {
                          setItemDiscounts({});
                          setBillDiscountValue('');
                          setBillDiscountReason('');
                        }
                      }}
                      color="secondary"
                      // T4.149: Disable SC/PWD switch when any custom discount is active.
                      disabled={Object.keys(itemDiscounts).length > 0 || parseFloat(billDiscountValue) > 0}
                    />
                  }
                  label={<Typography variant="body2" fontWeight="bold">Apply 20% SC/PWD</Typography>}
                />
                {(Object.keys(itemDiscounts).length > 0 || parseFloat(billDiscountValue) > 0) && (
                  <Typography variant="caption" color="error" fontWeight="bold" display="block" sx={{ mt: 0.5 }}>
                    Disabled — custom discount is active. Remove custom discounts first.
                  </Typography>
                )}
                <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 0.5 }}>Applies strictly to eligible medical services & medicines.</Typography>
             </Paper>

             <Paper variant="outlined" sx={{ p: 2.5, bgcolor: COLORS.warningSurface, border: `1px solid ${COLORS.peach}`, borderRadius: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="body2" color="textSecondary" fontWeight="bold">Subtotal:</Typography><Typography variant="body2" fontWeight="bold">₱{financials.subtotal}</Typography></Box>
                {applyScPwd && parseFloat(financials.discount) > 0 && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="body2" color="textSecondary" fontWeight="bold">Eligible VAT Exempt:</Typography><Typography variant="body2" fontWeight="bold">₱{financials.vatExempt}</Typography></Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="body2" color="error" fontWeight="bold">SC/PWD Discount:</Typography><Typography variant="body2" color="error" fontWeight="bold">- ₱{financials.discount}</Typography></Box>
                  </>
                )}
                {/* T4.149: Custom discount stacking preview */}
                {!applyScPwd && parseFloat(financials.itemDiscounts) > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ color: COLORS.amber }} fontWeight="bold">Item Discounts:</Typography>
                    <Typography variant="body2" sx={{ color: COLORS.amber }} fontWeight="bold">- ₱{financials.itemDiscounts}</Typography>
                  </Box>
                )}
                {!applyScPwd && parseFloat(financials.itemDiscounts) > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="textSecondary" fontWeight="bold">After Items:</Typography>
                    <Typography variant="body2" fontWeight="bold">₱{financials.afterItemDiscounts}</Typography>
                  </Box>
                )}
                {!applyScPwd && parseFloat(financials.billDiscount) > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ color: COLORS.warning }} fontWeight="bold">
                      Bill Discount ({billDiscountType === '%' ? `${billDiscountValue}%` : `₱${billDiscountValue}`}):
                    </Typography>
                    <Typography variant="body2" sx={{ color: COLORS.warning }} fontWeight="bold">- ₱{financials.billDiscount}</Typography>
                  </Box>
                )}
                <Divider sx={{ my: 1.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 2 }}><Typography variant="body1" fontWeight="900" color={COLORS.brand}>GRAND TOTAL:</Typography><Typography variant="h5" fontWeight="900" color={COLORS.brand}>₱{financials.total}</Typography></Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}><Typography variant="body2" color="textSecondary" fontWeight="bold">Less: Deposit Paid</Typography><TextField size="small" type="number" value={depositAmount} onChange={(e) => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setDepositAmount(v); }} error={parseFloat(depositAmount) < 0} helperText={parseFloat(depositAmount) < 0 ? 'Cannot be negative' : ''} InputProps={{ startAdornment: <Typography sx={{mr: 0.5, color: COLORS.textMuted}}>₱</Typography>, inputProps: { min: 0 } }} sx={{ width: 120, bgcolor: COLORS.cardBg }} /></Box>
                <Divider sx={{ my: 1.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}><Typography variant="h6" fontWeight="900" color={COLORS.brand}>BALANCE DUE:</Typography><Typography variant="h4" fontWeight="900" color={COLORS.success}>₱{financials.balanceDue}</Typography></Box>
             </Paper>

             {/* T4.149: Bill Discount — transaction-level custom discount with mandatory reason */}
             {!applyScPwd && (
               <Paper variant="outlined" sx={{ p: 2, bgcolor: COLORS.warningSurface, border: `2px solid ${COLORS.amber}`, borderRadius: 0 }}>
                 <Typography variant="subtitle2" fontWeight={900} sx={{ color: COLORS.warning, mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem' }}>
                   BILL DISCOUNT
                 </Typography>
                 <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                   <ToggleButtonGroup
                     value={billDiscountType}
                     exclusive
                     onChange={(_, v) => { if (v) setBillDiscountType(v); }}
                     size="small"
                     sx={{ '& .MuiToggleButton-root': { borderRadius: 0, fontWeight: 900, border: `2px solid ${COLORS.amber}`, px: 1.5 } }}
                   >
                     <ToggleButton value="%" sx={{ '&.Mui-selected': { bgcolor: COLORS.amber, color: COLORS.cardBg } }}>%</ToggleButton>
                     <ToggleButton value="₱" sx={{ '&.Mui-selected': { bgcolor: COLORS.amber, color: COLORS.cardBg } }}>₱</ToggleButton>
                   </ToggleButtonGroup>
                   <TextField
                     fullWidth size="small" type="number"
                     placeholder={billDiscountType === '%' ? 'e.g. 10' : 'e.g. 100'}
                     value={billDiscountValue}
                     onChange={(e) => {
                       const v = e.target.value;
                       if (v === '' || parseFloat(v) >= 0) setBillDiscountValue(v);
                     }}
                     InputProps={{
                       startAdornment: <InputAdornment position="start">{billDiscountType}</InputAdornment>,
                       inputProps: { min: 0, max: billDiscountType === '%' ? 100 : undefined },
                     }}
                     sx={{ bgcolor: COLORS.cardBg }}
                   />
                 </Box>
                 <FormControl fullWidth size="small" sx={{ bgcolor: COLORS.cardBg }}>
                   <InputLabel>Reason (required)</InputLabel>
                   <Select
                     value={billDiscountReason}
                     label="Reason (required)"
                     onChange={(e) => setBillDiscountReason(e.target.value)}
                   >
                     {DISCOUNT_REASONS.map(r => (
                       <MenuItem key={r} value={r}>{r}</MenuItem>
                     ))}
                   </Select>
                 </FormControl>
                 {parseFloat(billDiscountValue) > 0 && !billDiscountReason && (
                   <Typography variant="caption" color="error" fontWeight="bold" display="block" sx={{ mt: 1 }}>
                     A reason is required to apply a bill discount.
                   </Typography>
                 )}
                 {Object.keys(itemDiscounts).length > 0 && parseFloat(billDiscountValue) > 0 && (
                   <Chip
                     label={`${Object.keys(itemDiscounts).length + 1} discounts applied`}
                     size="small"
                     sx={{ mt: 1, borderRadius: 0, bgcolor: COLORS.amber, color: COLORS.cardBg, fontWeight: 900 }}
                   />
                 )}
               </Paper>
             )}

             {/* T4.150: Multi-tender payment section — sequential-add pattern */}
             <Paper variant="outlined" sx={{ p: 2, bgcolor: COLORS.cardBg, borderRadius: 0 }}>
               <Typography variant="subtitle2" fontWeight="900" color="textSecondary" gutterBottom>
                 PAYMENT METHOD
               </Typography>

               {paymentTenders.map((tender, idx) => (
                 <Box key={idx} sx={{
                   display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5,
                   p: 1.5, border: `2px solid ${COLORS.border}`, borderRadius: 0,
                   bgcolor: COLORS.formBg || COLORS.surfaceHover,
                   ...(paymentTenders.length > 1 ? { boxShadow: `3px 3px 0px ${COLORS.accent}1A` } : {}),
                 }}>
                   {/* Row: Method dropdown + Amount + Remove */}
                   <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                     <FormControl size="small" sx={{ minWidth: 140 }}>
                       <Select
                         value={tender.method}
                         onChange={(e) => updateTender(idx, 'method', e.target.value)}
                         sx={{ borderRadius: 0, fontWeight: 900, fontSize: '0.8rem' }}
                       >
                         {PAYMENT_METHODS.map(m => (
                           <MenuItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</MenuItem>
                         ))}
                       </Select>
                     </FormControl>
                     <TextField
                       size="small" type="number" fullWidth
                       placeholder={balanceDueNum.toFixed(2)}
                       value={tender.amount}
                       onChange={(e) => {
                         const v = e.target.value;
                         if (v === '' || parseFloat(v) >= 0) updateTender(idx, 'amount', v);
                       }}
                       InputProps={{
                         startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                         inputProps: { min: 0 },
                       }}
                       sx={{ bgcolor: COLORS.cardBg, borderRadius: 0 }}
                     />
                     {paymentTenders.length > 1 && (
                       <IconButton
                         size="small"
                         onClick={() => removeTender(idx)}
                         sx={{ color: COLORS.danger, border: `1px solid ${COLORS.danger}4D`, borderRadius: 0 }}
                       >
                         <RemoveCircleIcon fontSize="small" />
                       </IconButton>
                     )}
                   </Box>

                   {/* Cash-specific: Amount Tendered + Change Due */}
                   {tender.method === 'cash' && (
                     <Box sx={{ mt: 0.5 }}>
                       <TextField
                         fullWidth size="small" label="Amount Tendered"
                         type="number"
                         value={tender.amountTendered}
                         onChange={(e) => {
                           const v = e.target.value;
                           if (v === '' || parseFloat(v) >= 0) updateTender(idx, 'amountTendered', v);
                         }}
                         error={
                           tender.amountTendered !== ''
                           && (parseFloat(tender.amountTendered) || 0) < (parseFloat(tender.amount) || balanceDueNum)
                         }
                         helperText={
                           tender.amountTendered !== ''
                           && (parseFloat(tender.amountTendered) || 0) < (parseFloat(tender.amount) || balanceDueNum)
                             ? 'Insufficient amount'
                             : ''
                         }
                         InputProps={{
                           startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                           inputProps: { min: 0 },
                         }}
                         sx={{ bgcolor: COLORS.cardBg, mb: 1, borderRadius: 0 }}
                       />
                       {(parseFloat(tender.amountTendered) || 0) > 0
                         && (parseFloat(tender.amountTendered) || 0) >= (parseFloat(tender.amount) || balanceDueNum) && (
                         <Box sx={{
                           display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                           p: 1.5, bgcolor: COLORS.kpiGreenBg, border: `2px solid ${COLORS.success}`,
                           borderRadius: 0,
                         }}>
                           <Typography variant="subtitle2" fontWeight={900} color={COLORS.success}>
                             CHANGE DUE:
                           </Typography>
                           <Typography variant="h6" fontWeight={900} color={COLORS.success}>
                             ₱{getChangeDue(tender).toFixed(2)}
                           </Typography>
                         </Box>
                       )}
                     </Box>
                   )}

                   {/* T4.237 D3: Reference number — required for GCash/Maya/Bank/Check */}
                   {isRefNumberRequired(tender.method) && (
                     <TextField
                       fullWidth size="small"
                       label="Reference Number"
                       placeholder="e.g. GCash transaction ID"
                       value={tender.referenceNumber || ''}
                       onChange={(e) => updateTender(idx, 'referenceNumber', e.target.value)}
                       error={!tender.referenceNumber?.trim()}
                       helperText={
                         !tender.referenceNumber?.trim()
                           ? `Required for ${PAYMENT_METHOD_LABELS[tender.method] || tender.method}`
                           : ''
                       }
                       sx={{ bgcolor: COLORS.cardBg, borderRadius: 0 }}
                     />
                   )}
                 </Box>
               ))}

               {/* Add Payment Method button — shown when fewer than 4 tenders */}
               {paymentTenders.length < 4 && (
                 <Button
                   fullWidth
                   variant="outlined"
                   size="small"
                   onClick={addTender}
                   sx={{
                     mt: 0.5, borderRadius: 0, fontWeight: 900,
                     color: COLORS.sky, borderColor: COLORS.sky,
                     borderStyle: 'dashed', borderWidth: 2,
                     '&:hover': { borderColor: COLORS.skyHover || COLORS.sky, bgcolor: COLORS.chipBlueBg },
                   }}
                 >
                   + ADD PAYMENT METHOD
                 </Button>
               )}

               {/* Remaining balance indicator */}
               <Box sx={{
                 display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                 mt: 1.5, p: 1.5, borderRadius: 0,
                 bgcolor: remaining > 0.005 ? COLORS.kpiOrangeBg : COLORS.kpiGreenBg,
                 border: `2px solid ${remaining > 0.005 ? COLORS.warning : COLORS.success}`,
               }}>
                 <Typography variant="subtitle2" fontWeight={900}
                   color={remaining > 0.005 ? COLORS.warning : COLORS.success}
                 >
                   {remaining > 0.005 ? 'REMAINING:' : 'FULLY COVERED'}
                 </Typography>
                 <Typography variant="h6" fontWeight={900}
                   color={remaining > 0.005 ? COLORS.warning : COLORS.success}
                 >
                   ₱{remaining.toFixed(2)}
                 </Typography>
               </Box>
             </Paper>
          </Box>
          </Box>{/* closes the main content flex row */}

          {/* T4.149: Per-item discount Popover */}
          <Popover
            open={Boolean(discountAnchorEl)}
            anchorEl={discountAnchorEl}
            onClose={() => { setDiscountAnchorEl(null); setDiscountEditIndex(null); }}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.amber}`, boxShadow: `4px 4px 0px ${COLORS.amber}33`, p: 2, width: 240 } }}
          >
            <Typography variant="subtitle2" fontWeight={900} sx={{ color: COLORS.warning, mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem' }}>
              Item Discount
            </Typography>
            <ToggleButtonGroup
              value={editDiscType}
              exclusive
              onChange={(_, v) => { if (v) setEditDiscType(v); }}
              size="small"
              fullWidth
              sx={{ mb: 1.5, '& .MuiToggleButton-root': { borderRadius: 0, fontWeight: 900, border: `2px solid ${COLORS.amber}` } }}
            >
              <ToggleButton value="%" sx={{ '&.Mui-selected': { bgcolor: COLORS.amber, color: COLORS.cardBg } }}>%</ToggleButton>
              <ToggleButton value="₱" sx={{ '&.Mui-selected': { bgcolor: COLORS.amber, color: COLORS.cardBg } }}>₱</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              fullWidth size="small" type="number" autoFocus
              placeholder={editDiscType === '%' ? 'e.g. 10' : 'e.g. 50'}
              value={editDiscValue}
              onChange={(e) => setEditDiscValue(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">{editDiscType}</InputAdornment>,
                inputProps: { min: 0, max: editDiscType === '%' ? 100 : undefined },
              }}
              sx={{ mb: 1.5, bgcolor: COLORS.cardBg }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                fullWidth variant="contained" size="small"
                onClick={() => {
                  const val = parseFloat(editDiscValue) || 0;
                  if (val > 0) {
                    setItemDiscounts(prev => ({ ...prev, [discountEditIndex]: { type: editDiscType, value: val } }));
                  } else {
                    setItemDiscounts(prev => { const next = { ...prev }; delete next[discountEditIndex]; return next; });
                  }
                  setDiscountAnchorEl(null);
                  setDiscountEditIndex(null);
                }}
                sx={{ bgcolor: COLORS.amber, fontWeight: 900, borderRadius: 0, '&:hover': { bgcolor: COLORS.warning } }}
              >
                Apply
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setItemDiscounts(prev => { const next = { ...prev }; delete next[discountEditIndex]; return next; });
                  setDiscountAnchorEl(null);
                  setDiscountEditIndex(null);
                }}
                sx={{ color: COLORS.textMuted, fontWeight: 900, borderRadius: 0 }}
              >
                Clear
              </Button>
            </Box>
          </Popover>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, bgcolor: COLORS.panelBg, display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${COLORS.timelineRail}` }}>
          <Button onClick={onClose} sx={{ color: COLORS.accent, fontWeight: 'bold', px: 3, borderRadius: 0 }}>Cancel</Button>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            {checkoutError && (
              <Alert severity="error" onClose={() => setCheckoutError('')} sx={{ borderRadius: 0, fontWeight: 700, width: '100%' }}>
                {checkoutError}
              </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button onClick={handleSaveDraft} disabled={loading || isRetailMode} variant="outlined" color="primary" startIcon={<SaveIcon />} sx={{ borderRadius: 0 }}>Save Invoice Draft</Button>
              <Button
                onClick={() => {
                  if (isRetailMode) {
                    setShowCustomerNudge(true);
                  } else {
                    handleCheckout();
                  }
                }}
                disabled={
                  loading
                  || remaining > 0.005
                  || anyCashInsufficient
                  || (parseFloat(billDiscountValue) > 0 && !billDiscountReason)
                  // T4.237 D3: Block checkout when a non-Cash tender is missing a reference number
                  || paymentTenders.some(t => isRefNumberRequired(t.method) && !t.referenceNumber?.trim())
                }
                variant="contained" color="success" size="large" startIcon={<PaidIcon />} sx={{ px: 4, fontWeight: '900', borderRadius: 0, boxShadow: `4px 4px 0px ${COLORS.brand}` }}
              >
                {loading ? "Processing..." : `Settle Balance (₱${financials.balanceDue})`}
              </Button>
            </Box>
          </Box>
        </DialogActions>
      </Dialog>

      {/* 🚨 EXTERNAL RX OVERRIDE MODAL */}
      <Dialog open={openRxOverride} onClose={() => setOpenRxOverride(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.danger}` } }}>
        <DialogTitle sx={{ bgcolor: COLORS.danger, color: COLORS.cardBg, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <DescriptionIcon /> External Prescription Override
        </DialogTitle>
        <DialogContent sx={{ p: 3, bgcolor: COLORS.surfaceHover }}>
          <Alert severity="warning" sx={{ mb: 3, borderRadius: 0 }}>
            <Typography variant="body2" fontWeight="bold">You are attempting to sell a Prescription-Only (Rx) medication over the counter.</Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
              By law, you must record the external Veterinarian and Clinic that issued the prescription to dispense <b>{pendingRxItem?.itemName}</b> without an internal consultation.
            </Typography>
          </Alert>
          <TextField autoFocus fullWidth label="Prescribing Veterinarian Name" placeholder="e.g. Dr. Juan Dela Cruz" value={extVetName} onChange={(e) => setExtVetName(e.target.value)} sx={{ mb: 2, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { borderRadius: 0 } }} />
          <TextField fullWidth label="External Clinic Name" placeholder="e.g. ABC Animal Hospital" value={extClinicName} onChange={(e) => setExtClinicName(e.target.value)} sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { borderRadius: 0 } }} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenRxOverride(false)} sx={{ color: COLORS.textSecondary, fontWeight: 'bold', borderRadius: 0 }}>Cancel Sale</Button>
          <Button onClick={handleExternalRxApprove} variant="contained" color="error" sx={{ fontWeight: 'bold', borderRadius: 0 }}>Authorize & Add to Cart</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showCustomerNudge}
        onClose={() => {}}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.sky}`, boxShadow: `8px 8px 0px ${COLORS.sky}1A` } }}
      >
        <DialogTitle sx={{
          bgcolor: COLORS.chipBlueBg, color: COLORS.brand, fontWeight: 900,
          display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
          borderBottom: `2px solid ${COLORS.sky}`,
          textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.95rem',
        }}>
          <PersonSearchIcon /> Link to Client Account?
        </DialogTitle>
        <DialogContent sx={{ p: 3, bgcolor: COLORS.cardBg }}>
          <Typography variant="body2" sx={{ mb: 2, color: COLORS.textSecondary, fontWeight: 700 }}>
            Link this sale to a client for purchase history tracking, or skip for an anonymous counter sale.
          </Typography>
          <Autocomplete
            options={clientOptions}
            getOptionLabel={(opt) => `${opt.fullName || 'Unknown'} — ${opt.phone || 'No phone'}`}
            loading={clientSearchLoading}
            onInputChange={(_, val) => searchClients(val)}
            onChange={(_, val) => setLinkedClient(val)}
            value={linkedClient}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search client by name or phone"
                placeholder="e.g. Juan Dela Cruz or 09..."
                fullWidth
                sx={{ bgcolor: COLORS.formBg }}
              />
            )}
            noOptionsText="No clients found"
            sx={{ mb: 2 }}
          />
          {linkedClient && (
            <Alert severity="success" sx={{ borderRadius: 0, fontWeight: 800, border: `2px solid ${COLORS.success}` }}>
              Linking sale to: <strong>{linkedClient.fullName}</strong> ({linkedClient.phone || 'No phone'})
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, bgcolor: COLORS.panelBg, display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${COLORS.border}` }}>
          <Button
            onClick={() => {
              setLinkedClient(null);
              setShowCustomerNudge(false);
              handleRetailCheckout(null);
            }}
            sx={{
              fontWeight: 900, borderRadius: 0, px: 3,
              color: COLORS.textMuted, border: `2px solid ${COLORS.border}`,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}
          >
            SKIP — COUNTER SALE
          </Button>
          <Button
            variant="contained"
            disabled={!linkedClient}
            onClick={() => {
              setShowCustomerNudge(false);
              handleRetailCheckout(linkedClient);
            }}
            sx={{
              bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, px: 4,
              '&:hover': { bgcolor: COLORS.skyHover || COLORS.sky },
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}
          >
            LINK CLIENT
          </Button>
        </DialogActions>
      </Dialog>

      {/* Prescribed item removal confirmation */}
      <Dialog open={!!confirmRemove} onClose={() => setConfirmRemove(null)}>
        <DialogTitle>Remove Prescribed Item?</DialogTitle>
        <DialogContent>
          <Typography>The veterinarian explicitly prescribed <strong>{confirmRemove?.name}</strong>. Are you sure you want to remove it?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => {
            const newCart = [...cart]; newCart.splice(confirmRemove.index, 1); setCart(newCart);
            setConfirmRemove(null);
          }}>Remove</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} onClose={() => setToast(t => ({ ...t, open: false }))} sx={{ borderRadius: 0 }}>{toast.message}</Alert>
      </Snackbar>
    </>
  );
}