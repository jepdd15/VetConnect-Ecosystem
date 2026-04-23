/**
 * chartConfig — Shared recharts styling constants for all Dashboard tabs.
 *
 * Neubrutalism-compliant: zero border-radius on tooltips, square bars
 * (radius={0}), horizontal-only grid lines, Espresso-border tooltips
 * with solid offset shadow.
 */

import { FONT, COLORS } from '../../../theme/designTokens';

// 10-color palette for data-viz series (breed ranking, service popularity, etc.)
export const CHART_COLORS = [
  '#1565C0', '#2E7D32', '#7B1FA2', '#E65100',
  '#C62828', '#00695C', '#4527A0', '#AD1457',
  '#EF6C00', '#1B5E20',
];

// Tooltip container style — zero border-radius, solid offset shadow
export const CHART_TOOLTIP_STYLE = {
  fontFamily: FONT,
  fontSize: 11,
  borderRadius: 0,
  border: `2px solid ${COLORS.accent}`,
  boxShadow: `3px 3px 0px ${COLORS.accent}`,
};

// Axis tick label style — small, subdued, uses FONT
export const CHART_TICK_STYLE = {
  fontSize: 10,
  fontFamily: FONT,
  fill: COLORS.textSecondary,
};

// CartesianGrid props — horizontal dashed lines only
export const CHART_GRID_PROPS = {
  strokeDasharray: '3 3',
  vertical: false,
  stroke: COLORS.borderLight,
};

// Neubrutalism panel style — reusable for chart container panels
export const PANEL_SX = {
  bgcolor: COLORS.cardBg,
  border: `2px solid ${COLORS.accent}`,
  borderRadius: 0,
  boxShadow: `4px 4px 0px ${COLORS.brand}`,
  p: 2.5,
  height: '100%',
};
