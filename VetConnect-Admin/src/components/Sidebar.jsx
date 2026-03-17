// The master navigation drawer.
// Highlights the active page, establishes brand identity, and securely executes the Firebase signOut() 
// function.

import React from 'react';
import { Drawer, List, ListItemButton, ListItemIcon, ListItemText, Box, Typography, Divider, Button } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import QueueIcon from '@mui/icons-material/PeopleAlt'; 
import MedicalServicesIcon from '@mui/icons-material/MedicalServices'; 
import InventoryIcon from '@mui/icons-material/Store'; 
import PetsIcon from '@mui/icons-material/Pets';
import StaffIcon from '@mui/icons-material/AssignmentInd';
import TransactionIcon from '@mui/icons-material/ReceiptLong';
import ExpenseIcon from '@mui/icons-material/MoneyOff';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout'; 

const drawerWidth = 260;

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Patient Queue', icon: <QueueIcon />, path: '/queue' },
  { text: 'Patients (CRM)', icon: <PetsIcon />, path: '/patients' },
  { text: 'Services', icon: <MedicalServicesIcon />, path: '/services' },
  { text: 'Inventory', icon: <InventoryIcon />, path: '/inventory' },
  { text: 'Staff', icon: <StaffIcon />, path: '/staff' },
  { text: 'Transactions', icon: <TransactionIcon />, path: '/sales' },
  { text: 'Expenses', icon: <ExpenseIcon />, path: '/expenses' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];


export default function Sidebar({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { 
          width: drawerWidth, 
          boxSizing: 'border-box',
          backgroundColor: '#3E2723', 
          color: 'white',
          display: 'flex',
          flexDirection: 'column'
        },
      }}
    >
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <PetsIcon sx={{ color: '#FF9800' }} />
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>VetConnect</Typography>
      </Box>

      <List sx={{ flexGrow: 1, mt: 2 }}>
        {menuItems.map((item) => (
          <ListItemButton 
            key={item.text} 
            onClick={() => navigate(item.path)}
            sx={{
              backgroundColor: location.pathname === item.path ? 'rgba(255,255,255,0.15)' : 'transparent',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
              mx: 2,
              mb: 1,
              borderRadius: 2
            }}
          >
            <ListItemIcon sx={{ color: '#D7CCC8' }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: '600' }} />
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