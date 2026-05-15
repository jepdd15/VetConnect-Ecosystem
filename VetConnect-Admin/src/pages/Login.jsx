// The split-screen entryway. Blocks mobile clients from accessing the admin panel.

import React, { useState } from 'react';
import { 
  Box, Typography, Paper, TextField, Button, IconButton, 
  InputAdornment, CircularProgress, Alert, Fade, Avatar, Divider 
} from '@mui/material';
import { COLORS, PANEL } from '../theme/designTokens';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

// Icons
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import PetsIcon from '@mui/icons-material/Pets';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return setError('Please enter both email and password.');

    setLoading(true);
    setError('');

    try {
      // 1. Firebase Auth Check
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const uid = userCredential.user.uid;

      // 2. 🛡️ Role Validation Check
      const userDoc = await getDoc(doc(db, "users", uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();

        // Revocation check — disabled flag is the authoritative marker
        if (userData.disabled === true) {
            await auth.signOut();
            setError('This account has been deactivated. Contact your administrator.');
            return;
        }

        const allowedRoles = ['admin', 'staff', 'veterinarian', 'groomer'];

        // If they are a pet_owner, kick them out of the Admin panel
        if (!allowedRoles.includes(userData.role) && !allowedRoles.includes(userData.accessLevel)) {
            await auth.signOut();
            setError('Access Denied. Admin credentials required.');
            return;
        }

        // --- SESSION AUDIT: Log successful login ---
        await addDoc(collection(db, 'auth_logs'), {
          userId: uid,
          userName: userData.fullName || 'Unknown',
          userEmail: trimmedEmail,
          userRole: userData.role || userData.accessLevel || 'staff',
          action: 'LOGIN_SUCCESS',
          timestamp: serverTimestamp(),
          metadata: {
            userAgent: navigator.userAgent,
            platform: 'VetConnect-Admin'
          }
        }).catch(e => console.error('[LoginAudit] Write failed:', e));

      } else {
        await auth.signOut();
        setError('User profile not found.');
      }
    } catch (err) {
      // If Auth succeeded but Firestore failed, the user is authenticated
      // with no role check. Sign out to prevent unguarded dashboard access.
      if (auth.currentUser) {
        try { await auth.signOut(); } catch (_) { /* ignore sign-out errors */ }
      }

      // Map Firebase error codes to user-friendly messages
      const errorMessages = {
        'auth/invalid-credential':     'Invalid email or password.',
        'auth/user-not-found':         'Invalid email or password.',
        'auth/wrong-password':         'Invalid email or password.',
        'auth/user-disabled':          'This account has been disabled.',
        'auth/too-many-requests':      'Too many login attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
        'auth/invalid-email':          'Please enter a valid email address.',
      };
      setError(errorMessages[err.code] || 'An unexpected error occurred. Please try again.');
      console.error('Login error:', err.code, err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email address above, then click Forgot Password.');
      return;
    }
    if (!trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetSent(true);
      setError('');
    } catch (err) {
      // Don't reveal whether the email exists — always show success
      // unless it's a clearly non-email-related error
      if (err.code === 'auth/too-many-requests') {
        setError('Too many requests. Please try again later.');
      } else {
        setResetSent(true);
        setError('');
      }
      console.error('Password reset error:', err.code);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      <Box sx={{
        flex: 1.2,
        bgcolor: COLORS.accent,
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        p: 6,
        position: 'relative',
      }}>
        <PetsIcon sx={{ position: 'absolute', fontSize: 800, color: 'rgba(255,255,255,0.03)', right: -200, bottom: -200 }} />
        
        <Box sx={{ zIndex: 1, textAlign: 'center' }}>
            <Avatar sx={{ bgcolor: 'white', width: 80, height: 80, mb: 3, mx: 'auto', boxShadow: `4px 4px 0px ${COLORS.brand}` }}>
                <PetsIcon sx={{ fontSize: 45, color: COLORS.accentWarm }} />
            </Avatar>
            <Typography variant="h2" fontWeight="900" color="white" gutterBottom sx={{ letterSpacing: -1 }}>
                VetConnect
            </Typography>
            <Typography variant="h5" color="rgba(255,255,255,0.7)" sx={{ mb: 4, fontWeight: '300' }}>
                Veterinary Clinic
            </Typography>
            <Divider sx={{ width: 60, height: 4, bgcolor: COLORS.amber, borderRadius: 0, mx: 'auto', mb: 4 }} />
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
        bgcolor: COLORS.cream,
        backgroundImage: `radial-gradient(${COLORS.timelineRail} 0.5px, transparent 0.5px)`,
        backgroundSize: '20px 20px' 
      }}>
        
        <Fade in={true} timeout={1000}>
            <Paper elevation={0} sx={{
                p: 5,
                width: '100%',
                maxWidth: 450,
                ...PANEL.card,
                textAlign: 'center'
            }}>
                <AdminPanelSettingsIcon sx={{ fontSize: 50, color: COLORS.accent, mb: 1 }} />
                <Typography variant="h4" fontWeight="bold" color={COLORS.brand} gutterBottom>
                    Staff Portal
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 4 }}>
                    Authorized Personnel Only
                </Typography>

                {error && <Alert severity="error" sx={{ mb: 3, textAlign: 'left', fontWeight: 'bold' }}>{error}</Alert>}

                <Box component="form" onSubmit={handleLogin}>
                    <TextField
                        fullWidth label="Email Address" variant="outlined" sx={{ mb: 3, bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@clinic.com"
                    />
                    
                    <TextField
                        fullWidth label="Password" type={showPassword ? 'text' : 'password'} variant="outlined" sx={{ mb: 4, bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
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
                            bgcolor: COLORS.accentWarm,
                            py: 1.8,
                            fontWeight: 'bold',
                            fontSize: '1.1rem',
                            borderRadius: 0,
                            border: `2px solid ${COLORS.brand}`,
                            boxShadow: `4px 4px 0px ${COLORS.brand}`,
                            '&:hover': { bgcolor: COLORS.accent, transform: 'translate(2px, 2px)', boxShadow: `2px 2px 0px ${COLORS.brand}` },
                            '&:active': { transform: 'translate(4px, 4px)', boxShadow: 'none' },
                        }}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : "Authorize Access"}
                    </Button>

                    {resetSent ? (
                        <Typography variant="body2" sx={{ mt: 2, color: COLORS.success, fontWeight: 600 }}>
                            If that email is registered, a password reset link has been sent.
                        </Typography>
                    ) : (
                        <Typography
                            variant="body2"
                            onClick={handleForgotPassword}
                            sx={{
                                mt: 2,
                                color: COLORS.accent,
                                cursor: 'pointer',
                                fontWeight: 600,
                                '&:hover': { textDecoration: 'underline', color: COLORS.brand },
                            }}
                        >
                            Forgot Password?
                        </Typography>
                    )}
                </Box>
            </Paper>
        </Fade>
      </Box>
    </Box>
  );
}