import { styled } from '@mui/material/styles';
import { Switch } from '@mui/material';

/**
 * Bespoke medicine pill toggle switch used across Settings (notification
 * reminders toggle) and InventoryCategoryManager (medicine/retail toggle).
 * Extracted from Settings.jsx so both consumers share one definition.
 */
const MedicinePillSwitch = styled(Switch)(({ theme }) => ({
  width: 62, height: 34, padding: 7,
  '& .MuiSwitch-switchBase': {
    margin: 1, padding: 0,
    transform: 'translateX(6px)',
    '&.Mui-checked': {
      color: '#fff',
      transform: 'translateX(22px)',
      '& .MuiSwitch-thumb:before': {
        background: 'linear-gradient(180deg, #D32F2F 50%, #FFFFFF 50%)', // Red/White Pill
      },
      '& + .MuiSwitch-track': {
        opacity: 1,
        backgroundColor: '#D32F2F20',
        border: '2px solid #D32F2F',
      },
    },
  },
  '& .MuiSwitch-thumb': {
    backgroundColor: '#fff',
    width: 32, height: 32,
    '&:before': {
      content: "''",
      position: 'absolute',
      width: '100%', height: '100%',
      left: 0, top: 0,
      background: 'linear-gradient(180deg, #9E9E9E 50%, #E0E0E0 50%)',
      borderRadius: '50%',
    },
  },
  '& .MuiSwitch-track': {
    opacity: 1,
    backgroundColor: '#00000010',
    borderRadius: 20,
    border: '2px solid #9E9E9E',
  },
}));

export default MedicinePillSwitch;
