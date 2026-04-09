/**
 * 🧬 VETCONNECT CLINICAL FORENSIC ENGINE (PHASE 6.2)
 * Hardened Pulse-Aware Temporal Math
 */

/**
 * Calculates 6 clinical metrics by scanning the forensic pulse history.
 * @param {Array} pulse - The clinicalPulse array from the Firestore document.
 * @param {Object} settings - Global clinic settings (workingDays, openHour, closeHour).
 * @param {Date} createdAt - The absolute creation date of the record.
 * @param {Date} targetDate - The date of the shift we are auditing (Current Shift).
 * @returns {Object} { recordAge, opHoursAge, shiftQueue, totalQueue, shiftConsult, totalConsult }
 */
/**
 * 🧬 OPERATIONAL SALAMI-SLICER (Phase 6.7.1, 6.9 & 6.9.2)
 * Calculates Duration between two dates.
 * @param {string} mode - 'business' (Salami-Slicer active) or 'absolute' (24/7).
 * @param {boolean} shouldGate - If true, caps duration at midnight (Ghost-Protection).
 */
const getOperationalMinutes = (start, end, settings, shouldGate = false, segmentStart, mode = 'business') => {
  const openHour = settings.openHour || 8;
  const workingDays = settings.workingDays || [0, 1, 2, 3, 4, 5, 6];
  
  if (mode === 'absolute') {
    // 🧬 ABSOLUTE MEDICAL CLOCK: No slicing, no business hours, just wall-clock time.
    // However, we still respect the 'shouldGate' (Midnight Deterrent) for Ghost Records.
    let totalMins = 0;
    let curr = new Date(start);
    const originDayStr = (segmentStart || start).toDateString();

    while (curr < end) {
        if (shouldGate && curr.toDateString() !== originDayStr) break;
        
        const dayEnd = new Date(curr);
        dayEnd.setHours(23, 59, 59, 999);
        const segmentEnd = new Date(Math.min(dayEnd.getTime() + 1, end.getTime()));
        
        totalMins += Math.round((segmentEnd.getTime() - curr.getTime()) / 60000);
        
        curr = new Date(dayEnd.getTime() + 1);
        curr.setHours(0, 0, 0, 0);
    }
    return totalMins;
  }

  // 🧬 BUSINESS-HOUR CLOCK (Lobby & Active Shifts)
  let totalMins = 0;
  let curr = new Date(start);
  const originDayStr = (segmentStart || start).toDateString();
  
  while (curr < end) {
    const dayOfCurr = curr.toDateString();
    if (shouldGate && dayOfCurr !== originDayStr) break; 

    const dayEnd = new Date(curr);
    dayEnd.setHours(23, 59, 59, 999);
    const segmentEnd = new Date(Math.min(dayEnd.getTime() + 1, end.getTime()));
    
    if (workingDays.includes(curr.getDay())) {
      const morningOpen = new Date(curr);
      morningOpen.setHours(openHour, 0, 0, 0);
      
      // FIX (Finding 1): Remove the morning gate. Clock starts at event time.
      const effectiveStart = curr; 
      const diff = Math.round((segmentEnd.getTime() - effectiveStart.getTime()) / 60000);
      if (diff > 0) totalMins += diff;
    }
    
    curr = new Date(dayEnd.getTime() + 1);
    curr.setHours(0, 0, 0, 0);
  }
  return totalMins;
};

/**
 * Calculates 8 clinical metrics by scanning the forensic pulse history.
 */
