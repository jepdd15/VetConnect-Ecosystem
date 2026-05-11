import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Tabs,
  Tab,
  Chip,
  Snackbar,
  Alert,
  Skeleton,
  Stack,
  Popover,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PaidIcon from '@mui/icons-material/Paid';
import UndoIcon from '@mui/icons-material/Undo';
import { collection, getDocs, query, where, orderBy, getDoc, doc, addDoc, updateDoc, Timestamp, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { COLORS, TYPE, FONT, STATUS_COLORS } from '../theme/designTokens';
import { chatWithHistory, DEFAULT_CALENDAR_AI_PROMPT } from '../utils/llmService';
import { resolveVitals } from '../utils/resolveVitals';
import { normalizeStatus } from '../utils/statusConstants';
import CalendarAIPanel from '../components/CalendarAIPanel';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { useCalendarData } from '../hooks/useCalendarData';
import { useClinicSettings } from '../hooks/useClinicSettings';
import { useQueueActions } from '../features/Queue/useQueueActions';
import { useUser } from '../context/UserContext';
import AssignStaffModal from '../features/Queue/AssignStaffModal';
import DispensingVerificationDialog from '../features/Queue/DispensingVerificationDialog';
import WalkInModal from '../features/Queue/WalkInModal';
import ClinicalWorkspace from '../components/ClinicalWorkspace';
import POSModal from '../components/POSModal';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

/** Status labels for display in popovers. */
const STATUS_LABELS = {
  pending:      'PENDING',
  confirmed:    'CONFIRMED',
  arrived:      'ARRIVED',
  'in-consult': 'IN CONSULT',
  dispensing:   'DISPENSING',
  billing:      'BILLING',
  completed:    'COMPLETED',
  cancelled:    'CANCELLED',
  'no-show':    'NO-SHOW',
  'on-hold':    'ON HOLD',
  confined:     'CONFINED',
};

/** Terminal statuses — only Revert available. */
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'no-show', 'carried-over']);

/** Maximum number of pets to enrich with full medical snapshots per AI context build. */
const MAX_MEDICAL_PETS = 15;

/** Day-of-week column header labels. Starts Monday (JS getDay 1). */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Returns the Monday of the week containing `date`.
 * In JS, getDay() returns 0=Sun, 1=Mon … 6=Sat.
 * We shift so Monday is day 0.
 */
function getMonday(date) {
  const d = new Date(date);
  const jsDay = d.getDay(); // 0=Sun
  const offset = jsDay === 0 ? 6 : jsDay - 1; // Mon offset
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Formats a Date to YYYY-MM-DD using local time. */
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Formats an hour (0-23) to "8 AM" / "12 PM" / "5 PM". */
function formatHourLabel(hour) {
  if (hour === 0)  return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** Formats a JS Date to "10:30 AM". */
function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Resolves a department color from serviceCategory.
 * Matches Monitor.jsx pattern.
 */
function getDeptColor(serviceCategory, departments) {
  if (!serviceCategory || !departments.length) return COLORS.textMuted;
  const match = departments.find(
    (d) => d.name?.toLowerCase() === (serviceCategory || '').toLowerCase()
  );
  return match?.color || COLORS.textMuted;
}

/**
 * Builds the cross-month date label for week view.
 * Examples:
 *   Same month:   "May 5–11, 2026"
 *   Cross-month:  "April 28 – May 4, 2026"
 */
function buildWeekLabel(weekStart, weekEnd) {
  const startMonth = weekStart.toLocaleDateString('en-US', { month: 'long' });
  const endMonth   = weekEnd.toLocaleDateString('en-US',   { month: 'long' });
  const year       = weekEnd.getFullYear();
  const startDay   = weekStart.getDate();
  const endDay     = weekEnd.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
}

// ─────────────────────────────────────────────
// CAPACITY STYLING
// ─────────────────────────────────────────────

const CAPACITY_COLORS = {
  bar: {
    light:    COLORS.kpiGreenBorder,
    moderate: COLORS.kpiOrangeBorder,
    full:     COLORS.kpiRedBorder,
  },
  heatmap: {
    empty:    'transparent',
    light:    'rgba(46, 125, 50, 0.06)',
    moderate: 'rgba(230, 81, 0, 0.08)',
    full:     'rgba(211, 47, 47, 0.08)',
  },
  cell: {
    light:    { bg: COLORS.kpiGreenBg,   border: COLORS.kpiGreenBorder },
    moderate: { bg: COLORS.kpiOrangeBg,  border: COLORS.kpiOrangeBorder },
    full:     { bg: COLORS.kpiRedBg,     border: COLORS.kpiRedBorder },
  },
};

// ─────────────────────────────────────────────
// HOVER POPOVER CONTENT
// ─────────────────────────────────────────────

/** Renders the appointment detail card used in both hover and click popovers. */
function AppointmentDetailCard({ appt, departments }) {
  const statusColor = STATUS_COLORS[appt.status] || COLORS.textMuted;
  const statusLabel = STATUS_LABELS[appt.status] || (appt.status || '').toUpperCase();

  const serviceNames = appt.services
    ?.map((s) => (typeof s === 'string' ? s : s.serviceName || s.name || ''))
    .filter(Boolean)
    .join(', ') || appt.primaryService || '—';

  const vetName = appt.assignedVet || appt.assignedVetName || 'Unassigned';
  const timeStr = appt.jsScheduled ? formatTime(appt.jsScheduled) : '—';
  const ticket  = appt.ticketNumber
    ? String(appt.ticketNumber)
    : appt.queueNumber
    ? `${appt.ticketPrefix || 'W'}-${String(appt.queueNumber).padStart(3, '0')}`
    : '—';

  const labelSx = { ...TYPE.meta, color: COLORS.textMuted, display: 'block', mb: 0.25 };
  const valueSx = { ...TYPE.meta, fontWeight: 700, color: COLORS.textPrimary, display: 'block' };

  return (
    <Box sx={{ p: 0 }}>
      {/* Header */}
      <Box sx={{ px: 1.5, py: 1, bgcolor: COLORS.cream, borderBottom: `1px solid ${COLORS.borderLight}` }}>
        <Typography sx={{ ...TYPE.label, color: COLORS.accent }}>
          APPOINTMENT DETAILS
        </Typography>
      </Box>

      {/* Body */}
      <Box sx={{ px: 1.5, py: 1.25 }}>
        {/* Pet identity */}
        <Typography sx={{ ...valueSx, flexWrap: 'wrap' }}>
          {appt.petName || 'Unknown Pet'}
          {appt.petBreed ? ` · ${appt.petBreed}` : ''}
          {appt.petSpecies ? ` · ${appt.petSpecies}` : ''}
        </Typography>
        <Typography sx={labelSx}>
          Owner: {appt.ownerName || '—'}
        </Typography>
        {appt.ownerPhone && (
          <Typography sx={{ ...labelSx, mb: 0 }}>
            📞 {appt.ownerPhone}
          </Typography>
        )}
        {appt.ownerEmail && (
          <Typography sx={{ ...labelSx, mb: 1 }}>
            ✉ {appt.ownerEmail}
          </Typography>
        )}
        {!appt.ownerPhone && !appt.ownerEmail && <Box sx={{ mb: 1 }} />}

        <Box sx={{ borderTop: `1px solid ${COLORS.borderLight}`, my: 1 }} />

        {/* Services */}
        <Typography sx={labelSx}>Services</Typography>
        {Array.isArray(appt.services) && appt.services.length >= 2 ? (
          <Box sx={{ mb: 0.75 }}>
            {appt.services.map((svc, si) => {
              const st = typeof svc === 'string' ? 'pending' : (svc.serviceStatus || 'pending');
              const name = typeof svc === 'string' ? svc : (svc.name || svc.serviceName || 'Service');
              const icon = st === 'completed' ? '✓' : st === 'in-progress' ? '⏳' : '○';
              const stColor = st === 'completed' ? COLORS.success : st === 'in-progress' ? COLORS.warning : COLORS.textMuted;
              return (
                <Typography key={si} sx={{ ...TYPE.meta, fontWeight: 700, color: stColor, display: 'block', mb: 0.25 }}>
                  {icon} {name}{svc.staffName ? ` · ${svc.staffName}` : ''}
                </Typography>
              );
            })}
          </Box>
        ) : (
          <Typography sx={{ ...valueSx, mb: 0.75 }}>{serviceNames}</Typography>
        )}

        {/* Department */}
        <Typography sx={labelSx}>Department</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: getDeptColor(appt.serviceCategory, departments), borderRadius: 0, flexShrink: 0 }} />
          <Typography sx={valueSx}>{appt.serviceCategory || '—'}</Typography>
        </Box>

        {/* Assigned vet */}
        <Typography sx={labelSx}>Assigned Vet</Typography>
        <Typography sx={{ ...valueSx, mb: 0.75 }}>{vetName}</Typography>

        <Box sx={{ borderTop: `1px solid ${COLORS.borderLight}`, my: 1 }} />

        {/* Time / Status / Ticket */}
        <Typography sx={labelSx}>Time</Typography>
        <Typography sx={{ ...valueSx, mb: 0.5 }}>{timeStr}</Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: statusColor,
              flexShrink: 0,
            }}
          />
          <Typography sx={{ ...TYPE.meta, fontWeight: 700, color: statusColor }}>
            {statusLabel}
          </Typography>
        </Box>

        <Typography sx={labelSx}>
          Ticket: <strong>{ticket}</strong>
        </Typography>
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

/**
 * Single appointment card rendered inside a week-view hour cell.
 * Supports hover (detail popover) and click (action popover) via callbacks.
 */
