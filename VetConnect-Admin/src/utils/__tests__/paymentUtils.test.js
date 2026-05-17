/**
 * paymentUtils.test.js — T4.237 Day 1 foundation tests.
 *
 * 10 Vitest test cases covering getPaymentHistory (3 eras), recomputeBalance
 * (3 scenarios), validatePaymentInput (3 cases), and buildPaymentDocPayload (1 case).
 *
 * Firestore is mocked: getDocs returns controlled QuerySnapshots. Timestamp.now()
 * returns a deterministic stub. The `db` export from firebaseConfig is a plain
 * {} because it's only threaded through to collection() / query() — those are
 * also mocked at the module boundary.
 */

// ─── Mock firebase/firestore BEFORE any imports that touch it ─────────────────

const MOCK_TIMESTAMP = {
  seconds: 1716000000,
  nanoseconds: 0,
  toDate: () => new Date(1716000000 * 1000),
};

// Mutable slot so individual tests can control what getDocs returns.
let mockGetDocsResult = { empty: true, docs: [] };

vi.mock('firebase/firestore', () => ({
  Timestamp: {
    now: () => MOCK_TIMESTAMP,
    fromDate: (d) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0, toDate: () => d }),
  },
  collection: () => ({}),
  getDocs: () => Promise.resolve(mockGetDocsResult),
  query: () => ({}),
  where: () => ({}),
}));

vi.mock('../../firebaseConfig', () => ({ db: {} }));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  getPaymentHistory,
  recomputeBalance,
  buildPaymentDocPayload,
  validatePaymentInput,
} from '../paymentUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal sale fixture for testing. */
const makeSale = (overrides = {}) => ({
  id: 'sale-001',
  total: 1000,
  amountPaid: 0,
  paymentMethod: 'cash',
  date: MOCK_TIMESTAMP,
  ...overrides,
});

/** Build a minimal payment fixture for recomputeBalance tests. */
const makePayment = (amount) => ({ amount });

// ─────────────────────────────────────────────────────────────────────────────
// getPaymentHistory — three-era dual-read fallback (D4)
// ─────────────────────────────────────────────────────────────────────────────

describe('getPaymentHistory — Era 1: embedded payments array', () => {
  it('1. returns the embedded payments array directly when sale.payments is a non-empty array', async () => {
    const embedded = [
      { id: 'p1', saleId: 'sale-001', amount: 500, method: 'cash', collectedBy: 'Dr. Reyes' },
    ];
    const sale = makeSale({ payments: embedded });

    const result = await getPaymentHistory(sale);

    expect(result).toEqual(embedded);
    expect(result).toHaveLength(1);
  });
});

describe('getPaymentHistory — Era 2: root payments collection query', () => {
  it('11. returns docs from payments collection sorted ascending by collectedAt; uses d.id not d.data().id', async () => {
    const ts1 = { seconds: 1716000000, nanoseconds: 0, toDate: () => new Date(1716000000 * 1000) };
    const ts2 = { seconds: 1716086400, nanoseconds: 0, toDate: () => new Date(1716086400 * 1000) };

    // Intentionally return the later timestamp first to confirm sort is applied.
    mockGetDocsResult = {
      empty: false,
      docs: [
        { id: 'pay-002', data: () => ({ saleId: 'sale-001', amount: 300, method: 'gcash', collectedAt: ts2 }) },
        { id: 'pay-001', data: () => ({ saleId: 'sale-001', amount: 500, method: 'cash',  collectedAt: ts1 }) },
      ],
    };

    const sale = makeSale();
    const result = await getPaymentHistory(sale);

    expect(result).toHaveLength(2);
    // Sorted ascending — earlier timestamp (pay-001) comes first
    expect(result[0].id).toBe('pay-001');
    expect(result[1].id).toBe('pay-002');
    // id comes from d.id (doc reference), not d.data().id
    expect(result[0]).not.toHaveProperty('data');
    expect(result[0].amount).toBe(500);
    expect(result[1].amount).toBe(300);
  });
});

