/**
 * annotateChartData — Enriches trend data arrays with annotation metadata.
 *
 * Takes a flat array of data points (from buildTrend or buildFinancialTrend)
 * and returns an object with:
 *   - data:     the original array with per-point `annotation` property attached
 *   - avg:      the mean value across all data points
 *   - peak:     the data point with the highest value (when >120% of avg)
 *   - trough:   the data point with the lowest non-zero value (when <80% of avg)
 *   - refLines: array of { y, label, color } for recharts ReferenceLine rendering
 *
 * Annotation thresholds are intentionally conservative to avoid visual noise
 * on flat data. The 20% margin on peak/trough means a bar must deviate by at
 * least 20% from the average before it is annotated.
 *
 * Requires at least 3 data points to produce annotations. With fewer, the
 * original data is returned unchanged with no refLines.
 *
 * @param {Array<{label: string, count?: number, amount?: number}>} rawData
 * @param {string} valueKey - 'count' or 'amount' depending on chart type
 * @returns {{ data: Array, avg: number, peak: Object|null, trough: Object|null, refLines: Array }}
 */
export function annotateChartData(rawData, valueKey = 'count') {
  if (!rawData || rawData.length < 3) {
    return { data: rawData || [], avg: 0, peak: null, trough: null, refLines: [] };
  }

  const values = rawData.map(d => d[valueKey] || 0);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;

  // Find the peak (max) and trough (min non-zero) indices
  let peakIdx = 0;
  let troughIdx = 0;
  let maxVal = -Infinity;
  let minVal = Infinity;

  values.forEach((v, i) => {
    if (v > maxVal) { maxVal = v; peakIdx = i; }
    if (v < minVal && v > 0) { minVal = v; troughIdx = i; }
  });

  // If all values are identical, annotations would be meaningless
  if (maxVal === minVal) {
    return { data: rawData, avg: Math.round(avg), peak: null, trough: null, refLines: [] };
  }

  // Annotate each data point with a semantic category
  const annotated = rawData.map((d, i) => {
    const v = d[valueKey] || 0;
    let annotation = null;

    if (i === peakIdx && maxVal > avg * 1.2) {
      // Highest value AND at least 20% above average
      annotation = 'peak';
    } else if (i === troughIdx && minVal < avg * 0.8 && minVal > 0) {
      // Lowest non-zero AND at least 20% below average
      annotation = 'trough';
    } else if (v > avg * 1.3) {
      // More than 30% above average — clearly above-average day
      annotation = 'aboveAvg';
    } else if (v < avg * 0.7 && v > 0) {
      // More than 30% below average — clearly below-average day
      annotation = 'belowAvg';
    }

    return { ...d, annotation };
  });

  const refLines = [
    { y: Math.round(avg), label: `Avg: ${Math.round(avg)}`, color: '#8D6E63' },
  ];

  return {
    data: annotated,
    avg: Math.round(avg),
    peak: annotated[peakIdx] || null,
    trough: annotated[troughIdx] || null,
    refLines,
  };
}
