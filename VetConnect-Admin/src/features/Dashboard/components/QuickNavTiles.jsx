import React from 'react';
import { Box, Typography, ButtonBase } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import PetsIcon from '@mui/icons-material/Pets';
import StoreIcon from '@mui/icons-material/Store';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import MoneyOffIcon from '@mui/icons-material/MoneyOff';

import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import { useUser } from '../../../context/UserContext';

const NAV_ITEMS = [
  { label: 'Queue',     path: '/queue',     icon: <PeopleAltIcon />,    color: COLORS.medical },
  { label: 'Patients',  path: '/patients',  icon: <PetsIcon />,         color: COLORS.accent },
  { label: 'Inventory', path: '/inventory', icon: <StoreIcon />,        color: COLORS.success },
  { label: 'Sales',     path: '/sales',     icon: <ReceiptLongIcon />,  color: COLORS.warning, adminOnly: true },
  { label: 'Expenses',  path: '/expenses',  icon: <MoneyOffIcon />,     color: COLORS.danger,  adminOnly: true },
];

/**
 * Sticky bottom navigation bar with shortcut tiles.
 *
 * Role-gated: Sales and Expenses tiles are hidden for non-admin users,
 * following the same pattern as Sidebar.jsx. Uses ButtonBase (not Button)
 * to minimize styling footprint. Tiles divide the full width equally.
 *
 * No shadows — tiles sit flush at the bottom edge of the viewport.
 */
export default function QuickNavTiles() {
  const navigate = useNavigate();
  const { isAdmin } = useUser();

  const visibleItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);

  return (
    <Box sx={{
      flexShrink: 0,
      bgcolor: COLORS.cardBg,
      borderTop: `2px solid ${COLORS.accent}`,
      display: 'flex',
      gap: 0,
    }}>
      {visibleItems.map(item => (
        <ButtonBase
          key={item.path}
          onClick={() => navigate(item.path)}
          sx={{
            flex: 1,
            py: 1.5,
            px: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            borderRight: `1px solid ${COLORS.borderLight}`,
            transition: 'background-color 0.1s ease',
            '&:hover': { bgcolor: COLORS.cream },
            '&:last-of-type': { borderRight: 'none' },
          }}
        >
          <Box sx={{ color: item.color }}>{item.icon}</Box>
          <Typography sx={{
            fontFamily: FONT,
            ...TYPE.label,
            color: COLORS.textSecondary,
            fontSize: '0.6rem',
          }}>
            {item.label}
          </Typography>
        </ButtonBase>
      ))}
    </Box>
  );
}
