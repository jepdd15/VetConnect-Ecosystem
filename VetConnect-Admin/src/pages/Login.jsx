import React, { useState } from 'react';
import { 
  Box, Typography, Paper, TextField, Button, IconButton, 
  InputAdornment, CircularProgress, Alert, Fade, Avatar, Divider 
} from '@mui/material';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

// Icons
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PetsIcon from '@mui/icons-material/Pets';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError('Please enter both email and password.');
    
    setLoading(true);
    setError('');

    try {
      // 1. Firebase Auth Check
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // 2. 🛡️ Role Validation Check
      const userDoc = await getDoc(doc(db, "users", uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const allowedRoles = ['admin', 'staff', 'veterinarian', 'groomer'];
        
        // If they are a pet_owner, kick them out of the Admin panel
        if (!allowedRoles.includes(userData.role) && !allowedRoles.includes(userData.accessLevel)) {
            await auth.signOut();
            setError('Access Denied. Admin credentials required.');
        }
      } else {
        await auth.signOut();
        setError('User profile not found.');
      }
    } catch (err) {
      setError('Invalid email or password.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* LEFT SIDE: THE HERO BRANDING (Visible only on medium screens and up) */}
      <Box sx={{ 
        flex: 1.2, 
        bgcolor: '#5D4037', 
        display: { xs: 'none', md: 'flex' }, 
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 6,
        position: 'relative',
      }}>
        {/* Background Decorative Paw Icon */}
        <PetsIcon sx={{ position: 'absolute', fontSize: 800, color: 'rgba(255,255,255,0.03)', right: -200, bottom: -200 }} />
        
        <Box sx={{ zIndex: 1, textAlign: 'center' }}>
            <Avatar sx={{ bgcolor: 'white', width: 80, height: 80, mb: 3, mx: 'auto', boxShadow: 4 }}>
                <PetsIcon sx={{ fontSize: 45, color: '#8B4513' }} />
            </Avatar>
            <Typography variant="h2" fontWeight="900" color="white" gutterBottom sx={{ letterSpacing: -1 }}>
                VetConnect
            </Typography>
            <Typography variant="h5" color="rgba(255,255,255,0.7)" sx={{ mb: 4, fontWeight: '300' }}>
                Starbarks Veterinary Clinic
            </Typography>
            <Divider sx={{ width: 60, height: 4, bgcolor: '#FF9800', borderRadius: 2, mx: 'auto', mb: 4 }} />
            <Typography variant="body1" color="rgba(255,255,255,0.5)" sx={{ maxWidth: 400, fontStyle: 'italic' }}>
                "Integrated clinical intelligence and operational excellence."
            </Typography>
        </Box>
      </Box>

      {/* RIGHT SIDE: THE LOGIN FORM */}
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        bgcolor: '#FFF8E1',
        backgroundImage: 'radial-gradient(#D7CCC8 0.5px, transparent 0.5px)',
        backgroundSize: '20px 20px' 
      }}>
        
        <Fade in={true} timeout={1000}>
            <Paper elevation={0} sx={{ 
                p: 5, 
                width: '100%', 
                maxWidth: 450, 
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                textAlign: 'center'
            }}>
                <AdminPanelSettingsIcon sx={{ fontSize: 50, color: '#5D4037', mb: 1 }} />
                <Typography variant="h4" fontWeight="bold" color="#3E2723" gutterBottom>
                    Staff Portal
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 4 }}>
                    Authorized Personnel Only
                </Typography>

                {error && <Alert severity="error" sx={{ mb: 3, textAlign: 'left', fontWeight: 'bold' }}>{error}</Alert>}

                <Box component="form" onSubmit={handleLogin}>
                    <TextField 
                        fullWidth label="Email Address" variant="outlined" sx={{ mb: 3, bgcolor: 'white' }}
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="vet@starbarks.com"
                    />
                    
                    <TextField 
                        fullWidth label="Password" type={showPassword ? 'text' : 'password'} variant="outlined" sx={{ mb: 4, bgcolor: 'white' }}
                        value={password} onChange={(e) => setPassword(e.target.value)}
                        InputProps={{ 
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            )
                        }}
                    />

                    <Button 
                        type="submit" fullWidth variant="contained" size="large"
                        disabled={loading}
                        sx={{ 
                            bgcolor: '#8B4513', 
                            py: 1.8, 
                            fontWeight: 'bold', 
                            fontSize: '1.1rem',
                            borderRadius: 2,
                            '&:hover': { bgcolor: '#5D4037' },
                            boxShadow: '0 8px 16px rgba(139, 69, 19, 0.3)'
                        }}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : "Authorize Access"}
                    </Button>
                </Box>
            </Paper>
        </Fade>
      </Box>
    </Box>
  );
}