const AppointmentBlock = React.memo(function AppointmentBlock({
  appt,
  departments,
  onHoverEnter,
  onHoverLeave,
  onClick,
  onContextMenu,
}) {
  const statusColor  = STATUS_COLORS[appt.status] || COLORS.textMuted;
  const scheduledTime = appt.jsScheduled ? formatTime(appt.jsScheduled) : '';

  return (
    <Box
      onMouseEnter={(e) => onHoverEnter(e, appt)}
      onMouseLeave={onHoverLeave}
      onClick={(e) => { e.stopPropagation(); onClick(e, appt); }}
      onContextMenu={onContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, appt); } : undefined}
      sx={{
        bgcolor:    `${statusColor}30`,
        borderLeft: `3px solid ${statusColor}`,
        borderRadius: 0,
        boxShadow: `2px 2px 0px ${COLORS.border}`,
        px: 0.75,
        py: 0.5,
        mb: 0.5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.5,
        cursor: 'pointer',
        '&:hover': {
          bgcolor: `${statusColor}50`,
          boxShadow: `2px 2px 0px ${COLORS.brand}`,
          transform: 'translate(-1px, -1px)',
        },
      }}
    >
      <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
        <Typography
          noWrap
          sx={{
            ...TYPE.tiny,
            fontWeight: 700,
            color: COLORS.textPrimary,
            lineHeight: 1.3,
          }}
        >
          {appt.petName || 'Unknown pet'}
        </Typography>
        <Typography
          sx={{
            ...TYPE.meta,
            fontSize: '0.65rem',
            color: COLORS.textMuted,
            lineHeight: 1.2,
          }}
        >
          {scheduledTime}
        </Typography>
      </Box>
    </Box>
  );
});

/**
 * Renders a single hour-row cell inside a day column.
 * Shows heatmap background, lunch overlay, appointment blocks, and
 * fires onEmptySlotClick when clicking the cell background.
 */
const WeekHourCell = React.memo(function WeekHourCell({
  dateStr,
  hour,
  appointments: hourAppts,
  isLunch,
  isClosed,
  capacityLevel,
  departments,
  onHoverEnter,
  onHoverLeave,
  onAppointmentClick,
  onEmptySlotClick,
  onApptContextMenu,
  onEmptySlotContextMenu,
}) {
  const visibleAppts  = hourAppts.slice(0, 3);
  const overflowCount = hourAppts.length - 3;

  return (
    <Box
      onClick={() => {
        if (!isClosed && !isLunch) onEmptySlotClick(dateStr, hour);
      }}
      onContextMenu={(e) => {
        if (!isClosed && !isLunch && onEmptySlotContextMenu) {
          e.preventDefault();
          onEmptySlotContextMenu(dateStr, hour);
        }
      }}
      sx={{
        height: 60,
        borderBottom: `1px dashed ${COLORS.borderLight}`,
        borderRight: `1px solid ${COLORS.borderLight}`,
        bgcolor: isClosed ? COLORS.panelBg : CAPACITY_COLORS.heatmap[capacityLevel],
        position: 'relative',
        px: 0.5,
        py: 0.25,
        overflow: 'hidden',
        cursor: isClosed || isLunch ? 'default' : 'crosshair',
        '&:hover': {
          bgcolor: isClosed || isLunch
            ? undefined
            : `rgba(58, 190, 249, 0.04)`,
        },
      }}
    >
      {/* Lunch overlay */}
      {isLunch && !isClosed && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(255, 248, 225, 0.7)',
            zIndex: 1,
          }}
        >
          <Typography sx={{ ...TYPE.tiny, color: COLORS.textMuted, letterSpacing: 2 }}>
            LUNCH
          </Typography>
        </Box>
      )}

      {/* Closed day overlay */}
      {isClosed && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: 'rgba(239,235,233,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <Typography sx={{ ...TYPE.tiny, color: COLORS.textMuted, letterSpacing: 2 }}>
            CLOSED
          </Typography>
        </Box>
      )}

      {/* Appointment blocks */}
      {!isClosed && !isLunch && (
        <>
          {visibleAppts.map((appt) => (
            <AppointmentBlock
              key={appt.id}
              appt={appt}
              departments={departments}
              onHoverEnter={onHoverEnter}
              onHoverLeave={onHoverLeave}
              onClick={onAppointmentClick}
              onContextMenu={onApptContextMenu}
            />
          ))}
          {overflowCount > 0 && (
            <Chip
              label={`+${overflowCount} more`}
              size="small"
              sx={{
                borderRadius: 0,
                height: 16,
                fontSize: '0.6rem',
                fontWeight: 700,
                bgcolor: COLORS.panelBg,
                color: COLORS.textSecondary,
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          )}
        </>
      )}
    </Box>
  );
});

// ─────────────────────────────────────────────
// WEEK VIEW
// ─────────────────────────────────────────────