export const calculatePulseMetrics = (pulse = [], settings = {}, createdAt, targetDate = new Date()) => {
  // 🧬 SYNCED FORENSIC HISTORY (PHASE 6.9.5)
  const history = [...pulse].sort((a, b) => {
    const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
    const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
    return da - db;
  });

  // 🧬 DISCHARGE ANCHOR (GHOST-AGING DEFENSE)
  // If the last status is terminal, stop the clock at that exact timestamp.
  const terminalStatuses = ['completed', 'done', 'cancelled', 'no-show', 'carried-over'];
  const lastEvent = history[history.length - 1];
  const lastStatus = (lastEvent?.toStatus || '').toLowerCase();
  const isResolved = terminalStatuses.includes(lastStatus);
  
  const now = isResolved 
    ? (lastEvent.timestamp?.toDate ? lastEvent.timestamp.toDate() : new Date(lastEvent.timestamp))
    : new Date();


  const clinicStart = settings.openHour || 8;
  const clinicEnd = settings.closeHour || 17;
  const workingDays = settings.workingDays || [0, 1, 2, 3, 4, 5, 6];

  // 1. RECORD AGE (Absolute)
  const inception = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt || now);
  const recordAgeMins = Math.max(0, Math.round((now - inception) / 60000));

  // 2. OPERATING HOURS AGE (Net)
  let opHoursMins = 0;
  let tempPointer = new Date(inception);
  while (tempPointer < now) {
    const day = tempPointer.getDay();
    const hour = tempPointer.getHours();
    if (workingDays.includes(day) && hour >= clinicStart && hour < clinicEnd) {
      opHoursMins++;
    }
    tempPointer.setMinutes(tempPointer.getMinutes() + 1);
  }

  // 3. PULSE MATH (Queue, Consult & Confined)
  const QUEUE_STATES = ['arrived'];
  const CONSULT_STATES = ['in-consult', 'dispensing', 'payment', 'on-hold'];
  const CONFINED_STATES = ['confined']; // 🧬 SEPARATE BUCKET (Pivot 6.9.1)

  let totalQueue = 0;
  let shiftQueue = 0;
  let totalConsult = 0;
  let shiftConsult = 0;
  let totalConfined = 0;
  let shiftConfined = 0;

  let lastValidStatus = 'pending';
  const voidedIds = new Set(history.map(e => e.correctedEventId).filter(Boolean));

  for (let i = 0; i < history.length; i++) {
    const currentEvent = history[i];
    const nextEvent = history[i+1];

    const startTime = currentEvent.timestamp?.toDate ? currentEvent.timestamp.toDate() : new Date(currentEvent.timestamp);
    const endTime = nextEvent 
      ? (nextEvent.timestamp?.toDate ? nextEvent.timestamp.toDate() : new Date(nextEvent.timestamp))
      : now;

    const currentId = currentEvent.eventId || currentEvent.id || currentEvent.timestamp?.seconds || i;
    const isVoided = voidedIds.has(currentId);
    const isMistake = !!currentEvent.correctedEventId || isVoided;
    const rawStatus = (currentEvent.toStatus || '').toLowerCase();
    const status = isMistake ? lastValidStatus : rawStatus;

    // 🧬 GHOST GATING (Lobby & Active Consults)
    const isGhostSegment = !nextEvent && (QUEUE_STATES.includes(status) || CONSULT_STATES.includes(status)) && startTime.toDateString() !== now.toDateString();

    // 🧬 DUAL-CLOCK ROUTING
    const clockMode = CONFINED_STATES.includes(status) ? 'absolute' : 'business';
    const operationalMins = getOperationalMinutes(startTime, endTime, settings, isGhostSegment, startTime, clockMode);
    
    if (!isMistake && rawStatus) lastValidStatus = rawStatus;

    // SHIFT OVERLAP CALC
    const dayStart = new Date(targetDate);
    dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23,59,59,999);

    const shiftOverlapStart = new Date(Math.max(startTime.getTime(), dayStart.getTime()));
    const shiftOverlapEnd = new Date(Math.min(endTime.getTime(), dayEnd.getTime()));
    
    let shiftMins = 0;
    if (shiftOverlapStart < shiftOverlapEnd) {
      shiftMins = getOperationalMinutes(shiftOverlapStart, shiftOverlapEnd, settings, isGhostSegment, startTime, clockMode);
    }

    if (QUEUE_STATES.includes(status)) {
      totalQueue += operationalMins;
      shiftQueue += shiftMins;
    } else if (CONSULT_STATES.includes(status)) {
      totalConsult += operationalMins;
      shiftConsult += shiftMins;
    } else if (CONFINED_STATES.includes(status)) {
      totalConfined += operationalMins;
      shiftConfined += shiftMins;
    }
  }

  return {
    recordAge: formatDuration(recordAgeMins),
    opHoursAge: formatDuration(opHoursMins),
    shiftQueue: formatDuration(shiftQueue),
    totalQueue: formatDuration(totalQueue),
    shiftConsult: formatDuration(shiftConsult),
    totalConsult: formatDuration(totalConsult),
    shiftConfined: formatDuration(shiftConfined),
    totalConfined: formatDuration(totalConfined),
    raw: { recordAgeMins, opHoursMins, shiftQueue, totalQueue, shiftConsult, totalConsult, shiftConfined, totalConfined }
  };
};


/**
 * Formats minutes into human-readable shorthand (e.g., 1D 2H 30M)
 */
export const formatDuration = (totalMins) => {
  if (totalMins <= 0) return "0M";
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}D`);
  if (hours > 0) parts.push(`${hours}H`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}M`);

  return parts.join(' ');
};

/**
 * 🧬 SMART SHIFT ANCHOR (Phase 5.1)
 * Calculates the target clinical date and dynamic UI label based on the shift pivot.
 * @param {number} offsetIndex - 0: Next Shift, 1: Following Shift, 2: Weekly
 * @param {number} openHour - The clinic's configured opening hour (Pivot).
 * @returns {Object} { dateStr, label }
 */
export const getSmartShiftDate = (offsetIndex, openHour = 8) => {
  const now = new Date();
  const currentHour = now.getHours();
  const isEarlyMorning = currentHour < openHour;

  // The "Clinical Anchor" is the day the work logically belongs to.
  // If it's 2:00 AM Tuesday, the anchor is Monday.
  let anchor = new Date();
  if (isEarlyMorning) {
    anchor.setDate(anchor.getDate() - 1);
  }

  // Define offsets from clinical anchor
  const offsets = [1, 2, 7];
  const target = new Date(anchor);
  target.setDate(target.getDate() + offsets[offsetIndex]);
  
  const dateStr = target.toISOString().split('T')[0];
  
  // Dynamic Labeling logic
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(); 
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  let label = "";
  if (offsetIndex === 0) {
    // Next shift
    label = (dateStr === todayStr) ? "TODAY" : "TOMO";
  } else if (offsetIndex === 1) {
    // Shift after next
    label = (dateStr === tomorrowStr) ? "TOMO" : "+2D";
  } else {
    // Standard weekly
    label = "+1W";
  }

  return { dateStr, label };
};
