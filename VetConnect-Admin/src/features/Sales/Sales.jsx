import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { DataGrid } from '@mui/x-data-grid';
import {
  Box, Typography, Paper, Chip, IconButton, Tooltip, Snackbar,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Checkbox, FormControlLabel,
  InputAdornment, TextField, Alert, Switch, TableSortLabel, FormControl, Select, MenuItem
} from '@mui/material';
import { useSalesData } from './hooks/useSalesData';
import EodSummary from './components/EodSummary';
import { printViaIframe, downloadHtmlAsFile, emailReceiptToOwner } from '../../utils/receiptUtils';
import POSModal from '../../components/POSModal';

// Icons
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';

// Design Tokens
import { FONT, COLORS } from '../../theme/designTokens';
import { useUser } from '../../context/UserContext';
import { useClinicSettings } from '../../hooks/useClinicSettings';

export default function Sales() {
  const { profile, isAdmin } = useUser();
  const clinicSettings = useClinicSettings();
  const location = useLocation();
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);

  // THE BRAIN: Hook handles all database fetching, refund, void, and EOD close-out.
  const { sales, loading, error: salesError, eodTotals, processRefundTransaction, voidTransaction, isDayClosed, closingData, closeDay, reopenDay } = useSalesData(filterDate, profile);

  // T4.184: Retail POS state
  const [openRetailPOS, setOpenRetailPOS] = useState(false);
  const [inventoryList, setInventoryList] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [servicesList, setServicesList] = useState([]);

  useEffect(() => {
    const unsubInv = onSnapshot(collection(db, 'inventory'), (snap) =>
      setInventoryList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubCat = onSnapshot(collection(db, 'inventory_categories'), (snap) =>
      setInventoryCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubSvc = onSnapshot(collection(db, 'services'), (snap) =>
      setServicesList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.isArchived))
    );
    return () => { unsubInv(); unsubCat(); unsubSvc(); };
  }, []);

  const joinedInventory = useMemo(() => {
    return inventoryList
      .filter(item => !item.isArchived)
      .map(item => {
        const catObj = inventoryCategories.find(c => c.name?.toLowerCase() === item.category?.toLowerCase());
        return {
          ...item,
          isMedicine: catObj ? !!catObj.isMedicine : false,
          productClass: catObj?.productClass || (catObj?.isMedicine ? 'medicine' : 'retail'),
        };
      });
  }, [inventoryList, inventoryCategories]);

  // --- UI STATES ---
  const [searchText, setSearchText] = useState('');
  const [filterMethod, setFilterMethod] = useState(['All']);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterType, setFilterType] = useState('All');

  useEffect(() => {
    const df = location.state?.dashboardFilter;
    if (!df) return;
    if (df.status === 'refunded') setFilterStatus('refunded');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (location.state?.openRetailPOS) {
      setOpenRetailPOS(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // --- NATIVE SORTING STATES ---
  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('jsDate');

  const [openRefund, setOpenRefund] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [restock, setRestock] = useState(true);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  // T2.104: Void transaction state
  const [openVoid, setOpenVoid] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);

  // T4.151: EOD close-out state
  const [openCloseDay, setOpenCloseDay] = useState(false);
  const [openReopenDay, setOpenReopenDay] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [openZReport, setOpenZReport] = useState(false);
  const [closeDayLoading, setCloseDayLoading] = useState(false);

  // T4.152: Reprint 3-button dialog state
  const [reprintSale, setReprintSale] = useState(null);
  const [reprintFeedback, setReprintFeedback] = useState('');

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
      // T4.150: Match method filter against paymentTenders[] (with legacy fallback).
      const saleMethods = s.paymentTenders && s.paymentTenders.length > 0
        ? s.paymentTenders.map(t => t.method)
        : [s.paymentMethod];
      const matchMethod = filterMethod.includes('All')
        || saleMethods.some(m => filterMethod.includes(m))
        || (filterMethod.includes('Card') && saleMethods.includes('Bank Transfer'));
      const matchStatus = filterStatus === 'All' || (filterStatus === 'Paid' ? s.status !== 'refunded' : filterStatus === 'refunded' ? s.status === 'refunded' : true);
      const saleType = s.saleType || 'clinical';
      const matchType = filterType === 'All' || saleType === filterType;
      return matchSearch && matchMethod && matchStatus && matchType;
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
  }, [sales, searchText, filterMethod, filterStatus, filterType, order, orderBy]);

  const handleOpenRefund = (sale) => {
    setSelectedSale(sale); setRestock(true); setOpenRefund(true);
  };

  // T2.104: Void transaction handler
  const executeVoid = async () => {
    try {
      await voidTransaction(voidTarget);
      setOpenVoid(false);
      setVoidTarget(null);
      setToast({ open: true, message: 'Transaction voided. Stock has been restored.', severity: 'success' });
    } catch (error) {
      console.error('[Sales.executeVoid]:', error);
      setToast({ open: true, message: 'Void failed: ' + error.message, severity: 'error' });
    }
  };

  // T4.151: Close Day handler — freezes current financial totals into a Z-report.
  const handleCloseDay = async () => {
    setCloseDayLoading(true);
    try {
      await closeDay(profile);
      setOpenCloseDay(false);
      setToast({ open: true, message: 'Day closed successfully. Z-report frozen.', severity: 'success' });
    } catch (error) {
      console.error('[Sales.handleCloseDay]:', error);
      setToast({ open: true, message: 'Close day failed: ' + error.message, severity: 'error' });
    } finally {
      setCloseDayLoading(false);
    }
  };

  // T4.151: Reopen Day handler — stamps audit metadata, preserves original frozen totals.
  const handleReopenDay = async () => {
    setCloseDayLoading(true);
    try {
      await reopenDay(profile, reopenReason);
      setOpenReopenDay(false);
      setReopenReason('');
      setToast({ open: true, message: 'Day reopened. Post-close flagging deactivated.', severity: 'info' });
    } catch (error) {
      console.error('[Sales.handleReopenDay]:', error);
      setToast({ open: true, message: 'Reopen failed: ' + error.message, severity: 'error' });
    } finally {
      setCloseDayLoading(false);
    }
  };

  const executeRefund = async () => {
    try {
      await processRefundTransaction(selectedSale, restock);
      setOpenRefund(false);
      setToast({ open: true, message: 'Refund processed successfully.', severity: 'success' });
    } catch (error) {
      console.error('[Sales.executeRefund]:', error);
      setToast({ open: true, message: 'Refund failed. Please try again.', severity: 'error' });
    }
  };

  /**
   * Generates the reprint receipt HTML for a given sale.
   * Extracted from the original handleReprint — returns HTML string instead of opening a window.
   */
  const generateReprintHTML = (sale) => {
    const receiptDate = sale.jsDate ? sale.jsDate.toLocaleString() : new Date().toLocaleString();
    const itemsHTML = (sale.items || []).map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name} ${item.isDiscountable ? '' : '<span style="color:red; font-size:10px;">(No SC/PWD)</span>'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.qty}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">P${parseFloat(item.price).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">P${(parseFloat(item.price) * item.qty).toFixed(2)}</td>
      </tr>
    `).join('');

    const tenderSection = (() => {
      if (sale.paymentTenders && sale.paymentTenders.length > 0) {
        const headerLabel = sale.paymentTenders.length > 1 ? 'Split' : sale.paymentMethod || 'Cash';
        const tenderLines = sale.paymentTenders.map(t => {
          const amt = parseFloat(t.amount) || 0;
          let line = `<div class="total-row" style="font-size:12px; color:#555;"><span>${t.method}:</span><span>P${amt.toFixed(2)}</span></div>`;
          if (t.method === 'Cash' && t.amountTendered) {
            line += `<div class="total-row" style="font-size:11px; color:#888; margin-left:10px;"><span>&nbsp;&nbsp;Tendered:</span><span>P${parseFloat(t.amountTendered).toFixed(2)}</span></div>`;
            line += `<div class="total-row" style="font-size:11px; color:#888; font-weight:bold; margin-left:10px;"><span>&nbsp;&nbsp;Change:</span><span>P${parseFloat(t.changeDue || 0).toFixed(2)}</span></div>`;
          }
          return line;
        }).join('');
        return `<div class="total-row" style="margin-top:5px; font-size:12px; color:#555; font-weight:bold;"><span>Payment:</span><span>${headerLabel}</span></div>${tenderLines}`;
      }
      return `<div class="total-row" style="margin-top:5px; font-size:12px; color:#555;"><span>Payment Method:</span><span>${sale.paymentMethod || 'Cash'}</span></div>
        ${sale.paymentMethod === 'Cash' && sale.amountTendered ? `
          <div class="total-row" style="font-size:12px; color:#555;"><span>Tendered:</span><span>P${parseFloat(sale.amountTendered).toFixed(2)}</span></div>
          <div class="total-row" style="font-size:12px; color:#555; font-weight:bold;"><span>Change:</span><span>P${parseFloat(sale.changeDue || 0).toFixed(2)}</span></div>
        ` : ''}`;
    })();

    return `
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
            <p class="clinic-name">${clinicSettings.clinicName}</p>
            <p style="margin: 0; font-size: 12px; color: #666;">${clinicSettings.clinicAddress} | Official Receipt</p>
          </div>
          <div class="details">
            <p><strong>Receipt #:</strong> ${sale.receiptNumber || sale.id.slice(0, 8).toUpperCase()}</p>
            <p><strong>Date:</strong> ${receiptDate}</p>
            <p><strong>Patient:</strong> ${sale.petName || sale.petNames || 'N/A'} (${sale.ownerName || 'Walk-In'})</p>
            <p><strong>Cashier:</strong> ${sale.cashier || 'System'}</p>
          </div>
          <table>
            <thead><tr><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Amount</th></tr></thead>
            <tbody>${itemsHTML}</tbody>
          </table>
          <div class="totals">
            <div class="total-row"><span>Subtotal:</span><span>P${parseFloat(sale.subtotal || 0).toFixed(2)}</span></div>
            ${sale.hasScPwdDiscount && parseFloat(sale.discount || 0) > 0 ? `<div class="total-row" style="color: #D32F2F;"><span>SC/PWD Discount (20%):</span><span>- P${parseFloat(sale.discount).toFixed(2)}</span></div>` : ''}
            ${!sale.hasScPwdDiscount && parseFloat(sale.itemDiscountsTotal || 0) > 0 ? `<div class="total-row" style="color: #E65100;"><span>Item Discounts:</span><span>- P${parseFloat(sale.itemDiscountsTotal).toFixed(2)}</span></div>` : ''}
            ${!sale.hasScPwdDiscount && parseFloat(sale.billDiscountAmount || 0) > 0 ? `<div class="total-row" style="color: #E65100;"><span>Bill Discount (${sale.billDiscountReason || 'Custom'}):</span><span>- P${parseFloat(sale.billDiscountAmount).toFixed(2)}</span></div>` : ''}
            <div class="total-row"><span>Less Deposit:</span><span>- P${parseFloat(sale.depositPaid || 0).toFixed(2)}</span></div>
            <div class="total-row grand-total"><span>BALANCE PAID:</span><span>P${(parseFloat(sale.total || 0) - parseFloat(sale.depositPaid || 0)).toFixed(2)}</span></div>
            ${tenderSection}
          </div>
          <div class="footer">
            <p>Thank you for trusting ${clinicSettings.clinicName} with your pet's health!</p>
            <p>This document is a system-generated duplicate receipt.</p>
          </div>
        </body>
      </html>
    `;
  };

  // T4.152: Opens the 3-button reprint dialog instead of directly printing.
  const handleReprint = (sale) => {
    setReprintSale(sale);
    setReprintFeedback('');
  };

  const handlePrintReport = () => {
    const reportDate = new Date(filterDate).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const paidCount = sales.filter(s => s.status !== 'refunded').length;
    const refundedCount = sales.filter(s => s.status === 'refunded').length;

    const reportContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; max-width: 700px; margin: 0 auto; padding: 30px; }
            h1 { color: #5D4037; font-size: 20px; border-bottom: 2px solid #5D4037; padding-bottom: 10px; margin-bottom: 5px; }
            h2 { color: #5D4037; font-size: 14px; margin-top: 25px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #D7CCC8; padding-bottom: 5px; }
            .date { color: #8D6E63; font-size: 13px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            th, td { padding: 8px 12px; text-align: left; font-size: 13px; }
            th { background: #F5F0EB; font-weight: 700; border-bottom: 2px solid #5D4037; }
            td { border-bottom: 1px solid #E0D6CC; }
            .amount { text-align: right; font-weight: 700; }
            .total-row td { font-weight: 800; font-size: 15px; border-top: 2px solid #5D4037; }
            .refund { color: #D32F2F; }
            .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #A1887F; border-top: 1px solid #E0D6CC; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>End-of-Day Sales Report</h1>
          <p class="date">${reportDate}</p>

          <h2>Payment Breakdown</h2>
          <table>
            <thead><tr><th>Method</th><th class="amount">Collected</th></tr></thead>
            <tbody>
              <tr><td>Cash</td><td class="amount">P${eodTotals.cash.toFixed(2)}</td></tr>
              <tr><td>GCash / Maya</td><td class="amount">P${eodTotals.gcash.toFixed(2)}</td></tr>
              <tr><td>Card</td><td class="amount">P${eodTotals.card.toFixed(2)}</td></tr>
              <tr><td>Bank Transfer</td><td class="amount">P${eodTotals.bank.toFixed(2)}</td></tr>
              <tr class="total-row"><td>Total Collected</td><td class="amount">P${eodTotals.totalCollected.toFixed(2)}</td></tr>
            </tbody>
          </table>

          <h2>Summary</h2>
          <table>
            <tbody>
              <tr><td>Total Billed</td><td class="amount">P${eodTotals.totalBilled.toFixed(2)}</td></tr>
              <tr><td>Prior Deposits Applied</td><td class="amount">P${eodTotals.totalDeposits.toFixed(2)}</td></tr>
              <tr><td>SC/PWD Discounts Given</td><td class="amount">P${eodTotals.totalDiscounts.toFixed(2)}</td></tr>
              ${eodTotals.totalCustomDiscounts > 0 ? `<tr><td>Custom Discounts Given</td><td class="amount">P${eodTotals.totalCustomDiscounts.toFixed(2)}</td></tr>` : ''}
              ${eodTotals.refunds > 0 ? `<tr class="refund"><td>Refunds</td><td class="amount">- P${eodTotals.refunds.toFixed(2)}</td></tr>` : ''}
              <tr class="total-row"><td>Net Collected Today</td><td class="amount">P${(eodTotals.totalCollected - eodTotals.refunds).toFixed(2)}</td></tr>
            </tbody>
          </table>

          <h2>Transaction Count</h2>
          <table>
            <tbody>
              <tr><td>Paid Transactions</td><td class="amount">${paidCount}</td></tr>
              ${refundedCount > 0 ? `<tr class="refund"><td>Refunded Transactions</td><td class="amount">${refundedCount}</td></tr>` : ''}
              <tr class="total-row"><td>Total Transactions</td><td class="amount">${sales.length}</td></tr>
            </tbody>
          </table>

          <div class="footer">
            <p>Generated on ${new Date().toLocaleString('en-PH')} | ${clinicSettings.clinicName}</p>
            <p>This is a system-generated end-of-day report.</p>
          </div>
        </body>
      </html>
    `;
    // T4.152: Use iframe printing instead of window.open to avoid pop-up blockers.
    printViaIframe(reportContent);
  };

  /**
   * Generates the Z-Report HTML document from the frozen closing data.
   * Follows the same styling conventions as handlePrintReport.
   */
  const generateZReportHTML = () => {
    const cd = closingData;
    if (!cd) return '';
    const closedTime = cd.closedAt?.toDate?.()
      ? cd.closedAt.toDate().toLocaleString('en-PH')
      : 'N/A';
    const reportDate = new Date(filterDate).toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const postCloseSales = sales.filter(s => s.postClose);
    const postCloseRevenue = postCloseSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

    return `<html>
      <head><style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; max-width: 700px; margin: 0 auto; padding: 30px; }
        h1 { color: #5D4037; font-size: 22px; border-bottom: 3px solid #5D4037; padding-bottom: 10px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
        h2 { color: #5D4037; font-size: 14px; margin-top: 25px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #D7CCC8; padding-bottom: 5px; }
        .date { color: #8D6E63; font-size: 13px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th, td { padding: 8px 12px; text-align: left; font-size: 13px; }
        th { background: #F5F0EB; font-weight: 700; border-bottom: 2px solid #5D4037; }
        td { border-bottom: 1px solid #E0D6CC; }
        .amount { text-align: right; font-weight: 700; }
        .total-row td { font-weight: 800; font-size: 15px; border-top: 2px solid #5D4037; }
        .refund { color: #D32F2F; }
        .warning { color: #E65100; }
        .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #A1887F; border-top: 1px solid #E0D6CC; padding-top: 10px; }
        .z-badge { text-align: center; font-weight: 900; font-size: 18px; border: 3px solid #5D4037; padding: 8px; margin-bottom: 20px; letter-spacing: 3px; color: #5D4037; }
        .close-info { background: #F5F0EB; padding: 12px; margin-bottom: 20px; border-left: 4px solid #5D4037; }
        .post-close { background: #FFF3E0; padding: 12px; margin-bottom: 20px; border-left: 4px solid #E65100; }
        .signature { margin-top: 60px; display: flex; justify-content: space-between; }
        .sig-line { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 5px; font-size: 12px; }
      </style></head>
      <body>
        <div class="z-badge">Z-REPORT (END OF DAY)</div>
        <h1>${clinicSettings.clinicName || 'VetConnect Clinic'}</h1>
        <p class="date">${reportDate}</p>

        <div class="close-info">
          <strong>Closed by:</strong> ${cd.closedByName || 'N/A'}<br/>
          <strong>Closed at:</strong> ${closedTime}
          ${cd.reopenedAt ? `<br/><strong style="color:#E65100;">Reopened by:</strong> ${cd.reopenedByName || 'N/A'} — ${cd.reopenReason || 'No reason'}` : ''}
        </div>

        ${postCloseSales.length > 0 ? `
          <div class="post-close">
            <strong class="warning">Post-Close Activity:</strong> ${postCloseSales.length} transaction(s) totaling P${postCloseRevenue.toFixed(2)} recorded after day was closed.
          </div>
        ` : ''}

        <h2>Revenue Summary</h2>
        <table>
          <tbody>
            <tr><td>Total Transactions</td><td class="amount">${cd.transactionCount}</td></tr>
            <tr><td>Gross Revenue (Total Billed)</td><td class="amount">P${(cd.grossRevenue || 0).toFixed(2)}</td></tr>
            <tr><td>Prior Deposits Applied</td><td class="amount">P${(cd.depositTotal || 0).toFixed(2)}</td></tr>
            <tr><td>SC/PWD Discounts</td><td class="amount">P${(cd.scPwdDiscounts || 0).toFixed(2)}</td></tr>
            ${(cd.customDiscounts || 0) > 0 ? `<tr><td>Custom Discounts</td><td class="amount warning">P${(cd.customDiscounts || 0).toFixed(2)}</td></tr>` : ''}
            ${(cd.refunds || 0) > 0 ? `<tr class="refund"><td>Refunds</td><td class="amount">- P${(cd.refunds || 0).toFixed(2)}</td></tr>` : ''}
            ${(cd.voids || 0) > 0 ? `<tr class="refund"><td>Voided Transactions (${cd.voids})</td><td class="amount">P${(cd.voidAmount || 0).toFixed(2)}</td></tr>` : ''}
            <tr class="total-row"><td>Net Revenue Collected</td><td class="amount">P${(cd.netRevenue || 0).toFixed(2)}</td></tr>
          </tbody>
        </table>

        <h2>Payment Method Breakdown</h2>
        <table>
          <thead><tr><th>Method</th><th class="amount">Collected</th></tr></thead>
          <tbody>
            <tr><td>Cash</td><td class="amount">P${(cd.cashTotal || 0).toFixed(2)}</td></tr>
            <tr><td>GCash / Maya</td><td class="amount">P${(cd.gcashTotal || 0).toFixed(2)}</td></tr>
            <tr><td>Card</td><td class="amount">P${(cd.cardTotal || 0).toFixed(2)}</td></tr>
            <tr><td>Bank Transfer</td><td class="amount">P${(cd.bankTotal || 0).toFixed(2)}</td></tr>
            <tr class="total-row"><td>Total Collected</td><td class="amount">P${((cd.cashTotal || 0) + (cd.gcashTotal || 0) + (cd.cardTotal || 0) + (cd.bankTotal || 0)).toFixed(2)}</td></tr>
          </tbody>
        </table>

        <div class="signature">
          <div class="sig-line">Prepared by: ${cd.closedByName || '_______________'}</div>
          <div class="sig-line">Verified by: _______________</div>
        </div>

        <div class="footer">
          <p>Generated on ${new Date().toLocaleString('en-PH')} | ${clinicSettings.clinicName || 'VetConnect'}</p>
          <p>This is a system-generated Z-Report. Retain for BIR compliance.</p>
        </div>
      </body>
    </html>`;
  };

  const columns = [
    { 
      field: 'jsDate', flex: 1.2, minWidth: 160, sortable: false, disableColumnMenu: true,
      renderHeader: () => (<TableSortLabel active={orderBy === 'jsDate'} direction={orderBy === 'jsDate' ? order : 'asc'} onClick={() => handleRequestSort('jsDate')} sx={{ fontWeight: 800, color: COLORS.accent, fontSize: '0.75rem' }}>DATE & TIME</TableSortLabel>),
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 800, color: COLORS.brand, lineHeight: 1.2 }}>{p.value ? p.value.toLocaleDateString() : 'N/A'}</Typography>
            <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: 700, fontSize: '0.65rem', mt: 0.2 }}>{p.value ? p.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</Typography>
        </Box>
      )
    },
    { 
      field: 'id', headerName: 'Receipt #', width: 130, sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, color: COLORS.medical, bgcolor: COLORS.chipBlueBg, px: 1.2, py: 0.5, borderRadius: 0, border: `1px solid ${COLORS.medical}`, letterSpacing: 0.5 }}>{p.row.receiptNumber || p.value.slice(0, 8).toUpperCase()}</Typography>
        </Box>
      )
    },
    {
      field: 'saleType', headerName: 'TYPE', width: 100, align: 'center', headerAlign: 'center', sortable: false, disableColumnMenu: true,
      renderCell: (p) => {
        const type = p.value || 'clinical';
        const isRetail = type === 'retail';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Chip
              label={isRetail ? 'RETAIL' : 'CLINICAL'}
              size="small"
              sx={{
                borderRadius: 0,
                fontWeight: 900,
                fontSize: '0.6rem',
                letterSpacing: 0.5,
                bgcolor: isRetail ? COLORS.chipBlueBg : COLORS.kpiGreenBg,
                color: isRetail ? COLORS.sky : COLORS.success,
                border: `2px solid ${isRetail ? COLORS.sky : COLORS.success}`,
              }}
            />
          </Box>
        );
      },
    },
    {
      field: 'petName', flex: 1.5, minWidth: 200, sortable: false, disableColumnMenu: true,
      renderHeader: () => (<TableSortLabel active={orderBy === 'petName'} direction={orderBy === 'petName' ? order : 'asc'} onClick={() => handleRequestSort('petName')} sx={{ fontWeight: 800, color: COLORS.accent, fontSize: '0.75rem' }}>PATIENT & OWNER</TableSortLabel>),
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 800, color: COLORS.brand, lineHeight: 1.1 }}>{p.value}</Typography>
            <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: 700, fontSize: '0.65rem', mt: 0.5 }}>{p.row.ownerName}</Typography>
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
      field: 'paymentMethod', headerName: 'Method', width: 140, sortable: false, disableColumnMenu: true,
      renderCell: (p) => {
        // T4.150: Show primary method chip + "Split" badge for multi-tender sales.
        const tenders = p.row.paymentTenders;
        const isSplit = tenders && tenders.length > 1;
        const displayMethod = p.row.paymentMethod || p.value || 'Cash';

        const getMethodStyle = (method) => {
          if (method === 'Cash') return { icon: <AccountBalanceWalletIcon fontSize="small" />, color: COLORS.success };
          if (method?.includes('GCash')) return { icon: <PhoneIphoneIcon fontSize="small" />, color: COLORS.medical };
          if (method === 'Card') return { icon: <CreditCardIcon fontSize="small" />, color: COLORS.amber };
          return { icon: <AccountBalanceIcon fontSize="small" />, color: COLORS.grooming };
        };

        const { icon, color } = getMethodStyle(displayMethod);
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', height: '100%', gap: 0.3 }}>
            <Chip icon={icon} label={displayMethod} size="small" sx={{ borderRadius: 0, bgcolor: COLORS.cardBg, color: color, border: `2px solid ${color}`, fontWeight: 900, '& .MuiChip-icon': { color: color } }} />
            {isSplit && (
              <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 900, color: COLORS.sky, letterSpacing: 0.3 }}>
                SPLIT ({tenders.length} methods)
              </Typography>
            )}
          </Box>
        );
      }
    },
    { 
      field: 'total', width: 130, sortable: false, disableColumnMenu: true,
      renderHeader: () => (<TableSortLabel active={orderBy === 'total'} direction={orderBy === 'total' ? order : 'asc'} onClick={() => handleRequestSort('total')} sx={{ fontWeight: 800, color: COLORS.accent, fontSize: '0.75rem' }}>TOTAL PAID</TableSortLabel>),
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body1" sx={{ fontWeight: 800, color: p.row.status === 'refunded' ? 'textSecondary' : COLORS.success, textDecoration: p.row.status === 'refunded' ? 'line-through' : 'none' }}>
                ₱{parseFloat(p.value || 0).toFixed(2)}
            </Typography>
        </Box>
      )
    },
    { 
      field: 'status', headerName: 'Status', width: 120, align: 'center', headerAlign: 'center', sortable: false, disableColumnMenu: true,
      renderCell: (p) => {
          const isRefunded = p.value === 'refunded';
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 0.3 }}>
                <Chip label={isRefunded ? "REFUNDED" : "PAID"} color={isRefunded ? "error" : "success"} size="small" variant={isRefunded ? "outlined" : "filled"} sx={{ borderRadius: 0, fontWeight: 900, border: isRefunded ? '2px solid' : 'none' }} />
                {p.row._crossDayRefund && (
                    <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 800, color: COLORS.accentLight, lineHeight: 1 }}>
                        sold {p.row.jsDate?.toLocaleDateString()}
                    </Typography>
                )}
                {/* T4.151: Post-close transaction badge */}
                {p.row.postClose && (
                    <Chip
                        label="AFTER CLOSE"
                        size="small"
                        sx={{
                            borderRadius: 0, fontWeight: 900, fontSize: '0.55rem',
                            bgcolor: COLORS.warningSurface, color: COLORS.warning,
                            border: `1px solid ${COLORS.amber}`, height: 18,
                        }}
                    />
                )}
            </Box>
          );
      }
    },
    {
      field: 'actions', headerName: 'Actions', width: 100, align: 'center', headerAlign: 'center', sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Tooltip title="Reprint Receipt">
                <IconButton color="primary" size="small" onClick={() => handleReprint(p.row)} sx={{ border: `1px solid ${COLORS.medical}4D`, borderRadius: 0 }}>
                    <PrintIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            {p.row.status !== 'refunded' && p.row.status !== 'voided' && (
                <Tooltip title="Process Refund">
                    <IconButton color="error" size="small" onClick={() => handleOpenRefund(p.row)} sx={{ border: `1px solid ${COLORS.danger}4D`, borderRadius: 0 }}>
                        <SettingsBackupRestoreIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            )}
            {p.row.status !== 'refunded' && p.row.status !== 'voided' && (
                <Tooltip title="Void Transaction">
                    <IconButton size="small" onClick={() => { setVoidTarget(p.row); setOpenVoid(true); }}
                        sx={{ border: `1px solid #EF6C0050`, borderRadius: 0, color: COLORS.warning }}>
                        <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, px: 0.2 }}>VOID</Typography>
                    </IconButton>
                </Tooltip>
            )}
        </Box>
      )
    }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', bgcolor: COLORS.cream }}>

      {/* 1. FULL-BLEED COMMAND STRIP header */}
      <Box sx={{ flexShrink: 0, mb: 0 }}>
        <Paper elevation={0} sx={{
          p: 2.5, px: 4, display: 'flex', flexDirection: 'column', gap: 1.5,
          bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`, borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0
        }}>
          {/* Row 1: Title + print icon */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.brand, textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0, mr: 1, fontSize: '1.5rem', lineHeight: 1 }}>
              Transactions
            </Typography>
            <Button
              variant="contained"
              startIcon={<ShoppingCartIcon />}
              onClick={() => setOpenRetailPOS(true)}
              sx={{
                bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, px: 3,
                border: `2px solid ${COLORS.sky}`,
                boxShadow: `3px 3px 0px ${COLORS.sky}33`,
                textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem',
                '&:hover': { bgcolor: COLORS.skyHover || '#2196F3', boxShadow: `1px 1px 0px ${COLORS.sky}33` },
              }}
            >
              NEW SALE
            </Button>
            <Box sx={{ flexGrow: 1 }} />

            {/* T4.151: EOD close-out controls (admin only) */}
            {isAdmin && !isDayClosed && (
              <Button
                variant="contained"
                size="small"
                onClick={() => setOpenCloseDay(true)}
                disabled={loading || sales.length === 0}
                sx={{
                  bgcolor: COLORS.danger, fontWeight: 900, borderRadius: 0, px: 2,
                  border: `2px solid ${COLORS.dangerHover}`,
                  boxShadow: `3px 3px 0px ${COLORS.danger}33`,
                  '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: `1px 1px 0px ${COLORS.danger}33` },
                  textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem',
                }}
              >
                CLOSE DAY
              </Button>
            )}
            {isDayClosed && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => setOpenZReport(true)}
                sx={{
                  fontWeight: 900, borderRadius: 0, px: 2,
                  borderColor: COLORS.success, color: COLORS.success, borderWidth: 2,
                  textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem',
                }}
              >
                VIEW Z-REPORT
              </Button>
            )}
            {isDayClosed && isAdmin && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => setOpenReopenDay(true)}
                sx={{
                  fontWeight: 900, borderRadius: 0, px: 2,
                  borderColor: COLORS.warning, color: COLORS.warning, borderWidth: 2,
                  textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem',
                }}
              >
                REOPEN DAY
              </Button>
            )}

            <Tooltip title="Print Detailed Report">
              <IconButton onClick={handlePrintReport} disabled={loading} sx={{ bgcolor: COLORS.cardBg, border: `1px solid ${COLORS.accent}33`, color: COLORS.accent }}>
                <PrintIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Row 2: Search + filters */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            {/* Search */}
            <TextField
              variant="outlined" size="small" placeholder="Search transactions..."
              value={searchText} onChange={(e) => setSearchText(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: COLORS.textMuted }} /></InputAdornment>,
              }}
              sx={{
                flex: 1, maxWidth: 350, minWidth: 180,
                '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: COLORS.formBg, '& fieldset': { borderColor: COLORS.border }, '&:hover fieldset': { borderColor: COLORS.accent }, '&.Mui-focused fieldset': { borderColor: COLORS.accent } },
              }}
            />

            <TextField
              type="date" size="small"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><CalendarMonthIcon fontSize="small" sx={{ color: COLORS.accent }} /></InputAdornment>,
                sx: { borderRadius: 0, fontWeight: 800, fontFamily: 'Inter', fontSize: '0.85rem' }
              }}
              sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33`, borderRadius: 0 }, minWidth: 170 }}
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
                    sx={{ fontWeight: 800, color: COLORS.accent, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33`, borderRadius: 0 }, borderRadius: 0 }}
                >
                    <MenuItem value="All">All Methods (Reset)</MenuItem>
                    <MenuItem value="Cash">Cash</MenuItem>
                    <MenuItem value="GCash">GCash / Maya</MenuItem>
                    <MenuItem value="Card">Card</MenuItem>
                    <MenuItem value="Bank Transfer">Bank Transfer</MenuItem>
                </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 130 }}>
                <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} displayEmpty sx={{ fontWeight: 800, color: COLORS.accent, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33` } }}>
                    <MenuItem value="All">All Statuses</MenuItem>
                    <MenuItem value="Paid">Paid</MenuItem>
                    <MenuItem value="refunded">Refunded</MenuItem>
                </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                displayEmpty
                sx={{ fontWeight: 800, color: COLORS.accent, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33`, borderRadius: 0 }, borderRadius: 0 }}
              >
                <MenuItem value="All">All Types</MenuItem>
                <MenuItem value="retail">Retail Only</MenuItem>
                <MenuItem value="clinical">Clinical Only</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Paper>
      </Box>

      {/* 2. FULL-BLEED ANALYTIC MOUNTING (KPIs) */}
      <Box sx={{ flexShrink: 0, mb: 0 }}>
        <Box sx={{
          p: 2, px: 4, bgcolor: COLORS.cardBg, borderBottom: `2px solid ${COLORS.accent}`,
          borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0
        }}>
          <EodSummary totals={eodTotals} filterMethod={filterMethod} setFilterMethod={setFilterMethod} isDayClosed={isDayClosed} closingData={closingData} />
        </Box>
      </Box>

      {salesError && (
        <Alert severity="error" onClose={() => {}} sx={{ mx: 2, mb: 1, borderRadius: 0 }}>
          {salesError}
        </Alert>
      )}

      {/* 3. FULL-BLEED TRANSACTION LEDGER (FLEX: 1) */}
      <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden', bgcolor: COLORS.cardBg }}>
        <DataGrid 
            loading={loading} rows={processedSales} 
            columns={columns.map(c => ({
              ...c,
              headerClassName: 'forensic-header',
              headerName: (c.headerName || '').toUpperCase()
            }))} 
            disableRowSelectionOnClick rowHeight={80}
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{
                border: 'none',
                bgcolor: COLORS.cardBg,
                '& .forensic-header': {
                  bgcolor: `${COLORS.cream} !important`,
                  color: COLORS.accent,
                  fontWeight: '800 !important',
                  fontSize: '0.75rem',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  borderBottom: `2px solid ${COLORS.accent} !important`,
                },
                '& .MuiDataGrid-columnSeparator': { display: 'none' },
                '& .MuiDataGrid-cell': {
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: `1px solid ${COLORS.accent}14`,
                  fontFamily: 'Inter, sans-serif'
                },
                '& .MuiDataGrid-row:hover': { bgcolor: `${COLORS.accent}0A` },
                '& .MuiDataGrid-virtualScroller': {
                  '&::-webkit-scrollbar': { width: '8px', height: '8px' },
                  '&::-webkit-scrollbar-track': { background: COLORS.cream },
                  '&::-webkit-scrollbar-thumb': { background: COLORS.accent, borderRadius: 0 },
                  '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand }
                }
            }}
        />
      </Box>

      {/* REFUND MODAL */}
      <Dialog open={openRefund} onClose={() => setOpenRefund(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.danger}`, boxShadow: `8px 8px 0px ${COLORS.danger}1A` } }}>
        <DialogTitle sx={{ bgcolor: COLORS.dangerSurface, color: COLORS.danger, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1.5, py: 2, borderBottom: `2px solid ${COLORS.danger}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>
            <SettingsBackupRestoreIcon /> Authorize Transaction Reversal
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.cardBg }}>
          <Alert severity="warning" sx={{ mb: 3, fontWeight: 800, border: `2px solid ${COLORS.warning}`, borderRadius: 0, bgcolor: COLORS.warningSurface }}>
            You are about to permanently refund ₱{selectedSale?.total?.toFixed(2)} to {selectedSale?.ownerName}.
          </Alert>
          <Paper variant="outlined" sx={{ p: 2.5, bgcolor: COLORS.formBg, mb: 3, borderRadius: 0, border: `2px dashed ${COLORS.border}` }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.accent, display: 'block', mb: 1.5, borderBottom: `1px solid ${COLORS.border}`, pb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>Items to Reverse:</Typography>
            {selectedSale?.items?.map((item, i) => <Typography key={i} variant="body2" sx={{ mt: 0.5, color: COLORS.textPrimary, fontWeight: 700 }}>• {item.qty}x {item.name} (₱{(item.price * item.qty).toFixed(2)})</Typography>)}
          </Paper>
          <FormControlLabel control={<Switch checked={restock} onChange={(e) => setRestock(e.target.checked)} color="success" />} label={<Box><Typography variant="body2" sx={{ fontWeight: 800, color: COLORS.success }}>Restock physical products?</Typography><Typography variant="caption" color="textSecondary">Uncheck this if the items were opened/damaged and cannot be resold.</Typography></Box>} />
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `2px solid ${COLORS.danger}`, bgcolor: COLORS.dangerSurface, justifyContent: 'space-between' }}>
          <Button onClick={() => setOpenRefund(false)} sx={{ fontWeight: 800, color: COLORS.textSecondary, px: 3, fontFamily: 'Inter, sans-serif' }}>CANCEL</Button>
          <Button
            onClick={executeRefund} variant="contained" color="error"
            startIcon={<SettingsBackupRestoreIcon />}
            sx={{
                fontWeight: 800, px: 4, py: 1.5, borderRadius: 0,
                bgcolor: COLORS.danger, border: `2px solid ${COLORS.dangerHover}`,
                boxShadow: `4px 4px 0px ${COLORS.danger}33`,
                '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: `2px 2px 0px ${COLORS.danger}33` },
                fontFamily: 'Inter, sans-serif'
            }}
          >
            CONFIRM REFUND
          </Button>
        </DialogActions>
      </Dialog>

      {/* T2.104: VOID TRANSACTION MODAL */}
      <Dialog open={openVoid} onClose={() => setOpenVoid(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.warning}` } }}>
        <DialogTitle sx={{ bgcolor: COLORS.warningSurface, color: COLORS.warning, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1.5, py: 2, borderBottom: `2px solid ${COLORS.warning}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>
          Void Transaction
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.cardBg }}>
          <Alert severity="error" sx={{ mb: 3, fontWeight: 800, border: `2px solid #EF9A9A`, borderRadius: 0 }}>
            Voiding will mark the transaction as invalid, restore inventory stock for all sold products, and revert the appointment to the billing stage.
          </Alert>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.9rem', color: COLORS.textPrimary }}>
            <strong>Receipt:</strong> {voidTarget?.receiptNumber || `#${(voidTarget?.id || '').slice(0, 8).toUpperCase()}`}<br />
            <strong>Amount:</strong> ₱{voidTarget?.total?.toFixed(2)}<br />
            <strong>Client:</strong> {voidTarget?.ownerName || 'Walk-In'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `2px solid ${COLORS.warning}`, bgcolor: COLORS.warningSurface, justifyContent: 'space-between' }}>
          <Button onClick={() => setOpenVoid(false)} sx={{ fontWeight: 800, color: COLORS.textSecondary, px: 3, fontFamily: FONT }}>CANCEL</Button>
          <Button
            onClick={executeVoid}
            variant="contained"
            sx={{ fontWeight: 800, px: 4, py: 1.5, borderRadius: 0, bgcolor: COLORS.warning, border: `2px solid ${COLORS.ctaHover}`, '&:hover': { bgcolor: COLORS.ctaHover } }}
          >
            VOID TRANSACTION
          </Button>
        </DialogActions>
      </Dialog>

      {/* T4.151: CLOSE DAY CONFIRMATION DIALOG */}
      <Dialog open={openCloseDay} onClose={() => setOpenCloseDay(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.danger}`, boxShadow: `8px 8px 0px ${COLORS.danger}1A` } }}>
        <DialogTitle sx={{ bgcolor: COLORS.dangerSurface, color: COLORS.danger, fontWeight: 800, py: 2, borderBottom: `2px solid ${COLORS.danger}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>
          Close Day — Freeze Totals
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.cardBg }}>
          <Alert severity="warning" sx={{ mb: 3, fontWeight: 800, border: `2px solid ${COLORS.warning}`, borderRadius: 0, bgcolor: COLORS.warningSurface }}>
            This will freeze today's totals into a Z-report. New transactions will be flagged as post-close.
          </Alert>
          <Paper variant="outlined" sx={{ p: 2.5, bgcolor: COLORS.formBg, borderRadius: 0, border: `2px dashed ${COLORS.border}` }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.accent, display: 'block', mb: 1.5, borderBottom: `1px solid ${COLORS.border}`, pb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Summary Preview
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Transactions: {sales.length}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Total Collected: ₱{eodTotals.totalCollected.toFixed(2)}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Refunds: ₱{eodTotals.refunds.toFixed(2)}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Net: ₱{(eodTotals.totalCollected - eodTotals.refunds).toFixed(2)}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Cash: ₱{eodTotals.cash.toFixed(2)} | GCash: ₱{eodTotals.gcash.toFixed(2)} | Card: ₱{eodTotals.card.toFixed(2)} | Bank: ₱{eodTotals.bank.toFixed(2)}
            </Typography>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `2px solid ${COLORS.danger}`, bgcolor: COLORS.dangerSurface, justifyContent: 'space-between' }}>
          <Button onClick={() => setOpenCloseDay(false)} sx={{ fontWeight: 800, color: COLORS.textSecondary, px: 3, fontFamily: FONT }}>CANCEL</Button>
          <Button
            onClick={handleCloseDay} variant="contained" disabled={closeDayLoading}
            sx={{
              fontWeight: 800, px: 4, py: 1.5, borderRadius: 0,
              bgcolor: COLORS.danger, border: `2px solid ${COLORS.dangerHover}`,
              boxShadow: `4px 4px 0px ${COLORS.danger}33`,
              '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: `2px 2px 0px ${COLORS.danger}33` },
              fontFamily: FONT,
            }}
          >
            {closeDayLoading ? 'CLOSING...' : 'CONFIRM CLOSE DAY'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* T4.151: REOPEN DAY DIALOG */}
      <Dialog
        open={openReopenDay}
        onClose={() => { setOpenReopenDay(false); setReopenReason(''); }}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.warning}` } }}
      >
        <DialogTitle sx={{ bgcolor: COLORS.warningSurface, color: COLORS.warning, fontWeight: 800, py: 2, borderBottom: `2px solid ${COLORS.warning}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>
          Reopen Closed Day
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.cardBg }}>
          <Alert severity="info" sx={{ mb: 3, fontWeight: 800, borderRadius: 0 }}>
            Reopening will deactivate post-close flagging. The original Z-report totals are preserved.
          </Alert>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 2 }}>
            Closed by {closingData?.closedByName || 'N/A'} at{' '}
            {closingData?.closedAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'N/A'}
          </Typography>
          <TextField
            fullWidth
            label="Reason for reopening (required)"
            placeholder="e.g. Missed a walk-in transaction before close"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            multiline
            rows={2}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `2px solid ${COLORS.warning}`, bgcolor: COLORS.warningSurface, justifyContent: 'space-between' }}>
          <Button onClick={() => { setOpenReopenDay(false); setReopenReason(''); }} sx={{ fontWeight: 800, color: COLORS.textSecondary, px: 3, fontFamily: FONT }}>CANCEL</Button>
          <Button
            onClick={handleReopenDay} variant="contained" disabled={closeDayLoading || !reopenReason.trim()}
            sx={{
              fontWeight: 800, px: 4, py: 1.5, borderRadius: 0,
              bgcolor: COLORS.warning, border: `2px solid ${COLORS.ctaHover}`,
              '&:hover': { bgcolor: COLORS.ctaHover },
              fontFamily: FONT,
            }}
          >
            {closeDayLoading ? 'REOPENING...' : 'REOPEN DAY'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* T4.151: Z-REPORT VIEW DIALOG */}
      <Dialog
        open={openZReport}
        onClose={() => setOpenZReport(false)}
        maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}`, boxShadow: `8px 8px 0px ${COLORS.brand}1A` } }}
      >
        <DialogTitle sx={{
          bgcolor: COLORS.cream, color: COLORS.brand, fontWeight: 800, py: 2,
          borderBottom: `2px solid ${COLORS.brand}`, textTransform: 'uppercase', letterSpacing: 1,
          fontSize: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          Z-Report — {filterDate}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained" size="small"
              startIcon={<PrintIcon />}
              onClick={() => printViaIframe(generateZReportHTML())}
              sx={{ bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, '&:hover': { bgcolor: COLORS.skyHover || COLORS.sky } }}
            >
              PRINT
            </Button>
            <Button
              variant="outlined" size="small"
              onClick={() => downloadHtmlAsFile(generateZReportHTML(), `Z-Report-${filterDate}.html`)}
              sx={{ fontWeight: 900, borderRadius: 0, borderColor: COLORS.accent, color: COLORS.accent, borderWidth: 2 }}
            >
              DOWNLOAD
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: COLORS.cardBg }}>
          <Box sx={{ p: 3 }} dangerouslySetInnerHTML={{ __html: generateZReportHTML() }} />
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: `2px solid ${COLORS.border}` }}>
          <Button onClick={() => setOpenZReport(false)} sx={{ fontWeight: 800, color: COLORS.textSecondary, fontFamily: FONT }}>CLOSE</Button>
        </DialogActions>
      </Dialog>

      {/* T4.152: REPRINT DIALOG — 3-button receipt actions */}
      <Dialog
        open={!!reprintSale}
        onClose={() => { setReprintSale(null); setReprintFeedback(''); }}
        maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.medical}` } }}
      >
        <DialogTitle sx={{ bgcolor: COLORS.chipBlueBg, color: COLORS.medical, fontWeight: 800, py: 2, borderBottom: `2px solid ${COLORS.medical}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.9rem' }}>
          Reprint Receipt — {reprintSale?.receiptNumber || reprintSale?.id?.slice(0, 8).toUpperCase()}
        </DialogTitle>
        <DialogContent sx={{ p: 3, bgcolor: COLORS.cardBg, display: 'flex', flexDirection: 'column', gap: 2, pt: 3 }}>
          <Button
            fullWidth variant="contained"
            startIcon={<PrintIcon />}
            onClick={() => printViaIframe(generateReprintHTML(reprintSale))}
            sx={{ bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, py: 1.5, '&:hover': { bgcolor: COLORS.skyHover || COLORS.sky } }}
          >
            PRINT RECEIPT
          </Button>
          <Button
            fullWidth variant="outlined"
            onClick={() => downloadHtmlAsFile(generateReprintHTML(reprintSale), `reprint-${reprintSale?.receiptNumber || 'receipt'}.html`)}
            sx={{ fontWeight: 900, borderRadius: 0, py: 1.5, borderColor: COLORS.accent, color: COLORS.accent, borderWidth: 2 }}
          >
            DOWNLOAD FILE
          </Button>
          <Button
            fullWidth variant="outlined"
            onClick={async () => {
              const html = generateReprintHTML(reprintSale);
              const result = await emailReceiptToOwner({
                html,
                ownerId: reprintSale?.ownerId,
                receiptNumber: reprintSale?.receiptNumber || reprintSale?.id?.slice(0, 8),
                clinicName: clinicSettings.clinicName,
              });
              setReprintFeedback(result.message);
            }}
            sx={{ fontWeight: 900, borderRadius: 0, py: 1.5, borderColor: COLORS.success, color: COLORS.success, borderWidth: 2 }}
          >
            EMAIL RECEIPT
          </Button>
          {reprintFeedback && (
            <Typography variant="body2" sx={{ fontWeight: 700, color: reprintFeedback.includes('emailed') ? COLORS.success : COLORS.warning, textAlign: 'center' }}>
              {reprintFeedback}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: `2px solid ${COLORS.border}` }}>
          <Button onClick={() => { setReprintSale(null); setReprintFeedback(''); }} sx={{ fontWeight: 800, color: COLORS.textSecondary, fontFamily: FONT }}>CLOSE</Button>
        </DialogActions>
      </Dialog>

      {/* TOAST NOTIFICATIONS */}
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast(t => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ borderRadius: 0, fontWeight: '800' }}>
          {toast.message}
        </Alert>
      </Snackbar>

      <POSModal
        open={openRetailPOS}
        onClose={() => setOpenRetailPOS(false)}
        patient={null}
        inventoryList={joinedInventory}
        servicesList={servicesList}
        isDayClosed={isDayClosed}
        closingData={closingData}
      />
    </Box>
  );
}