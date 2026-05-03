// Lobby TV display — shows the currently-serving queue ticket with status awareness,
// upcoming queue preview, and full neubrutalism design token compliance.

import React, { useEffect, useState, useRef } from 'react';
import { Box, Typography, Card, Chip, CircularProgress, Fade } from '@mui/material';
import { doc, onSnapshot, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';

import PetsIcon from '@mui/icons-material/Pets';
import CampaignIcon from '@mui/icons-material/Campaign';

import { COLORS } from '../theme/designTokens';
import { useClinicSettings } from '../hooks/useClinicSettings';

export default function Monitor() {
  const [queueData, setQueueData] = useState(null);
  const [currentTicket, setCurrentTicket] = useState(null);
  const [upcomingTickets, setUpcomingTickets] = useState([]);
  const [listenerError, setListenerError] = useState(null);
  const [departments, setDepartments] = useState([]);   // T4.134: department color config
  const fetchSeqRef = useRef(0);
  const clinicSettings = useClinicSettings();

  // One-shot fetch for department colors — T4.134 Phase 7.1
  // Department config is static enough that a real-time listener isn't needed here.
  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const snap = await getDocs(collection(db, 'departments'));
        setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        // Department colors are cosmetic — fail silently rather than break the display
      }
    };
    fetchDepts();
  }, []);

  // Listen to the queue counter; drives all downstream fetches
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'queue', 'daily_queue'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setQueueData(data);
          fetchTicketDetails(data.currentServing);
          fetchUpcoming(data.currentServing);
        }
      },
      (error) => {
        console.error('[Monitor] queue listener error:', error);
        setListenerError(error.message);
      }
    );
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Fetch the appointment record for the currently-serving ticket number.
   * Race-condition safe: a useRef sequence counter discards results from
   * fetches that were superseded before they resolved.
   */
  const fetchTicketDetails = async (number) => {
    const seq = ++fetchSeqRef.current;

    if (!number) {
      setCurrentTicket(null);
      return;
    }

    try {
      const q = query(
        collection(db, 'appointments'),
        where('queueNumber', '==', number)
      );
      const snap = await getDocs(q);

      // Staleness guard: discard if a newer fetch was issued while this one resolved
      if (seq !== fetchSeqRef.current) return;

      // Client-side date filter prevents cross-day queue number collisions
      // (queue numbers reset nightly; old appointments retain their numbers)
      const today = new Date().toISOString().slice(0, 10);
      const match = snap.docs.find((d) => {
        const scheduledDate = d.data().scheduledDate?.toDate?.();
        return scheduledDate && scheduledDate.toISOString().slice(0, 10) === today;
      });
      setCurrentTicket(match ? match.data() : null);
    } catch (error) {
      console.error('[Monitor] ticket fetch error:', error);
      if (seq === fetchSeqRef.current) setCurrentTicket(null);
    }
  };

  /**
   * Fetch the next 1-3 arrived appointments waiting in the queue.
   * Advisory display only — not race-critical, errors don't affect main display.
   * Requires a Firestore composite index on (status, queueNumber asc).
   * If missing, Firestore will log an index creation URL in the console.
   */
  const fetchUpcoming = async (currentNum) => {
    if (!currentNum) {
      setUpcomingTickets([]);
      return;
    }

    try {
      const q = query(
        collection(db, 'appointments'),
        where('status', '==', 'arrived'),
        where('queueNumber', '>', currentNum),
        orderBy('queueNumber', 'asc'),
        limit(3)
      );
      const snap = await getDocs(q);
      const today = new Date().toISOString().slice(0, 10);
      const filtered = snap.docs
        .filter(d => {
          const sd = d.data().scheduledDate?.toDate?.();
          return sd && sd.toISOString().slice(0, 10) === today;
        })
        .map(d => ({ id: d.id, ...d.data() }));
      setUpcomingTickets(filtered);
    } catch (error) {
      console.error('[Monitor] upcoming fetch error:', error);
      setUpcomingTickets([]);
    }
  };

  // ── Loading / error state ───────────────────────────────────────
  if (listenerError) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', bgcolor: COLORS.monitorBg, gap: 2 }}>
        <Typography sx={{ color: COLORS.danger, fontSize: '2rem', fontWeight: 'bold' }}>Unable to connect</Typography>
        <Typography sx={{ color: COLORS.textMuted, fontSize: '1.2rem' }}>{listenerError}</Typography>
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

  // ── Queue state derivation ─────────────────────────────────────
  // If status is undefined (old queue doc without the field), isQueuePaused is false — intentional.
  const isQueuePaused = queueData.status === 'paused';
  const isQueueIdle   = !queueData.currentServing;
  const isServing     = !isQueuePaused && !isQueueIdle;

  // ── Ticket semantics ───────────────────────────────────────────
  // Emergency: any ticket with priority='high' OR ticketPrefix='E'
  const isEmergency = currentTicket && (
    currentTicket.priority === 'high' || currentTicket.ticketPrefix === 'E'
  );
  // Walk-in: ownerId is sentinel value or GUEST_ prefix, or prefix='W'
  const isWalkIn = currentTicket && (
    currentTicket.ownerId === 'WALK_IN_USER' ||
    String(currentTicket.ownerId || '').includes('GUEST_') ||
    currentTicket.ticketPrefix === 'W'
  );

  const bgColor   = isEmergency ? COLORS.dangerSurface : COLORS.cardBg;
  const textColor = isEmergency ? COLORS.danger        : COLORS.textPrimary;

  // ── Formatted ticket number (prefix-dash-padded: W-005, E-003, A-007) ──
  const ticketDisplay = [
    queueData.currentPrefix ? `${queueData.currentPrefix}-` : '',
    String(queueData.currentServing || 0).padStart(3, '0'),
  ].join('');

  /**
   * Resolves the Firestore department color for a given serviceCategory string.
   * Case-insensitive. Falls back to COLORS.textMuted when the department is not
   * found or the departments list hasn't loaded yet.
   * @param {string} serviceCategory
   * @returns {string} hex color
   */
  const getDeptColor = (serviceCategory) => {
    if (!serviceCategory || !departments.length) return COLORS.textMuted;
    const match = departments.find(
      d => d.name?.toLowerCase() === serviceCategory.toLowerCase()
    );
    return match?.color || COLORS.textMuted;
  };

  return (
    <Box sx={{
      height: '100vh',
      width: '100vw',
      bgcolor: COLORS.monitorBg,
      p: 4,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>

      {/* HEADER — state-aware title */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <PetsIcon sx={{ fontSize: 60, color: COLORS.amber }} />
        <Typography variant="h2" sx={{ color: 'white', fontWeight: 'bold', letterSpacing: 2 }}>
          {isQueuePaused ? 'QUEUE PAUSED' : isServing ? 'NOW SERVING' : 'WELCOME'}
        </Typography>
      </Box>

      {/* MAIN DISPLAY CARD */}
      <Card sx={{
        width: '80%',
        maxHeight: '65%',
        bgcolor: bgColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 0,
        border: `3px solid ${COLORS.brand}`,
        boxShadow: `8px 8px 0px ${COLORS.brand}`,
        py: 4,
      }}>

        {isServing ? (
          <>
            {/* TICKET NUMBER — fade-in on mount; key change remounts (no exit animation) */}
            <Fade in={true} timeout={600} key={ticketDisplay}>
              <Typography sx={{ fontSize: '12rem', fontWeight: 'bold', color: COLORS.ctaHover, lineHeight: 1 }}>
                {ticketDisplay}
              </Typography>
            </Fade>

            {/* TICKET METADATA */}
            {currentTicket ? (
              <>
                {/* Service name — walk-ins use primaryService, pre-booked use serviceType */}
                <Typography sx={{ mt: 2, mb: 1, fontWeight: 'bold', color: textColor, fontSize: '3rem' }}>
                  {currentTicket.primaryService || currentTicket.serviceType || 'General Visit'}
                </Typography>

                {/* Department badge — T4.134 Phase 7.3 */}
                {currentTicket.serviceCategory && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Box sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: getDeptColor(currentTicket.serviceCategory),
                      border: `2px solid ${COLORS.brand}`,
                      flexShrink: 0,
                    }} />
                    <Typography sx={{
                      fontSize: '2rem',
                      fontWeight: 900,
                      color: COLORS.textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: 2,
                    }}>
                      {currentTicket.serviceCategory}
                    </Typography>
                  </Box>
                )}

                {/* Ticket type chip — 2-tier: EMERGENCY (red) or WALK-IN / APPOINTMENT (neutral) */}
                <Chip
                  label={isEmergency ? 'EMERGENCY' : (isWalkIn ? 'WALK-IN' : 'APPOINTMENT')}
                  icon={isEmergency ? <CampaignIcon /> : <PetsIcon />}
                  sx={{
                    fontSize: '2rem',
                    height: 70,
                    px: 3,
                    bgcolor: isEmergency ? COLORS.danger : COLORS.accent,
                    color: 'white',
                    fontWeight: 'bold',
                    borderRadius: 0,
                    '& .MuiChip-icon': { color: 'white', fontSize: '2rem' },
                  }}
                />

                <Typography sx={{ mt: 4, color: COLORS.textSecondary, fontSize: '1.8rem' }}>
                  Please proceed to Consultation Room
                </Typography>
              </>
            ) : (
              // Ticket number is set but metadata hasn't resolved yet
              <Typography sx={{ color: COLORS.textMuted, fontSize: '2.5rem', mt: 2 }}>
                Preparing ticket details...
              </Typography>
            )}
          </>
        ) : (
          // Queue is paused or idle — show informational placeholder
          <Box sx={{ textAlign: 'center', p: 6 }}>
            <PetsIcon sx={{ fontSize: 120, color: COLORS.textMuted, mb: 2 }} />
            <Typography sx={{ fontSize: '2.5rem', fontWeight: 'bold', color: COLORS.textPrimary }}>
              {isQueuePaused ? 'Queue is temporarily paused' : 'Waiting for next patient'}
            </Typography>
            <Typography sx={{ fontSize: '1.5rem', color: COLORS.textSecondary, mt: 2 }}>
              {isQueuePaused ? 'Service will resume shortly' : 'Please check in at the front desk'}
            </Typography>
          </Box>
        )}

      </Card>

      {/* UPCOMING QUEUE PREVIEW — next 1-3 arrived tickets, grouped by department — T4.134 Phase 7.5 */}
      {isServing && upcomingTickets.length > 0 && (() => {
        // Group upcoming tickets by department for multi-lane clarity
        const byDept = {};
        upcomingTickets.forEach(t => {
          const dept = t.serviceCategory || 'General';
          if (!byDept[dept]) byDept[dept] = [];
          byDept[dept].push(t);
        });
        const deptKeys = Object.keys(byDept);

        return (
          <Box sx={{ display: 'flex', gap: 3, mt: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
            {deptKeys.map(dept => (
              <Box key={dept} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>

                {/* Department lane header — only rendered when multiple departments are present */}
                {deptKeys.length > 1 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: getDeptColor(dept),
                      border: `1.5px solid ${COLORS.brand}`,
                    }} />
                    <Typography sx={{
                      fontSize: '1rem',
                      fontWeight: 900,
                      color: COLORS.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}>
                      {dept}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 2 }}>
                  {byDept[dept].map((ticket, i) => (
                    <Box
                      key={ticket.id}
                      sx={{
                        bgcolor: COLORS.cardBg,
                        border: `2px solid ${getDeptColor(dept)}`,
                        boxShadow: `4px 4px 0px ${COLORS.brand}`,
                        borderRadius: 0,
                        px: 4,
                        py: 2,
                        textAlign: 'center',
                        minWidth: 160,
                        // Fade further cards slightly to convey distance in queue
                        opacity: 1 - (i * 0.15),
                      }}
                    >
                      <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        {i === 0 ? 'UP NEXT' : `+${i + 1}`}
                      </Typography>
                      <Typography sx={{ fontSize: '2.5rem', fontWeight: 'bold', color: COLORS.ctaHover }}>
                        {ticket.ticketPrefix ? `${ticket.ticketPrefix}-` : ''}
                        {String(ticket.queueNumber).padStart(3, '0')}
                      </Typography>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: COLORS.textSecondary }}>
                        {ticket.primaryService || ticket.serviceType || 'General Visit'}
                      </Typography>

                      {/* Department dot — T4.134 Phase 7.4 */}
                      {ticket.serviceCategory && (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8, mt: 0.5 }}>
                          <Box sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: getDeptColor(ticket.serviceCategory),
                            border: `1.5px solid ${COLORS.brand}`,
                          }} />
                          <Typography sx={{
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            color: COLORS.textMuted,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                          }}>
                            {ticket.serviceCategory}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>

              </Box>
            ))}
          </Box>
        );
      })()}

      {/* FOOTER — clinic name from settings */}
      <Typography sx={{ color: COLORS.textMuted, mt: 4, fontSize: '1.5rem', fontWeight: 600 }}>
        {clinicSettings.clinicName} &bull; Please wait for your number
      </Typography>

    </Box>
  );
}
