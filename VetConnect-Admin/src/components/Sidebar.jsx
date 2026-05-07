import React, { useState } from 'react';
import { Drawer, List, ListItemButton, ListItemIcon, ListItemText, Box, Typography, Divider, Button, Badge, IconButton } from '@mui/material';
import { useMediaQuery, useTheme } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useNavigate, useLocation } from 'react-router-dom';

// Design Tokens
import { FONT, COLORS } from '../theme/designTokens';

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
import TvIcon from '@mui/icons-material/Tv';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

const drawerWidth = 260;

// T4.154: All menu items are visible to all authenticated staff — no role gating.
const menuItems = [
  { name: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { name: 'Patient Queue', icon: <QueueIcon />, path: '/queue' },
  { name: 'Calendar', icon: <CalendarMonthIcon />, path: '/calendar' },
  { name: 'Visit Log', icon: <HistoryIcon />, path: '/records' },
  { name: 'Patients (CRM)', icon: <PetsIcon />, path: '/patients' },
  { name: 'Services', icon: <MedicalServicesIcon />, path: '/services' },
  { name: 'Inventory', icon: <InventoryIcon />, path: '/inventory' },
  { name: 'Staff', icon: <StaffIcon />, path: '/staff' },
  { name: 'Transactions', icon: <TransactionIcon />, path: '/sales' },
  { name: 'Quick Sale', icon: <ShoppingCartIcon />, path: '/sales', action: 'retailPOS' },
  { name: 'Expenses', icon: <ExpenseIcon />, path: '/expenses' },
  { name: 'Settings', icon: <SettingsIcon />, path: '/settings' },
  { name: 'Notification Logs', icon: <NotificationsActiveIcon />, path: '/notification-logs' },
];

export default function Sidebar({ onLogout, lowStockCount = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  // T4.154: All staff see all menu items — no filtering needed.
  const visibleMenuItems = menuItems;

  const handleNavClick = (path, action) => {
    if (action === 'retailPOS') {
      navigate('/sales', { state: { openRetailPOS: true } });
    } else {
      navigate(path);
    }
    if (isMobile) setMobileOpen(false);
  };

  return (
    <>
      {isMobile && !mobileOpen && (
        <IconButton
          onClick={() => setMobileOpen(true)}
          sx={{
            position: 'fixed',
            top: 12,
            left: 12,
            zIndex: theme.zIndex.drawer + 1,
            bgcolor: COLORS.brand,
            color: 'white',
            borderRadius: 0,
            '&:hover': { bgcolor: COLORS.accent },
          }}
        >
          <MenuIcon />
        </IconButton>
      )}
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? mobileOpen : true}
        onClose={isMobile ? () => setMobileOpen(false) : undefined}
        {...(isMobile && { ModalProps: { keepMounted: true } })}
        sx={{
          width: isMobile ? 0 : drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: COLORS.brand,
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
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
              key={item.action ? `${item.path}-${item.action}` : item.path}
              onClick={() => handleNavClick(item.path, item.action)}
              sx={{
                backgroundColor: !item.action && (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)) ? 'rgba(255,255,255,0.15)' : 'transparent',
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
                mx: 2,
                mb: 1,
                borderRadius: 0,
              }}
            >
              <ListItemIcon sx={{ color: COLORS.timelineRail }}>
                {item.name === 'Inventory' && lowStockCount > 0 ? (
                  <Badge
                    badgeContent={lowStockCount}
                    color="error"
                    max={99}
                    sx={{ '& .MuiBadge-badge': { fontWeight: 900, fontSize: '0.65rem' } }}
                  >
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              <ListItemText primary={item.name} primaryTypographyProps={{ fontFamily: FONT, fontWeight: '600' }} />
            </ListItemButton>
          ))}
        </List>

        <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />

        {/* LOBBY MONITOR — opens fullscreen in new tab */}
        <Box sx={{ px: 3, pt: 2 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<TvIcon />}
            onClick={() => window.open('/monitor', '_blank')}
            sx={{ fontWeight: 'bold', py: 1, borderRadius: 0, color: COLORS.amber, borderColor: COLORS.amber, '&:hover': { bgcolor: 'rgba(255,152,0,0.1)', borderColor: COLORS.amber } }}
          >
            Lobby Monitor
          </Button>
        </Box>

        {/* THE LOGOUT BUTTON */}
        <Box sx={{ p: 3 }}>
          <Button
            fullWidth
            variant="contained"
            color="error"
            startIcon={<LogoutIcon />}
            onClick={onLogout}
            sx={{ fontWeight: 'bold', py: 1.2, borderRadius: 0 }}
          >
            Logout
          </Button>
        </Box>
      </Drawer>
    </>
  );
}