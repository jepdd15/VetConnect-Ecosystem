import React from 'react';
import { 
  Drawer, List, ListItem, ListItemIcon, ListItemText, Box, Typography,
  ListItemButton, Button // NEW: The correct component for clickable items!
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import QueueIcon from '@mui/icons-material/PeopleAlt'; 
import MedicalServicesIcon from '@mui/icons-material/MedicalServices'; 
import InventoryIcon from '@mui/icons-material/Inventory'; 
import PetsIcon from '@mui/icons-material/Pets';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ReceiptIcon from '@mui/icons-material/Receipt';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';

const drawerWidth = 240;

const menuItems =[
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Patient Queue', icon: <QueueIcon />, path: '/queue' },
  { text: 'Patients (CRM)', icon: <PetsIcon />, path: '/patients' },
  { text: 'Services', icon: <MedicalServicesIcon />, path: '/services' },
  { text: 'Inventory', icon: <InventoryIcon />, path: '/inventory' },
  { text: 'Staff', icon: <AssignmentIndIcon />, path: '/staff' },
  { text: 'Transactions', icon: <ReceiptIcon />, path: '/sales' },
  { text: 'Expenses', icon: <MoneyOffIcon />, path: '/expenses' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

const Sidebar = () => {
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
          backgroundColor: '#5D4037', // Switched to the darker Starbarks brown
          color: 'white',
          borderRight: 'none'
        },
      }}
    >
      <Box sx={{ p: 2.5, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <PetsIcon /> VetConnect
        </Typography>
      </Box>

      {/* --- MENU LIST (UPGRADED TO LISTITEMBUTTON) --- */}
      <List sx={{ flexGrow: 1, p: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton 
              onClick={() => navigate(item.path)}
              selected={location.pathname === item.path} // Let the component handle selection state
              sx={{
                borderRadius: '8px',
                mb: 0.5,
                // Modern styling for selected items
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  '& .MuiListItemIcon-root': { color: 'white' },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.08)'
                }
              }}
            >
              <ListItemIcon sx={{ color: '#EFEBE9', minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 'bold' }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {/* --- LOGOUT BUTTON --- */}
      <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Button 
            fullWidth 
            startIcon={<LogoutIcon />}
            sx={{ 
                color: '#FFCDD2', 
                bgcolor: 'rgba(211, 47, 47, 0.2)',
                border: '1px solid #EF9A9A',
                fontWeight: 'bold',
                '&:hover': { bgcolor: 'rgba(211, 47, 47, 0.4)' }
            }}
            onClick={() => {
                // In a real app, you would call your auth logout function here
                // For now, it just navigates back to the root
                navigate('/');
            }}
          >
              Logout
          </Button>
      </Box>
    </Drawer>
  );
};

export default Sidebar;