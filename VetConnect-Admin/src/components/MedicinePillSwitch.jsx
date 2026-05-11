import { styled } from '@mui/material/styles';
import { Switch } from '@mui/material';

/**
 * Brand toggle switch used in Settings notification channel toggles.
 * Neubrutalist styling: solid colors, square thumb, brown brand palette,
 * hard offset shadow on the thumb for tactile feel.
 */
const MedicinePillSwitch = styled(Switch)(() => ({
  width: 56,
  height: 30,
  padding: 0,
  overflow: 'visible',
  '& .MuiSwitch-switchBase': {
    padding: 3,
    transitionDuration: '180ms',
    '&.Mui-checked': {
      transform: 'translateX(26px)',
      color: '#fff',
      '& .MuiSwitch-thumb': {
        backgroundColor: '#FFF8E1',     // cream thumb when ON
        border: '2px solid #3E2723',    // brand brown
        boxShadow: '2px 2px 0px rgba(62, 39, 35, 0.35)',
      },
      '& + .MuiSwitch-track': {
        opacity: 1,
        backgroundColor: '#5D4037',     // accent brown when ON
        border: '2px solid #3E2723',
      },
    },
    '&.Mui-disabled': {
      '& .MuiSwitch-thumb': {
        backgroundColor: '#EDE7E0',
        border: '2px solid #A1887F',
        boxShadow: 'none',
      },
      '& + .MuiSwitch-track': {
        backgroundColor: '#F5F0EB',
        border: '2px solid #D7CCC8',
        opacity: 1,
      },
    },
  },
  '& .MuiSwitch-thumb': {
    width: 22,
    height: 22,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    border: '2px solid #8D6E63',         // accentLight when OFF
    boxShadow: '2px 2px 0px rgba(141, 110, 99, 0.35)',
    boxSizing: 'border-box',
    transition: 'background-color 180ms, border-color 180ms, box-shadow 180ms',
  },
  '& .MuiSwitch-track': {
    opacity: 1,
    backgroundColor: '#EDE7E0',          // borderLight when OFF
    border: '2px solid #8D6E63',
    borderRadius: 3,
    transition: 'background-color 180ms, border-color 180ms',
  },
}));

export default MedicinePillSwitch;
