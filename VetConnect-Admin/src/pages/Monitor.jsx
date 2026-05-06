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

const getDeptColor = (serviceCategory, departments) => {
  if (!serviceCategory || !departments.length) return COLORS.textMuted;
  const match = departments.find(
    d => d.name?.toLowerCase() === serviceCategory.toLowerCase()
  );
  return match?.color || COLORS.textMuted;
};

const formatTicket = (prefix, number) =>
  `${prefix ? `${prefix}-` : ''}${String(number).padStart(3, '0')}`;

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

        setActiveServing(byDept);
        setArrivedList(arrived.sort((a, b) => (a.queueNumber || 0) - (b.queueNumber || 0)));
        setConfirmedList(confirmed.sort((a, b) => {
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

  const isQueuePaused = queueData.status === 'paused';
  const isQueueIdle   = Object.keys(activeServing).length === 0;
  const isServing     = !isQueuePaused && !isQueueIdle;

  const currentHour   = currentTime.getHours();
  const openHour      = clinicSettings.openHour  ?? 8;
  const closeHour     = clinicSettings.closeHour ?? 17;
  const isAfterHours  = currentHour >= closeHour || currentHour < openHour;

  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const activeDepts = Object.keys(activeServing);

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
            {isQueuePaused ? 'QUEUE PAUSED' : isServing ? 'NOW SERVING' : 'WELCOME'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccessTimeIcon sx={{ color: COLORS.textMuted, fontSize: 28 }} />
          <Typography sx={{ color: 'white', fontSize: '2rem', fontWeight: 700, fontFamily: FONT }}>
            {formattedTime}
          </Typography>
        </Box>
      </Box>

      {isAfterHours ? (
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
            Clinic closed.
          </Typography>
          <Typography sx={{ color: COLORS.textMuted, fontSize: '2rem', fontFamily: FONT }}>
            Opens tomorrow at {openHour}:00 AM
          </Typography>
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {isServing ? (
            <>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 3 }}>
                {activeDepts.map(dept => {
                  const appts = activeServing[dept];
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
                                icon={isEmergency ? <CampaignIcon /> : <PetsIcon />}
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
                            <Typography sx={{ color: COLORS.textSecondary, fontSize: '1rem', fontFamily: FONT }}>
                              {services}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Paper>
                  );
                })}
              </Box>

              {arrivedList.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ color: COLORS.textMuted, fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 2, mb: 1.5, fontFamily: FONT }}>
                    UP NEXT
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {arrivedList.slice(0, 5).map((appt, idx) => {
                      const waitMinutes = (idx + 1) * AVG_CONSULT_MINUTES;
                      return (
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
                            {idx === 0 ? 'NEXT' : `#${idx + 2}`}
                          </Typography>
                          <Typography sx={{ color: COLORS.ctaHover, fontWeight: 900, fontSize: '2rem', fontFamily: FONT }}>
                            {formatTicket(appt.ticketPrefix, appt.queueNumber)}
                          </Typography>
                          <Typography sx={{ color: COLORS.textMuted, fontSize: '0.8rem', fontFamily: FONT }}>
                            ~{waitMinutes} min
                          </Typography>
                        </Paper>
                      );
                    })}
                  </Box>
                </Box>
              )}

              {confirmedList.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography sx={{ color: COLORS.textMuted, fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 2, mb: 1.5, fontFamily: FONT }}>
                    EXPECTED
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {confirmedList.slice(0, 4).map(appt => {
                      const scheduled = appt.scheduledDate?.toDate?.();
                      const timeStr = scheduled
                        ? scheduled.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                        : null;
                      return (
                        <Typography key={appt.id} sx={{ color: COLORS.textMuted, fontSize: '1rem', fontFamily: FONT }}>
                          {formatTicket(appt.ticketPrefix, appt.queueNumber)}
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
                {isQueuePaused ? 'Queue is temporarily paused' : 'Waiting for next patient'}
              </Typography>
              <Typography sx={{ fontSize: '1.5rem', color: COLORS.textMuted, fontFamily: FONT }}>
                {isQueuePaused ? 'Service will resume shortly' : 'Please check in at the front desk'}
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
              Open until {clinicSettings.closeHour > 12 ? clinicSettings.closeHour - 12 : clinicSettings.closeHour}:00 {clinicSettings.closeHour >= 12 ? 'PM' : 'AM'}
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
