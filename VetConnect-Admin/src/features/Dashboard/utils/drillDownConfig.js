export function buildDrillDown(navigate) {
  const go = (path, filter = {}) => () =>
    navigate(path, { state: { dashboardFilter: filter } });

  return {
    // ── Operations Tab ──────────────────────────────────────────
    'TOTAL APPOINTMENTS': go('/queue'),
    'COMPLETED':          go('/queue', { status: 'completed' }),
    'ACTIVE IN FACILITY': go('/queue', { status: 'active' }),
    'QUEUE SERVING':      go('/queue'),
    'AVG WAIT TIME':      go('/queue'),
    'NO-SHOWS':           go('/queue', { status: 'no-show' }),
    'CANCELLATIONS':      go('/queue', { status: 'cancelled' }),
    'EMERGENCIES':        go('/queue', { status: 'emergency' }),
    'AVG CONSULT DURATION': go('/records'),
    'LONGEST CURRENT WAIT': go('/queue'),

    // ── Clinical Tab ────────────────────────────────────────────
    'RECORDS SIGNED':       go('/records'),
    'VACCINATIONS':         go('/records', { searchText: 'vaccine' }),
    'FOLLOW-UP COMPLIANCE': go('/patients'),
    'CONFINEMENT RATE':     go('/queue', { status: 'confined' }),

    // ── Financial Tab ───────────────────────────────────────────
    'REVENUE COLLECTED':    go('/sales'),
    'TOTAL BILLED':         go('/sales'),
    'TOTAL EXPENSES':       go('/expenses'),
    'NET MARGIN':           go('/sales'),
    'REFUND RATE':          go('/sales', { status: 'refunded' }),
    'OUTSTANDING BALANCES': go('/sales', { status: 'outstanding' }),
    'SC/PWD DISCOUNTS':     go('/sales'),
    'AVG TRANSACTION':      go('/sales'),
    'MONTHLY BURN RATE':    go('/expenses'),

    // ── Growth Tab ──────────────────────────────────────────────
    'TOTAL APPOINTMENTS (GROWTH)': go('/queue'),
    'NEW CLIENTS':          go('/patients'),
    'TOTAL ACTIVE CLIENTS': go('/patients'),
    'TOTAL ACTIVE PETS':    go('/patients'),
    'CLIENT RETENTION':     go('/patients'),
    'CLINIC UTILIZATION':   go('/queue'),
    'BOOKING LEAD TIME':    go('/queue'),
  };
}
