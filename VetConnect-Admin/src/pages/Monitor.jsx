// Business intelligence visualization, general ledgers, and the TV-friendly waiting room display.

import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, Chip, Grid, CircularProgress } from '@mui/material';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Icons
import PetsIcon from '@mui/icons-material/Pets';
import CampaignIcon from '@mui/icons-material/Campaign';

export default function Monitor() {
  const [queueData, setQueueData] = useState(null);
  const [currentTicket, setCurrentTicket] = useState(null);

  // 1. Listen to the Counter
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "queue", "daily_queue"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setQueueData(data);
        fetchTicketDetails(data.currentServing);
      }
    });
    return () => unsub();
  }, []);

  // 2. Fetch "Who is being served?"
  const fetchTicketDetails = async (number) => {
    if (number === 0) {
      setCurrentTicket(null);
      return;
    }
    const q = query(collection(db, "appointments"), where("queueNumber", "==", number));
    const snap = await getDocs(q);
    if (!snap.empty) {
      setCurrentTicket(snap.docs[0].data());
    } else {
      setCurrentTicket(null);
    }
  };

  if (!queueData) return <Box sx={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center'}}><CircularProgress /></Box>;

  // Determine Colors
  const isPriority = currentTicket && currentTicket.ownerId !== 'WALK_IN_USER';
  const bgColor = isPriority ? '#E3F2FD' : '#F5F5F5'; // Blue tint for App, Grey for Walkin
  const textColor = isPriority ? '#1565C0' : '#424242';

  return (
    <Box sx={{ 
      height: '100vh', 
      width: '100vw', 
      bgcolor: '#212121', // Dark background for contrast
      p: 4,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      
      {/* HEADER */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <PetsIcon sx={{ fontSize: 60, color: '#FFB74D' }} />
        <Typography variant="h2" sx={{ color: 'white', fontWeight: 'bold', letterSpacing: 2 }}>
          NOW SERVING
        </Typography>
      </Box>

      {/* MAIN DISPLAY CARD */}
      <Card sx={{ 
        width: '80%', 
        height: '70%', 
        bgcolor: bgColor,
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        borderRadius: 8,
        boxShadow: '0px 0px 50px rgba(255, 183, 77, 0.3)'
      }}>
        
        {/* NUMBER */}
        <Typography variant="h1" sx={{ fontSize: '12rem', fontWeight: 'bold', color: '#BF360C', lineHeight: 1 }}>
          {queueData.currentServing}
        </Typography>
        
        {/* CONTEXT (The Logic) */}
        {currentTicket ? (
          <>
            <Typography variant="h3" sx={{ mt: 2, mb: 2, fontWeight: 'bold', color: textColor }}>
              {currentTicket.serviceType}
            </Typography>

            <Chip 
              label={isPriority ? "📅 SCHEDULED APPOINTMENT" : "👤 WALK-IN CLIENT"} 
              icon={<CampaignIcon />}
              sx={{ 
                fontSize: '1.5rem', 
                height: 60, 
                px: 2,
                bgcolor: isPriority ? '#1565C0' : '#757575',
                color: 'white',
                fontWeight: 'bold'
              }} 
            />
            
            <Typography variant="h5" sx={{ mt: 4, color: '#757575' }}>
              Please proceed to Consultation Room
            </Typography>
          </>
        ) : (
          <Typography variant="h3" sx={{ color: '#aaa' }}>Waiting for next patient...</Typography>
        )}

      </Card>

      {/* FOOTER */}
      <Typography variant="h5" sx={{ color: '#aaa', mt: 4 }}>
        Starbarks Veterinary Clinic • Please wait for your number
      </Typography>

    </Box>
  );
}