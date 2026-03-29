import React from 'react';
import { 
  Dialog, DialogTitle, DialogContent, Box, Typography, Chip, Paper, 
  Stack, Button, CircularProgress, Divider, List, ListItem, ListItemText,
  DialogActions, IconButton, Avatar // <--- THE FIX IS HERE!
} from '@mui/material';
import Grid from '@mui/material/Grid';

// Icons
import HistoryIcon from '@mui/icons-material/History';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import CloseIcon from '@mui/icons-material/Close';
import PetsIcon from '@mui/icons-material/Pets';
import FemaleIcon from '@mui/icons-material/Female';
import MaleIcon from '@mui/icons-material/Male';
import CakeIcon from '@mui/icons-material/Cake';
import ScaleIcon from '@mui/icons-material/Scale';
import WarningIcon from '@mui/icons-material/Warning';
import MedicationIcon from '@mui/icons-material/Medication';
import ScienceIcon from '@mui/icons-material/Science';

// Charting Library
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Patient360Modal({ open, onClose, pet, history, vitalsData, loading, onQuickBook, calculateAge }) {
  
  const hasVitals = vitalsData && vitalsData.length > 1;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { 
          height: '90vh',
          borderRadius: 4,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
        }
      }}
    >
      {/* THE FIX: A sleek, data-rich header */}
      <DialogTitle sx={{ 
        bgcolor: '#3E2723', color: 'white', display: 'flex', 
        justifyContent: 'space-between', alignItems: 'center', p: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HistoryIcon />
          <Typography variant="h6" fontWeight="bold">Patient Chart: {pet?.name}</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
            <Chip label={pet?.species} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }} />
            <Chip label={pet?.breed} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }} />
        </Stack>
        <IconButton onClick={onClose} sx={{ color: 'white' }}><CloseIcon /></IconButton>
      </DialogTitle>
      
      <DialogContent dividers sx={{ bgcolor: '#F5F5F5', display: 'flex', gap: 0, p: 0 }}>
          {loading ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>
          ) : (
            <>
              {/* LEFT: Master Patient Identity */}
              <Box sx={{ flex: 3, borderRight: '1px solid #E0E0E0', p: 3, overflowY: 'auto', bgcolor: 'white' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <Avatar sx={{ width: 80, height: 80, bgcolor: '#FFF8E1', fontSize: 40, border: '3px solid #8B4513' }}>
                        {(pet?.species === 'Canine' || pet?.species === 'Dog') ? '🐶' : '🐱'}
                    </Avatar>
                    <Box>
                        <Typography variant="h4" fontWeight="900" color="#3E2723">{pet?.name}</Typography>
                        <Typography variant="body1" color="textSecondary" fontWeight="bold">{pet?.breed}</Typography>
                    </Box>
                </Box>

                <Grid container spacing={2}>
                    <Grid item xs={6}><Paper variant="outlined" sx={{p:1.5, textAlign:'center'}}><Typography variant="caption" display="block">SEX</Typography><Typography fontWeight="bold">{pet?.gender}</Typography></Paper></Grid>
                    <Grid item xs={6}><Paper variant="outlined" sx={{p:1.5, textAlign:'center'}}><Typography variant="caption" display="block">AGE</Typography><Typography fontWeight="bold">{calculateAge(pet?.dob)}</Typography></Paper></Grid>
                    <Grid item xs={6}><Paper variant="outlined" sx={{p:1.5, textAlign:'center'}}><Typography variant="caption" display="block">STATUS</Typography><Typography fontWeight="bold" color={pet?.isNeutered ? 'success.main' : 'warning.main'}>{pet?.isNeutered ? 'Desexed' : 'Intact'}</Typography></Paper></Grid>
                    <Grid item xs={6}><Paper variant="outlined" sx={{p:1.5, textAlign:'center'}}><Typography variant="caption" display="block">LAST WEIGHT</Typography><Typography fontWeight="bold" color="#1565C0">{pet?.lastWeight ? `${pet.lastWeight} kg` : 'N/A'}</Typography></Paper></Grid>
                </Grid>

                <Paper sx={{ p: 2, mt: 3, bgcolor: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 2 }}>
                      <Typography variant="subtitle2" color="#D32F2F" fontWeight="bold" sx={{display:'flex', alignItems:'center', gap:1}}><WarningIcon/> MEDICAL ALERTS</Typography>
                      <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold' }}>Allergies: {pet?.allergies || 'None recorded'}</Typography>
                </Paper>

                <Paper sx={{ p: 2, mt: 3, borderRadius: 2 }}>
                      <Typography variant="overline" fontWeight="bold">Weight Trend (kg)</Typography>
                      <Box sx={{ height: 200, width: '100%', mt: 2 }}>
                        {hasVitals ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={vitalsData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" tick={{fontSize: 10}} />
                                    <YAxis tick={{fontSize: 10}} domain={['dataMin - 1', 'dataMax + 1']} />
                                    <RechartsTooltip />
                                    <Line type="monotone" dataKey="weight" stroke="#8B4513" strokeWidth={3} dot={{r: 4, fill:'#8B4513'}} activeDot={{r: 6}} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <Box sx={{height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa'}}>
                                <ScaleIcon sx={{ fontSize: 40 }} />
                                <Typography variant="caption" sx={{mt: 1, fontStyle: 'italic'}}>Not enough data for weight trend.</Typography>
                            </Box>
                        )}
                      </Box>
                  </Paper>

              </Box>

              {/* RIGHT: THE FULL CLINICAL TIMELINE */}
              <Box sx={{ flex: 7, p: 3, overflowY: 'auto' }}>
                  <Typography variant="h5" fontWeight="900" color="#1565C0" sx={{ mb: 3, borderBottom: '2px solid #BBDEFB', pb: 1 }}>Clinical History</Typography>
                  {history.length > 0 ? history.map((rec, index) => (
                      <Box key={index} sx={{ display: 'flex', mb: 4, position: 'relative' }}>
                          <Box sx={{ position: 'absolute', left: 16, top: 22, bottom: -20, width: 2, bgcolor: '#E0E0E0' }} />
                          <Box sx={{ width: 120, flexShrink: 0, textAlign: 'right', pr: 3 }}>
                              <Box sx={{ position: 'absolute', left: 8, top: 0, width: 18, height: 18, borderRadius: '50%', bgcolor: rec.recordType === 'grooming' ? '#9C27B0' : '#1565C0', border: '3px solid white', zIndex: 1, boxShadow: '0 0 5px rgba(0,0,0,0.3)' }} />
                              <Typography variant="caption" fontWeight="bold">{rec.date?.toDate ? rec.date.toDate().toLocaleDateString() : 'N/A'}</Typography>
                          </Box>
                          <Paper elevation={0} sx={{ flex: 1, p: 2.5, borderRadius: 2, border: '1px solid #E0E0E0', bgcolor: 'white' }}>
                              <Typography variant="subtitle1" fontWeight="900" color={rec.recordType === 'grooming' ? '#9C27B0' : '#1565C0'}>
                                {rec.diagnosis || 'Clinical Visit'}
                              </Typography>
                              <Typography variant="caption" color="textSecondary" sx={{display: 'block', mb: 1, fontStyle: 'italic'}}>Vet: {rec.vetName}</Typography>
                              
                              {/* THE FIX: Full S.O.A.P. notes are now visible! */}
                              {rec.soap?.subjective && <><Typography variant="overline" fontWeight="bold">SUBJECTIVE</Typography><Typography variant="body2" sx={{ my: 1, whiteSpace: 'pre-wrap' }}>{rec.soap.subjective}</Typography></>}
                              {rec.soap?.objectiveNotes && <><Typography variant="overline" fontWeight="bold">OBJECTIVE</Typography><Typography variant="body2" sx={{ my: 1, whiteSpace: 'pre-wrap' }}>{rec.soap.objectiveNotes}</Typography></>}
                              
                              <Typography variant="overline" fontWeight="bold">PLAN</Typography>
                              <Typography variant="body2" sx={{ my: 1, whiteSpace: 'pre-wrap' }}>{rec.treatment || 'No specific treatment plan recorded.'}</Typography>
                              
                              {rec.vitals && (
                                <Stack direction="row" spacing={1} sx={{mt: 2, pt: 2, borderTop: '1px dashed #eee'}}>
                                    <Chip label={`Wt: ${rec.vitals.weight}kg`} size="small" variant="outlined" />
                                    <Chip label={`Temp: ${rec.vitals.temp}°C`} size="small" variant="outlined" />
                                    <Chip label={`HR: ${rec.vitals.hr}bpm`} size="small" variant="outlined" />
                                </Stack>
                              )}
                              
                              {rec.prescriptions && rec.prescriptions.length > 0 && (
                                <Box sx={{mt: 2, pt: 2, borderTop: '1px dashed #eee'}}>
                                    <Typography variant="overline" fontWeight="bold">E-PRESCRIBE</Typography>
                                    {rec.prescriptions.map((rx, idx) => (
                                        <Typography key={idx} variant="body2">• <b>{rx.name}:</b> {rx.instructions}</Typography>
                                    ))}
                                </Box>
                              )}
                          </Paper>
                      </Box>
                  )) : (
                    <Box sx={{height: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa'}}>
                        <ScienceIcon sx={{ fontSize: 60, mb: 2 }} />
                        <Typography fontStyle="italic">No clinical history found.</Typography>
                    </Box>
                  )}
              </Box>
            </>
          )}
      </DialogContent>

      <DialogActions sx={{ bgcolor: '#EFEBE9', p: 2 }}>
          <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037', mr: 'auto', px: 3 }}>Close Chart</Button>
          <Button variant="contained" startIcon={<EventAvailableIcon />} sx={{ bgcolor: '#2E7D32', fontWeight: 'bold', px: 3, py: 1 }} onClick={onQuickBook}>Book Follow-Up</Button>
      </DialogActions>
    </Dialog>
  );
}