import React from 'react';
import { Drawer, List, ListItemButton, ListItemIcon, ListItemText, Box, Typography, Divider, Button } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';

// Design Tokens
import { FONT, COLORS } from '../theme/designTokens';

// THE FIX: Import the Context to check roles!
import { useUser } from '../context/UserContext'; 

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import QueueIcon from '@mui/icons-material/PeopleAlt'; 
import HistoryIcon from '@mui/icons-material/History';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices'; 
import InventoryIcon from '@mui/icons-material/Store'; 
import PetsIcon from '@mui/icons-material/Pets';
import StaffIcon from '@mui/icons-material/AssignmentInd';
import TransactionIcon from '@mui/icons-material/ReceiptLong';
import ExpenseIcon from '@mui/icons-material/MoneyOff';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout'; 

const drawerWidth = 260;

// THE FIX: Mapped to "name" and "path" with explicit "adminOnly" security flags!
const menuItems =[
  { name: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { name: 'Patient Queue', icon: <QueueIcon />, path: '/queue' },
  { name: 'All Records', icon: <HistoryIcon />, path: '/records' },
  { name: 'Patients (CRM)', icon: <PetsIcon />, path: '/patients' },
  { name: 'Services', icon: <MedicalServicesIcon />, path: '/services' },
  { name: 'Inventory', icon: <InventoryIcon />, path: '/inventory' },
  
  // RESTRICTED MODULES
  { name: 'Staff', icon: <StaffIcon />, path: '/staff', adminOnly: true },
  { name: 'Transactions', icon: <TransactionIcon />, path: '/sales', adminOnly: true },
  { name: 'Expenses', icon: <ExpenseIcon />, path: '/expenses', adminOnly: true },
  { name: 'Settings', icon: <SettingsIcon />, path: '/settings', adminOnly: true },
];

export default function Sidebar({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  // SECURE HOOK: Checks if the logged-in user has an 'admin' token in the database
  const { isAdmin } = useUser(); 

  // THE FIX: The array filter. If it requires admin and they aren't one, slice it out of the array!
  const visibleMenuItems = menuItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { 
          width: drawerWidth, 
          boxSizing: 'border-box',
          backgroundColor: COLORS.brand, 
          color: 'white',
          display: 'flex',
          flexDirection: 'column'
        },
      }}
    >
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <PetsIcon sx={{ color: COLORS.cta }} />
        <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>VetConnect</Typography>
      </Box>

      <List sx={{ flexGrow: 1, mt: 2 }}>
        {/* Render ONLY the modules they have permission to see */}
        {visibleMenuItems.map((item) => (
          <ListItemButton 
            key={item.path} // Unique Key!
            onClick={() => navigate(item.path)}
            sx={{
              backgroundColor: location.pathname === item.path ? 'rgba(255,255,255,0.15)' : 'transparent',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
              mx: 2,
              mb: 1,
              borderRadius: 2
            }}
          >
            <ListItemIcon sx={{ color: COLORS.timelineRail }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.name} primaryTypographyProps={{ fontFamily: FONT, fontWeight: '600' }} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />

      {/* THE LOGOUT BUTTON */}
      <Box sx={{ p: 3 }}>
        <Button 
          fullWidth 
          variant="contained" 
          color="error" 
          startIcon={<LogoutIcon />}
          onClick={onLogout} 
          sx={{ fontWeight: 'bold', py: 1.2, borderRadius: 2 }}
        >
          Logout
        </Button>
      </Box>
    </Drawer>
  );
}