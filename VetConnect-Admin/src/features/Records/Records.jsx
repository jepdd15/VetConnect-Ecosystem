import React, { useState, useMemo } from 'react';
import { 
  Box, Typography, Paper, TextField, InputAdornment, Chip, Stack, Tooltip, 
  IconButton, Popover, Divider, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, Drawer, FormControl, InputLabel, Select, MenuItem, RadioGroup, FormControlLabel, Radio
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

// Icons
import SearchIcon from '@mui/icons-material/Search';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import HistoryIcon from '@mui/icons-material/History';
import InfoIcon from '@mui/icons-material/Info';
import TimelineIcon from '@mui/icons-material/Timeline';
import EditCalendarIcon from '@mui/icons-material/EditCalendar';
import CancelIcon from '@mui/icons-material/Cancel';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PetsIcon from '@mui/icons-material/Pets';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import LockIcon from '@mui/icons-material/Lock';
import ShieldIcon from '@mui/icons-material/Shield';
import FilterListIcon from '@mui/icons-material/FilterList';
import TuneIcon from '@mui/icons-material/Tune';
import CloseIcon from '@mui/icons-material/Close';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

// Design Tokens
import { FONT, COLORS, TYPE } from '../../theme/designTokens';

// Logic
import { useGlobalRecords } from './hooks/useGlobalRecords';
import { useQueueActions } from '../Queue/useQueueActions';
import { ForensicMetricGrid } from '../Queue/ForensicMetricGrid';
import { useAncestorChain } from './hooks/useAncestorChain';
import { calculatePulseMetrics } from '../../utils/pulseUtils';
import { query, collection, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';

export default function Records() {
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  
  // UI State for Search Mode
  const [searchMode, setSearchMode] = useState('petName'); // 'petName', 'ownerName', 'phone'
  
  // UI State for Silos
  const [activeTab, setActiveTab] = useState(0);
  const SILO_MAP = ['GLOBAL', 'TRIAGE', 'CLINICAL', 'IN-PATIENT', 'ARCHIVE', 'VOIDED'];

  // UI State for Filter Drawer
  const [openDrawer, setOpenDrawer] = useState(false);
  const [facets, setFacets] = useState({
    assignedVetId: '',
    serviceCategory: '',
    petSpecies: '',
    origin: '' // '', 'WALK_IN', 'ONLINE'
  });

  const [vets, setVets] = useState([]);

  // UI State for Audit Popover
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeAuditRow, setActiveAuditRow] = useState(null);

  // UI State for Reschedule Modal
  const [openReschedule, setOpenReschedule] = useState(false);
  const [rescheduleData, setRescheduleData] = useState({ newDate: '', reason: '' });
  const activeSilo = SILO_MAP[activeTab];

  const { records, loading } = useGlobalRecords(dateRange, searchText, searchMode, activeSilo, facets);
  const { rescheduleAppointment, rejectAppointment } = useQueueActions();
  
  // --- 🧬 ANCESTOR CHAIN ENGINE ---
  const { ancestors, combinedPulse, combinedServices, loading: loadingAncestors } = useAncestorChain(activeAuditRow);
  
  // Clinic settings — shared singleton via useClinicSettings hook
  const settings = useClinicSettings();
  // Derive departments list from settings (populated by clinic_settings/general doc)
  const departments = settings.departments || [];

  // Fetch Vets
  React.useEffect(() => {
    const vetsQuery = query(collection(db, "staff"), where("role", "==", "veterinarian"));
    const unsubVets = onSnapshot(vetsQuery, (s) => {
       setVets(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubVets();
  }, []);

  // Compute Cumulative Metrics
  const cumulativeTotals = useMemo(() => {
    if (!activeAuditRow) return null;
    let totalQueue = 0;
    let totalConsult = 0;
    let totalConfined = 0;

    const allRecords = [...ancestors, activeAuditRow];
    allRecords.forEach(r => {
      const p = r.clinicalPulse || [];
      const m = calculatePulseMetrics(p, settings, r.createdAt, r.jsScheduled || new Date());
      // metrics come back as strings like "10M", need to parse back or use a raw helper
      // Actually pulseUtils has calculatePulseMetrics which returns { raw: { shiftQueue: mins, ... } }
      if (m.raw) {
        totalQueue += (m.raw.shiftQueue || 0);
        totalConsult += (m.raw.shiftConsult || 0);
        totalConfined += (m.raw.shiftConfined || 0);
      }
    });

    return { totalQueue, totalConsult, totalConfined };
  }, [ancestors, activeAuditRow, settings]);

  // --- CLIENT-SIDE RENDERING (PRE-FLIGHT) ---
  const filteredRecords = records; // Now handled server-side for performance

  // --- ACTIONS HANDLERS ---
  const handleOpenAudit = (event, row) => {
    setAnchorEl(event.currentTarget);
    setActiveAuditRow(row);
  };

  const handleCloseAudit = () => {
    setAnchorEl(null);
    setActiveAuditRow(null);
  };

  const handleReschedule = async () => {
    try {
      await rescheduleAppointment(activeAuditRow, rescheduleData.newDate, rescheduleData.reason, settings);
      setOpenReschedule(false);
      setRescheduleData({ newDate: '', reason: '' });
      handleCloseAudit();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCancelAppt = async () => {
    if (window.confirm("Are you sure you want to VOID this future record? This is a forensic action.")) {
      const reason = prompt("Enter Forensic Reason for Cancellation:");
      if (reason) {
        try {
          await rejectAppointment(activeAuditRow.id, reason, activeAuditRow.services, false, {}, activeAuditRow);
          handleCloseAudit();
        } catch (err) {
          alert(err.message);
        }
      }
    }
  };

  const columns = [
    { 
      field: 'jsCreatedAt', headerName: 'Creation Anchor', width: 220,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: '1000', color: '#3E2723', lineHeight: 1.2 }}>
                {p.value ? p.value.toLocaleDateString() : 'N/A'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: '900', fontSize: '0.65rem' }}>
                LOGGED: {p.value ? p.value.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
            </Typography>
        </Box>
      )
    },
    {
      field: 'identity', headerName: 'Clinical Identity', flex: 1.2, minWidth: 250,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ fontWeight: '1000', color: '#1A1A1A', lineHeight: 1.1 }}>
                {p.row.petName?.toUpperCase()}
            </Typography>
            <Typography variant="caption" sx={{ color: '#795548', fontWeight: '900', fontSize: '0.65rem' }}>
                {p.row.petSpecies} • {p.row.ownerName}
            </Typography>
        </Box>
      )
    },
    {
      field: 'jsScheduled', headerName: 'Planned Encounter', width: 180,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', gap: 1 }}>
            <CalendarMonthIcon sx={{ fontSize: 16, color: COLORS.accentLight }} />
            <Typography variant="body2" sx={{ fontWeight: '900', color: '#5D4037' }}>
                {p.value ? p.value.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'ASAP'}
            </Typography>
        </Box>
      )
    },
    {
      field: 'services', headerName: 'Service Footprint', flex: 1, minWidth: 200,
      renderCell: (p) => {
        const services = p.value || [];
        return (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', height: '100%' }}>
            {services.slice(0, 2).map((s, i) => (
              <Chip key={i} label={s.name} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', fontWeight: '1000', borderRadius: 0, borderColor: '#D7CCC8' }} />
            ))}
            {services.length > 2 && <Typography variant="caption" sx={{ fontWeight: '1000', color: 'text.disabled' }}>+{services.length - 2}</Typography>}
          </Box>
        );
      }
    },
    {
       field: 'status', headerName: 'State Vector', width: 150, align: 'center', headerAlign: 'center',
       renderCell: (p) => {
         const s = String(p.value).toUpperCase();
         const isTerminal = ['COMPLETED', 'CANCELLED', 'NO-SHOW', 'CARRIED-OVER'].includes(s);
         
         let color = '#757575';
         if (['COMPLETED', 'CARRIED-OVER'].includes(s)) color = COLORS.success;
         if (['CANCELLED', 'NO-SHOW'].includes(s)) color = COLORS.danger;
         if (['IN-CONSULT', 'ARRIVED', 'DISPENSING', 'BILLING', 'ON-HOLD', 'CONFINED'].includes(s)) color = COLORS.medical;

         return (
           <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
             <Box sx={{ border: `1.5px solid ${color}`, px: 1.5, py: 0.5, borderRadius: 0, bgcolor: 'white' }}>
               <Typography sx={{ color: color, fontWeight: '1000', fontSize: '0.65rem', letterSpacing: 0.5 }}>{s}</Typography>
             </Box>
             {isTerminal && (
               <Tooltip title="FORENSICALLY SEALED: Record Locked">
                 <ShieldIcon sx={{ fontSize: 14, color: COLORS.success, opacity: 0.8 }} />
               </Tooltip>
             )}
           </Box>
         );
       }
    },
    {
      field: 'actions', headerName: 'Audit & Teleport', width: 150, align: 'center', headerAlign: 'center',
      renderCell: (p) => (
        <Stack direction="row" spacing={1} sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <Tooltip title="Forensic Pulse Audit">
              <IconButton size="small" onClick={(e) => handleOpenAudit(e, p.row)} sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}>
                  <TimelineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="View File (CRM)">
              <IconButton size="small" onClick={() => window.location.href = `/patients/${p.row.petId}`} sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}>
                <HistoryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
        </Stack>
      )
    }
  ];

  const canEdit = activeAuditRow && (
    (activeAuditRow.status === 'pending' || activeAuditRow.status === 'confirmed') && // Must be in a pre-clinical state
    (activeAuditRow.jsScheduled && activeAuditRow.jsScheduled > new Date(new Date().setHours(0,0,0,0))) // Must be for today or the future
  );

  const isHistorical = activeAuditRow && (
    ['completed', 'cancelled', 'no-show', 'carried-over'].includes(activeAuditRow.status?.toLowerCase()) ||
    (activeAuditRow.jsCreatedAt && activeAuditRow.jsCreatedAt < new Date(new Date().setHours(0,0,0,0)))
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', bgcolor: '#FFF8E1' }}>
      
      {/* 1. COMMAND STRIP HEADER */}
      <Box sx={{ flexShrink: 0, mb: 0 }}>
        <Paper elevation={0} sx={{ 
          p: 2.5, px: 4, display: 'flex', flexWrap: 'nowrap', gap: 3, alignItems: 'center',
          bgcolor: '#FFF8E1', borderBottom: '2px solid #5D4037', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0
        }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: '1000', color: '#5D4037', textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0, mr: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            All Records
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ bgcolor: 'rgba(93, 64, 55, 0.05)', border: '2px solid #5D403733', px: 1, py: 0.5 }}>
            <TextField 
              variant="standard" size="small" placeholder={`SEARCH BY ${searchMode.toUpperCase().replace('NAME', '')}...`} 
              value={searchText} onChange={(e) => setSearchText(e.target.value)} 
              InputProps={{ 
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{color: '#5D4037', opacity: 0.6}}/></InputAdornment>,
                disableUnderline: true,
                style: { color: '#3E2723', fontWeight: '1000', fontSize: '0.85rem', fontFamily: 'Inter' }
              }} 
              sx={{ width: 180 }} 
            />
            <Divider orientation="vertical" flexItem sx={{ mx: 1, height: 20, borderColor: '#5D403733' }} />
            <ToggleButtonGroup
              value={searchMode}
              exclusive
              onChange={(e, next) => next && setSearchMode(next)}
              size="small"
              sx={{ 
                '& .MuiToggleButton-root': { 
                  border: 'none', px: 1, py: 0, color: '#A1887F',
                  '&.Mui-selected': { bgcolor: 'transparent', color: '#5D4037' }
                } 
              }}
            >
              <ToggleButton value="petName"><Tooltip title="Pet Name"><PetsIcon sx={{ fontSize: 16 }} /></Tooltip></ToggleButton>
              <ToggleButton value="ownerName"><Tooltip title="Owner Name"><PersonIcon sx={{ fontSize: 16 }} /></Tooltip></ToggleButton>
              <ToggleButton value="phone"><Tooltip title="Phone Number"><PhoneIcon sx={{ fontSize: 16 }} /></Tooltip></ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
             <Typography sx={{ fontWeight: '1000', fontSize: '0.65rem', color: '#A1887F' }}>FILTER ERA:</Typography>
             <TextField 
               type="date" size="small" 
               onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))}
               sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733', borderRadius: 0 }, width: 140 }} 
             />
             <Typography sx={{ fontWeight: '1000', color: '#5D4037' }}>→</Typography>
             <TextField 
               type="date" size="small" 
               onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))}
               sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733', borderRadius: 0 }, width: 140 }} 
             />
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" spacing={2} alignItems="center">
              <Tooltip title="Clinical Precision Filters">
                <IconButton 
                  onClick={() => setOpenDrawer(true)} 
                  sx={{ 
                    border: '2px solid #5D4037', borderRadius: 0, 
                    bgcolor: Object.values(facets).some(v => v !== '') ? '#5D4037' : 'transparent',
                    color: Object.values(facets).some(v => v !== '') ? 'white' : '#5D4037'
                  }}
                >
                  <TuneIcon />
                </IconButton>
              </Tooltip>

              <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '1.2rem', lineHeight: 1 }}>{filteredRecords.length}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: '1000', opacity: 0.6, fontSize: '0.62rem', display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {facets.petSpecies || ''} {activeSilo.replace('GLOBAL', 'TOTAL').replace('_', ' ')} RECORDS
                    {facets.serviceCategory ? ` • ${facets.serviceCategory}` : ''}
                    {facets.assignedVetId ? ` • ${vets.find(v => v.id === facets.assignedVetId)?.fullName || 'VET'}` : ''}
                  </Typography>
              </Box>
              <InfoIcon sx={{ color: '#5D4037', opacity: 0.2 }} />
          </Stack>
        </Paper>

        {/* 1.1 SILO TABS (NEW) */}
        <Box sx={{ bgcolor: 'white', borderBottom: '2px solid #5D403733', px: 4 }}>
           <Tabs 
             value={activeTab} 
             onChange={(e, v) => setActiveTab(v)}
             variant="scrollable"
             scrollButtons="auto"
             sx={{ 
               minHeight: 45,
               '& .MuiTabs-indicator': { bgcolor: '#5D4037', height: 3 },
               '& .MuiTab-root': { 
                 fontFamily: 'Inter', fontWeight: '1000', fontSize: '0.65rem', color: '#A1887F', py: 1, minWidth: 100,
                 '&.Mui-selected': { color: '#5D4037' }
               }
             }}
           >
              <Tab label="📜 GLOBAL HISTORY" />
              <Tab label="⚡ TRIAGE HUB" />
              <Tab label="🏥 CLINICAL FLOW" />
              <Tab label="🐾 IN-PATIENT" />
              <Tab label="🛡️ SEALED ARCHIVE" />
              <Tab label="🚫 VOIDED RECAL" />
           </Tabs>
        </Box>
      </Box>

      {/* 2. THE MASTER LEDGER GRID */}
      <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden', bgcolor: 'white' }}>
        <DataGrid 
            loading={loading} rows={filteredRecords} 
            columns={columns.map(c => ({
              ...c,
              headerClassName: 'forensic-header',
              headerName: (c.headerName || '').toUpperCase()
            }))} 
            disableRowSelectionOnClick rowHeight={70}
            sx={{ 
                border: 'none', 
                bgcolor: 'white',
                '& .forensic-header': {
                  bgcolor: '#FFF8E1 !important',
                  color: '#5D4037',
                  fontWeight: '1000 !important',
                  fontSize: '0.75rem',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  borderBottom: '2px solid #5D4037 !important',
                },
                '& .MuiDataGrid-columnSeparator': { display: 'none' },
                '& .MuiDataGrid-cell': { 
                  display: 'flex', 
                  alignItems: 'center', 
                  borderBottom: '1px solid rgba(93, 64, 55, 0.08)',
                  fontFamily: 'Inter, sans-serif'
                },
                '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(93, 64, 55, 0.04)' },
            }} 
        />
      </Box>

      {/* --- 🧬 FORENSIC AUDIT POPOVER --- */}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleCloseAudit}
        anchorOrigin={{ vertical: 'center', horizontal: 'left' }}
        transformOrigin={{ vertical: 'center', horizontal: 'right' }}
        PaperProps={{ sx: { width: 380, borderRadius: 0, border: '2px solid #5D4037', p: 0, overflow: 'hidden', boxShadow: '10px 10px 0px rgba(93, 64, 55, 0.1)' } }}
      >
        {activeAuditRow && (
          <Box>
            <Box sx={{ bgcolor: '#FFF8E1', p: 1.5, borderBottom: '1px solid #5D4037', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TimelineIcon fontSize="small" /> AUDIT TRAIL: {activeAuditRow.id.slice(0, 8).toUpperCase()}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                {activeAuditRow.ownerPhone && (
                  <Chip 
                    icon={<PhoneIcon sx={{ fontSize: '10px !important' }} />}
                    label={activeAuditRow.ownerPhone} 
                    size="small" 
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, color: '#5D4037', borderColor: '#D7CCC8' }} 
                  />
                )}
                {ancestors.length > 0 && (
                  <Chip 
                    label={`CASE DAY ${activeAuditRow.caseDay || ancestors.length + 1}`} 
                    size="small" 
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, bgcolor: '#E65100', color: 'white' }} 
                  />
                )}
              </Stack>
            </Box>
            
            <Box sx={{ p: 2, maxHeight: 400, overflowY: 'auto', bgcolor: 'white' }}>
              {/* SECTION 1: CUMULATIVE TIMELINE */}
              <Typography variant="overline" sx={{ fontWeight: '1000', color: '#795548', mb: 1.5, display: 'block', letterSpacing: 1, fontSize: '0.6rem' }}>
                 🧬 CLINICAL PULSE (FULL CHAIN)
              </Typography>
              <Stack spacing={2} sx={{ position: 'relative', pl: 3, mb: 4 }}>
                   <Box sx={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: '2px', borderLeft: '2px dashed #D7CCC8' }} />
                   {(combinedPulse.length > 0 ? combinedPulse : []).map((p, i) => (
                     <Box key={i} sx={{ position: 'relative' }}>
                        <Box sx={{ position: 'absolute', left: -26, top: 4, width: 8, height: 8, borderRadius: '50%', bgcolor: '#5D4037', border: '2px solid white' }} />
                        <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.62rem', display: 'block' }}>
                           {p.type}: {String(p.toStatus || 'EVENT').toUpperCase()}
                        </Typography>
                        <Typography sx={{ fontWeight: '900', fontSize: '0.75rem', color: '#1A1A1A' }}>
                           {p.timestamp?.toDate ? p.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                           <span style={{ opacity: 0.6, fontSize: '0.7rem', marginLeft: 4 }}>● {p.staffName}</span>
                        </Typography>
                        {p.note && <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', fontSize: '0.65rem', mt: 0.5, color: '#795548', lineHeight: 1.2 }}>↳ {p.note}</Typography>}
                     </Box>
                   ))}
              </Stack>

              {/* SECTION 2: HISTORICAL SERVICE LEDGER */}
              <Typography variant="overline" sx={{ fontWeight: '1000', color: '#795548', mb: 1, display: 'block', letterSpacing: 1, fontSize: '0.6rem' }}>
                 🏥 SERVICE FOOTPRINT PER DAY
              </Typography>
              <Stack spacing={1} sx={{ mb: 2 }}>
                  {combinedServices.map((day, idx) => (
                    <Box key={idx} sx={{ p: 1, bgcolor: '#F5F5F5', borderLeft: `3px solid ${idx === combinedServices.length - 1 ? '#2E7D32' : '#9E9E9E'}` }}>
                       <Typography sx={{ fontWeight: '1000', fontSize: '0.6rem', color: '#5D4037', mb: 0.5 }}>
                          DAY {idx + 1}: {day.date?.toDate ? day.date.toDate().toLocaleDateString() : 'Active'}
                       </Typography>
                       <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {day.services.map((s, si) => (
                            <Chip key={si} label={s.name} size="small" sx={{ height: 16, fontSize: '0.55rem', fontWeight: '800', borderRadius: 0, bgcolor: 'white', border: '1px solid #D7CCC8' }} />
                          ))}
                       </Box>
                    </Box>
                  ))}
              </Stack>
            </Box>

            <Box sx={{ p: 1.5, borderTop: '1px solid #D7CCC8' }}>
               <ForensicMetricGrid 
                 pulse={activeAuditRow.clinicalPulse || []} 
                 createdAt={activeAuditRow.createdAt} 
                 targetDate={activeAuditRow.jsScheduled}
                 cumulativeTotals={cumulativeTotals}
               />
            </Box>

            <Divider />

            <Box sx={{ p: 1, bgcolor: '#FAF9F7' }}>
              {canEdit ? (
                <Stack direction="row" spacing={1}>
                  <Button 
                    fullWidth size="small" variant="contained" 
                    startIcon={<EditCalendarIcon />} 
                    sx={{ bgcolor: COLORS.accent, fontWeight: '1000', fontSize: '0.65rem', borderRadius: 0 }}
                    onClick={() => setOpenReschedule(true)}
                  >
                    Reschedule
                  </Button>
                  <Button 
                    fullWidth size="small" variant="outlined" color="error" 
                    startIcon={<CancelIcon />} 
                    sx={{ fontWeight: '1000', fontSize: '0.65rem', borderColor: COLORS.danger, borderRadius: 0 }}
                    onClick={handleCancelAppt}
                  >
                    Void
                  </Button>
                </Stack>
              ) : (
                <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1.5, border: '1px solid #D7CCC8', bgcolor: '#FFF8E1' }}>
                   {isHistorical ? (
                     <>
                       <LockIcon sx={{ fontSize: 16, color: '#5D4037' }} />
                       <Box>
                         <Typography variant="caption" sx={{ display: 'block', color: '#5D4037', fontWeight: '1000', fontSize: '0.6rem' }}>
                            FORENSIC SEALED
                         </Typography>
                         <Typography variant="caption" sx={{ display: 'block', color: '#A1887F', fontWeight: '800', lineHeight: 1 }}>
                            This record is an immutable clinical artifact.
                         </Typography>
                       </Box>
                     </>
                   ) : (
                     <>
                        <InfoIcon sx={{ fontSize: 16, color: COLORS.medical }} />
                        <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '900', fontSize: '0.65rem' }}>
                           ACTIVE TRIAGE: Actions restricted to Queue Dashboard.
                        </Typography>
                     </>
                   )}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Popover>

      {/* --- 🧬 RESCHEDULE MODAL --- */}
      <Dialog open={openReschedule} onClose={() => setOpenReschedule(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 0, border: '4px solid #5D4037' } }}>
        <DialogTitle sx={{ bgcolor: '#FFF8E1', color: '#5D4037', fontWeight: '1000', borderBottom: '2px solid #5D4037' }}>
           TEMPORAL SHIFT AUTHORIZATION
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
           <Typography variant="caption" sx={{ fontWeight: '1000', color: '#795548', mb: 2, display: 'block' }}>
              AUTHORIZING A MANUAL RESCHEDULE WILL UPDATE THE CLINICAL TIMELINE AND LOG A FORENSIC EVENT.
           </Typography>
           
           <TextField
             fullWidth type="datetime-local" label="NEW TARGET WINDOW"
             InputLabelProps={{ shrink: true, sx: { fontWeight: '1000', color: '#5D4037' } }}
             value={rescheduleData.newDate}
             onChange={(e) => setRescheduleData(prev => ({ ...prev, newDate: e.target.value }))}
             sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 0, borderColor: '#5D4037' } }}
           />

           <Typography variant="overline" sx={{ fontWeight: '1000', color: '#D32F2F', display: 'block', mb: 1 }}>
               MANDATORY FORENSIC JUSTIFICATION
           </Typography>
           <TextField
             fullWidth multiline rows={3} placeholder="Provide justification for this shift..."
             value={rescheduleData.reason}
             onChange={(e) => setRescheduleData(prev => ({ ...prev, reason: e.target.value }))}
             sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
           />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037' }}>
           <Button onClick={() => setOpenReschedule(false)} sx={{ fontWeight: '1000', color: '#757575' }}>Cancel</Button>
           <Button 
             variant="contained" 
             disabled={!rescheduleData.newDate || !rescheduleData.reason.trim()}
             sx={{ bgcolor: '#5D4037', fontWeight: '1000', px: 4, borderRadius: 0 }}
             onClick={handleReschedule}
           >
             Apply Shift
           </Button>
        </DialogActions>
      </Dialog>

      <Drawer
        anchor="right"
        open={openDrawer}
        onClose={() => setOpenDrawer(false)}
        PaperProps={{ sx: { width: 350, p: 3, bgcolor: '#FFF8E1', borderLeft: '3px solid #5D4037', borderRadius: 0 } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: 1 }}>
             Filter Facets
          </Typography>
          <IconButton onClick={() => setOpenDrawer(false)}><CloseIcon /></IconButton>
        </Box>

        <Stack spacing={4}>
           <FormControl fullWidth variant="outlined">
              <InputLabel sx={{ fontWeight: '1000', color: '#5D4037' }}>ASSIGNED VET</InputLabel>
              <Select
                value={facets.assignedVetId}
                label="ASSIGNED VET"
                onChange={(e) => setFacets(prev => ({ ...prev, assignedVetId: e.target.value }))}
                sx={{ borderRadius: 0, bgcolor: 'white' }}
              >
                <MenuItem value=""><em>Any Veterinarian</em></MenuItem>
                {vets.map(v => (
                  <MenuItem key={v.id} value={v.id}>{v.fullName || v.name}</MenuItem>
                ))}
              </Select>
           </FormControl>

           <FormControl fullWidth variant="outlined">
              <InputLabel sx={{ fontWeight: '1000', color: '#5D4037' }}>CLINICAL DEPT</InputLabel>
              <Select
                value={facets.serviceCategory}
                label="CLINICAL DEPT"
                onChange={(e) => setFacets(prev => ({ ...prev, serviceCategory: e.target.value }))}
                sx={{ borderRadius: 0, bgcolor: 'white' }}
              >
                <MenuItem value=""><em>All Departments</em></MenuItem>
                {departments.map((d, i) => (
                  <MenuItem key={i} value={d}>{d}</MenuItem>
                ))}
              </Select>
           </FormControl>

           <FormControl fullWidth variant="outlined">
              <InputLabel sx={{ fontWeight: '1000', color: '#5D4037' }}>PATIENT SPECIES</InputLabel>
              <Select
                value={facets.petSpecies}
                label="PATIENT SPECIES"
                onChange={(e) => setFacets(prev => ({ ...prev, petSpecies: e.target.value }))}
                sx={{ borderRadius: 0, bgcolor: 'white' }}
              >
                <MenuItem value=""><em>All Species</em></MenuItem>
                <MenuItem value="Canine">Canine</MenuItem>
                <MenuItem value="Feline">Feline</MenuItem>
                <MenuItem value="Bird">Bird</MenuItem>
                <MenuItem value="Exotic">Exotic</MenuItem>
              </Select>
           </FormControl>

           <Box>
              <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.65rem', mb: 1, textTransform: 'uppercase' }}>
                 Admission Origin
              </Typography>
              <RadioGroup
                value={facets.origin}
                onChange={(e) => setFacets(prev => ({ ...prev, origin: e.target.value }))}
              >
                <FormControlLabel value="" control={<Radio size="small" />} label={<Typography sx={{ fontWeight: '900', fontSize: '0.75rem' }}>Global Flow (All)</Typography>} />
                <FormControlLabel value="ONLINE" control={<Radio size="small" />} label={<Typography sx={{ fontWeight: '900', fontSize: '0.75rem' }}>Online Bookings Only</Typography>} />
                <FormControlLabel value="WALK_IN" control={<Radio size="small" />} label={<Typography sx={{ fontWeight: '900', fontSize: '0.75rem' }}>Walk-in / ER Only</Typography>} />
              </RadioGroup>
           </Box>

           <Divider sx={{ my: 2 }} />

           <Button 
             fullWidth variant="outlined" 
             onClick={() => setFacets({ assignedVetId: '', serviceCategory: '', petSpecies: '', origin: '' })}
             sx={{ border: '2px solid #5D4037', color: '#5D4037', fontWeight: '1000', borderRadius: 0 }}
           >
              Clear All Facets
           </Button>
        </Stack>
      </Drawer>

    </Box>
  );
}
