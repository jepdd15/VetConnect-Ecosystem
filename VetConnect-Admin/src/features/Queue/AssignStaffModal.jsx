import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Paper, Chip, Avatar, Alert,
  Divider, Stack, Popover, List, ListItem, Menu, MenuItem
} from '@mui/material';

// Icons
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import StarIcon from '@mui/icons-material/Star';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

import { doc, runTransaction, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useUser } from '../../context/UserContext';
import { STATUS, TERMINAL_STATUSES } from '../../utils/statusConstants';
import { makePulseEventId } from '../../utils/pulseUtils';
import { getTicketPrefix } from '../../utils/getTicketPrefix';

export default function AssignStaffModal({ open, onClose, patient, vetsList, activeAppointments, departments, mode = 'check-in', siblingAppointments = [] }) {
  const { profile, user } = useUser();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // THE BUFFER: Stores local changes before they hit the cloud!
  const [tempServices, setTempServices] = useState([]);

  // GROUP CHECK-IN: per-sibling service buffers (index matches siblingAppointments)
  const [siblingServices, setSiblingServices] = useState([]);

  // Toggle: true = check in ALL group members, false = individual only
  const [groupMode, setGroupMode] = useState(true);

  // --- DROPDOWN STATE ---
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeSvcIdx, setActiveSvcIdx] = useState(null); // null = BATCH Assign
  // activePetIdx: null = primary patient, 0..N-1 = sibling index
  const [activePetIdx, setActivePetIdx] = useState(null);
  const [sortBy, setSortBy] = useState('alpha'); // alpha | load

  useEffect(() => {
    if (open && patient) {
      const sortedServices = [...(patient.services || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setTempServices(sortedServices);
      setSiblingServices(
        (siblingAppointments || []).map(sib =>
          [...(sib.services || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        )
      );
      setGroupMode(true);
      setErrorMsg('');
    }
  }, [open, patient]); // siblingAppointments intentionally omitted — reset only on open/patient change

  // --- 🧬 TRIAGE ANALYTICS ENGINE ---
  const servicesCount = tempServices.length;
  const uniqueDeptsCount = [...new Set(tempServices.map(s => s.department))].length;

  const getMasterQualifiedStaff = () => {
    if (!tempServices || tempServices.length === 0) return [];
    const requiredDepts = [...new Set(tempServices.map(s => s.department))];
    return (vetsList || []).filter(vet =>
      requiredDepts.every(dept => vet.departments?.includes(dept))
    );
  };

  const masterStaff = getMasterQualifiedStaff();

  const getVetWorkload = (vetId) => {
    if (!activeAppointments) return 0;
    return activeAppointments.filter(a => a.assignedVetId === vetId).length;
  };

  // --- 🖋️ THE DYNAMIC SORTING PIPELINE ---
  const sortStaff = (list) => {
    return [...list].sort((a, b) => {
      if (sortBy === 'alpha') return a.fullName.localeCompare(b.fullName);
      return getVetWorkload(a.id) - getVetWorkload(b.id);
    });
  };

  const handleOpenMenu = (event, idx, petIdx = null) => {
    setAnchorEl(event.currentTarget);
    setActiveSvcIdx(idx);
    setActivePetIdx(petIdx);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
    setActiveSvcIdx(null);
    setActivePetIdx(null);
  };

  const handleSelectStaff = (vId, vName) => {
    if (activePetIdx !== null) {
      // Assigning staff to a sibling pet's service
      setSiblingServices(prev => {
        const updated = prev.map((services, i) => {
          if (i !== activePetIdx) return services;
          if (activeSvcIdx === null) {
            return services.map(s => ({ ...s, staffId: vId, staffName: vName }));
          }
          return services.map((s, si) =>
            si === activeSvcIdx ? { ...s, staffId: vId, staffName: vName } : s
          );
        });
        return updated;
      });
    } else {
      // Assigning staff to the primary patient's service
      if (activeSvcIdx === null) {
        setTempServices(prev => prev.map(s => ({ ...s, staffId: vId, staffName: vName })));
      } else {
        setTempServices(prev => prev.map((s, i) =>
          i === activeSvcIdx ? { ...s, staffId: vId, staffName: vName } : s
        ));
      }
    }
    handleCloseMenu();
  };

  const handleUnassignAll = () => {
    const cleared = tempServices.map(s => ({ ...s, staffId: null, staffName: 'Unassigned' }));
    setTempServices(cleared);
    if (groupMode) {
      setSiblingServices(prev =>
        prev.map(services => services.map(s => ({ ...s, staffId: null, staffName: 'Unassigned' })))
      );
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      if (patient.status === STATUS.CONFIRMED && mode === 'check-in') {
        // ── VALIDATION ────────────────────────────────────────────
        const allPrimaryAssigned = tempServices.every(s => s.staffId);
        if (!allPrimaryAssigned) {
          throw new Error("SECURITY BLOCK: All clinical services must have assigned personnel before check-in.");
        }

        const isGroupCheckIn = groupMode && siblingAppointments.length > 0;

        if (isGroupCheckIn) {
          // Validate sibling services too
          for (let i = 0; i < siblingAppointments.length; i++) {
            const sibSvcs = siblingServices[i] || [];
            if (sibSvcs.length > 0 && !sibSvcs.every(s => s.staffId)) {
              const sibName = siblingAppointments[i].petName || `Pet ${i + 2}`;
              throw new Error(`SECURITY BLOCK: All services for ${sibName} must be assigned before group check-in.`);
            }
          }
        }

        await runTransaction(db, async (transaction) => {
          const queueRef   = doc(db, "queue", "daily_queue");
          const primaryRef = doc(db, "appointments", patient.id);

          // Collect sibling refs to read atomically
          const siblingRefs = isGroupCheckIn
            ? siblingAppointments.map(sib => doc(db, "appointments", sib.id))
            : [];

          // Read all docs in one round-trip
          const reads = await Promise.all([
            transaction.get(primaryRef),
            transaction.get(queueRef),
            ...siblingRefs.map(ref => transaction.get(ref)),
          ]);

          const [primaryDoc, queueDoc, ...siblingDocs] = reads;

          if (!primaryDoc.exists()) throw new Error("Appointment not found. It may have been deleted.");

          const freshPrimaryStatus = primaryDoc.data().status;
          if (freshPrimaryStatus !== STATUS.CONFIRMED) {
            throw new Error(
              `CONCURRENT CONFLICT: This appointment's status is now '${freshPrimaryStatus}'. ` +
              `Another staff member may have already processed it.`
            );
          }

          // Validate sibling statuses — only check-in confirmed siblings
          for (let i = 0; i < siblingDocs.length; i++) {
            const sibDoc = siblingDocs[i];
            if (!sibDoc.exists()) continue;
            const sibStatus = sibDoc.data().status;
            if (sibStatus !== STATUS.CONFIRMED) {
              const sibName = siblingAppointments[i]?.petName || `Pet ${i + 2}`;
              throw new Error(
                `CONCURRENT CONFLICT: ${sibName} is already '${sibStatus}'. ` +
                `Check in the group individually or refresh the queue.`
              );
            }
          }

          // Increment queue counter ONCE — shared number for the entire visit group
          const sharedNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;
          const arrivedAt     = Timestamp.now();
          const staffSignature = profile?.fullName || user?.email || 'System/Admin';

          // ── WRITE QUEUE COUNTER ──────────────────────────────
          transaction.set(queueRef, { lastNumberIssued: sharedNumber }, { merge: true });

          // ── WRITE PRIMARY APPOINTMENT ────────────────────────
          const primaryPrimedServices = tempServices.map(s => ({ ...s, status: 'pending' }));
          const primaryPulseEvent = {
            eventId:    makePulseEventId('assign'),
            type:       'STATUS_CHANGE',
            fromStatus: STATUS.CONFIRMED,
            toStatus:   STATUS.ARRIVED,
            timestamp:  arrivedAt,
            staffId:    user?.uid || 'unknown',
            staffName:  staffSignature,
            note:       isGroupCheckIn
              ? `Group check-in (1/${siblingAppointments.length + 1}). Shared queue: ${sharedNumber}.`
              : 'Patient physically arrived and checked-in.',
          };

          transaction.update(primaryRef, {
            status:      STATUS.ARRIVED,
            queueNumber: sharedNumber,
            ticketPrefix: getTicketPrefix(patient),
            timeArrived: arrivedAt,
            services:    primaryPrimedServices,
            clinicalPulse: arrayUnion(primaryPulseEvent),
          });

          if (patient.petId) {
            transaction.update(doc(db, "pets", patient.petId), { lastVisit: arrivedAt });
          }

          // ── WRITE SIBLING APPOINTMENTS (shared queue number) ──
          siblingDocs.forEach((sibDoc, i) => {
            if (!sibDoc.exists()) return;
            const sib = siblingAppointments[i];
            const sibPrimedServices = (siblingServices[i] || sib.services || []).map(s => ({ ...s, status: 'pending' }));
            const sibPulseEvent = {
              eventId:    makePulseEventId('assign'),
              type:       'STATUS_CHANGE',
              fromStatus: STATUS.CONFIRMED,
              toStatus:   STATUS.ARRIVED,
              timestamp:  arrivedAt,
              staffId:    user?.uid || 'unknown',
              staffName:  staffSignature,
              note:       `Group check-in (${i + 2}/${siblingAppointments.length + 1}). Shared queue: ${sharedNumber}.`,
            };

            transaction.update(siblingRefs[i], {
              status:       STATUS.ARRIVED,
              queueNumber:  sharedNumber,
              ticketPrefix: getTicketPrefix(sib),
              timeArrived:  arrivedAt,
              services:     sibPrimedServices,
              clinicalPulse: arrayUnion(sibPulseEvent),
            });

            if (sib.petId) {
              transaction.update(doc(db, "pets", sib.petId), { lastVisit: arrivedAt });
            }
          });
        });
      } else {
        // PREP ONLY OR EXISTING PATIENT: Enforce assignment if they already arrived.
        // Wrapped in a transaction to guard against writes to terminal appointments.
        await runTransaction(db, async (transaction) => {
          const apptRef = doc(db, "appointments", patient.id);
          const apptDoc = await transaction.get(apptRef);

          if (!apptDoc.exists()) throw new Error("Appointment not found. It may have been deleted.");

          const freshStatus = apptDoc.data().status;

          // Block writes to cases that have already been fully resolved.
          if (TERMINAL_STATUSES.has(freshStatus)) {
            throw new Error(
              `CONCURRENT CONFLICT: This appointment is already '${freshStatus}' and can no longer be modified.`
            );
          }

          // Enforce full assignment on active (post-arrival) patients.
          if (freshStatus !== STATUS.CONFIRMED && freshStatus !== STATUS.PENDING) {
            const allAssigned = tempServices.every(s => s.staffId);
            if (!allAssigned) throw new Error("CLINICAL SAFETY: Cannot unassign personnel from an active patient.");
          }

          transaction.update(apptRef, { services: tempServices });
        });
      }
      onClose();
    } catch (e) {
      setErrorMsg("Failed to process assignment: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!patient) return null;

  const isCheckInAction = patient.status === 'confirmed' && mode === 'check-in';
  const BRAND_BROWN = '#3E2723';
  const isBundle = tempServices.length > 1;

  // Visit group state
  const isGroupCheckIn = isCheckInAction && groupMode && siblingAppointments.length > 0;
  const totalPetsInGroup = siblingAppointments.length + 1; // primary + siblings

  // --- UNITARY BRANDING LOGIC ---
  const singleSvc = !isBundle ? tempServices[0] : null;
  const dObj = singleSvc ? (departments || []).find(d => d.name === singleSvc.department) : null;
  const headerChipColor = isGroupCheckIn ? '#3ABEF9' : (isBundle ? BRAND_BROWN : (dObj?.color || BRAND_BROWN));
  const headerChipLabel = isGroupCheckIn
    ? `GROUP CHECK-IN (${totalPetsInGroup} PETS)`
    : (isBundle ? "SERVICE BUNDLE" : (singleSvc?.name?.toUpperCase() || "VISIT"));

  const allPrimaryAssigned = tempServices.every(s => s.staffId);
  const allSiblingsAssigned = siblingServices.every(svcs => svcs.length === 0 || svcs.every(s => s.staffId));
  const allAssigned = allPrimaryAssigned && (!isGroupCheckIn || allSiblingsAssigned);

  // Staff list used by the dropdown — depends on which pet/service is active
  const getStaffListForMenu = () => {
    if (activeSvcIdx === null && activePetIdx === null) return masterStaff;
    if (activePetIdx !== null) {
      const sibSvcs = siblingServices[activePetIdx] || [];
      if (activeSvcIdx === null) {
        // Batch assign for sibling — find staff covering all their departments
        const requiredDepts = [...new Set(sibSvcs.map(s => s.department))];
        return (vetsList || []).filter(v => requiredDepts.every(d => v.departments?.includes(d)));
      }
      const dept = sibSvcs[activeSvcIdx]?.department;
      return (vetsList || []).filter(v => v.departments?.includes(dept));
    }
    // Primary patient single-service assign
    return (vetsList || []).filter(v => v.departments?.includes(tempServices[activeSvcIdx]?.department));
  };

  const activeStaffList = getStaffListForMenu();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      PaperProps={{
        sx: {
          // --- THE RESPONSIVE COMMAND CENTER: Dynamic Scaling for 1080p and Tablets ---
          width: 'min(96vw, 1000px)',
          height: 'min(94vh, 700px)',
          maxWidth: '100vw',
          maxHeight: '100vh',
          borderRadius: 3, overflow: 'hidden',
          display: 'flex', flexDirection: 'column'
        }
      }}
    >
      {/* DIALOG HEADER: STARBARKS BRANDING */}
      <DialogTitle sx={{
        background: isGroupCheckIn
          ? `linear-gradient(135deg, #0D47A1 0%, #1565C0 100%)`
          : `linear-gradient(135deg, ${BRAND_BROWN} 0%, #1A0D0A 100%)`,
        color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1, py: 2,
        zIndex: 10
      }}>
        <AssignmentIndIcon />
        {isGroupCheckIn ? `GROUP CHECK-IN — ${totalPetsInGroup} PETS` : 'Assign Staff'}
      </DialogTitle>

      {/* --- 🧬 THE CLINICAL IDENTITY TOWER (MATCHES MAIN QUEUE) --- */}
      <Box sx={{ p: 3, bgcolor: '#FFF8E1', borderBottom: '2px dashed #D7CCC8', display: 'flex', alignItems: 'flex-start', gap: 5, zIndex: 10 }}>
        <Avatar sx={{ bgcolor: 'white', color: BRAND_BROWN, border: `3px solid ${BRAND_BROWN}`, width: 90, height: 90, fontSize: 45, boxShadow: 3, mt: 0.5 }}>
          {(patient.petSpecies === 'Canine' || patient.petSpecies === 'Dog') ? '🐶' : '🐱'}
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* THE 5-TIER PASSPORT: EXACT QUEUE SYMMETRY */}
          <Stack spacing={0.2}>
            <Typography variant="h4" fontWeight="1000" color={BRAND_BROWN} sx={{ lineHeight: 1, maxWidth: 600, noWrap: true, overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: -1 }}>
              {patient.petName || "Unnamed Pet"}
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: '800', color: BRAND_BROWN, display: 'flex', gap: 1.5, letterSpacing: 0.5, mt: 0.5 }}>
              <span style={{ opacity: 0.5 }}>SPECIES AND BREED:</span> {patient.petSpecies} • {patient.petBreed || "Mixed Breed"}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: '800', color: BRAND_BROWN, display: 'flex', gap: 1.5, letterSpacing: 0.5 }}>
              <span style={{ opacity: 0.5 }}>SEX/STATUS:</span> {patient.petGender && patient.petGender !== 'Unknown' && patient.petGender !== '???' ? patient.petGender.toUpperCase() : "SEX UNKNOWN"} • {patient.reproductiveStatus?.toUpperCase() || "INTACT"}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: '800', color: BRAND_BROWN, display: 'flex', gap: 1.5, letterSpacing: 0.5 }}>
              <span style={{ opacity: 0.5 }}>PHYSICAL:</span> {patient.petColor?.toUpperCase() || "COLOR UNRECORDED"} {patient.petMarkings ? `• ${patient.petMarkings.toUpperCase()}` : ""}
            </Typography>

            <Typography variant="caption" sx={{ fontWeight: '800', color: BRAND_BROWN, display: 'flex', gap: 1.5, letterSpacing: 0.5 }}>
              <span style={{ opacity: 0.5 }}>OWNER:</span> {patient.ownerName || "No Owner Registered"}
            </Typography>
          </Stack>

          {/* --- 📜 CLIENT NOTES BADGE --- */}
          <Box sx={{ mt: 1.5 }}>
            <Box
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 1, cursor: 'help',
                bgcolor: BRAND_BROWN, color: 'white', borderRadius: 1.2, px: 2, py: 0.4,
                transition: 'all 0.2s', '&:hover': { transform: 'scale(1.03)', boxShadow: 4 }
              }}
              title={patient.clientNotes || patient.staffNotes || patient.notes || "No intake notes recorded for this visit."}
            >
              <LocalHospitalIcon sx={{ fontSize: 13 }} />
              <Typography variant="caption" sx={{ fontWeight: '900', fontSize: '0.65rem', letterSpacing: 1, textTransform: 'uppercase' }}>
                view intake notes
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1.5 }}>
          <Chip
            label={headerChipLabel}
            size="small"
            sx={{ bgcolor: headerChipColor, color: 'white', fontWeight: '1000', fontSize: '0.8rem', height: 28, px: 2, boxShadow: 2 }}
          />
        </Box>
      </Box>

      {/* COMPACT PILL DISPATCH AREA (DYNAMIC VERTICAL FILL) */}
      <DialogContent sx={{ p: 0, bgcolor: '#F5F5F5', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {errorMsg && (
          <Alert
            severity="error"
            sx={{
              mx: 4, mt: 2, fontWeight: '900',
              border: '2px solid #D32F2F',
              borderRadius: 0,
              fontSize: '0.85rem'
            }}
            onClose={() => setErrorMsg('')}
          >
            {errorMsg}
          </Alert>
        )}

        {/* ── GROUP CHECK-IN MODE BANNER ─────────────────────────────
            Shown only when this is a group check-in AND siblings exist. */}
        {isCheckInAction && siblingAppointments.length > 0 && (
          <Box sx={{
            mx: 4, mt: 3,
            p: 2,
            bgcolor: groupMode ? '#E3F2FD' : '#FFF8E1',
            border: `2px solid ${groupMode ? '#1565C0' : '#FFB74D'}`,
            borderRadius: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}>
            <Box>
              <Typography sx={{ fontWeight: '900', fontSize: '0.85rem', color: groupMode ? '#1565C0' : '#E65100', letterSpacing: '0.05em' }}>
                {groupMode
                  ? `GROUP CHECK-IN — ALL ${totalPetsInGroup} PETS WILL SHARE ONE QUEUE NUMBER`
                  : 'INDIVIDUAL CHECK-IN — ONLY THIS PET WILL BE CHECKED IN'}
              </Typography>
              {groupMode && (
                <Typography sx={{ fontSize: '0.75rem', fontWeight: '700', color: '#5D4037', mt: 0.3 }}>
                  {siblingAppointments.map(s => s.petName).join(', ')} + {patient.petName}
                </Typography>
              )}
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setGroupMode(m => !m)}
              sx={{
                fontWeight: '900',
                fontSize: '0.65rem',
                borderRadius: 0,
                borderColor: groupMode ? '#1565C0' : '#E65100',
                color: groupMode ? '#1565C0' : '#E65100',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {groupMode ? 'CHECK IN INDIVIDUALLY' : 'SWITCH TO GROUP CHECK-IN'}
            </Button>
          </Box>
        )}

        <Box sx={{ p: 4 }}>

          {/* ── PRIMARY PATIENT SERVICE SECTION ─────────────────────── */}
          {isGroupCheckIn && (
            <Box sx={{ mb: 1, pb: 0.5, borderBottom: `2px solid ${BRAND_BROWN}` }}>
              <Typography sx={{ fontWeight: '900', fontSize: '0.75rem', color: BRAND_BROWN, letterSpacing: '0.08em' }}>
                PET 1 OF {totalPetsInGroup}: {patient.petName?.toUpperCase()} ({patient.petSpecies})
              </Typography>
            </Box>
          )}

          {/* --- CRYSTALLINE TOOLBAR: Hardened against text-wrapping --- */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Typography variant="overline" color={BRAND_BROWN} fontWeight="1000" sx={{ display: 'block', letterSpacing: 2, opacity: 0.9, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                Visit Routing
              </Typography>

              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Chip label={`${servicesCount} SERVICES`} size="small" sx={{ fontWeight: '1000', fontSize: '0.7rem', height: 20, bgcolor: '#D7CCC8', color: BRAND_BROWN }} />
                <Chip label={`${uniqueDeptsCount} DEPTS`} size="small" sx={{ fontWeight: '1000', fontSize: '0.7rem', height: 20, bgcolor: '#D7CCC8', color: BRAND_BROWN }} />
              </Box>
            </Box>

            <Button
              size="small"
              variant="contained"
              startIcon={<PersonAddIcon sx={{ fontSize: 16 }} />}
              onClick={(e) => handleOpenMenu(e, null, null)}
              disabled={masterStaff.length === 0}
              sx={{
                fontSize: '0.7rem', fontWeight: '1000', py: 0.6, px: 3,
                bgcolor: '#2E7D32', '&:hover': { bgcolor: '#1B5E20' },
                boxShadow: 2,
                whiteSpace: 'nowrap'
              }}
            >
              BATCH ASSIGN
            </Button>
          </Box>

          {/* --- 3-COLUMN TACTICAL PILL GRID (PRIMARY PATIENT) --- */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2
          }}>
            {tempServices.map((svc, idx) => {
              const svcDept = (departments || []).find(d => d.name === svc.department);
              const bColor = svcDept ? svcDept.color : '#616161';
              const isUnassigned = !svc.staffId;

              return (
                <Box
                  key={idx}
                  onClick={(e) => handleOpenMenu(e, idx, null)}
                  sx={{
                    display: 'flex', alignItems: 'center',
                    border: '1px solid', borderColor: isUnassigned ? '#E0E0E0' : `${bColor}40`,
                    borderRadius: 1.5, overflow: 'hidden', height: 50, cursor: 'pointer',
                    bgcolor: 'white', transition: 'all 0.15s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 6, borderColor: bColor }
                  }}
                >
                  <Box sx={{ px: 2, bgcolor: bColor, color: 'white', display: 'flex', alignItems: 'center', height: '100%', minWidth: 100 }}>
                    <Typography variant="caption" sx={{ fontWeight: '1000', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1 }}>
                      {svc.name}
                    </Typography>
                  </Box>
                  <Box sx={{ px: 2, display: 'flex', alignItems: 'center', minWidth: 140 }}>
                    <Typography variant="body2" sx={{ fontWeight: '800', fontSize: '0.85rem', color: isUnassigned ? '#BDBDBD' : BRAND_BROWN }}>
                      {svc.staffName || 'Assign Personnel'}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {masterStaff.length === 0 && isBundle && (
            <Alert severity="info" sx={{ mt: 5, fontWeight: '900', fontSize: '0.9rem', border: '1px solid currentColor', borderRadius: 1.5 }}>
              Note: Clinical complexity threshold reached. Please perform individual service routing.
            </Alert>
          )}

          {/* ── SIBLING PET SECTIONS (group mode only) ───────────────── */}
          {isGroupCheckIn && siblingAppointments.map((sib, sibIdx) => {
            const sibSvcs = siblingServices[sibIdx] || [];
            return (
              <Box key={sib.id} sx={{ mt: 4 }}>
                <Box sx={{ mb: 1, pb: 0.5, borderBottom: `2px solid #1565C0` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontWeight: '900', fontSize: '0.75rem', color: '#1565C0', letterSpacing: '0.08em' }}>
                      PET {sibIdx + 2} OF {totalPetsInGroup}: {sib.petName?.toUpperCase()} ({sib.petSpecies})
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PersonAddIcon sx={{ fontSize: 12 }} />}
                      onClick={(e) => handleOpenMenu(e, null, sibIdx)}
                      sx={{
                        fontSize: '0.6rem', fontWeight: '1000', py: 0.3, px: 1.5,
                        borderRadius: 0,
                        borderColor: '#1565C0', color: '#1565C0',
                      }}
                    >
                      BATCH ASSIGN
                    </Button>
                  </Box>
                </Box>
                {sibSvcs.length === 0 ? (
                  <Typography variant="caption" sx={{ color: '#9E9E9E', fontStyle: 'italic' }}>
                    No services on this appointment.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                    {sibSvcs.map((svc, idx) => {
                      const svcDept = (departments || []).find(d => d.name === svc.department);
                      const bColor = svcDept ? svcDept.color : '#616161';
                      const isUnassigned = !svc.staffId;
                      return (
                        <Box
                          key={idx}
                          onClick={(e) => handleOpenMenu(e, idx, sibIdx)}
                          sx={{
                            display: 'flex', alignItems: 'center',
                            border: '1px solid', borderColor: isUnassigned ? '#E0E0E0' : `${bColor}40`,
                            borderRadius: 1.5, overflow: 'hidden', height: 50, cursor: 'pointer',
                            bgcolor: 'white', transition: 'all 0.15s',
                            '&:hover': { transform: 'translateY(-2px)', boxShadow: 6, borderColor: bColor }
                          }}
                        >
                          <Box sx={{ px: 2, bgcolor: bColor, color: 'white', display: 'flex', alignItems: 'center', height: '100%', minWidth: 100 }}>
                            <Typography variant="caption" sx={{ fontWeight: '1000', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1 }}>
                              {svc.name}
                            </Typography>
                          </Box>
                          <Box sx={{ px: 2, display: 'flex', alignItems: 'center', minWidth: 140 }}>
                            <Typography variant="body2" sx={{ fontWeight: '800', fontSize: '0.85rem', color: isUnassigned ? '#BDBDBD' : BRAND_BROWN }}>
                              {svc.staffName || 'Assign Personnel'}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </DialogContent>

      {/* ACTION FOOTER: COMPACT & RECLAIMED */}
      <DialogActions sx={{ p: 2, px: 3, bgcolor: '#EFEBE9', justifyContent: 'space-between', borderTop: '1px solid #D7CCC8' }}>
        <Button onClick={handleUnassignAll} color="error" size="small" sx={{ fontWeight: '1000', px: 2 }}>
          Unassign All
        </Button>
        <Stack direction="row" spacing={2}>
          <Button onClick={onClose} size="small" sx={{ fontWeight: 'bold', color: BRAND_BROWN, px: 2 }}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || (isCheckInAction && !allAssigned)}
            variant="contained"
            size="small"
            sx={{
              fontWeight: '1000', px: 4, py: 1,
              bgcolor: isGroupCheckIn ? '#1565C0' : BRAND_BROWN,
              '&:hover': { bgcolor: isGroupCheckIn ? '#0D47A1' : '#1A0D0A' },
              boxShadow: 4, borderRadius: 1.5
            }}
          >
            {loading
              ? "Processing..."
              : isGroupCheckIn
                ? `ISSUE SHARED TICKET — ${totalPetsInGroup} PETS`
                : (isCheckInAction ? "ISSUE TICKET & DISPATCH" : "SAVE ASSIGNMENTS")
            }
          </Button>
        </Stack>
      </DialogActions>

      {/* DROPDOWN DISPATCH MENU: DYNAMICALLY SORTED & ELITE FILTERED */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        PaperProps={{ sx: { minWidth: 350, mt: 1, borderRadius: 2, boxShadow: 16 } }}
      >
        {/* --- 📈 DROPDOWN SORT HEADER: EXPANSIVE SPACING --- */}
        <Box sx={{ px: 4, py: 2.5, bgcolor: '#F5F5F5', display: 'flex', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ fontWeight: '1000', color: activeSvcIdx === null ? '#2E7D32' : BRAND_BROWN, fontSize: '0.85rem', letterSpacing: 1.5, flexGrow: 1 }}>
            {activePetIdx !== null
              ? `${siblingAppointments[activePetIdx]?.petName?.toUpperCase() || 'SIBLING'}: ${activeSvcIdx === null ? 'BATCH ASSIGN' : (siblingServices[activePetIdx]?.[activeSvcIdx]?.department || 'SERVICE')}`
              : (activeSvcIdx === null ? "BATCH ASSIGNMENT TOOL" : `Assignment: ${tempServices[activeSvcIdx]?.department || ''}`)
            }
          </Typography>

          <Box sx={{ display: 'flex', gap: 1.5, ml: 4 }}>
            <Button
              variant={sortBy === 'alpha' ? "contained" : "text"}
              onClick={() => setSortBy('alpha')}
              sx={{ minWidth: 40, p: 1, py: 0.5, fontSize: '0.75rem', fontWeight: '1000', bgcolor: sortBy === 'alpha' ? BRAND_BROWN : 'transparent', color: sortBy === 'alpha' ? 'white' : BRAND_BROWN }}
            >
              A-Z
            </Button>
            <Button
              variant={sortBy === 'load' ? "contained" : "text"}
              onClick={() => setSortBy('load')}
              sx={{ minWidth: 40, p: 1, py: 0.5, fontSize: '0.75rem', fontWeight: '1000', bgcolor: sortBy === 'load' ? BRAND_BROWN : 'transparent', color: sortBy === 'load' ? 'white' : BRAND_BROWN }}
            >
              LOAD
            </Button>
          </Box>
        </Box>
        <Divider />

        {sortStaff(activeStaffList).map(v => {
            const load = getVetWorkload(v.id);
            return (
              <MenuItem key={v.id} onClick={() => handleSelectStaff(v.id, v.fullName)} sx={{ py: 2.5, px: 4 }}>
                <Avatar sx={{ width: 40, height: 40, fontSize: 16, mr: 3, bgcolor: BRAND_BROWN }}>{v.fullName[0]}</Avatar>

                <Typography variant="body1" sx={{ fontWeight: '800', maxWidth: 220, noWrap: true, textOverflow: 'ellipsis', overflow: 'hidden', flexGrow: 1 }}>
                  {v.fullName}
                </Typography>

                <Typography variant="caption" sx={{ ml: 4, color: load > 2 ? '#D32F2F' : '#2E7D32', fontWeight: '1000', fontSize: '0.9rem' }}>
                  {load} Active
                </Typography>
              </MenuItem>
            );
          })
        }

        {activeStaffList.length === 0 && (
          <MenuItem disabled><Typography variant="caption" sx={{ px: 4, py: 2 }}>No universally qualified personnel found</Typography></MenuItem>
        )}
      </Menu>
    </Dialog>
  );
}