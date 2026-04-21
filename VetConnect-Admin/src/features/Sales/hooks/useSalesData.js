import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where, Timestamp, doc, runTransaction } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

export function useSalesData(filterDate) {
  const [sales, setSales] = useState([]);
  const[loading, setLoading] = useState(true);

  useEffect(() => {
    // THE FIX: Tells the strict Vite linter to ignore this deliberate state update
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    
    const startOfDay = new Date(filterDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filterDate); endOfDay.setHours(23, 59, 59, 999);

    const q = query(
        collection(db, "sales"), 
        where("date", ">=", Timestamp.fromDate(startOfDay)),
        where("date", "<=", Timestamp.fromDate(endOfDay)),
        orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(), 
        jsDate: doc.data().date?.toDate() 
      })));
      setLoading(false);
    }, (error) => {
      console.error("Sales data fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filterDate]);

  const eodTotals = useMemo(() => {
      let cash = 0, gcash = 0, card = 0, bank = 0, total = 0, refunds = 0;
      sales.forEach(sale => {
          if (sale.status === 'refunded') {
              refunds += sale.total;
          } else {
              total += sale.total;
              if (sale.paymentMethod === 'Cash') cash += sale.total;
              else if (sale.paymentMethod?.includes('GCash')) gcash += sale.total;
              else if (sale.paymentMethod === 'Card') card += sale.total;
              else if (sale.paymentMethod === 'Bank Transfer') bank += sale.total;
          }
      });
      return { cash, gcash, card, bank, total, refunds };
  },[sales]);

  // THE FIX: Moved the complex transaction logic here!
  const processRefundTransaction = async (selectedSale, restock) => {
    if (!selectedSale) throw new Error("No sale selected");

    await runTransaction(db, async (transaction) => {
      const saleRef = doc(db, "sales", selectedSale.id);
      transaction.update(saleRef, { status: 'refunded', refundedAt: Timestamp.now() });

      if (restock && selectedSale.items) {
        for (const item of selectedSale.items) {
          if (item.type === 'product') {
            const itemRef = doc(db, "inventory", item.id);
            const itemDoc = await transaction.get(itemRef);
            
            if (itemDoc.exists()) {
              const data = itemDoc.data();
              const newStock = (data.stock || 0) + item.qty;
              const batches = data.batches ||[];
              
              const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
              batches.push({ batchNumber: `RET-${selectedSale.id.slice(0,4)}`, expiryDate: nextYear.toISOString().split('T')[0], qty: item.qty, dateAdded: new Date().toISOString() });

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
                userName: 'Admin',
                userId: null,
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