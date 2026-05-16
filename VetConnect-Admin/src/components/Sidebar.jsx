import React, { useState } from 'react';
import { Drawer, List, ListItemButton, ListItemIcon, ListItemText, Box, Typography, Divider, Button, Badge, IconButton, Avatar, Paper } from '@mui/material';
import { useMediaQuery, useTheme } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useNavigate, useLocation } from 'react-router-dom';

// Design Tokens
import { FONT, COLORS } from '../theme/designTokens';

// Context
import { useUser } from '../context/UserContext';

// Brand
import clinicLogo from '../assets/clinic_logo.png';


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

  const { profile } = useUser();


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
          <Box
            component="img"
            src={clinicLogo}
            alt="Starbarks"
            sx={{ width: 40, height: 40, display: 'block', borderRadius: '50%' }}
          />
          <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>VetConnect</Typography>
        </Box>

        <Box sx={{ flexGrow: 1, overflowY: 'auto', py: 2 }}>
          <List sx={{ p: 0 }}>
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
        </Box>

        <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />

        {/* LOBBY MONITOR — opens fullscreen in new tab */}
        <Box sx={{ px: 3, pt: 2 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<TvIcon />}
            onClick={() => window.open('/monitor', '_blank')}
            sx={{ 
              fontWeight: 900, 
              py: 1.2, 
              borderRadius: 0, 
              color: COLORS.amber, 
              borderColor: 'white', 
              borderWidth: '2px',
              textTransform: 'uppercase',
              letterSpacing: 1,
              boxShadow: `4px 4px 0px rgba(0,0,0,0.3)`,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: 'white', borderWeight: '2px', transform: 'translate(-1px, -1px)', boxShadow: `6px 6px 0px rgba(0,0,0,0.4)` } 
            }}
          >
            Lobby Monitor
          </Button>
        </Box>

        {/* ACTIVE SESSION IDENTITY (T4.154: Identity Visibility) */}
        {profile && (
          <Box sx={{ p: 2, px: 3, mt: 1 }}>
            <Paper elevation={0} sx={{ 
              p: 1.5, 
              bgcolor: 'rgba(255,255,255,0.08)', 
              borderRadius: 0, 
              border: '2px solid rgba(255,255,255,0.2)',
              boxShadow: `4px 4px 0px rgba(0,0,0,0.3)`,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5
            }}>
              <Avatar sx={{ 
                width: 36, height: 36, fontSize: '0.9rem', fontWeight: 900,
                borderRadius: 0,
                bgcolor: COLORS.cream, color: COLORS.brand, border: `2px solid ${COLORS.accent}`
              }}>
                {(profile.fullName || '?')[0].toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 900, fontSize: '0.8rem', color: 'white', letterSpacing: 1, textTransform: 'uppercase' }}>
                  {profile.fullName}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: COLORS.success }} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Staff
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Box>
        )}

        {/* THE LOGOUT BUTTON */}
        <Box sx={{ p: 3, pt: profile ? 0 : 3 }}>
          <Button
            fullWidth
            variant="contained"
            color="error"
            startIcon={<LogoutIcon />}
            onClick={onLogout}
            sx={{ 
              fontWeight: 900, 
              py: 1.2, 
              borderRadius: 0,
              bgcolor: COLORS.danger,
              border: '2px solid white',
              textTransform: 'uppercase',
              letterSpacing: 1,
              boxShadow: `4px 4px 0px rgba(0,0,0,0.3)`,
              '&:hover': { bgcolor: COLORS.dangerHover, transform: 'translate(-1px, -1px)', boxShadow: `6px 6px 0px rgba(0,0,0,0.4)` }
            }}
          >
            Logout
          </Button>
        </Box>
      </Drawer>
    </>
  );
}