describe('getPaymentHistory — Era 3: legacy amountPaid synthesis', () => {
  beforeEach(() => {
    // Simulate no payment docs in Firestore (empty query result)
    mockGetDocsResult = { empty: true, docs: [] };
  });

  it('2. synthesizes 1 legacy payment when no payment docs exist and amountPaid > 0', async () => {
    const sale = makeSale({ amountPaid: 750, paymentMethod: 'gcash' });

    const result = await getPaymentHistory(sale);

    expect(result).toHaveLength(1);
    const legacy = result[0];
    expect(legacy.id).toBe(`legacy_${sale.id}`);
    expect(legacy.amount).toBe(750);
    expect(legacy.method).toBe('gcash');
    expect(legacy.collectedBy).toBe('Unknown (pre-2026-05-17)');
    expect(legacy._isLegacy).toBe(true);
    expect(legacy.reversalOf).toBeNull();
  });

  it('3. returns an empty array when no payment docs exist and amountPaid is 0', async () => {
    const sale = makeSale({ amountPaid: 0 });

    const result = await getPaymentHistory(sale);

    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recomputeBalance — balance computation
// ─────────────────────────────────────────────────────────────────────────────

describe('recomputeBalance — balance computation', () => {
  it('4. total ₱1000 with payments [₱400, ₱300] → balance ₱300', () => {
    const sale = makeSale({ total: 1000 });
    const payments = [makePayment(400), makePayment(300)];

    expect(recomputeBalance(sale, payments)).toBe(300);
  });

  it('5. total ₱1000 with payments [₱400, reversal -₱400] → balance ₱1000', () => {
    const sale = makeSale({ total: 1000 });
    const payments = [makePayment(400), makePayment(-400)];

    expect(recomputeBalance(sale, payments)).toBe(1000);
  });

  it('6. overpayment (payments sum > total) → balance clamped at 0', () => {
    const sale = makeSale({ total: 1000 });
    const payments = [makePayment(600), makePayment(600)];

    expect(recomputeBalance(sale, payments)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validatePaymentInput — D3 reference number enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('validatePaymentInput — D3 validation', () => {
  it('7. amount ≤ 0 → invalid', () => {
    const result = validatePaymentInput({ amount: 0, method: 'cash', referenceNumber: null });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('8. method gcash with no referenceNumber → invalid with GCash in error message', () => {
    const result = validatePaymentInput({ amount: 500, method: 'gcash', referenceNumber: '' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/GCash/i);
  });

  it('9. method cash with no referenceNumber → valid', () => {
    const result = validatePaymentInput({ amount: 500, method: 'cash', referenceNumber: null });
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  // Reversals go through a separate flow (handleReversePayment, Day 2). validatePaymentInput is for forward payments only.
  it('12. negative amount → invalid (reversals handled separately, not via validatePaymentInput)', () => {
    const result = validatePaymentInput({ amount: '-100', method: 'cash', referenceNumber: null });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/positive|negative|greater than zero/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration-style tests (Day 2, Step 2.6)
// ─────────────────────────────────────────────────────────────────────────────

describe('recomputeBalance — integration: 3-payment mix including reversal', () => {
  it('13. ₱400 cash + ₱300 gcash + (−₱100 reversal of gcash) → net paid 600; balance = total − 600', () => {
    // Represents a realistic scenario: customer paid twice, then a partial reversal was applied.
    const sale = makeSale({ total: 1000 });
    const payments = [
      makePayment(400),   // cash payment
      makePayment(300),   // gcash payment
      makePayment(-100),  // reversal of gcash (partial)
    ];
    // Net paid = 400 + 300 − 100 = 600; balance = 1000 − 600 = 400
    expect(recomputeBalance(sale, payments)).toBe(400);
  });
});

describe('getPaymentHistory — integration: legacy amountPaid synthesizes _isLegacy row', () => {
  it('14. legacy sale with amountPaid but no payment docs produces synthetic payment with _isLegacy: true and expected collectedBy', async () => {
    // Simulate no payment docs in Firestore for this sale
    mockGetDocsResult = { empty: true, docs: [] };

    const sale = makeSale({ amountPaid: 1000, paymentMethod: 'cash' });
    const result = await getPaymentHistory(sale);

    expect(result).toHaveLength(1);
    const legacyPayment = result[0];
    // Must carry the _isLegacy sentinel so UI can hide the Reverse button
    expect(legacyPayment._isLegacy).toBe(true);
    // Display string used in PaymentHistoryPanel "Collected By" column
    expect(legacyPayment.collectedBy).toBe('Unknown (pre-2026-05-17)');
    // Amount matches what the sale recorded
    expect(legacyPayment.amount).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPaymentDocPayload — D1 schema completeness
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPaymentDocPayload — D1 schema', () => {
  it('10. produces all 10 required fields; sets collectedAt to Timestamp; defaults reversalOf to null', () => {
    const payload = buildPaymentDocPayload({
      saleId: 'sale-001',
      ownerId: 'owner-001',
      amount: 500,
      method: 'GCash',           // uppercase input — should be normalized to lowercase
      referenceNumber: 'TXN123',
      note: 'Test payment',
      collectedBy: 'Dr. Reyes',
      collectedByUid: 'uid-staff-001',
      // reversalOf intentionally omitted — should default to null
    });

    // All 10 D1 schema fields must be present
    expect(payload).toHaveProperty('saleId', 'sale-001');
    expect(payload).toHaveProperty('ownerId', 'owner-001');
    expect(payload).toHaveProperty('amount', 500);
    expect(payload).toHaveProperty('method', 'gcash');         // lowercased
    expect(payload).toHaveProperty('referenceNumber', 'TXN123');
    expect(payload).toHaveProperty('note', 'Test payment');
    expect(payload).toHaveProperty('collectedBy', 'Dr. Reyes');
    expect(payload).toHaveProperty('collectedByUid', 'uid-staff-001');
    expect(payload).toHaveProperty('collectedAt', MOCK_TIMESTAMP);
    expect(payload).toHaveProperty('reversalOf', null);        // defaulted

    // Exactly 10 top-level fields
    expect(Object.keys(payload)).toHaveLength(10);
  });
});
