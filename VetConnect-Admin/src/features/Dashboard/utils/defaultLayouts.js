/**
 * Default KPI card grid layouts for all four Dashboard tabs.
 *
 * Layout format: react-grid-layout item arrays for a 12-column grid.
 * Each item: { i: 'key', x, y, w, h }
 *   - i  : Must match the key used on the wrapping <div> in DraggableKPIGrid
 *   - x,y: Grid column/row position (0-indexed)
 *   - w  : Width in columns (out of 12)
 *   - h  : Height in rows (rowHeight is set to 110px in DraggableKPIGrid)
 *
 * Keys map to the KPICard identity within each tab. Tabs with compact
 * cards (sm=4 originally) use w=4 so three fit side-by-side on a row.
 */

export const DEFAULT_LAYOUTS = {
  // ── Operations tab ────────────────────────────────────────────
  // Row 1: 4 primary KPIs (totalAppointments, completed, activeInFacility, queueServing)
  // Row 2: 3 timing KPIs (avgWaitTime, longestWait, avgConsultDuration)
  // Row 3: 3 compact KPIs (noShows, cancellations, emergencies)
  ops: [
    { i: 'totalAppointments',  x: 0, y: 0, w: 3, h: 1 },
    { i: 'completed',          x: 3, y: 0, w: 3, h: 1 },
    { i: 'activeInFacility',   x: 6, y: 0, w: 3, h: 1 },
    { i: 'queueServing',       x: 9, y: 0, w: 3, h: 1 },
    { i: 'avgWaitTime',        x: 0, y: 1, w: 4, h: 1 },
    { i: 'longestWait',        x: 4, y: 1, w: 4, h: 1 },
    { i: 'avgConsultDuration', x: 8, y: 1, w: 4, h: 1 },
    { i: 'noShows',            x: 0, y: 2, w: 4, h: 1 },
    { i: 'cancellations',      x: 4, y: 2, w: 4, h: 1 },
    { i: 'emergencies',        x: 8, y: 2, w: 4, h: 1 },
  ],

  // ── Growth tab ────────────────────────────────────────────────
  // Row 1: 4 population KPIs (newClients, totalActiveClients, totalActivePets, totalAppointments)
  // Row 2: 3 compact KPIs (bookingLeadTime, clientRetention, clinicUtilization)
  growth: [
    { i: 'newClients',          x: 0, y: 0, w: 3, h: 1 },
    { i: 'totalActiveClients',  x: 3, y: 0, w: 3, h: 1 },
    { i: 'totalActivePets',     x: 6, y: 0, w: 3, h: 1 },
    { i: 'totalAppointments',   x: 9, y: 0, w: 3, h: 1 },
    { i: 'bookingLeadTime',     x: 0, y: 1, w: 4, h: 1 },
    { i: 'clientRetention',     x: 4, y: 1, w: 4, h: 1 },
    { i: 'clinicUtilization',   x: 8, y: 1, w: 4, h: 1 },
  ],

  // ── Clinical tab ─────────────────────────────────────────────
  // Row 1: 4 KPIs (recordsSigned, vaccinations, followUpCompliance, confinementRate)
  clinical: [
    { i: 'recordsSigned',      x: 0, y: 0, w: 3, h: 1 },
    { i: 'vaccinations',       x: 3, y: 0, w: 3, h: 1 },
    { i: 'followUpCompliance', x: 6, y: 0, w: 3, h: 1 },
    { i: 'confinementRate',    x: 9, y: 0, w: 3, h: 1 },
  ],

  // ── Financial tab ─────────────────────────────────────────────
  // Row 1: 4 primary KPIs (revenueCollected, totalBilled, totalExpenses, netMargin)
  // Row 2: 3 compact KPIs (scPwdDiscounts, avgTransaction, monthlyBurnRate)
  // Row 3: 2 compact KPIs (refundRate, outstandingBalances)
  financial: [
    { i: 'revenueCollected',     x: 0, y: 0, w: 3, h: 1 },
    { i: 'totalBilled',          x: 3, y: 0, w: 3, h: 1 },
    { i: 'totalExpenses',        x: 6, y: 0, w: 3, h: 1 },
    { i: 'netMargin',            x: 9, y: 0, w: 3, h: 1 },
    { i: 'scPwdDiscounts',       x: 0, y: 1, w: 4, h: 1 },
    { i: 'avgTransaction',       x: 4, y: 1, w: 4, h: 1 },
    { i: 'monthlyBurnRate',      x: 8, y: 1, w: 4, h: 1 },
    { i: 'refundRate',           x: 0, y: 2, w: 6, h: 1 },
    { i: 'outstandingBalances',  x: 6, y: 2, w: 6, h: 1 },
  ],
};
