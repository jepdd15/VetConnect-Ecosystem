import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Box, CssBaseline, CircularProgress } from '@mui/material';
import { FONT, COLORS } from './theme/designTokens';
import { signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';

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

// --- USER CONTEXT ---
import { UserProvider, useUser } from './context/UserContext';

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
  if (location.pathname === '/monitor') {
    return <Box sx={{ width: '100vw', height: '100vh', overflow: 'hidden', bgcolor: COLORS.monitorBg }}>{children}</Box>;
  }
  return (
    <Box sx={{ display: 'flex', width: '100%', minHeight: '100vh' }}>
      <CssBaseline />
      <Sidebar onLogout={onLogout} />
      <Box component="main" sx={{ flexGrow: 1, p: 0, minHeight: '100vh', minWidth: 0, overflowX: 'hidden', background: `linear-gradient(160deg, ${COLORS.surface} 0%, #FFE0B2 100%)` }}>
        {children}
      </Box>
    </Box>
  );
};

// Allowed staff roles — must match Login.jsx allowedRoles
const STAFF_ROLES = ['admin', 'staff', 'veterinarian', 'groomer'];

/** Route guard: wraps admin-only routes, redirects non-admins to "/" */
const AdminRoute = ({ children }) => {
  const { isAdmin } = useUser();
  return isAdmin ? children : <Navigate to="/" replace />;
};

// --- THE SECURE APP SHELL ---
function AppShell() {
  const { user, profile, isAdmin, loading } = useUser();

  const handleLogout = () => {
    signOut(auth).catch((error) => {
      console.error("Logout Error:", error);
    });
  };

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
    <Routes>
      <Route
        path="/login"
        element={!user ? <Login /> : <Navigate to="/" replace />}
      />

      <Route
        path="/*"
        element={
          isValidStaff ? (
            <MainLayout onLogout={handleLogout}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/queue" element={<Queue />} />
                <Route path="/records" element={<Records />} />
                <Route path="/patients" element={<Patients />} />
                <Route path="/patients/:id" element={<PatientDashboard />} />
                <Route path="/services" element={<Services />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/staff" element={<AdminRoute><Staff /></AdminRoute>} />
                <Route path="/sales" element={<AdminRoute><Sales /></AdminRoute>} />
                <Route path="/expenses" element={<AdminRoute><Expenses /></AdminRoute>} />
                <Route path="/monitor" element={<Monitor />} />
                <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
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