import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, Button, Dialog, DialogTitle, 
  DialogContent, DialogActions, TextField, MenuItem, Chip, IconButton, Tooltip,
  FormControlLabel, Switch, Grid, FormControl, InputLabel, Select, InputAdornment, Divider
} from '@mui/material';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Icons
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CircleIcon from '@mui/icons-material/Circle';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ScienceIcon from '@mui/icons-material/Science';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import VaccineIcon from '@mui/icons-material/Medication';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd'; 
import TimerIcon from '@mui/icons-material/Timer'; 
import SearchIcon from '@mui/icons-material/Search'; 

const BASE_UNITS =['Tablet', 'Capsule', 'Vial', 'Ampoule', 'ml', 'Piece', 'Can', 'Sachet', 'Syringe'];
const BUY_UNITS =['Box', 'Pack', 'Bottle', 'Tray', 'Case', 'Roll', 'Bag', 'Piece'];
const CATEGORIES =['All', 'Consultation', 'Vaccination', 'Surgery', 'Grooming', 'Laboratory', 'Other'];

export default function Services() {
  const [services, setServices] = useState([]);
  const[inventory, setInventory] = useState([]); 
  const[open, setOpen] = useState(false);
  const[editId, setEditId] = useState(null);

  const[searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const[filterSpecies, setFilterSpecies] = useState('All');

  const[formData, setFormData] = useState({
    name: '', category: 'Consultation', price: '', duration: '30', bufferTime: '5',
    color: '#1976D2', description: '', targetSpecies: 'Universal', requiredRole: 'veterinarian',
    linkedProduct: '', isWalkIn: true, isInpatient: false, isEmergency: false
  });

  useEffect(() => {
    const unsubServices = onSnapshot(collection(db, "services"), (snapshot) => { setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
    const unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => { setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
    return () => { unsubServices(); unsubInventory(); };
  },[]);

  const filteredServices = services.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(searchText.toLowerCase());
    const matchCategory = filterCategory === 'All' || s.category === filterCategory;
    const matchSpecies = filterSpecies === 'All' || s.targetSpecies === filterSpecies || s.targetSpecies === 'Universal';
    return matchSearch && matchCategory && matchSpecies;
  });

  const handleOpen = () => {
    setEditId(null);
    setFormData({ name: '', category: 'Consultation', price: '', duration: '30', bufferTime: '5', color: '#1976D2', description: '', targetSpecies: 'Universal', requiredRole: 'veterinarian', linkedProduct: '', isWalkIn: true, isInpatient: false, isEmergency: false });
    setOpen(true);
  };

  const handleEdit = (row) => {
    setEditId(row.id);
    setFormData({ ...row, category: row.category || 'Consultation', color: row.color || '#1976D2', requiredRole: row.requiredRole || 'veterinarian', bufferTime: row.bufferTime || '0', targetSpecies: row.targetSpecies || 'Universal', linkedProduct: row.linkedProduct || '' });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || formData.price === '') return alert("Name and Price are required.");
    const cleanDuration = parseInt(formData.duration.toString().replace(/[^0-9]/g, '')) || 30;
    const cleanBuffer = parseInt(formData.bufferTime.toString().replace(/[^0-9]/g, '')) || 0;
    const cleanPrice = parseFloat(formData.price.toString().replace(/[^0-9.]/g, '')) || 0;
    const payload = { ...formData, price: cleanPrice, duration: cleanDuration, bufferTime: cleanBuffer };
    try {
      if (editId) await updateDoc(doc(db, "services", editId), payload);
      else await addDoc(collection(db, "services"), payload);
      setOpen(false);
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (id) => { 
      if (confirm("Permanently delete this service? This cannot be undone.")) await deleteDoc(doc(db, "services", id)); 
  };

  const getCategoryIcon = (cat) => {
    switch(cat) {
      case 'Grooming': return <ContentCutIcon fontSize="small" />;
      case 'Laboratory': return <ScienceIcon fontSize="small" />;
      case 'Surgery': return <LocalHospitalIcon fontSize="small" />;
      case 'Vaccination': return <VaccineIcon fontSize="small" />;
      default: return <MedicalServicesIcon fontSize="small" />;
    }
  };

  const getSpeciesEmoji = (species) => {
      switch(species) { case 'Canine': return '🐶'; case 'Feline': return '🐱'; default: return '🐾'; }
  };

  const noExtensionProps = { spellCheck: 'false', 'data-gramm': 'false' };

  // --- COLUMNS ---
  const columns =[
    { 
      field: 'color', headerName: '', width: 50, align: 'center', headerAlign: 'center',
      renderCell: (p) => <CircleIcon sx={{ color: p.value || '#1976D2', fontSize: 18 }} /> 
    },
    { 
      field: 'name', headerName: 'Service Name', flex: 1.5, minWidth: 200, 
      renderCell: (p) => (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
              <Typography variant="body2" fontWeight="bold" color="#3E2723" noWrap>{getSpeciesEmoji(p.row.targetSpecies)} {p.value}</Typography>
              <Typography variant="caption" color="textSecondary" noWrap>{p.row.description || "No description"}</Typography>
          </Box>
      ) 
    },
    { 
      field: 'category', headerName: 'Category', flex: 1, minWidth: 140, 
      renderCell: (p) => <Chip icon={getCategoryIcon(p.value)} label={p.value || 'Consultation'} size="small" variant="outlined" sx={{ borderColor: p.row.color || '#1976D2', color: p.row.color || '#1976D2', fontWeight:'bold' }} />
    },
    
    { 
      field: 'duration', headerName: 'Time Block', flex: 1, minWidth: 120, 
      renderCell: (p) => {
          const dur = parseInt(p.value) || 30; const buff = parseInt(p.row.bufferTime) || 0;
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" fontWeight="bold">{dur}m <Typography component="span" variant="caption" color="textSecondary">+ {buff}m buff</Typography></Typography>
            </Box>
          );
      }
    },
    { field: 'price', headerName: 'Price', width: 100, renderCell: (p) => <Typography fontWeight="bold" color="green">₱{parseFloat(p.value||0).toFixed(2)}</Typography> },
    { 
      field: 'flags', headerName: 'Settings', flex: 1.5, minWidth: 200, 
      renderCell: (p) => (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', height: '100%' }}>
              {p.row.isWalkIn && <Chip label="Walk-In" size="small" sx={{bgcolor:'#E3F2FD', fontSize: 10, height: 20}} />}
              {p.row.isInpatient && <Chip label="Ward" size="small" sx={{bgcolor:'#FFF3E0', color: '#E65100', fontSize: 10, height: 20}} />}
              {p.row.isEmergency && <Chip label="Urgent" size="small" sx={{bgcolor:'#FFEBEE', color: '#D32F2F', fontSize: 10, height: 20}} />}
          </Box>
      ) 
    },
    { 
      field: 'actions', headerName: 'Actions', width: 100, align: 'center', headerAlign: 'center',
      renderCell: (p) => (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <IconButton size="small" color="primary" onClick={() => handleEdit(p.row)}><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" color="error" onClick={() => handleDelete(p.row.id)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
      ) 
    }
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>Service Catalog</Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#FF9800', fontWeight: 'bold' }} onClick={handleOpen}>New Service</Button>
      </Box>

      {/* FILTER CONTROL BAR */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, display: 'flex', gap: 3, alignItems: 'center', bgcolor: 'white', borderRadius: 2, border: '1px solid #E0E0E0' }}>
        <TextField size="small" placeholder="Search service name..." value={searchText} onChange={(e) => setSearchText(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon color="disabled" /></InputAdornment>, ...noExtensionProps }} sx={{ width: 300, bgcolor: '#FAFAFA' }} />
        <FormControl size="small" sx={{ width: 200, bgcolor: '#FAFAFA' }}><Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} inputProps={noExtensionProps}>{CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl>
        <FormControl size="small" sx={{ width: 150, bgcolor: '#FAFAFA' }}><Select value={filterSpecies} onChange={(e) => setFilterSpecies(e.target.value)} inputProps={noExtensionProps}><MenuItem value="All">All Species</MenuItem><MenuItem value="Universal">Universal</MenuItem><MenuItem value="Canine">Canine</MenuItem><MenuItem value="Feline">Feline</MenuItem></Select></FormControl>
        <Typography variant="caption" sx={{ml: 'auto', color: '#888', fontWeight: 'bold'}}>{filteredServices.length} Results</Typography>
      </Paper>

      {/* DATA GRID */}
      <Paper elevation={0} sx={{ height: 'calc(100vh - 240px)', minHeight: 400, width: '100%', bgcolor: 'white', border: '1px solid #E0E0E0', borderRadius: 2, overflow: 'hidden' }}>
        <DataGrid 
            rows={filteredServices} columns={columns} pageSize={10} disableSelectionOnClick rowHeight={70} 
            sx={{ 
                border: 'none', 
                '& .MuiDataGrid-columnHeaders': { bgcolor: '#F5F5F5', color: '#5D4037', fontWeight: 'bold', fontSize: '0.95rem', borderBottom: '1px solid #E0E0E0'},
                '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', borderBottom: '1px solid #F5F5F5' },
                '& .MuiDataGrid-row:hover': { bgcolor: '#FAFAFA' }
            }} 
        />
      </Paper>

      {/* --- HARDENED MODAL (MUI v6 Grid Syntax) --- */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold', color: 'white', bgcolor: '#5D4037' }}>
            {editId ? "Edit Service Configuration" : "Create New Service"}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3, bgcolor: '#FAFAFA' }}>
          
          <Typography variant="overline" color="primary" fontWeight="bold">SERVICE IDENTITY</Typography>
          
          <Grid container spacing={2} sx={{ mb: 3, mt: 0.5 }}>
            <Grid size={{ xs: 12, md: 8 }}>
                <TextField label="Service Name" fullWidth size="small" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., Canine Full Grooming" sx={{bgcolor: 'white'}} inputProps={noExtensionProps}/>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <FormControl fullWidth size="small" sx={{bgcolor: 'white'}}>
                    <InputLabel>Target Species</InputLabel>
                    <Select value={formData.targetSpecies || 'Universal'} label="Target Species" onChange={(e) => setFormData({...formData, targetSpecies: e.target.value})} inputProps={noExtensionProps}>
                        <MenuItem value="Universal">🐾 Universal</MenuItem>
                        <MenuItem value="Canine">🐶 Canine (Dog)</MenuItem>
                        <MenuItem value="Feline">🐱 Feline (Cat)</MenuItem>
                    </Select>
                </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 6 }}>
                <FormControl fullWidth size="small" sx={{bgcolor: 'white'}}>
                    <InputLabel>Category</InputLabel>
                    <Select value={formData.category || 'Consultation'} label="Category" onChange={(e) => setFormData({...formData, category: e.target.value})} inputProps={noExtensionProps}>
                        <MenuItem value="Consultation">Consultation</MenuItem>
                        <MenuItem value="Vaccination">Vaccination</MenuItem>
                        <MenuItem value="Surgery">Surgery</MenuItem>
                        <MenuItem value="Grooming">Grooming</MenuItem>
                        <MenuItem value="Laboratory">Laboratory</MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
                    </Select>
                </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 6 }}>
                <FormControl fullWidth size="small" sx={{bgcolor: 'white'}}>
                    <InputLabel>Color Tag</InputLabel>
                    <Select value={formData.color || '#1976D2'} label="Color Tag" onChange={(e) => setFormData({...formData, color: e.target.value})} inputProps={noExtensionProps}>
                        <MenuItem value="#1976D2"><Box display="flex" alignItems="center"><CircleIcon sx={{color:'#1976D2', mr:1, fontSize: 16}}/> Blue (Standard)</Box></MenuItem>
                        <MenuItem value="#2E7D32"><Box display="flex" alignItems="center"><CircleIcon sx={{color:'#2E7D32', mr:1, fontSize: 16}}/> Green (Medical)</Box></MenuItem>
                        <MenuItem value="#D32F2F"><Box display="flex" alignItems="center"><CircleIcon sx={{color:'#D32F2F', mr:1, fontSize: 16}}/> Red (Urgent)</Box></MenuItem>
                        <MenuItem value="#ED6C02"><Box display="flex" alignItems="center"><CircleIcon sx={{color:'#ED6C02', mr:1, fontSize: 16}}/> Orange (Lab)</Box></MenuItem>
                        <MenuItem value="#9C27B0"><Box display="flex" alignItems="center"><CircleIcon sx={{color:'#9C27B0', mr:1, fontSize: 16}}/> Purple (Grooming)</Box></MenuItem>
                        <MenuItem value="#5D4037"><Box display="flex" alignItems="center"><CircleIcon sx={{color:'#5D4037', mr:1, fontSize: 16}}/> Brown (Other)</Box></MenuItem>
                    </Select>
                </FormControl>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />
          
          <Typography variant="overline" color="primary" fontWeight="bold">LOGISTICS & BILLING</Typography>
          <Grid container spacing={2} sx={{ mt: 0.5, mb: 2 }}>
            <Grid size={{ xs: 12, sm: 4 }}><TextField label="Base Price" type="number" fullWidth size="small" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment>, spellCheck: 'false', 'data-gramm': 'false' }} sx={{bgcolor: 'white'}} /></Grid>
            <Grid size={{ xs: 6, sm: 4 }}><TextField label="Duration (Mins)" type="number" fullWidth size="small" value={formData.duration} onChange={(e) => setFormData({...formData, duration: e.target.value})} sx={{bgcolor: 'white'}} inputProps={{ spellCheck: 'false', 'data-gramm': 'false' }} /></Grid>
            <Grid size={{ xs: 6, sm: 4 }}><Tooltip title="Invisible time blocked after the appointment for room cleaning and typing notes."><TextField label="Buffer (Mins)" type="number" fullWidth size="small" value={formData.bufferTime} onChange={(e) => setFormData({...formData, bufferTime: e.target.value})} InputProps={{ startAdornment: <InputAdornment position="start"><TimerIcon fontSize="small" sx={{color:'#aaa'}}/></InputAdornment>, spellCheck: 'false', 'data-gramm': 'false' }} sx={{bgcolor: 'white'}} /></Tooltip></Grid>

            {/* NEW: THE SMART ROUTING EXPLANATION */}
            <Grid size={{ xs: 12, sm: 6 }}>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#FAFAFA', borderRadius: 1, border: '1px dashed #ccc', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <Typography variant="caption" fontWeight="bold" color="textSecondary" sx={{display:'block', mb: 0.5}}>RESOURCE ROUTING</Typography>
                    <Typography variant="body2" sx={{ lineHeight: 1.2 }}>
                        Mobile bookings for this service will automatically route to any staff member assigned to the <Chip label={formData.category || 'Consultation'} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 'bold', bgcolor: '#E3F2FD', color: '#1565C0' }} /> department.
                    </Typography>
                </Paper>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}><FormControl fullWidth size="small" sx={{bgcolor: 'white', height: '100%', justifyContent: 'center'}}><InputLabel>Auto-Deduct Inventory (Bundle)</InputLabel><Select value={formData.linkedProduct || ''} label="Auto-Deduct Inventory (Bundle)" onChange={(e) => setFormData({...formData, linkedProduct: e.target.value})} inputProps={{ spellCheck: 'false', 'data-gramm': 'false' }}><MenuItem value=""><em>None (Service Only)</em></MenuItem>{inventory.map(item => (<MenuItem key={item.id} value={item.id}>{item.itemName} (Current Stock: {item.stock})</MenuItem>))}</Select></FormControl></Grid>
            
            <Grid size={{ xs: 12 }}><TextField label="SOP / Description / Clinic Instructions" fullWidth multiline rows={2} size="small" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} sx={{bgcolor: 'white'}} inputProps={{ spellCheck: 'false', 'data-gramm': 'false' }} /></Grid>
          </Grid>
          
          <Typography variant="overline" color="textSecondary" fontWeight="bold">OPERATIONAL RULES</Typography>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'white', mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                  <FormControlLabel control={<Switch checked={formData.isWalkIn} onChange={(e) => setFormData({...formData, isWalkIn: e.target.checked})} color="primary" />} label={<Typography variant="body2" fontWeight="bold">Allow Walk-In</Typography>} />
                  <FormControlLabel control={<Switch checked={formData.isInpatient} onChange={(e) => setFormData({...formData, isInpatient: e.target.checked})} color="warning" />} label={<Typography variant="body2" fontWeight="bold">Req. Confinement</Typography>} />
                  <FormControlLabel control={<Switch checked={formData.isEmergency} onChange={(e) => setFormData({...formData, isEmergency: e.target.checked})} color="error" />} label={<Typography variant="body2" fontWeight="bold" color="error">Is Emergency</Typography>} />
              </Box>
          </Paper>

        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#EFEBE9' }}>
            <Button onClick={() => setOpen(false)} sx={{ fontWeight: 'bold', color: '#5D4037' }}>Cancel</Button>
            <Button onClick={handleSubmit} variant="contained" sx={{ bgcolor: '#2E7D32', fontWeight: 'bold', px: 3 }}>Save Configuration</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}