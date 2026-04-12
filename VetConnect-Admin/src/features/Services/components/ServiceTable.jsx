import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Chip, IconButton, Tooltip, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Collapse, TableSortLabel
} from '@mui/material';

import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import HistoryIcon from '@mui/icons-material/History';
import CircleIcon from '@mui/icons-material/Circle';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ScienceIcon from '@mui/icons-material/Science';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import VaccineIcon from '@mui/icons-material/Medication';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import DescriptionIcon from '@mui/icons-material/Description';

export default function ServiceTable({ data, onEdit, onArchive, onRestore, onDelete, onLog, clinicalFlatStyle, departments, showArchived }) {

  const [expandedRows, setExpandedRows] = useState({});
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('name');

  const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

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
          valA = a.name || ''; valB = b.name || '';
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
          valA = parseFloat(a.price) || 0; valB = parseFloat(b.price) || 0;
          return order === 'asc' ? valA - valB : valB - valA;
        default:
          return 0;
      }
    };
    return [...data].sort(comparator);
  }, [data, order, orderBy]);

  const getCategoryIcon = (cat) => {
    switch (cat) {
      case 'Grooming':    return <ContentCutIcon fontSize="inherit" />;
      case 'Laboratory':  return <ScienceIcon fontSize="inherit" />;
      case 'Surgery':     return <LocalHospitalIcon fontSize="inherit" />;
      case 'Vaccination': return <VaccineIcon fontSize="inherit" />;
      default:            return <MedicalServicesIcon fontSize="inherit" />;
    }
  };

  const getSpeciesEmoji = (species) => {
    switch (species) { case 'Canine': return '🐶'; case 'Feline': return '🐱'; default: return '🐾'; }
  };

  // Resolve display price (tiered or flat)
  const getPriceDisplay = (row) => {
    if (row.hasTieredPricing && row.pricingTiers?.length > 0) {
      const prices = row.pricingTiers.map(t => t.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max ? `₱${min.toFixed(2)}` : `₱${min.toFixed(2)} – ₱${max.toFixed(2)}`;
    }
    return `₱${parseFloat(row.price || 0).toFixed(2)}`;
  };

  const headerSx = {
    fontWeight: '1000', color: '#5D4037', bgcolor: '#FFF8E1',
    fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1,
    borderBottom: '2px solid #5D4037',
  };

  return (
    <Paper sx={{ flex: 1, minHeight: 0, width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', bgcolor: 'transparent', border: '0px', boxShadow: 'none', borderRadius: 0 }}>
      <TableContainer sx={{
        flex: 1, overflow: 'auto',
        '&::-webkit-scrollbar': { width: '8px', height: '8px' },
        '&::-webkit-scrollbar-track': { background: '#FFF8E1' },
        '&::-webkit-scrollbar-thumb': { background: '#5D4037', borderRadius: '4px' },
        '&::-webkit-scrollbar-thumb:hover': { background: '#3E2723' },
      }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40, ...headerSx }} />
              <TableCell sx={headerSx}>
                <TableSortLabel active={orderBy === 'name'} direction={orderBy === 'name' ? order : 'asc'} onClick={() => handleRequestSort('name')}>Service Name</TableSortLabel>
              </TableCell>
              <TableCell sx={headerSx}>
                <TableSortLabel active={orderBy === 'department'} direction={orderBy === 'department' ? order : 'asc'} onClick={() => handleRequestSort('department')}>Department</TableSortLabel>
              </TableCell>
              <TableCell sx={headerSx}>
                <TableSortLabel active={orderBy === 'duration'} direction={orderBy === 'duration' ? order : 'asc'} onClick={() => handleRequestSort('duration')}>Time Block</TableSortLabel>
              </TableCell>
              <TableCell sx={headerSx}>
                <TableSortLabel active={orderBy === 'price'} direction={orderBy === 'price' ? order : 'asc'} onClick={() => handleRequestSort('price')}>Price</TableSortLabel>
              </TableCell>
              <TableCell sx={headerSx}>Operational Tags</TableCell>
              <TableCell sx={{ ...headerSx, textAlign: 'center' }}>Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {sortedData.map((row) => {
              const isExpanded = expandedRows[row.id];
              const deptName   = row.department || row.category || 'General';
              const deptObj    = (departments || []).find(d => d.name === deptName);
              const badgeColor = deptObj ? deptObj.color : '#616161';
              const hasDesc    = row.description && row.description.trim().length > 0;

              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    hover
                    onClick={() => { if (hasDesc) toggleRow(row.id); }}
                    sx={{
                      '& > *': { borderBottom: 'unset' },
                      cursor: hasDesc ? 'pointer' : 'default',
                      opacity: row.isArchived ? 0.6 : 1,
                      bgcolor: row.isArchived ? 'rgba(230, 81, 0, 0.03)' : 'transparent',
                    }}
                  >
                    <TableCell>
                      {hasDesc && (
                        <IconButton size="small">
                          {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      )}
                    </TableCell>

                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight="900" color="#3E2723" noWrap>
                          {getSpeciesEmoji(row.targetSpecies)} {row.name}
                        </Typography>
                        {row.isArchived && (
                          <Chip label="Archived" size="small" sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontSize: '0.6rem', height: 18, fontWeight: 'bold' }} />
                        )}
                      </Box>
                    </TableCell>

                    <TableCell>
                      <Chip
                        icon={getCategoryIcon(deptName)}
                        label={deptName}
                        size="small"
                        sx={{ color: 'white', bgcolor: badgeColor, fontWeight: 'bold', boxShadow: `0 1px 3px ${badgeColor}99` }}
                      />
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" fontWeight="bold" color="#1565C0">
                        {row.duration || 30}m{' '}
                        <Typography component="span" variant="caption" color="textSecondary" fontWeight="bold">
                          + {row.bufferTime || 0}m buff
                        </Typography>
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography fontWeight="bold" color="#2E7D32">
                        {getPriceDisplay(row)}
                      </Typography>
                      {row.hasTieredPricing && (
                        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', fontSize: '0.62rem' }}>
                          weight-tiered
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {row.isWalkIn !== false && <Chip label="Walk-In" size="small" sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontSize: 10, height: 20, fontWeight: 'bold' }} />}
                        {row.isInpatient && <Chip label="Confinement" size="small" sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontSize: 10, height: 20, fontWeight: 'bold' }} />}
                        {row.isEmergency && <Chip label="Emergency" size="small" sx={{ bgcolor: '#FFEBEE', color: '#D32F2F', fontSize: 10, height: 20, fontWeight: 'bold' }} />}
                      </Box>
                    </TableCell>

                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                        <Tooltip title="View Audit Trail" arrow>
                          <IconButton size="small" onClick={() => onLog(row)} sx={{ color: '#424242', bgcolor: 'rgba(0,0,0,0.04)', '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' } }}>
                            <HistoryIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        {row.isArchived ? (
                          <Tooltip title="Restore Service" arrow>
                            <IconButton size="small" onClick={() => onRestore(row.id)} sx={{ color: '#2E7D32', bgcolor: 'rgba(46,125,50,0.08)', '&:hover': { bgcolor: 'rgba(46,125,50,0.2)' } }}>
                              <UnarchiveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <>
                            <Tooltip title="Edit Service" arrow>
                              <IconButton size="small" onClick={() => onEdit(row)} sx={{ color: '#F57C00', bgcolor: 'rgba(245,124,0,0.08)', '&:hover': { bgcolor: 'rgba(245,124,0,0.2)' } }}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Archive Service" arrow>
                              <IconButton size="small" onClick={() => onArchive(row.id, row.name)} sx={{ color: '#E65100', bgcolor: 'rgba(230,81,0,0.08)', '&:hover': { bgcolor: 'rgba(230,81,0,0.2)' } }}>
                                <ArchiveIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}

                        <Tooltip title="Permanently Delete" arrow>
                          <IconButton size="small" onClick={() => onDelete(row.id, row.name)} sx={{ color: '#D32F2F', bgcolor: 'rgba(211,47,47,0.08)', '&:hover': { bgcolor: 'rgba(211,47,47,0.2)' } }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>

                  {/* Expandable SOP row */}
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1, my: 1, p: 2, bgcolor: '#FAF9F7', borderRadius: 0, border: '2px solid', borderColor: badgeColor, boxShadow: '4px 4px 0px rgba(0,0,0,0.05)' }}>
                          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: badgeColor, fontWeight: '1000', textTransform: 'uppercase', letterSpacing: 1 }}>
                            <DescriptionIcon fontSize="small" sx={{ color: badgeColor }} />
                            STANDARD OPERATING PROCEDURE (SOP) | DESCRIPTION & CLINICAL INSTRUCTIONS
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', color: '#3E2723', fontWeight: 'bold' }}>
                            {row.description}
                          </Typography>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}

            {sortedData.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 10, color: '#888', fontStyle: 'italic', border: 'none' }}>
                  {showArchived ? 'No archived services.' : 'No services found. Adjust filters or click "New Service".'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
