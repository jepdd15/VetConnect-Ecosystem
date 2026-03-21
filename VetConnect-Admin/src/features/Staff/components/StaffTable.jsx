import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Chip, IconButton, Tooltip, Avatar, Paper } from '@mui/material';

// Icons
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BadgeIcon from '@mui/icons-material/Badge';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import WorkIcon from '@mui/icons-material/Work';
import PhoneIcon from '@mui/icons-material/Phone';

export default function StaffTable({ data, getWorkload, onEdit, onDelete, glassStyle,departments }) {

  const columns =[
    { 
      field: 'fullName', headerName: 'Staff Name', flex: 1.8, 
      renderCell: (p) => {
        const cleanName = p.value ? p.value.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '') : '?';
        const isAdmin = p.row.accessLevel === 'admin' || p.row.role === 'admin';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
            <Avatar sx={{ bgcolor: isAdmin ? '#D32F2F' : '#1565C0', width: 45, height: 45, fontWeight: '900', fontSize: '1.2rem', boxShadow: 1 }}>
              {cleanName[0].toUpperCase()}
            </Avatar>
            <Box sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="body1" fontWeight="900" color="#3E2723" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {p.value} {isAdmin && <AdminPanelSettingsIcon sx={{fontSize: 16, color: '#D32F2F'}}/>}
              </Typography>
              <Typography variant="caption" color="textSecondary" noWrap sx={{ mt: 0.2 }}>{p.row.email}</Typography>
              
              {/* THE FIX: Injecting the Phone Number into the taller row */}
              {p.row.phone && (
                  <Typography variant="caption" color="#1565C0" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.2, fontWeight: 'bold' }}>
                      <PhoneIcon sx={{ fontSize: 12 }} /> {p.row.phone}
                  </Typography>
              )}
            </Box>
          </Box>
        );
      }
    },
    { 
      field: 'accessLevel', headerName: 'System Access', flex: 0.8, 
      renderCell: (p) => {
          const level = p.row.accessLevel || (p.row.role === 'admin' ? 'admin' : 'staff');
          return <Chip icon={level === 'admin' ? <AdminPanelSettingsIcon/> : <BadgeIcon/>} label={level === 'admin' ? 'ADMIN' : 'STAFF'} color={level === 'admin' ? 'error' : 'default'} size="small" variant={level === 'admin' ? 'filled' : 'outlined'} sx={{fontWeight: '900', fontSize: '0.65rem'}}/>;
      }
    },
    { 
   field: 'departments', headerName: 'Assigned Departments', flex: 2.5, minWidth: 280,
   renderCell: (p) => {
     let deps = p.value || [];
     if (deps.length === 0) return <Typography variant="caption" fontStyle="italic">No departments assigned</Typography>;
     return (
       <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', alignItems: 'center', py: 1 }}>
         {deps.map((deptName, i) => {
           // THE FIX: Find the matching color from the master list!
           const deptObj = departments.find(d => d.name === deptName);
           const color = deptObj ? deptObj.color : '#616161'; // Default to Grey if not found
           
           return (
             <Chip 
               key={i} 
               label={deptName} 
               size="small" 
               sx={{ 
                 fontSize: '0.7rem', 
                 color: 'white',
                 bgcolor: color, 
                 fontWeight: '900', 
                 height: 22,
                 border: '1px solid rgba(0,0,0,0.1)'
               }} 
             />
           );
         })}
       </Box>
     );
   }
 },
    { 
      field: 'specialty', headerName: 'Job Title / Tag', flex: 1,
      renderCell: (p) => (
        p.value && p.value !== 'N/A' ? <Chip icon={<WorkIcon/>} label={p.value} size="small" sx={{color: '#5D4037', bgcolor: '#EFEBE9', fontWeight: 'bold'}} /> : <Typography variant="caption" color="textSecondary" fontStyle="italic">No tag</Typography>
      )
    },
    { 
      field: 'workload', headerName: 'Live Status', flex: 0.8, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const deps = p.row.departments || [];
        if (deps.length === 0 && !['veterinarian', 'groomer'].includes(p.row.role)) {
          return <Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic' }}>N/A</Typography>;
        }
        
        const load = getWorkload(p.row.id); // Securely filtering by ID
        const isBusy = load > 0;
        return (
          <Tooltip title={`${load} active patients assigned`}>
            <Chip 
              icon={<LocalHospitalIcon fontSize="small"/>} 
              label={isBusy ? `${load} Active` : 'Available'} 
              size="small" 
              color={isBusy ? "warning" : "success"} 
              variant={isBusy ? "filled" : "outlined"} 
              sx={{ fontWeight: 'bold', fontSize: '0.7rem', height: 22 }} 
            />
          </Tooltip>
        );
      }
    },
    { 
      field: 'actions', headerName: 'Actions', flex: 0.7, align: 'center', headerAlign: 'center',
      renderCell: (p) => (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', gap: 1 }}>
          <Tooltip title="Edit Profile"><IconButton color="primary" size="small" onClick={() => onEdit(p.row)}><EditIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Revoke Access"><IconButton color="error" size="small" onClick={() => onDelete(p.row.id, p.row.fullName)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
      ) 
    }
  ];

  return (
    // THE FIX: Stretched the table to the bottom of the screen
    <Paper elevation={0} sx={{ ...glassStyle, height: 'calc(100vh - 210px)', minHeight: 400, width: '100%', overflow: 'hidden' }}>

      <DataGrid 
        rows={data} 
        columns={columns} 
        disableSelectionOnClick 
        rowHeight={90} // THE FIX: Taller rows to fit the phone number
        sx={{ 
          border: 'none', bgcolor: 'transparent',
          '& .MuiDataGrid-columnHeaders': { bgcolor: 'rgba(255, 255, 255, 0.4)', color: '#5D4037', fontWeight: 'bold', fontSize: '0.95rem', borderBottom: '1px solid rgba(255, 255, 255, 0.5)'},
          '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(224, 224, 224, 0.4)' }, 
          '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(255, 255, 255, 0.6)' }
        }} 
      />
    </Paper>
  );
}