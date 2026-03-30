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
import Dashboard from './pages/Dashboard';
import Queue from './features/Queue/Queue';
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
    return <Box sx={{ width: '100vw', height: '100vh', overflow: 'hidden', bgcolor: '#212121' }}>{children}</Box>;
  }
  return (
    <Box sx={{ display: 'flex', width: '100vw', minHeight: '100vh' }}>
      <CssBaseline />
      <Sidebar onLogout={onLogout} />
      <Box component="main" sx={{ flexGrow: 1, p: 4, minHeight: '100vh', minWidth: 0, overflowX: 'hidden', background: `linear-gradient(160deg, ${COLORS.surface} 0%, #FFE0B2 100%)` }}>
        {children}
      </Box>
    </Box>
  );
};

// --- THE SECURE APP SHELL ---
function AppShell() {
  const { user, loading } = useUser();

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

  // THE FIX: Using the <Navigate> component to handle secure routing paths correctly for Firebase Hosting.
  return (
    <Routes>
      <Route 
        path="/login" 
        element={!user ? <Login /> : <Navigate to="/" replace />} 
      />
      
      <Route 
        path="/*" 
        element={
          user ? (
            <MainLayout onLogout={handleLogout}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/queue" element={<Queue />} />
                <Route path="/patients" element={<Patients />} />
                <Route path="/patients/:id" element={<PatientDashboard />} />
                <Route path="/services" element={<Services />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/staff" element={<Staff />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/monitor" element={<Monitor />} />
                <Route path="/settings" element={<Settings />} />
                {/* Fallback for unknown internal routes */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </MainLayout>
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