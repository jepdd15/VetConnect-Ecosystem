import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Chip, CircularProgress } from '@mui/material';
import { doc, onSnapshot, collection, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

import PetsIcon from '@mui/icons-material/Pets';
import CampaignIcon from '@mui/icons-material/Campaign';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

import { COLORS, FONT } from '../theme/designTokens';
import { useClinicSettings } from '../hooks/useClinicSettings';

const AVG_CONSULT_MINUTES = 15;

// Display caps (T4.240 D7) — prevent silent clipping under high volume.
const ACTIVE_CAP   = 6; // NOW SERVING patient cards
const UP_NEXT_CAP  = 5; // arrived patients shown as cards
const EXPECTED_CAP = 6; // upcoming confirmed appointments shown

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getDeptColor = (serviceCategory, departments) => {
  if (!serviceCategory || !departments.length) return COLORS.textMuted;
  const match = departments.find(
    d => d.name?.toLowerCase() === serviceCategory.toLowerCase()
  );
  return match?.color || COLORS.textMuted;
};

const formatTicket = (prefix, number) => {
  // Confirmed/carried-over/re-routed appointments have no issued ticket yet
  // (queueNumber/ticketPrefix are null until check-in or staff assignment).
  // Guard against String(null) → "null" / String(undefined) → "undefined".
  if (number === null || number === undefined) return '—';
  return `${prefix ? `${prefix}-` : ''}${String(number).padStart(3, '0')}`;
};

const deriveTicketType = (ticketPrefix, ownerId) => {
  if (ticketPrefix === 'E') return 'EMERGENCY';
  if (
    ticketPrefix === 'W' ||
    ownerId === 'WALK_IN_USER' ||
    String(ownerId || '').includes('GUEST_')
  ) return 'WALK-IN';
  return 'APPOINTMENT';
};

const getStartOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
};

const getEndOfTodayDate = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

// Local (device = Manila) YYYY-MM-DD, matching how closedDates are stored/compared elsewhere.
const getLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Total scheduled minutes for an appointment (T4.240 D4).
// Sums each stored service's duration; per-service fallback 15 min; single-service fallback to appt-level fields.
const apptDurationMins = (appt) => {
  if (Array.isArray(appt.services) && appt.services.length) {
    return appt.services.reduce((sum, s) => sum + (Number(s.duration) || AVG_CONSULT_MINUTES), 0);
  }
  return Number(appt.serviceDuration || appt.duration) || AVG_CONSULT_MINUTES;
};

