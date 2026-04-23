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
import { Box, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, ComposedChart,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell, Legend,
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

import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from './KPICard';
import HorizontalBar from './HorizontalBar';
import { CHART_TOOLTIP_STYLE, CHART_TICK_STYLE, CHART_GRID_PROPS } from './chartConfig';

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

export default function FinancialTab({ data }) {
  const { financial } = data;
  if (!financial) return null;

  const panelSx = {
    bgcolor: COLORS.cardBg,
    border: `2px solid ${COLORS.accent}`,
    borderRadius: 0,
    boxShadow: `4px 4px 0px ${COLORS.brand}`,
    p: 2.5,
    height: '100%',
  };

  const isProfit = financial.netMargin >= 0;

  // Merge revenue and expense trends into one dataset for the overlay chart
  const overlayData = React.useMemo(() => {
    const merged = {};
    financial.revenueTrend.forEach(d => {
      merged[d.label] = { label: d.label, revenue: d.amount, expense: 0 };
    });
    financial.expenseTrend.forEach(d => {
      if (merged[d.label]) {
        merged[d.label].expense = d.amount;
      } else {
        merged[d.label] = { label: d.label, revenue: 0, expense: d.amount };
      }
    });
    return Object.values(merged);
  }, [financial.revenueTrend, financial.expenseTrend]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ROW 1: REVENUE + MARGIN KPIs (T2.230, T2.283) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="REVENUE COLLECTED"
            value={fmt(financial.totalCollected)}
            icon={<AttachMoneyIcon />}
            variant="green"
            subtitle={`${financial.transactionCount} transactions`}
            delta={data.deltas?.revenue}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL BILLED"
            value={fmt(financial.totalBilled)}
            icon={<ReceiptIcon />}
            variant="blue"
            subtitle="before deposits"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL EXPENSES"
            value={fmt(financial.totalExpenses)}
            icon={<TrendingDownIcon />}
            variant="red"
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
          />
        </Grid>
      </Grid>

      {/* ROW 2: REVENUE TREND (T2.301) */}
      <Box sx={panelSx}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          REVENUE TREND
        </Typography>
        {financial.revenueTrend.length > 0 ? (
          <Box sx={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financial.revenueTrend} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
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
                <Bar dataKey="amount" fill={COLORS.success} radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
            No revenue data for this period
          </Typography>
        )}
      </Box>

      {/* ROW 3: REVENUE VS EXPENSE OVERLAY (T2.303) */}
      <Box sx={panelSx}>
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
          <Box sx={panelSx}>
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
          <Box sx={panelSx}>
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
      <Box sx={panelSx}>
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

      {/* ROW 6: SC/PWD + AVG TRANSACTION + BURN RATE (T2.299, T2.300, T2.270) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KPICard
            title="SC/PWD DISCOUNTS"
            value={fmt(financial.totalDiscounts)}
            icon={<DiscountIcon />}
            variant="purple"
            subtitle={`${financial.scPwdCount} transactions (${financial.scPwdUsageRate}% usage)`}
            compact
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KPICard
            title="AVG TRANSACTION"
            value={fmt(financial.avgTransactionValue)}
            icon={<CreditCardIcon />}
            variant="blue"
            subtitle={`${financial.transactionCount} total transactions`}
            compact
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KPICard
            title="MONTHLY BURN RATE"
            value={fmt(financial.monthlyBurnRate)}
            icon={<LocalFireDepartmentIcon />}
            variant={financial.monthlyBurnRate > financial.totalCollected ? 'red' : 'orange'}
            subtitle={`₱${financial.dailyExpenseRate.toLocaleString()}/day avg`}
            compact
          />
        </Grid>
      </Grid>

      {/* ROW 7: REFUND + OUTSTANDING (T2.304, T2.305) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <KPICard
            title="REFUND RATE"
            value={`${financial.refundRate}%`}
            icon={<MoneyOffIcon />}
            variant={financial.refundRate > 5 ? 'red' : financial.refundRate > 0 ? 'orange' : 'green'}
            subtitle={`${financial.refundCount} refunds (${fmt(financial.totalRefunded)})`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <KPICard
            title="OUTSTANDING BALANCES"
            value={fmt(financial.outstandingBalances)}
            icon={<WarningIcon />}
            variant={financial.outstandingBalances > 0 ? 'orange' : 'green'}
            subtitle={financial.outstandingBalances > 0 ? 'in billing/dispensing' : 'all clear'}
          />
        </Grid>
      </Grid>

    </Box>
  );
}
