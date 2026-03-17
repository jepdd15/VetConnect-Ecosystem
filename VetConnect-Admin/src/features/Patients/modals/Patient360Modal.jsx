import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Chip, Paper, Grid, Stack, Button, CircularProgress, Divider, List, ListItem, ListItemText } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import WarningIcon from '@mui/icons-material/Warning';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function Patient360Modal({ open, onClose, pet, history, vitalsData, onFileUpload, uploadingId, onPreview, onQuickBook }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ bgcolor: '#3E2723', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <HistoryIcon />
          <Typography variant="h6" fontWeight="bold">Patient Chart: {pet?.name}</Typography>
        </Box>
        <Chip label={`${pet?.species} • ${pet?.breed}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }} />
      </DialogTitle>
      
      <DialogContent dividers sx={{ bgcolor: '#F5F5F5', display: 'flex', gap: 0, p: 0 }}>
          {/* LEFT: TIMELINE */}
          <Box sx={{ flex: 7, borderRight: '1px solid #E0E0E0', p: 3, overflowY: 'auto' }}>
              <Typography variant="h6" fontWeight="bold" color="#1565C0" sx={{ mb: 3 }}>Clinical History</Typography>
              {history.map((rec, index) => (
                  <Box key={index} sx={{ display: 'flex', mb: 4, position: 'relative' }}>
                      <Box sx={{ width: 100, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#1565C0', border: '2px solid white', mb: 1, zIndex: 1 }} />
                          <Typography variant="caption" fontWeight="bold">{new Date(rec.date.seconds * 1000).toLocaleDateString()}</Typography>
                      </Box>
                      <Paper elevation={0} sx={{ flex: 1, p: 2, borderRadius: 2, border: '1px solid #E0E0E0' }}>
                          <Typography variant="subtitle1" fontWeight="bold" color="#1565C0">{rec.diagnosis}</Typography>
                          <Typography variant="body2" sx={{ my: 1 }}>{rec.treatment}</Typography>
                          {rec.vitals && (
                            <Stack direction="row" spacing={1}>
                                <Chip label={`Wt: ${rec.vitals.weight}kg`} size="small" variant="outlined" />
                                <Chip label={`Temp: ${rec.vitals.temp}°C`} size="small" variant="outlined" />
                            </Stack>
                          )}
                      </Paper>
                  </Box>
              ))}
          </Box>

          {/* RIGHT: VITALS TREND */}
          <Box sx={{ flex: 3, p: 3, bgcolor: '#FAFAFA' }}>
              <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                  <Typography variant="overline" fontWeight="bold">Weight Trend</Typography>
                  <Box sx={{ height: 200, width: '100%', mt: 2 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={vitalsData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" hide />
                            <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                            <Line type="monotone" dataKey="weight" stroke="#8B4513" strokeWidth={3} dot={{r: 4, fill:'#8B4513'}} />
                        </LineChart>
                    </ResponsiveContainer>
                  </Box>
              </Paper>
              <Paper sx={{ p: 2, bgcolor: '#FFFDE7', border: '1px solid #FBC02D', borderRadius: 2 }}>
                  <Typography variant="subtitle2" color="#F57C00" fontWeight="bold">MEDICAL ALERTS</Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}><b>Allergies:</b> {pet?.allergies || 'None'}</Typography>
              </Paper>
          </Box>
      </DialogContent>

      <DialogActions sx={{ bgcolor: '#EFEBE9', p: 2 }}>
          <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037' }}>Close Chart</Button>
          <Button variant="contained" startIcon={<EventAvailableIcon />} sx={{ bgcolor: '#2E7D32' }} onClick={onQuickBook}>Start New Visit</Button>
      </DialogActions>
    </Dialog>
  );
}