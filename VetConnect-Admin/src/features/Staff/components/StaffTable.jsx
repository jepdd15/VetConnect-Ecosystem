import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Chip, IconButton, Tooltip, Avatar, Paper, Skeleton } from '@mui/material';
import { COLORS, FONT } from '../../../theme/designTokens';

// Icons
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BadgeIcon from '@mui/icons-material/Badge';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PhoneIcon from '@mui/icons-material/Phone';

export default function StaffTable({ data, getWorkload, onEdit, onDelete, departments, loading }) {

  const clinicalFlatStyle = {
    background: COLORS.cardBg,
    border: 'none',
    boxShadow: 'none',
    borderRadius: 0,
  };

  const columns = [
    {
      field: 'fullName', headerName: 'Staff Name', flex: 1.8,
      renderCell: (p) => {
        const cleanName = p.value ? p.value.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '') : '';
        const isAdmin = p.row.accessLevel === 'admin' || p.row.role === 'admin';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
            <Avatar sx={{ bgcolor: isAdmin ? COLORS.danger : COLORS.medical, width: 45, height: 45, fontWeight: '900', fontSize: '1.2rem', boxShadow: 1 }}>
              {(cleanName[0] || '?').toUpperCase()}
            </Avatar>
            <Box sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="body1" fontWeight="900" color={COLORS.brand} noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {p.value} {isAdmin && <AdminPanelSettingsIcon sx={{fontSize: 16, color: COLORS.danger}}/>}
              </Typography>
              <Typography variant="caption" color="textSecondary" noWrap sx={{ mt: 0.2 }}>{p.row.email}</Typography>

              {p.row.phone && (
                <Typography variant="caption" color={COLORS.medical} noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.2, fontWeight: 'bold' }}>
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
        return <Chip icon={level === 'admin' ? <AdminPanelSettingsIcon/> : <BadgeIcon/>} label={level === 'admin' ? 'CLINIC ADMINISTRATOR' : 'CLINICAL STAFF'} color={level === 'admin' ? 'error' : 'default'} size="small" variant={level === 'admin' ? 'filled' : 'outlined'} sx={{fontWeight: 900, fontSize: '0.65rem'}}/>;
      }
    },
    {
      field: 'departments', headerName: 'Assigned Departments', flex: 2.5, minWidth: 280,
      renderCell: (p) => {
        const deps = Array.isArray(p.value) ? p.value : [];
        if (deps.length === 0) return <Typography variant="caption" fontStyle="italic">No departments assigned</Typography>;
        return (
          <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', alignItems: 'center', py: 1 }}>
            {deps.map((deptName, i) => {
              // Null guard in case departments listener hasn't resolved yet (T2.225)
              const deptObj = (departments || []).find(d => d.name === deptName);
              const color = deptObj ? deptObj.color : '#616161';
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
      field: 'workload', headerName: 'Live Status', flex: 0.8, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const deps = p.row.departments || [];
        if (deps.length === 0 && !['veterinarian', 'groomer'].includes(p.row.role)) {
          return <Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic' }}>N/A</Typography>;
        }

        const load = getWorkload(p.row.id);
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
    <Paper elevation={0} sx={{
      ...clinicalFlatStyle,
      flex: 1,
      minHeight: 0,
      width: '100%',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {loading ? (
        <Box sx={{ p: 3 }}>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ mb: 1, borderRadius: 0 }} />
          ))}
        </Box>
      ) : (
        <DataGrid
          rows={data}
          columns={columns.map(c => ({
            ...c,
            headerClassName: 'forensic-header',
            headerName: c.headerName?.toUpperCase()
          }))}
          disableSelectionOnClick
          rowHeight={90}
          hideFooter={true}
          sx={{
            border: 'none',
            bgcolor: 'white',
            flex: 1,
            '& .forensic-header': {
              bgcolor: `${COLORS.cream} !important`,
              color: COLORS.accent,
              fontWeight: '900 !important',
              fontSize: '0.75rem',
              letterSpacing: 1,
              textTransform: 'uppercase',
              borderBottom: `2px solid ${COLORS.accent} !important`,
            },
            '& .MuiDataGrid-columnSeparator': { display: 'none' },
            '& .MuiDataGrid-cell': {
              display: 'flex',
              alignItems: 'center',
              borderBottom: `1px solid rgba(93, 64, 55, 0.08)`,
              fontFamily: FONT
            },
            '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(93, 64, 55, 0.04)' },
            '& .MuiDataGrid-virtualScroller': {
              '&::-webkit-scrollbar': { width: '8px', height: '8px' },
              '&::-webkit-scrollbar-track': { background: COLORS.cream },
              '&::-webkit-scrollbar-thumb': { background: COLORS.accent, borderRadius: 0 },
              '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand }
            }
          }}
        />
      )}
    </Paper>
  );
}