const fmtHour12 = (h) => {
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${period}`;
};

// "~ now" / "~35 min" — round wait up to the nearest 5 min (T4.240 D4).
const waitLabel = (mins) => {
  if (mins <= 0) return '~ now';
  return `~${Math.ceil(mins / 5) * 5} min`;
};

export default function Monitor() {
  const [queueData, setQueueData]       = useState(null);
  const [activeServing, setActiveServing] = useState({});
  const [arrivedList, setArrivedList]   = useState([]);
  const [confirmedList, setConfirmedList] = useState([]);
  const [departments, setDepartments]   = useState([]);
  const [listenerError, setListenerError] = useState(null);
  const [currentTime, setCurrentTime]   = useState(new Date());

  const clinicSettings = useClinicSettings();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'departments'),
      snap => setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'queue', 'daily_queue'),
      docSnap => {
        if (docSnap.exists()) setQueueData(docSnap.data());
      },
      error => {
        console.error('[Monitor] queue listener error:', error);
        setListenerError(error.message);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const startOfToday = getStartOfToday();
    const q = query(
      collection(db, 'appointments'),
      where('scheduledDate', '>=', startOfToday)
    );

    const unsub = onSnapshot(
      q,
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // 'confined' (hospitalized) is intentionally excluded — admitted patients are not
        // part of the lobby waiting flow and should not appear on the public board.
        const activeStatuses = new Set(['in-consult', 'dispensing', 'billing', 'on-hold']);

        const active = all.filter(a => activeStatuses.has(a.status));
        const arrived = all.filter(a => a.status === 'arrived');
        const confirmed = all.filter(a => a.status === 'confirmed');

        const byDept = {};
        active.forEach(appt => {
          const dept = appt.serviceCategory || 'General';
          if (!byDept[dept]) byDept[dept] = [];
          byDept[dept].push(appt);
        });
        Object.keys(byDept).forEach(dept => {
          byDept[dept].sort((a, b) => (a.queueNumber || 0) - (b.queueNumber || 0));
        });

        // T4.240 D1b: EXPECTED shows TODAY's upcoming confirmed appointments only.
        // (Active/arrived stay unbounded so carried-over patients aren't dropped.)
        const endOfToday = getEndOfTodayDate();
        const confirmedToday = confirmed.filter(a => {
          const sd = a.scheduledDate?.toDate?.();
          return sd && sd <= endOfToday;
        });

        setActiveServing(byDept);
        setArrivedList(arrived.sort((a, b) => (a.queueNumber || 0) - (b.queueNumber || 0)));
        setConfirmedList(confirmedToday.sort((a, b) => {
          const aTime = a.scheduledDate?.toDate?.()?.getTime() || 0;
          const bTime = b.scheduledDate?.toDate?.()?.getTime() || 0;
          return aTime - bTime;
        }));
      },
      error => {
        console.error('[Monitor] appointments listener error:', error);
      }
    );
    return () => unsub();
  }, []);

  if (listenerError) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', bgcolor: COLORS.monitorBg, gap: 2 }}>
        <Typography sx={{ color: COLORS.danger, fontSize: '2rem', fontWeight: 'bold', fontFamily: FONT }}>
          Unable to connect
        </Typography>
        <Typography sx={{ color: COLORS.textMuted, fontSize: '1.2rem', fontFamily: FONT }}>
          {listenerError}
        </Typography>
      </Box>
    );
  }

  if (!queueData) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: COLORS.monitorBg }}>
        <CircularProgress sx={{ color: COLORS.amber }} />
      </Box>
    );
  }

  // ── Derive operational state (T4.240) ────────────────────────────────────
  // Flatten active patients (tag dept) and apply the display cap.
  const activeFlat = Object.entries(activeServing).flatMap(
    ([dept, appts]) => appts.map(a => ({ ...a, _dept: dept }))
  );
  const activeShown = activeFlat.slice(0, ACTIVE_CAP);
  const activeOverflow = activeFlat.length - activeShown.length;
  const shownByDept = {};
  activeShown.forEach(a => {
    if (!shownByDept[a._dept]) shownByDept[a._dept] = [];
    shownByDept[a._dept].push(a);
  });

  const hasActive    = activeFlat.length > 0;
  const hasArrived   = arrivedList.length > 0;
  const hasConfirmed = confirmedList.length > 0;
  const hasOperational = hasActive || hasArrived || hasConfirmed;

  // D4: remaining time of the current consult (in-consult patients only — dispensing/
  // billing have finished their consult; on-hold is paused — none block the next call-up).
  const inConsult = activeFlat.filter(a => a.status === 'in-consult');
  const remainingMins = (appt) => {
    const dur = apptDurationMins(appt);
    const started = appt.timeStarted?.toDate?.();
    if (!started) return dur;
    const elapsed = (currentTime.getTime() - started.getTime()) / 60000;
    return Math.max(0, dur - elapsed);
  };
  const currentConsultRemaining = inConsult.length
    ? Math.min(...inConsult.map(remainingMins))
    : 0;

  // D4: sequential wait per arrived patient = remaining current consult + sum of durations ahead.
  let waitCursor = currentConsultRemaining;
  const arrivedWaits = arrivedList.map((appt) => {
    const w = waitCursor;
    waitCursor += apptDurationMins(appt);
    return w;
  });

  // D5 closed-day + D3 after-hours guard.
  const workingDays = clinicSettings.workingDays || [0, 1, 2, 3, 4, 5, 6];
  const closedDates = clinicSettings.closedDates || [];
  const todayStr    = getLocalDateStr(currentTime);
  const isClosedToday = !workingDays.includes(currentTime.getDay()) || closedDates.includes(todayStr);

  const currentHour = currentTime.getHours();
  const openHour    = clinicSettings.openHour  ?? 8;
  const closeHour   = clinicSettings.closeHour ?? 17;
  const isAfterHours = currentHour >= closeHour || currentHour < openHour;

  // D3: never show a "closed" screen while patients are still being served / waiting.
  const showClosedScreen = (isClosedToday || isAfterHours) && !hasActive && !hasArrived;

  // Next time the clinic opens, for the closed-screen subtitle.
  const findNextOpenLabel = () => {
    if (!isClosedToday && currentHour < openHour) return 'today';
    for (let i = 1; i <= 7; i++) {
      const d = new Date(currentTime);
      d.setDate(d.getDate() + i);
      if (workingDays.includes(d.getDay()) && !closedDates.includes(getLocalDateStr(d))) {
        return i === 1 ? 'tomorrow' : DAY_NAMES[d.getDay()];
      }
    }
    return 'soon';
  };

  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <Box sx={{
      height: '100vh',
      width: '100vw',
      bgcolor: COLORS.monitorBg,
      p: 4,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: FONT,
      overflow: 'hidden',
    }}>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <PetsIcon sx={{ fontSize: 52, color: COLORS.amber }} />
          <Typography sx={{ color: 'white', fontWeight: 900, fontSize: '2.8rem', letterSpacing: 3, textTransform: 'uppercase', fontFamily: FONT }}>
            {hasActive ? 'NOW SERVING' : 'WELCOME'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccessTimeIcon sx={{ color: COLORS.textMuted, fontSize: 28 }} />
          <Typography sx={{ color: 'white', fontSize: '2rem', fontWeight: 700, fontFamily: FONT }}>
            {formattedTime}
          </Typography>
        </Box>
      </Box>

      {showClosedScreen ? (
        <Box sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}>
          <PetsIcon sx={{ fontSize: 100, color: COLORS.textMuted }} />
          <Typography sx={{ color: 'white', fontSize: '3rem', fontWeight: 900, textAlign: 'center', fontFamily: FONT }}>
            {isClosedToday ? 'Closed today' : 'Clinic closed.'}
          </Typography>
          <Typography sx={{ color: COLORS.textMuted, fontSize: '2rem', fontFamily: FONT }}>
            {isClosedToday ? "We're open again" : 'Opens'} {findNextOpenLabel()} at {fmtHour12(openHour)}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {hasActive && (
            <>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: activeOverflow > 0 ? 1.5 : 3 }}>
                {Object.keys(shownByDept).map(dept => {
                  const appts = shownByDept[dept];
                  const deptColor = getDeptColor(dept, departments);
                  return (
                    <Paper
                      key={dept}
                      sx={{
                        flex: '1 1 300px',
                        minWidth: 300,
                        bgcolor: COLORS.cardBg,
                        borderRadius: 0,
                        border: `3px solid ${deptColor}`,
                        boxShadow: `6px 6px 0px ${COLORS.brand}`,
                        p: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `2px solid ${deptColor}`, pb: 1.5 }}>
                        <Box sx={{
                          width: 14,
                          height: 14,
                          bgcolor: deptColor,
                          border: `2px solid ${COLORS.brand}`,
                          flexShrink: 0,
                        }} />
                        <Typography sx={{ color: COLORS.textSecondary, fontWeight: 900, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: 2, fontFamily: FONT }}>
                          {dept}
                        </Typography>
                      </Box>

                      {appts.map(appt => {
                        const ticketType = deriveTicketType(appt.ticketPrefix, appt.ownerId);
                        const isEmergency = ticketType === 'EMERGENCY';
                        const services = Array.isArray(appt.services)
                          ? appt.services.map(s => s.serviceName || s.serviceType || 'Service').join(', ')
                          : (appt.primaryService || appt.serviceType || 'General Visit');

                        return (
                          <Box
                            key={appt.id}
                            sx={{
                              bgcolor: isEmergency ? COLORS.dangerSurface : COLORS.surfaceAlt,
                              border: `2px solid ${isEmergency ? COLORS.danger : COLORS.border}`,
                              borderRadius: 0,
                              p: 2,
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                              <Typography sx={{
                                fontSize: '4rem',
                                fontWeight: 900,
                                color: isEmergency ? COLORS.danger : COLORS.ctaHover,
                                lineHeight: 1,
                                fontFamily: FONT,
                              }}>
                                {formatTicket(appt.ticketPrefix, appt.queueNumber)}
                              </Typography>
                              <Chip
                                label={ticketType}
                                icon={isEmergency ? <CampaignIcon /> : undefined}
                                sx={{
                                  bgcolor: isEmergency ? COLORS.danger : COLORS.accent,
                                  color: 'white',
                                  fontWeight: 800,
                                  borderRadius: 0,
                                  fontSize: '0.85rem',
                                  '& .MuiChip-icon': { color: 'white' },
                                }}
                              />
                            </Box>
                            {appt.petName && (
                              <Typography sx={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: '1.4rem', fontFamily: FONT }}>
                                {appt.petName}
                              </Typography>
                            )}
                            {Array.isArray(appt.services) && appt.services.length >= 2 ? (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                {appt.services.map((svc, si) => {
                                  const st = svc.serviceStatus || 'pending';
                                  const icon = st === 'completed' ? '✓' : st === 'in-progress' ? '⏳' : '○';
                                  const chipColor = st === 'completed' ? COLORS.success
                                    : st === 'in-progress' ? COLORS.ctaHover
                                    : COLORS.textMuted;
                                  return (
                                    <Chip
                                      key={svc.id || si}
                                      label={`${icon} ${svc.serviceName || svc.name || 'Service'}`}
                                      size="small"
                                      sx={{
                                        bgcolor: 'transparent',
                                        border: `2px solid ${chipColor}`,
                                        color: chipColor,
                                        fontWeight: 800,
                                        borderRadius: 0,
                                        fontSize: '0.75rem',
                                        fontFamily: FONT,
                                      }}
                                    />
                                  );
                                })}
                              </Box>
                            ) : (
                              <Typography sx={{ color: COLORS.textSecondary, fontSize: '1rem', fontFamily: FONT }}>
                                {services}
                              </Typography>
                            )}
                          </Box>
                        );
                      })}
                    </Paper>
                  );
                })}
              </Box>

              {activeOverflow > 0 && (
                <Typography sx={{ color: COLORS.textMuted, fontWeight: 800, fontSize: '1rem', mb: 3, fontFamily: FONT }}>
                  + {activeOverflow} more in progress
                </Typography>
              )}
            </>
          )}

          {hasOperational ? (
            <>
              {hasArrived && (
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ color: COLORS.textMuted, fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 2, mb: 1.5, fontFamily: FONT }}>
                    UP NEXT
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    {arrivedList.slice(0, UP_NEXT_CAP).map((appt, idx) => (
                      <Paper
                        key={appt.id}
                        sx={{
                          bgcolor: COLORS.cardBg,
                          border: `2px solid ${getDeptColor(appt.serviceCategory, departments)}`,
                          borderRadius: 0,
                          boxShadow: `3px 3px 0px ${COLORS.brand}`,
                          px: 2.5,
                          py: 1.5,
                          minWidth: 150,
                          opacity: 1 - idx * 0.12,
                        }}
                      >
                        <Typography sx={{ color: COLORS.textMuted, fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONT }}>
                          {idx === 0 ? 'NEXT' : `#${idx + 1}`}
                        </Typography>
                        <Typography sx={{ color: COLORS.ctaHover, fontWeight: 900, fontSize: '2rem', fontFamily: FONT }}>
                          {formatTicket(appt.ticketPrefix, appt.queueNumber)}
                        </Typography>
                        <Typography sx={{ color: COLORS.textMuted, fontSize: '0.8rem', fontFamily: FONT }}>
                          {waitLabel(arrivedWaits[idx])}
                        </Typography>
                      </Paper>
                    ))}
                    {arrivedList.length > UP_NEXT_CAP && (
                      <Typography sx={{ color: COLORS.textMuted, fontWeight: 800, fontSize: '1rem', fontFamily: FONT }}>
                        + {arrivedList.length - UP_NEXT_CAP} more waiting
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}

              {hasConfirmed && (
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ color: COLORS.textMuted, fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 2, mb: 1.5, fontFamily: FONT }}>
                    EXPECTED
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {confirmedList.slice(0, EXPECTED_CAP).map(appt => {
                      const scheduled = appt.scheduledDate?.toDate?.();
                      const timeStr = scheduled
                        ? scheduled.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                        : null;
                      return (
                        <Typography key={appt.id} sx={{ color: COLORS.textMuted, fontSize: '1rem', fontFamily: FONT }}>
                          {appt.petName || 'Pet'}
                          {timeStr ? ` — ${timeStr}` : ''}
                        </Typography>
                      );
                    })}
                  </Box>
                </Box>
              )}

              <Typography sx={{ color: 'white', fontSize: '1.2rem', fontFamily: FONT }}>
                {arrivedList.length} patient{arrivedList.length !== 1 ? 's' : ''} waiting
              </Typography>
            </>
          ) : (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <PetsIcon sx={{ fontSize: 120, color: COLORS.textMuted }} />
              <Typography sx={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', fontFamily: FONT }}>
                Waiting for next patient
              </Typography>
              <Typography sx={{ fontSize: '1.5rem', color: COLORS.textMuted, fontFamily: FONT }}>
                Please check in at the front desk
              </Typography>
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mt: 2, pt: 2, borderTop: `1px solid ${COLORS.accent}` }}>
        <Typography sx={{ color: COLORS.textMuted, fontSize: '1.2rem', fontWeight: 600, fontFamily: FONT }}>
          {clinicSettings.clinicName}
        </Typography>
        {clinicSettings.closeHour && (
          <>
            <Typography sx={{ color: COLORS.textMuted, fontSize: '1.2rem' }}>&bull;</Typography>
            <Typography sx={{ color: COLORS.textMuted, fontSize: '1.2rem', fontFamily: FONT }}>
              Open until {fmtHour12(clinicSettings.closeHour)}
            </Typography>
          </>
        )}
        {clinicSettings.clinicPhone && (
          <>
            <Typography sx={{ color: COLORS.textMuted, fontSize: '1.2rem' }}>&bull;</Typography>
            <Typography sx={{ color: COLORS.textMuted, fontSize: '1.2rem', fontFamily: FONT }}>
              {clinicSettings.clinicPhone}
            </Typography>
          </>
        )}
      </Box>

    </Box>
  );
}
