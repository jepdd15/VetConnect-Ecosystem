import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where, Timestamp, doc, runTransaction, arrayUnion } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

export function useSalesData(filterDate, currentUser) {
  const [sales, setSales] = useState([]);
  const[loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

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
    }, (error) => {
      console.error('[useSalesData] Sales fetch error:', error);
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
    }, (error) => {
      console.error('[useSalesData] Cross-day refund fetch error:', error);
      refundsReady = true;
      merge();
    });

    return () => { unsub1(); unsub2(); };
  }, [filterDate]);

  const eodTotals = useMemo(() => {
      let cash = 0, gcash = 0, card = 0, bank = 0;
      let totalBilled = 0, totalCollected = 0, totalDeposits = 0, totalDiscounts = 0, refunds = 0;
      sales.forEach(sale => {
          if (sale.status === 'refunded') {
              refunds += sale.total;
          } else {
              const deposit = parseFloat(sale.depositPaid) || 0;
              const discount = parseFloat(sale.discount) || 0;
              const collected = sale.total - deposit;
              totalBilled += sale.total;
              totalDeposits += deposit;
              totalDiscounts += discount;
              totalCollected += collected;
              if (sale.paymentMethod === 'Cash') cash += collected;
              else if (sale.paymentMethod?.includes('GCash')) gcash += collected;
              else if (sale.paymentMethod === 'Card') card += collected;
              else if (sale.paymentMethod === 'Bank Transfer') bank += collected;
          }
      });
      return { cash, gcash, card, bank, totalBilled, totalCollected, totalDeposits, totalDiscounts, refunds };
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
          transaction.update(apptRef, {
            status: 'billing',
            balanceRemaining: parseFloat(selectedSale.total) || 0,
            clinicalPulse: arrayUnion({
              eventId: `pulse_refund_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'TRANSACTION_REFUNDED',
              fromStatus: 'completed',
              toStatus: 'billing',
              timestamp: Timestamp.now(),
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
                // Fallback for legacy sales without batchSource
                const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
                batches.push({ batchNumber: `RET-${selectedSale.id.slice(0,4)}`, expiryDate: nextYear.toISOString().split('T')[0], qty: item.qty, dateAdded: new Date().toISOString() });
              }

              transaction.update(itemRef, { stock: newStock, batches: batches });

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

  return { sales, loading, eodTotals, processRefundTransaction };
}