function WeekView({
  weekStart,
  dayMap,
  getSlotCapacity,
  isClosedDate,
  isWorkingDay,
  isLunchHour,
  departments,
  settings,
  showLanes,
  onHoverEnter,
  onHoverLeave,
  onAppointmentClick,
  onEmptySlotClick,
  onApptContextMenu,
  onEmptySlotContextMenu,
}) {
  const openHour  = settings.openHour  ?? 8;
  const closeHour = settings.closeHour ?? 17;
  const today     = toLocalDateStr(new Date());

  // Build the 7 day columns (Mon–Sun).
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Build hour rows from openHour to closeHour-1.
  const hours = Array.from(
    { length: Math.max(0, closeHour - openHour) },
    (_, i) => openHour + i
  );

  // For lanes mode: produce a sorted, deduplicated dept list.
  const activeDepts = useMemo(() => {
    if (!showLanes) return [];
    return departments.length > 0 ? departments : [];
  }, [showLanes, departments]);

  return (
    <Box
      sx={{
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 200px)',
        border: `1px solid ${COLORS.border}`,
      }}
    >
      {/* Column headers */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `60px repeat(7, 1fr)`,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: COLORS.surface,
          borderBottom: `2px solid ${COLORS.border}`,
        }}
      >
        {/* Empty gutter above time labels */}
        <Box sx={{ borderRight: `1px solid ${COLORS.border}` }} />

        {days.map((day) => {
          const dateStr    = toLocalDateStr(day);
          const isToday    = dateStr === today;
          const isClosed   = isClosedDate(dateStr);
          const isWorking  = isWorkingDay(day.getDay());
          const dayLabel   = DAY_LABELS[day.getDay() === 0 ? 6 : day.getDay() - 1];

          return (
            <Box
              key={dateStr}
              sx={{
                textAlign: 'center',
                py: 1,
                bgcolor: isToday
                  ? COLORS.cream
                  : !isWorking || isClosed
                  ? COLORS.panelBg
                  : 'transparent',
                borderLeft: isToday ? `2px solid ${COLORS.sky}` : `1px solid ${COLORS.border}`,
              }}
            >
              <Typography sx={{ ...TYPE.label, color: isToday ? COLORS.sky : COLORS.textSecondary }}>
                {dayLabel}
              </Typography>
              <Typography
                sx={{
                  ...TYPE.meta,
                  fontWeight: isToday ? 800 : 600,
                  color: isToday ? COLORS.sky : COLORS.textPrimary,
                }}
              >
                {day.getMonth() + 1}/{day.getDate()}
              </Typography>
              {isClosed && (
                <Typography sx={{ ...TYPE.tiny, color: COLORS.danger, letterSpacing: 1 }}>
                  CLOSED
                </Typography>
              )}

              {/* Department lane sub-headers (shown when showLanes is on) */}
              {showLanes && activeDepts.length > 0 && (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${activeDepts.length}, 1fr)`,
                    borderTop: `1px solid ${COLORS.borderLight}`,
                    mt: 0.5,
                  }}
                >
                  {activeDepts.map((dept) => (
                    <Box
                      key={dept.id}
                      sx={{
                        borderLeft: `2px solid ${dept.color || COLORS.textMuted}`,
                        px: 0.5,
                        py: 0.25,
                      }}
                    >
                      <Typography
                        noWrap
                        sx={{
                          ...TYPE.tiny,
                          fontSize: '0.55rem',
                          fontWeight: 700,
                          color: dept.color || COLORS.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        {dept.name}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Hour rows */}
      {hours.map((hour) => (
        <Box
          key={hour}
          sx={{
            display: 'grid',
            gridTemplateColumns: `60px repeat(7, 1fr)`,
          }}
        >
          {/* Time gutter */}
          <Box
            sx={{
              borderRight: `1px solid ${COLORS.border}`,
              borderBottom: `1px dashed ${COLORS.borderLight}`,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              pr: 1,
              pt: 0.5,
              height: showLanes && activeDepts.length > 0 ? 'auto' : 60,
              minHeight: 60,
              flexShrink: 0,
            }}
          >
            <Typography sx={{ ...TYPE.meta, fontSize: '0.65rem', color: COLORS.textMuted }}>
              {formatHourLabel(hour)}
            </Typography>
          </Box>

          {/* Day columns */}
          {days.map((day) => {
            const dateStr   = toLocalDateStr(day);
            const isToday   = dateStr === today;
            const isClosed  = isClosedDate(dateStr);
            const isLunch   = isLunchHour(hour);
            const cap       = getSlotCapacity(dateStr, hour);
            const hourAppts = dayMap.get(dateStr)?.get(hour) ?? [];

            if (showLanes && activeDepts.length > 0) {
              // Lane mode: split into per-department sub-columns.
              return (
                <Box
                  key={dateStr}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${activeDepts.length}, 1fr)`,
                    bgcolor: isToday && !isClosed && !isLunch
                      ? `rgba(255, 248, 225, 0.4)`
                      : undefined,
                    borderRight: `1px solid ${COLORS.borderLight}`,
                    borderBottom: `1px dashed ${COLORS.borderLight}`,
                    minHeight: 60,
                  }}
                >
                  {activeDepts.map((dept) => {
                    const laneAppts = hourAppts.filter(
                      (a) =>
                        (a.serviceCategory || '').toLowerCase() ===
                        (dept.name || '').toLowerCase()
                    );
                    return (
                      <Box
                        key={dept.id}
                        onClick={() => {
                          if (!isClosed && !isLunch) onEmptySlotClick(dateStr, hour);
                        }}
                        onContextMenu={(e) => {
                          if (!isClosed && !isLunch && onEmptySlotContextMenu) {
                            e.preventDefault();
                            onEmptySlotContextMenu(dateStr, hour);
                          }
                        }}
                        sx={{
                          borderLeft: `2px solid ${dept.color || COLORS.textMuted}`,
                          px: 0.25,
                          py: 0.25,
                          cursor: isClosed || isLunch ? 'default' : 'crosshair',
                          bgcolor: isClosed
                            ? COLORS.panelBg
                            : CAPACITY_COLORS.heatmap[cap.level],
                          '&:hover': {
                            bgcolor: isClosed || isLunch
                              ? undefined
                              : `rgba(58, 190, 249, 0.04)`,
                          },
                        }}
                      >
                        {!isClosed && !isLunch && laneAppts.map((appt) => (
                          <AppointmentBlock
                            key={appt.id}
                            appt={appt}
                            departments={departments}
                            onHoverEnter={onHoverEnter}
                            onHoverLeave={onHoverLeave}
                            onClick={onAppointmentClick}
                            onContextMenu={onApptContextMenu}
                          />
                        ))}
                      </Box>
                    );
                  })}
                </Box>
              );
            }

            // Default mode: single column per day.
            return (
              <Box
                key={dateStr}
                sx={{
                  bgcolor: isToday && !isClosed && !isLunch
                    ? `rgba(255, 248, 225, 0.4)`
                    : undefined,
                }}
              >
                <WeekHourCell
                  dateStr={dateStr}
                  hour={hour}
                  appointments={hourAppts}
                  isLunch={isLunch}
                  isClosed={isClosed}
                  capacityLevel={cap.level}
                  departments={departments}
                  onHoverEnter={onHoverEnter}
                  onHoverLeave={onHoverLeave}
                  onAppointmentClick={onAppointmentClick}
                  onEmptySlotClick={onEmptySlotClick}
                  onApptContextMenu={onApptContextMenu}
                  onEmptySlotContextMenu={onEmptySlotContextMenu}
                />
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

// ─────────────────────────────────────────────
// MONTH VIEW
// ─────────────────────────────────────────────

/**
 * Compute total appointments across all hours for a given date.
 */
function getDailyCount(dayMap, dateStr) {
  const hourMap = dayMap.get(dateStr);
  if (!hourMap) return 0;
  let total = 0;
  for (const appts of hourMap.values()) total += appts.length;
  return total;
}

/**
 * Compute daily capacity level.
 * totalSlots = working hours × slots per hour (minus lunch slot if configured).
 */
function getDailyCapacityLevel(totalAppts, openHour, closeHour, minSlotInterval, lunchEnabled) {
  const workingHours  = closeHour - openHour;
  const slotsPerHour  = Math.floor(60 / (minSlotInterval || 30));
  const lunchSlots    = lunchEnabled ? slotsPerHour : 0;
  const totalSlots    = Math.max(1, workingHours * slotsPerHour - lunchSlots);
  const percent       = Math.min((totalAppts / totalSlots) * 100, 100);

  if (percent <= 0)  return { level: 'empty',    percent };
  if (percent < 50)  return { level: 'light',    percent };
  if (percent <= 80) return { level: 'moderate', percent };
  return               { level: 'full',     percent };
}

function MonthView({ anchorDate, dayMap, getSlotCapacity, isClosedDate, isWorkingDay, settings, setView, setAnchorDate, onDayContextMenu }) {
  const openHour        = settings.openHour    ?? 8;
  const closeHour       = settings.closeHour   ?? 17;
  const minSlotInterval = settings.minSlotInterval || 30;
  const lunchEnabled    = settings.lunchEnabled || false;
  const today           = toLocalDateStr(new Date());

  const year  = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth  = new Date(year, month + 1, 0);
  const daysInMonth  = lastOfMonth.getDate();

  // How many blank cells before the 1st? (Monday-based grid)
  const firstDayOfWeek = firstOfMonth.getDay(); // 0=Sun
  const leadingBlanks  = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  // Total cells must be a multiple of 7.
  const totalCells    = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;
  const trailingBlanks = totalCells - leadingBlanks - daysInMonth;

  const handleDayClick = (dayDate) => {
    setAnchorDate(dayDate);
    setView('week');
  };

  return (
    <Box>
      {/* Day-of-week column headers */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          mb: 0,
          borderBottom: `2px solid ${COLORS.border}`,
          borderTop: `1px solid ${COLORS.border}`,
          borderLeft: `1px solid ${COLORS.border}`,
          borderRight: `1px solid ${COLORS.border}`,
        }}
      >
        {DAY_LABELS.map((label) => (
          <Box
            key={label}
            sx={{
              textAlign: 'center',
              py: 1,
              bgcolor: COLORS.surface,
              borderRight: `1px solid ${COLORS.borderLight}`,
            }}
          >
            <Typography sx={{ ...TYPE.label, color: COLORS.textSecondary }}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Calendar grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          border: `1px solid ${COLORS.border}`,
          borderTop: 'none',
        }}
      >
        {/* Leading blank cells */}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <Box
            key={`blank-start-${i}`}
            sx={{
              minHeight: 90,
              bgcolor: COLORS.surfaceAlt,
              borderRight: `1px solid ${COLORS.borderLight}`,
              borderBottom: `1px solid ${COLORS.borderLight}`,
            }}
          />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const dayNum     = i + 1;
          const dayDate    = new Date(year, month, dayNum);
          const dateStr    = toLocalDateStr(dayDate);
          const dayOfWeek  = dayDate.getDay(); // 0=Sun
          const isToday    = dateStr === today;
          const isClosed   = isClosedDate(dateStr);
          const isWorking  = isWorkingDay(dayOfWeek);
          const totalAppts = getDailyCount(dayMap, dateStr);
          const { level, percent } = getDailyCapacityLevel(
            totalAppts,
            openHour,
            closeHour,
            minSlotInterval,
            lunchEnabled
          );

          // Cell background logic
          let cellBg = COLORS.cardBg;
          if (isClosed)    cellBg = COLORS.panelBg;
          else if (!isWorking) cellBg = COLORS.surfaceAlt;
          else if (isToday)    cellBg = COLORS.cream;

          // Capacity bar color
          const barColor = level === 'full'
            ? COLORS.kpiRedBorder
            : level === 'moderate'
            ? COLORS.kpiOrangeBorder
            : COLORS.kpiGreenBorder;

          return (
            <Box
              key={dateStr}
              onClick={() => handleDayClick(dayDate)}
              onContextMenu={onDayContextMenu ? (e) => {
                e.preventDefault();
                onDayContextMenu(dateStr, totalAppts);
              } : undefined}
              sx={{
                minHeight: 90,
                p: 1,
                cursor: 'pointer',
                position: 'relative',
                bgcolor: cellBg,
                borderLeft: isToday ? `2px solid ${COLORS.sky}` : undefined,
                borderRight: `1px solid ${COLORS.borderLight}`,
                borderBottom: `1px solid ${COLORS.borderLight}`,
                '&:hover': { bgcolor: isToday ? COLORS.cream : COLORS.surfaceHover },
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                overflow: 'hidden',
              }}
            >
              {/* Closed diagonal overlay */}
              {isClosed && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'repeating-linear-gradient(135deg, transparent, transparent 5px, rgba(0,0,0,0.06) 5px, rgba(0,0,0,0.06) 10px)',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Top row: day number + count badge */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography
                  sx={{
                    ...TYPE.meta,
                    fontWeight: isToday ? 800 : 600,
                    color: isToday ? COLORS.sky : COLORS.textPrimary,
                  }}
                >
                  {dayNum}
                </Typography>

                {totalAppts > 0 && (
                  <Box
                    sx={{
                      minWidth: 20,
                      height: 20,
                      bgcolor: level === 'full'
                        ? COLORS.kpiRedBg
                        : level === 'moderate'
                        ? COLORS.kpiOrangeBg
                        : COLORS.kpiBlueBg,
                      border: `1px solid ${
                        level === 'full'
                          ? COLORS.kpiRedBorder
                          : level === 'moderate'
                          ? COLORS.kpiOrangeBorder
                          : COLORS.kpiBlueBorder
                      }`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      px: 0.5,
                    }}
                  >
                    <Typography sx={{ ...TYPE.tiny, fontWeight: 700, color: COLORS.textPrimary }}>
                      {totalAppts}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Closed label */}
              {isClosed && (
                <Typography
                  sx={{
                    ...TYPE.tiny,
                    color: COLORS.textMuted,
                    letterSpacing: 2,
                    textAlign: 'center',
                    mt: 1,
                  }}
                >
                  CLOSED
                </Typography>
              )}

              {/* Capacity bar at bottom */}
              {totalAppts > 0 && !isClosed && (
                <Box
                  sx={{
                    height: 4,
                    bgcolor: COLORS.borderLight,
                    mt: 'auto',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${Math.min(percent, 100)}%`,
                      bgcolor: barColor,
                    }}
                  />
                </Box>
              )}
            </Box>
          );
        })}

        {/* Trailing blank cells */}
        {Array.from({ length: trailingBlanks }).map((_, i) => (
          <Box
            key={`blank-end-${i}`}
            sx={{
              minHeight: 90,
              bgcolor: COLORS.surfaceAlt,
              borderRight: `1px solid ${COLORS.borderLight}`,
              borderBottom: `1px solid ${COLORS.borderLight}`,
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────
// LOADING SKELETON
// ─────────────────────────────────────────────

function CalendarSkeleton({ view }) {
  if (view === 'month') {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mt: 1 }}>
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            height={90}
            sx={{ borderRadius: 0 }}
          />
        ))}
      </Box>
    );
  }

  // Week skeleton — a grid of bars
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `60px repeat(7, 1fr)`, gap: 0, mt: 1 }}>
      {Array.from({ length: 8 }).map((_, col) => (
        Array.from({ length: 9 }).map((__, row) => (
          <Skeleton
            key={`${col}-${row}`}
            variant="rectangular"
            height={60}
            sx={{ borderRadius: 0, mb: '1px', ml: '1px' }}
          />
        ))
      ))}
    </Box>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

const popoverPaperSx = {
  borderRadius: 0,
  border: `2px solid ${COLORS.brand}`,
  boxShadow: `4px 4px 0px ${COLORS.brand}`,
  minWidth: 280,
  maxWidth: 320,
};

const btnActionSx = {
  textTransform: 'uppercase',
  fontWeight: '1000',
  fontSize: '0.65rem',
  height: 28,
  borderRadius: 0,
  letterSpacing: 0.5,
  px: 1.5,
};

export default function Calendar() {
  const settings       = useClinicSettings();
  const { user, profile } = useUser();
  const { changeStatus, revertStatus } = useQueueActions();

  // ── View state ──────────────────────────────
  const [view, setView]             = useState('week');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [deptFilter, setDeptFilter] = useState(null);
  const [showLanes, setShowLanes]   = useState(false);

  // ── Toast ───────────────────────────────────
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const closeToast = useCallback(() => setToast((t) => ({ ...t, open: false })), []);
  const showToast  = useCallback((message, severity = 'success') => {
    setToast({ open: true, message, severity });
  }, []);

  // ── Calendar AI state ───────────────────────
  const [calAIOpen,         setCalAIOpen]         = useState(false);
  const [calAIMessages,     setCalAIMessages]     = useState([]);
  const [calAIInput,        setCalAIInput]        = useState('');
  const [calAILoading,      setCalAILoading]      = useState(false);
  const [calAIError,        setCalAIError]        = useState('');
  const [calAIContextLabel, setCalAIContextLabel] = useState(null);
  const [llmConfig,         setLlmConfig]         = useState({ enabled: false, workerUrl: '' });
  const [calAISystemPrompt, setCalAISystemPrompt] = useState('');
  const calAIAbortRef          = useRef(false);
  const lastCalAIUserContentRef = useRef('');
  const petMedicalCacheRef      = useRef({ data: null, petIds: null, rangeKey: null });

  // ── Department + supplementary data ─────────
  const [departments,         setDepartments]         = useState([]);
  const [inventoryList,       setInventoryList]       = useState([]);
  const [servicesList,        setServicesList]        = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [vets,                setVets]                = useState([]);

  // Load all supplementary data once at mount.
  useEffect(() => {
    const loadSupplementaryData = async () => {
      try {
        const [deptSnap, invSnap, srvSnap, catSnap, usersSnap, llmSnap, calPromptSnap] = await Promise.all([
          getDocs(collection(db, 'departments')),
          getDocs(collection(db, 'inventory')),
          getDocs(query(collection(db, 'services'), where('isArchived', '!=', true))),
          getDocs(collection(db, 'inventory_categories')),
          getDocs(collection(db, 'users')),
          getDoc(doc(db, 'clinic_settings', 'llm_config')),
          getDoc(doc(db, 'system_prompts', 'calendar_assistant')),
        ]);

        setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        setInventoryList(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        setServicesList(
          srvSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((s) => !s.isArchived)
        );

        setInventoryCategories(catSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        setVets(
          usersSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter(
              (u) =>
                !u.disabled &&
                ['admin', 'staff', 'veterinarian', 'groomer'].includes(u.accessLevel)
            )
        );

        if (llmSnap.exists()) {
          setLlmConfig({
            enabled:   llmSnap.data().enabled ?? false,
            workerUrl: llmSnap.data().workerUrl ?? '',
          });
        }

        if (calPromptSnap.exists()) {
          setCalAISystemPrompt(calPromptSnap.data().prompt || '');
        }
      } catch (err) {
        console.error('[Calendar.loadSupplementaryData]:', err.message);
      }
    };

    loadSupplementaryData();
  }, []);

  // Joined inventory with isMedicine resolved from category.
  const joinedInventory = useMemo(() => {
    return inventoryList
      .filter((item) => !item.isArchived)
      .map((item) => {
        const catObj = inventoryCategories.find(
          (c) => c.name?.toLowerCase() === item.category?.toLowerCase()
        );
        return {
          ...item,
          isMedicine:   catObj ? !!catObj.isMedicine : false,
          productClass: catObj?.productClass || (catObj?.isMedicine ? 'medicine' : 'retail'),
        };
      });
  }, [inventoryList, inventoryCategories]);

  // ── Date range computation ───────────────────
  const weekStart = useMemo(() => getMonday(anchorDate), [anchorDate]);
  const weekEnd   = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [weekStart]);

  const monthStart = useMemo(
    () => new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 0, 0, 0, 0),
    [anchorDate]
  );
  const monthEnd = useMemo(
    () => new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0, 23, 59, 59, 999),
    [anchorDate]
  );

  const [startDate, endDate] = view === 'week'
    ? [weekStart, weekEnd]
    : [monthStart, monthEnd];

  // ── Data hook ───────────────────────────────
  const {
    appointments,
    dayMap,
    loading,
    error,
    refresh,
    getSlotCapacity,
    isClosedDate,
    isWorkingDay,
    isLunchHour,
  } = useCalendarData(startDate, endDate, deptFilter);

  // ── Navigation handlers ──────────────────────
  const handlePrev = useCallback(() => {
    setAnchorDate((prev) => {
      const d = new Date(prev);
      if (view === 'week') d.setDate(d.getDate() - 7);
      else d.setMonth(d.getMonth() - 1);
      return d;
    });
  }, [view]);

  const handleNext = useCallback(() => {
    setAnchorDate((prev) => {
      const d = new Date(prev);
      if (view === 'week') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
      return d;
    });
  }, [view]);

  const handleToday = useCallback(() => setAnchorDate(new Date()), []);

  // ── Date label ───────────────────────────────
  const dateLabel = view === 'week'
    ? buildWeekLabel(weekStart, weekEnd)
    : anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ── Today-is-visible guard for Today button ──
  const todayStr    = toLocalDateStr(new Date());
  const isTodayVisible = view === 'week'
    ? todayStr >= toLocalDateStr(weekStart) && todayStr <= toLocalDateStr(weekEnd)
    : toLocalDateStr(new Date()).slice(0, 7) === toLocalDateStr(anchorDate).slice(0, 7);

  // ── Abort Calendar AI on unmount ────────────
  useEffect(() => {
    return () => { calAIAbortRef.current = true; };
  }, []);

  // ── Medical context fetcher ──────────────────
  /**
   * Fetches medical context for a set of petIds and returns a Map<petId, snapshot>.
   * Runs 3 parallel Firestore reads per pet (pet doc + medical_records limit 3 + problems).
   * Errors for individual pets are swallowed so a single failure doesn't block the AI.
   *
   * @param {string[]} petIds
   * @returns {Promise<Map<string, object>>}
   */
  const fetchPetMedicalContext = useCallback(async (petIds) => {
    const results = new Map();

    const fetches = petIds.map(async (petId) => {
      try {
        const [petSnap, recordsSnap, problemsSnap] = await Promise.all([
          getDoc(doc(db, 'pets', petId)),
          getDocs(query(
            collection(db, 'medical_records'),
            where('petId', '==', petId),
            orderBy('date', 'desc'),
            limit(3)
          )),
          getDocs(query(
            collection(db, 'pets', petId, 'problems'),
            orderBy('diagnosedAt', 'desc')
          )),
        ]);

        const petData  = petSnap.exists() ? petSnap.data() : {};
        const records  = recordsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const problems = problemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // ── Pet-level fields ──
        const allergies = petData.petAllergies || petData.allergies || null;
        const weight    = petData.weight || null;

        // ── Active conditions from problem list ──
        const activeConditions = problems
          .filter((p) => p.status === 'active' || p.status === 'monitoring')
          .map((p) => ({ name: p.name, severity: p.severity, status: p.status }));

        // ── Last 3 diagnoses with dates from medical records ──
        const lastDiagnoses = records
          .map((r) => {
            const date = r.date?.toDate
              ? r.date.toDate()
              : r.date?.seconds
                ? new Date(r.date.seconds * 1000)
                : null;
            const dxList = r.diagnoses?.length > 0
              ? r.diagnoses.map((d) => d.name)
              : r.soap?.assessment
                ? [r.soap.assessment]
                : r.diagnosis
                  ? [r.diagnosis]
                  : [];
            return dxList.length > 0 ? { date, diagnoses: dxList } : null;
          })
          .filter(Boolean);

        // ── Current medications from dispensed products (deduplicated, capped at 5) ──
        const medications = [];
        for (const r of records) {
          const rxItems = r.dispensedProducts || r.prescriptions || [];
          const drugs = rxItems.filter(
            (rx) => rx.productClass === 'medicine' || rx.isDrug || rx.isMedicine
          );
          for (const rx of drugs) {
            if (!medications.find((m) => m.name === rx.name)) {
              medications.push({
                name:         rx.name,
                instructions: (rx.instructions || '').substring(0, 50),
              });
            }
            if (medications.length >= 5) break;
          }
          if (medications.length >= 5) break;
        }

        // ── Last vitals from most recent record ──
        const lastVitals = records.length > 0 ? resolveVitals(records[0]) : {};

        results.set(petId, {
          allergies,
          weight,
          activeConditions,
          lastDiagnoses,
          medications,
          lastVitals,
        });
      } catch (err) {
        console.error(`[Calendar.fetchPetMedicalContext] Failed for petId=${petId}:`, err.message);
        // Non-blocking — skip this pet's medical context rather than halting the AI call.
      }
    });

    await Promise.all(fetches);
    return results;
  }, []);

  // ── Calendar context builder ─────────────────
  /**
   * Formats all currently-loaded calendar data into a plain-text context block.
   * Appended to the system prompt on every AI query so the LLM has full
   * situational awareness without needing JSON parsing.
   *
   * @param {Map<string, object>|null} medicalSnapshots - Optional per-pet medical data.
   */
  const buildCalendarContext = useCallback((medicalSnapshots = null) => {
    const lines = [];
    const now = new Date();

    lines.push(`CURRENT VIEW: ${view === 'week' ? 'Week' : 'Month'} — ${dateLabel}`);
    lines.push(`TODAY: ${toLocalDateStr(now)} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`);
    lines.push('');

    lines.push('APPOINTMENTS IN VIEW:');
    if (appointments.length === 0) {
      lines.push('  (none)');
    } else {
      const byDate = {};
      for (const appt of appointments) {
        const d = appt.jsScheduled ? toLocalDateStr(appt.jsScheduled) : 'unknown';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(appt);
      }
      for (const [dateStr, appts] of Object.entries(byDate).sort()) {
        lines.push(`  ${dateStr} (${appts.length} appointments):`);
        for (const a of appts) {
          const time = a.jsScheduled ? formatTime(a.jsScheduled) : '?';
          const svcs = (a.services || [])
            .map((s) => (typeof s === 'string' ? s : s.serviceName || s.name || ''))
            .filter(Boolean)
            .join(', ') || a.primaryService || '—';
          const bookingType = a.ticketPrefix === 'E' ? 'EMERGENCY' : a.ticketPrefix === 'W' ? 'Walk-In' : 'Online';
          lines.push(`    - ${time} | ${a.petName || '?'} (${a.petSpecies || '?'}) | Owner: ${a.ownerName || '?'} | Services: ${svcs} | Status: ${a.status} | Type: ${bookingType} | Dept: ${a.serviceCategory || '?'} | Vet: ${a.assignedVet || a.assignedVetName || 'Unassigned'}`);
        }
      }
    }
    lines.push('');

    lines.push('AVAILABLE SERVICES:');
    for (const svc of servicesList) {
      const dur   = svc.duration ? `${svc.duration}min` : '?';
      const dept  = svc.department || svc.serviceCategory || '?';
      const price = svc.price != null ? `P${svc.price}` : '?';
      lines.push(`  - ${svc.name} | ${dept} | ${dur} | ${price}`);
    }
    lines.push('');

    lines.push('STAFF:');
    for (const v of vets) {
      const depts = Array.isArray(v.departments) ? v.departments.join(', ') : (v.departments || v.accessLevel || '?');
      lines.push(`  - ${v.fullName || v.email || '?'} | ${depts}`);
    }
    lines.push('');

    lines.push('CLINIC SETTINGS:');
    lines.push(`  Hours: ${settings.openHour ?? 8}:00 - ${settings.closeHour ?? 17}:00`);
    lines.push(`  Slot interval: ${settings.minSlotInterval || 30} min`);
    lines.push(`  Lunch: ${settings.lunchEnabled ? `${settings.lunchStart ?? 12}:00 - ${settings.lunchEnd ?? 13}:00` : 'No lunch break configured'}`);
    const workDays = (settings.workingDays || [0,1,2,3,4,5,6])
      .map((d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d])
      .join(', ');
    lines.push(`  Working days: ${workDays}`);
    if ((settings.closedDates || []).length > 0) {
      lines.push(`  Closed dates: ${settings.closedDates.join(', ')}`);
    }
    lines.push('');

    lines.push('DEPARTMENT CAPACITIES:');
    for (const dept of departments) {
      const maxSlots = dept.maxSlots || dept.capacity || 'unlimited';
      lines.push(`  - ${dept.name} | Max: ${maxSlots} | Color: ${dept.color || 'none'}`);
    }
    lines.push('');

    lines.push('INVENTORY (medicines & vaccines):');
    const medItems = joinedInventory.filter(
      (i) => i.isMedicine || i.productClass === 'medicine'
    );
    for (const item of medItems.slice(0, 30)) {
      lines.push(`  - ${item.name} | Stock: ${item.quantity ?? '?'} | ${item.productClass || 'medicine'}`);
    }
    if (medItems.length > 30) lines.push(`  ... and ${medItems.length - 30} more items`);
    lines.push('');

    // PET CONTEXT — deduplicated pet list from appointment docs (v1: appointment-level data only)
    lines.push('PET CONTEXT (from appointment data):');
    const seenPets = new Set();
    for (const appt of appointments) {
      const petKey = appt.petId || appt.petName;
      if (!petKey || seenPets.has(petKey)) continue;
      seenPets.add(petKey);
      lines.push(`  - ${appt.petName || '?'} | ${appt.petSpecies || '?'} | ${appt.petBreed || '?'} | Owner: ${appt.ownerName || '?'}`);
    }
    if (seenPets.size === 0) lines.push('  (none in view)');
    lines.push('');

    // ── Section 8: PATIENT MEDICAL SNAPSHOTS (enriched from Firestore) ──
    if (medicalSnapshots && medicalSnapshots.size > 0) {
      const allApptPetIds = [...new Set(appointments.map((a) => a.petId).filter(Boolean))];
      const renderedPets = new Set();

      lines.push('PATIENT MEDICAL SNAPSHOTS:');
      for (const appt of appointments) {
        const petKey = appt.petId;
        if (!petKey || !medicalSnapshots.has(petKey) || renderedPets.has(petKey)) continue;
        renderedPets.add(petKey);

        const snap = medicalSnapshots.get(petKey);
        lines.push(`  [${appt.petName || '?'}]`);

        lines.push(`    Allergies: ${snap.allergies || 'None recorded'}`);

        if (snap.weight) {
          lines.push(`    Weight: ${snap.weight} kg`);
        }

        if (snap.activeConditions.length > 0) {
          const condStr = snap.activeConditions
            .map((c) => (c.severity ? `${c.name} (${c.severity})` : c.name))
            .join(', ');
          lines.push(`    Active Conditions: ${condStr}`);
        } else {
          lines.push(`    Active Conditions: None`);
        }

        if (snap.lastDiagnoses.length > 0) {
          for (const d of snap.lastDiagnoses) {
            const dateStr = d.date
              ? d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '?';
            lines.push(`    Diagnosis (${dateStr}): ${d.diagnoses.join(', ')}`);
          }
        }

        if (snap.medications.length > 0) {
          const medStr = snap.medications
            .map((m) => (m.instructions ? `${m.name} (${m.instructions})` : m.name))
            .join(', ');
          lines.push(`    Current Medications: ${medStr}`);
        }

        const v = snap.lastVitals;
        const vParts = [];
        if (v.weight) vParts.push(`Weight: ${v.weight}kg`);
        if (v.temp)   vParts.push(`Temp: ${v.temp}C`);
        if (v.hr)     vParts.push(`HR: ${v.hr}`);
        if (v.rr)     vParts.push(`RR: ${v.rr}`);
        if (vParts.length > 0) {
          lines.push(`    Last Vitals: ${vParts.join(', ')}`);
        }

        lines.push('');
      }

      if (allApptPetIds.length > MAX_MEDICAL_PETS) {
        lines.push(`  (${allApptPetIds.length - MAX_MEDICAL_PETS} additional pets in view — ask about specific pets for their details)`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }, [appointments, servicesList, vets, departments, joinedInventory, settings, view, dateLabel]);

  // ── Core LLM caller ──────────────────────────
  /**
   * Sends a message to the Calendar AI with a full calendar-data context appendix.
   * Manages sliding window (cap 20 messages), pre/post audit-logs, and abort guard.
   */
  const runCalendarAI = useCallback(async (userText, { forceInitial = false } = {}) => {
    if (!llmConfig.enabled || !llmConfig.workerUrl) return;
    if (calAILoading) return;
    if (!userText?.trim()) return;

    lastCalAIUserContentRef.current = userText;

    const baseMessages  = forceInitial ? [] : calAIMessages;
    const userMsg       = { role: 'user', content: userText };
    const updatedMessages = [...baseMessages, userMsg];
    const cappedMessages  = updatedMessages.length > 20
      ? updatedMessages.slice(-20)
      : updatedMessages;

    calAIAbortRef.current = false;
    setCalAIMessages(cappedMessages);
    setCalAILoading(true);
    setCalAIError('');
    setCalAIInput('');

    // ── Medical context: fetch or use cached data ──
    const allPetIds    = [...new Set(appointments.map((a) => a.petId).filter(Boolean))];
    const uniquePetIds = allPetIds.slice(0, MAX_MEDICAL_PETS);
    const rangeKey     = `${startDate?.getTime()}_${endDate?.getTime()}`;

    const cached = petMedicalCacheRef.current;
    const cacheValid = cached.rangeKey === rangeKey
      && cached.petIds?.length === uniquePetIds.length
      && uniquePetIds.every((id) => cached.petIds.includes(id));

    let medicalSnapshots = null;
    if (cacheValid && cached.data) {
      medicalSnapshots = cached.data;
    } else if (uniquePetIds.length > 0) {
      try {
        medicalSnapshots = await fetchPetMedicalContext(uniquePetIds);
        petMedicalCacheRef.current = { data: medicalSnapshots, petIds: uniquePetIds, rangeKey };
      } catch (err) {
        console.error('[Calendar.runCalendarAI] Medical context fetch failed:', err.message);
        // Non-blocking — proceed without medical context on fetch failure.
      }
    }

    const basePrompt      = calAISystemPrompt || DEFAULT_CALENDAR_AI_PROMPT;
    const contextBlock    = buildCalendarContext(medicalSnapshots);
    const effectivePrompt = `${basePrompt}\n\n--- CURRENT CALENDAR DATA ---\n${contextBlock}`;

    const auditBase = {
      source:    'calendar',
      staffId:   user?.uid || '',
      staffName: profile?.fullName || profile?.email || 'Unknown',
      timestamp: Timestamp.now(),
    };

    let auditRef;
    try {
      auditRef = await addDoc(collection(db, 'llm_audit_logs'), {
        ...auditBase,
        type:          cappedMessages.length <= 1 ? 'request' : 'follow_up',
        status:        'pending',
        promptSummary: userText.substring(0, 200),
        messageCount:  cappedMessages.length,
      });
    } catch (auditErr) {
      console.error('[Calendar.runCalendarAI] Audit pre-log failed:', auditErr.message);
    }

    try {
      const result = await chatWithHistory({
        messages:     cappedMessages,
        systemPrompt: effectivePrompt,
        workerUrl:    llmConfig.workerUrl,
      });

      if (!calAIAbortRef.current) {
        setCalAIMessages((prev) => [...prev, { role: 'assistant', content: result.text }]);
      }

      if (auditRef) {
        await updateDoc(auditRef, {
          status:          'success',
          responseSummary: (result.text || '').substring(0, 500),
          tokenCount:      result.tokenCount ?? null,
          completedAt:     Timestamp.now(),
        });
      }
    } catch (err) {
      if (!calAIAbortRef.current) {
        setCalAIError(err.message || 'AI request failed.');
      }
      if (auditRef) {
        await updateDoc(auditRef, {
          status:       'error',
          errorMessage: err.message || 'Unknown error',
          completedAt:  Timestamp.now(),
        }).catch(() => {});
      }
    } finally {
      if (!calAIAbortRef.current) {
        setCalAILoading(false);
      }
    }
  }, [llmConfig, calAILoading, calAIMessages, calAISystemPrompt, buildCalendarContext, fetchPetMedicalContext, user, profile, appointments, startDate, endDate]);

  /**
   * fetchExpandedContext — stub for future on-demand expansion.
   *
   * Fetches appointments for an arbitrary date range outside the current
   * calendar view. Not wired into auto-detection in v1 — the system prompt
   * instructs the AI to ask the user to navigate to the relevant range first.
   * Retained here as the expansion point for a future suggest-and-confirm flow.
   *
   * @param {Date} queryStartDate
   * @param {Date} queryEndDate
   * @returns {Promise<Array>}
   */
  // ── Quick-action chip handler ─────────────────
  const handleChipClick = useCallback((chipType) => {
    const queries = {
      briefing:          "Give me a briefing for tomorrow's schedule — how many appointments, which departments are busiest, any potential conflicts, and what to prepare.",
      find_slot:         'What are the best available slots for the next 3 days? Consider department capacity, staff availability, and avoid overbooking.',
      staff_availability: 'Show me staff availability and workload for the current view period. Who is busiest? Who has capacity?',
      week_summary:      "Summarize this week's schedule — total appointments by day, busiest departments, notable patterns, and any gaps.",
      conflicts:         'Detect any scheduling conflicts, overbooking, understaffing, or large gaps in the current view. Flag anything that needs attention.',
    };
    const query = queries[chipType] || chipType;
    if (!calAIOpen) setCalAIOpen(true);
    runCalendarAI(query);
  }, [calAIOpen, runCalendarAI]);

  // ── Calendar AI panel control handlers ───────
  const handleCalAIReset = useCallback(() => {
    setCalAIMessages([]);
    setCalAIError('');
    setCalAIContextLabel(null);
    petMedicalCacheRef.current = { data: null, petIds: null, rangeKey: null };
  }, []);

  const handleCalAIRetry = useCallback(() => {
    if (lastCalAIUserContentRef.current) {
      runCalendarAI(lastCalAIUserContentRef.current);
    }
  }, [runCalendarAI]);

  const handleCalAIClose = useCallback(() => {
    calAIAbortRef.current = true;
    setCalAIOpen(false);
    // Conversation intentionally persists — re-opening shows prior messages.
    // Only Reset clears the conversation.
  }, []);

  // ── Right-click on month day cell ────────────
  const handleDayContextMenu = useCallback((dateStr, apptCount) => {
    const dayLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric',
    });
    const countClause = apptCount > 0
      ? ` (${apptCount} appointment${apptCount !== 1 ? 's' : ''} scheduled)`
      : ' (no appointments scheduled)';
    const contextQuery = `Summarize ${dayLabel}'s schedule${countClause}. How many appointments total, which departments are involved, and are there any conflicts or capacity concerns?`;
    setCalAIContextLabel(dayLabel);
    setCalAIOpen(true);
    runCalendarAI(contextQuery);
  }, [runCalendarAI]);

  // ── Right-click on appointment block ─────────
  const handleApptContextMenu = useCallback((e, appt) => {
    e.preventDefault();
    e.stopPropagation();
    const time     = appt.jsScheduled ? formatTime(appt.jsScheduled) : '';
    const services = (appt.services || [])
      .map((s) => (typeof s === 'string' ? s : s.serviceName || s.name))
      .filter(Boolean)
      .join(', ') || appt.primaryService || '';
    const contextQuery = `Tell me about this appointment: ${appt.petName || 'Unknown'} (${appt.petSpecies || '?'}) — Owner: ${appt.ownerName || '?'} — Services: ${services} — ${time} — Status: ${appt.status}. What should staff prepare? Any scheduling considerations?`;

    setCalAIContextLabel(`${appt.petName || 'Unknown'} · ${services || 'No service'} · ${time}`);
    setCalAIOpen(true);
    runCalendarAI(contextQuery);
  }, [runCalendarAI]);

  // ── Right-click on empty slot ─────────────────
  const handleEmptySlotContextMenu = useCallback((dateStr, hour) => {
    const dayLabel  = new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const timeLabel = formatHourLabel(hour);
    const contextQuery = `What can I schedule at ${timeLabel} on ${dayLabel} (${dateStr})? Check department capacity, staff availability, and suggest suitable services.`;

    setCalAIContextLabel(`${dayLabel} · ${timeLabel}`);
    setCalAIOpen(true);
    runCalendarAI(contextQuery);
  }, [runCalendarAI]);

  // ── Keyboard navigation ──────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowLeft')  { handlePrev(); return; }
      if (e.key === 'ArrowRight') { handleNext(); return; }
      if (e.key === 't' || e.key === 'T') { handleToday(); return; }
      if (e.key === 'w' || e.key === 'W') { setView('week'); return; }
      if (e.key === 'm' || e.key === 'M') { setView('month'); return; }
      if (e.key === 'a' || e.key === 'A') { setCalAIOpen((prev) => !prev); }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, handleToday]);

  // ── Hover popover ────────────────────────────
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const [hoverAppt,   setHoverAppt]   = useState(null);
  const hoverEnterTimer = useRef(null);
  const hoverLeaveTimer = useRef(null);

  const handleApptHoverEnter = useCallback((e, appt) => {
    clearTimeout(hoverLeaveTimer.current);
    const el = e.currentTarget;
    hoverEnterTimer.current = setTimeout(() => {
      setHoverAnchor(el);
      setHoverAppt(appt);
    }, 300);
  }, []);

  const handleApptHoverLeave = useCallback(() => {
    clearTimeout(hoverEnterTimer.current);
    hoverLeaveTimer.current = setTimeout(() => {
      setHoverAnchor(null);
      setHoverAppt(null);
    }, 200);
  }, []);

  const handleHoverPopoverEnter = useCallback(() => {
    clearTimeout(hoverLeaveTimer.current);
  }, []);

  const handleHoverPopoverLeave = useCallback(() => {
    hoverLeaveTimer.current = setTimeout(() => {
      setHoverAnchor(null);
      setHoverAppt(null);
    }, 200);
  }, []);

  // ── Click popover ────────────────────────────
  const [clickAnchor, setClickAnchor] = useState(null);
  const [clickAppt,   setClickAppt]   = useState(null);

  const handleApptClick = useCallback((e, appt) => {
    clearTimeout(hoverEnterTimer.current);
    clearTimeout(hoverLeaveTimer.current);
    setHoverAnchor(null);
    setHoverAppt(null);
    setClickAnchor(e.currentTarget);
    setClickAppt(appt);
  }, []);

  const closeClickPopover = useCallback(() => {
    setClickAnchor(null);
    setClickAppt(null);
  }, []);

  // ── Modal state ──────────────────────────────
  const [selectedRow,        setSelectedRow]        = useState(null);
  const [openCW,             setOpenCW]             = useState(false);
  const [openPOS,            setOpenPOS]            = useState(false);
  const [openAssign,         setOpenAssign]         = useState(false);
  const [openDispenseVerify, setOpenDispenseVerify] = useState(false);
  const [openRevert,         setOpenRevert]         = useState(false);
  const [revertReason,       setRevertReason]       = useState('');

  // Helpers to open each modal from click popover.
  const openModal = useCallback((setter, appt) => {
    closeClickPopover();
    setSelectedRow(appt);
    setter(true);
  }, [closeClickPopover]);

  // Status change from click popover.
  const handleStatusAction = useCallback(async (appt, newStatus) => {
    closeClickPopover();
    try {
      await changeStatus(appt, newStatus, settings);
      refresh();
      showToast(`Status updated to ${newStatus}.`);
    } catch (err) {
      console.error('[Calendar.handleStatusAction]:', err.message);
      showToast(err.message, 'error');
    }
  }, [closeClickPopover, changeStatus, settings, refresh, showToast]);

  // Revert submission.
  const handleRevertSubmit = useCallback(async () => {
    if (!revertReason.trim()) return;
    try {
      await revertStatus({ ...selectedRow, revertReason });
      refresh();
      showToast('Status reverted successfully.');
    } catch (err) {
      console.error('[Calendar.handleRevertSubmit]:', err.message);
      showToast(err.message, 'error');
    } finally {
      setOpenRevert(false);
      setRevertReason('');
      setSelectedRow(null);
    }
  }, [revertReason, selectedRow, revertStatus, refresh, showToast]);

  // Builds the primary action button for the click popover.
  const renderActionButton = (appt) => {
    if (!appt) return null;
    const status = (appt.status || '').toLowerCase();

    if (status === 'pending') {
      return (
        <Button
          variant="contained"
          size="small"
          startIcon={<CheckCircleIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnActionSx, bgcolor: '#2E7D32' }}
          onClick={() => handleStatusAction(appt, 'confirmed')}
        >
          Accept
        </Button>
      );
    }

    if (status === 'confirmed') {
      return (
        <Button
          variant="contained"
          size="small"
          startIcon={<HowToRegIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnActionSx, bgcolor: '#1976D2' }}
          onClick={() => openModal(setOpenAssign, appt)}
        >
          Check In
        </Button>
      );
    }

    if (status === 'arrived') {
      return (
        <Button
          variant="contained"
          size="small"
          sx={{ ...btnActionSx, bgcolor: COLORS.accent }}
          onClick={() => handleStatusAction(appt, 'in-consult')}
        >
          Start Consult
        </Button>
      );
    }

    if (['in-consult', 'confined', 'on-hold'].includes(status)) {
      return (
        <Button
          variant="contained"
          size="small"
          startIcon={<AutoFixHighIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnActionSx, bgcolor: '#006064' }}
          onClick={() => openModal(setOpenCW, appt)}
        >
          Workspace
        </Button>
      );
    }

    if (status === 'dispensing') {
      return (
        <Button
          variant="contained"
          size="small"
          startIcon={<LocalHospitalIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnActionSx, bgcolor: '#C62828' }}
          onClick={() => openModal(setOpenDispenseVerify, appt)}
        >
          Verify
        </Button>
      );
    }

    if (status === 'billing') {
      return (
        <Button
          variant="contained"
          size="small"
          startIcon={<PaidIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnActionSx, bgcolor: '#FF8F00' }}
          onClick={() => openModal(setOpenPOS, appt)}
        >
          Checkout
        </Button>
      );
    }

    if (TERMINAL_STATUSES.has(status) && appt.statusHistory?.length > 0) {
      return (
        <Button
          variant="outlined"
          size="small"
          startIcon={<UndoIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnActionSx, color: '#D32F2F', borderColor: '#D32F2F' }}
          onClick={() => openModal(setOpenRevert, appt)}
        >
          Revert
        </Button>
      );
    }

    return null;
  };

  // ── Empty slot click (WalkInModal) ───────────
  const [openWalkIn,       setOpenWalkIn]       = useState(false);
  const [walkInPrefillDate, setWalkInPrefillDate] = useState(null);
  const [walkInPrefillTime, setWalkInPrefillTime] = useState(null);

  const handleEmptySlotClick = useCallback((dateStr, hour) => {
    setWalkInPrefillDate(dateStr);
    setWalkInPrefillTime(hour);
    setOpenWalkIn(true);
  }, []);

  // ─────────────────────────────────────────────
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: COLORS.surface,
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
      {/* ── HEADER ──────────────────────────────── */}
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1.5,
          bgcolor: COLORS.cardBg,
          borderBottom: `2px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        {/* Row 1: Title + navigation + view toggle */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          {/* Page title */}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              sx={{
                ...TYPE.heading,
                textTransform: 'uppercase',
                color: COLORS.accent,
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}
            >
              CALENDAR
            </Typography>
            <Typography
              sx={{
                ...TYPE.meta,
                color: COLORS.textSecondary,
                mt: 0.25,
              }}
            >
              {dateLabel}
            </Typography>
          </Box>

          {/* Date navigation */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <IconButton
              size="small"
              onClick={handlePrev}
              sx={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 0,
                '&:hover': { bgcolor: COLORS.surfaceHover },
              }}
            >
              <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>

            <Button
              variant="outlined"
              size="small"
              onClick={handleToday}
              disabled={isTodayVisible}
              sx={{
                borderRadius: 0,
                borderColor: COLORS.sky,
                color: COLORS.sky,
                fontWeight: 700,
                fontSize: '0.7rem',
                px: 1.5,
                textTransform: 'uppercase',
                '&:hover': { borderColor: COLORS.skyHover, bgcolor: `${COLORS.sky}11` },
                '&.Mui-disabled': { borderColor: COLORS.border, color: COLORS.textMuted },
              }}
            >
              Today
            </Button>

            <IconButton
              size="small"
              onClick={handleNext}
              sx={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 0,
                '&:hover': { bgcolor: COLORS.surfaceHover },
              }}
            >
              <ArrowForwardIosIcon fontSize="small" />
            </IconButton>
          </Stack>

          {/* View toggle tabs */}
          <Tabs
            value={view}
            onChange={(_, v) => v && setView(v)}
            textColor="inherit"
            TabIndicatorProps={{
              style: { backgroundColor: COLORS.sky, height: 3 },
            }}
            sx={{
              minHeight: 36,
              border: `1px solid ${COLORS.border}`,
              '& .MuiTab-root': {
                borderRadius: 0,
                minHeight: 36,
                fontWeight: 700,
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: COLORS.textSecondary,
                px: 2,
                '&.Mui-selected': { color: COLORS.sky },
              },
            }}
          >
            <Tab value="week"  label="Week"  />
            <Tab value="month" label="Month" />
          </Tabs>

          {/* Refresh */}
          <IconButton
            size="small"
            onClick={refresh}
            disabled={loading}
            title="Refresh appointments"
            sx={{
              border: `1px solid ${COLORS.border}`,
              borderRadius: 0,
              '&:hover': { bgcolor: COLORS.surfaceHover },
            }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>

          {/* Ask AI button — visible only when LLM is enabled */}
          {llmConfig.enabled && (
            <Button
              variant="contained"
              size="small"
              startIcon={<PsychologyIcon sx={{ fontSize: '16px !important' }} />}
              onClick={() => setCalAIOpen((prev) => !prev)}
              sx={{
                borderRadius: 0,
                bgcolor: calAIOpen ? COLORS.skyHover : COLORS.sky,
                fontWeight: 900,
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                px: 2,
                '&:hover': { bgcolor: COLORS.skyHover },
              }}
            >
              {calAIOpen ? 'Close AI' : 'Ask AI'}
            </Button>
          )}
        </Box>

        {/* Row 2: Department filter chips + lanes toggle */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mt: 1.5,
            flexWrap: 'wrap',
          }}
        >
          {departments.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ flexGrow: 1 }}>
              <Chip
                label="All"
                size="small"
                onClick={() => setDeptFilter(null)}
                sx={{
                  borderRadius: 0,
                  fontWeight: deptFilter === null ? 900 : 600,
                  bgcolor: deptFilter === null ? COLORS.sky : COLORS.cardBg,
                  color: deptFilter === null ? '#fff' : COLORS.textSecondary,
                  border: `2px solid ${deptFilter === null ? COLORS.skyHover : COLORS.border}`,
                  '&:hover': {
                    bgcolor: deptFilter === null ? COLORS.skyHover : COLORS.surfaceHover,
                  },
                }}
              />
              {departments.map((dept) => {
                const isActive  = deptFilter === dept.name;
                const deptColor = dept.color || COLORS.textMuted;
                return (
                  <Chip
                    key={dept.id}
                    size="small"
                    icon={
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          bgcolor: deptColor,
                          borderRadius: 0,
                          flexShrink: 0,
                          ml: '6px !important',
                        }}
                      />
                    }
                    label={dept.name}
                    onClick={() => setDeptFilter(isActive ? null : dept.name)}
                    sx={{
                      borderRadius: 0,
                      fontWeight: isActive ? 900 : 600,
                      bgcolor: isActive ? `${deptColor}22` : COLORS.cardBg,
                      color: isActive ? deptColor : COLORS.textSecondary,
                      border: `2px solid ${isActive ? deptColor : COLORS.border}`,
                      '&:hover': { bgcolor: `${deptColor}11` },
                    }}
                  />
                );
              })}
            </Stack>
          )}

          {/* Department lanes toggle — week view only */}
          {view === 'week' && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showLanes}
                  onChange={(e) => setShowLanes(e.target.checked)}
                  sx={{
                    '& .MuiSwitch-thumb': { borderRadius: 2 },
                    '& .MuiSwitch-track': { borderRadius: 2 },
                  }}
                />
              }
              label={
                <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, fontSize: '0.7rem' }}>
                  DEPT LANES
                </Typography>
              }
              sx={{ ml: 0, mr: 0, flexShrink: 0 }}
            />
          )}
        </Box>
      </Box>

      {/* ── BODY ──────────────────────────────────── */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex' }}>

        {/* Calendar grid area — shrinks when AI panel is open */}
        <Box sx={{ flex: 1, overflow: 'hidden', p: 2, minWidth: 0 }}>
          {/* Error state */}
          {error && !loading && (
            <Alert
              severity="error"
              sx={{ borderRadius: 0, mb: 2, border: `1px solid ${COLORS.danger}` }}
              action={
                <Button size="small" onClick={refresh} sx={{ borderRadius: 0, fontWeight: 700 }}>
                  RETRY
                </Button>
              }
            >
              Failed to load appointments: {error}
            </Alert>
          )}

          {/* Loading skeleton */}
          {loading && <CalendarSkeleton view={view} />}

          {/* Empty state */}
          {!loading && !error && appointments.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 10 }}>
              <CalendarMonthIcon sx={{ fontSize: 64, color: COLORS.textMuted, mb: 2 }} />
              <Typography sx={{ ...TYPE.heading, color: COLORS.textMuted }}>
                No appointments scheduled
              </Typography>
              <Typography sx={{ ...TYPE.body, color: COLORS.textMuted, mt: 1 }}>
                {view === 'week'
                  ? `No appointments found for ${dateLabel}.`
                  : `No appointments in ${dateLabel}.`}
              </Typography>
            </Box>
          )}

          {/* Calendar grid — render even when appointments.length === 0 (shows empty grid structure) */}
          {!loading && !error && (
            <>
              {view === 'week' && (
                <WeekView
                  weekStart={weekStart}
                  dayMap={dayMap}
                  getSlotCapacity={getSlotCapacity}
                  isClosedDate={isClosedDate}
                  isWorkingDay={isWorkingDay}
                  isLunchHour={isLunchHour}
                  departments={departments}
                  settings={settings}
                  showLanes={showLanes}
                  onHoverEnter={handleApptHoverEnter}
                  onHoverLeave={handleApptHoverLeave}
                  onAppointmentClick={handleApptClick}
                  onEmptySlotClick={handleEmptySlotClick}
                  onApptContextMenu={handleApptContextMenu}
                  onEmptySlotContextMenu={handleEmptySlotContextMenu}
                />
              )}

              {view === 'month' && (
                <MonthView
                  anchorDate={anchorDate}
                  dayMap={dayMap}
                  getSlotCapacity={getSlotCapacity}
                  isClosedDate={isClosedDate}
                  isWorkingDay={isWorkingDay}
                  settings={settings}
                  setView={setView}
                  setAnchorDate={setAnchorDate}
                  onDayContextMenu={handleDayContextMenu}
                />
              )}
            </>
          )}
        </Box>

        {/* AI Panel — collapsible right column (shrinks calendar, not overlay) */}
        {calAIOpen && (
          <Box sx={{
            width: { xs: 320, lg: 380 },
            flexShrink: 0,
            borderLeft: `2px solid ${COLORS.border}`,
            bgcolor: COLORS.surface,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <CalendarAIPanel
              loading={calAILoading}
              messages={calAIMessages}
              error={calAIError}
              followUpInput={calAIInput}
              onSendMessage={(text) => runCalendarAI(text)}
              onFollowUpChange={setCalAIInput}
              onReset={handleCalAIReset}
              onRetry={handleCalAIRetry}
              onClose={handleCalAIClose}
              onChipClick={handleChipClick}
              contextLabel={calAIContextLabel}
            />
          </Box>
        )}
      </Box>

      {/* ── HOVER POPOVER ─────────────────────────── */}
      <Popover
        open={Boolean(hoverAnchor)}
        anchorEl={hoverAnchor}
        onClose={() => { setHoverAnchor(null); setHoverAppt(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        disableRestoreFocus
        PaperProps={{
          onMouseEnter: handleHoverPopoverEnter,
          onMouseLeave: handleHoverPopoverLeave,
          sx: popoverPaperSx,
        }}
        sx={{ pointerEvents: 'none', '& .MuiPopover-paper': { pointerEvents: 'auto' } }}
      >
        {hoverAppt && (
          <AppointmentDetailCard appt={hoverAppt} departments={departments} />
        )}
      </Popover>

      {/* ── CLICK POPOVER ─────────────────────────── */}
      <Popover
        open={Boolean(clickAnchor)}
        anchorEl={clickAnchor}
        onClose={closeClickPopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: popoverPaperSx }}
      >
        {clickAppt && (
          <Box>
            <AppointmentDetailCard appt={clickAppt} departments={departments} />
            {/* Action button row */}
            <Box
              sx={{
                px: 1.5,
                pb: 1.25,
                pt: 0.75,
                borderTop: `1px solid ${COLORS.borderLight}`,
                display: 'flex',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              {renderActionButton(clickAppt)}
              <Button
                size="small"
                variant="outlined"
                sx={{
                  ...btnActionSx,
                  color: COLORS.textSecondary,
                  borderColor: COLORS.border,
                  ml: 'auto',
                }}
                onClick={closeClickPopover}
              >
                Close
              </Button>
            </Box>
          </Box>
        )}
      </Popover>

      {/* ── REVERT DIALOG ─────────────────────────── */}
      <Dialog
        open={openRevert}
        onClose={() => { setOpenRevert(false); setRevertReason(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 0,
            border: `2px solid ${COLORS.accent}`,
            bgcolor: COLORS.cardBg,
          },
        }}
      >
        <DialogTitle
          sx={{
            bgcolor: COLORS.cream,
            color: COLORS.brand,
            fontWeight: 900,
            fontSize: '1rem',
            textTransform: 'uppercase',
            letterSpacing: 1,
            borderBottom: `2px solid ${COLORS.accent}`,
            fontFamily: FONT,
          }}
        >
          Revert Status
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, bgcolor: COLORS.formBg }}>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 1.5 }}>
            Provide a reason for reverting{' '}
            <strong>{selectedRow?.petName}</strong>'s status. This is recorded in the audit log.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="REASON"
            multiline
            rows={2}
            value={revertReason}
            onChange={(e) => setRevertReason(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 0,
                '& fieldset': { border: `2px solid ${COLORS.accent}` },
              },
              '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 700 },
            }}
          />
        </DialogContent>
        <DialogActions
          sx={{
            p: 2,
            bgcolor: COLORS.cream,
            borderTop: `2px solid ${COLORS.accent}`,
          }}
        >
          <Button
            onClick={() => { setOpenRevert(false); setRevertReason(''); }}
            sx={{
              borderRadius: 0,
              fontWeight: 900,
              color: COLORS.accent,
              border: `1px solid ${COLORS.accent}`,
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!revertReason.trim()}
            onClick={handleRevertSubmit}
            sx={{
              borderRadius: 0,
              fontWeight: 900,
              bgcolor: '#D32F2F',
              '&:hover': { bgcolor: '#B71C1C' },
            }}
          >
            Revert
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── ASSIGN STAFF MODAL ─────────────────────── */}
      {openAssign && selectedRow && (
        <AssignStaffModal
          open={openAssign}
          onClose={() => {
            setOpenAssign(false);
            setSelectedRow(null);
            refresh();
            showToast('Check-in completed.');
          }}
          patient={selectedRow}
        />
      )}

      {/* ── CLINICAL WORKSPACE ─────────────────────── */}
      {openCW && selectedRow && (
        <ClinicalWorkspace
          open={openCW}
          onClose={() => {
            setOpenCW(false);
            setSelectedRow(null);
            refresh();
          }}
          patient={selectedRow}
          inventoryList={joinedInventory}
          servicesList={servicesList}
          departments={departments}
          vetsList={vets}
        />
      )}

      {/* ── POS MODAL ─────────────────────────────── */}
      {openPOS && selectedRow && (
        <POSModal
          open={openPOS}
          onClose={() => {
            setOpenPOS(false);
            setSelectedRow(null);
            refresh();
            showToast('Checkout complete.');
          }}
          patient={selectedRow}
          inventoryList={joinedInventory}
          servicesList={servicesList}
        />
      )}

      {/* ── DISPENSING VERIFICATION ─────────────────── */}
      {openDispenseVerify && selectedRow && (
        <DispensingVerificationDialog
          open={openDispenseVerify}
          onClose={() => {
            setOpenDispenseVerify(false);
            setSelectedRow(null);
          }}
          onVerified={() => {
            setOpenDispenseVerify(false);
            setSelectedRow(null);
            refresh();
            showToast('Dispensing verified.');
          }}
          patient={selectedRow}
          staffProfile={profile}
          clinicSettings={settings}
          inventoryList={joinedInventory}
        />
      )}

      {/* ── WALK-IN MODAL ─────────────────────────── */}
      <WalkInModal
        open={openWalkIn}
        onClose={() => {
          setOpenWalkIn(false);
          setWalkInPrefillDate(null);
          setWalkInPrefillTime(null);
          refresh();
        }}
        servicesList={servicesList}
        departments={departments}
        prefillDate={walkInPrefillDate}
        prefillTime={walkInPrefillTime}
      />

      {/* ── SNACKBAR ─────────────────────────────── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={closeToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={toast.severity}
          onClose={closeToast}
          sx={{ borderRadius: 0, border: `1px solid ${COLORS.border}` }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
