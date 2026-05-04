import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where, Timestamp, doc, runTransaction, arrayUnion, setDoc, updateDoc, increment } from 'firebase/firestore';
import { makePulseEventId } from '../../../utils/pulseUtils';
import { db } from '../../../firebaseConfig';

export function useSalesData(filterDate, currentUser) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // T4.151: EOD close status for the current filterDate.
  const [closingData, setClosingData] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const startOfDay = new Date(filterDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filterDate); endOfDay.setHours(23, 59, 59, 999);
    const startTs = Timestamp.fromDate(startOfDay);
    const endTs = Timestamp.fromDate(endOfDay);

    // Query 1: Sales made on this day (existing behavior)
    const qSales = query(
        collection(db, "sales"),
        where("date", ">=", startTs),
        where("date", "<=", endTs),
        orderBy("date", "desc")
    );

    // Query 2: Refunds processed on this day (for sales made on OTHER days)
    // Requires composite Firestore index: { status ASC, refundedAt ASC }
    // Create in Firebase Console or add to firestore.indexes.json:
    // { "collectionGroup": "sales", "queryScope": "COLLECTION",
    //   "fields": [{ "fieldPath": "status", "order": "ASCENDING" },
    //              { "fieldPath": "refundedAt", "order": "ASCENDING" }] }
    const qRefunds = query(
        collection(db, "sales"),
        where("refundedAt", ">=", startTs),
        where("refundedAt", "<=", endTs),
        where("status", "==", "refunded")
    );

    let salesData = [];
    let refundData = [];
    let salesReady = false;
    let refundsReady = false;

    const merge = () => {
      if (!salesReady || !refundsReady) return;
      // Deduplicate: sales made AND refunded on the same day appear in both queries.
      // Primary query (qSales) takes priority — cross-day refunds get the badge flag.
      const seen = new Set(salesData.map(s => s.id));
      const crossDayRefunds = refundData
        .filter(r => !seen.has(r.id))
        .map(r => ({ ...r, _crossDayRefund: true }));
      setSales([...salesData, ...crossDayRefunds]);
      setLoading(false);
    };

    const unsub1 = onSnapshot(qSales, (snapshot) => {
      salesData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        jsDate: d.data().date?.toDate()
      }));
      salesReady = true;
      merge();
    }, (err) => {
      console.error('[useSalesData] Sales fetch error:', err);
      setError(err.message);
      salesReady = true;
      merge();
    });

    const unsub2 = onSnapshot(qRefunds, (snapshot) => {
      refundData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        jsDate: d.data().date?.toDate()
      }));
      refundsReady = true;
      merge();
    }, (err) => {
      console.error('[useSalesData] Cross-day refund fetch error:', err);
      setError(err.message);
      refundsReady = true;
      merge();
    });

    // Query 3: Daily closing status for this date (T4.151).
    const closingRef = doc(db, 'daily_closings', filterDate);
    const unsub3 = onSnapshot(closingRef, (snapshot) => {
      setClosingData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    }, (err) => {
      console.error('[useSalesData] Closing status fetch error:', err);
      // Non-fatal — closingData stays null (treated as "day open")
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [filterDate]);

  const eodTotals = useMemo(() => {
      let cash = 0, gcash = 0, card = 0, bank = 0;
      let totalBilled = 0, totalCollected = 0, totalDeposits = 0, totalDiscounts = 0, refunds = 0;
      // T4.149: Track custom discounts separately from SC/PWD discounts for management oversight.
      let totalCustomDiscounts = 0;
      // T4.151: Track voided transactions for Z-report.
      let voidCount = 0, voidAmount = 0;
      sales.forEach(sale => {
          if (sale.status === 'refunded') {
              refunds += sale.total;
          } else if (sale.status === 'voided') {
              voidCount++;
              voidAmount += parseFloat(sale.total) || 0;
          } else {
              const deposit = parseFloat(sale.depositPaid) || 0;
              const discount = parseFloat(sale.discount) || 0;
              const collected = sale.total - deposit;
              totalBilled += sale.total;
              totalDeposits += deposit;
              if (sale.hasScPwdDiscount) totalDiscounts += discount;
              totalCollected += collected;
              totalCustomDiscounts += parseFloat(sale.customDiscountTotal || 0);
              // T4.150: Distribute collected amount across tenders.
              // New sales have paymentTenders[]; legacy sales have only paymentMethod.
              if (sale.paymentTenders && sale.paymentTenders.length > 0) {
                sale.paymentTenders.forEach(t => {
                  const tenderAmt = parseFloat(t.amount) || 0;
                  if (t.method === 'Cash') cash += tenderAmt;
                  else if (t.method?.includes('GCash')) gcash += tenderAmt;
                  else if (t.method === 'Card') card += tenderAmt;
                  else if (t.method === 'Bank Transfer') bank += tenderAmt;
                });
              } else {
                // Legacy fallback: single paymentMethod
                if (sale.paymentMethod === 'Cash') cash += collected;
                else if (sale.paymentMethod?.includes('GCash')) gcash += collected;
                else if (sale.paymentMethod === 'Card') card += collected;
                else if (sale.paymentMethod === 'Bank Transfer') bank += collected;
              }
          }
      });
      return { cash, gcash, card, bank, totalBilled, totalCollected, totalDeposits, totalDiscounts, totalCustomDiscounts, refunds, voidCount, voidAmount };
  },[sales]);

  // THE FIX: Moved the complex transaction logic here!
  const processRefundTransaction = async (selectedSale, restock) => {
    if (!selectedSale) throw new Error("No sale selected");

    await runTransaction(db, async (transaction) => {
      const saleRef = doc(db, "sales", selectedSale.id);
      transaction.update(saleRef, { status: 'refunded', refundedAt: Timestamp.now() });

      // Reverse appointment status from completed -> billing
      if (selectedSale.appointmentId) {
        const apptRef = doc(db, "appointments", selectedSale.appointmentId);
        const apptDoc = await transaction.get(apptRef);
        if (apptDoc.exists()) {
          const apptData = apptDoc.data();
          transaction.update(apptRef, {
            status: 'billing',
            balanceRemaining: parseFloat(selectedSale.total) || 0,
            // Preserve full status chain with array spread — arrayUnion silently deduplicates,
            // which corrupts the revert chain when status cycles (e.g., billing → completed → billing).
            statusHistory: [...(apptData.statusHistory || []), apptData.status || 'completed'],
            clinicalPulse: arrayUnion({
              eventId: makePulseEventId('refund'),
              type: 'TRANSACTION_REFUNDED',
              fromStatus: 'completed',
              toStatus: 'billing',
              timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
              staffId: currentUser?.id || 'system',
              staffName: currentUser?.fullName || 'System',
              note: `Full refund processed. Receipt #${selectedSale.id.slice(0, 5)}. Restock: ${restock ? 'yes' : 'no'}.`,
            }),
          });
        }
      }

      if (restock && selectedSale.items) {
        for (const item of selectedSale.items) {
          if (item.type === 'product') {
            const itemRef = doc(db, "inventory", item.id);
            const itemDoc = await transaction.get(itemRef);
            
            if (itemDoc.exists()) {
              const data = itemDoc.data();
              const newStock = (data.stock || 0) + item.qty;
              const batches = [...(data.batches || [])];

              // Determine if this product is actually batch-tracked. Flat-stock products
              // (collars, leashes, etc.) have no batches and no batchSource. Creating a
              // phantom RET-xxxx batch for them permanently converts them to batch-managed.
              const isBatchTracked = batches.length > 0 || (item.batchSource && item.batchSource.length > 0);

              if (isBatchTracked) {
                // Restore to original batches if batchSource was captured at sale time (T2.147)
                if (item.batchSource && item.batchSource.length > 0) {
                  for (const src of item.batchSource) {
                    const existing = batches.find(b => b.batchNumber === src.batchNumber);
                    if (existing) {
                      existing.qty += src.qtyFromBatch;
                    } else {
                      batches.push({ batchNumber: src.batchNumber, expiryDate: src.expiryDate, qty: src.qtyFromBatch, dateAdded: new Date().toISOString() });
                    }
                  }
                } else {
                  // Legacy batch-tracked sales without batchSource — create recovery batch
                  const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
                  batches.push({ batchNumber: `RET-${selectedSale.id.slice(0,4)}`, expiryDate: nextYear.toISOString().split('T')[0], qty: item.qty, dateAdded: new Date().toISOString() });
                }
                transaction.update(itemRef, { stock: newStock, batches: batches });
              } else {
                // Flat-stock product — increment count only, no batch creation
                transaction.update(itemRef, { stock: newStock });
              }

              const logRef = doc(collection(db, "inventory_logs"));
              transaction.set(logRef, {
                itemId: item.id,
                itemName: item.name,
                action: 'RESTOCK',
                amountChange: item.qty,
                reason: `Customer Refund (Receipt #${selectedSale.id.slice(0,5)})`,
                oldStock: data.stock,
                newStock: newStock,
                batchInfo: 'Returned Item',
                userName: currentUser?.fullName || 'Unknown Staff',
                userId: currentUser?.id || null,
                timestamp: Timestamp.now()
              });
            }
          }
        }
      }
    });
  };

  // T2.104: Void a completed sale — reverses inventory, reverts appointment to billing,
  // and writes a TRANSACTION_VOIDED pulse event. Distinct from refund: void implies
  // the transaction never should have been finalized (e.g., wrong patient, wrong items).
  const voidTransaction = async (sale) => {
    if (!sale) throw new Error("No sale provided.");
    await runTransaction(db, async (transaction) => {
      // 1. Restock each sold product — batch-aware, matching the refund path (T4.144)
      for (const item of (sale.items || []).filter(i => i.type === 'product')) {
        const itemRef = doc(db, "inventory", item.id);
        const itemDoc = await transaction.get(itemRef);
        if (!itemDoc.exists()) continue;
        const data = itemDoc.data();
        const newStock = (data.stock || 0) + item.qty;
        const batches = [...(data.batches || [])];

        // Determine whether this product is batch-tracked. Flat-stock products
        // (collars, leashes, etc.) have no batches and no batchSource. Treating them
        // as batch-tracked would permanently convert them to batch-managed inventory.
        const isBatchTracked = batches.length > 0 || (item.batchSource && item.batchSource.length > 0);

        if (isBatchTracked) {
          if (item.batchSource && item.batchSource.length > 0) {
            // Restore to the original batches captured at sale time (T2.147)
            for (const src of item.batchSource) {
              const existing = batches.find(b => b.batchNumber === src.batchNumber);
              if (existing) {
                existing.qty += src.qtyFromBatch;
              } else {
                batches.push({ batchNumber: src.batchNumber, expiryDate: src.expiryDate, qty: src.qtyFromBatch, dateAdded: new Date().toISOString() });
              }
            }
          } else {
            // Legacy batch-tracked sales without batchSource — create recovery batch
            const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
            batches.push({ batchNumber: `RET-${sale.id.slice(0, 4)}`, expiryDate: nextYear.toISOString().split('T')[0], qty: item.qty, dateAdded: new Date().toISOString() });
          }
          transaction.update(itemRef, { stock: newStock, batches });
        } else {
          // Flat-stock product — increment count only, no batch creation
          transaction.update(itemRef, { stock: newStock });
        }

        const logRef = doc(collection(db, "inventory_logs"));
        transaction.set(logRef, {
          itemId: item.id,
          itemName: item.name,
          action: 'RESTOCK',
          amountChange: item.qty,
          reason: `Void reversal from sale ${sale.id}`,
          oldStock: data.stock,
          newStock,
          batchInfo: 'Voided Sale',
          userName: currentUser?.fullName || 'Unknown Staff',
          userId: currentUser?.id || null,
          timestamp: Timestamp.now(),
        });
      }
      // 2. Mark sale as voided
      transaction.update(doc(db, "sales", sale.id), {
        status: 'voided',
        voidedAt: Timestamp.now(),
        voidedBy: currentUser?.fullName || 'System',
      });
      // 3. Revert appointment to billing (undo the completed status)
      if (sale.appointmentId) {
        const apptRef = doc(db, "appointments", sale.appointmentId);
        const apptDoc = await transaction.get(apptRef);
        if (apptDoc.exists()) {
          const apptData = apptDoc.data();
          transaction.update(apptRef, {
            status: 'billing',
            timeCompleted: null,
            balanceRemaining: parseFloat(sale.total) || 0,
            // Preserve full status chain with array spread — arrayUnion silently deduplicates,
            // which corrupts the revert chain when status cycles (e.g., billing → completed → billing).
            statusHistory: [...(apptData.statusHistory || []), apptData.status || 'completed'],
            clinicalPulse: arrayUnion({
              eventId: makePulseEventId('void'),
              type: 'TRANSACTION_VOIDED',
              fromStatus: 'completed',
              toStatus: 'billing',
              timestamp: Timestamp.now(),
              staffId: currentUser?.id || 'system',
              staffName: currentUser?.fullName || 'System',
              note: `Transaction voided. Receipt #${sale.id.slice(0, 8).toUpperCase()}. Items returned to stock.`,
            }),
          });
        }
      }
    });
  };

  // T4.151: Derive isDayClosed — true when a closing doc exists AND hasn't been reopened.
  const isDayClosed = closingData !== null && !closingData.reopenedAt;

  /**
   * Freezes the day's financial totals into a daily_closings/{filterDate} doc.
   * Uses setDoc so the call is idempotent if the admin retries after a transient error.
   * @param {object} staffProfile - The current user's profile (must have `id`).
   */
  const closeDay = async (staffProfile) => {
    if (!staffProfile?.id) throw new Error('Staff profile required to close day.');

    const closingRef = doc(db, 'daily_closings', filterDate);
    const voidedSales = sales.filter(s => s.status === 'voided');
    const closingVoidCount = voidedSales.length;
    const closingVoidAmount = voidedSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

    await setDoc(closingRef, {
      closedAt: Timestamp.now(),
      closedBy: staffProfile.id,
      closedByName: staffProfile.fullName || 'Admin',
      transactionCount: sales.filter(s => !s._crossDayRefund).length,
      grossRevenue: eodTotals.totalBilled,
      netRevenue: eodTotals.totalCollected - eodTotals.refunds,
      refunds: eodTotals.refunds,
      voids: closingVoidCount,
      voidAmount: closingVoidAmount,
      cashTotal: eodTotals.cash,
      gcashTotal: eodTotals.gcash,
      cardTotal: eodTotals.card,
      bankTotal: eodTotals.bank,
      scPwdDiscounts: eodTotals.totalDiscounts,
      customDiscounts: eodTotals.totalCustomDiscounts,
      depositTotal: eodTotals.totalDeposits,
      reopenedAt: null,
      reopenedBy: null,
      reopenedByName: null,
      reopenReason: null,
      postCloseCount: 0,
      postCloseTotal: 0,
    });
  };

  /**
   * Stamps reopenedAt and audit reason on the existing closing doc.
   * The original frozen totals remain as a historical record.
   * @param {object} staffProfile - The current user's profile.
   * @param {string} reason - Mandatory audit reason for the reopen.
   */
  const reopenDay = async (staffProfile, reason) => {
    if (!staffProfile?.id) throw new Error('Staff profile required to reopen day.');
    if (!reason || reason.trim().length === 0) throw new Error('Audit reason required.');

    const closingRef = doc(db, 'daily_closings', filterDate);
    await updateDoc(closingRef, {
      reopenedAt: Timestamp.now(),
      reopenedBy: staffProfile.id,
      reopenedByName: staffProfile.fullName || 'Admin',
      reopenReason: reason.trim(),
    });
  };

  return { sales, loading, error, eodTotals, processRefundTransaction, voidTransaction, isDayClosed, closingData, closeDay, reopenDay };
}