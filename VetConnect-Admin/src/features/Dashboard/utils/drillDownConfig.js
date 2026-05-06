export function buildDrillDown(navigate) {
  const go = (path, filter = {}) => () =>
    navigate(path, { state: { dashboardFilter: filter } });

  return {
    // ── Today Tab ──────────────────────────────────────────────
    'TOTAL APPOINTMENTS':    go('/queue'),
    'COMPLETED':             go('/queue', { status: 'completed' }),
    'ACTIVE IN FACILITY':    go('/queue', { status: 'active' }),
    'QUEUE SERVING':         go('/queue'),
    'AVG WAIT TIME':         go('/queue'),
    'NO-SHOWS':              go('/queue', { status: 'no-show' }),
    'CANCELLATIONS':         go('/queue', { status: 'cancelled' }),
    'EMERGENCIES':           go('/queue', { status: 'emergency' }),
    'AVG CONSULT DURATION':  go('/records'),
    'LONGEST CURRENT WAIT':  go('/queue'),
    // Today tab — operational intelligence (new)
    'QUEUE CLEARS BY':       go('/queue'),
    'REMAINING TODAY':       go('/queue'),
    'FLOW RATE':             go('/queue'),

    // ── Analytics Tab — Clinical ────────────────────────────────
    'RECORDS SIGNED':        go('/records'),
    'VACCINATIONS':          go('/records', { searchText: 'vaccine' }),
    'FOLLOW-UP COMPLIANCE':  go('/patients'),
    'CONFINEMENT RATE':      go('/queue', { status: 'confined' }),
    // Analytics tab — new clinical metrics
    'AMENDMENT RATE':        go('/records'),
    'NO-SHOW RATE':          go('/records', { status: 'no-show' }),
    'LAB TESTS ORDERED':     go('/records'),
    'VACCINE COMPLIANCE':    go('/records'),
    'OVERDUE VACCINES':      go('/patients'),

    // ── Analytics Tab — Growth ──────────────────────────────────
    'TOTAL APPOINTMENTS (ANALYTICS)': go('/queue'),
    'NEW CLIENTS':           go('/patients'),
    'TOTAL ACTIVE CLIENTS':  go('/patients'),
    'TOTAL ACTIVE PETS':     go('/patients'),
    // Keep old key for backward compatibility with any cached state
    'TOTAL APPOINTMENTS (GROWTH)': go('/queue'),
    'NEW PETS':              go('/patients'),
    'CLIENT RETENTION':      go('/patients'),
    'CLINIC UTILIZATION':    go('/queue'),
    'BOOKING LEAD TIME':     go('/queue'),

    // ── Financial Tab ───────────────────────────────────────────
    'REVENUE COLLECTED':     go('/sales'),
    'TOTAL BILLED':          go('/sales'),
    'TOTAL EXPENSES':        go('/expenses'),
    'NET MARGIN':            go('/sales'),
    'REFUND RATE':           go('/sales', { status: 'refunded' }),
    'OUTSTANDING BALANCES':  go('/sales', { status: 'outstanding' }),
    'SC/PWD DISCOUNTS':      go('/sales'),
    'AVG TRANSACTION':       go('/sales'),
    'MONTHLY BURN RATE':     go('/expenses'),
    // Financial tab — new metrics
    'COLLECTION RATE':       go('/sales'),
    'CUSTOM DISCOUNTS':      go('/sales'),
    'REVENUE FORECAST':      go('/queue'),
    'DEPOSIT BREAKDOWN':     go('/sales'),
    'RETAIL REVENUE':        go('/sales', { saleType: 'retail' }),
    'CLINICAL REVENUE':      go('/sales', { saleType: 'clinical' }),
  };
}
