import React from 'react';
import { Dialog, DialogTitle, DialogContent, Box, Typography, Chip, Paper, Grid, Stack, Button, CircularProgress, Divider, List, ListItem, ListItemText } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Patient360Modal({ open, onClose, pet, history, vitalsData, loading, onQuickBook }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ bgcolor: '#3E2723', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <HistoryIcon />
          <Typography variant="h6" fontWeight="bold">Patient Chart: {pet?.name}</Typography>
        </Box>
        <Chip label={`${pet?.species} • ${pet?.breed}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }} />
      </DialogTitle>
      
      <DialogContent dividers sx={{ bgcolor: '#F5F5F5', display: 'flex', gap: 0, p: 0, height: '70vh' }}>
          {loading ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>
          ) : (
            <>
              {/* LEFT: TIMELINE */}
              <Box sx={{ flex: 7, borderRight: '1px solid #E0E0E0', p: 3, overflowY: 'auto' }}>
                  <Typography variant="h6" fontWeight="bold" color="#1565C0" sx={{ mb: 3 }}>Clinical History</Typography>
                  {history.length > 0 ? history.map((rec, index) => (
                      <Box key={index} sx={{ display: 'flex', mb: 4, position: 'relative' }}>
                          <Box sx={{ position: 'absolute', left: 5, top: 12, bottom: -20, width: 2, bgcolor: '#E0E0E0' }} />
                          <Box sx={{ width: 100, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#1565C0', border: '2px solid white', mb: 1, zIndex: 1, boxShadow: '0 0 5px rgba(0,0,0,0.3)' }} />
                              <Typography variant="caption" fontWeight="bold">{rec.date?.toDate ? rec.date.toDate().toLocaleDateString() : 'N/A'}</Typography>
                          </Box>
                          <Paper elevation={0} sx={{ flex: 1, p: 2.5, borderRadius: 2, border: '1px solid #E0E0E0', bgcolor: 'white' }}>
                              <Typography variant="subtitle1" fontWeight="bold" color="#1565C0">{rec.diagnosis}</Typography>
                              <Typography variant="caption" color="textSecondary" sx={{display: 'block', mb: 1}}>Vet: {rec.vetName}</Typography>
                              <Typography variant="overline" fontWeight="bold">TREATMENT PLAN</Typography>
                              <Typography variant="body2" sx={{ my: 1, whiteSpace: 'pre-wrap' }}>{rec.treatment || 'No specific treatment plan recorded.'}</Typography>
                              {rec.vitals && (
                                <Stack direction="row" spacing={1} sx={{mt: 2, pt: 2, borderTop: '1px dashed #eee'}}>
                                    <Chip label={`Wt: ${rec.vitals.weight}kg`} size="small" variant="outlined" />
                                    <Chip label={`Temp: ${rec.vitals.temp}°C`} size="small" variant="outlined" />
                                </Stack>
                              )}
                          </Paper>
                      </Box>
                  )) : (
                    <Typography fontStyle="italic" color="textSecondary" sx={{textAlign: 'center', mt: 5}}>No clinical history found.</Typography>
                  )}
              </Box>

              {/* RIGHT: VITALS & ALERTS */}
              <Box sx={{ flex: 3, p: 3, bgcolor: '#FAFAFA' }}>
                  <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                      <Typography variant="overline" fontWeight="bold">Weight Trend (kg)</Typography>
                      <Box sx={{ height: 200, width: '100%', mt: 2 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={vitalsData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" tick={{fontSize: 10}} />
                                <YAxis tick={{fontSize: 10}} domain={['dataMin - 1', 'dataMax + 1']} />
                                <RechartsTooltip />
                                <Line type="monotone" dataKey="weight" stroke="#8B4513" strokeWidth={3} dot={{r: 4, fill:'#8B4513'}} activeDot={{r: 6}} />
                            </LineChart>
                        </ResponsiveContainer>
                      </Box>
                  </Paper>
                  <Paper sx={{ p: 2, bgcolor: '#FFFDE7', border: '1px solid #FBC02D', borderRadius: 2 }}>
                      <Typography variant="subtitle2" color="#F57C00" fontWeight="bold">MEDICAL ALERTS</Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}><b>Allergies:</b> {pet?.allergies || 'None recorded'}</Typography>
                  </Paper>
              </Box>
            </>
          )}
      </DialogContent>

      <DialogActions sx={{ bgcolor: '#EFEBE9', p: 2 }}>
          <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037' }}>Close Chart</Button>
          <Button variant="contained" startIcon={<EventAvailableIcon />} sx={{ bgcolor: '#2E7D32' }} onClick={onQuickBook}>Book Follow-Up</Button>
      </DialogActions>
    </Dialog>
  );
}