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

import { doc, runTransaction, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function AssignStaffModal({ open, onClose, patient, vetsList, activeAppointments, departments, mode = 'check-in' }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // THE BUFFER: Stores local changes before they hit the cloud!
  const [tempServices, setTempServices] = useState([]);

  // --- DROPDOWN STATE ---
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeSvcIdx, setActiveSvcIdx] = useState(null); // null = BATCH Assign
  const [sortBy, setSortBy] = useState('alpha'); // alpha | load

  useEffect(() => {
    if (open && patient) {
      const sortedServices = (patient.services || []).sort((a, b) => a.name.localeCompare(b.name));
      setTempServices(sortedServices);
      setErrorMsg('');
    }
  }, [open, patient]);

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

  const handleOpenMenu = (event, idx) => {
    setAnchorEl(event.currentTarget);
    setActiveSvcIdx(idx);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
    setActiveSvcIdx(null);
  };

  const handleSelectStaff = (vId, vName) => {
    if (activeSvcIdx === null) {
      const updated = tempServices.map(s => ({ ...s, staffId: vId, staffName: vName }));
      setTempServices(updated);
    } else {
      const updated = [...tempServices];
      updated[activeSvcIdx] = { ...updated[activeSvcIdx], staffId: vId, staffName: vName };
      setTempServices(updated);
    }
    handleCloseMenu();
  };

  const handleUnassignAll = () => {
    const cleared = tempServices.map(s => ({ ...s, staffId: null, staffName: 'Unassigned' }));
    setTempServices(cleared);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      if (patient.status === 'confirmed' && mode === 'check-in') {
        const allAssigned = tempServices.every(s => s.staffId);
        if (!allAssigned) throw new Error("SECURITY BLOCK: All clinical services must have assigned personnel before check-in.");

        await runTransaction(db, async (transaction) => {
          const queueRef = doc(db, "queue", "daily_queue");
          const queueDoc = await transaction.get(queueRef);
          const newNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;

          // --- 🛡️ STATUS PRIMING: Ensuring all services start as 'pending' ---
          const primedServices = tempServices.map(s => ({ ...s, status: 'pending' }));

          transaction.set(queueRef, { lastNumberIssued: newNumber }, { merge: true });
          transaction.update(doc(db, "appointments", patient.id), {
            status: 'arrived',
            queueNumber: newNumber,
            ticketPrefix: patient.priority === 'high' ? 'E' : 'W',
            timeArrived: Timestamp.now(),
            services: primedServices,
            assignedVet: primedServices[0]?.staffName || "Unassigned",
            assignedVetId: primedServices[0]?.staffId || null // THE RESPONSIBILITY STAMP
          });
        });
      } else {
        // PREP ONLY OR EXISTING PATIENT: Enforce assignment if they already arrived
        if (patient.status !== 'confirmed' && patient.status !== 'pending') {
            const allAssigned = tempServices.every(s => s.staffId);
            if (!allAssigned) throw new Error("CLINICAL SAFETY: Cannot unassign personnel from an active patient.");
        }

        await updateDoc(doc(db, "appointments", patient.id), {
          services: tempServices,
          assignedVet: tempServices[0]?.staffName || "Unassigned",
          assignedVetId: tempServices[0]?.staffId || null
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

  // --- UNITARY BRANDING LOGIC ---
  const singleSvc = !isBundle ? tempServices[0] : null;
  const dObj = singleSvc ? (departments || []).find(d => d.name === singleSvc.department) : null;
  const headerChipColor = isBundle ? BRAND_BROWN : (dObj?.color || BRAND_BROWN);
  const headerChipLabel = isBundle ? "SERVICE BUNDLE" : (singleSvc?.name?.toUpperCase() || "VISIT");

  const allAssigned = tempServices.every(s => s.staffId);

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
        background: `linear-gradient(135deg, ${BRAND_BROWN} 0%, #1A0D0A 100%)`,
        color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1, py: 2,
        zIndex: 10
      }}>
        <AssignmentIndIcon /> Assign Staff
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
              title={patient.notes || "No client notes recorded for this visit."}
            >
              <LocalHospitalIcon sx={{ fontSize: 13 }} />
              <Typography variant="caption" sx={{ fontWeight: '900', fontSize: '0.65rem', letterSpacing: 1, textTransform: 'uppercase' }}>
                view client notes
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
        <Box sx={{ p: 4 }}>

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
              onClick={(e) => handleOpenMenu(e, null)}
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

          {/* --- 3-COLUMN TACTICAL PILL GRID --- */}
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
                  onClick={(e) => handleOpenMenu(e, idx)}
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
              bgcolor: BRAND_BROWN, '&:hover': { bgcolor: '#1A0D0A' }, boxShadow: 4, borderRadius: 1.5
            }}
          >
            {loading ? "Processing..." : (isCheckInAction ? "ISSUE TICKET & DISPATCH" : "SAVE ASSIGNMENTS")}
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
        <Box>
          {/* --- 📈 DROPDOWN SORT HEADER: EXPANSIVE SPACING --- */}
          <Box sx={{ px: 4, py: 2.5, bgcolor: '#F5F5F5', display: 'flex', alignItems: 'center' }}>
            <Typography variant="overline" sx={{ fontWeight: '1000', color: activeSvcIdx === null ? '#2E7D32' : BRAND_BROWN, fontSize: '0.85rem', letterSpacing: 1.5, flexGrow: 1 }}>
              {activeSvcIdx === null ? "BATCH ASSIGNMENT TOOL" : `Assignment: ${tempServices[activeSvcIdx].department}`}
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

          {sortStaff(activeSvcIdx === null ? masterStaff : (vetsList || []).filter(v => v.departments?.includes(tempServices[activeSvcIdx].department)))
            .map(v => {
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

          {((activeSvcIdx === null ? masterStaff : (vetsList || []).filter(v => v.departments?.includes(tempServices[activeSvcIdx].department))).length === 0) && (
            <MenuItem disabled><Typography variant="caption" sx={{ px: 4, py: 2 }}>No universally qualified personnel found</Typography></MenuItem>
          )}
        </Box>
      </Menu>
    </Dialog>
  );
}