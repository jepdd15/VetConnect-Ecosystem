import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import {
  Box, CssBaseline, CircularProgress, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, InputAdornment, IconButton, Typography,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LockResetIcon from '@mui/icons-material/LockReset';
import { FONT, COLORS } from './theme/designTokens';
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

// --- COMPONENTS ---
import Sidebar from './components/Sidebar';

// --- PAGES ---
import Login from './pages/Login'; 
import Dashboard from './features/Dashboard/Dashboard';
import Queue from './features/Queue/Queue';
import Records from './features/Records/Records';
import Patients from './features/Patients/Patients'; 
import PatientDashboard from './features/Patients/PatientDashboard';
import Services from './features/Services/Services';
import Inventory from './features/Inventory/Inventory';
import Staff from './features/Staff/Staff';
import Sales from './features/Sales/Sales';      
import Expenses from './pages/Expenses'; 
import Monitor from './pages/Monitor';   
import Settings from './pages/Settings';
import Reports from './features/Reports/Reports';
import NotificationLogs from './pages/NotificationLogs';

// --- USER CONTEXT ---
import { UserProvider, useUser } from './context/UserContext';

// --- HOOKS ---
import { useLowStockCount } from './hooks/useLowStockCount';

// --- THEME (driven by designTokens.js) ---
const theme = createTheme({
  palette: {
    primary:    { main: COLORS.accentWarm },
    secondary:  { main: COLORS.accent },
    error:      { main: COLORS.danger },
    warning:    { main: COLORS.warning },
    success:    { main: COLORS.success },
    info:       { main: COLORS.info },
    background: { default: COLORS.surface, paper: COLORS.cardBg },
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: FONT },
});

// --- SMART LAYOUT HANDLER ---
const MainLayout = ({ children, onLogout }) => {
  const location = useLocation();
  const lowStockCount = useLowStockCount();

  if (location.pathname === '/monitor') {
    return <Box sx={{ width: '100vw', height: '100vh', overflow: 'hidden', bgcolor: COLORS.monitorBg }}>{children}</Box>;
  }
  return (
    <Box sx={{ display: 'flex', width: '100%', minHeight: '100vh' }}>
      <CssBaseline />
      <Sidebar onLogout={onLogout} lowStockCount={lowStockCount} />
      <Box component="main" sx={{ flexGrow: 1, p: 0, minHeight: '100vh', minWidth: 0, overflowX: 'hidden', background: `linear-gradient(160deg, ${COLORS.surface} 0%, #FFE0B2 100%)` }}>
        {children}
      </Box>
    </Box>
  );
};

// Allowed staff roles — must match Login.jsx allowedRoles
const STAFF_ROLES = ['admin', 'staff', 'veterinarian', 'groomer'];

// --- THE SECURE APP SHELL ---
function AppShell() {
  const { user, profile, loading } = useUser();

  // T4.137 — Password change dialog state
  const [currentPw, setCurrentPw] = React.useState('');
  const [newPw, setNewPw] = React.useState('');
  const [confirmPw, setConfirmPw] = React.useState('');
  const [showCurrentPw, setShowCurrentPw] = React.useState(false);
  const [showNewPw, setShowNewPw] = React.useState(false);
  const [pwLoading, setPwLoading] = React.useState(false);
  const [pwError, setPwError] = React.useState('');

  // T4.138 — Deactivation sign-out state
  const [deactivatedMsg, setDeactivatedMsg] = React.useState('');

  const handleLogout = () => {
    signOut(auth).catch((error) => {
      console.error("Logout Error:", error);
    });
  };

  // T4.137 — Reauthenticate, update Firebase Auth password, clear Firestore flag
  const handleChangePassword = async () => {
    setPwError('');

    if (!currentPw || !newPw || !confirmPw) {
      setPwError('All fields are required.');
      return;
    }
    if (newPw.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.');
      return;
    }
    if (newPw === currentPw) {
      setPwError('New password must be different from your current password.');
      return;
    }

    setPwLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPw);
      await updateDoc(doc(db, 'users', user.uid), { mustChangePassword: false });
      // Form state reset — onSnapshot in UserContext will flip profile.mustChangePassword
      // to false, causing the Dialog to close automatically.
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwError('');
    } catch (err) {
      const errorMap = {
        'auth/wrong-password':         'Current password is incorrect.',
        'auth/invalid-credential':     'Current password is incorrect.',
        'auth/weak-password':          'New password is too weak. Use at least 6 characters with a mix of letters and numbers.',
        'auth/requires-recent-login':  'Session expired. Please log out and log in again.',
        'auth/too-many-requests':      'Too many attempts. Please wait a few minutes.',
        'auth/network-request-failed': 'Network error. Check your connection and try again.',
      };
      setPwError(errorMap[err.code] || `Password update failed: ${err.message}`);
      console.error('[AppShell.handleChangePassword]:', err.code, err.message);
    } finally {
      setPwLoading(false);
    }
  };

  // T4.138 — Detect real-time deactivation and sign out immediately
  React.useEffect(() => {
    if (profile?.disabled === true && user) {
      setDeactivatedMsg('Your account has been deactivated. Contact the clinic administrator.');
      signOut(auth).catch(console.error);
    }
  }, [profile?.disabled, user]);

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: COLORS.surface }}>
      <CircularProgress color="primary" />
    </Box>
  );

  // --- ROUTE-LEVEL ROLE PROTECTION (Option B: belt-and-suspenders) ---
  // Even if Firebase Auth state says "logged in", we verify the Firestore
  // profile has a valid staff role and is not disabled.
  const isValidStaff = user
    && profile
    && !profile.disabled
    && (STAFF_ROLES.includes(profile.role) || STAFF_ROLES.includes(profile.accessLevel));

  return (
    <>
      {/* T4.138 — Deactivation Snackbar: rendered outside isValidStaff so it survives
          the signOut() redirect to /login. The 8 s duration gives the user time to read it. */}
      <Snackbar
        open={!!deactivatedMsg}
        autoHideDuration={8000}
        onClose={() => setDeactivatedMsg('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          onClose={() => setDeactivatedMsg('')}
          sx={{
            borderRadius: 0,
            fontWeight: 700,
            border: `2px solid ${COLORS.danger}`,
            boxShadow: `3px 3px 0px ${COLORS.danger}`,
          }}
        >
          {deactivatedMsg}
        </Alert>
      </Snackbar>

      <Routes>
        <Route
          path="/login"
          element={!user ? <Login /> : <Navigate to="/" replace />}
        />

        <Route
          path="/*"
          element={
            isValidStaff && profile.mustChangePassword ? (
              /* T4.137 — Blocking password change: rendered OUTSIDE MainLayout so
                 sidebar navigation is impossible. Only the Dialog and a minimal
                 branded backdrop are shown. */
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: COLORS.surface }}>
                <Dialog
                  open
                  onClose={() => {}}
                  disableEscapeKeyDown
                  slotProps={{ backdrop: { onClick: (e) => e.stopPropagation() } }}
                  PaperProps={{
                    sx: {
                      borderRadius: 0,
                      border: `2px solid ${COLORS.brand}`,
                      boxShadow: `6px 6px 0px ${COLORS.brand}`,
                      maxWidth: 440,
                      width: '100%',
                    },
                  }}
                >
                  <DialogTitle sx={{
                    bgcolor: COLORS.cream,
                    borderBottom: `2px solid ${COLORS.brand}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    fontWeight: 800,
                    color: COLORS.brand,
                  }}>
                    <LockResetIcon sx={{ color: COLORS.warning }} />
                    Change Your Password
                  </DialogTitle>

                  <DialogContent sx={{ pt: 3, pb: 2, px: 3, mt: 1 }}>
                    <Typography variant="body2" sx={{ mb: 3, color: COLORS.textSecondary }}>
                      You are using a temporary password. You must set a new password before
                      accessing the dashboard.
                    </Typography>

                    {pwError && (
                      <Alert
                        severity="error"
                        sx={{ mb: 2, borderRadius: 0, fontWeight: 600, border: `1px solid ${COLORS.danger}` }}
                      >
                        {pwError}
                      </Alert>
                    )}

                    <TextField
                      fullWidth
                      label="Current Password"
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowCurrentPw(!showCurrentPw)}>
                              {showCurrentPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />

                    <TextField
                      fullWidth
                      label="New Password"
                      type={showNewPw ? 'text' : 'password'}
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowNewPw(!showNewPw)}>
                              {showNewPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />

                    <TextField
                      fullWidth
                      label="Confirm New Password"
                      type={showNewPw ? 'text' : 'password'}
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    />
                  </DialogContent>

                  <DialogActions sx={{ px: 3, pb: 3, borderTop: `1px solid ${COLORS.border}` }}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={handleChangePassword}
                      disabled={pwLoading}
                      sx={{
                        bgcolor: COLORS.sky,
                        color: '#fff',
                        fontWeight: 700,
                        py: 1.2,
                        borderRadius: 0,
                        border: `2px solid ${COLORS.brand}`,
                        boxShadow: `3px 3px 0px ${COLORS.brand}`,
                        '&:hover': {
                          bgcolor: COLORS.skyHover,
                          transform: 'translate(1px, 1px)',
                          boxShadow: `2px 2px 0px ${COLORS.brand}`,
                        },
                        '&:active': { transform: 'translate(3px, 3px)', boxShadow: 'none' },
                        '&.Mui-disabled': { bgcolor: COLORS.border, border: `2px solid ${COLORS.border}` },
                      }}
                    >
                      {pwLoading
                        ? <CircularProgress size={22} sx={{ color: '#fff' }} />
                        : 'Update Password'}
                    </Button>
                  </DialogActions>
                </Dialog>
              </Box>
            ) : isValidStaff ? (
              <MainLayout onLogout={handleLogout}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/queue" element={<Queue />} />
                  <Route path="/records" element={<Records />} />
                  <Route path="/patients" element={<Patients />} />
                  <Route path="/patients/:id" element={<PatientDashboard />} />
                  <Route path="/services" element={<Services />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/staff" element={<Staff />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/monitor" element={<Monitor />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/notification-logs" element={<NotificationLogs />} />
                  {/* Fallback for unknown internal routes */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </MainLayout>
            ) : user && !profile ? (
              // Auth succeeded but profile not yet loaded — show loading spinner.
              // This prevents the "flash of dashboard" during the auth-state race window.
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: COLORS.surface }}>
                <CircularProgress color="primary" />
              </Box>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </>
  );
}

// --- THE MASTER WRAPPER ---
export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <UserProvider>
        <Router>
          <AppShell />
        </Router>
      </UserProvider>
    </ThemeProvider>
  );
}