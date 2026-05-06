/**
 * FinancialTab — Financial metrics for the Dashboard.
 *
 * Renders 12 financial metrics: revenue KPIs, trend charts, payment method
 * distribution, revenue by department, expense breakdown, discount usage,
 * avg transaction, burn rate, refund rate, and outstanding balances.
 * This tab is admin-only — gated in Dashboard.jsx via TAB_CONFIG.adminOnly.
 *
 * Props:
 *   data — full return value of useDashboardData (for financial computed block)
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, Area, ComposedChart,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell, Legend,
  ReferenceLine,
} from 'recharts';

// Icons
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import DiscountIcon from '@mui/icons-material/Discount';
import ReceiptIcon from '@mui/icons-material/Receipt';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import WarningIcon from '@mui/icons-material/Warning';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import PercentIcon from '@mui/icons-material/Percent';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SavingsIcon from '@mui/icons-material/Savings';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';

import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from './KPICard';
import HorizontalBar from './HorizontalBar';
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TICK_STYLE, CHART_GRID_PROPS, PANEL_SX } from './chartConfig';
import { buildDrillDown } from '../utils/drillDownConfig';
import { annotateChartData } from '../utils/annotateChartData';

// Payment method colors — each channel has a distinct, meaningful color
const METHOD_COLORS = {
  Cash: COLORS.success,
  GCash: COLORS.medical,
  'GCash / Maya': COLORS.medical,
  Card: '#FF9800',
  'Bank Transfer': COLORS.grooming,
};

// Expense category colors — dark variants for legibility on white
const EXPENSE_COLORS = {
  Utilities: '#1565C0',
  Payroll: '#2E7D32',
  Supplies: '#7B1FA2',
  Maintenance: '#E65100',
  Refunds: '#C62828',
  Other: '#795548',
};

/** Peso currency formatter — no decimals, locale-aware separators. */
const fmt = (n) => `₱${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ── Component ────────────────────────────────────────────────────

export default function FinancialTab({
  data,
  insights = {},
  clinicSettings = {},
  yearAgoDeltas = null,
}) {
  const navigate = useNavigate();
  const drillDown = buildDrillDown(navigate);
  const { financial } = data;

  const goals = clinicSettings?.dashboardGoals || {};
  const hist = data.historical || {};

  const revenueAnnotation = React.useMemo(
    () => annotateChartData(financial?.revenueTrend, 'amount'),
    [financial?.revenueTrend],
  );

  const overlayData = React.useMemo(() => {
    if (!financial) return [];
    const merged = {};
    const order = {};
    let idx = 0;
    financial.revenueTrend.forEach(d => {
      merged[d.label] = { label: d.label, revenue: d.amount, expense: 0 };
      if (order[d.label] === undefined) order[d.label] = idx++;
    });
    financial.expenseTrend.forEach(d => {
      if (merged[d.label]) {
        merged[d.label].expense = d.amount;
      } else {
        merged[d.label] = { label: d.label, revenue: 0, expense: d.amount };
      }
      if (order[d.label] === undefined) order[d.label] = idx++;
    });
    return Object.values(merged).sort((a, b) => (order[a.label] || 0) - (order[b.label] || 0));
  }, [financial?.revenueTrend, financial?.expenseTrend, financial]);

  if (!financial) return null;

  const isProfit = financial.netMargin >= 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ROW 1: PRIMARY KPI CARDS */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="REVENUE COLLECTED"
            value={fmt(financial.totalCollected)}
            icon={<AttachMoneyIcon />}
            variant="green"
            subtitle={`${financial.transactionCount} transactions`}
            delta={data.deltas?.revenue}
            onClick={drillDown['REVENUE COLLECTED']}
            insight={insights['REVENUE COLLECTED']}
            goalTarget={goals.monthlyRevenue || 0}
            goalValue={financial.totalCollected}
            historicalContext={hist.revenuePerMonth}
            yearAgoDelta={yearAgoDeltas?.revenue}
            sparkline={financial.revenueTrend?.map(d => ({ value: d.amount }))}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL BILLED"
            value={fmt(financial.totalBilled)}
            icon={<ReceiptIcon />}
            variant="blue"
            subtitle="before deposits"
            onClick={drillDown['TOTAL BILLED']}
            insight={insights['TOTAL BILLED']}
            yearAgoDelta={yearAgoDeltas?.revenue}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL EXPENSES"
            value={fmt(financial.totalExpenses)}
            icon={<TrendingDownIcon />}
            variant="red"
            onClick={drillDown['TOTAL EXPENSES']}
            insight={insights['TOTAL EXPENSES']}
            yearAgoDelta={yearAgoDeltas?.expenses}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="NET MARGIN"
            value={fmt(Math.abs(financial.netMargin))}
            icon={isProfit ? <TrendingUpIcon /> : <TrendingDownIcon />}
            variant={isProfit ? 'green' : 'red'}
            subtitle={isProfit ? 'profit' : 'loss'}
            delta={data.deltas?.netMargin}
            onClick={drillDown['NET MARGIN']}
            insight={insights['NET MARGIN']}
            yearAgoDelta={yearAgoDeltas?.netMargin}
          />
        </Grid>
      </Grid>

      {/* ROW 6: SECONDARY KPI CARDS */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KPICard
            title="TOTAL DISCOUNTS"
            value={fmt(financial.totalDiscounts)}
            icon={<DiscountIcon />}
            variant="purple"
            subtitle={`${financial.scPwdCount} SC/PWD transactions (${financial.scPwdUsageRate}% usage)`}
            compact
            onClick={drillDown['SC/PWD DISCOUNTS']}
            insight={insights['SC/PWD DISCOUNTS']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KPICard
            title="AVG TRANSACTION"
            value={fmt(financial.avgTransactionValue)}
            icon={<CreditCardIcon />}
            variant="blue"
            subtitle={`${financial.transactionCount} total transactions`}
            compact
            onClick={drillDown['AVG TRANSACTION']}
            insight={insights['AVG TRANSACTION']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KPICard
            title="MONTHLY BURN RATE"
            value={fmt(financial.monthlyBurnRate)}
            icon={<LocalFireDepartmentIcon />}
            variant={financial.monthlyBurnRate > financial.totalCollected ? 'red' : 'orange'}
            subtitle={`₱${financial.dailyExpenseRate.toLocaleString()}/day avg`}
            compact
            onClick={drillDown['MONTHLY BURN RATE']}
            insight={insights['MONTHLY BURN RATE']}
          />
        </Grid>
      </Grid>

      {/* ROW 7: THIRD TIER KPI CARDS */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
          <KPICard
            title="REFUND RATE"
            value={`${financial.refundRate}%`}
            icon={<MoneyOffIcon />}
            variant={financial.refundRate > 5 ? 'red' : financial.refundRate > 0 ? 'orange' : 'green'}
            subtitle={`${financial.refundCount} refunds (${fmt(financial.totalRefunded)})`}
            onClick={drillDown['REFUND RATE']}
            insight={insights['REFUND RATE']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
          <KPICard
            title="OUTSTANDING BALANCES"
            value={fmt(financial.outstandingBalances)}
            icon={<WarningIcon />}
            variant={financial.outstandingBalances > 0 ? 'orange' : 'green'}
            subtitle={financial.outstandingBalances > 0 ? 'in billing/dispensing' : 'all clear'}
            onClick={drillDown['OUTSTANDING BALANCES']}
            insight={insights['OUTSTANDING BALANCES']}
          />
        </Grid>
      </Grid>

      {/* ROW 8: T4.182 NEW KPIs — COLLECTION RATE + DISCOUNT SPLIT */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KPICard
            title="COLLECTION RATE"
            value={`${financial.collectionRate ?? 0}%`}
            icon={<PercentIcon />}
            variant={
              (financial.collectionRate ?? 0) >= 90 ? 'green'
              : (financial.collectionRate ?? 0) >= 70 ? 'orange'
              : 'red'
            }
            subtitle="collected vs billed"
            onClick={drillDown['COLLECTION RATE']}
            insight={insights['COLLECTION RATE']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KPICard
            title="SC/PWD DISCOUNTS"
            value={fmt(financial.scPwdDiscountTotal ?? 0)}
            icon={<DiscountIcon />}
            variant="purple"
            subtitle={`${financial.scPwdCount} SC/PWD transactions`}
            compact
            onClick={drillDown['SC/PWD DISCOUNTS']}
            insight={insights['SC/PWD DISCOUNTS']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KPICard
            title="CUSTOM DISCOUNTS"
            value={fmt(financial.customDiscountTotal ?? 0)}
            icon={<DiscountIcon />}
            variant="orange"
            subtitle="non-SC/PWD discounts"
            compact
            onClick={drillDown['CUSTOM DISCOUNTS']}
            insight={insights['CUSTOM DISCOUNTS']}
          />
        </Grid>
      </Grid>

      {/* ROW 9: T4.182 — REVENUE FORECAST + DEPOSIT + RETAIL/CLINICAL SPLIT */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="REVENUE FORECAST"
            value={fmt(financial.upcomingRevenue ?? 0)}
            icon={<ScheduleIcon />}
            variant="blue"
            subtitle={`${financial.upcomingCount ?? 0} upcoming appointments`}
            onClick={drillDown['REVENUE FORECAST']}
            insight={insights['REVENUE FORECAST']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="DEPOSITS COLLECTED"
            value={fmt(financial.depositTotal ?? 0)}
            icon={<SavingsIcon />}
            variant="neutral"
            subtitle="total deposits on paid sales"
            compact
            onClick={drillDown['DEPOSIT BREAKDOWN']}
            insight={insights['DEPOSIT BREAKDOWN']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="RETAIL REVENUE"
            value={fmt(financial.retailRevenue ?? 0)}
            icon={<ShoppingCartIcon />}
            variant="neutral"
            subtitle={`${financial.retailTransactionCount} retail transactions`}
            compact
            onClick={drillDown['RETAIL REVENUE']}
            insight={insights['RETAIL REVENUE']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="CLINICAL REVENUE"
            value={fmt(financial.clinicalRevenue ?? 0)}
            icon={<MedicalServicesIcon />}
            variant="blue"
            subtitle="from clinical services"
            compact
            onClick={drillDown['CLINICAL REVENUE']}
            insight={insights['CLINICAL REVENUE']}
          />
        </Grid>
      </Grid>

      {/* ROW 10: T4.182 — REVENUE PER SERVICE */}
      {(financial.revenueByService || []).length > 0 && (
        <Box sx={PANEL_SX}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
            REVENUE BY SERVICE TYPE
          </Typography>
          <Box sx={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={financial.revenueByService}
                layout="vertical"
                margin={{ top: 5, right: 80, left: 120, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  vertical
                  stroke={COLORS.borderLight}
                />
                <XAxis
                  type="number"
                  tick={CHART_TICK_STYLE}
                  tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                />
                <YAxis type="category" dataKey="name" tick={CHART_TICK_STYLE} width={115} />
                <RechartsTooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value) => [fmt(value), 'Revenue']}
                />
                <Bar dataKey="amount" radius={0}>
                  {(financial.revenueByService || []).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      )}

      {/* ROW 2: REVENUE TREND (T4.182 — ComposedChart Area + Line) */}
      <Box sx={PANEL_SX}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          REVENUE TREND
        </Typography>
        {(financial.revenueTrend || []).length > 0 ? (
          <Box sx={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={financial.revenueTrend} margin={{ top: 5, right: 64, left: 10, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
                <YAxis
                  tick={CHART_TICK_STYLE}
                  tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                />
                <RechartsTooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value) => [fmt(value), 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  fill={`${COLORS.info}20`}
                  stroke="none"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke={COLORS.info}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
            No revenue data for this period
          </Typography>
        )}
      </Box>

      {/* ROW 3: REVENUE VS EXPENSE OVERLAY (T2.303) */}
      <Box sx={PANEL_SX}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          REVENUE VS EXPENSES
        </Typography>
        {overlayData.length > 0 ? (
          <Box sx={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={overlayData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
                <YAxis
                  tick={CHART_TICK_STYLE}
                  tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                />
                <RechartsTooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value, name) => [fmt(value), name === 'revenue' ? 'Revenue' : 'Expenses']}
                />
                <Legend
                  wrapperStyle={{ fontFamily: FONT, fontSize: 11 }}
                  formatter={(value) => value === 'revenue' ? 'Revenue' : 'Expenses'}
                />
                <Bar dataKey="revenue" fill={COLORS.success} radius={0} name="revenue" />
                <Line
                  type="monotone"
                  dataKey="expense"
                  stroke={COLORS.danger}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: COLORS.danger }}
                  name="expense"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
            No data for this period
          </Typography>
        )}
      </Box>

      {/* ROW 4: PAYMENT METHODS + REVENUE BY DEPARTMENT (T2.298, T2.306) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              PAYMENT METHOD DISTRIBUTION
            </Typography>
            <HorizontalBar
              segments={Object.entries(financial.paymentMethods)
                .sort(([, a], [, b]) => b - a)
                .map(([method, amount]) => ({
                  label: `${method} (${fmt(amount)})`,
                  value: amount,
                  color: METHOD_COLORS[method] || COLORS.accentLight,
                }))
              }
              height={32}
              showLabels
              showLegend
            />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              REVENUE BY DEPARTMENT
            </Typography>
            <HorizontalBar
              segments={Object.entries(financial.revByDept)
                .sort(([, a], [, b]) => b - a)
                .map(([dept, amount], i) => ({
                  label: `${dept} (${fmt(amount)})`,
                  value: amount,
                  color: [COLORS.medical, COLORS.grooming, COLORS.success, COLORS.warning, '#795548', '#00695C'][i % 6],
                }))
              }
              height={32}
              showLabels
              showLegend
            />
          </Box>
        </Grid>
      </Grid>

      {/* ROW 5: EXPENSE CATEGORY BREAKDOWN (T2.302) */}
      <Box sx={PANEL_SX}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          EXPENSE CATEGORY BREAKDOWN
        </Typography>
        {Object.keys(financial.expenseCategories).length > 0 ? (
          <Box sx={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={Object.entries(financial.expenseCategories)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, amount]) => ({ category, amount }))
                }
                margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis dataKey="category" tick={CHART_TICK_STYLE} />
                <YAxis
                  tick={CHART_TICK_STYLE}
                  tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                />
                <RechartsTooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value) => [fmt(value), 'Amount']}
                />
                <Bar dataKey="amount" radius={0}>
                  {Object.entries(financial.expenseCategories)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat]) => (
                      <Cell key={cat} fill={EXPENSE_COLORS[cat] || COLORS.accentLight} />
                    ))
                  }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
            No expenses recorded this period
          </Typography>
        )}
      </Box>


    </Box>
  );
}
