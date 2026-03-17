import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Box, CssBaseline, CircularProgress } from '@mui/material';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';

// --- COMPONENTS ---
import Sidebar from './components/Sidebar';

// --- PAGES ---
import Login from './pages/Login'; // <--- IMPORT THE NEW LOGIN PAGE
import Dashboard from './pages/Dashboard';
import Queue from './features/Queue/Queue';
import Patients from './features/Patients/Patients'; 
import Services from './pages/Services';
import Inventory from './features/Inventory/Inventory';
import Staff from './pages/Staff';
import Sales from './pages/Sales';       
import Expenses from './pages/Expenses'; 
import Monitor from './pages/Monitor';   
import Settings from './pages/Settings';

const theme = createTheme({
  palette: {
    primary: { main: '#8B4513' }, 
    secondary: { main: '#5D4037' }, 
    background: { default: '#FFF8E1', paper: '#ffffff' }, 
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: 'Roboto, Arial, sans-serif' }
});

const MainLayout = ({ children, onLogout }) => {
  const location = useLocation();
  const isMonitor = location.pathname === '/monitor'; 

  if (isMonitor) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', overflow: 'hidden', bgcolor: '#212121' }}>
        {children}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', width: '100vw', minHeight: '100vh' }}>
      <CssBaseline />
      <Sidebar onLogout={onLogout} />
      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1, 
          p: 4, 
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #FFF8E1 0%, #FFE0B2 100%)', 
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => { 
      setUser(u); 
      setLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = () => signOut(auth);

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#FFF8E1' }}>
      <CircularProgress color="primary" />
    </Box>
  );

  // --- RENDER LOGIN SCREEN (Unified and Professional) ---
  if (!user) return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Login /> {/* <--- The new professional component */}
    </ThemeProvider>
  );

  // --- RENDER THE FULL SYSTEM ---
  return (
    <ThemeProvider theme={theme}>
      <Router>
        <MainLayout onLogout={handleLogout}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/services" element={<Services />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/monitor" element={<Monitor />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </MainLayout>
      </Router>
    </ThemeProvider>
  );
}