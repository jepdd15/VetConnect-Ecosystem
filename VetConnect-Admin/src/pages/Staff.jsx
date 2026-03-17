// HR configuration. Assigns "System Access Levels" (Admin vs Staff) and "Routing Departments" 
// (Grooming, Surgery) to power the mobile booking algorithm.

import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, Button, Dialog, DialogTitle, 
  DialogContent, DialogActions, TextField, MenuItem, Chip, IconButton, Tooltip, Avatar,
  InputAdornment, Alert, FormControl, InputLabel, Select, OutlinedInput, Checkbox, ListItemText, Grid
} from '@mui/material';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import WorkIcon from '@mui/icons-material/Work';
import SearchIcon from '@mui/icons-material/Search';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BadgeIcon from '@mui/icons-material/Badge';

const DEPARTMENTS =['Consultation', 'Vaccination', 'Surgery', 'Grooming', 'Laboratory', 'Other'];

export default function Staff() {
  const[users, setUsers] = useState([]);
  const [activeAppointments, setActiveAppointments] = useState([]);
  const [searchText, setSearchText] = useState('');

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null); 
  
  const[fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const[phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState(''); 
  
  // --- NEW ARCHITECTURE STATES ---
  const [accessLevel, setAccessLevel] = useState('staff'); // 'admin' or 'staff'
  const [departments, setDepartments] = useState([]); // Array of strings

  useEffect(() => {
    const unsubStaff = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter out pet owners. Include legacy roles for backward compatibility.
      const staffList = list.filter(u => ['veterinarian', 'staff', 'admin', 'groomer'].includes(u.role) || u.accessLevel);
      staffList.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
      setUsers(staffList);
    });

    const qAppts = query(collection(db, "appointments"), where("status", "in",["arrived", "in-consult", "confined"]));
    const unsubAppts = onSnapshot(qAppts, (snapshot) => {
      setActiveAppointments(snapshot.docs.map(d => d.data()));
    });

    return () => { unsubStaff(); unsubAppts(); };
  },[]);

  const filteredUsers = users.filter(u => {
    const name = (u.fullName || '').toLowerCase();
    const search = searchText.toLowerCase();
    return name.includes(search);
  });

  const getWorkload = (staffName) => {
    return activeAppointments.filter(a => a.assignedVet === staffName).length;
  };

  const handleOpenAdd = () => {
    setEditId(null); setFullName(''); setEmail(''); setPhone(''); setSpecialty('');
    setAccessLevel('staff'); setDepartments([]);
    setOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditId(user.id);
    setFullName(user.fullName || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setSpecialty(user.specialty || '');
    
    // Legacy Data Adapter
    if (user.accessLevel) {
        setAccessLevel(user.accessLevel);
        setDepartments(user.departments ||[]);
    } else {
        setAccessLevel(user.role === 'admin' ? 'admin' : 'staff');
        if (user.role === 'veterinarian') setDepartments(['Consultation', 'Vaccination', 'Surgery', 'Laboratory']);
        else if (user.role === 'groomer') setDepartments(['Grooming']);
        else setDepartments([]);
    }
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!fullName || !email) return alert("Name and Email are required");
    
    const payload = {
      fullName, email: email.trim().toLowerCase(), phone, specialty: specialty || 'N/A', 
      accessLevel, departments, 
      role: accessLevel, 
      updatedAt: new Date()
    };

    try {
      if (editId) await updateDoc(doc(db, "users", editId), payload);
      else { payload.createdAt = new Date(); await addDoc(collection(db, "users"), payload); }
      setOpen(false); 
    } catch (error) { alert("Error saving: " + error.message); }
  };

  const handleDelete = async (id, name) => {
    if(window.confirm(`Are you sure you want to revoke system access for ${name}?`)) {
      await deleteDoc(doc(db, "users", id));
    }
  };

  const handleDepartmentChange = (event) => {
    const { target: { value } } = event;
    setDepartments(typeof value === 'string' ? value.split(',') : value);
  };

  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', borderRadius: 3, 
  };

  // --- COLUMNS ---
  const columns =[
    { 
      field: 'fullName', headerName: 'Staff Name', flex: 1.5, minWidth: 250, 
      renderCell: (p) => {
        const cleanName = p.value ? p.value.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '') : '?';
        const isAdmin = p.row.accessLevel === 'admin' || p.row.role === 'admin';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
            <Avatar sx={{ bgcolor: isAdmin ? '#D32F2F' : '#1565C0', width: 40, height: 40, fontWeight: 'bold', boxShadow: 1 }}>
              {cleanName[0].toUpperCase()}
            </Avatar>
            <Box sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="body2" fontWeight="bold" color="#3E2723" noWrap>
                {p.value} {isAdmin && <AdminPanelSettingsIcon sx={{fontSize: 14, color: '#D32F2F', verticalAlign: 'middle', ml: 0.5}}/>}
              </Typography>
              <Typography variant="caption" color="textSecondary" noWrap>{p.row.email}</Typography>
            </Box>
          </Box>
        );
      }
    },
    { 
      field: 'accessLevel', headerName: 'System Access', flex: 0.8, minWidth: 130, 
      renderCell: (p) => {
          const level = p.row.accessLevel || (p.row.role === 'admin' ? 'admin' : 'staff');
          return <Chip icon={level === 'admin' ? <AdminPanelSettingsIcon/> : <BadgeIcon/>} label={level === 'admin' ? 'ADMIN' : 'STAFF'} color={level === 'admin' ? 'error' : 'default'} size="small" sx={{fontWeight: 'bold', fontSize: '0.7rem'}}/>;
      }
    },
    { 
      field: 'departments', headerName: 'Assigned Departments', flex: 2, minWidth: 250,
      renderCell: (p) => {
        let deps = p.value ||[];
        if (!p.row.accessLevel) {
            if (p.row.role === 'veterinarian') deps =['Consultation', 'Vaccination', 'Surgery'];
            else if (p.row.role === 'groomer') deps = ['Grooming'];
        }
        
        if (deps.length === 0) return <Typography variant="caption" color="textSecondary" fontStyle="italic">No departments assigned</Typography>;
        return (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', height: '100%' }}>
            {deps.map((d, i) => ( <Chip key={i} label={d} size="small" sx={{ fontSize: '0.65rem', bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 'bold' }} /> ))}
          </Box>
        );
      }
    },
    { 
      field: 'specialty', headerName: 'Job Title / Tag', flex: 1, minWidth: 150,
      renderCell: (p) => (
        p.value && p.value !== 'N/A' ? <Chip icon={<WorkIcon/>} label={p.value} size="small" variant="outlined" sx={{color: '#5D4037', borderColor: '#D7CCC8', bgcolor: 'white'}} /> : <Typography variant="caption" color="textSecondary" fontStyle="italic">No tag</Typography>
      )
    },
    { 
      field: 'workload', headerName: 'Live Status', width: 130, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const deps = p.row.departments || [];
        if (deps.length === 0 && !['veterinarian', 'groomer'].includes(p.row.role)) return <Typography variant="caption" color="textSecondary">-</Typography>;
        
        const load = getWorkload(p.row.fullName);
        const isBusy = load > 0;
        return (
          <Tooltip title={`${load} active patients assigned`}>
            <Chip icon={<LocalHospitalIcon fontSize="small"/>} label={isBusy ? `${load} Active` : 'Available'} size="small" color={isBusy ? "warning" : "success"} variant={isBusy ? "filled" : "outlined"} sx={{ fontWeight: 'bold', fontSize: '0.7rem', height: 22 }} />
          </Tooltip>
        );
      }
    },
    { 
      field: 'actions', headerName: 'Actions', width: 100, align: 'center', headerAlign: 'center',
      renderCell: (p) => (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Tooltip title="Edit Profile"><IconButton color="primary" size="small" onClick={() => handleOpenEdit(p.row)}><EditIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Revoke Access"><IconButton color="error" size="small" onClick={() => handleDelete(p.row.id, p.row.fullName)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
      ) 
    }
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>Staff & Resources</Typography>
        <Button variant="contained" startIcon={<PersonAddIcon />} sx={{ bgcolor: '#8B4513', fontWeight: 'bold' }} onClick={handleOpenAdd}>Add Staff</Button>
      </Box>

      <Paper elevation={0} sx={{ ...glassStyle, p: 2, mb: 3, display: 'flex', gap: 3, alignItems: 'center', bgcolor: 'white', borderRadius: 2, border: '1px solid #E0E0E0' }}>
        <TextField 
          size="small" placeholder="Search staff name..." value={searchText} onChange={(e) => setSearchText(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon color="disabled"/></InputAdornment>, spellCheck: 'false', 'data-gramm': 'false' }}
          sx={{ width: 300, bgcolor: '#FAFAFA' }}
        />
        <Typography variant="caption" sx={{ml: 'auto', color: '#888', fontWeight: 'bold'}}>{filteredUsers.length} Active Personnel</Typography>
      </Paper>

      <Paper elevation={0} sx={{ ...glassStyle, height: 'calc(100vh - 240px)', minHeight: 400, width: '100%', bgcolor: 'white', border: '1px solid #E0E0E0', borderRadius: 2, overflow: 'hidden' }}>
        <DataGrid 
          rows={filteredUsers} 
          columns={columns} 
          pageSize={10} 
          disableSelectionOnClick 
          rowHeight={70} 
          sx={{ 
            border: 'none', bgcolor: 'transparent',
            '& .MuiDataGrid-columnHeaders': { bgcolor: '#F5F5F5', color: '#5D4037', fontWeight: 'bold', fontSize: '0.95rem', borderBottom: '1px solid #E0E0E0'},
            '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', borderBottom: '1px solid #F5F5F5' }, 
            '& .MuiDataGrid-row:hover': { bgcolor: '#FAFAFA' }
          }} 
        />
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold', color: 'white', bgcolor: '#5D4037' }}>
          {editId ? "Edit Team Member" : "Register New Staff Member"}
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#FAFAFA', p: 3 }}>
          
          {!editId && (
            <Alert severity="info" sx={{ mb: 3, border: '1px solid #0288D1', borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight="bold">Authentication Notice:</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>Adding a staff member here grants them database permissions. To activate their login, <b>the staff member must click "Sign Up" on the VetConnect Mobile App using the exact email address provided below.</b></Typography>
            </Alert>
          )}

          <Grid container spacing={2}>
              <Grid item xs={12} sm={6}><TextField label="Full Name" fullWidth size="small" value={fullName} onChange={(e) => setFullName(e.target.value)} sx={{bgcolor: 'white'}} inputProps={{ spellCheck: 'false', 'data-gramm': 'false' }} /></Grid>
              <Grid item xs={12} sm={6}><TextField label="Phone Number" fullWidth size="small" value={phone} onChange={(e) => setPhone(e.target.value)} sx={{bgcolor: 'white'}} /></Grid>
              
              <Grid item xs={12}>
                <TextField 
                  label="Email Address (Login ID)" 
                  fullWidth size="small" value={email} onChange={(e) => setEmail(e.target.value)} 
                  disabled={!!editId} 
                  helperText={editId ? "Email acts as the unique login ID and cannot be changed." : "Must match the email they use to sign up on the mobile app."}
                  sx={{bgcolor: editId ? '#f5f5f5' : 'white'}} inputProps={{ spellCheck: 'false', 'data-gramm': 'false' }}
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small" sx={{bgcolor: 'white'}}>
                      <InputLabel>System Access Level</InputLabel>
                      <Select value={accessLevel} label="System Access Level" onChange={(e) => setAccessLevel(e.target.value)}>
                          <MenuItem value="staff">Standard Staff (Operations)</MenuItem>
                          <MenuItem value="admin" sx={{color: '#D32F2F', fontWeight: 'bold'}}>Clinic Admin (Full Access)</MenuItem>
                      </Select>
                  </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                  <TextField label="Job Title / Specialty Tag" fullWidth size="small" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. Senior Surgeon, Groomer" helperText="Appears on Patient Queue" sx={{bgcolor: 'white'}} inputProps={{ spellCheck: 'false', 'data-gramm': 'false' }} />
              </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ p: 2, mt: 3, bgcolor: 'white', borderRadius: 2, borderLeft: '4px solid #1565C0' }}>
             <Typography variant="subtitle2" fontWeight="bold" color="#1565C0" gutterBottom>SCHEDULING ROUTING (DEPARTMENTS)</Typography>
             <Typography variant="caption" color="textSecondary" display="block" sx={{mb: 2}}>Select which service categories this staff member is qualified to perform. The mobile app booking engine calculates capacity based on these selections.</Typography>
             
             <FormControl fullWidth size="small">
                <InputLabel>Assigned Departments</InputLabel>
                <Select
                  multiple
                  value={departments}
                  onChange={handleDepartmentChange}
                  input={<OutlinedInput label="Assigned Departments" />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => ( <Chip key={value} label={value} size="small" sx={{bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 'bold'}} /> ))}
                    </Box>
                  )}
                >
                  {DEPARTMENTS.map((dept) => (
                    <MenuItem key={dept} value={dept}>
                      <Checkbox checked={departments.indexOf(dept) > -1} size="small" />
                      <ListItemText primary={dept} />
                    </MenuItem>
                  ))}
                </Select>
             </FormControl>
          </Paper>

        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#EFEBE9' }}>
          <Button onClick={() => setOpen(false)} sx={{ fontWeight: 'bold', color: '#5D4037' }}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" sx={{ bgcolor: '#2E7D32', fontWeight: 'bold', px: 3 }}>
            {editId ? "Save Changes" : "Authorize Staff"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}