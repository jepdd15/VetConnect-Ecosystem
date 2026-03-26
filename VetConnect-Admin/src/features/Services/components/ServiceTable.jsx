import React, { useState, useMemo } from 'react';
import { 
  Box, Typography, Chip, IconButton, Paper, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Collapse, TableSortLabel
} from '@mui/material';

// Icons
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CircleIcon from '@mui/icons-material/Circle';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ScienceIcon from '@mui/icons-material/Science';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import VaccineIcon from '@mui/icons-material/Medication';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import DescriptionIcon from '@mui/icons-material/Description';

export default function ServiceTable({ data, onEdit, onDelete, glassStyle, departments }) {
  
  // --- STATE ---
  const [expandedRows, setExpandedRows] = useState({});
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('name');
  
  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // --- SORTING ENGINE ---
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedData = useMemo(() => {
    const comparator = (a, b) => {
      let valA, valB;
      switch (orderBy) {
        case 'name':
          valA = a.name || '';
          valB = b.name || '';
          return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'department':
          valA = a.department || a.category || 'General';
          valB = b.department || b.category || 'General';
          return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'duration':
          valA = (parseInt(a.duration) || 30) + (parseInt(a.bufferTime) || 0);
          valB = (parseInt(b.duration) || 30) + (parseInt(b.bufferTime) || 0);
          return order === 'asc' ? valA - valB : valB - valA;
        case 'price':
          valA = parseFloat(a.price) || 0;
          valB = parseFloat(b.price) || 0;
          return order === 'asc' ? valA - valB : valB - valA;
        default:
          return 0;
      }
    };
    return [...data].sort(comparator);
  },[data, order, orderBy]);

  // --- UI HELPERS ---
  const getCategoryIcon = (cat) => {
    switch(cat) {
      case 'Grooming': return <ContentCutIcon fontSize="inherit" />;
      case 'Laboratory': return <ScienceIcon fontSize="inherit" />;
      case 'Surgery': return <LocalHospitalIcon fontSize="inherit" />;
      case 'Vaccination': return <VaccineIcon fontSize="inherit" />;
      default: return <MedicalServicesIcon fontSize="inherit" />;
    }
  };

  const getSpeciesEmoji = (species) => {
      switch(species) { case 'Canine': return '🐶'; case 'Feline': return '🐱'; default: return '🐾'; }
  };

  return (
    <Paper elevation={0} sx={{ ...glassStyle, height: 'calc(100vh - 210px)', minHeight: 400, width: '100%', overflow: 'hidden' }}>
      <TableContainer sx={{ height: '100%', overflow: 'auto' }}>
        <Table stickyHeader size="small">
          
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40, bgcolor: 'rgba(255, 255, 255, 0.4)', borderBottom: '1px solid rgba(0,0,0,0.1)' }} />
              <TableCell sx={{ width: 50, bgcolor: 'rgba(255, 255, 255, 0.4)', borderBottom: '1px solid rgba(0,0,0,0.1)' }} />
              <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: 'rgba(255, 255, 255, 0.4)', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                <TableSortLabel active={orderBy === 'name'} direction={orderBy === 'name' ? order : 'asc'} onClick={() => handleRequestSort('name')}>Service Name</TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: 'rgba(255, 255, 255, 0.4)', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                <TableSortLabel active={orderBy === 'department'} direction={orderBy === 'department' ? order : 'asc'} onClick={() => handleRequestSort('department')}>Department</TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: 'rgba(255, 255, 255, 0.4)', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                <TableSortLabel active={orderBy === 'duration'} direction={orderBy === 'duration' ? order : 'asc'} onClick={() => handleRequestSort('duration')}>Time Block</TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: 'rgba(255, 255, 255, 0.4)', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                <TableSortLabel active={orderBy === 'price'} direction={orderBy === 'price' ? order : 'asc'} onClick={() => handleRequestSort('price')}>Price</TableSortLabel>
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: 'rgba(255, 255, 255, 0.4)', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>Operational Tags</TableCell>
              <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', bgcolor: 'rgba(255, 255, 255, 0.4)', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.1)', align: 'center' }}>Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {sortedData.map((row) => {
              const isExpanded = expandedRows[row.id];
              const deptName = row.department || row.category || 'General';
              const deptObj = (departments || []).find(d => d.name === deptName);
              const badgeColor = deptObj ? deptObj.color : '#616161';
              const hasDescription = row.description && row.description.trim().length > 0;

              return (
                <React.Fragment key={row.id}>
                  <TableRow 
                    hover 
                    onClick={() => { if(hasDescription) toggleRow(row.id) }} 
                    sx={{ '& > *': { borderBottom: 'unset' }, cursor: hasDescription ? 'pointer' : 'default' }}
                  >
                    <TableCell>
                      {hasDescription && (
                        <IconButton size="small">
                          {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      )}
                    </TableCell>
                    <TableCell>
                      <CircleIcon sx={{ color: badgeColor, fontSize: 18, boxShadow: `0 0 8px ${badgeColor}99`, borderRadius: '50%' }} /> 
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="900" color="#3E2723" noWrap>
                        {getSpeciesEmoji(row.targetSpecies)} {row.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        icon={getCategoryIcon(deptName)} 
                        label={deptName} 
                        size="small" 
                        sx={{ color: 'white', bgcolor: badgeColor, fontWeight:'bold', boxShadow: `0 1px 3px ${badgeColor}99` }} 
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold" color="#1565C0">
                        {row.duration || 30}m <Typography component="span" variant="caption" color="textSecondary" fontWeight="bold">+ {row.bufferTime || 0}m buff</Typography>
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight="bold" color="#2E7D32">
                        ₱{parseFloat(row.price||0).toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {row.isWalkIn && <Chip label="Walk-In" size="small" sx={{bgcolor:'#E3F2FD', color: '#1565C0', fontSize: 10, height: 20, fontWeight: 'bold'}} />}
                          {row.isInpatient && <Chip label="Confinement" size="small" sx={{bgcolor:'#FFF3E0', color: '#E65100', fontSize: 10, height: 20, fontWeight: 'bold'}} />}
                          {row.isEmergency && <Chip label="Emergency" size="small" sx={{bgcolor:'#FFEBEE', color: '#D32F2F', fontSize: 10, height: 20, fontWeight: 'bold'}} />}
                      </Box>
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                          <IconButton size="small" sx={{ color: '#1565C0' }} onClick={() => onEdit(row)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => onDelete(row.id, row.name)}><DeleteIcon fontSize="small" /></IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                  
                  {/* EXPANDABLE DESCRIPTION ROW */}
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1, my: 1, p: 2, bgcolor: '#F0F4F8', borderRadius: 2, borderLeft: '4px solid', borderColor: badgeColor }}>
                          <Typography variant="caption" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: badgeColor }}>
                            <DescriptionIcon fontSize="small" /> Standard Operating Procedure (SOP)
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                            {row.description}
                          </Typography>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>

        </Table>
      </TableContainer>
    </Paper>
  );
}