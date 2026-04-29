/**
 * DraggableKPIGrid — Draggable grid wrapper for KPI card rows (T4.2).
 *
 * Wraps react-grid-layout's ResponsiveGridLayout to provide drag-and-drop
 * KPI card rearrangement within each Dashboard tab. Resize is intentionally
 * disabled — KPI cards have fixed content height.
 *
 * Key design decisions:
 *   - draggableHandle=".kpi-drag-handle" ensures only the title area triggers
 *     drag, so chart drill-down clicks are unaffected.
 *   - isResizable=false keeps card height consistent with content.
 *   - react-grid-layout CSS is overridden via an inline <style> tag to match
 *     the neubrutalism design language (dashed placeholder, solid shadow on drag).
 *   - Inline CSS hex values are intentional here — these override third-party
 *     library classes and cannot reference COLORS tokens directly.
 *
 * Props:
 *   layout         — react-grid-layout layout array for the current tab
 *   onLayoutChange — callback(newLayout) called when the user drops a card
 *   children       — KPICard elements, each wrapped in a <div key="layoutKey">
 *   rowHeight      — pixel height per grid row (default 110)
 */

import React, { useRef, useState, useEffect } from 'react';
import { ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const GRID_STYLE_OVERRIDES = `
  .dashboard-kpi-grid .react-grid-placeholder {
    background: #FFF8E1 !important;
    border: 2px dashed #5D4037 !important;
    border-radius: 0 !important;
    opacity: 0.6 !important;
    box-shadow: none !important;
  }
  .dashboard-kpi-grid .react-grid-item.react-draggable-dragging {
    z-index: 100;
    box-shadow: 6px 6px 0px #3E2723 !important;
    border-radius: 0 !important;
    opacity: 0.95;
  }
  .dashboard-kpi-grid .react-grid-item > .react-resizable-handle {
    display: none;
  }
`;

export default function DraggableKPIGrid({
  layout,
  onLayoutChange,
  children,
  rowHeight = 110,
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => setWidth(el.offsetWidth);
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <style>{GRID_STYLE_OVERRIDES}</style>

      {width > 0 && (
        <ResponsiveGridLayout
          className="dashboard-kpi-grid"
          layouts={{ lg: layout, md: layout, sm: layout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768 }}
          cols={{ lg: 12, md: 12, sm: 6 }}
          rowHeight={rowHeight}
          width={width}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          isDraggable
          isResizable={false}
          onLayoutChange={(currentLayout, allLayouts) => onLayoutChange?.(allLayouts?.lg || currentLayout)}
          draggableHandle=".kpi-drag-handle"
          useCSSTransforms
        >
          {children}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
