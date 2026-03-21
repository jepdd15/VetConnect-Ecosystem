import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Chip, IconButton, Paper } from '@mui/material';

import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CircleIcon from '@mui/icons-material/Circle';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ScienceIcon from '@mui/icons-material/Science';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import VaccineIcon from '@mui/icons-material/Medication';

export default function ServiceTable({ data, onEdit, onDelete, glassStyle }) {
  
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

  const columns =[
    { 
      field: 'color', headerName: '', width: 50, align: 'center', headerAlign: 'center', sortable: false, disableColumnMenu: true,
      renderCell: (p) => <CircleIcon sx={{ color: p.value || '#1976D2', fontSize: 18 }} /> 
    },
    { 
      field: 'name', headerName: 'Service Name', flex: 1.5, minWidth: 200, 
      renderCell: (p) => (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
              <Typography variant="body2" fontWeight="900" color="#3E2723" noWrap>{getSpeciesEmoji(p.row.targetSpecies)} {p.value}</Typography>
              <Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic' }} noWrap>{p.row.description || "No description"}</Typography>
          </Box>
      ) 
    },
    { 
      field: 'category', headerName: 'Category', flex: 1, minWidth: 140, 
      renderCell: (p) => <Chip icon={getCategoryIcon(p.value)} label={p.value || 'Consultation'} size="small" variant="outlined" sx={{ borderColor: p.row.color || '#1976D2', color: p.row.color || '#1976D2', fontWeight:'bold', bgcolor: 'rgba(255,255,255,0.7)' }} />
    },
    { 
      field: 'duration', headerName: 'Time Block', flex: 1, minWidth: 120, 
      renderCell: (p) => {
          const dur = parseInt(p.value) || 30; const buff = parseInt(p.row.bufferTime) || 0;
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" fontWeight="bold" color="#1565C0">{dur}m <Typography component="span" variant="caption" color="textSecondary" fontWeight="bold">+ {buff}m buff</Typography></Typography>
            </Box>
          );
      }
    },
    { field: 'price', headerName: 'Price', width: 100, renderCell: (p) => <Typography fontWeight="bold" color="#2E7D32">₱{parseFloat(p.value||0).toFixed(2)}</Typography> },
    { 
      field: 'flags', headerName: 'Operational Tags', flex: 1.5, minWidth: 200, sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', height: '100%' }}>
              {p.row.isWalkIn && <Chip label="Walk-In" size="small" sx={{bgcolor:'#E3F2FD', color: '#1565C0', fontSize: 10, height: 20, fontWeight: 'bold'}} />}
              {p.row.isInpatient && <Chip label="Confinement" size="small" sx={{bgcolor:'#FFF3E0', color: '#E65100', fontSize: 10, height: 20, fontWeight: 'bold'}} />}
              {p.row.isEmergency && <Chip label="Emergency" size="small" sx={{bgcolor:'#FFEBEE', color: '#D32F2F', fontSize: 10, height: 20, fontWeight: 'bold'}} />}
          </Box>
      ) 
    },
    { 
      field: 'actions', headerName: 'Actions', width: 100, align: 'center', headerAlign: 'center', sortable: false, disableColumnMenu: true,
      renderCell: (p) => (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', gap: 1 }}>
              <IconButton size="small" sx={{ color: '#1565C0' }} onClick={() => onEdit(p.row)}><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" color="error" onClick={() => onDelete(p.row.id, p.row.name)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
      ) 
    }
  ];

  return (
    <Paper elevation={0} sx={{ ...glassStyle, height: 'calc(100vh - 210px)', minHeight: 400, width: '100%', overflow: 'hidden' }}>
      <DataGrid 
          rows={data} columns={columns} pageSize={10} disableSelectionOnClick rowHeight={70} 
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